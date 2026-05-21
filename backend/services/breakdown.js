/* Breakdown a creator's video by URL.
   1. Fetch metadata via OEmbed (YouTube) or scrape (TT/IG fallback)
   2. Send to Claude for hook/structure/why-works analysis
   3. Return structured JSON for the UI */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function breakdownUrl(url) {
  const meta = await fetchMeta(url);
  const analysis = await analyze(meta);
  return { ...meta, ...analysis };
}

async function fetchMeta(url) {
  const platform = detectPlatform(url);
  let title = '', thumbnail = '', author = '', author_url = '';

  try {
    if (platform === 'youtube') {
      const ytId = ytVideoId(url);
      const o = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (o.ok) {
        const j = await o.json();
        title = j.title || '';
        thumbnail = j.thumbnail_url || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '');
        author = j.author_name || '';
        author_url = j.author_url || '';
      }
    } else if (platform === 'tiktok') {
      const o = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
      if (o.ok) {
        const j = await o.json();
        title = j.title || '';
        thumbnail = j.thumbnail_url || '';
        author = j.author_name || '';
        author_url = j.author_url || '';
      }
    } else if (platform === 'instagram') {
      // Instagram OEmbed requires Facebook auth — fall back to URL-only metadata
      title = '(Instagram video — paste your title)';
      author = (url.match(/instagram\.com\/([^/]+)/) || [])[1] || '';
    }
  } catch (err) {
    console.warn('[breakdown] meta fetch failed', err.message);
  }

  return { url, platform, title, thumbnail, author, author_url };
}

async function analyze(meta) {
  const c = getClient();
  if (!c) return fallbackAnalysis(meta);

  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system: [
        {
          type: 'text',
          text: `You are Contento Reverse-Engineer — you dissect viral content for creators. You explain WHY a video works and HOW to replicate the structure in their own niche. Output STRICT JSON only.`,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [{
        role: 'user',
        content: `Analyze this ${meta.platform} video for a creator who builds a Vietnamese coaching business (target audience: teachers/coaches earning 15-25M VND/month who want to scale to $10K/mo).

Video title: ${meta.title}
Author: ${meta.author}
URL: ${meta.url}

Return JSON:
{
  "detected_format": "vlog | pov | breakdown | talking-head | tutorial | story | reaction | listicle | carousel",
  "hook_pattern": "explain the hook structure in 1 sentence",
  "structure": ["beat 1 (timecode if estimable)", "beat 2", "..."],
  "why_works": "3-4 sentences on what makes this video stop-the-scroll + drive action",
  "replicate_for_ang": "1 paragraph: how to adapt this format for ANG Consulting's niche (Vietnamese coaches), with a specific hook line in Vietnamese",
  "swipe_score": 0-100,
  "warnings": "any risks or things to avoid copying"
}`
      }]
    });
    const text = res.content.map(c => c.text || '').join('\n');
    const json = extractJSON(text);
    if (!json) throw new Error('No JSON');
    return json;
  } catch (err) {
    console.error('[breakdown] AI failed:', err.message);
    return fallbackAnalysis(meta);
  }
}

function fallbackAnalysis(meta) {
  return {
    detected_format: meta.platform === 'youtube' ? 'breakdown' : 'pov',
    hook_pattern: 'Strong visual hook + contrarian claim in first 2 seconds (estimated — connect Claude API key for deep analysis).',
    structure: [
      '0-2s · Visual hook (pattern interrupt)',
      '2-15s · Pain agitation or curiosity gap',
      '15-45s · Story / framework reveal',
      '45-60s · CTA (DM, link, follow)'
    ],
    why_works: 'High-energy hook stops the scroll. Personal story creates parasocial trust. CTA is specific and frictionless. Save Claude API key in .env to get a detailed breakdown.',
    replicate_for_ang: 'Adapt the hook for Vietnamese coaches: "POV: bạn vừa từ 1-1 chuyển sang lớp 15 người." Open with quick before/after visual. Tell your transformation story in 30s. End with "Comment HỆ THỐNG để nhận template".',
    swipe_score: 70,
    warnings: 'Note: this is a template fallback. Add ANTHROPIC_API_KEY to .env for real video-specific analysis.'
  };
}

function detectPlatform(url) {
  if (/youtu\.?be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  if (/instagram\.com/i.test(url)) return 'instagram';
  return 'youtube';
}

function ytVideoId(url) {
  const m = url.match(/(?:v=|\/shorts\/|youtu\.be\/)([\w-]{6,})/);
  return m ? m[1] : '';
}

function extractJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
