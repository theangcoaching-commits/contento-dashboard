/* Prospects · individual potential students/leads
   CRM-style with pipeline statuses (new → dm_sent → replied → qualified → call_booked → call_done → signed/dropped) */

import { Router } from 'express';
import { stmts } from '../db.js';

const r = Router();
const nowIso = () => new Date().toISOString();
const newId = () => 'ps_' + Math.random().toString(36).slice(2, 12);

// ---------- LIST ----------
r.get('/prospects', (req, res) => {
  const status = req.query.status;
  const rows = status && status !== 'all' ? stmts.prospectsByStatus.all(status) : stmts.allProspects.all();
  res.json(rows.map(formatProspect));
});

// Get single prospect
r.get('/prospects/:id', (req, res) => {
  const p = stmts.getProspect.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(formatProspect(p));
});

// Pipeline summary
r.get('/prospects/stats/summary', (req, res) => {
  const buckets = ['new', 'dm_sent', 'replied', 'qualified', 'call_booked', 'call_done', 'signed', 'dropped'];
  const map = {};
  for (const s of buckets) map[s] = stmts.prospectsByStatus.all(s).length;
  const dueFollowup = stmts.prospectsDueFollowup.all(nowIso()).length;
  res.json({ buckets: map, total: Object.values(map).reduce((a, b) => a + b, 0), due_followup: dueFollowup });
});

// Followups due
r.get('/prospects/followups/due', (req, res) => {
  const rows = stmts.prospectsDueFollowup.all(nowIso());
  res.json(rows.map(formatProspect));
});

// ---------- CREATE ----------
r.post('/prospects', (req, res) => {
  const b = req.body || {};
  // dedupe by handle+platform
  if (b.handle && b.platform) {
    const existing = stmts.prospectByHandle.get(b.handle, b.platform);
    if (existing) return res.json({ ok: true, id: existing.id, duplicate: true });
  }
  const id = newId();
  const now = nowIso();
  stmts.insertProspect.run({
    id,
    handle:           b.handle || '',
    platform:         b.platform || 'tiktok',
    url:              b.url || '',
    display_name:     b.display_name || '',
    avatar_url:       b.avatar_url || '',
    followers:        Number(b.followers || 0),
    content_style:    b.content_style || '',
    estimated_income: b.estimated_income || '',
    niche:            b.niche || '',
    status:           b.status || 'new',
    fit_score:        Number(b.fit_score || 0),
    notes:            b.notes || '',
    first_dm_at:      b.first_dm_at || null,
    last_dm_at:       b.last_dm_at || null,
    dm_template:      b.dm_template || '',
    reply_received_at:b.reply_received_at || null,
    next_followup_at: b.next_followup_at || null,
    application_data: b.application_data ? JSON.stringify(b.application_data) : null,
    application_score:Number(b.application_score || 0),
    raw:              JSON.stringify(b),
    created_at:       now,
    updated_at:       now
  });
  res.json({ ok: true, id });
});

// ---------- UPDATE ----------
r.put('/prospects/:id', (req, res) => {
  const existing = stmts.getProspect.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  stmts.updateProspect.run({
    id: req.params.id,
    handle:           b.handle           ?? existing.handle,
    platform:         b.platform         ?? existing.platform,
    url:              b.url              ?? existing.url,
    display_name:     b.display_name     ?? existing.display_name,
    avatar_url:       b.avatar_url       ?? existing.avatar_url,
    followers:        b.followers        ?? existing.followers,
    content_style:    b.content_style    ?? existing.content_style,
    estimated_income: b.estimated_income ?? existing.estimated_income,
    niche:            b.niche            ?? existing.niche,
    status:           b.status           ?? existing.status,
    fit_score:        b.fit_score        ?? existing.fit_score,
    notes:            b.notes            ?? existing.notes,
    first_dm_at:      b.first_dm_at      ?? existing.first_dm_at,
    last_dm_at:       b.last_dm_at       ?? existing.last_dm_at,
    dm_template:      b.dm_template      ?? existing.dm_template,
    reply_received_at:b.reply_received_at?? existing.reply_received_at,
    next_followup_at: b.next_followup_at ?? existing.next_followup_at,
    application_data: b.application_data != null
                       ? (typeof b.application_data === 'string' ? b.application_data : JSON.stringify(b.application_data))
                       : existing.application_data,
    application_score:b.application_score?? existing.application_score,
    updated_at:       nowIso()
  });
  res.json({ ok: true });
});

// Quick status transition + auto-timestamp
r.post('/prospects/:id/transition', (req, res) => {
  const p = stmts.getProspect.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const newStatus = (req.body || {}).status;
  if (!newStatus) return res.status(400).json({ error: 'status required' });
  const now = nowIso();
  // Smart timestamps per status
  const t = {
    first_dm_at:       p.first_dm_at,
    last_dm_at:        p.last_dm_at,
    reply_received_at: p.reply_received_at,
    next_followup_at:  p.next_followup_at
  };
  if (newStatus === 'dm_sent') {
    t.last_dm_at = now;
    if (!t.first_dm_at) t.first_dm_at = now;
    // auto follow-up in 3 days if no reply
    t.next_followup_at = new Date(Date.now() + 3 * 86400000).toISOString();
  }
  if (newStatus === 'replied') {
    t.reply_received_at = now;
    t.next_followup_at = null; // clear auto follow-up
  }
  stmts.updateProspect.run({
    id: p.id,
    handle: p.handle, platform: p.platform, url: p.url,
    display_name: p.display_name, avatar_url: p.avatar_url,
    followers: p.followers, content_style: p.content_style,
    estimated_income: p.estimated_income, niche: p.niche,
    status: newStatus,
    fit_score: p.fit_score, notes: p.notes,
    first_dm_at:      t.first_dm_at,
    last_dm_at:       t.last_dm_at,
    dm_template:      p.dm_template,
    reply_received_at:t.reply_received_at,
    next_followup_at: t.next_followup_at,
    application_data: p.application_data,
    application_score:p.application_score,
    updated_at: now
  });
  res.json({ ok: true });
});

// ---------- DELETE ----------
r.delete('/prospects/:id', (req, res) => {
  stmts.deleteProspect.run(req.params.id);
  res.json({ ok: true });
});

// ---------- BOOKMARKLET INGEST ----------
// One-shot endpoint that a TikTok-profile bookmarklet POSTs to
r.post('/prospects/ingest', (req, res) => {
  const b = req.body || {};
  const platform = detectPlatform(b.url || '');
  const handle = b.handle || extractHandle(b.url || '', platform);
  if (!handle) return res.status(400).json({ error: 'handle or url required' });

  // Dedupe
  const existing = stmts.prospectByHandle.get(handle, platform);
  if (existing) {
    return res.json({ ok: true, id: existing.id, duplicate: true });
  }
  const id = newId();
  const now = nowIso();
  stmts.insertProspect.run({
    id,
    handle, platform,
    url:              b.url || '',
    display_name:     b.display_name || handle,
    avatar_url:       b.avatar_url || '',
    followers:        Number(b.followers || 0),
    content_style:    b.content_style || '',
    estimated_income: b.estimated_income || '',
    niche:            b.niche || '',
    status:           'new',
    fit_score:        Number(b.fit_score || 0),
    notes:            b.notes || '',
    first_dm_at:      null, last_dm_at: null, dm_template: '',
    reply_received_at:null, next_followup_at: null,
    application_data: null, application_score: 0,
    raw:              JSON.stringify(b),
    created_at:       now,
    updated_at:       now
  });
  res.json({ ok: true, id });
});

// ---------- HELPERS ----------
function formatProspect(r) {
  return {
    id: r.id, handle: r.handle, platform: r.platform, url: r.url,
    display_name: r.display_name, avatar_url: r.avatar_url,
    followers: r.followers, content_style: r.content_style,
    estimated_income: r.estimated_income, niche: r.niche,
    status: r.status, fit_score: r.fit_score, notes: r.notes,
    first_dm_at: r.first_dm_at, last_dm_at: r.last_dm_at, dm_template: r.dm_template,
    reply_received_at: r.reply_received_at, next_followup_at: r.next_followup_at,
    application_data: safeJson(r.application_data), application_score: r.application_score,
    created_at: r.created_at, updated_at: r.updated_at
  };
}
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
function detectPlatform(url) {
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/youtu\.?be/i.test(url)) return 'youtube';
  return 'tiktok';
}
function extractHandle(url, platform) {
  const m = url.match(/@[\w.\-]+/);
  if (m) return m[0];
  // try /channel/UCxxx for YT
  if (platform === 'youtube') {
    const ch = url.match(/youtube\.com\/(?:c\/|channel\/|user\/)?([\w.\-]+)/);
    if (ch) return '@' + ch[1];
  }
  return '';
}

export default r;
