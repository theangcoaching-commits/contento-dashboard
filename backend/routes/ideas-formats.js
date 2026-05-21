/* Routes for my-ideas + format library + bookmarklet ingest */

import { Router } from 'express';
import { stmts } from '../db.js';
import { breakdownUrl } from '../services/breakdown.js';

const r = Router();
const nowIso = () => new Date().toISOString();
const newId = (p='id_') => p + Math.random().toString(36).slice(2, 10);

// -------- MY IDEAS --------
r.get('/my-ideas', (req, res) => {
  const rows = req.query.status ? stmts.myIdeasByStatus.all(req.query.status) : stmts.allMyIdeas.all();
  res.json(rows.map(formatIdea));
});

// Detect kind of Google/Notion/Figma URL
function detectDocsKind(url) {
  if (!url) return '';
  if (/docs\.google\.com\/document/i.test(url)) return 'doc';
  if (/docs\.google\.com\/spreadsheets/i.test(url)) return 'sheet';
  if (/docs\.google\.com\/presentation/i.test(url)) return 'slide';
  if (/figma\.com/i.test(url)) return 'figma';
  if (/notion\.so|notion\.site/i.test(url)) return 'notion';
  return 'other';
}

r.post('/my-ideas', (req, res) => {
  const b = req.body || {};
  const id = newId('mi_');
  const docsUrl = b.docs_url || '';
  stmts.insertMyIdea.run({
    id,
    title:         b.title || '(untitled)',
    description:   b.description || '',
    source_url:    b.source_url || '',
    source_thumb:  b.source_thumb || '',
    source_author: b.source_author || '',
    platform:      b.platform || 'youtube',
    format:        b.format || '',
    hook:          b.hook || '',
    why_works:     b.why_works || '',
    tags:          JSON.stringify(b.tags || []),
    status:        b.status || 'idea',
    scheduled_id:  null,
    docs_url:      docsUrl,
    docs_kind:     b.docs_kind || detectDocsKind(docsUrl),
    created_at:    nowIso(),
    updated_at:    nowIso()
  });
  res.json({ id, ok: true });
});

r.put('/my-ideas/:id', (req, res) => {
  const b = req.body || {};
  const existing = stmts.allMyIdeas.all().find(x => x.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const docsUrl = b.docs_url ?? existing.docs_url;
  stmts.updateMyIdea.run({
    id:           req.params.id,
    title:        b.title        ?? existing.title,
    description:  b.description  ?? existing.description,
    platform:     b.platform     ?? existing.platform,
    format:       b.format       ?? existing.format,
    hook:         b.hook         ?? existing.hook,
    why_works:    b.why_works    ?? existing.why_works,
    tags:         typeof b.tags === 'string' ? b.tags :
                  (b.tags ? JSON.stringify(b.tags) : existing.tags),
    status:       b.status       ?? existing.status,
    docs_url:     docsUrl,
    docs_kind:    b.docs_kind    ?? detectDocsKind(docsUrl),
    scheduled_id: b.scheduled_id ?? null,
    updated_at:   nowIso()
  });
  res.json({ ok: true });
});

r.delete('/my-ideas/:id', (req, res) => {
  stmts.deleteMyIdea.run(req.params.id);
  res.json({ ok: true });
});

// Convert an idea into a scheduled content_plan item
r.post('/my-ideas/:id/schedule', (req, res) => {
  const idea = stmts.allMyIdeas.all().find(x => x.id === req.params.id);
  if (!idea) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const cpId = newId('cp_');
  stmts.insertContentPlan.run({
    id: cpId,
    date:     b.date || new Date().toISOString().slice(0,10),
    time:     b.time || '12:00',
    platform: idea.platform,
    format:   idea.format,
    title:    idea.title,
    hook:     idea.hook,
    outline:  JSON.stringify(idea.why_works ? [`Why this works: ${idea.why_works}`] : []),
    script:   idea.description || '',
    cta:      b.cta || '',
    target_views: b.target_views || 0,
    target_leads: b.target_leads || 0,
    status: 'idea',
    week_idx: null,
    repeat_group_id: null,
    repeat_rule: null,
    campaign_id: null,
    series_id: null,
    created_at: nowIso(),
    updated_at: nowIso()
  });
  stmts.updateMyIdea.run({
    id: idea.id,
    title: idea.title,
    description: idea.description,
    platform: idea.platform,
    format: idea.format,
    hook: idea.hook,
    why_works: idea.why_works,
    tags: idea.tags,
    status: 'scheduled',
    docs_url: idea.docs_url || '',
    docs_kind: idea.docs_kind || '',
    scheduled_id: cpId,
    updated_at: nowIso()
  });
  res.json({ ok: true, content_plan_id: cpId });
});

// -------- URL BREAKDOWN (AI dissect a creator's video) --------
r.post('/ideas/breakdown', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await breakdownUrl(url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save a breakdown directly as a my_ideas entry
r.post('/ideas/breakdown/save', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const a = await breakdownUrl(url);
    const id = newId('mi_');
    stmts.insertMyIdea.run({
      id,
      title:        a.title || '(saved video)',
      description:  a.why_works || '',
      source_url:   a.url,
      source_thumb: a.thumbnail || '',
      source_author: a.author || '',
      platform:     a.platform,
      format:       a.detected_format || '',
      hook:         a.hook_pattern || '',
      why_works:    a.why_works || '',
      tags:         JSON.stringify(['breakdown', 'study']),
      status:       'idea',
      scheduled_id: null,
      docs_url:     '',
      docs_kind:    '',
      created_at:   nowIso(),
      updated_at:   nowIso()
    });
    res.json({ ok: true, id, breakdown: a });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------- BOOKMARKLET INGEST --------
// One-shot endpoint that saves an idea from a YouTube/TikTok/Instagram URL.
// The bookmarklet POSTs { url, title, thumbnail, author, platform }.
r.post('/ideas/ingest', (req, res) => {
  const b = req.body || {};
  if (!b.url && !b.title) return res.status(400).json({ error: 'url or title required' });

  const platform = detectPlatform(b.url || '');
  const id = newId('mi_');
  stmts.insertMyIdea.run({
    id,
    title:        b.title || '(saved from ' + platform + ')',
    description:  b.description || `Saved ${platform} reference. Watch + dissect: hook, pacing, CTA, why it works.`,
    source_url:   b.url || '',
    source_thumb: b.thumbnail || '',
    source_author: b.author || '',
    platform,
    format: '',
    hook: '',
    why_works: '',
    tags: JSON.stringify(['saved', 'study']),
    status: 'idea',
    scheduled_id: null,
    docs_url: '',
    docs_kind: '',
    created_at: nowIso(),
    updated_at: nowIso()
  });
  res.json({ ok: true, id });
});

// -------- FORMAT LIBRARY --------
r.get('/formats', (req, res) => {
  const rows = req.query.platform
    ? stmts.formatsByPlatform.all(req.query.platform)
    : stmts.allFormats.all();
  res.json(rows.map(formatFormat));
});

r.post('/formats', (req, res) => {
  const b = req.body || {};
  const id = newId('fmt_');
  stmts.insertFormat.run({
    id,
    name: b.name || 'Untitled format',
    platform: b.platform || 'youtube',
    category: b.category || 'mine',
    description: b.description || '',
    structure: typeof b.structure === 'string' ? b.structure : JSON.stringify(b.structure || {}),
    best_for: b.best_for || 'awareness',
    avg_views: Number(b.avg_views || 0),
    win_rate: Number(b.win_rate || 0),
    examples: typeof b.examples === 'string' ? b.examples : JSON.stringify(b.examples || []),
    notes: b.notes || '',
    created_at: nowIso()
  });
  res.json({ id, ok: true });
});

r.delete('/formats/:id', (req, res) => {
  stmts.deleteFormat.run(req.params.id);
  res.json({ ok: true });
});

// AI suggests winning formats for the user given their niche + goal + competitors
r.post('/formats/suggest', async (req, res) => {
  const profile = stmts.getProfile.get() || {};
  // Lightweight default suggestions (no AI key needed)
  const suggestions = defaultFormatSuggestions(profile);
  // Persist them so user sees them in Strategy view
  for (const s of suggestions) {
    stmts.insertFormat.run({
      id: newId('fmt_'),
      name: s.name,
      platform: s.platform,
      category: 'ai',
      description: s.description,
      structure: JSON.stringify(s.structure),
      best_for: s.best_for,
      avg_views: s.avg_views,
      win_rate: s.win_rate,
      examples: JSON.stringify(s.examples),
      notes: s.notes || '',
      created_at: nowIso()
    });
  }
  res.json({ ok: true, count: suggestions.length });
});

function detectPlatform(url) {
  if (/youtu\.?be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  if (/instagram\.com/i.test(url)) return 'instagram';
  return 'youtube';
}

function formatIdea(r) {
  return {
    id: r.id, title: r.title, description: r.description,
    source_url: r.source_url, source_thumb: r.source_thumb, source_author: r.source_author,
    platform: r.platform, format: r.format, hook: r.hook, why_works: r.why_works,
    tags: safeJson(r.tags) || [], status: r.status, scheduled_id: r.scheduled_id,
    docs_url: r.docs_url || '', docs_kind: r.docs_kind || '',
    created_at: r.created_at, updated_at: r.updated_at
  };
}
function formatFormat(r) {
  return {
    id: r.id, name: r.name, platform: r.platform, category: r.category,
    description: r.description, structure: safeJson(r.structure) || {},
    best_for: r.best_for, avg_views: r.avg_views, win_rate: r.win_rate,
    examples: safeJson(r.examples) || [], notes: r.notes, created_at: r.created_at
  };
}
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function defaultFormatSuggestions(profile) {
  // Prioritize the 4 lead-driving formats per ANG niche:
  // Coaching · Knowledge · Vlog · POV
  return [
    // 1. COACHING STYLE (BOFU trust)
    {
      name: 'Coaching · client breakthrough',
      platform: 'youtube',
      best_for: 'trust',
      description: 'Walk through a real client problem live — diagnose, prescribe, project the outcome. Audience watches and says "I want her to coach me". Highest conversion-to-DM format for ANG niche.',
      structure: {
        hook: 'My student went from 20tr to 80tr/tháng in 8 weeks. Here\'s exactly how.',
        beats: [
          '0:00-0:30 Hook · the before/after number',
          '0:30-2:00 Meet the student (consented) — situation, struggle',
          '2:00-4:00 Step 1 — the diagnosis (what was broken)',
          '4:00-7:00 Step 2 — the framework I prescribed (Offer Ladder)',
          '7:00-10:00 Step 3 — execution + results week by week',
          '10:00-12:00 Lessons for the audience watching',
          '12:00-13:00 CTA — "Want this for yourself? Free 15-min audit call below"'
        ],
        cta_pattern: 'Book a free 15-min audit call · link in description'
      },
      avg_views: 18000, win_rate: 0.42,
      examples: ['https://youtube.com/@alexhormozi', 'https://youtube.com/@imangadzhi'],
      notes: 'HIGHEST CONVERSION format — every video should end with at least one signed call. Get consent + record on Zoom + cut into a story arc.'
    },
    {
      name: 'Coaching · 60s mini diagnosis (TT)',
      platform: 'tiktok',
      best_for: 'trust',
      description: 'Short coaching reactions — "Send me your offer, I\'ll roast it in 60s". Builds parasocial trust + funnels DMs from people wanting their own review.',
      structure: {
        hook: 'A coach DM\'d me her offer. Here\'s exactly what\'s wrong.',
        beats: [
          '0-3s Hook + show DM screenshot',
          '3-25s Read aloud + identify 1-2 critical issues',
          '25-50s My fix + framework',
          '50-60s "Want yours roasted? Comment ROAST + DM your offer"'
        ],
        cta_pattern: 'Comment ROAST + DM your offer'
      },
      avg_views: 35000, win_rate: 0.31,
      examples: ['https://tiktok.com/@alexhormozi', 'https://tiktok.com/@vietphong.coach'],
      notes: 'You become known as "the offer doctor". DMs explode after the first viral one.'
    },

    // 2. GIVE KNOWLEDGE (TOFU/MOFU education)
    {
      name: 'Give knowledge · framework breakdown (YT)',
      platform: 'youtube',
      best_for: 'awareness',
      description: '10-14 min teaching a single framework end-to-end. Saves + shares stack up. Best for cold YouTube audience finding you via search.',
      structure: {
        hook: 'Stop trading hours for income. Use this 3-tier offer ladder instead.',
        beats: [
          '0:00-0:30 Cold open · contrarian claim',
          '0:30-2:00 The problem + why most people fail',
          '2:00-6:00 The 3-tier offer ladder · explain each',
          '6:00-9:00 Case study · how I used it',
          '9:00-11:00 Common mistakes + how to avoid',
          '11:00-13:00 7-day action plan',
          '13:00-14:00 CTA → free template'
        ],
        cta_pattern: 'Free template in description · email-gated'
      },
      avg_views: 12000, win_rate: 0.38,
      examples: ['https://youtube.com/@imangadzhi'],
      notes: 'Best long-term play. These keep getting views 6 months later.'
    },
    {
      name: 'Give knowledge · 60s framework (TT)',
      platform: 'tiktok',
      best_for: 'awareness',
      description: '60s educational hit — 3-5 framework in a numbered list. Algorithmically rewarded (save + share).',
      structure: {
        hook: '3 sai lầm khiến bạn dạy 12h/ngày mà chỉ kiếm 20tr.',
        beats: [
          '0-3s Hook · pain point',
          '3-15s Mistake #1 + fix',
          '15-30s Mistake #2 + fix',
          '30-45s Mistake #3 + fix',
          '45-60s Summary + CTA'
        ],
        cta_pattern: 'Save this + follow for the full system'
      },
      avg_views: 28000, win_rate: 0.22,
      examples: ['https://tiktok.com/@alexhormozi'],
      notes: 'Batch 5 of these in one filming session. Re-cut into Reels too.'
    },

    // 3. VLOG (connection)
    {
      name: 'Vlog · day in the life ($20K/mo coach)',
      platform: 'youtube',
      best_for: 'trust',
      description: 'Cinematic 8-12 min day-in-the-life. Audience falls in love with the lifestyle → they want IN. Soft pitch CTA.',
      structure: {
        hook: 'A day building a $20K/mo coaching business in Vietnam.',
        beats: [
          '6am · Morning routine + journal',
          '8am · Deep work content block',
          '10am · Coaching call (blurred client face)',
          '12pm · Lunch + reading',
          '2pm · Strategy / Notion review',
          '5pm · Family time',
          '8pm · Reflection + plan tomorrow',
          'End · Soft CTA — "Want my system? Link in description"'
        ],
        cta_pattern: 'Soft pitch · download free guide'
      },
      avg_views: 22000, win_rate: 0.28,
      examples: ['https://youtube.com/@roasbrez', 'https://youtube.com/@aliabdaal'],
      notes: 'You said your hero video = "vlog my day, tạo sự kết nối". THIS is your format. Use it weekly.'
    },
    {
      name: 'Vlog · BTS quick clip (TT)',
      platform: 'tiktok',
      best_for: 'trust',
      description: 'Cut a vlog into 45s "moment" — coaching session reveal, before-call ritual, post-win celebration. Builds parasocial fast.',
      structure: {
        hook: 'POV: my student just made her first $5K.',
        beats: [
          '0-3s Setup · me reading the message',
          '3-30s My reaction + her backstory in 30s',
          '30-45s Voiceover lesson + CTA'
        ],
        cta_pattern: 'Follow to see how I help her hit $10K next'
      },
      avg_views: 45000, win_rate: 0.18,
      examples: ['https://tiktok.com/@imangadzhi'],
      notes: 'Highest follower-gain format. Use the same clip across YT Shorts + Reels.'
    },

    // 4. POV (viral awareness)
    {
      name: 'POV · before vs after pivot',
      platform: 'tiktok',
      best_for: 'awareness',
      description: 'POV format with split-screen / time-jump showing your transformation. Highest viral potential for cold audience.',
      structure: {
        hook: 'POV: bạn vừa từ 1-1 chuyển sang lớp 15 người.',
        beats: [
          '0-2s Visual hook · clock 12h work',
          '2-15s Before montage · grind, tired',
          '15-30s The flip · key decision',
          '30-45s After · group teach, calm, bigger numbers',
          '45-60s Lesson + CTA'
        ],
        cta_pattern: 'Comment "HỆ THỐNG" to receive the framework template'
      },
      avg_views: 80000, win_rate: 0.20,
      examples: ['https://tiktok.com/@vietphong.coach', 'https://tiktok.com/@imangadzhi'],
      notes: 'Plan 3-4 of these per week. Pair audio with trending sound.'
    },
    {
      name: 'POV · day 1 vs day 100',
      platform: 'instagram',
      best_for: 'awareness',
      description: 'Reel · before / after with student growth. Triggers identification + saves.',
      structure: {
        hook: 'POV: day 1 vs day 100 of changing how you teach.',
        beats: [
          'Slide 1 · day 1 chaos',
          'Slide 2 · the system installed',
          'Slide 3 · day 100 transformation'
        ],
        cta_pattern: 'Save + DM "ANG" để xem chương trình full'
      },
      avg_views: 25000, win_rate: 0.16,
      examples: [],
      notes: 'Cross-post from TT POV. Add a carousel companion for save retention.'
    },

    // Supplementary
    {
      name: 'Carousel · 10-slide save magnet (IG)',
      platform: 'instagram',
      best_for: 'trust',
      description: 'Educational carousel — high save rate feeds retargeting pixel.',
      structure: {
        hook: '10 questions to know if you should quit teaching 1-on-1',
        beats: [
          'Slide 1: Bold question hook',
          'Slide 2-9: One question per slide',
          'Slide 10: CTA "Save + DM SCALE"'
        ],
        cta_pattern: 'Save + DM keyword'
      },
      avg_views: 12000, win_rate: 0.12,
      examples: ['https://instagram.com/@aliabdaal'],
      notes: 'Batch 4/week using a Canva template.'
    }
  ];
}

// Override the old function reference below
function _legacy_defaultFormatSuggestions(profile) {
  return [
    {
      name: 'POV: Before vs After my pivot',
      platform: 'tiktok',
      best_for: 'awareness',
      description: 'Split-screen story format showing your old life (1-on-1 grind) vs new life (group coaching). Hook: "POV: bạn vừa…"',
      structure: {
        hook: 'POV: bạn vừa quyết định không dạy 1-1 nữa.',
        beats: [
          '0-2s · Visual: clock showing 12h work day',
          '2-15s · Quick cuts of grind (whiteboard, tired face)',
          '15-30s · Flip: new aesthetic, lớp 15 người, doanh thu tăng',
          '30-45s · One-line lesson',
          '45-60s · CTA "Comment HỆ THỐNG để nhận template"'
        ],
        cta_pattern: 'Comment {{keyword}} để nhận {{lead_magnet}}'
      },
      avg_views: 50000, win_rate: 0.18,
      examples: ['https://tiktok.com/@vietphong.coach', 'https://tiktok.com/@imangadzhi'],
      notes: 'Works for ANG niche — Vietnamese coaches love before/after transformations.'
    },
    {
      name: 'Frameworks Breakdown (YT long)',
      platform: 'youtube',
      best_for: 'trust',
      description: '10-12 phút phân tích chi tiết 1 framework (Offer Ladder, Funnel 3 tầng…). Lên kệ retention cao, dùng cho remarketing.',
      structure: {
        hook: 'Stop trading hours for income.',
        beats: [
          '0:00-0:30 Cold open — câu hỏi đắt',
          '0:30-2:00 Vấn đề audience đang mắc',
          '2:00-6:00 Framework 3-step',
          '6:00-9:00 Case study cá nhân',
          '9:00-11:00 Sai lầm thường gặp',
          '11:00-13:00 Action plan 7 ngày',
          '13:00-14:00 CTA — link booking call'
        ],
        cta_pattern: 'Book a 15-min call → mô tả'
      },
      avg_views: 8000, win_rate: 0.32,
      examples: ['https://youtube.com/@imangadzhi', 'https://youtube.com/@alexhormozi'],
      notes: 'Highest converting format for YT long-form in coaching niche.'
    },
    {
      name: '3 sai lầm — Talking head 60s',
      platform: 'tiktok',
      best_for: 'awareness',
      description: 'Hook + 3 sai lầm + 1 fix. Mỗi sai lầm 10-15s, total 45-60s. Sharp camera cuts.',
      structure: {
        hook: 'Nếu bạn vẫn dạy 1-1, video này dành cho bạn.',
        beats: [
          '0-3s Hook',
          '3-18s Sai lầm #1 (bán giờ thay vì transformation)',
          '18-33s Sai lầm #2 (không có offer ladder)',
          '33-48s Sai lầm #3 (content vu vơ)',
          '48-60s Fix + CTA'
        ],
        cta_pattern: 'Link bio · Free template'
      },
      avg_views: 25000, win_rate: 0.15,
      examples: ['https://tiktok.com/@alexhormozi'],
      notes: 'Easy to batch-shoot 5 of these in one session.'
    },
    {
      name: 'Day in the life — vlog aesthetic',
      platform: 'youtube',
      best_for: 'trust',
      description: 'Cinematic vlog 8-12 phút theo style RoasBrez. Build kết nối + mở rộng audience.',
      structure: {
        hook: 'A day building a $20K/mo coaching business in Vietnam.',
        beats: [
          '0:00 Morning routine, coffee, journal',
          '2:00 Deep work block — content creation',
          '4:00 Coaching call với học viên (blurred)',
          '6:00 Lunch + reading break',
          '8:00 Strategy work — Notion, KPI review',
          '10:00 Evening reflection + plan tomorrow',
          '12:00 CTA — "Want my routine? Free guide in description"'
        ],
        cta_pattern: 'Soft pitch · download lead magnet'
      },
      avg_views: 15000, win_rate: 0.22,
      examples: ['https://youtube.com/@roasbrez', 'https://youtube.com/@aliabdaal'],
      notes: 'You said hero video = "vlog my day, tạo sự kết nối". This IS your format.'
    },
    {
      name: 'Carousel · 10-slide save magnet (IG)',
      platform: 'instagram',
      best_for: 'trust',
      description: 'Educational carousel 10 slide — high save rate cho retargeting pixel.',
      structure: {
        hook: '10 questions to know if you should quit teaching 1-on-1',
        beats: [
          'Slide 1: Bold question hook',
          'Slide 2-9: One question per slide, illustrated',
          'Slide 10: CTA "Save this + DM SCALE"'
        ],
        cta_pattern: 'Save + DM keyword'
      },
      avg_views: 12000, win_rate: 0.10,
      examples: ['https://instagram.com/@aliabdaal'],
      notes: 'Use Canva template. Batch 4/week.'
    },
    {
      name: 'Reaction · stitch on viral mistake',
      platform: 'tiktok',
      best_for: 'awareness',
      description: 'Stitch trên video viral của coach khác đang dạy SAI cách. Hot take.',
      structure: {
        hook: 'Đừng làm thế này nếu bạn muốn 50K followers.',
        beats: [
          '0-3s Stitch clip',
          '3-30s Phân tích tại sao sai',
          '30-50s Cách đúng',
          '50-60s CTA'
        ],
        cta_pattern: 'Comment opinion + follow for more'
      },
      avg_views: 80000, win_rate: 0.25,
      examples: [],
      notes: 'Riskier — chọn target không phải mentor của bạn.'
    }
  ];
}

export default r;
