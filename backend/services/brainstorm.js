/* Brainstormer · 5+ specific video ideas given format / platform / funnel stage.
   AI version uses Claude with prompt caching. Falls back to niche-aware templates. */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM = `You are Contento Brainstormer · senior content strategist who has produced viral content for $100K/mo founders.
Output STRICT JSON only.
Rules:
- Every idea must have a 7-word HOOK and a video TITLE
- Match the funnel stage: TOFU = scroll-stoppers, MOFU = trust-builders, BOFU = conversion-drivers
- Use the creator's niche concretely (no generic platitudes)
- Vietnamese hooks if profile niche references Vietnamese audience`;

export async function generateBrainstorm({ platform, format, stage, count = 5, profile = {} }) {
  const c = getClient();
  if (!c) return fallbackIdeas({ platform, format, stage, count, profile });

  const msg = `Generate ${count} specific video ideas.

Creator: ${profile.name || 'ANG Consulting'}
Niche: ${profile.niche || 'Coach Việt — giúp giáo viên scale 0 → $10K/mo'}
Audience: ${profile.audience || 'Giáo viên/coach VN, dạy 1-1, muốn scale'}

Constraints:
- Platform: ${platform}
- Format: ${format}
- Funnel stage: ${stage.toUpperCase()}

Return JSON only:
{
  "ideas": [
    {
      "title": "video title (10-12 words)",
      "hook": "the first 7 words spoken on camera",
      "outline": ["beat 1", "beat 2", "beat 3"],
      "cta": "specific call to action",
      "why_works": "1 sentence on why this hits"
    }
  ]
}`;

  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 2200,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: msg }]
    });
    const text = res.content.map(c => c.text || '').join('\n');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON');
    const json = JSON.parse(m[0]);
    return (json.ideas || []).slice(0, count);
  } catch (err) {
    console.error('[brainstorm] AI failed:', err.message);
    return fallbackIdeas({ platform, format, stage, count, profile });
  }
}

function fallbackIdeas({ platform, format, stage, count, profile }) {
  const niche = profile.niche || 'giáo viên Việt Nam';
  const audience = profile.audience || 'giáo viên đang dạy 1-1';

  const BANK = {
    tofu_pov: [
      { title: 'POV: bạn vừa nghỉ dạy 1-1 sau 10 năm', hook: 'Tôi vừa nghỉ dạy 1-1 sau 10 năm.', outline: ['0-2s · clock 12h grind', '2-15s · tired before montage', '15-30s · the decision moment', '30-45s · group teach now', '45-60s · lesson + CTA'], cta: 'Comment "ONLINE" để nhận template chuyển đổi.', why_works: 'Pattern interrupt + identity shift signals to the audience.' },
      { title: 'POV: học viên thứ 15 vừa đăng ký lớp group', hook: 'Học viên thứ 15 vừa đăng ký group của tôi.', outline: ['Hook · message popup', 'Before · giảng 1-1 mệt mỏi', 'After · lớp đông sống động', 'CTA'], cta: 'Link bio để xem hệ thống của tôi.', why_works: 'Social proof + curiosity gap.' },
      { title: 'POV: ngày đầu chuyển sang dạy online full-time', hook: 'Ngày đầu tôi chuyển sang dạy online toàn thời gian.', outline: ['Hook · suitcase + laptop', 'Doubt', 'Result', 'Lesson'], cta: 'Save + follow để xem journey.', why_works: 'Narrative hook with relatable fear.' },
      { title: 'POV: bạn vừa từ chối học viên 200K/tháng', hook: 'Tôi vừa từ chối học viên 200K/tháng. Lý do…', outline: ['Hook · phone DM', 'Old me would say yes', 'Why no now', 'New offer reveal'], cta: 'Comment "OFFER" để xem ladder mới.', why_works: 'Counter-intuitive · stops the scroll cold.' },
      { title: 'POV: bạn vừa nâng giá khóa từ 2tr lên 25tr', hook: 'Tôi nâng giá khóa từ 2tr lên 25tr — đây là kết quả.', outline: ['Hook · price tag flip', 'Risk', 'Reframing value', 'Outcome'], cta: 'DM "GIÁ" để mình share framework.', why_works: 'Money curiosity + framework promise.' },
      { title: 'POV: 7 ngày trước launch khóa coaching đầu tiên', hook: 'Còn 7 ngày trước launch khóa coaching đầu tiên.', outline: ['Day -7 prep', 'Day -3 panic', 'Day -1 calm', 'Launch day'], cta: 'Follow để xem launch sống.', why_works: 'Anticipation + behind the scenes.' }
    ],
    tofu_reaction: [
      { title: 'Phản ứng với 1 coach Việt thu 1 tỷ/tháng', hook: 'Coach Việt này thu 1 tỷ/tháng. Đây là sai lầm.', outline: ['Stitch clip', 'Identify what is broken', 'My fix', 'CTA'], cta: 'Comment opinion + follow for more.', why_works: 'High-attention stitch + contrarian take.' },
      { title: 'Phân tích offer 199K của 1 giáo viên IELTS', hook: 'Giáo viên IELTS đang bán khóa 199K. Sai lầm chí mạng.', outline: ['Show offer screenshot', 'Why it fails', 'Better positioning', 'CTA'], cta: 'DM "OFFER" mình roast cho.', why_works: 'Offer roast is a TT staple — drives DMs.' },
      { title: 'Stitch: tại sao 99% coach Việt thất bại trong 6 tháng', hook: '99% coach Việt thất bại trong 6 tháng vì 1 lý do.', outline: ['Stitch original', 'My counter-truth', 'Story', 'CTA'], cta: 'Save this video.', why_works: 'High-emotion contrarian claim.' },
      { title: 'Tôi xem 10 video viral của coach VN và thấy điều này', hook: 'Tôi xem 10 video viral của coach VN. Đây là pattern.', outline: ['Hook montage', 'Pattern reveal', 'Demo on my account', 'CTA'], cta: 'Follow for the full breakdown.', why_works: 'Research authority + meta angle.' },
      { title: 'Phân tích vì sao kênh tiếng Anh tôi đang chuyển hướng', hook: 'Tôi đang chuyển kênh tiếng Anh sang coach. Vì sao?', outline: ['Old strategy', 'Why pivot', 'New positioning', 'CTA'], cta: 'Follow to see the pivot live.', why_works: 'Personal pivot story creates investment.' }
    ],
    tofu_talkinghead: [
      { title: '3 sai lầm giáo viên 20tr/tháng đang mắc', hook: '3 sai lầm khiến giáo viên kẹt ở 20tr mãi.', outline: ['Hook · pain', 'Mistake #1', 'Mistake #2', 'Mistake #3', 'Fix + CTA'], cta: 'Save + DM "FIX" để mình audit miễn phí.', why_works: 'Numbered listicle saves well + algo boost.' },
      { title: '5 dấu hiệu bạn đang dạy SAI cách', hook: '5 dấu hiệu bạn đang dạy 1-1 sai cách.', outline: ['Each sign with example', 'Total summary'], cta: 'Comment "DẠY" để nhận check-list.', why_works: 'Self-diagnosis hook → high comment rate.' },
      { title: 'Đừng dạy nhiều môn — tập trung 1 ngách', hook: 'Đừng dạy nhiều môn. Đây là lý do.', outline: ['Story · my mistake', 'Math · 1 niche x premium', 'Action'], cta: 'DM "NGÁCH" để giúp bạn chọn.', why_works: 'Contrarian advice that targets the niche-pivot pain.' }
    ],
    mofu_coaching: [
      { title: 'Cách 1 cô giáo IELTS từ 20tr lên 80tr trong 8 tuần', hook: 'Cô giáo IELTS từ 20tr lên 80tr trong 8 tuần.', outline: ['Intro học viên (consented)', 'Where she was', 'Step 1 · diagnosis', 'Step 2 · offer ladder', 'Step 3 · execution', 'Result + CTA'], cta: 'Book free 15-min call · link bio.', why_works: 'Specific result → high MOFU-to-DM conversion.' },
      { title: 'Coach 1-1 với 1 giáo viên live — kết quả 2 tuần sau', hook: 'Coach live 1 giáo viên Anh. Đây là kết quả.', outline: ['Session 1 reveal', 'Action taken', 'Week 2 result'], cta: 'Comment "1-1" để mình audit kênh bạn.', why_works: 'Live coaching builds parasocial trust fast.' },
      { title: 'Tôi audit kênh giáo viên 500 followers — fix 3 thứ', hook: 'Tôi audit kênh 500 followers — fix 3 thứ.', outline: ['Audit checklist on screen', 'Fix #1 hook', 'Fix #2 niche', 'Fix #3 CTA'], cta: 'DM "AUDIT" để mình audit kênh bạn.', why_works: 'Demo of expertise + lead magnet.' }
    ],
    mofu_vlog: [
      { title: 'Day in life — coach $20K/mo ở Sài Gòn', hook: 'Một ngày của coach $20K/mo ở Sài Gòn.', outline: ['Morning routine', 'Deep work', 'Coaching session (blurred)', 'Reading', 'Evening'], cta: 'Follow để xem hệ thống của tôi.', why_works: 'Lifestyle aspiration → audience wants in.' },
      { title: 'Ngày tôi quay 5 video TikTok trong 2 tiếng', hook: 'Một ngày tôi quay 5 video TikTok trong 2 tiếng.', outline: ['Setup', 'Batch script', 'Film', 'Edit on phone', 'Schedule'], cta: 'Save + DM "BATCH" để xem template.', why_works: 'Process transparency builds trust + actionable.' },
      { title: 'Behind the scenes 1 buổi coaching group', hook: 'Behind the scenes 1 buổi coaching 15 người.', outline: ['Prep', 'Energy of room', 'Breakout activity', 'Wrap'], cta: 'Comment "GROUP" để xem cách run.', why_works: 'Group dynamic curiosity for solo teachers.' }
    ],
    mofu_tutorial: [
      { title: '60s · cách viết offer 25tr không phải bán nhồi', hook: '60s · viết offer 25tr không cần bán nhồi.', outline: ['Hook', 'The 3 elements', 'Apply on screen', 'Result'], cta: 'Save + comment "OFFER" để nhận template.', why_works: 'High-save format · TT loves quick frameworks.' }
    ],
    bofu_testimonial: [
      { title: 'Học viên Mai · từ giáo viên 15tr → coach 80tr/tháng', hook: 'Học viên Mai từ 15tr lên 80tr/tháng.', outline: ['Hook · before metric', 'Her story', 'What we did', 'Current metric', 'Her testimonial'], cta: 'Book a call to be next · link bio.', why_works: 'Specific named transformation drives bookings.' },
      { title: 'Trước & sau · 3 học viên trong 8 tuần', hook: 'Trước & sau · 3 học viên trong 8 tuần.', outline: ['Student A · result', 'Student B · result', 'Student C · result', 'Common factor'], cta: 'Apply · last 5 spots this cohort.', why_works: 'Volume of proof + scarcity.' }
    ],
    bofu_offer: [
      { title: 'Tại sao tôi tính 25tr cho 8 tuần — đáng không?', hook: '25tr cho 8 tuần coaching. Đáng không?', outline: ['Math · what student earns back', 'What is included', 'Risk reversal', 'Limited slots'], cta: 'Book 15-min call để xem có hợp không.', why_works: 'Direct objection-handling drives qualified DMs.' },
      { title: 'Mở 5 slot cuối · Growth program tháng này', hook: 'Mở 5 slot cuối · Growth program tháng này.', outline: ['What program does', 'Who it is for', 'Who it is NOT for', 'How to apply'], cta: 'DM "GROWTH" để giữ slot.', why_works: 'Scarcity + qualifier = high-intent DMs.' }
    ]
  };

  // Compose lookup key
  const stageKey = (stage || 'tofu').toLowerCase();
  const formatKey = (() => {
    const f = (format || '').toLowerCase();
    if (f.includes('pov')) return 'pov';
    if (f.includes('reaction')) return 'reaction';
    if (f.includes('coaching')) return 'coaching';
    if (f.includes('vlog')) return 'vlog';
    if (f.includes('tutorial')) return 'tutorial';
    if (f.includes('testimonial')) return 'testimonial';
    if (f.includes('offer') || f.includes('breakdown') && stageKey === 'bofu') return 'offer';
    return 'talkinghead';
  })();

  const key = stageKey + '_' + formatKey;
  let pool = BANK[key];
  if (!pool || pool.length === 0) {
    // Try stage match only
    const stageMatch = Object.keys(BANK).find(k => k.startsWith(stageKey + '_'));
    pool = stageMatch ? BANK[stageMatch] : BANK.tofu_pov;
  }
  return pool.slice(0, count);
}
