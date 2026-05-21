/* AI script generator
   Blends user's chosen style references + niche + funnel into a viral-ready script. */

import Anthropic from '@anthropic-ai/sdk';
import { db, stmts } from '../db.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';
let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM = `You are Contento Scriptwriter — you script content for $100K/mo creators.

You blend these style references:
- Soo Wei Goh: sharp business directness, math-first hooks, no fluff
- Alex Hormozi: pain-agitation, contrarian energy, value-stacked CTAs
- RoasBrez: dreamy aesthetic vlog with deep storytelling beats
- Mr Nik Setting: cinematic transitions, voiceover over b-roll
- Trey Gustafson / Fin Kwong / Rex Cheng: warm personality, conversational charm

Output STRICT JSON only. No prose outside JSON.

Rules:
- First 7 words must STOP the scroll
- Long-form (YT 10-14 min): structured outline with timecodes
- Short-form (TT/IG 30-90s): single hook + payoff + CTA in <90 words
- CTA must be specific (DM a keyword, link in bio, book a call) and aligned to creator's funnel
- Write in the same language as the title (Vietnamese if title is in Vietnamese)
- Reference creator's niche concretely`;

export async function generateScript(planId) {
  const plan = db.prepare('SELECT * FROM content_plan WHERE id = ?').get(planId);
  if (!plan) throw new Error('Plan not found');

  const profile = stmts.getProfile.get() || {};
  const c = getClient();
  if (!c) {
    // Fallback template-driven script
    return persistScript(planId, fallbackScript(plan, profile));
  }

  const userMsg = buildUserMsg(plan, profile);
  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMsg }]
    });
    const text = res.content.map(c => c.text || '').join('\n');
    const json = extractJSON(text);
    if (!json) throw new Error('No JSON in script response');
    return persistScript(planId, json);
  } catch (err) {
    console.error('[script] AI failed:', err.message);
    return persistScript(planId, fallbackScript(plan, profile));
  }
}

function buildUserMsg(plan, profile) {
  return `Write a ${plan.platform.toUpperCase()} ${plan.format} script.

Creator: ${profile.name || 'ANG Consulting'}
Niche: ${profile.niche || 'Coaching cho giáo viên VN scale 0→10K/mo'}
Audience: ${profile.audience || 'Giáo viên/coach VN dạy 1-1, mệt mỏi, muốn scale'}
Long-term goal: ${profile.goal || '500 leads / $20K MRR'}

Plan slot:
  Title: ${plan.title}
  Hook (seed): ${plan.hook}
  Outline seed: ${plan.outline}
  CTA seed: ${plan.cta}
  Format: ${plan.format}
  Target: ${plan.target_views} views, ${plan.target_leads} leads

Return JSON:
{
  "hook": "improved 2s hook (7 words max)",
  "outline": ["beat 1 with timestamp", "beat 2", "..."],
  "script": "full script with [BROLL], [CUT], [VO] markers as needed",
  "cta": "exact CTA line to say at end",
  "hashtags": ["#tag1", "#tag2", "..."],
  "broll_ideas": ["shot 1", "shot 2", "..."],
  "thumbnail_idea": "what the thumbnail should show + text overlay"
}`;
}

function extractJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function persistScript(planId, json) {
  const outline = JSON.stringify(json.outline || []);
  const script = typeof json.script === 'string' ? json.script :
                 (json.script ? JSON.stringify(json.script) : '');
  db.prepare(`UPDATE content_plan
              SET hook = COALESCE(?, hook),
                  outline = ?,
                  script = ?,
                  cta = COALESCE(?, cta),
                  status = CASE WHEN status = 'idea' THEN 'scripted' ELSE status END,
                  updated_at = ?
              WHERE id = ?`).run(
    json.hook || null, outline, script, json.cta || null,
    new Date().toISOString(), planId
  );
  return json;
}

function fallbackScript(plan, profile) {
  const isShort = plan.platform !== 'youtube' || (plan.format && plan.format !== 'breakdown' && plan.format !== 'tutorial');
  const niche = profile.niche || 'giáo viên muốn scale';
  if (isShort) {
    return {
      hook: plan.hook || 'Tôi đã làm điều này và đổi đời.',
      outline: [
        '0-2s · Hook visual (close-up + text overlay)',
        '2-15s · Pain agitation: lịch dạy 12h/ngày, kiệt sức',
        '15-40s · Story flip: tôi đã thay đổi 1 thứ',
        '40-60s · Reveal kết quả + CTA'
      ],
      script: `[HOOK 0:00-0:02]\n${plan.hook}\n\n[BEAT 1 · Pain 0:02-0:15]\nBạn có biết hầu hết ${niche} đang làm 12h/ngày chỉ để kiếm 20tr? Đây là cái họ bỏ qua...\n\n[BEAT 2 · Story 0:15-0:40]\nTôi từng vậy. Cho đến khi tôi áp dụng [framework]. Trong 2 tháng, tôi từ 1-1 chuyển sang lớp 15 người, doanh thu x4.\n\n[BEAT 3 · Reveal + CTA 0:40-0:60]\nBí mật là [insight chính]. ${plan.cta}`,
      cta: plan.cta || 'Comment "HỆ THỐNG" để nhận template miễn phí.',
      hashtags: ['#coach', '#giaovien', '#kinhdoanh', '#scale', '#online'],
      broll_ideas: ['Close-up bạn nói', 'Cảnh dạy 1-1 vs lớp đông', 'Screenshot doanh thu', 'Notion dashboard'],
      thumbnail_idea: `Split screen: "TRƯỚC: 12h/ngày 20tr" vs "SAU: 6h/ngày 80tr" + ảnh bạn cười tự tin`
    };
  }
  const audienceShort = 'giáo viên/coach Việt Nam đang dạy 1-1';
  return {
    hook: plan.hook || 'Stop trading hours for income.',
    outline: [
      '0:00-0:30 · Cold open: hook + lời hứa video',
      `0:30-2:00 · Vấn đề ${audienceShort} đang mắc`,
      '2:00-6:00 · Framework 3 tầng offer ladder (Starter / Growth / Premium)',
      '6:00-9:00 · Case study: tôi đã từ 1-1 lên lớp 15 người',
      '9:00-11:00 · 3 sai lầm thường gặp + cách tránh',
      '11:00-13:00 · Action plan 7 ngày bắt đầu',
      '13:00-14:00 · CTA + link booking call'
    ],
    script: `[INTRO 0:00-0:30]\n${plan.hook}\n\nNếu bạn là ${audienceShort}, video này có thể tiết kiệm cho bạn 2 năm thử-sai.\n\n[VẤN ĐỀ 0:30-2:00]\nĐa số ${audienceShort} mắc kẹt vì 3 lý do:\n1. Bán thời gian, không bán transformation\n2. Không có offer ladder rõ ràng\n3. Content vu vơ, không funnel\n\n[FRAMEWORK 2:00-6:00]\nGiải pháp: Offer Ladder 3 tầng — Starter 8M, Growth 15M, Premium 25M VND...\n\n[CASE STUDY 6:00-9:00]\nTôi đã chuyển từ 1-1 sang lớp 15 người trong 8 tuần. Doanh thu x4 — từ 20tr lên 80tr/tháng...\n\n[MISTAKES 9:00-11:00]\n3 sai lầm bạn cần tránh: định giá quá rẻ, không có pipeline, dạy mọi thứ thay vì 1 outcome cụ thể.\n\n[ACTION 11:00-13:00]\n7 ngày tới: Day 1-2 viết offer · Day 3-4 quay 5 videos · Day 5-6 setup Calendly · Day 7 launch.\n\n[CTA 13:00-14:00]\n${plan.cta}`,
    cta: plan.cta || 'Book a free 15-min call ở link mô tả — tôi sẽ map offer ladder cho bạn.',
    hashtags: ['#consulting', '#coaching', '#scaleup', '#vietnam'],
    broll_ideas: ['Whiteboard vẽ framework', 'Screen recording Notion', 'Cảnh teach trên Zoom', 'Cảnh đếm doanh thu'],
    thumbnail_idea: `Bạn pointing vào "0 → $10K/mo" — face camera, bold yellow text, dark BG`
  };
}
