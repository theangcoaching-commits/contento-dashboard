/* Content Series — weekday-distributed posting plans.
   Example: "Building ANG CONSULTING" → Mondays for 4 weeks → auto-creates content_plan rows. */

import { Router } from 'express';
import { stmts } from '../db.js';

const r = Router();
const nowIso = () => new Date().toISOString();
const newId = (p = 'sr_') => p + Math.random().toString(36).slice(2, 10);

// JS getDay(): 0=Sun ... 6=Sat. We store weekdays in same convention.
const PLATFORMS = new Set(['youtube', 'tiktok', 'instagram']);

function format(row) {
  if (!row) return null;
  let weekdays = [];
  try { weekdays = JSON.parse(row.weekdays || '[]'); } catch { weekdays = []; }
  return { ...row, weekdays };
}

function validBody(b) {
  if (!b?.name) return 'name required';
  if (!PLATFORMS.has(b.platform)) return 'platform must be youtube|tiktok|instagram';
  if (!Array.isArray(b.weekdays) || !b.weekdays.length) return 'weekdays must be a non-empty array';
  if (b.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return 'weekdays must be ints 0..6';
  if (!b.start_date) return 'start_date (YYYY-MM-DD) required';
  return null;
}

// GET /api/series — list all (optional ?platform=tiktok)
r.get('/series', (req, res) => {
  const rows = req.query.platform
    ? stmts.seriesByPlatform.all(req.query.platform)
    : stmts.allSeries.all();
  res.json(rows.map(format));
});

// GET /api/series/:id
r.get('/series/:id', (req, res) => {
  const row = stmts.getSeries.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(format(row));
});

// POST /api/series — create
r.post('/series', (req, res) => {
  const b = req.body || {};
  const err = validBody(b);
  if (err) return res.status(400).json({ error: err });
  const id = newId();
  const now = nowIso();
  stmts.insertSeries.run({
    id,
    name:          b.name,
    platform:      b.platform,
    goal_text:     b.goal_text || '',
    target_views:  Number(b.target_views || 0),
    weekdays:      JSON.stringify(b.weekdays),
    repeat_weeks:  Number(b.repeat_weeks || 4),
    start_date:    b.start_date,
    post_time:     b.post_time || '20:00',
    format:        b.format || '',
    hook_template: b.hook_template || '',
    color:         b.color || '#a78bfa',
    status:        b.status || 'active',
    notes:         b.notes || '',
    created_at:    now,
    updated_at:    now
  });
  res.json(format(stmts.getSeries.get(id)));
});

// PUT /api/series/:id — update
r.put('/series/:id', (req, res) => {
  const existing = stmts.getSeries.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const weekdays = Array.isArray(b.weekdays) ? b.weekdays : JSON.parse(existing.weekdays || '[]');
  stmts.updateSeries.run({
    id: existing.id,
    name:          b.name ?? existing.name,
    platform:      b.platform ?? existing.platform,
    goal_text:     b.goal_text ?? existing.goal_text,
    target_views:  b.target_views ?? existing.target_views,
    weekdays:      JSON.stringify(weekdays),
    repeat_weeks:  b.repeat_weeks ?? existing.repeat_weeks,
    start_date:    b.start_date ?? existing.start_date,
    post_time:     b.post_time ?? existing.post_time,
    format:        b.format ?? existing.format,
    hook_template: b.hook_template ?? existing.hook_template,
    color:         b.color ?? existing.color,
    status:        b.status ?? existing.status,
    notes:         b.notes ?? existing.notes,
    updated_at:    nowIso()
  });
  res.json(format(stmts.getSeries.get(existing.id)));
});

// DELETE /api/series/:id — by default also clears generated content_plan rows.
// Pass ?keepPlan=1 to leave them.
r.delete('/series/:id', (req, res) => {
  const existing = stmts.getSeries.get(req.params.id);
  if (!existing) return res.json({ ok: true, deleted: 0 });
  let planDeleted = 0;
  if (req.query.keepPlan !== '1') {
    const before = stmts.planBySeries.all(existing.id).length;
    stmts.deletePlanBySeries.run(existing.id);
    planDeleted = before;
  }
  stmts.deleteSeries.run(existing.id);
  res.json({ ok: true, deleted: 1, planDeleted });
});

// POST /api/series/:id/materialize — expand to content_plan rows.
// Default: replace=true (wipes prior rows for this series first).
r.post('/series/:id/materialize', (req, res) => {
  const s = stmts.getSeries.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  const replace = req.body?.replace !== false;
  if (replace) stmts.deletePlanBySeries.run(s.id);
  const result = expandSeries(s);
  res.json({ ok: true, ...result });
});

// POST /api/series/materialize-all — re-materialize every active series.
r.post('/series/materialize-all', (req, res) => {
  const rows = stmts.allSeries.all().filter(x => x.status === 'active');
  const summary = [];
  for (const s of rows) {
    stmts.deletePlanBySeries.run(s.id);
    const r2 = expandSeries(s);
    summary.push({ id: s.id, name: s.name, ...r2 });
  }
  res.json({ ok: true, series: summary, total_posts: summary.reduce((t, x) => t + x.added, 0) });
});

function expandSeries(s) {
  const weekdays = JSON.parse(s.weekdays || '[]');
  // Parse YYYY-MM-DD into UTC components so getUTCDay()/toISOString() stay aligned regardless of server timezone.
  const [sy, sm, sd] = s.start_date.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const weeks = Math.max(1, Number(s.repeat_weeks || 4));
  const endMs  = startMs + (weeks * 7 - 1) * 86400000;
  const repeatGroupId = 'rg_' + Math.random().toString(36).slice(2, 10);
  const now = nowIso();
  let added = 0;
  for (let cursorMs = startMs; cursorMs <= endMs; cursorMs += 86400000) {
    const cur = new Date(cursorMs);
    if (weekdays.includes(cur.getUTCDay())) {
      stmts.insertContentPlan.run({
        id: 'cp_' + Math.random().toString(36).slice(2, 10),
        date: cur.toISOString().slice(0, 10),
        time: s.post_time || '20:00',
        platform: s.platform,
        format: s.format || '',
        title: s.name,
        hook: s.hook_template || '',
        outline: JSON.stringify([]),
        script: '', cta: '',
        target_views: Math.round((s.target_views || 0) / Math.max(estimatePostCount(weekdays, weeks), 1)),
        target_leads: 0,
        status: 'idea',
        week_idx: null,
        repeat_group_id: repeatGroupId,
        repeat_rule: 'series',
        campaign_id: null,
        series_id: s.id,
        created_at: now, updated_at: now
      });
      added++;
    }
  }
  return { added, end_date: new Date(endMs).toISOString().slice(0, 10), repeat_group_id: repeatGroupId };
}

function estimatePostCount(weekdays, weeks) {
  return weekdays.length * weeks;
}

export default r;
