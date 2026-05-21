import { Router } from 'express';
import { db, stmts, getSetting, setSetting } from '../db.js';
import { syncAll } from '../services/sync.js';
import * as ai from '../services/ai.js';

const r = Router();

// ---------------- profile ----------------
r.get('/profile', (req, res) => {
  res.json(stmts.getProfile.get() || {});
});
r.put('/profile', (req, res) => {
  const { name = '', niche = '', audience = '', goal = '' } = req.body || {};
  stmts.setProfile.run({ name, niche, audience, goal, updated_at: new Date().toISOString() });
  res.json({ name, niche, audience, goal });
});

// ---------------- connections ----------------
r.get('/connections', (req, res) => {
  const map = { youtube: false, tiktok: false, instagram: false };
  for (const c of stmts.allConnections.all()) map[c.platform] = true;
  res.json(map);
});

// ---------------- metrics ----------------
r.get('/metrics', (req, res) => {
  const range = parseInt(req.query.range || '30');
  const rows = stmts.latestMetrics.all();
  const m = {
    youtube:   { views: 0, subs: 0, ctr: 0, watchHours: 0, delta: 0 },
    tiktok:    { views: 0, followers: 0, engage: 0, avgWatch: 0, delta: 0 },
    instagram: { reach: 0, followers: 0, engage: 0, saves: 0, delta: 0 },
    revenue:   { value: 0, cpl: 0, ltv: 0, roas: 0, delta: 0 }
  };
  for (const row of rows) {
    if (row.platform === 'youtube') {
      if (row.metric === 'totalViews') m.youtube.views = row.value;
      if (row.metric === 'subs')       m.youtube.subs  = row.value;
    } else if (row.platform === 'tiktok') {
      if (row.metric === 'followers') m.tiktok.followers = row.value;
    } else if (row.platform === 'instagram') {
      if (row.metric === 'followers') m.instagram.followers = row.value;
    }
  }
  // derive recent-range views from videos table
  const since = new Date(Date.now() - range * 86400000).toISOString();
  const rangeStats = db.prepare(`SELECT platform, SUM(views) AS views, SUM(likes) AS likes,
                                        SUM(comments) AS comments, AVG(ctr) AS ctr
                                  FROM videos WHERE published_at >= ? GROUP BY platform`).all(since);
  for (const s of rangeStats) {
    if (s.platform === 'youtube') {
      m.youtube.views = s.views || 0;
      m.youtube.ctr = +(s.ctr || 0).toFixed(2);
    }
    if (s.platform === 'tiktok') {
      m.tiktok.views = s.views || 0;
      m.tiktok.engage = +((s.likes + s.comments * 3) / Math.max(s.views, 1) * 100).toFixed(1);
    }
    if (s.platform === 'instagram') {
      m.instagram.reach = s.views || 0;
      m.instagram.engage = +((s.likes + s.comments * 3) / Math.max(s.views, 1) * 100).toFixed(1);
    }
  }
  res.json(m);
});

// ---------------- funnel ----------------
r.get('/funnel', (req, res) => {
  const range = parseInt(req.query.range || '30');
  const since = new Date(Date.now() - range * 86400000).toISOString();
  const row = db.prepare(`SELECT SUM(views) AS views, SUM(likes) AS likes, SUM(comments) AS comments
                          FROM videos WHERE published_at >= ?`).get(since);
  const leadsRow = db.prepare(`SELECT COUNT(*) AS c FROM leads WHERE created_at >= ?`).get(since);
  const customersRow = db.prepare(`SELECT COUNT(*) AS c FROM leads WHERE status='sale' AND created_at >= ?`).get(since);
  const views    = row?.views || 0;
  const engaged  = Math.round((row?.likes || 0) + (row?.comments || 0) * 5);
  const clicks   = Math.round(engaged * 0.55);
  const leads    = leadsRow?.c || 0;       // REAL leads from DB
  const customers= customersRow?.c || 0;   // REAL sales from DB
  res.json({ views, engaged, clicks, leads, customers });
});

// ---------------- follower growth (daily count + deltas from snapshots) ----------------
r.get('/follower-growth', (req, res) => {
  const platform = req.query.platform || 'tiktok';
  const metric = platform === 'youtube' ? 'subs' : 'followers';
  const range = parseInt(req.query.range || '30');
  const since = new Date(Date.now() - range * 86400000).toISOString();
  // Get LAST snapshot per day (= EOD count) for the range
  const rows = db.prepare(`
    SELECT substr(captured_at, 1, 10) AS d, MAX(value) AS v, MAX(captured_at) AS ts
    FROM metric_snapshots
    WHERE platform = ? AND metric = ? AND captured_at >= ?
    GROUP BY substr(captured_at, 1, 10)
    ORDER BY d ASC
  `).all(platform, metric, since);

  // Build continuous date axis (fill missing days with previous day's value)
  const dayMs = 86400000;
  const today = new Date();
  const dates = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * dayMs);
    dates.push(d.toISOString().slice(0, 10));
  }
  const byDate = {};
  for (const r of rows) byDate[r.d] = Math.round(r.v);
  let lastKnown = null;
  const series = dates.map(d => {
    if (byDate[d] != null) { lastKnown = byDate[d]; return { date: d, value: byDate[d] }; }
    return { date: d, value: lastKnown };  // null until we have a known value
  });

  // Deltas
  const first = series.find(s => s.value != null);
  const last = [...series].reverse().find(s => s.value != null);
  const todayVal = last?.value ?? null;
  const yesterdayVal = series.length >= 2 ? series[series.length - 2]?.value : null;
  const weekAgoVal = series.length >= 8 ? series[series.length - 8]?.value : (first?.value ?? null);
  const monthAgoVal = first?.value ?? null;
  const delta = (a, b) => (a == null || b == null) ? null : (a - b);

  res.json({
    platform, metric, range,
    current: todayVal,
    series,
    deltas: {
      day:   delta(todayVal, yesterdayVal),
      week:  delta(todayVal, weekAgoVal),
      month: delta(todayVal, monthAgoVal)
    },
    data_points: rows.length,
    earliest: first?.date || null,
    latest: last?.date || null
  });
});

// ---------------- views over time (real data for charts) ----------------
r.get('/views-timeline', (req, res) => {
  const range = parseInt(req.query.range || '30');
  const since = new Date(Date.now() - range * 86400000).toISOString();
  // Per-platform daily breakdown
  const rows = db.prepare(`
    SELECT substr(published_at, 1, 10) AS d, platform, SUM(views) AS v
    FROM videos WHERE published_at >= ?
    GROUP BY substr(published_at, 1, 10), platform
    ORDER BY d ASC
  `).all(since);
  // Build a continuous date axis for the last `range` days
  const dayMs = 86400000;
  const today = new Date();
  const dates = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * dayMs);
    dates.push(d.toISOString().slice(0, 10));
  }
  const byDate = {};
  for (const d of dates) byDate[d] = { date: d, youtube: 0, tiktok: 0, instagram: 0, total: 0 };
  for (const row of rows) {
    if (!byDate[row.d]) continue;
    byDate[row.d][row.platform] = row.v || 0;
    byDate[row.d].total += row.v || 0;
  }
  res.json(Object.values(byDate));
});

// ---------------- videos ----------------
r.get('/videos', (req, res) => {
  const platform = (req.query.platform || 'all');
  const limit = parseInt(req.query.limit || '50');
  const rows = stmts.videosBy.all({ platform, limit });
  res.json(rows.map(v => ({
    id: v.id, title: v.title, platform: v.platform, date: v.published_at,
    views: v.views, likes: v.likes, comments: v.comments, shares: v.shares,
    ctr: v.ctr, retention: v.retention, score: v.score,
    thumbnail: v.thumbnail, url: v.url, status: 'published'
  })));
});

// ---------------- sync ----------------
r.post('/sync', async (req, res) => {
  const results = await syncAll();
  res.json({ ok: true, results, lastSync: getSetting('last_sync') });
});

// ---------------- tracked channels ----------------
r.get('/tracked', (req, res) => {
  const rows = stmts.allTracked.all();
  res.json(rows.map(t => ({
    id: t.id, url: t.url, name: t.name, handle: t.handle,
    platform: t.platform, tag: t.tag,
    followers: t.followers, growth: t.growth, avg: t.avg_views,
    platforms: (t.extra ? JSON.parse(t.extra).platforms : null) || [t.platform || 'youtube']
  })));
});

r.post('/tracked', (req, res) => {
  const { url, tag = 'Reference' } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const parsed = parseChannelUrl(url, tag);
  stmts.upsertTracked.run({
    id: parsed.id,
    url, handle: parsed.handle, name: parsed.name,
    platform: parsed.platforms[0] || 'youtube', tag,
    followers: parsed.followers || '—',
    growth: parsed.growth || '—',
    avg_views: parsed.avg || '—',
    extra: JSON.stringify({ platforms: parsed.platforms }),
    last_synced: null,
    created_at: new Date().toISOString()
  });
  res.json(parsed);
});

r.delete('/tracked/:id', (req, res) => {
  stmts.deleteTracked.run(req.params.id);
  res.json({ ok: true });
});

function parseChannelUrl(url, tag = 'Reference') {
  const handle = (url.match(/@[\w.\-]+/) || [url.split('/').filter(Boolean).pop() || ''])[0] || '@unknown';
  const name = handle.replace('@','').split(/[.\-_]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') || 'Channel';
  const platforms = [];
  if (/youtube/i.test(url))  platforms.push('youtube');
  if (/tiktok/i.test(url))   platforms.push('tiktok');
  if (/instagr/i.test(url))  platforms.push('instagram');
  if (!platforms.length) platforms.push('youtube');
  return {
    id: 'c_' + Math.random().toString(36).slice(2, 10),
    name, handle, tag, platforms,
    followers: '—', growth: '—', avg: '—'
  };
}

// ---------------- viral (lightweight stub backed by top scoring videos) ----------------
r.get('/viral', (req, res) => {
  const top = stmts.topVideos.all(8);
  res.json(top.map(v => ({
    title: v.title,
    handle: '@' + (v.platform === 'youtube' ? 'creator' : v.platform),
    platform: v.platform,
    views: v.views >= 1e6 ? (v.views/1e6).toFixed(1) + 'M' : (v.views/1e3).toFixed(0) + 'K',
    score: v.score
  })));
});

// ---------------- ideas ----------------
r.get('/ideas', async (req, res) => {
  if (req.query.refresh) {
    const fresh = await runGeneration();
    return res.json(fresh);
  }
  const recent = stmts.recentIdeas.all(6);
  if (recent.length) return res.json(recent.map(rowToIdea));
  const fresh = await runGeneration();
  res.json(fresh);
});
r.post('/ideas/generate', async (req, res) => {
  res.json(await runGeneration());
});
async function runGeneration() {
  const profile = stmts.getProfile.get() || {};
  const topVideos = stmts.topVideos.all(8);
  const tracked = stmts.allTracked.all();
  const ideas = await ai.generateIdeas({ profile, topVideos, tracked, count: 6 });
  return ideas.map(rowToIdea);
}
function rowToIdea(r) {
  return {
    id: r.id, title: r.title, desc: r.description, platform: r.platform,
    badge: r.badge, score: r.score, dur: r.duration, reach: r.reach
  };
}

// ---------------- schedule ----------------
r.get('/schedule', (req, res) => {
  if (req.query.date) {
    return res.json(stmts.scheduleByDate.all(req.query.date));
  }
  // return map for whole month if given month, otherwise next 60 days
  const from = req.query.from || new Date().toISOString().slice(0,10);
  const to   = req.query.to   || new Date(Date.now() + 60 * 86400000).toISOString().slice(0,10);
  const rows = stmts.scheduleRange.all(from, to);
  const map = {};
  for (const it of rows) {
    if (!map[it.date]) map[it.date] = [];
    map[it.date].push({ time: it.time, platform: it.platform, title: it.title, desc: it.description, id: it.id });
  }
  res.json(map);
});

r.post('/schedule', (req, res) => {
  const { date, time = '12:00', platform = 'youtube', title = 'New plan', description = '' } = req.body || {};
  if (!date) return res.status(400).json({ error: 'date required' });
  const id = 'sch_' + Math.random().toString(36).slice(2, 10);
  stmts.insertSchedule.run({
    id, date, time, platform, title, description, status: 'planned',
    created_at: new Date().toISOString()
  });
  res.json({ id, date, time, platform, title, description });
});

r.delete('/schedule/:id', (req, res) => {
  stmts.deleteSchedule.run(req.params.id);
  res.json({ ok: true });
});

// ---------------- settings ----------------
r.get('/settings/:key', (req, res) => res.json({ value: getSetting(req.params.key) }));
r.put('/settings/:key', (req, res) => { setSetting(req.params.key, req.body?.value || ''); res.json({ ok: true }); });

export default r;
