/* Goal-driven content strategy
   Takes profile + goals + current metrics + style references
   → returns a monthly strategy with weekly themes + daily content plan
   Uses Claude with prompt caching on the system prompt. */

import Anthropic from '@anthropic-ai/sdk';
import { stmts } from '../db.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';
let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `You are Contento Strategist — a senior content strategist who has edited content for $100K/month founders and ran a $1M/yr consulting business. You think in funnel math, hook strength, retention, and CTA placement.

Your job: produce a goal-driven monthly content strategy for a creator. Output STRICT JSON (no prose).

Rules:
- Map every video idea to a stage in their funnel (TOFU/MOFU/BOFU)
- Mix formats: educational, story, POV day-in-life, breakdown, testimonial, hot-take
- Hooks must be 2-second-grab style; first 7 words matter
- For YouTube long-form: 10-14 min, structured outline
- For TikTok / Instagram Reels: 30-90s, single hook + payoff
- Use the creator's style references as flavor (e.g. "Soo Wei Goh sharpness", "RoasBrez storytelling")
- Each week has ONE theme aligned to the monthly goal
- Daily plan honors creator's cadence (e.g. 1 YT + 2 TT per day)
- Conversion math drives target views/leads per video`;

export async function generateStrategy({ profile, goal, baselines, funnels, currentMetrics, period }) {
  const c = getClient();
  if (!c) return fallbackStrategy({ profile, goal, period });

  const userMsg = buildPrompt({ profile, goal, baselines, funnels, currentMetrics, period });

  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
      ],
      messages: [{ role: 'user', content: userMsg }]
    });

    const text = res.content.map(c => c.text || '').join('\n');
    const json = extractJSON(text);
    if (!json || !json.month) throw new Error('Bad strategy response');

    return persistStrategy(period, json);
  } catch (err) {
    console.error('[strategy] AI failed, falling back:', err.message);
    return fallbackStrategy({ profile, goal, period });
  }
}

function buildPrompt({ profile, goal, baselines, funnels, currentMetrics, period }) {
  const today = new Date().toISOString().slice(0, 10);
  return `Creator
Name: ${profile.name || ''}
Niche: ${profile.niche || ''}
Audience: ${profile.audience || ''}
Long-term goal: ${profile.goal || ''}

Current state (as of ${today})
YouTube: ${currentMetrics.youtube?.subs || 0} subs, ${currentMetrics.youtube?.views || 0} views in last 30d
TikTok:  ${baselines.tiktok?.followers || 0} followers, ${baselines.tiktok?.avg_views || 0} avg views/post
Instagram: ${baselines.instagram?.followers || 0} followers

Conversion funnel (creator-defined)
YouTube:   ${pct(funnels.youtube?.views_to_dm)} views→DM · ${pct(funnels.youtube?.dm_to_call)} DM→call · ${pct(funnels.youtube?.call_to_sale)} call→sale
TikTok:    ${pct(funnels.tiktok?.views_to_dm)} views→DM · ${pct(funnels.tiktok?.dm_to_call)} DM→call · ${pct(funnels.tiktok?.call_to_sale)} call→sale

This month's target (${period})
YT subs +${goal.yt_subs}, TT followers +${goal.tt_followers}, IG +${goal.ig_followers}
Leads target: ${goal.leads}
Revenue target: $${goal.revenue}

Cadence: 1 YouTube long-form/day + 2 TikTok/day. Self-edits. 2h/day capacity.

Style references: blend sharp business directness (Soo Wei Goh, Hormozi-energy), storytelling/aesthetic (RoasBrez, Mr Nik Setting), personality (Trey Gustafson, Fin Kwong, Rex Cheng).

Generate a 4-week content strategy. Each week must have:
- theme (1 phrase)
- objective (1 sentence tied to goal)
- 7 days × content slots (YT 1/day, TT 2/day)
- For each slot: format, hook, outline (3-5 bullets), CTA, target_views, target_leads

Return JSON in this exact schema:
{
  "month": {
    "title": "string",
    "thesis": "one sentence north star for the month",
    "math": "how many views/DMs/calls/sales needed to hit goals"
  },
  "weeks": [
    {
      "week": 1,
      "theme": "string",
      "objective": "string",
      "days": [
        {
          "day": "Mon",
          "date_offset": 0,
          "slots": [
            {
              "platform": "youtube|tiktok|instagram",
              "time": "HH:MM",
              "format": "vlog|pov|talking-head|breakdown|tutorial|story|carousel",
              "title": "video title",
              "hook": "first 7 words",
              "outline": ["bullet 1", "bullet 2", "..."],
              "cta": "what to say at end",
              "target_views": 1000,
              "target_leads": 2
            }
          ]
        }
      ]
    }
  ]
}`;
}

function pct(v) { return v != null ? (v * 100).toFixed(1) + '%' : '—'; }

function extractJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); }
  catch { return null; }
}

function persistStrategy(period, json) {
  stmts.deleteStrategiesByPeriod.run(period);
  const now = new Date().toISOString();

  stmts.insertStrategy.run({
    id: `s_${period}_month`,
    period, scope: 'month', week_idx: 0,
    title: json.month?.title || '',
    theme: json.month?.thesis || '',
    description: json.month?.math || '',
    bullets: JSON.stringify([]),
    raw: JSON.stringify(json.month || {}),
    created_at: now
  });

  for (const w of (json.weeks || [])) {
    stmts.insertStrategy.run({
      id: `s_${period}_w${w.week}`,
      period, scope: 'week', week_idx: w.week,
      title: `Week ${w.week}`,
      theme: w.theme || '',
      description: w.objective || '',
      bullets: JSON.stringify(w.days || []),
      raw: JSON.stringify(w),
      created_at: now
    });
  }
  return json;
}

// ---- Fallback strategy (used if AI key absent) ----
function fallbackStrategy({ profile, goal, period }) {
  const themes = [
    { theme: 'Origin story & promise', objective: 'Establish trust + pain agitation; hook viewers with your transformation arc.' },
    { theme: 'System breakdowns', objective: 'Show your frameworks (Offer Ladder, Funnel, SOP) so viewers picture using them.' },
    { theme: 'Student wins & proof', objective: 'Testimonials + behind-the-scenes; trigger MOFU "I want this".' },
    { theme: 'Launch push', objective: 'Convert: VSL, FAQ posts, countdown, FOMO; close the cart.' }
  ];
  const weeks = themes.map((t, i) => ({
    week: i + 1,
    theme: t.theme,
    objective: t.objective,
    days: buildWeekDays(i + 1, t.theme)
  }));
  const json = {
    month: {
      title: `Path to ${goal.leads} leads in ${period}`,
      thesis: 'Stack 4 weeks of compounding trust + conversion content along your offer ladder.',
      math: `Goal: ${goal.leads} leads → ${Math.round(goal.leads*10)} DMs → ~${Math.round(goal.leads*200)} qualified views/month.`
    },
    weeks
  };
  return persistStrategy(period, json);
}

function buildWeekDays(weekIdx, theme) {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return days.map((d, idx) => ({
    day: d,
    date_offset: (weekIdx - 1) * 7 + idx,
    slots: [
      { platform: 'youtube', time: '08:00', format: 'breakdown',
        title: `[${theme}] · YT long-form day ${(weekIdx-1)*7+idx+1}`,
        hook: 'Stop trading hours for income.',
        outline: [`Pain — Vietnamese coaches grinding 12h/day`, `Mistake most make`, `The 3-tier offer ladder`, `Case study`, `Call to action: book a call`],
        cta: 'Book a free 15-min call to map your offer ladder', target_views: 800, target_leads: 4 },
      { platform: 'tiktok', time: '12:30', format: 'pov',
        title: `POV: bạn vừa từ 1-1 lên lớp 15 người`,
        hook: 'Một quyết định thay đổi toàn bộ doanh thu của tôi.',
        outline: ['Hook 2s · before scene', 'Story flip', 'Lesson punchline'],
        cta: 'Comment "HỆ THỐNG" để nhận template', target_views: 3500, target_leads: 3 },
      { platform: 'tiktok', time: '20:00', format: 'talking-head',
        title: `3 sai lầm giáo viên 20tr/tháng đang mắc`,
        hook: 'Nếu bạn vẫn dạy 1-1, video này dành cho bạn.',
        outline: ['Sai lầm #1 — bán giờ', 'Sai lầm #2 — không có offer', 'Sai lầm #3 — content vu vơ', 'Fix nhanh'],
        cta: 'Link bio để đăng ký demo call', target_views: 4000, target_leads: 4 }
    ]
  }));
}

// ---- Convert a strategy week into concrete content_plan rows for a date range ----
export function materializeWeekToPlan(period, weekIdx, startDate) {
  const row = stmts.strategiesByPeriod.all(period).find(r => r.scope === 'week' && r.week_idx === weekIdx);
  if (!row) return { inserted: 0 };
  const days = JSON.parse(row.bullets || '[]');
  const start = new Date(startDate);
  const now = new Date().toISOString();
  let inserted = 0;
  for (const day of days) {
    const date = new Date(start);
    date.setDate(start.getDate() + (day.date_offset || 0));
    const ds = date.toISOString().slice(0, 10);
    for (const slot of (day.slots || [])) {
      const id = `cp_${Math.random().toString(36).slice(2, 10)}`;
      stmts.insertContentPlan.run({
        id, date: ds, time: slot.time || '12:00',
        platform: slot.platform, format: slot.format || '',
        title: slot.title || 'Untitled', hook: slot.hook || '',
        outline: JSON.stringify(slot.outline || []), script: '', cta: slot.cta || '',
        target_views: slot.target_views || 0, target_leads: slot.target_leads || 0,
        status: 'idea', week_idx: weekIdx,
        repeat_group_id: null, repeat_rule: null, campaign_id: null, series_id: null,
        created_at: now, updated_at: now
      });
      inserted++;
    }
  }
  return { inserted };
}
