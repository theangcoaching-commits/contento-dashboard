/* Campaigns — long-running themed content series
   E.g. "Help 5 strangers earn 30M VND in 30 days"
   - Has 4 phases (Search → Interview → Make money → Achievement)
   - Daily content cadence (1 YT + 2 TT default)
   - Materialize creates 30+ content_plan items */

import { Router } from 'express';
import { stmts } from '../db.js';

const r = Router();
const nowIso = () => new Date().toISOString();
const newId = (p = 'cmp_') => p + Math.random().toString(36).slice(2, 10);

// ---------- LIST ----------
r.get('/campaigns', (req, res) => {
  const list = stmts.allCampaigns.all().map(formatCampaign);
  res.json(list);
});

r.get('/campaigns/:id', (req, res) => {
  const c = stmts.getCampaign.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const phases = stmts.phasesByCampaign.all(c.id).map(formatPhase);
  const stats  = stmts.campaignStats.get(c.id);
  res.json({ ...formatCampaign(c), phases, stats });
});

// ---------- CREATE ----------
r.post('/campaigns', (req, res) => {
  const b = req.body || {};
  const id = newId();
  const now = nowIso();
  stmts.insertCampaign.run({
    id,
    name: b.name || 'Untitled campaign',
    description: b.description || '',
    thesis: b.thesis || '',
    start_date: b.start_date || new Date().toISOString().slice(0, 10),
    end_date:   b.end_date   || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    daily_yt: Number(b.daily_yt ?? 1),
    daily_tt: Number(b.daily_tt ?? 2),
    daily_ig: Number(b.daily_ig ?? 0),
    target_views:     Number(b.target_views     || 0),
    target_leads:     Number(b.target_leads     || 0),
    target_customers: Number(b.target_customers || 0),
    target_revenue:   Number(b.target_revenue   || 0),
    status: b.status || 'planned',
    color: b.color || '#a78bfa',
    raw: JSON.stringify(b),
    created_at: now,
    updated_at: now
  });
  // Insert phases if provided
  if (Array.isArray(b.phases)) {
    for (const p of b.phases) {
      stmts.insertPhase.run({
        id: newId('cph_'),
        campaign_id: id,
        phase_idx:   p.phase_idx,
        name:        p.name,
        description: p.description || '',
        start_day:   Number(p.start_day || 1),
        end_day:     Number(p.end_day   || 1),
        focus:       p.focus || '',
        themes:      JSON.stringify(p.themes || []),
        yt_templates: JSON.stringify(p.yt_templates || []),
        tt_templates: JSON.stringify(p.tt_templates || []),
        created_at:  now
      });
    }
  }
  res.json({ ok: true, id });
});

// ---------- UPDATE ----------
r.put('/campaigns/:id', (req, res) => {
  const existing = stmts.getCampaign.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  stmts.updateCampaign.run({
    id: req.params.id,
    name:        b.name        ?? existing.name,
    description: b.description ?? existing.description,
    thesis:      b.thesis      ?? existing.thesis,
    start_date:  b.start_date  ?? existing.start_date,
    end_date:    b.end_date    ?? existing.end_date,
    daily_yt:    b.daily_yt    ?? existing.daily_yt,
    daily_tt:    b.daily_tt    ?? existing.daily_tt,
    daily_ig:    b.daily_ig    ?? existing.daily_ig,
    target_views:     b.target_views     ?? existing.target_views,
    target_leads:     b.target_leads     ?? existing.target_leads,
    target_customers: b.target_customers ?? existing.target_customers,
    target_revenue:   b.target_revenue   ?? existing.target_revenue,
    status: b.status ?? existing.status,
    color:  b.color  ?? existing.color,
    updated_at: nowIso()
  });
  res.json({ ok: true });
});

// ---------- DELETE ----------
r.delete('/campaigns/:id', (req, res) => {
  // Cascade: delete content_plan + phases
  stmts.deleteContentPlanByCampaign.run(req.params.id);
  stmts.deletePhasesByCampaign.run(req.params.id);
  stmts.deleteCampaign.run(req.params.id);
  res.json({ ok: true });
});

// ---------- MATERIALIZE: create content_plan for entire campaign ----------
r.post('/campaigns/:id/materialize', (req, res) => {
  const c = stmts.getCampaign.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });

  // Wipe existing campaign content first (clean slate)
  stmts.deleteContentPlanByCampaign.run(c.id);

  const phases = stmts.phasesByCampaign.all(c.id).map(formatPhase);
  const start = new Date(c.start_date);
  const end   = new Date(c.end_date);
  const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const now = nowIso();

  let added = 0;
  for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
    const day = dayIdx + 1; // 1-indexed
    const date = new Date(start);
    date.setDate(start.getDate() + dayIdx);
    const ds = date.toISOString().slice(0, 10);

    // Which phase is this day in?
    const phase = phases.find(p => day >= p.start_day && day <= p.end_day) || phases[0];
    const ytTemplates = phase?.yt_templates || ['Day {{day}} · {{name}}'];
    const ttTemplates = phase?.tt_templates || ['POV · {{name}} · day {{day}}', 'Hot take · {{name}} · day {{day}}'];

    // YouTube posts
    for (let i = 0; i < c.daily_yt; i++) {
      const tmpl = ytTemplates[(dayIdx + i) % ytTemplates.length];
      // Calendar title = "D{day} - {campaign name}" · richer template goes to hook field
      const title = `D${day} - ${c.name}`;
      const hook = renderTemplate(tmpl, { day, name: c.name, phase: phase?.name || '' });
      stmts.insertContentPlan.run({
        id: 'cp_' + Math.random().toString(36).slice(2, 10),
        date: ds, time: '08:00',
        platform: 'youtube',
        format: phase?.phase_idx === 4 ? 'documentary' : phase?.phase_idx === 2 ? 'qa' : 'breakdown',
        title,
        hook,
        outline: JSON.stringify((phase?.themes || []).slice(0, 4)),
        script: '', cta: '',
        target_views: 0, target_leads: 0,
        status: 'idea', week_idx: null,
        repeat_group_id: null, repeat_rule: null,
        campaign_id: c.id, series_id: null,
        created_at: now, updated_at: now
      });
      added++;
    }

    // TikTok posts
    const ttTimes = ['12:30', '20:00', '18:00'];
    for (let i = 0; i < c.daily_tt; i++) {
      const tmpl = ttTemplates[(dayIdx + i) % ttTemplates.length];
      const title = `D${day} - ${c.name}`;
      const hook = renderTemplate(tmpl, { day, name: c.name, phase: phase?.name || '' });
      stmts.insertContentPlan.run({
        id: 'cp_' + Math.random().toString(36).slice(2, 10),
        date: ds, time: ttTimes[i] || '20:00',
        platform: 'tiktok',
        format: phase?.phase_idx === 1 ? 'pov' : phase?.phase_idx === 4 ? 'testimonial' : 'talking-head',
        title,
        hook,
        outline: JSON.stringify([]),
        script: '', cta: '',
        target_views: 0, target_leads: 0,
        status: 'idea', week_idx: null,
        repeat_group_id: null, repeat_rule: null,
        campaign_id: c.id, series_id: null,
        created_at: now, updated_at: now
      });
      added++;
    }

    // Instagram (if enabled)
    for (let i = 0; i < c.daily_ig; i++) {
      stmts.insertContentPlan.run({
        id: 'cp_' + Math.random().toString(36).slice(2, 10),
        date: ds, time: '19:00',
        platform: 'instagram',
        format: 'reel',
        title: `D${day} - ${c.name}`,
        hook: '',
        outline: JSON.stringify([]),
        script: '', cta: '',
        target_views: 0, target_leads: 0,
        status: 'idea', week_idx: null,
        repeat_group_id: null, repeat_rule: null,
        campaign_id: c.id, series_id: null,
        created_at: now, updated_at: now
      });
      added++;
    }
  }

  // Auto-activate campaign on first materialize
  if (c.status === 'planned') {
    stmts.updateCampaign.run({
      id: c.id,
      name: c.name, description: c.description, thesis: c.thesis,
      start_date: c.start_date, end_date: c.end_date,
      daily_yt: c.daily_yt, daily_tt: c.daily_tt, daily_ig: c.daily_ig,
      target_views: c.target_views, target_leads: c.target_leads,
      target_customers: c.target_customers, target_revenue: c.target_revenue,
      status: 'active', color: c.color,
      updated_at: nowIso()
    });
  }

  res.json({ ok: true, added, totalDays });
});

// ---------- SEED TEMPLATE — "30 Triệu Đầu Tiên · Cohort 1" ----------
r.post('/campaigns/seed/help-5-strangers', (req, res) => {
  const b = req.body || {};
  const start_date = b.start_date || nextMondayISO();
  const start = new Date(start_date);
  const end = new Date(start);
  end.setDate(start.getDate() + 29); // 30 days inclusive
  const end_date = end.toISOString().slice(0, 10);

  const id = newId();
  const now = nowIso();
  stmts.insertCampaign.run({
    id,
    name: '30 Triệu Đầu Tiên · Cohort 1',
    description: 'Series 30 ngày · giúp 5 người lạ kiếm 30 triệu VND đầu tiên. Documentary-style cross-platform.',
    thesis: 'Live proof > marketing claims. Show coaching working on 5 real people.',
    start_date, end_date,
    daily_yt: 1, daily_tt: 2, daily_ig: 0,
    target_views: 100000,
    target_leads: 100,
    target_customers: 20,
    target_revenue: 15000,
    status: 'planned',
    color: '#a78bfa',
    raw: '{}',
    created_at: now, updated_at: now
  });

  // 4 PHASES — based on user's plan
  const phases = [
    {
      phase_idx: 1, name: 'Tìm kiếm strangers',
      description: 'Open application + viral recruitment hooks. Goal: 500+ submissions.',
      start_day: 1, end_day: 7,
      focus: 'TOFU viral · recruit + hype',
      themes: [
        'Announcement: "Tôi sẽ giúp 5 người lạ kiếm 30tr trong 30 ngày"',
        'Application form push',
        'Behind-the-scenes reading applications',
        'Hot takes về vì sao 5 người này quan trọng',
        'Stitch các coach Việt khác'
      ],
      yt_templates: [
        'Day {{day}} · Announcement · Giúp 5 người lạ kiếm 30tr trong 30 ngày',
        'Day {{day}} · Tôi đang đọc {{day}}00+ application — đây là pattern',
        'Day {{day}} · Vì sao tôi làm điều này (story video)',
        'Day {{day}} · 3 sai lầm 99% applicant đang mắc',
        'Day {{day}} · Inside my selection criteria',
        'Day {{day}} · Update · còn {{day}} ngày trước khi chọn 5 người',
        'Day {{day}} · Application closes tomorrow — câu chuyện học viên cũ'
      ],
      tt_templates: [
        'POV · Tôi vừa announce chọn 5 người lạ giúp họ kiếm 30tr',
        'POV · Đọc application thứ 100 hôm nay',
        'Hot take · Vì sao tôi không cho 30 ngày coaching free',
        'POV · 3 ứng viên nổi bật hôm nay',
        'Hot take · Đây là kiểu người tôi sẽ KHÔNG chọn',
        'Stitch · Phản ứng với 1 coach Việt khác',
        'POV · Còn {{day}} ngày trước khi đóng form',
        'Hot take · 30 triệu trong 30 ngày — realistic hay không?'
      ]
    },
    {
      phase_idx: 2, name: 'Phỏng vấn strangers',
      description: 'Reveal 5 selected · interview each · build narrative arc',
      start_day: 8, end_day: 12,
      focus: 'MOFU · interview reveal · cast introduction',
      themes: [
        'Reveal video: 5 người được chọn',
        '5 mini interviews (1/ngày)',
        'Background story mỗi người',
        'Goal cá nhân + lý do được chọn',
        'Setting expectations'
      ],
      yt_templates: [
        'Day {{day}} · 5 NGƯỜI ĐƯỢC CHỌN · Đây là họ',
        'Day {{day}} · Interview #1 · Giáo viên IELTS 5 năm muốn pivot',
        'Day {{day}} · Interview #2 · Mẹ bỉm sữa có kỹ năng dạy',
        'Day {{day}} · Interview #3 · Gia sư 1-1 kiệt sức',
        'Day {{day}} · Interview #4 · Sinh viên năm cuối'
      ],
      tt_templates: [
        'POV · Tôi vừa gọi cho 5 người được chọn',
        'Behind the scenes · Interview ngày {{day}}',
        'Hot take · Vì sao tôi chọn 5 người này (không phải 50K followers)',
        'POV · 1 người đã muốn rút lui rồi · đây là lý do',
        'Behind the scenes · Set up Notion cohort'
      ]
    },
    {
      phase_idx: 3, name: 'Quá trình make money',
      description: 'Daily journey · coach 5 strangers · document everything',
      start_day: 13, end_day: 26,
      focus: 'MOFU + BOFU mix · live transformation',
      themes: [
        'Daily coaching session highlights (Mindset week)',
        'Offer building week (price + positioning)',
        'Content machine week (post for first time)',
        'First sales week (test offer to audience)',
        'Failures + breakthroughs · real-time',
        'Framework teaches mid-episode'
      ],
      yt_templates: [
        'Day {{day}} · Tuần Mindset · 5 người vừa break qua barrier này',
        'Day {{day}} · Coaching session #1 (cohort tóm tắt)',
        'Day {{day}} · Tuần Offer · Đây là cách 5 người định giá khóa của họ',
        'Day {{day}} · 1 người vừa chốt 5tr đầu tiên · đây là cách',
        'Day {{day}} · Tuần Content · Quay video cho từng cohort',
        'Day {{day}} · Coaching call review · 3 sai lầm cohort đang mắc',
        'Day {{day}} · Tuần Sales · 2 người vừa đạt 10tr',
        'Day {{day}} · Framework reveal · Offer Ladder cho cohort',
        'Day {{day}} · 1 người muốn bỏ cuộc · đây là cách tôi cứu họ',
        'Day {{day}} · Update · 8/14 ngày → tổng doanh thu 5 người là bao nhiêu?',
        'Day {{day}} · Tôi audit live kênh TT của cohort #3',
        'Day {{day}} · Tuần BOFU · Cách cohort lên thuyết phục lead',
        'Day {{day}} · 3 người vừa đạt 20tr · còn 6 ngày để đạt 30tr',
        'Day {{day}} · Mid-review · Hot seat coaching'
      ],
      tt_templates: [
        'POV · Cohort vừa kiếm tiền đầu tiên',
        'Hot take · Đây là lý do 99% coach Việt không bao giờ kiếm 30tr',
        'POV · Audit kênh TT cohort #2 sau 5 ngày',
        'Behind scenes · Coaching call ngày {{day}}',
        'POV · 1 người vừa break qua block · đây là moment',
        'Hot take · Stop dạy 1-1 — đây là cách cohort tôi đang làm',
        'POV · Update · day {{day}} of 30',
        'Behind scenes · Notion dashboard của cohort',
        'POV · 1 người vừa từ chối deal · đây là vì sao',
        'Hot take · Tại sao tôi không bán "10 ngày 30 triệu"',
        'POV · Cohort vừa chốt deal $500 · screenshot DM',
        'Hot take · 3 sai lầm content cohort đang mắc',
        'POV · Tôi gửi 1 framework cho cohort hôm nay',
        'Behind scenes · Setup auto DM responder cho cohort'
      ]
    },
    {
      phase_idx: 4, name: 'Thành tựu · Reveal',
      description: 'Show final numbers · testimonials · next cohort launch',
      start_day: 27, end_day: 30,
      focus: 'BOFU · proof + cohort 2 sell',
      themes: [
        'Final numbers reveal (transparent)',
        'Who achieved · who didn\'t · why',
        'Testimonial videos',
        'Open application for Cohort 2',
        'Lessons for the audience'
      ],
      yt_templates: [
        'Day {{day}} · KẾT QUẢ · 5 người · 30 ngày · đây là tất cả số liệu',
        'Day {{day}} · Testimonial · 5 người tự kể câu chuyện',
        'Day {{day}} · 7 bài học từ 30 ngày coaching 5 strangers',
        'Day {{day}} · MỞ ĐĂNG KÝ Cohort 2 · còn 10 slot'
      ],
      tt_templates: [
        'POV · Final reveal · 5 người vừa đạt {{day}}0tr',
        'Hot take · 2 người KHÔNG đạt 30tr · đây là tại sao (không giấu)',
        'POV · Cohort vừa quay testimonial',
        'Hot take · Đây là điều shock nhất sau 30 ngày',
        'POV · Mở Cohort 2 · Apply now',
        'Hot take · Vì sao tôi không nhận trên 5 người',
        'POV · Cohort 1 reunion · 30 ngày sau',
        'Hot take · Final lesson · ai nên apply, ai không nên'
      ]
    }
  ];

  for (const p of phases) {
    stmts.insertPhase.run({
      id: newId('cph_'),
      campaign_id: id,
      phase_idx: p.phase_idx,
      name: p.name,
      description: p.description,
      start_day: p.start_day, end_day: p.end_day,
      focus: p.focus,
      themes: JSON.stringify(p.themes),
      yt_templates: JSON.stringify(p.yt_templates),
      tt_templates: JSON.stringify(p.tt_templates),
      created_at: now
    });
  }

  res.json({ ok: true, id });
});

// ---------- HELPERS ----------
function formatCampaign(r) {
  return {
    id: r.id, name: r.name, description: r.description, thesis: r.thesis,
    start_date: r.start_date, end_date: r.end_date,
    daily_yt: r.daily_yt, daily_tt: r.daily_tt, daily_ig: r.daily_ig,
    target_views: r.target_views, target_leads: r.target_leads,
    target_customers: r.target_customers, target_revenue: r.target_revenue,
    status: r.status, color: r.color,
    created_at: r.created_at, updated_at: r.updated_at
  };
}
function formatPhase(r) {
  return {
    id: r.id, campaign_id: r.campaign_id, phase_idx: r.phase_idx,
    name: r.name, description: r.description,
    start_day: r.start_day, end_day: r.end_day,
    focus: r.focus,
    themes:       safeJson(r.themes)       || [],
    yt_templates: safeJson(r.yt_templates) || [],
    tt_templates: safeJson(r.tt_templates) || []
  };
}
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
function renderTemplate(tmpl, vars) {
  return String(tmpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] != null ? String(vars[k]) : '');
}
function nextMondayISO() {
  const today = new Date();
  const day = today.getDay();
  const diff = (8 - (day || 7)) % 7;
  const mon = new Date(today);
  mon.setDate(today.getDate() + (diff || 7));
  return mon.toISOString().slice(0, 10);
}

export default r;
