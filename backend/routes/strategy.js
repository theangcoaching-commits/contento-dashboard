/* Strategy + goals + content-plan routes */

import { Router } from 'express';
import { db, stmts } from '../db.js';
import { generateStrategy, materializeWeekToPlan } from '../services/strategy.js';
import { generateScript } from '../services/script.js';

const r = Router();
const nowIso = () => new Date().toISOString();
const yyyymm = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// -------- goals --------
r.get('/goals', (req, res) => {
  res.json(stmts.allGoals.all());
});
r.get('/goals/:period', (req, res) => {
  const g = stmts.getGoalByPeriod.get(req.params.period);
  res.json(g || null);
});
r.put('/goals/:period', (req, res) => {
  const period = req.params.period;
  const b = req.body || {};
  stmts.upsertGoal.run({
    id: 'g_' + period,
    period,
    yt_subs:      Number(b.yt_subs || 0),
    tt_followers: Number(b.tt_followers || 0),
    ig_followers: Number(b.ig_followers || 0),
    leads:        Number(b.leads || 0),
    revenue:      Number(b.revenue || 0),
    notes:        b.notes || '',
    created_at:   b.created_at || nowIso(),
    updated_at:   nowIso()
  });
  res.json(stmts.getGoalByPeriod.get(period));
});

// -------- baselines --------
r.get('/baselines', (req, res) => {
  const rows = stmts.allBaselines.all();
  const map = {};
  for (const row of rows) map[row.platform] = row;
  res.json(map);
});
r.put('/baselines/:platform', (req, res) => {
  const b = req.body || {};
  stmts.upsertBaseline.run({
    platform:  req.params.platform,
    followers: Number(b.followers || 0),
    views_30d: Number(b.views_30d || 0),
    avg_views: Number(b.avg_views || 0),
    notes:     b.notes || '',
    updated_at: nowIso()
  });
  res.json({ ok: true });
});

// -------- funnel rates --------
r.get('/funnels', (req, res) => {
  const rows = stmts.allFunnels.all();
  const map = {};
  for (const row of rows) map[row.platform] = row;
  res.json(map);
});
r.put('/funnels/:platform', (req, res) => {
  const b = req.body || {};
  stmts.upsertFunnel.run({
    platform: req.params.platform,
    views_to_dm:  Number(b.views_to_dm || 0),
    dm_to_call:   Number(b.dm_to_call || 0),
    call_to_sale: Number(b.call_to_sale || 0),
    updated_at:   nowIso()
  });
  res.json({ ok: true });
});

// -------- strategies --------
r.get('/strategy/:period', (req, res) => {
  const rows = stmts.strategiesByPeriod.all(req.params.period);
  res.json(rows.map(formatStrategy));
});

r.post('/strategy/:period/generate', async (req, res) => {
  const period = req.params.period;
  const profile = stmts.getProfile.get() || {};
  const goal = stmts.getGoalByPeriod.get(period) || {};
  const baselines = mapByKey(stmts.allBaselines.all(), 'platform');
  const funnels = mapByKey(stmts.allFunnels.all(), 'platform');
  const currentMetrics = computeCurrentMetrics();

  try {
    const json = await generateStrategy({ profile, goal, baselines, funnels, currentMetrics, period });
    res.json({ ok: true, period, weeks: json.weeks?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------- materialize a week into the calendar --------
r.post('/strategy/:period/materialize', (req, res) => {
  const period = req.params.period;
  const { weekIdx, startDate } = req.body || {};
  if (!weekIdx || !startDate) return res.status(400).json({ error: 'weekIdx + startDate required' });
  const result = materializeWeekToPlan(period, weekIdx, startDate);
  res.json(result);
});

// -------- content plan --------
r.get('/content-plan', (req, res) => {
  if (req.query.date) return res.json(stmts.contentPlanByDate.all(req.query.date));
  const from = req.query.from || new Date().toISOString().slice(0,10);
  const to   = req.query.to   || new Date(Date.now() + 60*86400000).toISOString().slice(0,10);
  const rows = stmts.contentPlanRange.all(from, to);
  // group by date
  const map = {};
  for (const row of rows) {
    if (!map[row.date]) map[row.date] = [];
    map[row.date].push({
      ...row,
      outline: safeJson(row.outline)
    });
  }
  res.json(map);
});

r.post('/content-plan', (req, res) => {
  const b = req.body || {};
  const now = nowIso();
  const repeat = b.repeat;  // e.g. { rule:'daily', until:'2026-05-31' }
  const repeatGroupId = repeat?.rule && repeat.rule !== 'none' ? 'rg_' + Math.random().toString(36).slice(2,10) : null;
  const dates = repeatGroupId ? expandRepeat(b.date, repeat) : [b.date];

  const ids = [];
  for (const d of dates) {
    const id = 'cp_' + Math.random().toString(36).slice(2, 10);
    ids.push(id);
    stmts.insertContentPlan.run({
      id,
      date: d,
      time: b.time || '12:00',
      platform: b.platform || 'youtube',
      format: b.format || '',
      title: b.title || '',
      hook: b.hook || '',
      outline: JSON.stringify(b.outline || []),
      script: b.script || '',
      cta: b.cta || '',
      target_views: Number(b.target_views || 0),
      target_leads: Number(b.target_leads || 0),
      status: b.status || 'idea',
      week_idx: b.week_idx || null,
      repeat_group_id: repeatGroupId,
      repeat_rule: repeat?.rule || null,
      campaign_id: b.campaign_id || null,
      series_id: b.series_id || null,
      created_at: now,
      updated_at: now
    });
  }
  res.json({ id: ids[0], created: ids.length, ids });
});

// Expand a repeat rule into concrete dates (inclusive)
function expandRepeat(start, repeat) {
  const out = [];
  const rule = repeat.rule;
  const until = repeat.until ? new Date(repeat.until) : new Date(new Date(start).getTime() + 30 * 86400000);
  let cur = new Date(start);
  const safetyMax = 200;
  let i = 0;
  while (cur <= until && i < safetyMax) {
    const day = cur.getDay();
    const keep =
      rule === 'daily'        ? true :
      rule === 'weekday'      ? (day >= 1 && day <= 5) :
      rule === 'every-2-days' ? true :
      rule === 'weekly'       ? true :
      rule === 'monthly'      ? true :
      rule === 'mon-wed-fri'  ? (day === 1 || day === 3 || day === 5) :
      rule === 'tue-thu'      ? (day === 2 || day === 4) :
      false;
    if (keep) out.push(cur.toISOString().slice(0, 10));
    const step =
      rule === 'every-2-days' ? 2 :
      rule === 'weekly'       ? 7 :
      rule === 'monthly'      ? 30 :
      1;
    cur.setDate(cur.getDate() + step);
    i++;
  }
  return out;
}

// Clear all (or by range / group / date / campaign / status)
r.delete('/content-plan', (req, res) => {
  if (req.query.group) {
    stmts.clearContentPlanByGroup.run(req.query.group);
    return res.json({ ok: true, scope: 'group' });
  }
  if (req.query.date) {
    const r2 = db.prepare('DELETE FROM content_plan WHERE date = ?').run(req.query.date);
    return res.json({ ok: true, scope: 'date', deleted: r2.changes });
  }
  if (req.query.campaign) {
    const r2 = stmts.deleteContentPlanByCampaign?.run(req.query.campaign);
    return res.json({ ok: true, scope: 'campaign', deleted: r2?.changes || 0 });
  }
  if (req.query.status) {
    const r2 = db.prepare('DELETE FROM content_plan WHERE status = ?').run(req.query.status);
    return res.json({ ok: true, scope: 'status', deleted: r2.changes });
  }
  if (req.query.platform) {
    const r2 = db.prepare('DELETE FROM content_plan WHERE platform = ?').run(req.query.platform);
    return res.json({ ok: true, scope: 'platform', deleted: r2.changes });
  }
  if (req.query.from && req.query.to) {
    stmts.clearContentPlanRange.run(req.query.from, req.query.to);
    return res.json({ ok: true, scope: 'range' });
  }
  stmts.clearAllContentPlan.run();
  res.json({ ok: true, scope: 'all' });
});

// PUT with optional ?scope=this|all|future for repeating events
r.put('/content-plan/:id', (req, res) => {
  const b = req.body || {};
  const scope = req.query.scope || 'this';
  const existing = stmts.getContentPlanById.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const targets = pickScopeIds(existing, scope);
  for (const target of targets) {
    // For 'all'/'future': preserve each row's own date/time; update the editable fields
    const useDate = (target.id === existing.id || scope === 'this') ? (b.date ?? existing.date) : target.date;
    const useTime = (target.id === existing.id || scope === 'this') ? (b.time ?? existing.time) : target.time;
    db.prepare(`UPDATE content_plan SET
        date = ?, time = ?,
        platform = ?, format = ?, title = ?, hook = ?,
        outline = ?, script = ?, cta = ?,
        target_views = ?, target_leads = ?,
        actual_views = ?, actual_leads = ?,
        status = ?, notion_id = ?, video_id = ?,
        updated_at = ?
      WHERE id = ?`).run(
      useDate, useTime,
      b.platform ?? target.platform, b.format ?? target.format,
      b.title    ?? target.title,    b.hook    ?? target.hook,
      typeof b.outline === 'string' ? b.outline : (b.outline ? JSON.stringify(b.outline) : target.outline),
      b.script   ?? target.script,   b.cta     ?? target.cta,
      b.target_views ?? target.target_views, b.target_leads ?? target.target_leads,
      // Actuals are always per-row (don't propagate to other instances)
      target.id === existing.id ? (b.actual_views ?? existing.actual_views) : target.actual_views,
      target.id === existing.id ? (b.actual_leads ?? existing.actual_leads) : target.actual_leads,
      b.status ?? target.status, b.notion_id ?? target.notion_id, b.video_id ?? target.video_id,
      nowIso(), target.id
    );
  }
  res.json({ ok: true, updated: targets.length, scope });
});

// DELETE with optional ?scope=this|all|future
r.delete('/content-plan/:id', (req, res) => {
  const scope = req.query.scope || 'this';
  const existing = stmts.getContentPlanById.get(req.params.id);
  if (!existing) {
    // Not found — maybe already deleted; still try delete by id to keep idempotent
    stmts.deleteContentPlan.run(req.params.id);
    return res.json({ ok: true, deleted: 0 });
  }
  if (scope === 'all' && existing.repeat_group_id) {
    stmts.clearContentPlanByGroup.run(existing.repeat_group_id);
    return res.json({ ok: true, scope: 'all' });
  }
  if (scope === 'future' && existing.repeat_group_id) {
    stmts.deleteContentPlanGroupFrom.run(existing.repeat_group_id, existing.date);
    return res.json({ ok: true, scope: 'future' });
  }
  stmts.deleteContentPlan.run(req.params.id);
  res.json({ ok: true, scope: 'this' });
});

function pickScopeIds(item, scope) {
  if (scope === 'all' && item.repeat_group_id)    return stmts.contentPlanByGroup.all(item.repeat_group_id);
  if (scope === 'future' && item.repeat_group_id) return stmts.contentPlanByGroupFrom.all(item.repeat_group_id, item.date);
  return [item];
}

// -------- GET single content_plan + its repeat group --------
r.get('/content-plan/:id', (req, res) => {
  const row = stmts.getContentPlanById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const item = { ...row, outline: safeJson(row.outline) || [] };
  if (row.repeat_group_id) {
    const group = stmts.contentPlanByGroup.all(row.repeat_group_id);
    item.repeat_group_size = group.length;
    item.repeat_group_index = group.findIndex(g => g.id === row.id) + 1;
  }
  res.json(item);
});

// -------- FORMAT PERFORMANCE — real data aggregation --------
r.get('/format-performance', (req, res) => {
  const rows = stmts.formatPerformance.all();
  res.json(rows);
});

// -------- STRATEGIC RECOMMENDER --------
// Given a platform + target (subs OR followers OR leads) + days,
// return: required views/day, recommended format mix (weighted by historical win rate),
// and a 7-day plan template.
r.post('/strategy/recommend', (req, res) => {
  const { platform = 'tiktok', metric = 'followers', target = 1000, days = 30 } = req.body || {};
  const profile = stmts.getProfile.get() || {};
  const funnels = mapByKey(stmts.allFunnels.all(), 'platform');
  const baselines = mapByKey(stmts.allBaselines.all(), 'platform');
  const f = funnels[platform] || { views_to_dm: platform === 'tiktok' ? 0.01 : 0.10, dm_to_call: 0.8, call_to_sale: 0.625 };

  // Conversion math
  // Sub/follower conversion (rough heuristics): YT ~0.5% of views convert to subs, TT ~0.3%
  const viewToSubRate = platform === 'youtube' ? 0.005
                       : platform === 'tiktok' ? 0.003
                       :                          0.002;
  let viewsNeeded;
  if (metric === 'leads')      viewsNeeded = Math.round(target / Math.max(f.views_to_dm * f.dm_to_call * f.call_to_sale, 0.0001));
  else if (metric === 'subs' || metric === 'followers')
                                viewsNeeded = Math.round(target / viewToSubRate);
  else                          viewsNeeded = Math.round(target);

  const viewsPerDay = Math.ceil(viewsNeeded / Math.max(days, 1));
  const postsPerDay = platform === 'youtube' ? 1 : 2;
  const viewsPerPost = Math.ceil(viewsPerDay / postsPerDay);

  // Pull format performance to weight recommendations
  const perf = stmts.formatPerformance.all().filter(p => p.platform === platform);

  // Default recommended mix (the 4 lead-driving formats + supplementary)
  const baseMix = (platform === 'youtube') ? [
    { format: 'coaching',     label: 'Coaching style',  weight: 0.30, stage: 'trust',     why: 'Show coaching a real student/problem → highest conversion-to-DM' },
    { format: 'breakdown',    label: 'Give knowledge',  weight: 0.30, stage: 'awareness', why: 'Educational frameworks → high save + share → algo boost' },
    { format: 'vlog',         label: 'Day-in-the-life', weight: 0.20, stage: 'trust',     why: 'Connection-first content → audience converts later' },
    { format: 'pov-day',      label: 'POV',             weight: 0.10, stage: 'awareness', why: 'Viral hook for cold audience' },
    { format: 'tutorial',     label: 'Tutorial',        weight: 0.10, stage: 'awareness', why: 'Listicle / how-to → save for later' }
  ] : platform === 'tiktok' ? [
    { format: 'pov',          label: 'POV story',       weight: 0.40, stage: 'awareness', why: 'Highest viral potential — required for follower growth' },
    { format: 'coaching',     label: 'Coaching style',  weight: 0.25, stage: 'trust',     why: 'Audience says "I want her to coach me" → DM' },
    { format: 'talking-head', label: 'Give knowledge',  weight: 0.25, stage: 'awareness', why: '60s tips → bookmark + follow for more' },
    { format: 'vlog',         label: 'Vlog clip',       weight: 0.10, stage: 'trust',     why: 'Behind-the-scenes connection' }
  ] : [
    { format: 'reel',         label: 'Reel',            weight: 0.50, stage: 'awareness', why: 'TT cross-post' },
    { format: 'carousel',     label: 'Knowledge carousel', weight: 0.30, stage: 'trust',  why: 'High save rate' },
    { format: 'story',        label: 'Story',           weight: 0.20, stage: 'trust',     why: 'Daily presence' }
  ];

  // Adjust weights by historical performance
  const totalLeads = perf.reduce((s, p) => s + (p.total_leads || 0), 0);
  for (const slot of baseMix) {
    const hit = perf.find(p => p.format === slot.format);
    if (hit && totalLeads > 0) {
      const performance = (hit.total_leads || 0) / totalLeads;
      // Blend default weight (60%) with actual performance (40%)
      slot.weight = +(slot.weight * 0.6 + performance * 0.4).toFixed(3);
      slot.has_data = true;
      slot.avg_views = Math.round(hit.avg_views || 0);
      slot.avg_leads = Math.round((hit.avg_leads || 0) * 100) / 100;
    } else {
      slot.has_data = false;
    }
  }
  // Re-normalize so weights sum to 1
  const sum = baseMix.reduce((s, x) => s + x.weight, 0);
  if (sum > 0) for (const m of baseMix) m.weight = +(m.weight / sum).toFixed(3);

  // Build a 7-day template based on the mix
  const totalPostsPerWeek = postsPerDay * 7;
  for (const slot of baseMix) {
    slot.posts_per_week  = Math.round(slot.weight * totalPostsPerWeek);
    slot.posts_per_month = Math.round(slot.weight * postsPerDay * days);
    slot.target_views_per_post = viewsPerPost;
  }

  res.json({
    platform, metric, target, days,
    profile_niche: profile.niche || '',
    math: {
      target,
      view_to_metric_rate: metric === 'leads' ? f.views_to_dm * f.dm_to_call * f.call_to_sale : viewToSubRate,
      views_needed: viewsNeeded,
      views_per_day: viewsPerDay,
      views_per_post: viewsPerPost,
      posts_per_day: postsPerDay,
      total_posts: postsPerDay * days
    },
    mix: baseMix,
    funnel: f
  });
});

// -------- FUNNEL STRATEGY (TOFU / MOFU / BOFU) --------
// Note: routes use /funnel-plan (not /strategy/funnel) to avoid collision with /strategy/:period/* routes.
r.post('/funnel-plan', (req, res) => {
  const { objective = 'viral', timeframe_days = 30, platform = 'tiktok' } = req.body || {};
  const profile = stmts.getProfile.get() || {};
  const baselines = mapByKey(stmts.allBaselines.all(), 'platform');
  const funnels = mapByKey(stmts.allFunnels.all(), 'platform');

  const MIX = {
    viral:    { tofu: 0.70, mofu: 0.20, bofu: 0.10 },
    trust:    { tofu: 0.30, mofu: 0.50, bofu: 0.20 },
    convert:  { tofu: 0.20, mofu: 0.30, bofu: 0.50 },
    balanced: { tofu: 0.40, mofu: 0.40, bofu: 0.20 }
  };
  const mix = MIX[objective] || MIX.balanced;
  const postsPerDay = platform === 'youtube' ? 1 : 2;
  const totalPosts  = postsPerDay * timeframe_days;
  const tofuPosts = Math.round(totalPosts * mix.tofu);
  const mofuPosts = Math.round(totalPosts * mix.mofu);
  const bofuPosts = Math.max(0, totalPosts - tofuPosts - mofuPosts);

  // Format catalog per stage per platform
  const STAGE_FORMATS = {
    tofu: {
      youtube:   [{ value: 'pov-day', label: 'POV my day' }, { value: 'listicle', label: 'Listicle 3-5-7' }, { value: 'reaction', label: 'Reaction' }],
      tiktok:    [{ value: 'pov', label: 'POV story' }, { value: 'reaction', label: 'Reaction · stitch' }, { value: 'talking-head', label: 'Hot take 60s' }, { value: 'controversy', label: 'Hot take' }],
      instagram: [{ value: 'reel', label: 'Reel · cross-post' }, { value: 'story', label: 'Story trending' }]
    },
    mofu: {
      youtube:   [{ value: 'breakdown', label: 'Framework breakdown' }, { value: 'vlog', label: 'Day in the life' }, { value: 'coaching', label: 'Coaching breakdown' }],
      tiktok:    [{ value: 'vlog', label: 'Vlog · BTS clip' }, { value: 'coaching', label: '60s coaching' }, { value: 'tutorial', label: 'Mini tutorial' }],
      instagram: [{ value: 'carousel', label: '10-slide carousel' }, { value: 'reel', label: 'Story-driven Reel' }]
    },
    bofu: {
      youtube:   [{ value: 'coaching', label: 'Client win case study' }, { value: 'documentary', label: 'Offer breakdown VSL' }, { value: 'qa', label: 'Live Q&A' }],
      tiktok:    [{ value: 'testimonial', label: 'Student testimonial' }, { value: 'talking-head', label: 'Offer breakdown' }],
      instagram: [{ value: 'reel', label: 'Testimonial reel' }, { value: 'carousel', label: 'Offer carousel' }]
    }
  };

  // KPIs per stage
  const STAGE_KPIS = {
    tofu: ['views', 'avg_watch_time', 'shares'],
    mofu: ['saves', 'comments', 'follows_per_post'],
    bofu: ['DMs', 'profile_visits', 'link_clicks', 'leads', 'sales']
  };

  // Stage goals + tactics (inspired by known systems)
  const STAGES = [
    {
      key: 'tofu',
      label: 'TOFU · Awareness · Viral hooks',
      pct: mix.tofu,
      posts: tofuPosts,
      goal: 'Get strangers to STOP scrolling and pay attention to your new positioning',
      kpis: STAGE_KPIS.tofu,
      formats: STAGE_FORMATS.tofu[platform] || STAGE_FORMATS.tofu.tiktok,
      hook_pattern: 'Bold claim · pattern interrupt · "POV…"',
      references: [
        'Hormozi · Hook-Retention-Reward · Hook every 30s',
        'MrBeast · 5-second hook + retention pattern',
        'Iman Gadzhi · Niche viral with personality'
      ],
      tactics: [
        'Open with face/lighting change in first frame',
        'First 7 words = the whole promise',
        'Use trending audio or sound (TT/Reels)',
        'Hook a contrarian / pivot truth ("I taught English 10 years. Now I help teachers quit it.")',
        'Cliffhanger at 30s mark if longer than 60s'
      ]
    },
    {
      key: 'mofu',
      label: 'MOFU · Trust · Build authority',
      pct: mix.mofu,
      posts: mofuPosts,
      goal: 'Convert curious viewers into people who BELIEVE you can help them',
      kpis: STAGE_KPIS.mofu,
      formats: STAGE_FORMATS.mofu[platform] || STAGE_FORMATS.mofu.tiktok,
      hook_pattern: 'Story · "Here\'s how I did it…" · Framework reveal',
      references: [
        'Justin Welsh · 4-format rotation (Story / Listicle / Framework / Contrarian)',
        'Ali Abdaal · Edutainment frameworks',
        'Cody Sanchez · Spicy headline + practical teach'
      ],
      tactics: [
        'Teach ONE framework per post (Offer Ladder, Funnel 3 tầng)',
        'Show coaching session BTS (with student consent)',
        'Day-in-the-life vlogs · audience falls for the lifestyle',
        'Repurpose Hormozi-style "stop doing X, do Y instead"',
        'Always tease bigger framework → "DM me for full system"'
      ]
    },
    {
      key: 'bofu',
      label: 'BOFU · Convert · Drive action',
      pct: mix.bofu,
      posts: bofuPosts,
      goal: 'Turn warm audience into LEADS (DMs, form submissions, booked calls)',
      kpis: STAGE_KPIS.bofu,
      formats: STAGE_FORMATS.bofu[platform] || STAGE_FORMATS.bofu.tiktok,
      hook_pattern: 'Specific result · "From 20tr to 80tr in 8 weeks" · CTA',
      references: [
        'Hormozi · $100M Offers · stack value + risk-reverse',
        'Iman Gadzhi · Soft launch sequences',
        'Russell Brunson · VSL Pain → Agitate → Solve → Offer'
      ],
      tactics: [
        'Hard CTA in every BOFU post · "Comment HỆ THỐNG / DM SCALE"',
        'Show specific student transformations (numbers!)',
        'Time-limit offers ("8 weeks · 25 slots")',
        'Address common objections in post body',
        'Direct to Calendly booking link'
      ]
    }
  ];

  // 7-day rolling template based on stage mix
  const weekDays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const stageQueue = [];
  for (const s of STAGES) {
    const perWeek = Math.round(s.pct * postsPerDay * 7);
    for (let i = 0; i < perWeek; i++) stageQueue.push(s.key);
  }
  // Pad/trim to exactly 7*postsPerDay
  while (stageQueue.length < 7 * postsPerDay) stageQueue.push('tofu');
  stageQueue.length = 7 * postsPerDay;

  // Distribute by interleaving (no two same-stage adjacent slots when possible)
  const slots = [];
  for (let i = 0; i < 7 * postsPerDay; i++) slots.push(stageQueue[(i * 3) % stageQueue.length] || 'tofu');

  const weeklyPlan = weekDays.map((d, di) => {
    const day = { day: d, slots: [] };
    for (let s = 0; s < postsPerDay; s++) {
      const stageKey = slots[di * postsPerDay + s];
      const stage = STAGES.find(x => x.key === stageKey);
      const fmt = stage.formats[(di + s) % stage.formats.length];
      const time = postsPerDay === 1 ? '08:00' : (s === 0 ? '12:30' : '20:00');
      day.slots.push({
        time, stage: stageKey, stage_label: stage.label.split('·')[0].trim(),
        format: fmt.value, format_label: fmt.label,
        hook_seed: stage.hook_pattern
      });
    }
    return day;
  });

  // Sub-strategy by timeframe (e.g. pivot → viral progression)
  const phases = [];
  if (objective === 'viral' && timeframe_days >= 14) {
    phases.push({ weeks: '1-2', focus: 'Pure TOFU push', mix: { tofu: 0.80, mofu: 0.15, bofu: 0.05 },
      action: 'Drop 14-20 POV / hot-takes. Find your 1-2 winning hooks. Double down.' });
    phases.push({ weeks: '3', focus: 'Start MOFU layering', mix: { tofu: 0.55, mofu: 0.35, bofu: 0.10 },
      action: 'Once a winning TOFU pattern emerges, slip in frameworks + BTS that reinforce the same theme.' });
    phases.push({ weeks: '4+', focus: 'Open conversion', mix: { tofu: 0.40, mofu: 0.40, bofu: 0.20 },
      action: 'Add testimonials + DM CTAs. Run a soft launch.' });
  } else if (objective === 'convert' && timeframe_days >= 7) {
    phases.push({ weeks: '1', focus: 'Pre-launch warm-up', mix: { tofu: 0.30, mofu: 0.50, bofu: 0.20 },
      action: 'Drop testimonials + system reveals. Build anticipation.' });
    phases.push({ weeks: '2', focus: 'Hard launch', mix: { tofu: 0.15, mofu: 0.25, bofu: 0.60 },
      action: 'Daily BOFU. Urgency, scarcity, social proof.' });
  }

  res.json({
    objective, timeframe_days, platform, profile_niche: profile.niche || '',
    mix, posts: { total: totalPosts, tofu: tofuPosts, mofu: mofuPosts, bofu: bofuPosts },
    stages: STAGES,
    weekly_plan: weeklyPlan,
    phases,
    posts_per_day: postsPerDay
  });
});

// Brainstormer · given a format + platform + stage, return N specific video ideas
r.post('/brainstorm', async (req, res) => {
  const { platform = 'tiktok', format = 'pov', stage = 'tofu', count = 5 } = req.body || {};
  const profile = stmts.getProfile.get() || {};
  // Try AI first via the ai service; fallback to templates
  try {
    const { generateBrainstorm } = await import('../services/brainstorm.js');
    const ideas = await generateBrainstorm({ platform, format, stage, count, profile });
    return res.json({ ok: true, ideas });
  } catch (err) {
    console.error('[brainstorm]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Materialize a funnel plan into content_plan from a start date
r.post('/funnel-plan/materialize', (req, res) => {
  const { plan, start_date, weeks = 1 } = req.body || {};
  if (!plan || !plan.weekly_plan) return res.status(400).json({ error: 'plan + start_date required' });
  const start = new Date(start_date || new Date().toISOString().slice(0, 10));
  const now = nowIso();
  let added = 0;
  for (let w = 0; w < weeks; w++) {
    for (let di = 0; di < plan.weekly_plan.length; di++) {
      const day = plan.weekly_plan[di];
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + di);
      const ds = date.toISOString().slice(0, 10);
      for (const slot of (day.slots || [])) {
        const id = 'cp_' + Math.random().toString(36).slice(2, 10);
        stmts.insertContentPlan.run({
          id, date: ds, time: slot.time,
          platform: plan.platform, format: slot.format,
          title: `[${slot.stage.toUpperCase()}] ${slot.format_label}`,
          hook: slot.hook_seed || '',
          outline: JSON.stringify([]), script: '', cta: '',
          target_views: 0, target_leads: 0,
          status: 'idea', week_idx: w + 1,
          repeat_group_id: null, repeat_rule: null, campaign_id: null, series_id: null,
          created_at: now, updated_at: now
        });
        added++;
      }
    }
  }
  res.json({ ok: true, added });
});

// -------- AI script generation --------
r.post('/script/:planId', async (req, res) => {
  try {
    const result = await generateScript(req.params.planId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------- helpers --------
function formatStrategy(r) {
  return {
    id: r.id, period: r.period, scope: r.scope, weekIdx: r.week_idx,
    title: r.title, theme: r.theme, description: r.description,
    days: r.scope === 'week' ? safeJson(r.bullets) : null,
    raw: safeJson(r.raw)
  };
}
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
function mapByKey(arr, key) { const m = {}; for (const x of arr) m[x[key]] = x; return m; }

function computeCurrentMetrics() {
  const rows = stmts.latestMetrics.all();
  const m = {
    youtube:   { subs: 0, views: 0 },
    tiktok:    { followers: 0, views: 0 },
    instagram: { followers: 0, views: 0 }
  };
  for (const row of rows) {
    if (row.metric === 'subs') m.youtube.subs = row.value;
    if (row.metric === 'totalViews') m.youtube.views = row.value;
    if (row.metric === 'followers' && row.platform === 'tiktok') m.tiktok.followers = row.value;
    if (row.metric === 'followers' && row.platform === 'instagram') m.instagram.followers = row.value;
  }
  return m;
}

export default r;
