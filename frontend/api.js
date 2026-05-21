/* ===================================================
   Contento — API client
   Talks to backend at /api/*. Falls back to mock data
   when the backend is unavailable so the UI still works.
   Wrapped in IIFE so internal consts don't leak globally.
   =================================================== */

(function() {

const API_BASE = window.CONTENTO_API_BASE || '/api';
const FALLBACK = true; // serve mock data if backend down

const mockState = {
  profile: { name: 'ANG Coaching', niche: 'AI agency · Personal brand', audience: 'Founders 22–35', goal: '500 leads · $25K rev' },
  connections: { youtube: true, tiktok: true, instagram: false },
  metrics: {
    youtube:   { views: 1160000, subs: 84210, ctr: 8.4, watchHours: 4210, delta: 22.5 },
    tiktok:    { views:  872000, followers: 96810, engage: 11.2, avgWatch: 2.1, delta: 34.8 },
    instagram: { reach:  386000, followers: 41821, engage: 6.5, saves: 72, delta: -4.2 },
    revenue:   { value: 8420, cpl: 1.92, ltv: 1820, roas: 7.4, delta: 12 }
  },
  funnel: { views: 2418902, engaged: 1742000, clicks: 918000, leads: 312, customers: 47 },
  videos: [
    { id:'v1', title:'How I built a $10K/mo AI agency', platform:'youtube', date:'2026-05-14', views:842000, likes:62000, comments:3210, ctr:9.2, retention:58, score:98, status:'published' },
    { id:'v2', title:'$1M lesson from my first failure',  platform:'tiktok',  date:'2026-05-12', views:612000, likes:89000, comments:1840, ctr:11.4,retention:72, score:94, status:'published' },
    { id:'v3', title:'3 AI tools I use every day (Free)', platform:'youtube', date:'2026-05-09', views:481000, likes:34000, comments:2108, ctr:7.8, retention:54, score:88, status:'published' },
    { id:'v4', title:'Millionaire morning routine at 25',  platform:'instagram',date:'2026-05-07', views:318000, likes:41000, comments:892,  ctr:6.5, retention:null, score:82, status:'published' },
    { id:'v5', title:'How I closed $50K in 7 days',         platform:'tiktok',  date:'2026-05-05', views:274000, likes:52000, comments:1210, ctr:10.1,retention:68, score:79, status:'published' },
    { id:'v6', title:'5 mistakes killing your brand',      platform:'youtube', date:'2026-05-03', views:198000, likes:18000, comments:724,  ctr:5.9, retention:49, score:71, status:'published' },
    { id:'v7', title:'POV: you just quit your 9-5',         platform:'tiktok',  date:'2026-05-01', views:156000, likes:28000, comments:612,  ctr:8.7, retention:61, score:68, status:'published' }
  ],
  tracked: [
    { id:'c1', name:'Iman Gadzhi',  handle:'@imangadzhi',  tag:'Mentor',           followers:'4.2M', growth:'+18%', avg:'1.8M', platforms:['youtube','instagram','tiktok'] },
    { id:'c2', name:'Alex Hormozi', handle:'@alexhormozi', tag:'Mentor',           followers:'6.1M', growth:'+22%', avg:'2.4M', platforms:['youtube','instagram','tiktok'] },
    { id:'c3', name:'Dan Lok',      handle:'@danlok',      tag:'Direct competitor',followers:'5.8M', growth:'+8%',  avg:'420K', platforms:['youtube','instagram'] },
    { id:'c4', name:'Ali Abdaal',   handle:'@aliabdaal',   tag:'Inspiration',      followers:'5.4M', growth:'+11%', avg:'780K', platforms:['youtube','instagram'] },
    { id:'c5', name:'Viet Phong',   handle:'@vietphong',   tag:'Direct competitor',followers:'320K', growth:'+26%', avg:'180K', platforms:['tiktok','instagram'] },
    { id:'c6', name:'Hieu Nguyen',  handle:'@hieunguyen',  tag:'Reference',        followers:'180K', growth:'+14%', avg:'92K',  platforms:['youtube','tiktok'] }
  ],
  viral: [
    { title:'"How I made $100K in 30 days"', handle:'@iman.gadzhi',  platform:'youtube',   views:'4.2M', score:99 },
    { title:'"This is why you\'re still broke"', handle:'@alexhormozi', platform:'tiktok',  views:'2.8M', score:96 },
    { title:'"Stop being a follower"',         handle:'@danlok',       platform:'instagram',views:'1.4M', score:91 },
    { title:'"My $5K/month side hustle"',      handle:'@aliabdaal',    platform:'youtube',  views:'982K', score:87 }
  ],
  ideas: [
    { badge:'TREND ↑',  platform:'youtube', title:'5 reasons I fired my $5K/mo employee and replaced him with AI',
      desc:'12-min long-form mixing story + tutorial. 8-second hook with before/after split.',
      score:94, dur:'10–14 min', reach:'500K–1M' },
    { badge:'VIRAL',    platform:'tiktok',  title:'POV: a client offered $10K and you said no',
      desc:'45s story TikTok riding the high-ticket sales trend. CTA: link in bio funnel.',
      score:91, dur:'30–60s', reach:'300K–800K' },
    { badge:'EVERGREEN',platform:'youtube', title:'I studied 100 founders earning $1M/year — 7 common habits',
      desc:'Research-style listicle. High saves & shares, great for retargeting pixel.',
      score:88, dur:'15–20 min', reach:'400K–900K' },
    { badge:'TREND ↑',  platform:'instagram',title:'Carousel: "10 questions to know if you should quit 9-5"',
      desc:'10-slide carousel — huge save rate for the 25–34 demographic.',
      score:86, dur:'Carousel · 10 slides', reach:'150K–400K' },
    { badge:'GAP',      platform:'tiktok',  title:'How I found 1,000 clients via cold DM',
      desc:'60s tutorial — competitors haven\'t covered deeply, high organic search demand.',
      score:82, dur:'45–60s', reach:'200K–600K' },
    { badge:'EXPERIMENT',platform:'youtube',title:'I tried $100/day Facebook Ads for 30 days',
      desc:'Documentary 3-part series. 4× watch time, drives strong sub growth.',
      score:79, dur:'20–25 min', reach:'250K–700K' }
  ],
  schedule: { /* date(YYYY-MM-DD) -> [{time, platform, title, desc}] */ }
};

// fill mock schedule for May 2026
(function fillMockSchedule(){
  const year = 2026, month = 5;
  for (let d=1; d<=31; d++) {
    const date = new Date(year, month-1, d);
    const dow = (date.getDay() + 6) % 7; // Mon=0
    const key = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const items = [];
    if (dow === 1 || dow === 5) items.push({ time:'08:00', platform:'youtube', title:'YouTube long-form upload', desc:'14-min how-to · CTA: book call' });
    items.push({ time:'12:30', platform:'tiktok', title:'TikTok story post', desc:'POV format · trending audio' });
    items.push({ time:'18:00', platform:'tiktok', title:'TikTok prime-time post', desc:'Storytelling · funnel CTA' });
    if (dow === 2 || dow === 6) items.push({ time:'19:00', platform:'instagram', title:'Instagram Reel + carousel', desc:'High-save content for retargeting' });
    if (dow === 3) items.push({ time:'21:00', platform:'tiktok', title:'Live Q&A 15 min', desc:'Push community engagement' });
    mockState.schedule[key] = items;
  }
})();

async function safeFetch(path, opts = {}) {
  try {
    const res = await fetch(API_BASE + path, opts);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    if (!FALLBACK) throw err;
    return null;
  }
}
// Returns true if backend data is "useful" (not null/empty array/empty object)
function hasData(v) {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}
function pick(real, mock) { return hasData(real) ? real : mock; }

const API = {
  async profile()       {
    const r = await safeFetch('/profile');
    return (r && r.name) ? r : mockState.profile;
  },
  async saveProfile(p)  {
    const r = await safeFetch('/profile', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p) });
    if (!hasData(r)) { Object.assign(mockState.profile, p); }
    return r || p;
  },

  async connections()   { return (await safeFetch('/connections')) || mockState.connections; },
  authUrl(platform)     { return `${API_BASE}/auth/${platform}/start`; },

  async metrics(range=30) {
    const r = await safeFetch('/metrics?range=' + range);
    // Merge real metrics over mock, so connected platforms show real data and others show mock
    if (!hasData(r)) return mockState.metrics;
    const merged = JSON.parse(JSON.stringify(mockState.metrics));
    for (const k of Object.keys(merged)) {
      if (r[k] && Object.values(r[k]).some(v => v > 0)) merged[k] = { ...merged[k], ...r[k] };
    }
    return merged;
  },
  async funnel(range=30)  { return pick(await safeFetch('/funnel?range=' + range), mockState.funnel); },
  async videos(filter={}) {
    const q = new URLSearchParams(filter).toString();
    const data = await safeFetch('/videos?' + q);
    if (hasData(data)) return data;
    let v = mockState.videos.slice();
    if (filter.platform && filter.platform !== 'all') v = v.filter(x => x.platform === filter.platform);
    return v;
  },
  async sync()          { return (await safeFetch('/sync', { method:'POST' })) || { ok:true, lastSync: new Date().toISOString() }; },

  async tracked()       { return pick(await safeFetch('/tracked'), mockState.tracked); },
  async addTracked(p)   {
    const r = await safeFetch('/tracked', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p) });
    if (r) return r;
    const c = parseHandle(p.url, p.tag);
    mockState.tracked.unshift(c);
    return c;
  },
  async removeTracked(id){
    await safeFetch(`/tracked/${id}`, { method:'DELETE' });
    mockState.tracked = mockState.tracked.filter(c => c.id !== id);
  },

  async viral()         { return pick(await safeFetch('/viral'), mockState.viral); },

  async ideas(refresh=false) {
    const r = await safeFetch('/ideas' + (refresh ? '?refresh=1' : ''));
    return pick(r, mockState.ideas);
  },
  async generateIdeas(){ return pick(await safeFetch('/ideas/generate', { method:'POST' }), mockState.ideas); },

  async schedule(date=null) {
    // No mock fallback — return only what backend has (legacy schedule table)
    if (date) return (await safeFetch('/schedule?date=' + date)) || [];
    return (await safeFetch('/schedule')) || {};
  },
  async addScheduleItem(item) {
    const r = await safeFetch('/schedule', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item) });
    if (!hasData(r)) {
      if (!mockState.schedule[item.date]) mockState.schedule[item.date] = [];
      mockState.schedule[item.date].push(item);
    }
    return r || item;
  },
  async deleteScheduleItem(id) {
    await safeFetch(`/schedule/${id}`, { method:'DELETE' });
    for (const d of Object.keys(mockState.schedule)) {
      mockState.schedule[d] = mockState.schedule[d].filter(it => it.id !== id);
    }
  },

  // ---------- STRATEGY ----------
  async getGoal(period)        { return await safeFetch('/goals/' + period); },
  async setGoal(period, g)     { return await safeFetch('/goals/' + period, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(g) }); },
  async getBaselines()         { return (await safeFetch('/baselines')) || {}; },
  async setBaseline(p, b)      { return await safeFetch('/baselines/' + p, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b) }); },
  async getFunnels()           { return (await safeFetch('/funnels')) || {}; },
  async setFunnel(p, f)        { return await safeFetch('/funnels/' + p, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(f) }); },
  async getStrategy(period)    { return (await safeFetch('/strategy/' + period)) || []; },
  async generateStrategy(p)    { return await safeFetch('/strategy/' + p + '/generate', { method:'POST' }); },
  async materializeWeek(period, weekIdx, startDate) {
    return await safeFetch('/strategy/' + period + '/materialize', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ weekIdx, startDate })
    });
  },

  // Content Series
  async listSeries(platform) {
    const q = platform ? ('?platform=' + platform) : '';
    return (await safeFetch('/series' + q)) || [];
  },
  async createSeries(s) {
    return await safeFetch('/series', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(s)
    });
  },
  async updateSeries(id, patch) {
    return await safeFetch('/series/' + id, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(patch)
    });
  },
  async deleteSeries(id) {
    return await safeFetch('/series/' + id, { method:'DELETE' });
  },
  async materializeAllSeries() {
    return await safeFetch('/series/materialize-all', { method:'POST' });
  },
  async getContentPlan(query={}) {
    const q = new URLSearchParams(query).toString();
    return (await safeFetch('/content-plan?' + q)) || {};
  },
  async updateContentPlan(id, patch) {
    return await safeFetch('/content-plan/' + id, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(patch)
    });
  },
  async addContentPlan(item) {
    return await safeFetch('/content-plan', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(item)
    });
  },
  async deleteContentPlan(id) { return await safeFetch('/content-plan/' + id, { method:'DELETE' }); },

  // Script generation (AI)
  async generateScript(planId) {
    return await safeFetch('/script/' + planId, { method:'POST' });
  },

  // ---------- MY IDEAS ----------
  async myIdeas(status='all') {
    const q = status === 'all' ? '' : ('?status=' + status);
    return (await safeFetch('/my-ideas' + q)) || [];
  },
  async addMyIdea(idea)     { return await safeFetch('/my-ideas', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(idea) }); },
  async updateMyIdea(id, p) { return await safeFetch('/my-ideas/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p) }); },
  async deleteMyIdea(id)    { return await safeFetch('/my-ideas/' + id, { method:'DELETE' }); },
  async scheduleMyIdea(id, slot) { return await safeFetch('/my-ideas/' + id + '/schedule', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(slot) }); },

  // ---------- FORMAT LIBRARY ----------
  async formats(platform='all') {
    const q = platform === 'all' ? '' : ('?platform=' + platform);
    return (await safeFetch('/formats' + q)) || [];
  },
  async addFormat(f)      { return await safeFetch('/formats', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(f) }); },
  async suggestFormats()  { return await safeFetch('/formats/suggest', { method:'POST' }); },
  async deleteFormat(id)  { return await safeFetch('/formats/' + id, { method:'DELETE' }); },

  // ---------- LEADS ----------
  async leads(status='all', limit=200)  {
    const q = status === 'all' ? `?limit=${limit}` : `?status=${status}&limit=${limit}`;
    return (await safeFetch('/leads' + q)) || [];
  },
  async leadsStats(range=30)            { return (await safeFetch('/leads/stats?range=' + range)) || { total:0, sale:0, revenue:0 }; },
  async addLead(lead)                   { return await safeFetch('/leads/ingest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ source:'manual', ...lead }) }); },
  async updateLead(id, p)               { return await safeFetch('/leads/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p) }); },
  async deleteLead(id)                  { return await safeFetch('/leads/' + id, { method:'DELETE' }); },
  gasSnippetUrl(formId='YOUR_FORM_ID')  { return API_BASE + '/leads/setup/gas?form_id=' + encodeURIComponent(formId); },

  // ---------- URL BREAKDOWN ----------
  async breakdownUrl(url)               { return await safeFetch('/ideas/breakdown', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url }) }); },
  async saveBreakdown(url)              { return await safeFetch('/ideas/breakdown/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url }) }); },

  // ---------- CONTENT PLAN ADMIN ----------
  async clearAllContentPlan()                 { return await safeFetch('/content-plan', { method:'DELETE' }); },
  async clearContentPlanRange(from, to)       { return await safeFetch(`/content-plan?from=${from}&to=${to}`, { method:'DELETE' }); },
  async clearContentPlanDate(date)            { return await safeFetch(`/content-plan?date=${date}`, { method:'DELETE' }); },
  async clearContentPlanCampaign(campaignId)  { return await safeFetch(`/content-plan?campaign=${campaignId}`, { method:'DELETE' }); },
  async clearContentPlanStatus(status)        { return await safeFetch(`/content-plan?status=${status}`, { method:'DELETE' }); },
  async clearContentPlanPlatform(platform)    { return await safeFetch(`/content-plan?platform=${platform}`, { method:'DELETE' }); },

  // ---------- TIMELINE for chart ----------
  async viewsTimeline(range=30)         { return (await safeFetch('/views-timeline?range=' + range)) || [] },

  // ---------- CONTENT PLAN (scoped edit/delete + single fetch) ----------
  async getContentPlanItem(id)          { return await safeFetch('/content-plan/' + id); },
  async updateContentPlanScoped(id, patch, scope='this') {
    return await safeFetch(`/content-plan/${id}?scope=${scope}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
  },
  async deleteContentPlanScoped(id, scope='this') {
    return await safeFetch(`/content-plan/${id}?scope=${scope}`, { method: 'DELETE' });
  },

  // ---------- STRATEGY recommender + format performance ----------
  async formatPerformance() {
    return (await safeFetch('/format-performance')) || [];
  },
  async strategicRecommend({ platform='tiktok', metric='followers', target=1000, days=30 } = {}) {
    return await safeFetch('/strategy/recommend', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, metric, target, days })
    });
  },

  // ---------- FUNNEL STRATEGY ----------
  async funnelPlan({ objective='viral', timeframe_days=30, platform='tiktok' } = {}) {
    return await safeFetch('/funnel-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objective, timeframe_days, platform })
    });
  },
  async materializeFunnelPlan({ plan, start_date, weeks = 1 } = {}) {
    return await safeFetch('/funnel-plan/materialize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, start_date, weeks })
    });
  },
  async brainstorm({ platform='tiktok', format='pov', stage='tofu', count=5 } = {}) {
    return await safeFetch('/brainstorm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, format, stage, count })
    });
  },

  // ---------- CAMPAIGNS ----------
  async campaigns()                          { return (await safeFetch('/campaigns')) || []; },
  async getCampaign(id)                      { return await safeFetch('/campaigns/' + id); },
  async createCampaign(c)                    { return await safeFetch('/campaigns', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(c) }); },
  async updateCampaign(id, patch)            { return await safeFetch('/campaigns/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) }); },
  async deleteCampaign(id)                   { return await safeFetch('/campaigns/' + id, { method:'DELETE' }); },
  async materializeCampaign(id)              { return await safeFetch('/campaigns/' + id + '/materialize', { method:'POST' }); },
  async seedHelp5Strangers(startDate)        { return await safeFetch('/campaigns/seed/help-5-strangers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ start_date: startDate }) }); },

  // ---------- PROSPECTS (CRM) ----------
  async prospects(status='all')              { const q = status === 'all' ? '' : ('?status=' + status); return (await safeFetch('/prospects' + q)) || []; },
  async getProspect(id)                      { return await safeFetch('/prospects/' + id); },
  async addProspect(p)                       { return await safeFetch('/prospects', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p) }); },
  async updateProspect(id, patch)            { return await safeFetch('/prospects/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) }); },
  async transitionProspect(id, status)       { return await safeFetch('/prospects/' + id + '/transition', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status }) }); },
  async deleteProspect(id)                   { return await safeFetch('/prospects/' + id, { method:'DELETE' }); },
  async prospectsSummary()                   { return (await safeFetch('/prospects/stats/summary')) || { buckets:{}, total:0 }; }
};

function parseHandle(url, tag='Reference') {
  const handle = (url.match(/@[\w.\-]+/) || [url.split('/').filter(Boolean).pop()])[0] || '@unknown';
  const name = handle.replace('@','').split(/[.\-_]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  const platforms = [];
  if (/youtube/i.test(url))   platforms.push('youtube');
  if (/tiktok/i.test(url))    platforms.push('tiktok');
  if (/instagr/i.test(url))   platforms.push('instagram');
  if (!platforms.length) platforms.push('youtube');
  return {
    id: 'c' + Date.now(),
    name, handle, tag,
    followers: (Math.random()*900 + 100).toFixed(0) + 'K',
    growth: '+' + (Math.random()*30 + 5).toFixed(0) + '%',
    avg: (Math.random()*400 + 50).toFixed(0) + 'K',
    platforms
  };
}

window.ContentoAPI = API;
window.parseHandle = parseHandle;

})();
