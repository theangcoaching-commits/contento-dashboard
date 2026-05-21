/* Anthropic Claude — generates content ideas + trending topics
   Prompt-cached on the system prompt to keep costs low across calls. */

import Anthropic from '@anthropic-ai/sdk';
import { stmts } from '../db.js';

const SYSTEM_PROMPT = `You are Contento, an expert short-form & long-form content strategist.
You help creators on YouTube, TikTok, and Instagram generate viral content ideas
that drive leads and conversions. Always return strict JSON matching the schema requested.
Optimize for:
- Hook strength (first 2 seconds)
- Retention / pacing
- Conversion CTA (lead magnet, booking, checkout)
- Algorithmic shareability`;

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function generateIdeas({ profile, topVideos = [], tracked = [], count = 6 }) {
  const c = getClient();
  if (!c) return fallbackIdeas(count);

  const userMsg = buildPrompt({ profile, topVideos, tracked, count });

  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [{
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }
      }],
      messages: [{ role: 'user', content: userMsg }]
    });

    const text = res.content.map(c => c.text || '').join('\n');
    const json = extractJSON(text);
    if (!Array.isArray(json?.ideas)) throw new Error('No ideas array in response');

    const now = new Date().toISOString();
    const ideas = json.ideas.slice(0, count).map((it, i) => ({
      id: `idea_${Date.now()}_${i}`,
      title: it.title || 'Untitled idea',
      description: it.description || '',
      platform: (it.platform || 'youtube').toLowerCase(),
      badge: (it.badge || 'TREND').toUpperCase(),
      score: Number(it.score || 75),
      duration: it.duration || '60–90s',
      reach: it.reach || '100K–500K',
      raw: JSON.stringify(it),
      created_at: now
    }));
    for (const idea of ideas) stmts.insertIdea.run(idea);
    stmts.clearIdeas.run();
    return ideas;
  } catch (err) {
    console.error('[ai] generation failed', err.message);
    return fallbackIdeas(count);
  }
}

function buildPrompt({ profile, topVideos, tracked, count }) {
  const topList = topVideos.slice(0, 8).map(v =>
    `- "${v.title}" · ${v.platform} · ${v.views || 0} views · score ${v.score || 0}`).join('\n');
  const trackList = tracked.slice(0, 8).map(t => `- ${t.name} (${t.handle}) · ${t.tag}`).join('\n');

  return `Creator profile
Name: ${profile.name || '(unset)'}
Niche: ${profile.niche || '(unset)'}
Target audience: ${profile.audience || '(unset)'}
This month goal: ${profile.goal || '(unset)'}

Top recent videos:
${topList || '(none yet)'}

Tracked creators / inspirations:
${trackList || '(none yet)'}

Generate ${count} fresh content ideas optimized for THIS WEEK.
Mix YouTube long-form, TikTok 30–60s, and Instagram Reels/Carousel.
Each idea must include a strong hook line.

Return ONLY valid JSON in this exact shape:
{
  "ideas": [
    {
      "title": "short hook-style title",
      "description": "2 sentences: angle, format, CTA",
      "platform": "youtube|tiktok|instagram",
      "badge": "TREND|VIRAL|GAP|EVERGREEN|EXPERIMENT",
      "score": 60-99,
      "duration": "e.g. 45–60s or 10–14 min",
      "reach": "estimated range, e.g. 200K–600K"
    }
  ]
}`;
}

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); }
  catch { return null; }
}

function fallbackIdeas(count) {
  const base = [
    { title:'5 reasons I fired my $5K/mo employee and replaced him with AI',
      description:'Long-form story + tutorial hybrid. Hook with before/after split screen.',
      platform:'youtube', badge:'TREND', score:94, duration:'10–14 min', reach:'500K–1M' },
    { title:'POV: a client offered $10K and you said no',
      description:'TikTok ride on high-ticket sales trend. Bio link funnel CTA.',
      platform:'tiktok', badge:'VIRAL', score:91, duration:'45–60s', reach:'300K–800K' },
    { title:'I studied 100 founders earning $1M/year — 7 common habits',
      description:'Research-style listicle, evergreen save & share magnet.',
      platform:'youtube', badge:'EVERGREEN', score:88, duration:'15–20 min', reach:'400K–900K' },
    { title:'Carousel: 10 questions to know if you should quit 9-5',
      description:'10-slide IG carousel for the 25–34 demographic.',
      platform:'instagram', badge:'TREND', score:86, duration:'Carousel · 10 slides', reach:'150K–400K' },
    { title:'How I found 1,000 clients via cold DM',
      description:'60s tutorial — competitors haven\'t covered deeply.',
      platform:'tiktok', badge:'GAP', score:82, duration:'45–60s', reach:'200K–600K' },
    { title:'$100/day Facebook Ads for 30 days — what happened',
      description:'Documentary 3-part series, 4× watch time average.',
      platform:'youtube', badge:'EXPERIMENT', score:79, duration:'20–25 min', reach:'250K–700K' }
  ];
  const now = new Date().toISOString();
  return base.slice(0, count).map((it, i) => ({
    id: `idea_fb_${Date.now()}_${i}`,
    ...it,
    raw: JSON.stringify(it),
    created_at: now
  }));
}
