/* Applications — read responses from a linked Google Form / Sheet via Drive API,
   score each applicant, and surface a CRM-style list in the dashboard. */

import { Router } from 'express';
import * as gdrive from '../services/gdrive.js';
import { stmts, setSetting, getSetting } from '../db.js';

const r = Router();

const SHEET_KEY = 'applications_sheet';

function ensureDrive(req, res, next) {
  if (!stmts.getConnection.get('gdrive')) {
    return res.status(401).json({ error: 'Google Drive not connected' });
  }
  next();
}

// ----- linked-sheet config -----
r.get('/applications/linked-sheet', (req, res) => {
  const raw = getSetting(SHEET_KEY);
  if (!raw) return res.json(null);
  try { res.json(JSON.parse(raw)); }
  catch { res.json(null); }
});

r.post('/applications/linked-sheet', ensureDrive, async (req, res) => {
  const { id, url, name } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const meta = await gdrive.getFileMeta(id);
    const payload = {
      id: meta.id,
      name: name || meta.name,
      url: url || meta.webViewLink,
      mime: meta.mimeType,
      linked_at: new Date().toISOString()
    };
    setSetting(SHEET_KEY, JSON.stringify(payload));
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

r.delete('/applications/linked-sheet', (req, res) => {
  setSetting(SHEET_KEY, '');
  res.json({ ok: true });
});

// ----- response list with scoring -----
r.get('/applications/list', ensureDrive, async (req, res) => {
  const raw = getSetting(SHEET_KEY);
  if (!raw) return res.status(400).json({ error: 'No sheet linked. Pick a Sheet first.' });
  let cfg;
  try { cfg = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Linked-sheet config corrupted' }); }

  try {
    const csv = await gdrive.exportSheetAsCsv(cfg.id);
    const rows = gdrive.parseCsv(csv);
    if (rows.length < 2) return res.json({ sheet: cfg, headers: rows[0] || [], applicants: [], stats: emptyStats() });

    const headers = rows[0].map(h => (h || '').trim());
    const dataRows = rows.slice(1);

    // Detect important columns by header keywords (Vietnamese + English)
    const findIdx = (...kws) => {
      const lc = headers.map(h => h.toLowerCase());
      for (const kw of kws) {
        const i = lc.findIndex(h => h.includes(kw.toLowerCase()));
        if (i >= 0) return i;
      }
      return -1;
    };
    const idx = {
      timestamp: findIdx('timestamp', 'thời gian', 'dấu thời gian'),
      name:      findIdx('full name', 'họ và tên', 'họ tên', 'tên', 'name'),
      email:     findIdx('email', 'địa chỉ email', 'e-mail'),
      phone:     findIdx('phone', 'số điện thoại', 'sđt'),
      handle:    findIdx('tiktok', 'instagram', 'username', 'tài khoản', 'handle', '@'),
      income:    findIdx('thu nhập', 'income', 'lương', 'kiếm', 'salary'),
      goal:      findIdx('goal', 'mục tiêu', 'muốn', 'kỳ vọng'),
      why:       findIdx('vì sao', 'why', 'tại sao', 'lý do'),
      commitment:findIdx('cam kết', 'commitment', 'thời gian', 'available'),
      experience:findIdx('kinh nghiệm', 'experience', 'đang làm', 'hiện tại')
    };

    const applicants = dataRows.map((row, i) => {
      const get = (k) => idx[k] >= 0 ? (row[idx[k]] || '').trim() : '';
      const answers = {};
      headers.forEach((h, j) => { if (h) answers[h] = (row[j] || '').trim(); });
      const a = {
        row_index: i + 2,            // sheet row number (1-based + header row)
        timestamp: get('timestamp'),
        name:      get('name')  || '(unnamed)',
        email:     get('email'),
        phone:     get('phone'),
        handle:    get('handle'),
        income:    get('income'),
        goal:      get('goal'),
        why:       get('why'),
        commitment:get('commitment'),
        experience:get('experience'),
        answers
      };
      a.score = scoreApplicant(a);
      a.tier  = a.score >= 75 ? 'A' : a.score >= 55 ? 'B' : a.score >= 35 ? 'C' : 'D';
      return a;
    });

    res.json({
      sheet: cfg,
      headers,
      applicants,
      stats: computeStats(applicants)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function emptyStats() {
  return { total: 0, byTier: { A:0, B:0, C:0, D:0 }, avgScore: 0, withEmail: 0, withHandle: 0, byDate: {} };
}
function computeStats(applicants) {
  const s = emptyStats();
  s.total = applicants.length;
  let scoreSum = 0;
  for (const a of applicants) {
    s.byTier[a.tier]++;
    scoreSum += a.score || 0;
    if (a.email) s.withEmail++;
    if (a.handle) s.withHandle++;
    const day = (a.timestamp || '').slice(0, 10);
    if (day) s.byDate[day] = (s.byDate[day] || 0) + 1;
  }
  s.avgScore = s.total ? Math.round(scoreSum / s.total) : 0;
  return s;
}

/* Score 0-100 based on a 2x Challenge fit rubric:
   - signal density (length of free-text answers): 0-30
   - has contact (email + handle):                 0-20
   - clear income/goal stated:                     0-20
   - commitment signals (time, "yes", "có"):       0-15
   - relevant experience keywords:                 0-15 */
function scoreApplicant(a) {
  let s = 0;
  const len = (x) => (x || '').length;
  const has = (x, ...kws) => kws.some(k => (x || '').toLowerCase().includes(k));

  // Signal density
  const density = len(a.why) + len(a.goal) + len(a.experience);
  s += Math.min(30, Math.round(density / 10));

  // Contact
  if (a.email) s += 12;
  if (a.handle) s += 8;

  // Income/goal clarity (digits or VND-ish patterns)
  if (/\d{2,}/.test(a.income))        s += 10;
  if (/\d{2,}|x2|gấp đôi|double/i.test(a.goal)) s += 10;

  // Commitment
  if (has(a.commitment, 'có', 'yes', 'sẵn sàng', 'committed', '1h', '2h', '3h', 'mỗi ngày', 'daily', 'cam kết')) s += 15;

  // Experience relevance
  if (has(a.experience + ' ' + a.why, 'gia sư', 'dạy', 'kèm', 'tutor', 'teach', 'giáo viên', 'lương', 'income')) s += 15;

  return Math.min(100, s);
}

// ----- convert applicant to prospect/student -----
r.post('/applications/:rowIndex/to-student', async (req, res) => {
  const b = req.body || {};
  // Frontend posts the applicant body it already has (avoids re-fetching sheet)
  if (!b.name && !b.email) return res.status(400).json({ error: 'name or email required' });
  const id = 'ps_' + Math.random().toString(36).slice(2, 12);
  const now = new Date().toISOString();
  try {
    stmts.insertProspect.run({
      id,
      handle:        b.handle || '',
      platform:      b.platform || (b.handle?.startsWith('@') ? 'tiktok' : ''),
      url:           b.url || '',
      display_name:  b.name || '',
      avatar_url:    '',
      followers:     0,
      content_style: '',
      estimated_income: b.income || '',
      niche:         '',
      status:        'qualified',                            // form submission → already qualified
      fit_score:     b.score || 0,
      notes:         `📋 From 2x Challenge form\nName: ${b.name}\nEmail: ${b.email}\nPhone: ${b.phone}\nGoal: ${b.goal}\nWhy: ${b.why}`,
      first_dm_at:        null,
      last_dm_at:         null,
      dm_template:        '',
      reply_received_at:  null,
      next_followup_at:   null,
      application_data:   JSON.stringify(b.answers || {}),
      application_score:  b.score || 0,
      raw:                JSON.stringify({ source: 'form:2x_challenge', tier: b.tier, row_index: b.row_index }),
      created_at:    now,
      updated_at:    now
    });
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default r;
