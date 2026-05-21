/* ===================================================
   Contento — Main App
   View routing, chart rendering, dynamic content
   =================================================== */

const API = window.ContentoAPI;
// renderIcons() is defined in icons.js and exposed on window

// ---------- HELPERS ----------
const $  = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1) + 'M' : n >= 1e3 ? (n/1e3).toFixed(0) + 'K' : '' + n;
const usd = n => '$' + (n >= 1000 ? (n/1000).toFixed(1) + 'K' : n);

function toast(msg, ms = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- MODAL ----------
function openModal({ title, bodyHTML, actions = [] }) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHTML;
  $('#modalFoot').innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = a.primary ? 'btn-pill primary' : 'btn-pill';
    b.innerHTML = (a.icon ? `<i class="${a.icon}"></i> ` : '') + a.label;
    b.onclick = () => a.onClick?.($('#modalBody'));
    $('#modalFoot').appendChild(b);
  }
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }
document.addEventListener('click', e => {
  if (e.target.id === 'modal' || e.target.closest('#modalClose')) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ---------- VIEW ROUTING ----------
// Uses event delegation + hash routing → survives DOM rebuilds and partial JS errors.
function showView(name) {
  const validNames = ['overview','strategy','channels','tracking','ideas','schedule','sops','funnel','connections','settings'];
  if (!validNames.includes(name)) name = 'overview';
  $$('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');
  $$('.pill').forEach(p => p.classList.toggle('active', p.dataset.view === name));
  if (location.hash !== '#' + name) {
    history.replaceState(null, '', '#' + name);
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}
// Delegated click — catches ALL [data-view] elements no matter when they appear
document.addEventListener('click', e => {
  const t = e.target.closest('[data-view]');
  if (!t) return;
  e.preventDefault();
  showView(t.dataset.view);
});
// Honor URL hash on load + back/forward navigation
window.addEventListener('hashchange', () => showView(location.hash.replace('#','') || 'overview'));
if (location.hash) showView(location.hash.replace('#',''));

// ---------- CHART DEFAULTS ----------
Chart.defaults.color = '#c4c2d6';
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';

const violetGradient = (ctx) => {
  const c = ctx.chart.ctx;
  const area = ctx.chart.chartArea;
  if (!area) return 'rgba(167,139,250,.25)';
  const g = c.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, 'rgba(167,139,250,0.55)');
  g.addColorStop(1, 'rgba(167,139,250,0.02)');
  return g;
};

// ---------- OVERVIEW: BREAKDOWN BAR ----------
let breakdownChart;
function renderBreakdownChart() {
  const labels = ['Oct 12','Oct 13','Oct 14','Oct 15','Oct 16','Oct 17','Oct 18','Oct 19','Oct 20','Oct 21'];
  const data = [12, 18, 22, 16, 38, 24, 32, 28, 18, 22];
  const ctx = $('#breakdownChart');
  if (!ctx) return;
  if (breakdownChart) breakdownChart.destroy();
  breakdownChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ctx => {
          const c = ctx.chart.ctx;
          const g = c.createLinearGradient(0,0,0,200);
          g.addColorStop(0, '#a78bfa');
          g.addColorStop(1, '#6d28d9');
          return g;
        },
        borderRadius: 6,
        barThickness: 16
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { display: false }
      }
    }
  });
}

// ---------- OVERVIEW: CASHFLOW BARS WITH HIGHLIGHT ----------
let cashflowChart;
function renderCashflowChart(data30) {
  const labels = data30.labels;
  const values = data30.values;
  const highlightIdx = data30.peakIdx;
  const ctx = $('#cashflowChart');
  if (!ctx) return;
  if (cashflowChart) cashflowChart.destroy();
  cashflowChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ctx => {
          if (ctx.dataIndex === highlightIdx) return 'rgba(167,139,250,1)';
          const c = ctx.chart.ctx;
          const g = c.createLinearGradient(0,0,0,200);
          g.addColorStop(0, 'rgba(167,139,250,0.85)');
          g.addColorStop(1, 'rgba(109,40,217,0.25)');
          return g;
        },
        borderRadius: 8,
        barThickness: 14
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(20,20,35,0.95)',
          borderColor: 'rgba(167,139,250,0.4)',
          borderWidth: 1,
          padding: 12,
          callbacks: { label: ctx => 'Views: ' + fmt(ctx.parsed.y) }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => fmt(v) } }
      }
    }
  });
}

// ---------- CHANNELS: PLATFORM LINE ----------
let platformChart;
async function renderPlatformChart() {
  const ctx = document.getElementById('platformChart');
  if (!ctx) return;
  if (typeof Chart === 'undefined') { console.warn('Chart.js not loaded'); return; }
  let timeline = [];
  try { timeline = await API.viewsTimeline(30); } catch (e) { console.warn('viewsTimeline failed', e); }
  if (!Array.isArray(timeline) || !timeline.length) {
    const wrap = ctx.closest('.chart-wrap');
    if (wrap) wrap.innerHTML = `<p class="muted" style="text-align:center;padding:40px;font-size:13px">No view data yet — click "Sync now" to pull from connected platforms</p>`;
    return;
  }
  const labels = timeline.map(d => d.date.slice(5));
  const yt = timeline.map(d => +d.youtube || 0);
  const tt = timeline.map(d => +d.tiktok || 0);
  const ig = timeline.map(d => +d.instagram || 0);

  const period = new Date().toISOString().slice(0, 7);
  let dailyTarget = 0;
  try {
    const goal = await API.getGoal(period);
    if (goal) {
      const monthly = (goal.yt_subs || 0) * 10 + (goal.tt_followers || 0) * 8 + (goal.ig_followers || 0) * 6;
      dailyTarget = monthly ? Math.round(monthly / 30) : 0;
    }
  } catch {}

  const datasets = [
    { label:'YouTube',   data: yt, borderColor:'#ff4d4d', backgroundColor:'rgba(255,77,77,.10)', fill:true, tension:.4, pointRadius:0, borderWidth:2 },
    { label:'TikTok',    data: tt, borderColor:'#25f4ee', backgroundColor:'rgba(37,244,238,.08)', fill:true, tension:.4, pointRadius:0, borderWidth:2 },
    { label:'Instagram', data: ig, borderColor:'#e1306c', backgroundColor:'rgba(225,48,108,.08)', fill:true, tension:.4, pointRadius:0, borderWidth:2 }
  ];
  if (dailyTarget > 0) {
    datasets.push({
      label: 'Daily target',
      data: labels.map(() => dailyTarget),
      borderColor: '#a78bfa', borderWidth: 2, borderDash: [6, 4],
      pointRadius: 0, fill: false, tension: 0
    });
  }
  try {
    if (platformChart) { platformChart.destroy(); platformChart = null; }
    platformChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, color: '#a3a3b8', usePointStyle: true } },
          tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.parsed.y) } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 8, color: '#6b6b80', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => fmt(v), color: '#6b6b80', font: { size: 10 } } }
        }
      }
    });
  } catch (e) {
    console.error('platform chart render failed', e);
    const wrap = ctx.closest('.chart-wrap');
    if (wrap) wrap.innerHTML = `<p class="muted" style="text-align:center;padding:40px;color:#ff8a8a">Chart render error: ${e.message}</p>`;
  }
}

// ---------- TRACKING: COMPARE BAR ----------
let compareChart;
function renderCompareChart(tracked) {
  const ctx = $('#compareChart');
  if (!ctx) return;
  const items = [{ name:'You (Contento)', g:38 }, ...tracked.slice(0,5).map(c => ({ name: c.name, g: parseInt(c.growth) || 0 }))];
  if (compareChart) compareChart.destroy();
  compareChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: items.map(i => i.name),
      datasets: [{
        data: items.map(i => i.g),
        backgroundColor: items.map((_, i) => i === 0 ? '#a78bfa' : 'rgba(255,255,255,0.12)'),
        borderRadius: 8, barThickness: 24
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => v + '%' } },
        y: { grid: { display: false } }
      }
    }
  });
}

// ---------- RECENT VIDEOS ROWS ----------
function renderRecentVideos(videos) {
  const root = $('#recentVideos');
  if (!root) return;
  root.innerHTML = videos.slice(0, 4).map(v => {
    const dateStr = new Date(v.date).toLocaleDateString('en-US', { day:'2-digit', month:'short', year:'numeric' }) +
      ' ' + (Math.floor(Math.random()*12)+1) + ':' + String(Math.floor(Math.random()*60)).padStart(2,'0') + ' AM';
    const initials = v.title.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    return `
      <div class="vid-row">
        <div class="vid-avatar">${initials}</div>
        <div>
          <div class="vid-title">${v.title}</div>
          <div class="vid-meta">#${v.id.toUpperCase()} · ${v.platform}</div>
        </div>
        <span class="muted small">${dateStr}</span>
        <span class="vid-status ${v.status}">${v.status}</span>
        <span class="vid-value">${fmt(v.views)}</span>
        <button class="round-mini" title="More"><i class="lucide-more-horizontal"></i></button>
      </div>
    `;
  }).join('');
}

// ---------- VIDEO TABLE (Channels view) ----------
function renderVideoTable(videos) {
  const root = $('#videoTable');
  if (!root) return;
  const platformIcon = {
    youtube: '<i class="lucide-youtube yt"></i>',
    tiktok:  '<i class="lucide-music tt"></i>',
    instagram: '<i class="lucide-instagram ig"></i>'
  };
  root.innerHTML = videos.map(v => `
    <div class="trow">
      <span class="ttitle"><span class="thumb"></span>${v.title}</span>
      <span class="muted">${new Date(v.date).toLocaleDateString('en-US', { day:'2-digit', month:'short' })}</span>
      <span>${platformIcon[v.platform] || ''}</span>
      <span><b>${fmt(v.views)}</b></span>
      <span class="muted">${fmt(v.likes)}</span>
      <span class="muted">${fmt(v.comments)}</span>
      <span>${v.ctr}%</span>
      <span class="muted">${v.retention ?? '—'}${v.retention ? '%' : ''}</span>
      <span class="score-pill ${v.score >= 90 ? 'hot' : ''}">${v.score}</span>
    </div>
  `).join('');
}

// ---------- KPI CARDS ----------
function renderKPIs(m) {
  $('#ytViews').textContent     = fmt(m.youtube.views);
  $('#ytSubs').textContent      = fmt(m.youtube.subs);
  $('#ytCtr').textContent       = m.youtube.ctr + '%';
  $('#ytWatch').textContent     = fmt(m.youtube.watchHours);

  $('#ttViews').textContent     = fmt(m.tiktok.views);
  $('#ttFollowers').textContent = fmt(m.tiktok.followers);
  $('#ttEngage').textContent    = m.tiktok.engage + '%';
  $('#ttWatch').textContent     = m.tiktok.avgWatch + 's';

  $('#igViews').textContent     = fmt(m.instagram.reach);
  $('#igFollowers').textContent = fmt(m.instagram.followers);
  $('#igEngage').textContent    = m.instagram.engage + '%';
  $('#igSaves').textContent     = m.instagram.saves;

  $('#revValue').textContent    = usd(m.revenue.value);
  $('#revCpl').textContent      = '$' + m.revenue.cpl;
  $('#revLtv').textContent      = usd(m.revenue.ltv);
  $('#revRoas').textContent     = m.revenue.roas + 'x';

  $('#ccYoutubeCount').textContent = fmt(m.youtube.subs);
  // Note: leadsCount + totalViews now set in loadOverview() with real lead stats
}

function renderFunnel(f) {
  $('#fView').textContent  = fmt(f.views);
  $('#fEng').textContent   = fmt(f.engaged);
  $('#fClick').textContent = fmt(f.clicks);
  $('#fLead').textContent  = fmt(f.leads);
  $('#fCust').textContent  = fmt(f.customers);
}

// ---------- TRACKING ----------
const platformIcons = {
  youtube:   '<i class="lucide-youtube yt"></i>',
  tiktok:    '<i class="lucide-music tt"></i>',
  instagram: '<i class="lucide-instagram ig"></i>'
};
function renderCompetitors(list) {
  const grid = $('#competitorGrid');
  if (!grid) return;
  grid.innerHTML = list.map(c => `
    <div class="comp-card" data-id="${c.id}">
      <div class="comp-top">
        <div class="comp-avatar">${c.name.split(' ').map(w=>w[0]).slice(0,2).join('')}</div>
        <div class="comp-info">
          <h4>${c.name}</h4>
          <p>${c.handle}</p>
        </div>
        <button class="round-mini" data-remove="${c.id}" title="Remove"><i class="lucide-x"></i></button>
      </div>
      <span class="comp-tag">${c.tag}</span>
      <div class="comp-stats">
        <div class="comp-stat"><b>${c.followers}</b><span>Followers</span></div>
        <div class="comp-stat"><b>${c.growth}</b><span>30D growth</span></div>
        <div class="comp-stat"><b>${c.avg}</b><span>Avg views</span></div>
      </div>
      <div class="comp-platforms">
        ${c.platforms.map(p => platformIcons[p]).join('')}
      </div>
    </div>
  `).join('');
  // wire remove buttons
  grid.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.remove;
      await API.removeTracked(id);
      toast('Removed tracked creator');
      loadTracking();
    });
  });
}

function renderViral(list) {
  const root = $('#viralList');
  if (!root) return;
  root.innerHTML = list.map(v => `
    <div class="viral-item">
      <span class="viral-thumb"></span>
      <div>
        <p class="viral-title">${v.title}</p>
        <p class="viral-meta">${v.handle} · ${v.platform} · <b>${v.views} views</b></p>
      </div>
      <span class="score-pill ${v.score >= 95 ? 'hot' : ''}">${v.score}</span>
    </div>
  `).join('');
}

// ---------- IDEAS ----------
function renderIdeas(list) {
  const grid = $('#ideasGrid');
  if (!grid) return;
  grid.innerHTML = list.map(i => `
    <div class="idea-card">
      <div class="idea-meta">
        <span class="idea-badge">${i.badge}</span>
        ${platformIcons[i.platform]}
        <span style="margin-left:auto" class="score-pill ${i.score>=90?'hot':''}">${i.score}</span>
      </div>
      <h3 class="idea-title">${i.title}</h3>
      <p class="idea-desc">${i.desc}</p>
      <div class="idea-stats">
        <div><b>${i.dur}</b><span class="muted">Length</span></div>
        <div><b>${i.reach}</b><span class="muted">Est. reach</span></div>
      </div>
      <div class="idea-actions">
        <button class="btn-pill primary sm"><i class="lucide-calendar-plus"></i> Schedule</button>
        <button class="btn-pill sm"><i class="lucide-bookmark"></i> Save</button>
      </div>
    </div>
  `).join('');
}

function renderTrends() {
  const trends = [
    { rank: '01', title: '"Day in the life — broke vs rich version"',
      desc: 'Split-screen hook · TikTok · avg 1.2M views', score: 92 },
    { rank: '02', title: '"I read 50 business books — what nobody tells you"',
      desc: 'Long-form value · YouTube · 800K–2M views', score: 84 },
    { rank: '03', title: '"3 free AI tools that replaced my $3K/mo VA"',
      desc: 'Listicle · Reels & Shorts · 400K–1M views', score: 78 },
    { rank: '04', title: '"POV: you just turned down an $80K job to build your own thing"',
      desc: 'Storytelling · TikTok · avg 600K views', score: 71 }
  ];
  const root = $('#trendList');
  if (!root) return;
  root.innerHTML = trends.map(t => `
    <div class="trend-row">
      <div class="trend-rank">${t.rank}</div>
      <div class="trend-info">
        <h4>${t.title}</h4>
        <p>${t.desc}</p>
      </div>
      <div class="trend-bar"><div style="width:${t.score}%"></div></div>
      <b>${t.score}</b>
    </div>
  `).join('');
}

// ---------- SCHEDULE / CALENDAR ----------
let calMonth = 5, calYear = 2026;
function renderCalendar(scheduleMap) {
  const cal = $('#calendar');
  if (!cal) return;
  const heads = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let html = heads.map(d => `<div class="cal-head">${d}</div>`).join('');

  const first = new Date(calYear, calMonth - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const lastDay = new Date(calYear, calMonth, 0).getDate();
  const now = new Date();
  const isCurMonth = now.getFullYear() === calYear && (now.getMonth()+1) === calMonth;

  for (let i = 0; i < offset; i++) html += `<div class="cal-cell off"></div>`;
  for (let d = 1; d <= lastDay; d++) {
    const key = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const items = (scheduleMap[key] || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const visible = items.slice(0, 3);
    const moreCount = items.length - visible.length;
    const itemHtml = visible.map(it => {
      const cls = it.platform === 'youtube' ? 'yt' : it.platform === 'tiktok' ? 'tt' : 'ig';
      const plat = it.platform === 'youtube' ? 'YT' : it.platform === 'tiktok' ? 'TT' : 'IG';
      const t = (it.time || '').slice(0, 5);
      const title = escapeHtml((it.title || '').replace(/^\[[^\]]+\]\s*·?\s*/, ''));
      const ep = it.ep_number ? ` EP ${it.ep_number}` : '';
      const repeat = it.repeat_group_id ? '<span class="ci-repeat" title="Repeats">↻</span>' : '';
      const stat = it.status || '';
      return `<div class="cal-item ${cls} ${stat}" title="${escapeHtml(it.title||'')}${ep}">
        <span class="ci-time">${t}</span>
        <span class="ci-plat ${cls}">${plat}</span>
        <span class="ci-title">${title}${ep}</span>
        ${repeat}
      </div>`;
    }).join('');
    const todayCls = isCurMonth && d === now.getDate() ? 'today' : '';
    html += `<div class="cal-cell ${todayCls}" data-date="${key}">
      <div class="cal-date">${d}</div>
      <div class="cal-cell-items">
        ${itemHtml}
        ${moreCount > 0 ? `<div class="cal-more">+${moreCount} more</div>` : ''}
      </div>
    </div>`;
  }
  const used = offset + lastDay;
  const rem = (7 - (used % 7)) % 7;
  for (let i = 0; i < rem; i++) html += `<div class="cal-cell off"></div>`;
  cal.innerHTML = html;

  $('#calLabel').textContent = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function renderTodayPlan(items) {
  const root = $('#todayList');
  if (!root) return;
  if (!items.length) {
    root.innerHTML = `<p class="muted" style="text-align:center;padding:20px">Nothing planned today.</p>`;
    return;
  }
  root.innerHTML = items.map(it => {
    const cls = it.platform === 'youtube' ? 'yt' : it.platform === 'tiktok' ? 'tt' : 'ig';
    const label = it.platform === 'youtube' ? 'YouTube' : it.platform === 'tiktok' ? 'TikTok' : 'Instagram';
    const sub = it.cta || it.hook || it.desc || it.description || '';
    const isDone = it.status === 'done' || it.status === 'completed' || it.status === 'published';
    return `
      <div class="today-item ${isDone ? 'done' : ''}" data-cp-id="${it.id || ''}">
        <button class="t-check ${isDone ? 'checked' : ''}" data-tick="${it.id || ''}" title="${isDone ? 'Mark as pending' : 'Mark as done'}">
          <i class="lucide-check"></i>
        </button>
        <div class="t-time">${it.time || ''}</div>
        <div class="t-dot ${cls}"></div>
        <div class="t-body">
          <h4>${escapeHtml(it.title || 'Untitled')}${it.ep_number ? ` <span style="color:var(--text-2);font-weight:500">EP ${it.ep_number}</span>` : ''}</h4>
          ${sub ? `<p>${escapeHtml(sub)}</p>` : ''}
          ${it.format ? `<p class="muted" style="margin-top:2px">Format: <b style="color:var(--text-2)">${it.format}</b></p>` : ''}
        </div>
        <span class="badge ${cls}">${label}</span>
      </div>
    `;
  }).join('');

  // Tick handlers (toggle status without opening modal)
  $$('#todayList [data-tick]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.tick;
      if (!id) return;
      const item = items.find(i => i.id === id);
      if (!item) return;
      const wasDone = item.status === 'done' || item.status === 'completed' || item.status === 'published';
      const newStatus = wasDone ? 'pending' : 'done';
      btn.classList.toggle('checked', !wasDone);
      btn.closest('.today-item')?.classList.toggle('done', !wasDone);
      try {
        await API.updateContentPlan(id, { status: newStatus });
        item.status = newStatus;
      } catch (e) {
        // revert UI on failure
        btn.classList.toggle('checked', wasDone);
        btn.closest('.today-item')?.classList.toggle('done', wasDone);
      }
    });
  });

  // Click body opens modal (excluding the tick button)
  $$('#todayList [data-cp-id]').forEach(el => {
    if (!el.dataset.cpId) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-tick]')) return;
      const item = items.find(i => i.id === el.dataset.cpId);
      if (item) openContentPlanModal(item);
    });
  });
}

function renderPriorities() {
  const list = [
    { lvl: 'hi', icon: 'lucide-flame',         title: 'Post YouTube long-form Saturday · 9:00 AM',
      desc: 'Education niche · highest CTR window for your audience', ekg: 'High priority' },
    { lvl: 'md', icon: 'lucide-zap',           title: 'TikTok 3× per day: 12pm · 6pm · 9pm',
      desc: 'Increases avg reach by 38% vs single-post days', ekg: 'Medium' },
    { lvl: 'md', icon: 'lucide-message-square',title: 'Reply to every comment in the first hour',
      desc: 'Boosts algorithm push & lifts watch time +12%', ekg: 'Medium' },
    { lvl: 'lo', icon: 'lucide-images',        title: 'IG carousel Sunday · 7:00 PM',
      desc: 'High save rate · feed your retargeting pixel', ekg: 'Low' }
  ];
  const root = $('#priorityList');
  if (!root) return;
  root.innerHTML = list.map(p => `
    <div class="prio-row ${p.lvl}">
      <i class="${p.icon}"></i>
      <div><h4>${p.title}</h4><p>${p.desc}</p></div>
      <span class="ekg">${p.ekg}</span>
    </div>
  `).join('');
}

// ---------- CONNECTIONS ----------
function renderConnections(conn) {
  const setStatus = (id, ok) => {
    const el = $('#' + id);
    if (!el) return;
    el.classList.toggle('connected', !!ok);
    el.innerHTML = ok
      ? `<i class="lucide-check-circle"></i> Connected`
      : `<i class="lucide-circle"></i> Not connected`;
  };
  setStatus('ytStatus', conn.youtube);
  setStatus('ttStatus', conn.tiktok);
  setStatus('igStatus', conn.instagram);
  setStatus('gdriveStatus', conn.gdrive);

  // wire connect buttons
  $$('[data-connect]').forEach(btn => {
    const platform = btn.dataset.connect;
    if (conn[platform]) {
      btn.innerHTML = `<i class="lucide-plug"></i> Disconnect`;
      btn.classList.remove('primary');
      btn.onclick = async () => {
        await fetch(API.authUrl(platform).replace('/start', ''), { method: 'DELETE' });
        toast(`${platform} disconnected`);
        loadSettings();
      };
    } else {
      btn.onclick = () => openConnectionGuide(platform);
    }
  });
}

function openConnectionGuide(platform) {
  const guides = {
    youtube: {
      title: 'Connect YouTube',
      bodyHTML: `<p class="muted">YouTube is the easiest — Google handles OAuth directly.</p>
        <ol style="padding-left:18px;color:var(--text-2);line-height:1.7">
          <li>Make sure <code>YT_CLIENT_ID</code> + <code>YT_CLIENT_SECRET</code> are set in <code>.env</code></li>
          <li>Add yourself as a test user in Google Cloud Console → OAuth consent → Audience</li>
          <li>Click "Authorize" below → sign in with the Google account that owns your YouTube channel</li>
        </ol>`,
      action: 'Authorize',
      go: true
    },
    tiktok: {
      title: 'Connect TikTok — setup needed',
      bodyHTML: `<p>TikTok requires a developer app. <b>Do this first</b>:</p>
        <ol style="padding-left:18px;color:var(--text-2);line-height:1.7">
          <li>Go to <a href="https://developers.tiktok.com" target="_blank" style="color:var(--violet)">developers.tiktok.com</a> → create a developer account</li>
          <li>Create an app → enable <b>Login Kit</b> + request scopes: <code>user.info.basic</code>, <code>video.list</code>, <code>user.info.stats</code></li>
          <li>Add redirect URL: <code style="user-select:all">http://localhost:4000/api/auth/tiktok/callback</code></li>
          <li>Copy <b>Client Key</b> + <b>Client Secret</b> into your <code>.env</code> as <code>TT_CLIENT_KEY</code> + <code>TT_CLIENT_SECRET</code></li>
          <li>Restart the server</li>
        </ol>
        <p class="muted small">Approval from TikTok can take a few hours. Until then, you'll see "code_challenge" errors (now fixed — PKCE is implemented).</p>`,
      action: 'Authorize anyway',
      go: true
    },
    instagram: {
      title: 'Connect Instagram — setup needed',
      bodyHTML: `<p>Instagram Graph API goes through <b>Facebook Developer</b>. Requires a Business or Creator IG account linked to a Facebook Page.</p>
        <ol style="padding-left:18px;color:var(--text-2);line-height:1.7">
          <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" style="color:var(--violet)">developers.facebook.com/apps</a> → Create app → type "Business"</li>
          <li>Add product → <b>Instagram Graph API</b></li>
          <li>Settings → Basic → copy <b>App ID</b> and <b>App Secret</b> into <code>.env</code> as <code>IG_CLIENT_ID</code> + <code>IG_CLIENT_SECRET</code></li>
          <li>Facebook Login → Settings → add redirect URL: <code style="user-select:all">http://localhost:4000/api/auth/instagram/callback</code></li>
          <li>Add yourself as a Test User → Roles → Test Users</li>
          <li>Make sure your IG account is <b>Business/Creator</b> and linked to a Facebook page you admin</li>
          <li>Restart the server</li>
        </ol>
        <p class="muted small">The "Invalid app ID" error you saw means <code>IG_CLIENT_ID</code> is empty in your .env.</p>`,
      action: 'Authorize anyway',
      go: true
    },
    gdrive: {
      title: 'Connect Google Drive',
      bodyHTML: `<p>Reuses your existing YouTube OAuth credentials (same Google Cloud project). Just add 1 redirect URI:</p>
        <ol style="padding-left:18px;color:var(--text-2);line-height:1.7">
          <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:var(--violet)">console.cloud.google.com → APIs & Services → Credentials</a></li>
          <li>Pick your OAuth 2.0 Client ID đang dùng cho YouTube → Edit</li>
          <li>Trong <b>Authorized redirect URIs</b>, click <b>+ ADD URI</b> rồi paste:
            <br><code style="user-select:all;display:inline-block;margin-top:4px">http://localhost:4000/api/auth/gdrive/callback</code></li>
          <li><b>Save</b> ở dưới cùng</li>
          <li>Vào <b>Enabled APIs</b> → <b>Enable APIs</b> → search "Google Drive API" → Enable (nếu chưa bật)</li>
          <li>OAuth consent screen → Test users → đảm bảo có email <code>theangcoaching@gmail.com</code></li>
          <li>Quay lại đây click "Authorize" bên dưới</li>
        </ol>
        <p class="muted small">Tip: Drive scope cần Google verify nếu app đi public. Đang ở Testing mode thì OK 100 user.</p>`,
      action: 'Authorize',
      go: true
    }
  };
  const g = guides[platform];
  if (!g) return;
  openModal({
    title: g.title,
    bodyHTML: g.bodyHTML,
    actions: [
      { label: 'Close', onClick: closeModal },
      ...(g.go ? [{ label: g.action, primary: true, icon: 'lucide-plug', onClick: () => {
        toast(`Redirecting to ${platform}…`);
        setTimeout(() => { window.location.href = API.authUrl(platform); }, 400);
      }}] : [])
    ]
  });
}

// ---------- LOADERS ----------
async function renderHomeSnapshot(metrics, leadStats) {
  // Platforms
  $('#snapYtSubs')      && ($('#snapYtSubs').textContent      = fmt(metrics.youtube?.subs || 0));
  $('#snapYtViews')     && ($('#snapYtViews').textContent     = fmt(metrics.youtube?.views || 0));
  $('#snapTtFollowers') && ($('#snapTtFollowers').textContent = fmt(metrics.tiktok?.followers || 0));
  $('#snapTtViews')     && ($('#snapTtViews').textContent     = fmt(metrics.tiktok?.views || 0));
  // Leads + students in pipeline
  $('#snapLeads') && ($('#snapLeads').textContent = fmt(leadStats?.total || 0));
  try {
    const prospects = await API.prospects?.('all');
    if (Array.isArray(prospects)) $('#snapStudents').textContent = prospects.length;
  } catch {}
  // Today's plan summary
  try {
    const today = new Date().toISOString().slice(0, 10);
    const todays = await API.schedule(today);
    const list = Array.isArray(todays) ? todays : (todays?.[today] || []);
    const done = list.filter(x => x.status === 'done' || x.status === 'completed' || x.status === 'published').length;
    $('#snapTodayTotal') && ($('#snapTodayTotal').textContent = list.length);
    $('#snapTodayDone')  && ($('#snapTodayDone').textContent  = done);
    $('#snapTodayLeft')  && ($('#snapTodayLeft').textContent  = list.length - done);
  } catch {}
}

async function loadOverview() {
  const [m, leadStats] = await Promise.all([
    API.metrics(),
    API.leadsStats(30)
  ]);
  renderHomeSnapshot(m, leadStats).catch(() => {});
  renderHomeToday().catch(() => {});
  renderPriorities();
  renderHomeAttention(leadStats).catch(() => {});
}

// --- Home: today's tasks + attention items ---
async function renderHomeToday() {
  const root = $('#homeTodayList');
  if (!root) return;
  const today = new Date();
  const dateKey = today.toISOString().slice(0, 10);
  $('#homeTodayDate') && ($('#homeTodayDate').textContent = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));
  try {
    const res = await API.schedule(dateKey);
    const list = Array.isArray(res) ? res : (res?.[dateKey] || []);
    const done = list.filter(x => x.status === 'done' || x.status === 'completed' || x.status === 'published').length;
    const left = list.length - done;
    $('#homeTodaySummary') && ($('#homeTodaySummary').textContent = list.length ? `${done} done · ${left} left` : 'Nothing planned today — go to Schedule to plan');
    renderTodayPlan(list);
    // Mirror today list into homeTodayList by cloning #todayList's HTML (but only if Schedule tab hasn't rendered yet, fallback to direct render)
    // Easier: just render directly into homeTodayList using same item structure
    if (!list.length) {
      root.innerHTML = `<p class="muted" style="text-align:center;padding:24px">Nothing planned for today. <a href="#" data-view="schedule" style="color:var(--violet)">Plan now →</a></p>`;
      return;
    }
    root.innerHTML = list.map(it => {
      const cls = it.platform === 'youtube' ? 'yt' : it.platform === 'tiktok' ? 'tt' : 'ig';
      const label = it.platform === 'youtube' ? 'YouTube' : it.platform === 'tiktok' ? 'TikTok' : 'Instagram';
      const sub = it.cta || it.hook || it.desc || it.description || '';
      const isDone = it.status === 'done' || it.status === 'completed' || it.status === 'published';
      return `
        <div class="today-item ${isDone ? 'done' : ''}" data-cp-id="${it.id || ''}">
          <button class="t-check ${isDone ? 'checked' : ''}" data-home-tick="${it.id || ''}" title="${isDone ? 'Mark as pending' : 'Mark as done'}">
            <i class="lucide-check"></i>
          </button>
          <div class="t-time">${it.time || ''}</div>
          <div class="t-dot ${cls}"></div>
          <div class="t-body">
            <h4>${escapeHtml(it.title || 'Untitled')}</h4>
            ${sub ? `<p>${escapeHtml(sub)}</p>` : ''}
            ${it.format ? `<p class="muted" style="margin-top:2px">Format: <b style="color:var(--text-2)">${it.format}</b></p>` : ''}
          </div>
          <span class="badge ${cls}">${label}</span>
        </div>
      `;
    }).join('');
    // Wire tick handlers
    root.querySelectorAll('[data-home-tick]').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const id = btn.dataset.homeTick;
        if (!id) return;
        const item = list.find(i => i.id === id);
        if (!item) return;
        const wasDone = item.status === 'done' || item.status === 'completed' || item.status === 'published';
        const newStatus = wasDone ? 'pending' : 'done';
        btn.classList.toggle('checked', !wasDone);
        btn.closest('.today-item')?.classList.toggle('done', !wasDone);
        try {
          await API.updateContentPlan(id, { status: newStatus });
          item.status = newStatus;
          renderHomeToday();
        } catch {}
      });
    });
  } catch (e) {
    root.innerHTML = `<p class="muted" style="text-align:center;padding:24px">Failed to load schedule: ${escapeHtml(e.message)}</p>`;
  }
}

async function renderHomeAttention(leadStats) {
  const root = $('#homeAttention');
  if (!root) return;
  const actions = [];
  try {
    const prospects = await API.prospects('qualified').catch(() => []);
    const qualifiedCount = Array.isArray(prospects) ? prospects.length : 0;
    if (qualifiedCount > 0) {
      actions.push({
        kind: 'good', icon: '🎓',
        title: `${qualifiedCount} qualified students chờ call`,
        desc: 'Vào Tracking → Students → filter "qualified" → book call ngay.'
      });
    }
  } catch {}
  try {
    const r = await fetch('/api/applications/list');
    if (r.ok) {
      const d = await r.json();
      const tierA = d.stats?.byTier?.A || 0;
      if (tierA > 0) {
        actions.push({
          kind: 'good', icon: '🏆',
          title: `${tierA} Tier A applications mới`,
          desc: 'Highest fit-score applicants từ form 2x Challenge. Add vào pipeline ngay trước khi nguội.'
        });
      }
    }
  } catch {}
  // Lead momentum
  const total = leadStats?.total || 0;
  if (total === 0) {
    actions.push({
      kind: 'warn', icon: '📭',
      title: '0 leads tuần này',
      desc: 'Funnel đang khô. Check form URL hoạt động chưa + push thêm content TOFU tuần này.'
    });
  } else if (total >= 10) {
    actions.push({
      kind: 'good', icon: '🚀',
      title: `${total} leads/30d — momentum tốt`,
      desc: 'Focus vào chuyển lead → call booked. Reply DM trong 1h boost conversion 3x.'
    });
  }
  // Campaign status — if active, surface it
  try {
    const campaigns = await fetch('/api/campaigns').then(r => r.json()).catch(() => []);
    const active = Array.isArray(campaigns) ? campaigns.find(c => c.status === 'active') : null;
    if (active) {
      actions.push({
        kind: 'good', icon: '🎯',
        title: `Campaign: "${active.name}"`,
        desc: `Day ${active.current_day || '?'} / ${active.duration_days || '?'}. Check Strategy → Campaigns để track progress.`
      });
    }
  } catch {}

  if (!actions.length) {
    actions.push({
      kind: 'good', icon: '☕',
      title: 'No urgent items right now',
      desc: 'Lúc này focus vào tạo content + build pipeline. Quay 1 vlog/pov hôm nay.'
    });
  }
  root.innerHTML = actions.map(a => `
    <div class="focus-card ${a.kind}">
      <div class="fc-icon">${a.icon}</div>
      <h4>${escapeHtml(a.title)}</h4>
      <p>${escapeHtml(a.desc)}</p>
    </div>
  `).join('');
}

async function loadChannels() {
  const [m, f, videos] = await Promise.all([API.metrics(), API.funnel(), API.videos()]);
  renderKPIs(m);
  renderFunnel(f);
  renderVideoTable(videos);
  renderPlatformChart();
  $('#lastSync').textContent = 'Last sync: ' + new Date().toLocaleString('en-US');
}

async function loadTracking() {
  const [tracked, viral] = await Promise.all([API.tracked(), API.viral()]);
  const mentors = tracked.filter(t => /mentor|inspiration/i.test(t.tag || ''));
  const competitors = tracked.filter(t => !/mentor|inspiration/i.test(t.tag || ''));
  // Render into BOTH grids (mentor + competitor)
  if ($('#mentorGrid')) renderCompetitorsInto('#mentorGrid', mentors.length ? mentors : tracked.slice(0, 3));
  if ($('#competitorGrid')) renderCompetitorsInto('#competitorGrid', competitors.length ? competitors : tracked);
  if ($('#mentorViral')) renderViralInto('#mentorViral', viral.slice(0, 3));
  if ($('#competitorViral')) renderViralInto('#competitorViral', viral);
  renderCompareChart(tracked);
}

function renderCompetitorsInto(sel, list) {
  const grid = $(sel);
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;padding:30px">
      <p class="muted">No creators tracked yet. Paste a channel URL above.</p>
    </div>`;
    return;
  }
  grid.innerHTML = list.map(c => `
    <div class="comp-card" data-id="${c.id}">
      <div class="comp-top">
        <div class="comp-avatar">${c.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div>
        <div class="comp-info">
          <h4>${escapeHtml(c.name)}</h4>
          <p>${escapeHtml(c.handle || '')}</p>
        </div>
        <button class="round-mini" data-remove="${c.id}" title="Remove"><i class="lucide-x"></i></button>
      </div>
      <span class="comp-tag">${c.tag || ''}</span>
      <div class="comp-stats">
        <div class="comp-stat"><b>${c.followers || '—'}</b><span>Followers</span></div>
        <div class="comp-stat"><b>${c.growth || '—'}</b><span>30D growth</span></div>
        <div class="comp-stat"><b>${c.avg || '—'}</b><span>Avg views</span></div>
      </div>
      <div class="comp-platforms">
        ${(c.platforms || []).map(p => platformIcons[p] || '').join('')}
      </div>
    </div>
  `).join('');
  grid.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    await API.removeTracked(btn.dataset.remove);
    toast('Removed');
    loadTracking();
  }));
}

function renderViralInto(sel, list) {
  const root = $(sel);
  if (!root) return;
  if (!list.length) {
    root.innerHTML = `<p class="muted" style="text-align:center;padding:20px">No viral content yet — add creators above to start tracking.</p>`;
    return;
  }
  root.innerHTML = list.map(v => `
    <div class="viral-item">
      <span class="viral-thumb"></span>
      <div>
        <p class="viral-title">${escapeHtml(v.title || '')}</p>
        <p class="viral-meta">${v.handle || ''} · ${v.platform || ''} · <b>${v.views || ''} views</b></p>
      </div>
      <span class="score-pill ${v.score >= 95 ? 'hot' : ''}">${v.score || 0}</span>
    </div>
  `).join('');
}

async function loadIdeas() {
  const ideas = await API.ideas();
  renderIdeas(ideas);
  renderTrends();
}

async function loadSchedule() {
  // Pull ONLY from content_plan (real data). No legacy/mock leak.
  const from = new Date(calYear, calMonth - 1, 1).toISOString().slice(0,10);
  const to   = new Date(calYear, calMonth, 0).toISOString().slice(0,10);
  const plan = await API.getContentPlan({ from, to });
  renderCalendar(plan || {});
  const today = new Date().toISOString().slice(0,10);
  const items = (plan && plan[today]) || [];
  $('#todayLabel').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', day:'2-digit', month:'long' });
  renderTodayPlan(items);
  renderPriorities();

  // Wire calendar cell clicks → open content plan modal
  $$('.cal-cell[data-date]').forEach(c => c.addEventListener('click', async () => {
    const date = c.dataset.date;
    const dayItems = (await API.getContentPlan({ date })) || [];
    openDayPlanModal(date, dayItems);
  }));
}

function openDayPlanModal(date, items) {
  const dateLabel = new Date(date).toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long' });
  const itemsHTML = (items.length ? items : []).map(it => `
    <div class="batch-item" data-cp-id="${it.id}" style="cursor:pointer">
      <div class="batch-platform ${platCls(it.platform)}">${platIcon(it.platform)}</div>
      <div class="batch-time">${it.time || ''}</div>
      <div class="batch-body">
        <h4>${escapeHtml(it.title || 'Untitled')}</h4>
        ${it.hook ? `<span class="hook">"${escapeHtml(it.hook)}"</span>` : ''}
        <p>${escapeHtml(it.cta || '')}</p>
      </div>
      <div class="batch-status">
        <span class="status-pill ${it.status || 'idea'}">${it.status || 'idea'}</span>
        <button class="round-mini" data-quick-delete="${it.id}" title="Delete this slot" onclick="event.stopPropagation()"><i class="lucide-trash"></i></button>
      </div>
    </div>
  `).join('') || '<p class="muted" style="text-align:center;padding:20px">Nothing planned for this day yet.</p>';

  const actions = items.length ? [
    { label: 'Clear day', icon: 'lucide-trash', onClick: async () => {
      if (!confirm(`Delete ALL ${items.length} items on ${date}?`)) return;
      await API.clearContentPlanDate(date);
      toast(`Cleared ${items.length} items`);
      closeModal();
      loadSchedule();
      loadStrategy();
    }},
    { label: 'Close', onClick: closeModal },
    { label: 'Add new', primary: true, icon: 'lucide-plus', onClick: () => { closeModal(); openAddContentPlanModal(date); } }
  ] : [
    { label: 'Close', onClick: closeModal },
    { label: 'Add new', primary: true, icon: 'lucide-plus', onClick: () => { closeModal(); openAddContentPlanModal(date); } }
  ];

  openModal({ title: `Plan for ${dateLabel}`, bodyHTML: `<div class="batch-list">${itemsHTML}</div>`, actions });

  // Wire item click + quick-delete
  setTimeout(() => {
    $$('#modalBody [data-cp-id]').forEach(el => el.addEventListener('click', () => {
      const item = items.find(i => i.id === el.dataset.cpId);
      if (item) { closeModal(); openContentPlanModal(item); }
    }));
    $$('#modalBody [data-quick-delete]').forEach(b => b.addEventListener('click', async e => {
      e.stopPropagation();
      const id = b.dataset.quickDelete;
      if (!confirm('Delete this slot?')) return;
      await API.deleteContentPlanScoped(id, 'this');
      toast('Deleted');
      closeModal();
      loadSchedule();
    }));
  }, 50);
}

function openAddContentPlanModal(date) {
  openModal({
    title: 'Add a content slot',
    bodyHTML: `
      <div class="modal-row">
        <div><label>Date</label><input type="date" id="cp-date" value="${date}" /></div>
        <div><label>Time</label><input type="time" id="cp-time" value="12:00" /></div>
      </div>
      <div class="modal-row">
        <div>
          <label>Platform</label>
          <select id="cp-platform">
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
        <div>
          <label>Format</label>
          <select id="cp-format">
            <option value="vlog">Vlog (my day)</option>
            <option value="pov">POV</option>
            <option value="talking-head">Talking head</option>
            <option value="breakdown">Breakdown</option>
            <option value="tutorial">Tutorial</option>
            <option value="story">Story</option>
            <option value="carousel">Carousel</option>
          </select>
        </div>
      </div>
      <div><label>Title</label><input id="cp-title" placeholder='e.g. "POV: chốt deal $50K"' /></div>
      <div><label>Hook (first 7 words)</label><input id="cp-hook" placeholder='2-second grab line' /></div>
      <div><label>CTA</label><input id="cp-cta" placeholder='e.g. Comment "HỆ THỐNG" để nhận template' /></div>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Add', primary: true, icon: 'lucide-plus', onClick: async () => {
          const body = {
            date:     $('#cp-date').value,
            time:     $('#cp-time').value,
            platform: $('#cp-platform').value,
            format:   $('#cp-format').value,
            title:    $('#cp-title').value,
            hook:     $('#cp-hook').value,
            cta:      $('#cp-cta').value,
            status:   'idea'
          };
          await API.addContentPlan(body);
          toast('Added to plan');
          closeModal();
          loadSchedule();
        }}
    ]
  });
}

// ---------- STRATEGY VIEW ----------
function yyyymm(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ---------- PROSPECTS (CRM) ----------
const PROSPECT_STAGES = [
  { key: 'new',         label: 'New' },
  { key: 'dm_sent',     label: 'DM sent' },
  { key: 'replied',     label: 'Replied' },
  { key: 'qualified',   label: 'Qualified' },
  { key: 'call_booked', label: 'Call booked' },
  { key: 'call_done',   label: 'Call done' },
  { key: 'signed',      label: 'Signed' }
];

async function loadProspects() {
  const status = ($$('[data-prospect-status].active')[0]?.dataset.prospectStatus) || 'all';
  const [all, list, summary] = await Promise.all([
    API.prospects('all'),
    API.prospects(status),
    API.prospectsSummary()
  ]);
  renderProspectPipeline(all, summary);
  renderProspectList(list);
  loadApplications().catch(() => {});
}

// -------- APPLICATIONS (Google Form responses) --------
let _appsCurrent = null;
async function loadApplications() {
  const panel = $('#applicationsPanel');
  if (!panel) return;
  const sheet = await fetch('/api/applications/linked-sheet').then(r => r.json()).catch(() => null);
  if (!sheet) {
    renderAppsUnlinked();
    return;
  }
  $('#appsHeading').textContent = sheet.name;
  $('#appsSubhead').innerHTML = `Linked sheet · last synced ${new Date(sheet.linked_at).toLocaleString()}`;
  $('#appsLinkBtn').style.display = 'none';
  $('#appsRefreshBtn').style.display = '';
  $('#appsUnlinkBtn').style.display = '';

  $('#appsList').innerHTML = `<p class="apps-empty"><i class="lucide-refresh-cw"></i> Reading sheet…</p>`;
  try {
    const r = await fetch('/api/applications/list');
    if (r.status === 401) { renderAppsError('Google Drive disconnected. Connect lại trong Settings.'); return; }
    const data = await r.json();
    if (data.error) { renderAppsError(data.error); return; }
    _appsCurrent = data;
    renderAppsStats(data.stats);
    renderAppsList(data.applicants);
  } catch (e) {
    renderAppsError(e.message);
  }
}
function renderAppsUnlinked() {
  $('#appsLinkBtn').style.display = '';
  $('#appsRefreshBtn').style.display = 'none';
  $('#appsUnlinkBtn').style.display = 'none';
  $('#appsStats').innerHTML = '';
  $('#appsList').innerHTML = `<div class="apps-empty">
    <p>Chưa link Sheet nào. Click <b>Link Sheet</b> ở góc trên → pick file <b>2x Challenge (Responses)</b> từ Drive.</p>
  </div>`;
}
function renderAppsError(msg) {
  $('#appsList').innerHTML = `<p class="apps-empty" style="color:#ff8a8a">${escapeHtml(msg)}</p>`;
}
function renderAppsStats(stats) {
  if (!stats) return ($('#appsStats').innerHTML = '');
  $('#appsStats').innerHTML = `
    <div class="apps-stat"><div class="as-label">Total</div><div class="as-value">${stats.total}</div></div>
    <div class="apps-stat tier-a"><div class="as-label">Tier A · 75+</div><div class="as-value">${stats.byTier.A}</div></div>
    <div class="apps-stat tier-b"><div class="as-label">Tier B · 55-74</div><div class="as-value">${stats.byTier.B}</div></div>
    <div class="apps-stat tier-c"><div class="as-label">Tier C · 35-54</div><div class="as-value">${stats.byTier.C}</div></div>
    <div class="apps-stat tier-d"><div class="as-label">Avg score</div><div class="as-value">${stats.avgScore}</div></div>
  `;
}
function renderAppsList(applicants) {
  if (!applicants.length) {
    $('#appsList').innerHTML = `<p class="apps-empty">No applications yet in this sheet.</p>`;
    return;
  }
  const sorted = applicants.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  $('#appsList').innerHTML = sorted.map(a => `
    <div class="app-row" data-row="${a.row_index}">
      <div class="tier-badge ${a.tier}">${a.tier}</div>
      <div>
        <div class="a-name">${escapeHtml(a.name)}</div>
        <div class="a-sub">${escapeHtml(a.email || '—')} · ${a.timestamp ? new Date(a.timestamp).toLocaleDateString() : 'no date'}</div>
      </div>
      <div class="a-handle muted">${escapeHtml(a.handle || '—')}</div>
      <div class="a-meta muted">${escapeHtml((a.goal || a.why || '').slice(0, 60))}${(a.goal || a.why || '').length > 60 ? '…' : ''}</div>
      <div class="a-score">${a.score}</div>
    </div>
  `).join('');
  $$('#appsList .app-row').forEach(el => el.addEventListener('click', () => {
    const a = sorted.find(x => String(x.row_index) === el.dataset.row);
    if (a) openApplicantModal(a);
  }));
}
function openApplicantModal(a) {
  const ans = Object.entries(a.answers || {}).filter(([q]) => q);
  openModal({
    title: a.name + ' · ' + a.tier + ' tier (score ' + a.score + ')',
    bodyHTML: `
      <div class="applicant-detail">
        <div class="qa-row"><div class="qa-q">Contact</div>
          <div class="qa-a">${escapeHtml(a.email || '—')} · ${escapeHtml(a.phone || '—')} · ${escapeHtml(a.handle || '—')}</div></div>
        ${ans.map(([q, v]) => `
          <div class="qa-row">
            <div class="qa-q">${escapeHtml(q)}</div>
            <div class="qa-a">${escapeHtml(v || '—')}</div>
          </div>`).join('')}
      </div>
    `,
    actions: [
      { label: 'Close', onClick: closeModal },
      { label: 'Add to Students', primary: true, icon: 'lucide-user-plus', onClick: async () => {
          const r = await fetch('/api/applications/' + a.row_index + '/to-student', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(a)
          });
          const out = await r.json();
          if (out.ok) { toast('Added to Students pipeline · ' + a.tier + ' tier'); closeModal(); loadProspects(); }
          else { toast('Failed: ' + (out.error || 'unknown')); }
      }}
    ]
  });
}

// Wire applications buttons (once)
$('#appsLinkBtn')?.addEventListener('click', () => {
  openDrivePicker(async (file) => {
    try {
      const r = await fetch('/api/applications/linked-sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: file.id, url: file.url, name: file.name })
      });
      if (r.status === 401) return toast('Google Drive not connected');
      const saved = await r.json();
      if (saved.error) return toast(saved.error);
      toast('Linked: ' + saved.name);
      loadApplications();
    } catch (e) { toast('Link failed: ' + e.message); }
  });
});
$('#appsRefreshBtn')?.addEventListener('click', () => loadApplications());
$('#appsUnlinkBtn')?.addEventListener('click', async () => {
  if (!confirm('Unlink this sheet?')) return;
  await fetch('/api/applications/linked-sheet', { method: 'DELETE' });
  _appsCurrent = null;
  loadApplications();
});

function renderProspectPipeline(all, summary) {
  const root = $('#prospectsPipeline');
  if (!root) return;
  root.innerHTML = PROSPECT_STAGES.map(s => {
    const items = all.filter(p => p.status === s.key).slice(0, 3);
    const count = summary.buckets?.[s.key] || items.length;
    return `
      <div class="pl-col ${s.key}">
        <div class="pl-col-head"><span>${escapeHtml(s.label)}</span><span class="pl-count">${count}</span></div>
        ${items.map(p => `
          <div class="pl-item" data-prospect-id="${p.id}">
            <div class="pi-handle">${escapeHtml(p.handle || p.display_name || '?')}</div>
            <div class="pi-meta">${escapeHtml((p.platform || '').toUpperCase())}${p.estimated_income ? ' · ' + escapeHtml(p.estimated_income) : ''}</div>
          </div>
        `).join('')}
        ${count > items.length ? `<div class="muted small" style="text-align:center;margin-top:6px">+${count - items.length} more</div>` : ''}
      </div>
    `;
  }).join('');
  $$('#prospectsPipeline [data-prospect-id]').forEach(el =>
    el.addEventListener('click', () => openProspectModal(el.dataset.prospectId)));
}

function renderProspectList(list) {
  const root = $('#prospectsList');
  if (!root) return;
  if (!list.length) {
    root.innerHTML = `<div style="text-align:center;padding:30px"><p class="muted">No prospects yet. Click "+ Add prospect" or use the bookmarklet on a TikTok profile.</p></div>`;
    return;
  }
  const now = Date.now();
  const icon = { tiktok: '<i class="lucide-music"></i>', instagram: '<i class="lucide-instagram"></i>', youtube: '<i class="lucide-youtube"></i>' };
  root.innerHTML = list.map(p => {
    let followupCls = '', followupLabel = '';
    if (p.next_followup_at) {
      const due = new Date(p.next_followup_at).getTime();
      const days = Math.round((due - now) / 86400000);
      if (days < 0) { followupCls = 'overdue'; followupLabel = `${Math.abs(days)}d overdue`; }
      else if (days <= 1) { followupCls = 'due'; followupLabel = days === 0 ? 'today' : 'tomorrow'; }
      else followupLabel = 'in ' + days + 'd';
    }
    return `
      <div class="prospect-row" data-prospect-id="${p.id}">
        <div class="pr-icon ${p.platform}">${icon[p.platform] || ''}</div>
        <div>
          <div class="pr-handle">${p.url ? `<a href="${p.url}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(p.handle)}</a>` : escapeHtml(p.handle)}</div>
          <div class="pr-meta">${escapeHtml(p.display_name || '')}${p.followers ? ' · ' + fmt(p.followers) + ' followers' : ''}</div>
        </div>
        <div>
          <div>${escapeHtml(p.estimated_income || '—')}</div>
          <div class="pr-meta">${escapeHtml(p.niche || '')}</div>
        </div>
        <div class="pr-fit">${p.fit_score || 0}</div>
        <select data-prospect-transition="${p.id}" onclick="event.stopPropagation()">
          ${PROSPECT_STAGES.concat([{key:'dropped',label:'Dropped'}]).map(s => `<option value="${s.key}" ${s.key===p.status?'selected':''}>${s.label}</option>`).join('')}
        </select>
        <div class="pr-followup ${followupCls}">${followupLabel}</div>
        <button class="round-mini" data-prospect-delete="${p.id}" onclick="event.stopPropagation()"><i class="lucide-x"></i></button>
      </div>
    `;
  }).join('');

  $$('[data-prospect-id]').forEach(el => el.addEventListener('click', () => openProspectModal(el.dataset.prospectId)));
  $$('[data-prospect-transition]').forEach(sel => sel.addEventListener('change', async () => {
    await API.transitionProspect(sel.dataset.prospectTransition, sel.value);
    toast('Status updated');
    loadProspects();
  }));
  $$('[data-prospect-delete]').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm('Delete this prospect?')) return;
    await API.deleteProspect(b.dataset.prospectDelete);
    toast('Deleted');
    loadProspects();
  }));
}

async function openProspectModal(id) {
  const p = await API.getProspect(id);
  if (!p) return toast('Not found');
  const DM_TEMPLATES = [
    'Compliment-first', 'Curiosity hook', 'Peer-level', 'Pain-agitate', 'Straight-offer'
  ];
  openModal({
    title: p.handle || 'Prospect',
    bodyHTML: `
      ${p.url ? `<p class="muted small"><a href="${p.url}" target="_blank" style="color:var(--violet)"><i class="lucide-external-link"></i> ${escapeHtml(p.url)}</a></p>` : ''}
      <div class="modal-row">
        <div><label>Handle</label><input id="pm-handle" value="${escapeHtml(p.handle || '')}" /></div>
        <div>
          <label>Platform</label>
          <select id="pm-platform">
            <option value="tiktok"    ${p.platform==='tiktok'?'selected':''}>TikTok</option>
            <option value="instagram" ${p.platform==='instagram'?'selected':''}>Instagram</option>
            <option value="youtube"   ${p.platform==='youtube'?'selected':''}>YouTube</option>
          </select>
        </div>
      </div>
      <div><label>Display name</label><input id="pm-name" value="${escapeHtml(p.display_name || '')}" /></div>
      <div class="modal-row">
        <div><label>Followers</label><input type="number" id="pm-followers" value="${p.followers || 0}" /></div>
        <div><label>Estimated income</label><input id="pm-income" value="${escapeHtml(p.estimated_income || '')}" placeholder="e.g. 12tr/month" /></div>
      </div>
      <div><label>Niche / content style</label><input id="pm-niche" value="${escapeHtml(p.niche || '')}" placeholder="e.g. IELTS tutor · short clips" /></div>
      <div class="modal-row">
        <div><label>Fit score (0-100)</label><input type="number" id="pm-fit" value="${p.fit_score || 0}" min="0" max="100" /></div>
        <div>
          <label>Status</label>
          <select id="pm-status">
            ${PROSPECT_STAGES.concat([{key:'dropped',label:'Dropped'}]).map(s => `<option value="${s.key}" ${s.key===p.status?'selected':''}>${s.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label>DM template used</label>
        <select id="pm-tmpl"><option value="">— none —</option>${DM_TEMPLATES.map(t => `<option ${t===p.dm_template?'selected':''}>${t}</option>`).join('')}</select>
      </div>
      <div>
        <label>Next followup date</label>
        <input type="date" id="pm-followup" value="${p.next_followup_at ? p.next_followup_at.slice(0,10) : ''}" />
      </div>
      <div><label>Notes</label><textarea id="pm-notes" rows="4">${escapeHtml(p.notes || '')}</textarea></div>
      ${p.application_data ? `<div><label>Application data (read-only)</label><textarea readonly rows="6" style="font-family:ui-monospace,monospace;font-size:11px">${escapeHtml(JSON.stringify(p.application_data, null, 2))}</textarea></div>` : ''}
    `,
    actions: [
      { label: 'Delete', icon: 'lucide-trash', onClick: async () => {
        if (!confirm('Delete this prospect?')) return;
        await API.deleteProspect(id);
        toast('Deleted');
        closeModal();
        loadProspects();
      }},
      { label: 'Cancel', onClick: closeModal },
      { label: 'Save', primary: true, icon: 'lucide-save', onClick: async () => {
        await API.updateProspect(id, {
          handle:           $('#pm-handle').value,
          platform:         $('#pm-platform').value,
          display_name:     $('#pm-name').value,
          followers:        parseInt($('#pm-followers').value) || 0,
          estimated_income: $('#pm-income').value,
          niche:            $('#pm-niche').value,
          fit_score:        parseInt($('#pm-fit').value) || 0,
          status:           $('#pm-status').value,
          dm_template:      $('#pm-tmpl').value,
          notes:            $('#pm-notes').value,
          next_followup_at: $('#pm-followup').value ? $('#pm-followup').value + 'T00:00:00.000Z' : null
        });
        toast('Saved');
        closeModal();
        loadProspects();
      }}
    ]
  });
}

function openAddProspectModal() {
  openModal({
    title: 'Add prospect',
    bodyHTML: `
      <p class="muted small">Paste a TikTok / Instagram / YouTube profile URL — we'll auto-detect handle + platform.</p>
      <div><label>Profile URL</label><input id="ap-url" placeholder="https://tiktok.com/@username · https://instagram.com/..." /></div>
      <div class="modal-row">
        <div><label>Handle (auto-fill)</label><input id="ap-handle" placeholder="@username" /></div>
        <div>
          <label>Platform</label>
          <select id="ap-platform">
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
          </select>
        </div>
      </div>
      <div><label>Display name</label><input id="ap-name" /></div>
      <div class="modal-row">
        <div><label>Followers</label><input type="number" id="ap-followers" value="0" /></div>
        <div><label>Estimated income</label><input id="ap-income" placeholder="e.g. 10-15tr/month" /></div>
      </div>
      <div><label>Niche / content style</label><input id="ap-niche" placeholder="e.g. IELTS tutor · short videos" /></div>
      <div><label>Why they're a fit (notes)</label><textarea id="ap-notes" rows="3"></textarea></div>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Add prospect', primary: true, icon: 'lucide-plus', onClick: async () => {
        const url = $('#ap-url').value.trim();
        await API.addProspect({
          url,
          handle:           $('#ap-handle').value.trim(),
          platform:         $('#ap-platform').value,
          display_name:     $('#ap-name').value,
          followers:        parseInt($('#ap-followers').value) || 0,
          estimated_income: $('#ap-income').value,
          niche:            $('#ap-niche').value,
          notes:            $('#ap-notes').value
        });
        toast('Prospect added');
        closeModal();
        loadProspects();
      }}
    ]
  });
  // Auto-detect from URL paste
  $('#ap-url')?.addEventListener('input', e => {
    const u = e.target.value;
    const m = u.match(/@[\w.\-]+/);
    if (m) $('#ap-handle').value = m[0];
    if (/tiktok/i.test(u))   $('#ap-platform').value = 'tiktok';
    else if (/instagram/i.test(u)) $('#ap-platform').value = 'instagram';
    else if (/youtu/i.test(u))     $('#ap-platform').value = 'youtube';
  });
}

function openProspectBookmarkletModal() {
  const origin = location.origin;
  const code = `javascript:(function(){var u=location.href,h='',n='',f=0,p='';
    var m;
    if(/tiktok\\.com/.test(u)){p='tiktok';
      m=u.match(/@[\\w.\\-]+/);if(m)h=m[0];
      n=(document.querySelector('h1, h2, [data-e2e=\\"user-title\\"]')||{}).textContent||'';
      var fEl=document.querySelector('[data-e2e=\\"followers-count\\"], strong[title*=\\"Follower\\"]');
      if(fEl)f=fEl.textContent;}
    else if(/instagram\\.com/.test(u)){p='instagram';
      m=u.match(/instagram\\.com\\/([^/?#]+)/);if(m)h='@'+m[1];
      n=(document.querySelector('header h2, header h1')||{}).textContent||'';}
    else if(/youtu/.test(u)){p='youtube';
      m=u.match(/@[\\w.\\-]+/);if(m)h=m[0];
      n=(document.querySelector('ytd-channel-name a, #channel-name')||{}).textContent||'';}
    var img=document.querySelector('meta[property=\\"og:image\\"]');var av=img?img.content:'';
    fetch('${origin}/api/prospects/ingest',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url:u,handle:h,platform:p,display_name:n.trim(),followers:f,avatar_url:av})})
      .then(r=>r.json()).then(d=>alert(d.duplicate?'Already in your list ✓':'Added to Prospects ✓'));})()`;
  const encoded = code.replace(/\s+/g, ' ');

  openModal({
    title: 'Save TikTok / IG / YouTube profile → Prospects',
    bodyHTML: `
      <p class="muted">Drag the button below to your bookmarks bar. Then on any TikTok / Instagram / YouTube creator profile, click it — they get saved into Prospects automatically.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${encoded}" class="btn-pill primary lg" style="text-decoration:none;display:inline-flex">
          <i class="lucide-target"></i> Add to Prospects
        </a>
      </div>
      <p class="muted small"><b>Setup:</b><br>
        1. Make sure bookmarks bar is visible (Ctrl+Shift+B)<br>
        2. <b>Drag</b> the violet button to the bar<br>
        3. Visit a TT / IG / YT profile<br>
        4. Click the bookmark · auto-saves @handle + name + avatar</p>
      <p class="muted small" style="margin-top:14px">⚠️ Note: TT now uses random class names so follower count may not auto-extract — edit the prospect after to fill the number.</p>
    `,
    actions: [{ label: 'Got it', primary: true, onClick: closeModal }]
  });
}

// Application form generator (Soo Wei-style)
function openAppFormModal() {
  const formQuestions = `2X CHALLENGE · APPLICATION FORM
(Tạo Google Form mới → paste từng câu hỏi này thành 1 question)

═══════════════════════════════════════════════════
SECTION 1 · ABOUT YOU
═══════════════════════════════════════════════════

1. Tên đầy đủ + tuổi
[Short answer · Required]

2. Số điện thoại / Zalo (mình sẽ liên hệ qua kênh này)
[Short answer · Required]

3. Email
[Short answer · Required]

4. Link kênh TikTok / Instagram / YouTube hiện tại của bạn
[Short answer · Required · "all current channels separated by commas"]

5. Bạn dạy môn gì? Đối tượng học viên hiện tại là ai?
[Paragraph · Required]

═══════════════════════════════════════════════════
SECTION 2 · CURRENT REALITY
═══════════════════════════════════════════════════

6. Thu nhập trung bình 3 tháng gần nhất từ dạy học (triệu/tháng)?
[Multiple choice]
  ○ Dưới 5 triệu
  ○ 5-10 triệu
  ○ 10-15 triệu  ← target audience
  ○ 15-20 triệu
  ○ 20-30 triệu
  ○ Trên 30 triệu

7. Bạn đang dạy bao nhiêu giờ/tuần?
[Multiple choice]
  ○ Dưới 10h
  ○ 10-20h
  ○ 20-30h
  ○ 30-40h
  ○ Trên 40h

8. Bạn đã thử cách gì để tăng thu nhập (không hiệu quả)?
[Paragraph · Required · "be specific — what didn't work and why?"]

═══════════════════════════════════════════════════
SECTION 3 · GOAL & COMMITMENT
═══════════════════════════════════════════════════

9. Mục tiêu THU NHẬP cụ thể của bạn sau 8 tuần là bao nhiêu? (con số chính xác)
[Short answer · Required · "VND/tháng — be specific"]

10. Tại sao MỤC TIÊU NÀY quan trọng với bạn lúc này? (Mục tiêu sâu sau số tiền là gì?)
[Paragraph · Required]

11. Bạn có sẵn sàng commit MINIMUM 8h/tuần trong 8 tuần liên tục không?
[Multiple choice]
  ○ Yes — 100% commit
  ○ Yes — nhưng có thể có 1-2 tuần bận
  ○ Maybe — depends
  ○ No

12. Bạn có sẵn sàng QUAY 1-2 VIDEO UPDATE/tuần để document journey trên kênh tôi không?
[Multiple choice]
  ○ Yes — 100% ok
  ○ Yes — nhưng face blurred hoặc voice-only
  ○ Maybe
  ○ No · prefer privacy

═══════════════════════════════════════════════════
SECTION 4 · QUALIFIER (filter tire-kickers)
═══════════════════════════════════════════════════

13. Tại sao TÔI nên chọn BẠN (thay vì 500 ứng viên khác)?
[Paragraph · Required · "minimum 100 words, be specific"]

14. Nếu chương trình đáng giá 25 triệu VND, nhưng tôi mời bạn FREE, bạn có WILLING TO INVEST sau 8 tuần (nếu thấy giá trị) không?
[Multiple choice]
  ○ Yes — nếu thấy ROI rõ
  ○ Phụ thuộc vào kết quả
  ○ No

15. Bạn nghe về challenge này từ đâu? (DM của tôi / video / referral / khác)
[Multiple choice]

═══════════════════════════════════════════════════
THANK YOU MESSAGE (Customize trong settings)
═══════════════════════════════════════════════════

"Cảm ơn bạn đã apply 2X Challenge. Mình review từng application kỹ trong 48h.
Nếu shortlist, mình sẽ DM bạn cho buổi interview 15 phút.
Bạn cũng có thể follow @YOURUSERNAME để xem hành trình 5 người được chọn."

═══════════════════════════════════════════════════
WEBHOOK SETUP (auto-sync vào Contento Leads + Prospects)
═══════════════════════════════════════════════════

Sau khi tạo Form xong:
1. Vào Strategy → Leads → "Connect Google Form" → copy Apps Script
2. Paste vào Form's Apps Script (Extensions)
3. Set trigger: onFormSubmit → On form submit
4. Mỗi submission tự sync vào Contento → bạn chấm điểm + chọn 5 người

═══════════════════════════════════════════════════
SCORING RUBRIC (chấm 100đ — chọn top 5)
═══════════════════════════════════════════════════

Q9 (mục tiêu cụ thể):
  + 20đ nếu có con số rõ + lý do thuyết phục
  + 10đ nếu có con số mơ hồ
  + 0đ nếu không có số

Q10 (deeper why):
  + 20đ nếu kết nối với gia đình / dream cụ thể
  + 10đ generic
  + 0đ "muốn có nhiều tiền"

Q11 (commitment):
  + 15đ nếu "100% commit"
  + 5đ nếu "có thể có tuần bận"
  + 0đ Maybe/No → LOẠI NGAY

Q12 (sẵn sàng quay):
  + 15đ "Yes 100%"
  + 5đ "blurred/voice-only"
  + 0đ "No" → LOẠI

Q13 (why you):
  + 30đ unique angle + cá tính + specific
  + 15đ generic nhưng OK
  + 0đ <100 words hoặc copy-paste

→ Top 5 = highest score + đa dạng background
`;

  openModal({
    title: '2X Challenge — Application Form Template (Soo Wei Goh style)',
    bodyHTML: `
      <p class="muted">Copy đoạn dưới → tạo <b>Google Form</b> mới → tạo từng câu hỏi theo đúng format. Mất ~10 phút setup. Sau đó connect webhook vào Contento để auto-sync mỗi submission.</p>
      <div style="position:relative">
        <textarea id="appform-text" readonly rows="20" style="font-family:ui-monospace,'JetBrains Mono',monospace;font-size:11px;line-height:1.5;width:100%">${escapeHtml(formQuestions)}</textarea>
        <button class="btn-pill sm" id="appform-copy" style="position:absolute;top:8px;right:8px"><i class="lucide-copy"></i> Copy</button>
      </div>
      <p class="muted small" style="margin-top:12px">📋 <b>Câu 13 quan trọng nhất</b> · paragraph &gt;100 words · tự lọc 80% applicants không nghiêm túc.</p>
    `,
    actions: [{ label: 'Close', primary: true, onClick: closeModal }]
  });

  $('#appform-copy')?.addEventListener('click', () => {
    $('#appform-text').select();
    document.execCommand('copy');
    toast('Copied — paste vào Google Forms');
  });
}

// ---------- SERIES PLANNER ----------
// Weekday convention: 0=Sun ... 6=Sat (matches JS getDay())
const _seriesState = { rows: [], initialized: false };
const WD_LABELS = ['CN','T2','T3','T4','T5','T6','T7'];
const FORMAT_CHOICES = [
  { value: '', label: '— Format —' },
  { value: 'pov', label: 'POV story' },
  { value: 'vlog', label: 'Vlog · BTS' },
  { value: 'coaching', label: 'Coaching style' },
  { value: 'talking-head', label: 'Talking head · tips' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'breakdown', label: 'Framework breakdown' },
  { value: 'tutorial', label: 'Tutorial · how-to' },
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'documentary', label: 'Documentary · series' },
  { value: 'reel', label: 'Reel · cross-post' },
  { value: 'carousel', label: 'Carousel' }
];

async function loadSeriesPlanner() {
  if ($('#sp-start') && !$('#sp-start').value) {
    $('#sp-start').value = today();
  }
  const rows = await API.listSeries();
  _seriesState.rows = rows.length ? rows.map(serverToRow) : [];
  if (!_seriesState.initialized) {
    bindSeriesPlannerControls();
    _seriesState.initialized = true;
  }
  // Pre-fill strategy fields from first row if exists
  if (_seriesState.rows.length) {
    const first = _seriesState.rows[0];
    if (!$('#sp-goal').value) $('#sp-goal').value = first.goal_text || '';
    $('#sp-platform').value = first.platform || 'tiktok';
    $('#sp-weeks').value = String(first.repeat_weeks || 4);
    if (!$('#sp-start').value) $('#sp-start').value = first.start_date;
    if (!$('#sp-target-views').value) $('#sp-target-views').value = first.target_views || '';
  }
  renderSeriesRows();
}

function serverToRow(s) {
  return {
    id: s.id, name: s.name || '',
    platform: s.platform || 'tiktok',
    goal_text: s.goal_text || '', target_views: s.target_views || 0,
    weekdays: Array.isArray(s.weekdays) ? s.weekdays : [],
    repeat_weeks: s.repeat_weeks || 4,
    start_date: s.start_date || today(),
    post_time: s.post_time || '20:00',
    format: s.format || '',
    color: s.color || '#a78bfa',
    status: s.status || 'active',
    _existed: true
  };
}

function newSeriesRow(partial = {}) {
  return {
    id: null,
    name: '', platform: $('#sp-platform')?.value || 'tiktok',
    goal_text: $('#sp-goal')?.value || '',
    target_views: 0,
    weekdays: [], repeat_weeks: parseInt($('#sp-weeks')?.value || 4, 10),
    start_date: $('#sp-start')?.value || today(),
    post_time: '20:00', format: '',
    color: '#a78bfa', status: 'active',
    _existed: false, ...partial
  };
}

function bindSeriesPlannerControls() {
  $('#sp-add')?.addEventListener('click', () => {
    _seriesState.rows.push(newSeriesRow());
    renderSeriesRows();
  });
  $('#sp-template')?.addEventListener('click', () => {
    $('#sp-goal').value = 'Giúp tôi đạt 1M views trên TikTok Tuwi NG';
    $('#sp-platform').value = 'tiktok';
    $('#sp-weeks').value = '4';
    $('#sp-target-views').value = '1000000';
    _seriesState.rows = [
      newSeriesRow({ name: 'Building ANG CONSULTING',                          weekdays: [1],       format: 'vlog' }),
      newSeriesRow({ name: 'Học 30 kỹ năng để mở lớp online (2026)',           weekdays: [2,4,6],   format: 'tutorial' }),
      newSeriesRow({ name: 'POV: 1 ngày...',                                    weekdays: [3],       format: 'pov' }),
      newSeriesRow({ name: 'Storytelling',                                      weekdays: [5],       format: 'storytelling' }),
      newSeriesRow({ name: 'POV: enjoy life',                                   weekdays: [0],       format: 'pov' })
    ];
    renderSeriesRows();
  });
  $('#sp-materialize')?.addEventListener('click', materializeSeries);

  // Strategy header fields propagate to all rows on change
  ['sp-platform', 'sp-weeks', 'sp-start', 'sp-goal', 'sp-target-views'].forEach(id => {
    $('#' + id)?.addEventListener('change', () => {
      _seriesState.rows.forEach(r => {
        r.platform     = $('#sp-platform').value;
        r.repeat_weeks = parseInt($('#sp-weeks').value, 10);
        r.start_date   = $('#sp-start').value;
        r.goal_text    = $('#sp-goal').value;
        r.target_views = Number($('#sp-target-views').value || 0);
      });
      updateSeriesSummary();
    });
  });
}

function renderSeriesRows() {
  const root = $('#sp-list');
  if (!root) return;
  if (!_seriesState.rows.length) {
    root.innerHTML = `<div class="empty-state" style="padding:24px;text-align:center;color:var(--text-2)">
      Chưa có series. Click <b>Add series</b> hoặc <b>Use Tuwi NG template</b> để bắt đầu.
    </div>`;
    updateSeriesSummary();
    return;
  }
  root.innerHTML = _seriesState.rows.map((r, i) => seriesRowHtml(r, i)).join('');

  // Wire row inputs
  root.querySelectorAll('.series-row').forEach(rowEl => {
    const i = parseInt(rowEl.dataset.idx, 10);
    rowEl.querySelector('.sr-name')?.addEventListener('input', e => _seriesState.rows[i].name = e.target.value);
    rowEl.querySelector('.sr-format')?.addEventListener('change', e => _seriesState.rows[i].format = e.target.value);
    rowEl.querySelector('.sr-platform')?.addEventListener('change', e => _seriesState.rows[i].platform = e.target.value);
    rowEl.querySelector('.sr-time')?.addEventListener('change', e => _seriesState.rows[i].post_time = e.target.value);
    rowEl.querySelector('.sr-repeat')?.addEventListener('change', e => {
      _seriesState.rows[i].repeat_weeks = parseInt(e.target.value, 10);
      updateSeriesSummary();
    });
    rowEl.querySelector('.sr-del')?.addEventListener('click', () => {
      _seriesState.rows.splice(i, 1);
      renderSeriesRows();
    });
    rowEl.querySelectorAll('.wd').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.dataset.day, 10);
        const arr = _seriesState.rows[i].weekdays;
        const idx = arr.indexOf(d);
        if (idx >= 0) arr.splice(idx, 1); else arr.push(d);
        arr.sort();
        btn.classList.toggle('on');
        updateSeriesSummary();
      });
    });
  });
  updateSeriesSummary();
}

function seriesRowHtml(r, i) {
  const wdHtml = WD_LABELS.map((lbl, d) => `
    <button type="button" class="wd ${r.weekdays.includes(d) ? 'on' : ''}" data-day="${d}">${lbl}</button>
  `).join('');
  const fmtOpts = FORMAT_CHOICES.map(f =>
    `<option value="${f.value}" ${f.value === r.format ? 'selected' : ''}>${f.label}</option>`
  ).join('');
  const platOpts = [
    { value: 'tiktok', label: 'TikTok' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'instagram', label: 'Instagram' }
  ].map(p => `<option value="${p.value}" ${p.value === r.platform ? 'selected' : ''}>${p.label}</option>`).join('');
  return `
    <div class="series-row" data-idx="${i}">
      <input type="text" class="sr-name" placeholder="Series name" value="${escapeAttr(r.name)}" />
      <select class="sr-format">${fmtOpts}</select>
      <select class="sr-platform">${platOpts}</select>
      <div class="weekday-pickers">${wdHtml}</div>
      <input type="time" class="sr-time" value="${r.post_time || '20:00'}" />
      <select class="sr-repeat">
        <option value="1"  ${r.repeat_weeks===1  ? 'selected':''}>1 tuần</option>
        <option value="2"  ${r.repeat_weeks===2  ? 'selected':''}>2 tuần</option>
        <option value="4"  ${r.repeat_weeks===4  ? 'selected':''}>1 tháng</option>
        <option value="8"  ${r.repeat_weeks===8  ? 'selected':''}>2 tháng</option>
        <option value="12" ${r.repeat_weeks===12 ? 'selected':''}>3 tháng</option>
        <option value="24" ${r.repeat_weeks===24 ? 'selected':''}>6 tháng</option>
      </select>
      <button class="sr-del" title="Remove series"><i class="lucide-trash-2"></i></button>
    </div>
  `;
}

function escapeAttr(s) { return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function updateSeriesSummary() {
  const el = $('#sp-summary');
  if (!el) return;
  const totalPosts = _seriesState.rows.reduce((t, r) =>
    t + (r.weekdays?.length || 0) * (r.repeat_weeks || 0), 0);
  const seriesCount = _seriesState.rows.filter(r => r.name && r.weekdays.length).length;
  if (!totalPosts) { el.textContent = ''; return; }
  el.innerHTML = `→ Sẽ tạo <b>${totalPosts}</b> slots từ <b>${seriesCount}</b> series active. Bấm <b>Push to Schedule</b> để đẩy vào content_plan.`;
}

async function materializeSeries() {
  const valid = _seriesState.rows.filter(r => r.name && r.weekdays.length);
  if (!valid.length) { toast('Hãy thêm ít nhất 1 series có tên + weekday'); return; }
  toast('Saving series…');
  // Sync rows to server (create or update)
  for (const r of valid) {
    const payload = {
      name: r.name, platform: r.platform,
      goal_text: r.goal_text, target_views: r.target_views,
      weekdays: r.weekdays, repeat_weeks: r.repeat_weeks,
      start_date: r.start_date, post_time: r.post_time,
      format: r.format, color: r.color, status: 'active'
    };
    if (r.id) {
      await API.updateSeries(r.id, payload);
    } else {
      const created = await API.createSeries(payload);
      if (created?.id) r.id = created.id;
    }
  }
  // Delete any rows that were removed (have id but no longer in state — already handled by removing from state)
  toast('Generating schedule slots…');
  const out = await API.materializeAllSeries();
  toast(`Pushed ${out?.total_posts || 0} slots to Schedule`);
  if (typeof loadSchedule === 'function') loadSchedule();
}

// ---------- CAMPAIGNS ----------
async function loadCampaigns() {
  const list = await API.campaigns();
  renderCampaignList(list);
}

function renderCampaignList(list) {
  const root = $('#campaignsList');
  if (!root) return;
  if (!list.length) {
    root.innerHTML = `<div class="card big-card" style="text-align:center;padding:40px">
      <h3 style="margin:0 0 8px">No campaigns yet</h3>
      <p class="muted">Click "Use 30M template" để tạo series "Giúp 5 người lạ kiếm 30tr trong 30 ngày" ngay.</p>
    </div>`;
    return;
  }
  root.innerHTML = `<div class="campaigns-grid">${list.map(c => campaignCardHtml(c)).join('')}</div>`;
  $$('[data-open-campaign]').forEach(el => el.addEventListener('click', () => openCampaign(el.dataset.openCampaign)));
}

function campaignCardHtml(c) {
  const startD = new Date(c.start_date), endD = new Date(c.end_date);
  const days = Math.round((endD - startD) / 86400000) + 1;
  return `
    <div class="campaign-card" data-open-campaign="${c.id}" style="--accent:${c.color}">
      <div class="cc-head">
        <div>
          <h3>${escapeHtml(c.name)}</h3>
          <p class="cc-dates">${c.start_date} → ${c.end_date} · ${days} days</p>
        </div>
        <span class="cc-status ${c.status}">${c.status}</span>
      </div>
      ${c.thesis ? `<p class="cc-thesis">"${escapeHtml(c.thesis)}"</p>` : ''}
      <div class="cc-targets">
        <div class="cc-target"><b>${fmt(c.target_views)}</b>views</div>
        <div class="cc-target"><b>${fmt(c.target_leads)}</b>leads</div>
        <div class="cc-target"><b>${fmt(c.target_customers)}</b>sales</div>
        <div class="cc-target"><b>$${fmt(c.target_revenue)}</b>revenue</div>
      </div>
      <div class="cc-meta">
        <span>${c.daily_yt} YT + ${c.daily_tt} TT/day${c.daily_ig ? ' + ' + c.daily_ig + ' IG' : ''}</span>
        <span>${days * (c.daily_yt + c.daily_tt + c.daily_ig)} posts total</span>
      </div>
    </div>
  `;
}

async function openCampaign(id) {
  const c = await API.getCampaign(id);
  if (!c) return toast('Campaign not found');
  const detail = $('#campaignDetail');
  $('#campaignsList').hidden = true;
  detail.hidden = false;
  detail.innerHTML = campaignDetailHtml(c);

  // Wire actions
  $('.cd-back')?.addEventListener('click', closeCampaignDetail);
  $('#cd-materialize')?.addEventListener('click', async () => {
    if (!confirm('Materialize 30 days into Schedule? (clears any existing items in this campaign)')) return;
    toast('Materializing 30 days…');
    const r = await API.materializeCampaign(id);
    toast(`${r?.added || 0} posts added to Schedule`);
    loadSchedule();
    openCampaign(id);
  });
  $('#cd-edit')?.addEventListener('click', () => openEditCampaignModal(c));
  $('#cd-delete')?.addEventListener('click', async () => {
    if (!confirm(`Delete "${c.name}" + all its scheduled content?`)) return;
    await API.deleteCampaign(id);
    toast('Deleted');
    closeCampaignDetail();
    loadCampaigns();
    loadSchedule();
  });
  $$('[data-phase-toggle]').forEach(el => el.addEventListener('click', () => {
    const themes = el.querySelector('.pb-themes');
    if (themes) themes.hidden = !themes.hidden;
  }));
}

function closeCampaignDetail() {
  $('#campaignDetail').hidden = true;
  $('#campaignDetail').innerHTML = '';
  $('#campaignsList').hidden = false;
}

function campaignDetailHtml(c) {
  const startD = new Date(c.start_date), endD = new Date(c.end_date);
  const totalDays = Math.round((endD - startD) / 86400000) + 1;
  const phases = (c.phases || []).sort((a, b) => a.phase_idx - b.phase_idx);
  const cols = phases.map(p => `${p.end_day - p.start_day + 1}fr`).join(' ');

  const stats = c.stats || { posts_total: 0, posts_done: 0, total_views: 0, total_leads: 0 };
  const targets = [
    { label: 'Views',    have: stats.total_views || 0, want: c.target_views },
    { label: 'Leads',    have: stats.total_leads || 0, want: c.target_leads },
    { label: 'Customers',have: 0,                       want: c.target_customers },
    { label: 'Revenue',  have: 0,                       want: c.target_revenue, money: true }
  ];

  return `
    <div class="campaign-detail-card">
      <button class="cd-back"><i class="lucide-chevron-left"></i> All campaigns</button>
      <div class="cd-head">
        <div>
          <h2>${escapeHtml(c.name)}</h2>
          <p class="cd-meta">${c.start_date} → ${c.end_date} · ${totalDays} days · ${c.daily_yt} YT + ${c.daily_tt} TT/day · status: <b style="color:var(--violet)">${c.status}</b></p>
          ${c.thesis ? `<p class="cd-meta" style="margin-top:8px;font-style:italic">"${escapeHtml(c.thesis)}"</p>` : ''}
          ${c.description ? `<p class="cd-meta" style="margin-top:6px;color:var(--text-2)">${escapeHtml(c.description)}</p>` : ''}
        </div>
        <div class="cd-actions">
          <button class="btn-pill sm" id="cd-edit"><i class="lucide-edit"></i> Edit</button>
          <button class="btn-pill sm" id="cd-delete"><i class="lucide-trash"></i> Delete</button>
          <button class="btn-pill primary sm" id="cd-materialize"><i class="lucide-calendar-plus"></i> Materialize 30 days</button>
        </div>
      </div>

      <!-- Target stats -->
      <div class="cd-target-grid">
        ${targets.map(t => {
          const pct = t.want ? Math.min(100, Math.round((t.have / t.want) * 100)) : 0;
          const haveStr = t.money ? '$' + fmt(t.have) : fmt(t.have);
          const wantStr = t.money ? '$' + fmt(t.want) : fmt(t.want);
          return `
            <div class="cd-target">
              <div class="label">${t.label}</div>
              <div class="vals"><b>${haveStr}</b><span class="target">/ ${wantStr}</span></div>
              <div class="bar"><div style="width:${pct}%"></div></div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Phase timeline -->
      <div class="phase-timeline" style="--cols:${cols}">
        ${phases.map(p => `
          <div class="phase-block p${p.phase_idx}" data-phase-toggle>
            <div class="pb-num">Phase ${p.phase_idx}</div>
            <h4>${escapeHtml(p.name)}</h4>
            <span class="pb-days">Day ${p.start_day}-${p.end_day} · ${p.end_day - p.start_day + 1} days</span>
            <p class="pb-focus">${escapeHtml(p.focus || '')}</p>
            ${p.description ? `<p class="pb-focus" style="color:var(--text-3)">${escapeHtml(p.description)}</p>` : ''}
            <ul class="pb-themes" hidden>
              ${(p.themes || []).map(t => `<li>${escapeHtml(t)}</li>`).join('')}
            </ul>
            <span class="muted small" style="margin-top:4px">▾ click to expand themes</span>
          </div>
        `).join('')}
      </div>

      <div class="muted small" style="margin-top:14px">
        ${stats.posts_total
          ? `${stats.posts_done}/${stats.posts_total} posts done · go to Schedule to plan each day's content.`
          : `Click <b>Materialize 30 days</b> to auto-create ${totalDays * (c.daily_yt + c.daily_tt + c.daily_ig)} content_plan slots in Schedule.`}
      </div>
    </div>
  `;
}

function openEditCampaignModal(c) {
  openModal({
    title: 'Edit campaign',
    bodyHTML: `
      <div><label>Name</label><input id="cmp-name" value="${escapeHtml(c.name)}" /></div>
      <div><label>Thesis (1-sentence why)</label><input id="cmp-thesis" value="${escapeHtml(c.thesis || '')}" /></div>
      <div><label>Description</label><textarea id="cmp-desc" rows="2">${escapeHtml(c.description || '')}</textarea></div>
      <div class="modal-row">
        <div><label>Start date</label><input type="date" id="cmp-start" value="${c.start_date}" /></div>
        <div><label>End date</label><input type="date" id="cmp-end" value="${c.end_date}" /></div>
      </div>
      <div class="modal-row thirds">
        <div><label>Daily YT</label><input type="number" id="cmp-yt" value="${c.daily_yt}" min="0" /></div>
        <div><label>Daily TT</label><input type="number" id="cmp-tt" value="${c.daily_tt}" min="0" /></div>
        <div><label>Daily IG</label><input type="number" id="cmp-ig" value="${c.daily_ig}" min="0" /></div>
      </div>
      <h4 style="margin:16px 0 6px;font-size:13px">Targets</h4>
      <div class="modal-row">
        <div><label>Views</label><input type="number" id="cmp-tv" value="${c.target_views}" /></div>
        <div><label>Leads</label><input type="number" id="cmp-tl" value="${c.target_leads}" /></div>
      </div>
      <div class="modal-row">
        <div><label>Customers</label><input type="number" id="cmp-tc" value="${c.target_customers}" /></div>
        <div><label>Revenue (USD)</label><input type="number" id="cmp-tr" value="${c.target_revenue}" /></div>
      </div>
      <div>
        <label>Status</label>
        <select id="cmp-status">
          ${['planned','active','paused','completed'].map(s => `<option ${s===c.status?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Save', primary: true, icon: 'lucide-save', onClick: async () => {
        await API.updateCampaign(c.id, {
          name:        $('#cmp-name').value,
          thesis:      $('#cmp-thesis').value,
          description: $('#cmp-desc').value,
          start_date:  $('#cmp-start').value,
          end_date:    $('#cmp-end').value,
          daily_yt:    parseInt($('#cmp-yt').value) || 0,
          daily_tt:    parseInt($('#cmp-tt').value) || 0,
          daily_ig:    parseInt($('#cmp-ig').value) || 0,
          target_views:     parseInt($('#cmp-tv').value) || 0,
          target_leads:     parseInt($('#cmp-tl').value) || 0,
          target_customers: parseInt($('#cmp-tc').value) || 0,
          target_revenue:   parseInt($('#cmp-tr').value) || 0,
          status:      $('#cmp-status').value
        });
        toast('Saved');
        closeModal();
        openCampaign(c.id);
      }}
    ]
  });
}

function openCreateCampaignModal() {
  const today = new Date().toISOString().slice(0, 10);
  const endDef = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  openModal({
    title: 'New campaign',
    bodyHTML: `
      <div><label>Name</label><input id="nc-name" placeholder="e.g. 30 Triệu Đầu Tiên · Cohort 1" /></div>
      <div><label>Thesis</label><input id="nc-thesis" placeholder="e.g. Live proof > marketing claims" /></div>
      <div><label>Description</label><textarea id="nc-desc" rows="2"></textarea></div>
      <div class="modal-row">
        <div><label>Start date</label><input type="date" id="nc-start" value="${today}" /></div>
        <div><label>End date</label><input type="date" id="nc-end" value="${endDef}" /></div>
      </div>
      <div class="modal-row thirds">
        <div><label>Daily YT</label><input type="number" id="nc-yt" value="1" min="0" /></div>
        <div><label>Daily TT</label><input type="number" id="nc-tt" value="2" min="0" /></div>
        <div><label>Daily IG</label><input type="number" id="nc-ig" value="0" min="0" /></div>
      </div>
      <h4 style="margin:16px 0 6px;font-size:13px">Targets</h4>
      <div class="modal-row">
        <div><label>Views</label><input type="number" id="nc-tv" value="100000" /></div>
        <div><label>Leads</label><input type="number" id="nc-tl" value="100" /></div>
      </div>
      <div class="modal-row">
        <div><label>Customers</label><input type="number" id="nc-tc" value="20" /></div>
        <div><label>Revenue (USD)</label><input type="number" id="nc-tr" value="15000" /></div>
      </div>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Create', primary: true, icon: 'lucide-plus', onClick: async () => {
        await API.createCampaign({
          name:        $('#nc-name').value || 'Untitled',
          thesis:      $('#nc-thesis').value,
          description: $('#nc-desc').value,
          start_date:  $('#nc-start').value,
          end_date:    $('#nc-end').value,
          daily_yt:    parseInt($('#nc-yt').value) || 0,
          daily_tt:    parseInt($('#nc-tt').value) || 0,
          daily_ig:    parseInt($('#nc-ig').value) || 0,
          target_views:     parseInt($('#nc-tv').value) || 0,
          target_leads:     parseInt($('#nc-tl').value) || 0,
          target_customers: parseInt($('#nc-tc').value) || 0,
          target_revenue:   parseInt($('#nc-tr').value) || 0
        });
        toast('Campaign created');
        closeModal();
        loadCampaigns();
      }}
    ]
  });
}

// ---------- CONTENT FUNNEL STRATEGY ----------
let _funnelObjective = 'viral';
let _funnelPlan = null;

function selectObjective(obj) {
  _funnelObjective = obj;
  $$('.obj-card').forEach(c => c.classList.toggle('active', c.dataset.objective === obj));
}

async function buildFunnelPlan() {
  const platform = $('#fn-platform').value;
  const days     = parseInt($('#fn-days').value) || 30;
  const plan = await API.funnelPlan({ objective: _funnelObjective, timeframe_days: days, platform });
  if (!plan) return toast('Failed to build plan');
  _funnelPlan = plan;
  renderFunnelPlan(plan);
}

function renderFunnelPlan(p) {
  const root = $('#fn-result');
  if (!root) return;
  const objLabel = { viral:'Viral growth', trust:'Trust nurture', convert:'Convert to sales', balanced:'Balanced engine' }[p.objective] || p.objective;
  const platformLabel = p.platform === 'youtube' ? 'YouTube' : p.platform === 'tiktok' ? 'TikTok' : 'Instagram';

  // Stages visualization — clickable to edit
  const stagesHtml = p.stages.map((s, si) => `
    <div class="fv-stage ${s.key}" data-stage-idx="${si}">
      <div class="fv-head">
        <div>
          <h4>${escapeHtml(s.label)} <button class="round-mini" data-edit-stage="${si}" title="Edit stage" style="margin-left:6px;width:24px;height:24px;font-size:12px"><i class="lucide-edit"></i></button></h4>
          <p class="fv-goal" data-stage-goal="${si}"><b>Goal:</b> ${escapeHtml(s.goal)}</p>
        </div>
        <div class="fv-pct">
          <span class="pct-num">${Math.round(s.pct * 100)}%</span>
          <span class="pct-posts">${s.posts} posts</span>
        </div>
      </div>
      <div class="fv-cols">
        <div class="fv-col">
          <h5>Formats to use</h5>
          <div class="fv-formats" data-stage-formats="${si}">
            ${s.formats.map(f => `<span class="fv-fmt-tag">${escapeHtml(f.label)}</span>`).join('')}
          </div>
          <p class="fv-refs" style="margin-top:8px"><b style="color:var(--text-2)">Hook pattern:</b><br/>${escapeHtml(s.hook_pattern)}</p>
          <button class="btn-pill sm" data-brainstorm="${si}" style="margin-top:10px"><i class="lucide-sparkles"></i> Brainstorm 5 ideas</button>
        </div>
        <div class="fv-col">
          <h5>Tactics (proven) <button class="round-mini" data-edit-tactics="${si}" title="Edit tactics" style="margin-left:4px;width:22px;height:22px;font-size:11px"><i class="lucide-edit"></i></button></h5>
          <ul data-stage-tactics="${si}">${(s.tactics || []).map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
        </div>
        <div class="fv-col">
          <h5>KPIs to track <button class="round-mini" data-edit-kpis="${si}" title="Edit KPIs" style="margin-left:4px;width:22px;height:22px;font-size:11px"><i class="lucide-edit"></i></button></h5>
          <div class="fv-formats" data-stage-kpis="${si}">
            ${(s.kpis || []).map(k => `<span class="fv-fmt-tag">${escapeHtml(k)}</span>`).join('')}
          </div>
          <p class="fv-refs"><b style="color:var(--text-2)">Reference systems:</b><br/>${(s.references || []).map(r => `<i class="lucide-bookmark"></i>${escapeHtml(r)}`).join('<br/>')}</p>
        </div>
      </div>
    </div>
  `).join('');

  // Phases timeline
  const phasesHtml = (p.phases || []).length ? `
    <h4 style="margin:14px 0 8px;font-size:14px">Phased rollout — what to do each week</h4>
    <div class="phases-list">
      ${p.phases.map(ph => `
        <div class="phase-row">
          <div class="ph-weeks">Week ${escapeHtml(ph.weeks)}</div>
          <div>
            <h4>${escapeHtml(ph.focus)}</h4>
            <p>${escapeHtml(ph.action)}</p>
          </div>
          <div class="ph-mix">T ${Math.round(ph.mix.tofu*100)} · M ${Math.round(ph.mix.mofu*100)} · B ${Math.round(ph.mix.bofu*100)}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  // 7-day plan grid — slots clickable to edit
  const weeklyHtml = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 8px">
      <h4 style="margin:0;font-size:14px">Week template · ${platformLabel}</h4>
      <span class="muted small">Click any slot to edit · drag-and-drop coming soon</span>
    </div>
    <div class="fn-weekly">
      ${p.weekly_plan.map((d, di) => `
        <div class="fn-day">
          <div class="fn-d">${d.day}</div>
          ${d.slots.map((s, si) => `
            <button class="fn-slot ${s.stage}" data-slot="${di}-${si}" title="Click to edit">
              <span class="fs-time">${s.time}</span>
              <span class="fs-fmt">${escapeHtml(s.format_label)}</span>
            </button>
          `).join('')}
          <button class="fn-add-slot" data-add-slot="${di}" title="Add slot">+</button>
        </div>
      `).join('')}
    </div>
  `;

  // Headline + summary
  const headline = `
    <div class="rec-headline" style="margin-bottom:18px">
      For <b>${objLabel}</b> on <b>${platformLabel}</b> over <b>${p.timeframe_days} days</b>:
      <b>${p.posts.total} posts</b> total — <b>${p.posts.tofu} TOFU</b> · <b>${p.posts.mofu} MOFU</b> · <b>${p.posts.bofu} BOFU</b>.
      ${p.objective === 'viral' ? '<br/><span style="color:var(--text-3);font-size:13px">Pivot mode: front-load TOFU. Find your winning hook in week 1-2 → double down.</span>' : ''}
    </div>
  `;

  // Materialize action
  const actions = `
    <div class="rec-actions">
      <button class="btn-pill" id="fn-clear-week">Clear next 7 days first</button>
      <button class="btn-pill primary" id="fn-apply"><i class="lucide-calendar-plus"></i> Apply 1 week to schedule</button>
      <button class="btn-pill primary" id="fn-apply-4"><i class="lucide-calendar-plus"></i> Apply 4 weeks</button>
    </div>
  `;

  root.innerHTML = `
    ${headline}
    <div class="funnel-viz">${stagesHtml}</div>
    ${phasesHtml}
    ${weeklyHtml}
    ${actions}
  `;

  // ----- Wire editable elements -----
  $$('[data-slot]').forEach(b => b.addEventListener('click', () => {
    const [di, si] = b.dataset.slot.split('-').map(Number);
    openSlotEditor(di, si);
  }));
  $$('[data-add-slot]').forEach(b => b.addEventListener('click', () => {
    const di = parseInt(b.dataset.addSlot);
    addSlot(di);
  }));
  $$('[data-edit-stage]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    openStageEditor(parseInt(b.dataset.editStage));
  }));
  $$('[data-edit-tactics]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    openTacticsEditor(parseInt(b.dataset.editTactics));
  }));
  $$('[data-edit-kpis]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    openKpisEditor(parseInt(b.dataset.editKpis));
  }));
  $$('[data-brainstorm]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const si = parseInt(b.dataset.brainstorm);
    openBrainstormModal(si);
  }));

  $('#fn-clear-week')?.addEventListener('click', async () => {
    const from = nextMondayISO();
    const to = addDaysISO(from, 6);
    await API.clearContentPlanRange(from, to);
    toast('Cleared ' + from + ' → ' + to);
  });
  $('#fn-apply')?.addEventListener('click', async () => {
    const start = nextMondayISO();
    const r = await API.materializeFunnelPlan({ plan: _funnelPlan, start_date: start, weeks: 1 });
    toast(`${r?.added || 0} posts scheduled starting ${start}`);
    loadSchedule();
  });
  $('#fn-apply-4')?.addEventListener('click', async () => {
    const start = nextMondayISO();
    const r = await API.materializeFunnelPlan({ plan: _funnelPlan, start_date: start, weeks: 4 });
    toast(`${r?.added || 0} posts scheduled (4 weeks) starting ${start}`);
    loadSchedule();
  });
}

// ---- Slot editor ----
function openSlotEditor(dayIdx, slotIdx) {
  const day = _funnelPlan.weekly_plan[dayIdx];
  const slot = day.slots[slotIdx];
  const stages = ['tofu', 'mofu', 'bofu'];

  openModal({
    title: `Edit slot · ${day.day}`,
    bodyHTML: `
      <div class="modal-row">
        <div><label>Time</label><input type="time" id="se-time" value="${slot.time}" /></div>
        <div>
          <label>Stage</label>
          <select id="se-stage">
            ${stages.map(s => `<option value="${s}" ${s===slot.stage?'selected':''}>${s.toUpperCase()}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label>Format</label>
        <select id="se-format">${formatOptions(_funnelPlan.platform, slot.format)}</select>
      </div>
      <div>
        <label>Hook seed (optional)</label>
        <input id="se-hook" value="${escapeHtml(slot.hook_seed || '')}" />
      </div>
    `,
    actions: [
      { label: 'Delete slot', icon: 'lucide-trash', onClick: () => {
        day.slots.splice(slotIdx, 1);
        closeModal();
        renderFunnelPlan(_funnelPlan);
        toast('Slot removed');
      }},
      { label: 'Brainstorm 5 ideas', icon: 'lucide-sparkles', onClick: async () => {
        closeModal();
        const tempSi = _funnelPlan.stages.findIndex(s => s.key === slot.stage);
        openBrainstormModal(tempSi, slot.format);
      }},
      { label: 'Cancel', onClick: closeModal },
      { label: 'Save', primary: true, icon: 'lucide-check', onClick: () => {
        const newFormat = $('#se-format').value;
        const fmtOption = (FORMAT_CATALOG[_funnelPlan.platform] || []).find(f => f.value === newFormat);
        slot.time         = $('#se-time').value;
        slot.stage        = $('#se-stage').value;
        slot.format       = newFormat;
        slot.format_label = fmtOption?.label || newFormat;
        slot.hook_seed    = $('#se-hook').value;
        closeModal();
        renderFunnelPlan(_funnelPlan);
        toast('Slot updated');
      }}
    ]
  });
}

function addSlot(dayIdx) {
  const day = _funnelPlan.weekly_plan[dayIdx];
  const defaultFmt = (FORMAT_CATALOG[_funnelPlan.platform] || [{}])[0];
  day.slots.push({
    time: '18:00',
    stage: 'tofu',
    stage_label: 'TOFU',
    format: defaultFmt.value || 'pov',
    format_label: defaultFmt.label || 'POV',
    hook_seed: ''
  });
  renderFunnelPlan(_funnelPlan);
  openSlotEditor(dayIdx, day.slots.length - 1);
}

// ---- Stage editors ----
function openStageEditor(si) {
  const s = _funnelPlan.stages[si];
  openModal({
    title: `Edit ${s.key.toUpperCase()} stage`,
    bodyHTML: `
      <div><label>Label</label><input id="ed-label" value="${escapeHtml(s.label)}" /></div>
      <div><label>Goal</label><textarea id="ed-goal" rows="2">${escapeHtml(s.goal)}</textarea></div>
      <div><label>Hook pattern</label><input id="ed-hook" value="${escapeHtml(s.hook_pattern)}" /></div>
      <div class="modal-row">
        <div><label>Posts this period</label><input type="number" id="ed-posts" value="${s.posts}" /></div>
        <div><label>Mix %</label><input type="number" id="ed-pct" value="${Math.round(s.pct*100)}" min="0" max="100" /></div>
      </div>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Save', primary: true, icon: 'lucide-check', onClick: () => {
        s.label = $('#ed-label').value;
        s.goal = $('#ed-goal').value;
        s.hook_pattern = $('#ed-hook').value;
        s.posts = parseInt($('#ed-posts').value) || s.posts;
        s.pct = (parseInt($('#ed-pct').value) || 0) / 100;
        closeModal();
        renderFunnelPlan(_funnelPlan);
        toast('Stage updated');
      }}
    ]
  });
}

function openTacticsEditor(si) {
  const s = _funnelPlan.stages[si];
  openModal({
    title: `Edit tactics · ${s.key.toUpperCase()}`,
    bodyHTML: `
      <p class="muted small">One tactic per line. These are the proven plays — add yours.</p>
      <textarea id="ed-tactics" rows="10">${escapeHtml((s.tactics || []).join('\n'))}</textarea>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Save', primary: true, icon: 'lucide-check', onClick: () => {
        s.tactics = $('#ed-tactics').value.split('\n').map(t => t.trim()).filter(Boolean);
        closeModal();
        renderFunnelPlan(_funnelPlan);
        toast('Tactics updated');
      }}
    ]
  });
}

function openKpisEditor(si) {
  const s = _funnelPlan.stages[si];
  openModal({
    title: `Edit KPIs · ${s.key.toUpperCase()}`,
    bodyHTML: `
      <p class="muted small">Comma-separated KPI names. e.g. <code>views, avg_watch_time, shares</code></p>
      <input id="ed-kpis" value="${escapeHtml((s.kpis || []).join(', '))}" />
      <p class="muted small" style="margin-top:14px"><b>Edit formats:</b> add/remove tags (one per line · format: label or format:label)</p>
      <textarea id="ed-formats" rows="6">${(s.formats || []).map(f => f.label).join('\n')}</textarea>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Save', primary: true, icon: 'lucide-check', onClick: () => {
        s.kpis = $('#ed-kpis').value.split(',').map(k => k.trim()).filter(Boolean);
        s.formats = $('#ed-formats').value.split('\n').map(l => {
          const label = l.trim();
          if (!label) return null;
          // Convert label back to a value (snake-case the label)
          const value = label.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
          return { value, label };
        }).filter(Boolean);
        closeModal();
        renderFunnelPlan(_funnelPlan);
        toast('KPIs + formats updated');
      }}
    ]
  });
}

// ---- Brainstorm modal ----
async function openBrainstormModal(stageIdx, formatOverride) {
  const stage = _funnelPlan.stages[stageIdx];
  const format = formatOverride || (stage.formats[0]?.value) || 'pov';
  openModal({
    title: `Brainstorm · ${stage.key.toUpperCase()} · ${format}`,
    bodyHTML: `<div id="bs-result" style="text-align:center;padding:30px;color:var(--text-3)">Loading AI ideas…</div>`,
    actions: [{ label: 'Close', onClick: closeModal }]
  });

  const r = await API.brainstorm({
    platform: _funnelPlan.platform,
    format,
    stage: stage.key,
    count: 5
  });
  const ideas = r?.ideas || [];
  if (!ideas.length) {
    $('#bs-result').innerHTML = '<p class="muted">No ideas — try again.</p>';
    return;
  }
  $('#bs-result').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;text-align:left">
      ${ideas.map((i, idx) => `
        <div class="format-card" style="cursor:default">
          <div class="fc-head">
            <div class="fc-platform ${platCls(_funnelPlan.platform)}">${platIcon(_funnelPlan.platform)}</div>
            <span class="fc-tag">${escapeHtml(format)}</span>
            <span class="muted small" style="margin-left:auto">#${idx + 1}</span>
          </div>
          <h4>${escapeHtml(i.title)}</h4>
          <p class="fc-desc" style="color:var(--violet);font-style:italic">"${escapeHtml(i.hook)}"</p>
          <p class="fc-desc">${escapeHtml(i.why_works || '')}</p>
          ${i.outline ? `<ul style="padding-left:18px;margin:6px 0;color:var(--text-3);font-size:12px">${i.outline.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>` : ''}
          <p class="muted small"><b>CTA:</b> ${escapeHtml(i.cta || '')}</p>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn-pill sm" data-bs-save="${idx}"><i class="lucide-bookmark"></i> Save to ideas</button>
            <button class="btn-pill primary sm" data-bs-schedule="${idx}"><i class="lucide-calendar-plus"></i> Schedule today</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  $$('[data-bs-save]').forEach(b => b.addEventListener('click', async () => {
    const idea = ideas[parseInt(b.dataset.bsSave)];
    await API.addMyIdea({
      title: idea.title,
      hook: idea.hook,
      description: (idea.outline || []).join(' · '),
      why_works: idea.why_works,
      platform: _funnelPlan.platform,
      format,
      status: 'idea'
    });
    toast('Saved to My Ideas');
  }));
  $$('[data-bs-schedule]').forEach(b => b.addEventListener('click', async () => {
    const idea = ideas[parseInt(b.dataset.bsSchedule)];
    const today = new Date().toISOString().slice(0, 10);
    await API.addContentPlan({
      date: today, time: '12:00',
      platform: _funnelPlan.platform, format,
      title: idea.title, hook: idea.hook,
      cta: idea.cta, outline: idea.outline || [],
      status: 'idea'
    });
    toast('Scheduled today');
    closeModal();
    loadSchedule();
  }));
}

function nextMondayISO() {
  const today = new Date();
  const day = today.getDay();
  const diff = (8 - (day || 7)) % 7;
  const mon = new Date(today);
  mon.setDate(today.getDate() + (diff || 7));
  return mon.toISOString().slice(0, 10);
}
function addDaysISO(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- STRATEGIC RECOMMENDER ----------
const MIX_COLORS = ['#a78bfa', '#60a5fa', '#4ade80', '#fbbf24', '#f87171', '#f472b6'];

async function runRecommender() {
  const target   = parseInt($('#rec-target').value)  || 1000;
  const metric   = $('#rec-metric').value;
  const platform = $('#rec-platform').value;
  const days     = parseInt($('#rec-days').value)    || 30;
  const r = await API.strategicRecommend({ target, metric, platform, days });
  if (!r) return toast('Recommender failed');
  renderRecommender(r);
}

function renderRecommender(r) {
  const root = $('#rec-result');
  if (!root) return;
  const m = r.math;
  const platformLabel = r.platform === 'youtube' ? 'YouTube' : r.platform === 'tiktok' ? 'TikTok' : 'Instagram';
  const metricLabel = r.metric === 'leads' ? 'leads' : r.metric === 'subs' ? 'subscribers' : 'followers';

  // Headline
  const headline = `To gain <b>${fmt(r.target)} ${metricLabel}</b> on <b>${platformLabel}</b> in <b>${r.days} days</b>, you need <b>${fmt(m.views_needed)} views</b> total — that's <b>${fmt(m.views_per_day)}/day</b> across <b>${m.posts_per_day} post${m.posts_per_day>1?'s':''}/day</b> (<b>${fmt(m.views_per_post)}/post</b>).`;

  // Math cells
  const mathCells = [
    { label: 'Target',         value: fmt(r.target),         note: metricLabel },
    { label: 'Views needed',   value: fmt(m.views_needed),    note: 'total · ' + r.days + ' days' },
    { label: 'Views / day',    value: fmt(m.views_per_day),  note: m.posts_per_day + ' posts' },
    { label: 'Views / post',   value: fmt(m.views_per_post), note: 'realistic with right format' },
    { label: 'Total posts',    value: fmt(m.total_posts),     note: 'this month' }
  ];

  // Stacked bar
  const bar = r.mix.map((m, i) => `<span style="width:${m.weight*100}%;background:${MIX_COLORS[i % MIX_COLORS.length]}" title="${m.label}: ${Math.round(m.weight*100)}%"></span>`).join('');

  // Mix rows
  const mixRows = r.mix.map((slot, i) => {
    const color = MIX_COLORS[i % MIX_COLORS.length];
    const num = i + 1;
    return `
      <div class="rec-mix-row" data-mix-format="${slot.format}">
        <div class="rm-icon" style="background:${color}26;color:${color}">${num}</div>
        <div>
          <h4>${escapeHtml(slot.label)} <span class="rm-stage ${slot.stage}">${slot.stage}</span> ${slot.has_data ? `<span class="muted small">· avg ${fmt(slot.avg_views)} views</span>` : ''}</h4>
          <div class="rm-why">${escapeHtml(slot.why)}</div>
        </div>
        <div class="rm-pct">${Math.round(slot.weight*100)}%</div>
        <div class="rm-volume">
          <b>${slot.posts_per_week}/week</b>
          ${slot.posts_per_month} this month
        </div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div class="rec-result">
      <p class="rec-headline">${headline}</p>
      <div class="rec-math-grid">
        ${mathCells.map(c => `
          <div class="rec-math">
            <div class="label">${c.label}</div>
            <div class="value">${c.value}</div>
            <div class="note">${c.note}</div>
          </div>`).join('')}
      </div>
      <div>
        <h4 style="margin:8px 0 12px;font-size:14px">Recommended format mix · weighted by lead potential</h4>
        <div class="rec-mix-bar">${bar}</div>
        <div class="rec-mix">${mixRows}</div>
      </div>
      <div class="rec-actions">
        <button class="btn-pill" id="rec-add-formats"><i class="lucide-bookmark"></i> Save mix to Format library</button>
        <button class="btn-pill primary" id="rec-materialize"><i class="lucide-calendar-plus"></i> Generate this week's plan</button>
      </div>
    </div>
  `;

  // Wire actions
  $('#rec-add-formats')?.addEventListener('click', () => {
    toast('Mix saved as reference — visit Format library below');
    // No-op for now — formats already exist in library
  });
  $('#rec-materialize')?.addEventListener('click', () => generateWeekFromMix(r));
}

async function generateWeekFromMix(r) {
  // Compute next Monday
  const today = new Date();
  const day = today.getDay();
  const diffToMon = (8 - (day || 7)) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() + (diffToMon || 7));   // next Monday (skip today if Mon)
  const dayCount = 7;
  const slotsPerDay = r.math.posts_per_day;

  // Build a queue of format slots based on the mix weights
  const queue = [];
  const totalSlots = slotsPerDay * dayCount;
  for (const m of r.mix) {
    const n = Math.round(m.weight * totalSlots);
    for (let i = 0; i < n; i++) queue.push({ format: m.format, label: m.label, target_views: m.target_views_per_post });
  }
  // Shuffle for variety
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  // Trim to exactly totalSlots
  while (queue.length < totalSlots) queue.push(queue[0]);
  queue.length = totalSlots;

  // Map slots to days/times
  const times = r.platform === 'youtube' ? ['08:00'] : ['12:30', '20:00'];
  const platform = r.platform;
  toast('Adding ' + totalSlots + ' slots to next week…');
  let added = 0;
  for (let d = 0; d < dayCount; d++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + d);
    const ds = date.toISOString().slice(0, 10);
    for (let s = 0; s < slotsPerDay; s++) {
      const slot = queue[d * slotsPerDay + s];
      if (!slot) continue;
      const item = {
        date: ds,
        time: times[s % times.length],
        platform,
        format: slot.format,
        title: `[${slot.label}] · ${ds}`,
        hook: '',
        cta: '',
        target_views: slot.target_views,
        target_leads: 0,
        status: 'idea'
      };
      await API.addContentPlan(item);
      added++;
    }
  }
  toast(`${added} slots scheduled for week of ${monday.toISOString().slice(0,10)}`);
  loadSchedule();
  loadStrategy();
}

// ---------- LEADS HUB ----------
async function loadLeads() {
  const [stats, leads] = await Promise.all([API.leadsStats(30), API.leads('all', 20)]);
  const cells = [
    { label: 'Total leads (30d)', value: fmt(stats.total) },
    { label: 'Qualified',         value: fmt(stats.qualified || 0) },
    { label: 'Calls booked',      value: fmt(stats.call_booked || 0) },
    { label: 'Sales',             value: fmt(stats.sale || 0), cls: 'sales' },
    { label: 'Revenue',           value: '$' + fmt(stats.revenue || 0) }
  ];
  $('#leadsStats').innerHTML = cells.map(c => `
    <div class="leads-stat ${c.cls||''}">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
    </div>`).join('');

  if (!leads.length) {
    $('#leadsList').innerHTML = `
      <div style="padding:24px;text-align:center;border:1px dashed var(--line);border-radius:12px">
        <p class="muted">No leads yet. Either connect your Google Form (button above) or log one manually.</p>
      </div>`;
    return;
  }
  const statuses = ['new', 'qualified', 'call_booked', 'call_done', 'sale', 'dropped'];
  $('#leadsList').innerHTML = leads.map(l => {
    const created = new Date(l.created_at).toLocaleDateString('en-US', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    const icon =
      l.source === 'youtube'   ? '<i class="lucide-youtube"></i>' :
      l.source === 'tiktok'    ? '<i class="lucide-music"></i>' :
      l.source === 'instagram' ? '<i class="lucide-instagram"></i>' :
      l.source === 'form'      ? '<i class="lucide-file-text"></i>' :
                                 '<i class="lucide-edit"></i>';
    return `
      <div class="lead-row" data-lead-id="${l.id}">
        <div class="ld-source ${l.source || 'manual'}">${icon}</div>
        <div>
          <div class="ld-name">${escapeHtml(l.name || '(no name)')}</div>
          <div class="ld-meta">${created}</div>
        </div>
        <div>
          <div>${escapeHtml(l.email || '')}</div>
          <div class="ld-meta">${escapeHtml(l.phone || '')}</div>
        </div>
        <select data-lead-status="${l.id}">
          ${statuses.map(s => `<option ${s===l.status?'selected':''}>${s}</option>`).join('')}
        </select>
        <input type="number" class="ld-revenue-input" data-lead-revenue="${l.id}" value="${l.revenue||0}" style="background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:8px;padding:6px 10px;color:var(--green);font-size:12px;width:100%;text-align:right" placeholder="$0" />
        <button class="round-mini" data-lead-delete="${l.id}"><i class="lucide-x"></i></button>
      </div>
    `;
  }).join('');

  // Wire status + revenue + delete
  $$('[data-lead-status]').forEach(sel => sel.addEventListener('change', async () => {
    const id = sel.dataset.leadStatus;
    const lead = leads.find(l => l.id === id);
    await API.updateLead(id, { status: sel.value, revenue: lead?.revenue || 0 });
    loadLeads();
  }));
  $$('[data-lead-revenue]').forEach(inp => inp.addEventListener('change', async () => {
    const id = inp.dataset.leadRevenue;
    const lead = leads.find(l => l.id === id);
    await API.updateLead(id, { status: lead?.status || 'new', revenue: parseInt(inp.value) || 0 });
    loadLeads();
  }));
  $$('[data-lead-delete]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this lead?')) return;
    await API.deleteLead(b.dataset.leadDelete);
    loadLeads();
  }));
}

async function loadStrategy() {
  const period = yyyymm();
  $('#stratPeriod').textContent = period;

  const [goal, baselines, funnels, metrics, strat, plan] = await Promise.all([
    API.getGoal(period),
    API.getBaselines(),
    API.getFunnels(),
    API.metrics(30),
    API.getStrategy(period),
    API.getContentPlan({ from: today(), to: today() })
  ]);
  // Also load formats + leads panels
  loadFormats();
  loadLeads();
  // Auto-run recommender with defaults
  if ($('#rec-result') && !$('#rec-result').innerHTML.trim()) runRecommender();
  // Auto-set objective + build funnel plan
  if ($('#fn-result') && !$('#fn-result').innerHTML.trim()) {
    selectObjective(_funnelObjective);
    buildFunnelPlan();
  }

  // Hero
  const monthRow = strat.find(s => s.scope === 'month');
  if (monthRow) {
    $('#stratTitle').textContent = monthRow.title || `Path to ${(goal?.leads||0)} leads in ${period}`;
    $('#stratThesis').textContent = monthRow.theme || $('#stratThesis').textContent;
  } else {
    $('#stratTitle').textContent = `Path to ${(goal?.leads||0)} leads in ${period}`;
    $('#stratThesis').textContent = `Click "Generate plan" to let AI build a 4-week strategy using your ${goal?.yt_subs||0} YT-sub goal, your funnel rates, and the creators you blend.`;
  }

  // Funnel math: backwards from leads target → views needed
  renderMathGrid(goal, funnels);

  // Progress
  renderProgress(goal, metrics, baselines);

  // Weeks
  renderWeeks(strat, period);

  // Today's batch
  renderTodayBatch(plan[today()] || []);
}

function today() { return new Date().toISOString().slice(0, 10); }

function renderMathGrid(goal, funnels) {
  goal = goal || { leads: 0, revenue: 0 };
  const fy = funnels.youtube || { views_to_dm: 0.10, dm_to_call: 0.80, call_to_sale: 0.625 };
  const ft = funnels.tiktok  || { views_to_dm: 0.01, dm_to_call: 0.80, call_to_sale: 0.625 };

  // Assume 50/50 lead share between YT and TT for math display
  const leadsYT = Math.round(goal.leads * 0.5);
  const leadsTT = goal.leads - leadsYT;
  const dmsYT  = Math.round(leadsYT / (fy.call_to_sale * fy.dm_to_call) * (fy.call_to_sale)); // approximate
  const callsYT = Math.round(leadsYT / fy.call_to_sale);
  const dmsYT2  = Math.round(callsYT / fy.dm_to_call);
  const viewsYT = Math.round(dmsYT2 / fy.views_to_dm);

  const callsTT = Math.round(leadsTT / ft.call_to_sale);
  const dmsTT   = Math.round(callsTT / ft.dm_to_call);
  const viewsTT = Math.round(dmsTT / ft.views_to_dm);

  const cells = [
    { label: 'Target sales',        value: fmt(goal.leads),                        note: 'this month' },
    { label: 'Calls needed',        value: fmt(callsYT + callsTT),                 note: `YT ${callsYT} · TT ${callsTT}` },
    { label: 'DMs needed',          value: fmt(dmsYT2 + dmsTT),                    note: `YT ${dmsYT2} · TT ${dmsTT}` },
    { label: 'Views needed',        value: fmt(viewsYT + viewsTT),                 note: `YT ${fmt(viewsYT)} · TT ${fmt(viewsTT)}` },
    { label: 'Videos this month',   value: '90+',                                  note: 'YT 30 · TT 60 long' }
  ];
  $('#mathGrid').innerHTML = cells.map(c => `
    <div class="math-cell">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      <div class="note">${c.note}</div>
    </div>
  `).join('');
}

function renderProgress(goal, metrics, baselines) {
  goal = goal || {};
  const items = [
    { label: 'YT subs',     have: metrics.youtube?.subs || 0,             want: goal.yt_subs || 0 },
    { label: 'TT followers',have: baselines.tiktok?.followers || metrics.tiktok?.followers || 0, want: goal.tt_followers || 0 },
    { label: 'Leads',       have: 0, want: goal.leads || 0 },
    { label: 'Revenue',     have: 0, want: goal.revenue || 0, money: true }
  ];
  $('#progressList').innerHTML = items.map(it => {
    const pct = it.want ? Math.min(100, Math.round(it.have / it.want * 100)) : 0;
    const have = it.money ? '$' + fmt(it.have) : fmt(it.have);
    const want = it.money ? '$' + fmt(it.want) : fmt(it.want);
    return `
      <div class="progress-row">
        <span>${it.label}</span>
        <div class="progress-bar"><div style="width:${pct}%"></div></div>
        <span class="vals"><b>${have}</b> / ${want}</span>
      </div>
    `;
  }).join('');
}

function renderWeeks(strat, period) {
  const weeks = strat.filter(s => s.scope === 'week').sort((a,b) => a.weekIdx - b.weekIdx);
  const currentWeekIdx = Math.ceil(new Date().getDate() / 7);
  if (!weeks.length) {
    // Show 4 placeholder cards
    $('#weeksGrid').innerHTML = [1,2,3,4].map(w => `
      <div class="week-card ${w===currentWeekIdx?'current':''}">
        <div class="week-head">
          <span class="week-pill">Week ${w}</span>
          ${w===currentWeekIdx ? '<i class="lucide-circle-dot" style="color:var(--violet)"></i>' : ''}
        </div>
        <h4>—</h4>
        <p class="week-objective muted">Generate strategy to populate this week.</p>
      </div>
    `).join('');
    return;
  }
  $('#weeksGrid').innerHTML = weeks.map(w => `
    <div class="week-card ${w.weekIdx===currentWeekIdx?'current':''}">
      <div class="week-head">
        <span class="week-pill">Week ${w.weekIdx}</span>
        ${w.weekIdx===currentWeekIdx ? '<i class="lucide-circle-dot" style="color:var(--violet)"></i>' : ''}
      </div>
      <h4>${w.theme || 'Untitled'}</h4>
      <p class="week-objective">${w.description || ''}</p>
      <div class="week-mini">
        <span><i class="lucide-youtube"></i> ${countDays(w.days, 'youtube')} YT</span>
        <span><i class="lucide-music"></i> ${countDays(w.days, 'tiktok')} TT</span>
        <span><i class="lucide-instagram"></i> ${countDays(w.days, 'instagram')} IG</span>
      </div>
      <div class="week-actions">
        <button class="btn-pill sm" data-week-view="${w.weekIdx}"><i class="lucide-eye"></i> View</button>
        <button class="btn-pill primary sm" data-week-materialize="${w.weekIdx}"><i class="lucide-calendar-plus"></i> Schedule</button>
      </div>
    </div>
  `).join('');

  // wire view/materialize
  $$('[data-week-materialize]').forEach(b => b.addEventListener('click', async () => {
    const idx = parseInt(b.dataset.weekMaterialize);
    const startDate = startOfWeek(idx);
    toast(`Adding week ${idx} to calendar…`);
    await API.materializeWeek(period, idx, startDate);
    toast(`Week ${idx} scheduled`);
    loadStrategy();
    loadSchedule();
  }));
  $$('[data-week-view]').forEach(b => b.addEventListener('click', () => {
    const idx = parseInt(b.dataset.weekView);
    const w = weeks.find(x => x.weekIdx === idx);
    openWeekModal(w);
  }));
}

function countDays(days, platform) {
  if (!days) return 0;
  return days.reduce((acc, d) => acc + (d.slots || []).filter(s => s.platform === platform).length, 0);
}

function startOfWeek(weekIdx) {
  // Map week 1..4 to first Monday of current month, +7 each
  const d = new Date();
  d.setDate(1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + (weekIdx - 1) * 7);
  return d.toISOString().slice(0, 10);
}

function openWeekModal(w) {
  const days = w.days || [];
  const bodyHTML = days.map(d => `
    <div style="margin-bottom:14px">
      <h4 style="margin:0 0 8px;font-size:13px;color:var(--violet);text-transform:uppercase;letter-spacing:0.08em">${d.day}</h4>
      ${(d.slots || []).map(s => `
        <div class="batch-item" style="margin-bottom:6px">
          <div class="batch-platform ${platCls(s.platform)}">${platIcon(s.platform)}</div>
          <div class="batch-time">${s.time || ''}</div>
          <div class="batch-body">
            <h4>${s.title || ''}</h4>
            <span class="hook">"${s.hook || ''}"</span>
            <p>${s.cta || ''}</p>
          </div>
          <div class="batch-status">
            <span class="muted small">${fmt(s.target_views||0)} views · ${s.target_leads||0} leads</span>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  openModal({
    title: `Week ${w.weekIdx} — ${w.theme}`,
    bodyHTML: `<p class="muted" style="margin:0 0 14px">${w.description}</p>` + bodyHTML,
    actions: [{ label: 'Close', onClick: closeModal }]
  });
}

function platCls(p) { return p === 'youtube' ? 'yt' : p === 'tiktok' ? 'tt' : 'ig'; }
function platIcon(p) {
  return p === 'youtube' ? '<i class="lucide-youtube"></i>'
       : p === 'tiktok'  ? '<i class="lucide-music"></i>'
       :                   '<i class="lucide-instagram"></i>';
}

function renderTodayBatch(items) {
  if (!items.length) {
    $('#batchSubtitle').textContent = 'No content scheduled — generate strategy and add a week to calendar.';
    $('#batchList').innerHTML = `<p class="muted" style="padding:20px;text-align:center">Nothing on the slate today.</p>`;
    return;
  }
  const dateStr = new Date().toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });
  $('#batchSubtitle').textContent = `${dateStr} · ${items.length} pieces`;
  $('#batchList').innerHTML = items.map(it => `
    <div class="batch-item" data-cp-id="${it.id}">
      <div class="batch-platform ${platCls(it.platform)}">${platIcon(it.platform)}</div>
      <div class="batch-time">${it.time || ''}</div>
      <div class="batch-body">
        <h4>${it.title || 'Untitled'}</h4>
        ${it.hook ? `<span class="hook">"${it.hook}"</span>` : ''}
        <p>${it.cta || ''}</p>
      </div>
      <div class="batch-status">
        <span class="status-pill ${it.status}">${it.status}</span>
      </div>
    </div>
  `).join('');
  $$('[data-cp-id]').forEach(el => el.addEventListener('click', () => openContentPlanModal(items.find(i => i.id === el.dataset.cpId))));
}

async function openContentPlanModal(cp) {
  if (!cp) return;

  // Re-fetch fresh from server so we know if it has a repeat group + outline shape
  const fresh = (await API.getContentPlanItem(cp.id)) || cp;
  const isRepeating = !!fresh.repeat_group_id;
  const outlineArr = Array.isArray(fresh.outline) ? fresh.outline : (Array.isArray(cp.outline) ? cp.outline : []);
  const statuses = ['idea','scripted','filmed','edited','published','measured'];

  openModal({
    title: fresh.title || 'Content plan',
    bodyHTML: `
      ${isRepeating ? `
        <div style="padding:10px 14px;background:rgba(167,139,250,0.08);border:1px dashed rgba(167,139,250,0.3);border-radius:12px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
          <i class="lucide-rotate-cw" style="color:var(--violet)"></i>
          <div style="font-size:12.5px;color:var(--text-2)">
            <b>Repeating event</b> (${fresh.repeat_rule || 'series'}) · ${fresh.repeat_group_index}/${fresh.repeat_group_size}
            <div class="muted small">Choose scope below when saving or deleting.</div>
          </div>
        </div>` : ''}

      <div class="modal-row">
        <div><label>Date</label><input type="date" id="cp-date" value="${fresh.date}" /></div>
        <div><label>Time</label><input type="time" id="cp-time" value="${(fresh.time||'').slice(0,5)}" /></div>
      </div>
      <div class="modal-row">
        <div>
          <label>Platform</label>
          <select id="cp-platform">
            <option value="youtube"   ${fresh.platform==='youtube'?'selected':''}   style="color:#ff8a8a;background:#181828">YouTube</option>
            <option value="tiktok"    ${fresh.platform==='tiktok' ?'selected':''}   style="color:#6ff5f0;background:#181828">TikTok</option>
            <option value="instagram" ${fresh.platform==='instagram'?'selected':''} style="color:#f47ba6;background:#181828">Instagram</option>
          </select>
        </div>
        <div>
          <label>Format</label>
          <select id="cp-format">${formatOptions(fresh.platform, fresh.format)}</select>
        </div>
      </div>
      <div><label>Title</label><input id="cp-title" value="${escapeHtml(fresh.title || '')}" /></div>
      <div><label>Hook (first 7 words)</label><input id="cp-hook" value="${escapeHtml(fresh.hook || '')}" /></div>
      <div><label>Outline (one bullet per line)</label><textarea id="cp-outline" rows="5">${escapeHtml(outlineArr.join('\n'))}</textarea></div>
      <div><label>Script (full draft)</label><textarea id="cp-script" rows="6">${escapeHtml(fresh.script || '')}</textarea></div>
      <div><label>CTA</label><input id="cp-cta" value="${escapeHtml(fresh.cta || '')}" /></div>
      <div class="modal-row thirds">
        <div>
          <label>Status</label>
          <select id="cp-status">
            ${statuses.map(s => `<option ${s===fresh.status?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div><label>Actual views</label><input type="number" id="cp-views" value="${fresh.actual_views || ''}" placeholder="0" /></div>
        <div><label>Actual leads</label><input type="number" id="cp-leads" value="${fresh.actual_leads || ''}" placeholder="0" /></div>
      </div>
      <div class="modal-row">
        <div><label>Target views</label><input type="number" id="cp-tviews" value="${fresh.target_views || ''}" placeholder="0" /></div>
        <div><label>Target leads</label><input type="number" id="cp-tleads" value="${fresh.target_leads || ''}" placeholder="0" /></div>
      </div>
    `,
    actions: [
      { label: 'Delete', icon: 'lucide-trash', onClick: () => openDeleteScopeDialog(fresh) },
      { label: 'Cancel', onClick: closeModal },
      { label: 'Generate script', icon: 'lucide-sparkles', onClick: async () => {
          toast('AI is drafting your script…');
          const out = await API.generateScript(fresh.id);
          if (!out) return toast('Generation failed');
          $('#cp-hook').value    = out.hook    || $('#cp-hook').value;
          $('#cp-outline').value = (out.outline || []).join('\n');
          $('#cp-script').value  = out.script  || '';
          $('#cp-cta').value     = out.cta     || $('#cp-cta').value;
          $('#cp-status').value  = 'scripted';
          toast('Script ready! Review + edit then Save.');
        }},
      { label: 'Save', primary: true, icon: 'lucide-save', onClick: async () => {
          const patch = {
            date:         $('#cp-date').value,
            time:         $('#cp-time').value,
            platform:     $('#cp-platform').value,
            format:       $('#cp-format').value,
            title:        $('#cp-title').value,
            hook:         $('#cp-hook').value,
            outline:      $('#cp-outline').value.split('\n').map(s => s.trim()).filter(Boolean),
            script:       $('#cp-script').value,
            cta:          $('#cp-cta').value,
            status:       $('#cp-status').value,
            actual_views: parseInt($('#cp-views').value)  || 0,
            actual_leads: parseInt($('#cp-leads').value)  || 0,
            target_views: parseInt($('#cp-tviews').value) || 0,
            target_leads: parseInt($('#cp-tleads').value) || 0
          };
          if (isRepeating) {
            openSaveScopeDialog(fresh, patch);
          } else {
            await API.updateContentPlanScoped(fresh.id, patch, 'this');
            toast('Saved');
            closeModal();
            loadSchedule();
            loadStrategy();
          }
        }}
    ]
  });

  // Re-populate format options when platform changes
  $('#cp-platform')?.addEventListener('change', e => {
    $('#cp-format').innerHTML = formatOptions(e.target.value);
  });
}

function openSaveScopeDialog(item, patch) {
  openModal({
    title: 'Save repeating event',
    bodyHTML: `<p>This event repeats <b>${escapeHtml(item.repeat_rule || 'series')}</b>. Apply changes to:</p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
        <label class="scope-pick"><input type="radio" name="scope" value="this" checked> <b>Only this event</b> · ${item.date}</label>
        <label class="scope-pick"><input type="radio" name="scope" value="future"> <b>This and following events</b> · from ${item.date}</label>
        <label class="scope-pick"><input type="radio" name="scope" value="all"> <b>All events in series</b> · ${item.repeat_group_size} items</label>
      </div>
      <p class="muted small" style="margin-top:14px">⚠️ Date / time changes don't propagate across instances — each event keeps its own slot. Other fields (title, hook, format, status...) do propagate.</p>
    `,
    actions: [
      { label: 'Back', onClick: closeModal },
      { label: 'Apply', primary: true, icon: 'lucide-check', onClick: async () => {
        const scope = document.querySelector('input[name="scope"]:checked')?.value || 'this';
        await API.updateContentPlanScoped(item.id, patch, scope);
        const msg = scope === 'this' ? 'Saved (1 event)'
                   : scope === 'future' ? `Saved (this + following)`
                                        : `Saved (all ${item.repeat_group_size} events)`;
        toast(msg);
        closeModal();
        loadSchedule();
        loadStrategy();
      }}
    ]
  });
}

function openDeleteScopeDialog(item) {
  const isRepeating = !!item.repeat_group_id;
  openModal({
    title: 'Delete event',
    bodyHTML: isRepeating ? `<p>This event repeats. What do you want to delete?</p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
        <label class="scope-pick"><input type="radio" name="dscope" value="this" checked> <b>Only this event</b> · ${item.date}</label>
        <label class="scope-pick"><input type="radio" name="dscope" value="future"> <b>This and following events</b></label>
        <label class="scope-pick"><input type="radio" name="dscope" value="all"> <b>All events in series</b> · ${item.repeat_group_size} items</label>
      </div>` :
      `<p>Delete <b>${escapeHtml(item.title || 'this event')}</b> on ${item.date}?</p>
       <p class="muted small">This can't be undone.</p>`,
    actions: [
      { label: 'Back', onClick: closeModal },
      { label: 'Delete', primary: true, icon: 'lucide-trash', onClick: async () => {
        const scope = isRepeating ? (document.querySelector('input[name="dscope"]:checked')?.value || 'this') : 'this';
        await API.deleteContentPlanScoped(item.id, scope);
        toast('Deleted');
        closeModal();
        loadSchedule();
        loadStrategy();
      }}
    ]
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadSettings() {
  const [profile, conn] = await Promise.all([API.profile(), API.connections()]);
  $('#profName').value     = profile.name || '';
  $('#profNiche').value    = profile.niche || '';
  $('#profAudience').value = profile.audience || '';
  $('#profGoal').value     = profile.goal || '';
  renderConnections(conn);
  // user pill
  $('#userName').textContent = profile.name || 'Connect account';
  $('#userHandle').textContent = '@' + (profile.name || 'creator').toLowerCase().replace(/\s+/g, '_');
}

// ---------- WIRING ----------
$('#btnSync')?.addEventListener('click', async () => {
  toast('Syncing with platforms…');
  await API.sync();
  await loadChannels();
  toast('Sync complete');
});

$('#addTrack')?.addEventListener('click', async () => {
  const url = $('#trackUrl').value.trim();
  const tag = $('#trackTag').value;
  if (!url) return toast('Paste a channel URL first');
  await API.addTracked({ url, tag });
  $('#trackUrl').value = '';
  toast('Now tracking — first sync running');
  loadTracking();
});

$('#genIdeas')?.addEventListener('click', async () => {
  toast('Asking AI for fresh ideas…');
  const ideas = await API.generateIdeas();
  renderIdeas(ideas);
  toast('5 new ideas generated');
});

$('#saveProfile')?.addEventListener('click', async () => {
  const profile = {
    name:     $('#profName').value,
    niche:    $('#profNiche').value,
    audience: $('#profAudience').value,
    goal:     $('#profGoal').value
  };
  await API.saveProfile(profile);
  toast('Profile saved');
  loadSettings();
});

$('#calPrev')?.addEventListener('click', () => {
  if (--calMonth < 1) { calMonth = 12; calYear--; }
  loadSchedule();
});
$('#calNext')?.addEventListener('click', () => {
  if (++calMonth > 12) { calMonth = 1; calYear++; }
  loadSchedule();
});

// Channels filter chips
$$('.filter-bar .chip[data-platform]').forEach(chip => {
  chip.addEventListener('click', async () => {
    $$('.filter-bar .chip[data-platform]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const videos = await API.videos({ platform: chip.dataset.platform });
    renderVideoTable(videos);
  });
});

// Channels range chips
$$('.filter-bar .chip[data-range]').forEach(chip => {
  chip.addEventListener('click', async () => {
    $$('.filter-bar .chip[data-range]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const m = await API.metrics(parseInt(chip.dataset.range));
    renderKPIs(m);
  });
});

// (theme toggle handler defined below — see "Update sun/moon icon when theme changes")

// OAuth callback handler — show toast and poll for fresh data once sync settles
const params = new URLSearchParams(location.search);
if (params.get('connected')) {
  const platform = params.get('connected');
  toast(`${platform} connected — first sync running in the background…`);
  history.replaceState({}, '', location.pathname);
  setTimeout(async () => {
    toast('Refreshing your data…');
    await Promise.all([loadOverview(), loadChannels(), loadSettings()]);
    toast(`${platform} data loaded`);
  }, 20000);
}

// ---------- Format catalog (per platform) ----------
const FORMAT_CATALOG = {
  youtube: [
    { value: 'vlog',         label: 'Vlog · my day',           desc: 'Day-in-the-life, build connection' },
    { value: 'breakdown',    label: 'Breakdown · framework',    desc: 'Teach a model / case study' },
    { value: 'coaching',     label: 'Coaching · client win',    desc: 'Walk through a client transformation' },
    { value: 'pov-day',      label: 'POV my day',               desc: 'POV cinematic day montage' },
    { value: 'reaction',     label: 'Reaction · breakdown',     desc: 'React to a video / news / mistake' },
    { value: 'tutorial',     label: 'Tutorial · how-to',        desc: 'Step-by-step explainer' },
    { value: 'listicle',     label: 'Listicle · 3-5-7 list',    desc: 'Numbered list, save-worthy' },
    { value: 'story',        label: 'Story · journey',          desc: 'Long-form personal arc' },
    { value: 'documentary',  label: 'Documentary · series',     desc: 'Multi-part deep dive' },
    { value: 'qa',           label: 'Q&A · community',          desc: 'Answer DMs / comments' }
  ],
  tiktok: [
    { value: 'pov',          label: 'POV story',                desc: 'POV: bạn vừa…' },
    { value: 'talking-head', label: 'Talking head',             desc: 'Straight to camera, hook + payoff' },
    { value: 'breakdown',    label: 'Breakdown',                desc: 'Break a viral / mistake / framework' },
    { value: 'reaction',     label: 'Reaction · stitch',        desc: 'Stitch / duet response' },
    { value: 'tutorial',     label: 'Tutorial · 60s',           desc: 'Mini how-to' },
    { value: 'vlog',         label: 'Vlog · day clip',          desc: 'Sliced from longer vlog' },
    { value: 'controversy',  label: 'Hot take',                 desc: 'Contrarian opinion' },
    { value: 'testimonial',  label: 'Testimonial · case',       desc: 'Student win story' }
  ],
  instagram: [
    { value: 'reel',         label: 'Reel · short',             desc: 'TikTok cross-post' },
    { value: 'carousel',     label: 'Carousel · 10 slides',     desc: 'High-save educational' },
    { value: 'story',        label: 'Story · 24h',              desc: 'Behind the scenes' },
    { value: 'post',         label: 'Static post',              desc: 'Quote / image' }
  ]
};

// Each format gets a color cue based on funnel stage
const FORMAT_COLOR = {
  // Storytelling (purple)
  vlog: '#c4b5fd', 'pov-day': '#c4b5fd', pov: '#c4b5fd', story: '#c4b5fd',
  // Educational (blue)
  breakdown: '#7dd3fc', tutorial: '#7dd3fc', coaching: '#7dd3fc', documentary: '#7dd3fc',
  // Direct value (green)
  'talking-head': '#86efac', listicle: '#86efac', qa: '#86efac', testimonial: '#86efac',
  // High-engagement / risky (orange)
  reaction: '#fdba74', controversy: '#fdba74',
  // IG specific
  reel: '#f9a8d4', carousel: '#f9a8d4', post: '#f9a8d4'
};

function formatOptions(platform, selected = '') {
  const list = FORMAT_CATALOG[platform] || [];
  return list.map(f => {
    const color = FORMAT_COLOR[f.value] || '#c4c2d6';
    return `<option value="${f.value}" ${f.value===selected?'selected':''} style="color:${color};background:#181828">${f.label}</option>`;
  }).join('');
}

// Repeat options for schedule
const REPEAT_OPTIONS = [
  { value: 'none',          label: 'Does not repeat' },
  { value: 'daily',          label: 'Every day' },
  { value: 'weekday',        label: 'Every weekday (Mon-Fri)' },
  { value: 'every-2-days',   label: 'Every 2 days' },
  { value: 'mon-wed-fri',    label: 'Mon · Wed · Fri' },
  { value: 'tue-thu',        label: 'Tue · Thu' },
  { value: 'weekly',         label: 'Every week (same weekday)' },
  { value: 'monthly',        label: 'Every month (same date)' }
];
function repeatOptions(selected = 'none') {
  return REPEAT_OPTIONS.map(r => `<option value="${r.value}" ${r.value===selected?'selected':''}>${r.label}</option>`).join('');
}

// ---------- Add schedule modal ----------
$('#addSchedule')?.addEventListener('click', () => {
  const today = new Date().toISOString().slice(0, 10);
  const endDefault = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  openModal({
    title: 'Schedule a post',
    bodyHTML: `
      <div class="modal-row">
        <div><label>Date</label><input type="date" id="m-date" value="${today}" /></div>
        <div><label>Time</label><input type="time" id="m-time" value="12:00" /></div>
      </div>
      <div class="modal-row">
        <div>
          <label>Platform</label>
          <select id="m-platform">
            <option value="youtube" style="color:#ff8a8a;background:#181828">YouTube</option>
            <option value="tiktok"  style="color:#6ff5f0;background:#181828">TikTok</option>
            <option value="instagram" style="color:#f47ba6;background:#181828">Instagram</option>
          </select>
        </div>
        <div>
          <label>Format</label>
          <select id="m-format">${formatOptions('youtube')}</select>
        </div>
      </div>
      <div>
        <label>Title</label>
        <input type="text" id="m-title" placeholder='e.g. "5 reasons I fired my $5K/mo VA"' />
      </div>
      <div>
        <label>Hook (first 7 words)</label>
        <input type="text" id="m-hook" placeholder='2-second grab line' />
      </div>
      <div>
        <label>CTA / notes</label>
        <textarea id="m-desc" placeholder='e.g. Comment "HỆ THỐNG" to receive template'></textarea>
      </div>
      <div class="modal-row">
        <div>
          <label>Repeat</label>
          <select id="m-repeat">${repeatOptions('none')}</select>
        </div>
        <div>
          <label>Until</label>
          <input type="date" id="m-until" value="${endDefault}" disabled />
        </div>
      </div>`,
    actions: [
      { label: 'Cancel',   onClick: closeModal },
      { label: 'Schedule', primary: true, icon: 'lucide-calendar-plus',
        onClick: async () => {
          const rule = $('#m-repeat').value;
          const item = {
            date:     $('#m-date').value,
            time:     $('#m-time').value,
            platform: $('#m-platform').value,
            format:   $('#m-format').value,
            title:    $('#m-title').value.trim() || 'Untitled post',
            hook:     $('#m-hook').value.trim(),
            cta:      $('#m-desc').value.trim(),
            status:   'idea',
            repeat:   rule !== 'none' ? { rule, until: $('#m-until').value } : null
          };
          if (!item.date) return toast('Pick a date');
          const r = await API.addContentPlan(item);
          const n = r?.created || 1;
          toast(`Scheduled${n>1?' · '+n+' instances':''}`);
          closeModal();
          loadSchedule();
        }}
    ]
  });
  // Wire dynamic dropdowns
  const p = $('#m-platform'), f = $('#m-format'), repeat = $('#m-repeat'), until = $('#m-until');
  if (p && f) p.addEventListener('change', () => f.innerHTML = formatOptions(p.value));
  if (repeat && until) repeat.addEventListener('change', () => {
    until.disabled = repeat.value === 'none';
  });
});

// ---------- Tab strip in overview (visual switch only) ----------
$$('.tab-strip .tab').forEach(t => {
  t.addEventListener('click', () => {
    t.parentElement.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
  });
});

// ---------- "Add new" channel + "Notify me" + theme icon swap ----------
$$('.channel-hero .btn-ghost').forEach(b => b.addEventListener('click', () => {
  showView('settings');
  toast('Connect another platform here');
}));
$$('.notify-card .btn-pill').forEach(b => b.addEventListener('click', () => {
  toast('Weekly digest notifications enabled');
}));

// Theme toggle: swap class + sun↔moon icon
const themeBtn = $('.theme-toggle');
themeBtn?.addEventListener('click', () => {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  const icon = themeBtn.querySelector('i');
  if (icon) {
    icon.className = isLight ? 'lucide-moon' : 'lucide-sun';
    icon.dataset.iconReady = '';
    icon.innerHTML = '';
    window.renderIcons?.(themeBtn);
  }
  toast(isLight ? 'Light mode' : 'Dark mode');
});

// ---------- Tracking filter chips (per platform on tracked list) ----------
// (none currently — kept as placeholder for future expansion)

// ---------- Connection buttons (always rewire after view load) ----------
function wireConnectButtons() {
  $$('[data-connect]').forEach(btn => {
    btn.onclick = () => {
      const platform = btn.dataset.connect;
      toast(`Redirecting to ${platform}…`);
      setTimeout(() => { window.location.href = API.authUrl(platform); }, 400);
    };
  });
}

// ---------- SUB-TAB NAV ----------
document.addEventListener('click', e => {
  const t = e.target.closest('[data-subtab]');
  if (!t) return;
  const id = t.dataset.subtab;
  const bar = t.parentElement;
  bar.querySelectorAll('.subtab').forEach(s => s.classList.remove('active'));
  t.classList.add('active');
  const parent = bar.parentElement;
  parent.querySelectorAll('.subpanel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  // Lazy load when activating
  if (id === 'trk-mine') loadMyTracking();
  if (id === 'trk-mentors' || id === 'trk-competitors') loadTracking();
  if (id === 'ideas-mine') loadMyIdeas();
  if (id === 'ideas-trending') loadIdeas();
  if (id === 'strat-campaigns') loadCampaigns();
  if (id === 'strat-series') loadSeriesPlanner();
  if (id === 'trk-prospects') loadProspects();
});

// Prospect/Student tab buttons
$('#addProspect')?.addEventListener('click', async () => {
  const url = $('#studentUrl')?.value.trim();
  if (!url) return openAddProspectModal();
  // Parse handle + platform from URL
  const handleMatch = url.match(/@[\w.\-]+/) || url.match(/instagram\.com\/([^/?#]+)/);
  const handle = handleMatch ? (handleMatch[0].startsWith('@') ? handleMatch[0] : '@' + handleMatch[1]) : '';
  const platform = /tiktok/i.test(url) ? 'tiktok'
                 : /instagram/i.test(url) ? 'instagram'
                 : /youtu/i.test(url) ? 'youtube' : 'tiktok';
  if (!handle) { toast('Could not detect handle from URL — opening manual form'); return openAddProspectModal(); }
  try {
    await API.addProspect({ url, handle, platform, display_name: handle.replace('@', '') });
    $('#studentUrl').value = '';
    toast('Student added · ' + handle);
    loadProspects();
  } catch (e) {
    toast('Failed to add — opening manual form');
    openAddProspectModal();
  }
});
$('#prospectBookmarklet')?.addEventListener('click', openProspectBookmarkletModal);
$('#appFormBtn')?.addEventListener('click', openAppFormModal);
// Submit on Enter in the quick URL input
$('#studentUrl')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#addProspect')?.click();
});

// Prospect status filter chips
$$('[data-prospect-status]').forEach(chip => chip.addEventListener('click', () => {
  $$('[data-prospect-status]').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  loadProspects();
}));

// Campaign buttons
$('#newCampaign')?.addEventListener('click', openCreateCampaignModal);
$('#seed30M')?.addEventListener('click', async () => {
  const today = new Date().toISOString().slice(0, 10);
  if (!confirm('Tạo campaign "30 Triệu Đầu Tiên · Cohort 1" với 4 phases pre-set?')) return;
  toast('Creating template…');
  const r = await API.seedHelp5Strangers(today);
  if (r?.id) {
    toast('Campaign created! Click to materialize.');
    loadCampaigns();
    setTimeout(() => openCampaign(r.id), 400);
  }
});

// ---------- MY TRACKING (My Videos sub-tab) ----------
async function loadMyTracking() {
  const [metrics, videos, baselines, funnels, goal] = await Promise.all([
    API.metrics(30),
    API.videos({ platform: 'all' }),
    API.getBaselines(),
    API.getFunnels(),
    API.getGoal(yyyymm())
  ]);
  // KPI cards
  $('#mineYtViews').textContent     = fmt(metrics.youtube?.views || 0);
  $('#mineYtSubs').textContent      = fmt(metrics.youtube?.subs || 0);
  $('#mineYtCtr').textContent       = (metrics.youtube?.ctr || 0) + '%';
  $('#mineYtWatch').textContent     = fmt(metrics.youtube?.watchHours || 0);
  $('#mineTtViews').textContent     = fmt(metrics.tiktok?.views || 0);
  $('#mineTtFollowers').textContent = fmt(baselines.tiktok?.followers || metrics.tiktok?.followers || 0);
  $('#mineTtEngage').textContent    = (metrics.tiktok?.engage || 0) + '%';
  $('#mineTtAvg').textContent       = fmt(baselines.tiktok?.avg_views || 0);
  $('#mineIgViews').textContent     = fmt(metrics.instagram?.reach || 0);
  $('#mineIgFollowers').textContent = fmt(baselines.instagram?.followers || metrics.instagram?.followers || 0);
  $('#mineIgEngage').textContent    = (metrics.instagram?.engage || 0) + '%';
  $('#mineIgSaves').textContent     = fmt(metrics.instagram?.saves || 0);
  // Leads — estimated from goal pacing (placeholder until you log real ones in content-plan)
  $('#mineLeads').textContent = '0';
  $('#mineCalls').textContent = '0';
  $('#mineSales').textContent = '0';
  $('#mineRev').textContent   = '$0';

  renderVideoTableInto('#mineVideoTable', videos);
  renderPlatformChart(); // reuse
  renderFormatPerf(videos);
  renderWinningVideos(videos);
  renderEngagementChart(videos);
  renderFocusActions(videos, metrics, goal);
  renderShortformVitals(videos);
  renderViralHits(videos);
  renderTopHooks(videos);
  renderPostingHeatmap(videos);
  renderFollowerGrowth('tiktok');
  $('#mineSyncLabel').textContent = 'Last sync: ' + new Date().toLocaleString('en-US');
}

// --- Winning insights ---
function renderWinningVideos(videos) {
  const root = $('#winningVideos');
  if (!root) return;
  const top = videos.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
  if (!top.length) {
    root.innerHTML = `<p class="muted" style="text-align:center;padding:20px">No videos synced yet — click "Sync now"</p>`;
    return;
  }
  root.innerHTML = top.map((v, i) => `
    <a class="win-row" href="${escapeHtml(v.url || '#')}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
      <div class="win-rank">${i + 1}</div>
      ${v.thumbnail ? `<img class="win-thumb" src="${escapeHtml(v.thumbnail)}" alt=""/>` : '<div class="win-thumb"></div>'}
      <div style="min-width:0">
        <div class="win-title">${escapeHtml(v.title || '(untitled)')}</div>
        <div class="win-sub">${v.platform.toUpperCase()} · ${v.date ? new Date(v.date).toLocaleDateString() : '—'} · ${fmt(v.likes || 0)} likes</div>
      </div>
      <div class="win-views">${fmt(v.views || 0)}<div class="win-sub" style="text-align:right">views</div></div>
      <div class="win-score ${(v.score || 0) >= 80 ? 'hot' : ''}">${v.score || 0}</div>
    </a>
  `).join('');
}

let _engagementChart;
function renderEngagementChart(videos) {
  const ctx = document.getElementById('engagementChart');
  if (!ctx) return;
  if (typeof Chart === 'undefined') return;
  const byDay = {};
  for (const v of (videos || [])) {
    if (!v.date) continue;
    const d = v.date.slice(0, 10);
    if (!byDay[d]) byDay[d] = { v: 0, l: 0, c: 0, s: 0 };
    byDay[d].v += +v.views || 0;
    byDay[d].l += +v.likes || 0;
    byDay[d].c += +v.comments || 0;
    byDay[d].s += +v.shares || 0;
  }
  const days = Object.keys(byDay).sort().slice(-30);
  if (!days.length) {
    const wrap = ctx.closest('.chart-wrap');
    if (wrap) wrap.innerHTML = `<p class="muted" style="text-align:center;padding:40px;font-size:13px">No engagement data yet</p>`;
    return;
  }
  const labels = days.map(d => d.slice(5));
  const rates = days.map(d => {
    const b = byDay[d];
    return b.v ? +(((b.l + b.c * 4 + b.s * 8) / b.v) * 100).toFixed(2) : 0;
  });
  try {
    if (_engagementChart) { _engagementChart.destroy(); _engagementChart = null; }
    _engagementChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{
        label: 'Engagement %', data: rates,
        borderColor: '#a78bfa',
        backgroundColor: 'rgba(167, 139, 250, 0.18)',
        fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2.5
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => 'Engagement: ' + c.parsed.y + '%' } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#6b6b80', font: { size: 10 }, maxTicksLimit: 8 } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b6b80', font: { size: 10 }, callback: v => v + '%' } }
        }
      }
    });
  } catch (e) {
    console.error('engagement chart render failed', e);
  }
}

// --- Follower growth tracker ---
let _followerChart;
async function renderFollowerGrowth(platform = 'tiktok') {
  const ctx = document.getElementById('followerChart');
  if (!ctx) return;
  let data;
  try {
    const r = await fetch('/api/follower-growth?platform=' + platform + '&range=30');
    data = await r.json();
  } catch (e) { return; }

  // Delta cards
  const root = document.getElementById('followerDeltas');
  if (root) {
    const fmtDelta = (n) => n == null ? '—' : (n > 0 ? '+' : '') + fmt(n);
    const grade = (n) => n == null ? '' : (n > 0 ? 'good' : n < 0 ? 'bad' : '');
    const cards = [
      { label: 'Current count', value: data.current != null ? fmt(data.current) : '—', bench: platform === 'youtube' ? 'YouTube subscribers' : 'TikTok followers', grade: '' },
      { label: '+ Today', value: fmtDelta(data.deltas.day), bench: 'vs yesterday EOD', grade: grade(data.deltas.day) },
      { label: '+ This week', value: fmtDelta(data.deltas.week), bench: '7-day net new', grade: grade(data.deltas.week) },
      { label: '+ This month', value: fmtDelta(data.deltas.month), bench: '30-day net new', grade: grade(data.deltas.month) }
    ];
    root.innerHTML = cards.map(c => `
      <div class="vital-stat ${c.grade}" style="grid-column: span 1.5">
        <div class="vs-label">${escapeHtml(c.label)}</div>
        <div class="vs-value">${c.value}</div>
        <div class="vs-bench">${escapeHtml(c.bench)}</div>
      </div>
    `).join('');
    // Override grid: 4 cards instead of 6
    root.style.gridTemplateColumns = 'repeat(4, 1fr)';
  }

  // Note about data availability
  const note = document.getElementById('followerNote');
  if (note) {
    if (data.data_points <= 1) {
      note.innerHTML = `📅 Mới có <b>${data.data_points} data point</b>. Cần ≥7 ngày sync data để chart có ý nghĩa. Cron sync chạy mỗi 30 phút → 24h nữa sẽ có trend đầu tiên.`;
    } else if (data.data_points < 7) {
      note.innerHTML = `📅 ${data.data_points} ngày data (từ ${data.earliest}). Đủ 7 ngày sẽ có trend rõ hơn.`;
    } else {
      note.innerHTML = `📊 ${data.data_points} ngày data. Snapshot mỗi 30 phút auto qua cron.`;
    }
  }

  // Chart
  if (typeof Chart === 'undefined') return;
  const labels = data.series.map(s => s.date.slice(5));
  const values = data.series.map(s => s.value);
  const color = platform === 'youtube' ? '#ff4d4d' : '#25f4ee';
  const fillRgba = platform === 'youtube' ? 'rgba(255,77,77,0.15)' : 'rgba(37,244,238,0.12)';
  try {
    if (_followerChart) { _followerChart.destroy(); _followerChart = null; }
    _followerChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{
        label: platform === 'youtube' ? 'YouTube subs' : 'TikTok followers',
        data: values,
        borderColor: color,
        backgroundColor: fillRgba,
        fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2.5,
        spanGaps: true
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => fmt(c.parsed.y) + ' ' + (platform === 'youtube' ? 'subs' : 'followers') } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#6b6b80', font: { size: 10 }, maxTicksLimit: 8 } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b6b80', font: { size: 10 }, callback: v => fmt(v) } }
        }
      }
    });
  } catch (e) { console.error('follower chart failed', e); }
}

// Wire platform chips (once)
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-fg-platform]');
  if (!btn) return;
  document.querySelectorAll('[data-fg-platform]').forEach(b => b.classList.toggle('active', b === btn));
  renderFollowerGrowth(btn.dataset.fgPlatform);
});

// --- Soo Wei Goh-style shortform vitals + viral hits + top hooks + heatmap ---
function renderShortformVitals(videos) {
  const root = document.getElementById('vitalsRow');
  if (!root) return;
  // Filter to shortform (TikTok + IG Reels equivalent; treat all TT + IG as shortform here)
  const shorts = (videos || []).filter(v => v.platform === 'tiktok' || v.platform === 'instagram');
  const total = shorts.reduce((a, v) => ({
    views: a.views + (+v.views || 0),
    likes: a.likes + (+v.likes || 0),
    comments: a.comments + (+v.comments || 0),
    shares: a.shares + (+v.shares || 0)
  }), { views: 0, likes: 0, comments: 0, shares: 0 });
  const safeDiv = (a, b) => b ? (a / b) : 0;
  const likeRate    = +(safeDiv(total.likes, total.views) * 100).toFixed(2);
  const commentRate = +(safeDiv(total.comments, total.views) * 100).toFixed(2);
  const shareRate   = +(safeDiv(total.shares, total.views) * 100).toFixed(2);
  // Benchmarks from Soo Wei Goh / Hormozi / general creator economy:
  // Like rate >5% good, >10% great. Comment rate >0.5% good, >1% great. Share rate >0.5% good, >1% great.
  const grade = (val, good, great) => val >= great ? 'good' : val >= good ? 'warn' : 'bad';
  const avgViewsPerShort = shorts.length ? Math.round(total.views / shorts.length) : 0;
  const avgGrade = avgViewsPerShort >= 100000 ? 'good' : avgViewsPerShort >= 10000 ? 'warn' : 'bad';
  // View velocity: average views in last 7d
  const recent = shorts.filter(v => v.date && (Date.now() - new Date(v.date).getTime()) < 7 * 86400000);
  const velocity = recent.length ? Math.round(recent.reduce((a, v) => a + (+v.views || 0), 0) / recent.length) : 0;

  const cards = [
    { label: 'Total shortform views', value: fmt(total.views), bench: shorts.length + ' videos · 30d', grade: '' },
    { label: 'Avg views / video', value: fmt(avgViewsPerShort), bench: '🎯 100K = viral · 10K = decent', grade: avgGrade },
    { label: 'Like rate', value: likeRate + '%', bench: '✅ ≥5% good · ≥10% great', grade: grade(likeRate, 5, 10) },
    { label: 'Comment rate', value: commentRate + '%', bench: '✅ ≥0.5% good · ≥1% great', grade: grade(commentRate, 0.5, 1) },
    { label: 'Share rate', value: shareRate + '%', bench: '✅ ≥0.5% good · ≥1% great · viral signal', grade: grade(shareRate, 0.5, 1) },
    { label: '7-day velocity', value: fmt(velocity), bench: `${recent.length} videos posted recent`, grade: velocity >= 10000 ? 'good' : '' }
  ];
  root.innerHTML = cards.map(c => `
    <div class="vital-stat ${c.grade}">
      <div class="vs-label">${escapeHtml(c.label)}</div>
      <div class="vs-value">${c.value}</div>
      <div class="vs-bench">${escapeHtml(c.bench)}</div>
    </div>
  `).join('');
}

function renderViralHits(videos) {
  const root = document.getElementById('viralHits');
  if (!root) return;
  const threshold = v => (v.platform === 'youtube' && v.views >= 10000) || (v.platform !== 'youtube' && v.views >= 100000);
  const closeTo = v => {
    if (v.platform === 'youtube') return v.views >= 1000 && v.views < 10000;
    return v.views >= 10000 && v.views < 100000;
  };
  const hits = videos.filter(threshold).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
  const nearMisses = videos.filter(closeTo).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 3);
  if (!hits.length && !nearMisses.length) {
    root.innerHTML = `<p class="muted" style="text-align:center;padding:24px;font-size:13px">Chưa có viral hit nào. Target: ≥10K view longform, ≥100K view shortform. Top close-call sẽ hiện ở đây khi bạn có video gần threshold.</p>`;
    return;
  }
  const renderRow = (v, badge) => `
    <a class="vh-row" href="${escapeHtml(v.url || '#')}" target="_blank" style="text-decoration:none;color:inherit">
      ${v.thumbnail ? `<img class="vh-thumb" src="${escapeHtml(v.thumbnail)}" alt=""/>` : '<div class="vh-thumb"></div>'}
      <div style="min-width:0">
        <div class="vh-title">${escapeHtml(v.title || '(untitled)')}</div>
        <div class="vh-sub">${v.platform.toUpperCase()} · ${v.date ? new Date(v.date).toLocaleDateString() : '—'} · ${badge}</div>
      </div>
      <div class="vh-views">${fmt(v.views || 0)}</div>
    </a>
  `;
  root.innerHTML = `
    ${hits.length ? '<p class="muted small" style="margin:0 0 8px"><b style="color:#76faa5">🏆 Viral hits:</b></p>' + hits.map(v => renderRow(v, '🔥 viral')).join('') : ''}
    ${nearMisses.length ? '<p class="muted small" style="margin:14px 0 8px"><b style="color:#ffc400">⚡ Close to viral:</b></p>' + nearMisses.map(v => renderRow(v, '⚡ near')).join('') : ''}
  `;
}

function renderTopHooks(videos) {
  const root = document.getElementById('topHooks');
  if (!root) return;
  // Group by first ≤7-word prefix
  const buckets = {};
  for (const v of videos) {
    if (!v.title || !v.views) continue;
    const words = v.title.split(/\s+/).slice(0, 4).join(' ').toLowerCase().replace(/[^\w\sàáâãèéêìíòóôõùúýăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỷỹ]/gi, '').trim();
    if (!words) continue;
    if (!buckets[words]) buckets[words] = { count: 0, views: 0 };
    buckets[words].count++;
    buckets[words].views += v.views;
  }
  const ranked = Object.entries(buckets)
    .map(([k, v]) => ({ hook: k, count: v.count, avg: Math.round(v.views / v.count) }))
    .filter(x => x.count >= 1 && x.avg >= 20)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8);
  if (!ranked.length) {
    root.innerHTML = `<p class="muted" style="text-align:center;padding:24px;font-size:13px">Quay thêm 10-15 videos để phân tích pattern hook winning.</p>`;
    return;
  }
  root.innerHTML = ranked.map(h => `
    <div class="hook-row">
      <div class="hook-text">"${escapeHtml(h.hook)}…"</div>
      <div class="hook-count">${h.count} video${h.count > 1 ? 's' : ''}</div>
      <div class="hook-avg">${fmt(h.avg)} avg</div>
    </div>
  `).join('');
}

function renderPostingHeatmap(videos) {
  const root = document.getElementById('postingHeatmap');
  if (!root) return;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Build 7×24 grid of view sums
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  const count = Array.from({ length: 7 }, () => Array(24).fill(0));
  let hasData = false;
  for (const v of videos) {
    if (!v.date) continue;
    const d = new Date(v.date);
    const dayIdx = (d.getDay() + 6) % 7;   // Mon=0
    const hour = d.getHours();
    grid[dayIdx][hour] += +v.views || 0;
    count[dayIdx][hour]++;
    if (v.views) hasData = true;
  }
  if (!hasData) {
    root.innerHTML = `<p class="muted" style="text-align:center;padding:24px;font-size:13px">Heatmap fills in as you post videos. Need at least 5-10 videos at different times.</p>`;
    return;
  }
  // Compute avg views per cell + max for color scaling
  const avg = grid.map((row, i) => row.map((sum, j) => count[i][j] ? sum / count[i][j] : 0));
  const max = Math.max(...avg.flat());
  const level = (val) => {
    if (!val) return 0;
    const r = val / max;
    return r >= 0.75 ? 4 : r >= 0.5 ? 3 : r >= 0.25 ? 2 : 1;
  };
  const hours = Array.from({ length: 24 }, (_, i) => i);
  let html = `
    <div class="heatmap">
      <div class="heatmap-row">
        <div></div>
        ${hours.map(h => `<div class="heatmap-header" style="text-align:center">${h}h</div>`).join('')}
      </div>
      ${DAYS.map((d, i) => `
        <div class="heatmap-row">
          <div class="heatmap-day-label">${d}</div>
          ${hours.map(h => `<div class="heatmap-cell" data-level="${level(avg[i][h])}" title="${d} ${h}:00 · avg ${fmt(Math.round(avg[i][h]))} views"></div>`).join('')}
        </div>
      `).join('')}
    </div>
    <p class="muted small" style="margin-top:10px;text-align:right">Darker = higher avg views. Hover for details.</p>
  `;
  root.innerHTML = html;
}

function renderFocusActions(videos, metrics, goal) {
  const root = $('#focusActions');
  if (!root) return;
  const actions = [];

  // Format analysis: which format has highest avg score?
  const fmtBuckets = {};
  for (const v of videos) {
    const t = (v.title || '').toLowerCase();
    let bucket = 'talking-head';
    if (t.includes('pov') || t.includes('day in')) bucket = 'vlog / pov';
    else if (t.includes('breakdown') || t.includes('how') || t.includes('framework') || t.includes('cách')) bucket = 'breakdown';
    else if (t.includes('mistake') || t.includes('reason') || t.includes('sai lầm')) bucket = 'listicle';
    else if (t.includes('story') || t.includes('chuyện')) bucket = 'story';
    fmtBuckets[bucket] = fmtBuckets[bucket] || { score: 0, count: 0, views: 0 };
    fmtBuckets[bucket].score += v.score || 0;
    fmtBuckets[bucket].count += 1;
    fmtBuckets[bucket].views += v.views || 0;
  }
  const fmtRanked = Object.entries(fmtBuckets)
    .map(([k, v]) => ({ name: k, avgScore: v.score / Math.max(1, v.count), avgViews: v.views / Math.max(1, v.count), count: v.count }))
    .filter(x => x.count >= 2)
    .sort((a, b) => b.avgScore - a.avgScore);

  if (fmtRanked.length) {
    actions.push({
      kind: 'good', icon: '🏆',
      title: `Double down on "${fmtRanked[0].name}"`,
      desc: `Format này có ${fmtRanked[0].count} videos, avg score ${Math.round(fmtRanked[0].avgScore)}, avg ${fmt(Math.round(fmtRanked[0].avgViews))} views. Plan thêm 3-5 videos cùng format tuần này.`
    });
    if (fmtRanked.length > 1) {
      const worst = fmtRanked[fmtRanked.length - 1];
      if (worst.avgScore < fmtRanked[0].avgScore * 0.5) {
        actions.push({
          kind: 'warn', icon: '⚠️',
          title: `Cut down on "${worst.name}"`,
          desc: `Format này underperforming: avg score chỉ ${Math.round(worst.avgScore)} (vs winning format ${Math.round(fmtRanked[0].avgScore)}). Pause hoặc rework cách approach.`
        });
      }
    }
  }

  // Engagement signal
  const ttEngage = parseFloat(metrics.tiktok?.engage || 0);
  if (ttEngage > 0 && ttEngage < 3) {
    actions.push({
      kind: 'warn', icon: '💬',
      title: 'TikTok engagement rate thấp',
      desc: `Hiện ${ttEngage}% — under 3% nghĩa là hook chưa đủ stop scroll. Test thêm hook formula: shock-statement + curiosity gap.`
    });
  } else if (ttEngage >= 5) {
    actions.push({
      kind: 'good', icon: '🔥',
      title: 'TikTok engagement đỉnh',
      desc: `${ttEngage}% — bạn đang viral material. Push thêm nội dung tương tự để bắt sóng algorithm.`
    });
  }

  // Volume signal
  const totalThisMonth = videos.filter(v => v.date && v.date.slice(0, 7) === new Date().toISOString().slice(0, 7)).length;
  if (totalThisMonth < 12) {
    actions.push({
      kind: 'warn', icon: '📅',
      title: `Chỉ ${totalThisMonth} videos tháng này`,
      desc: 'Khuyến nghị min 12-15 videos/tháng để feed algorithm. Target 1 short-form mỗi ngày, 2 long-form/tuần.'
    });
  }

  // Goal pacing
  if (goal?.yt_subs) {
    const cur = metrics.youtube?.subs || 0;
    const gap = goal.yt_subs - cur;
    if (gap > 0) {
      actions.push({
        kind: 'good', icon: '🎯',
        title: `YouTube subs gap: ${fmt(gap)}`,
        desc: `Cần thêm ${fmt(gap)} subs để hit goal tháng (${fmt(goal.yt_subs)}). Avg 1 vlog/pov video bring 50-200 subs — plan ${Math.ceil(gap / 100)} vlog/pov videos.`
      });
    }
  }

  if (!actions.length) {
    actions.push({
      kind: 'good', icon: '✅',
      title: 'Chưa đủ data để generate focus actions',
      desc: 'Quay 5-10 videos nữa trong 30 ngày tới thì AI insights sẽ ngon hơn.'
    });
  }

  root.innerHTML = actions.map(a => `
    <div class="focus-card ${a.kind}">
      <div class="fc-icon">${a.icon}</div>
      <h4>${escapeHtml(a.title)}</h4>
      <p>${escapeHtml(a.desc)}</p>
    </div>
  `).join('');
}
function renderVideoTableInto(sel, videos) {
  const root = $(sel);
  if (!root) return;
  if (!videos.length) {
    root.innerHTML = `<p class="muted" style="padding:20px;text-align:center">No videos yet. Connect a platform or sync.</p>`;
    return;
  }
  const icon = { youtube: '<i class="lucide-youtube yt"></i>', tiktok: '<i class="lucide-music tt"></i>', instagram: '<i class="lucide-instagram ig"></i>' };
  root.innerHTML = videos.map(v => `
    <div class="trow">
      <span class="ttitle"><span class="thumb"></span>${escapeHtml(v.title || '')}</span>
      <span class="muted">${v.date ? new Date(v.date).toLocaleDateString('en-US', { day:'2-digit', month:'short' }) : '—'}</span>
      <span>${icon[v.platform] || ''}</span>
      <span><b>${fmt(v.views || 0)}</b></span>
      <span class="muted">${fmt(v.likes || 0)}</span>
      <span class="muted">${fmt(v.comments || 0)}</span>
      <span>${v.ctr ? v.ctr + '%' : '—'}</span>
      <span class="muted">${v.retention != null ? v.retention + '%' : '—'}</span>
      <span class="score-pill ${(v.score||0) >= 90 ? 'hot' : ''}">${v.score || 0}</span>
    </div>
  `).join('');
}
function renderFormatPerf(videos) {
  // No format column in synced YouTube videos yet → derive lightweight from title keywords
  // Group by inferred format
  const buckets = {};
  for (const v of videos) {
    const t = (v.title || '').toLowerCase();
    let bucket = 'other';
    if (t.includes('pov') || t.includes('day in')) bucket = 'vlog / pov';
    else if (t.includes('breakdown') || t.includes('how') || t.includes('framework')) bucket = 'breakdown / tutorial';
    else if (t.includes('mistake') || t.includes('reason')) bucket = 'listicle';
    else if (t.includes('story')) bucket = 'story';
    else bucket = 'talking-head';
    buckets[bucket] = buckets[bucket] || { views: 0, count: 0 };
    buckets[bucket].views += v.views || 0;
    buckets[bucket].count += 1;
  }
  const rows = Object.entries(buckets).map(([k, v]) => ({ name: k, avg: Math.round(v.views / Math.max(1, v.count)), count: v.count }))
    .sort((a,b) => b.avg - a.avg);
  if (!rows.length) {
    $('#formatPerf').innerHTML = `<p class="muted" style="padding:20px;text-align:center">Format performance shows once you have more videos.</p>`;
    return;
  }
  const max = rows[0].avg || 1;
  $('#formatPerf').innerHTML = rows.map(r => `
    <div class="fp-row">
      <div>${escapeHtml(r.name)} <span class="muted small">· ${r.count} videos</span></div>
      <div class="fp-bar"><div style="width:${Math.min(100, r.avg/max*100)}%"></div></div>
      <b>${fmt(r.avg)} avg</b>
    </div>
  `).join('');
}

// ---------- MY IDEAS / BRAINSTORM ----------
let _brainstormAll = [];
async function loadMyIdeas() {
  const active = $$('.subtab[data-subtab="ideas-mine"]')[0];
  if (!active?.classList.contains('active')) return; // only when visible
  const status = ($$('[data-mine-status].active')[0]?.dataset.mineStatus) || 'all';
  _brainstormAll = await API.myIdeas(status);
  renderMyIdeas(applyBrainstormFilter(_brainstormAll));
}
function applyBrainstormFilter(list) {
  const q = ($('#brainstormSearch')?.value || '').trim().toLowerCase();
  const kind = $$('[data-docs-kind].active')[0]?.dataset.docsKind || 'all';
  return list.filter(i => {
    if (kind !== 'all' && (i.docs_kind || '') !== kind) return false;
    if (q) {
      const hay = [i.title, i.format, i.hook, i.description, i.why_works, i.tags].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function docsKindIcon(kind) {
  return { doc: 'lucide-file-text', sheet: 'lucide-table', slide: 'lucide-presentation',
           figma: 'lucide-pen-tool', notion: 'lucide-book-open' }[kind] || 'lucide-link';
}
function docsKindLabel(kind) {
  return { doc: 'Google Doc', sheet: 'Google Sheet', slide: 'Slides',
           figma: 'Figma', notion: 'Notion' }[kind] || 'Link';
}
function renderMyIdeas(list) {
  const root = $('#myIdeasGrid');
  if (!root) return;
  if (!list.length) {
    root.innerHTML = `<div class="card big-card" style="text-align:center;padding:40px">
      <h3 style="margin:0 0 8px">Inbox is empty</h3>
      <p class="muted">Click "+ New idea" or use the bookmarklet on a YouTube/Instagram video to save it here.</p>
    </div>`;
    return;
  }
  root.innerHTML = list.map(i => `
    <div class="idea-card" data-my-idea-id="${i.id}">
      <div class="idea-meta">
        ${platIcon(i.platform)}
        ${i.format ? `<span class="idea-badge">${i.format}</span>` : ''}
        <span class="idea-status-pill ${i.status}">${i.status}</span>
      </div>
      ${i.source_thumb ? `<div class="idea-thumb"><img src="${i.source_thumb}" alt="" onerror="this.parentNode.innerHTML='<i class=\\'lucide-film\\'></i>'"/></div>` :
        i.source_url ? `<div class="idea-thumb"><i class="lucide-film"></i></div>` : ''}
      <h3 class="idea-title">${escapeHtml(i.title || '')}</h3>
      ${i.source_author ? `<p class="idea-source"><i class="lucide-external-link"></i> <a href="${i.source_url}" target="_blank">${escapeHtml(i.source_author)}</a></p>` : ''}
      ${i.hook ? `<p class="idea-desc" style="color:var(--violet);font-style:italic">"${escapeHtml(i.hook)}"</p>` : ''}
      <p class="idea-desc">${escapeHtml(i.description || '')}</p>
      ${i.docs_url ? `<a class="docs-link" href="${escapeHtml(i.docs_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
        <i class="${docsKindIcon(i.docs_kind)}"></i>
        <span>${docsKindLabel(i.docs_kind)} · open</span>
        <i class="lucide-external-link" style="margin-left:auto;opacity:.6"></i>
      </a>` : ''}
      ${i.why_works ? `<p class="muted small" style="margin-top:auto"><b style="color:var(--text-2)">Why it works:</b> ${escapeHtml(i.why_works)}</p>` : ''}
      <div class="idea-actions">
        <button class="btn-pill sm" data-idea-edit="${i.id}"><i class="lucide-edit"></i> Edit</button>
        ${i.status !== 'scheduled' ? `<button class="btn-pill primary sm" data-idea-schedule="${i.id}"><i class="lucide-calendar-plus"></i> Schedule</button>` : ''}
        <button class="btn-pill sm" data-idea-delete="${i.id}" title="Delete"><i class="lucide-trash"></i></button>
      </div>
    </div>
  `).join('');

  // Wire actions
  $$('[data-idea-edit]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const idea = list.find(x => x.id === b.dataset.ideaEdit);
    openMyIdeaModal(idea);
  }));
  $$('[data-idea-schedule]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const idea = list.find(x => x.id === b.dataset.ideaSchedule);
    openScheduleIdeaModal(idea);
  }));
  $$('[data-idea-delete]').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm('Delete this idea?')) return;
    await API.deleteMyIdea(b.dataset.ideaDelete);
    toast('Deleted');
    loadMyIdeas();
  }));
}

// -------- CONTENTO ↔ DRIVE WORKSPACE (per-tab folders + sync) --------

let _driveWorkspace = null;
const DRIVE_KIND_ICON = { doc: 'lucide-file-text', sheet: 'lucide-table', slide: 'lucide-presentation', folder: 'lucide-folder', pdf: 'lucide-file', image: 'lucide-image' };

async function fetchWorkspace() {
  try {
    const r = await fetch('/api/contento-drive/workspace');
    _driveWorkspace = await r.json();
  } catch { _driveWorkspace = null; }
  return _driveWorkspace;
}

async function setupWorkspace() {
  try {
    const r = await fetch('/api/contento-drive/setup', { method: 'POST' });
    if (r.status === 401) { toast('Connect Google Drive in Settings first'); return null; }
    const ws = await r.json();
    if (ws.error) { toast(ws.error); return null; }
    _driveWorkspace = ws;
    toast('Contento folder + 4 sub-folders ready in your Drive');
    return ws;
  } catch (e) { toast('Setup failed: ' + e.message); return null; }
}

function openWorkspaceModal() {
  const ws = _driveWorkspace;
  const tabs = ['strategy', 'tracking', 'ideas', 'schedule'];
  const bodyConnected = ws ? `
    <p class="muted">Tất cả file Contento được lưu trong 1 folder gốc <b>Contento</b> + 4 folder con. Click để mở từng folder trong Drive:</p>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px">
      <a href="${ws.root.url}" target="_blank" class="dp-file" style="background:rgba(167,139,250,0.08);border-color:rgba(167,139,250,0.3)">
        <i class="lucide-folder kind"></i>
        <div><div class="dpf-name">${escapeHtml(ws.root.name)}</div><div class="dpf-sub">Root folder</div></div>
      </a>
      ${tabs.map(t => `
        <a href="${ws.tabs[t].url}" target="_blank" class="dp-file">
          <i class="lucide-folder kind"></i>
          <div><div class="dpf-name">${escapeHtml(ws.tabs[t].name)}</div><div class="dpf-sub">Tab folder</div></div>
        </a>
      `).join('')}
    </div>
    <p class="muted small" style="margin-top:14px">💡 Mỗi tab trong Contento (Strategy / Tracking / Ideas / Schedule) có panel Drive riêng ở cuối tab — tìm kiếm, tạo file mới ngay tại chỗ.</p>
  ` : `
    <p>Setup 1 folder workspace trong Google Drive cho Contento:</p>
    <ul class="muted" style="line-height:1.7;padding-left:18px">
      <li>📁 <b>Contento</b> (root)
        <ul>
          <li>📁 Strategy</li>
          <li>📁 Tracking</li>
          <li>📁 Ideas</li>
          <li>📁 Schedule</li>
        </ul>
      </li>
    </ul>
    <p class="muted small">Idempotent — nếu folder đã tồn tại trong Drive thì reuse, không tạo trùng.</p>
  `;
  openModal({
    title: ws ? 'Contento Drive workspace' : 'Setup Contento Drive workspace',
    bodyHTML: bodyConnected,
    actions: ws
      ? [
          { label: 'Close', onClick: closeModal },
          { label: 'Re-scan / repair folders', primary: true, icon: 'lucide-refresh-cw', onClick: async () => {
              await setupWorkspace();
              closeModal();
              loadAllDrivePanels();
            }}
        ]
      : [
          { label: 'Cancel', onClick: closeModal },
          { label: 'Create folders now', primary: true, icon: 'lucide-folder-plus', onClick: async () => {
              const ws2 = await setupWorkspace();
              closeModal();
              if (ws2) loadAllDrivePanels();
            }}
        ]
  });
}

// Per-tab Drive panel: list files + search + create new
async function loadDrivePanel(tab) {
  const panel = document.querySelector(`.drive-panel[data-drive-tab="${tab}"]`);
  if (!panel) return;
  const ws = _driveWorkspace || await fetchWorkspace();
  const list = panel.querySelector('.dp-list');
  const openBtn = panel.querySelector('.dp-open');
  if (!ws?.tabs?.[tab]) {
    if (openBtn) openBtn.style.display = 'none';
    list.innerHTML = `<div class="dp-empty">
      <p>Chưa setup folder Drive cho tab này.</p>
      <button class="btn-pill primary sm dp-setup"><i class="lucide-folder-plus"></i> Setup Contento folders</button>
    </div>`;
    panel.querySelector('.dp-setup')?.addEventListener('click', openWorkspaceModal);
    return;
  }
  if (openBtn) { openBtn.href = ws.tabs[tab].url; openBtn.style.display = ''; }
  const q = panel.querySelector('.dp-search').value.trim();
  list.innerHTML = `<p class="dp-empty"><i class="lucide-refresh-cw"></i> Loading…</p>`;
  try {
    const r = await fetch('/api/contento-drive/' + tab + '/files' + (q ? '?q=' + encodeURIComponent(q) : ''));
    if (r.status === 401) { list.innerHTML = `<p class="dp-empty" style="color:#ff8a8a">Google Drive disconnected</p>`; return; }
    const data = await r.json();
    if (data.error) { list.innerHTML = `<p class="dp-empty" style="color:#ff8a8a">${escapeHtml(data.error)}</p>`; return; }
    if (!data.files.length) {
      list.innerHTML = `<div class="dp-empty">
        <p>${q ? 'No files matching "' + escapeHtml(q) + '"' : 'Folder trống. Tạo file đầu tiên:'}</p>
      </div>`;
      return;
    }
    list.innerHTML = data.files.map(f => `
      <a class="dp-file" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">
        <i class="${DRIVE_KIND_ICON[f.kind] || 'lucide-file'} kind"></i>
        <div style="min-width:0;flex:1">
          <div class="dpf-name">${escapeHtml(f.name)}</div>
          <div class="dpf-sub">${f.kind} · ${new Date(f.modified).toLocaleDateString()}</div>
        </div>
      </a>
    `).join('');
  } catch (e) {
    list.innerHTML = `<p class="dp-empty" style="color:#ff8a8a">${escapeHtml(e.message)}</p>`;
  }
}

function loadAllDrivePanels() {
  ['strategy', 'tracking', 'ideas', 'schedule'].forEach(t => loadDrivePanel(t).catch(() => {}));
}

// One-time event wiring: setup, search (debounce), new-file buttons
(function wireDrivePanels() {
  // Header folder icon → workspace modal
  document.querySelector('.round-btn[title="Library"]')?.addEventListener('click', async () => {
    await fetchWorkspace();
    openWorkspaceModal();
  });

  // Per-panel events
  document.querySelectorAll('.drive-panel').forEach(panel => {
    const tab = panel.dataset.driveTab;
    let timer;
    panel.querySelector('.dp-search')?.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => loadDrivePanel(tab), 250);
    });
    panel.querySelectorAll('.dp-new').forEach(btn => btn.addEventListener('click', async () => {
      const kind = btn.dataset.kind;
      if (!_driveWorkspace?.tabs?.[tab]) {
        if (!confirm('Workspace chưa setup. Tạo Contento folders trong Drive ngay?')) return;
        const ws = await setupWorkspace();
        if (!ws) return;
      }
      const name = prompt('Name for new ' + kind + ':', 'Untitled ' + kind);
      if (!name) return;
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="lucide-refresh-cw"></i> Creating…';
      try {
        const r = await fetch('/api/contento-drive/' + tab + '/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, name })
        });
        const out = await r.json();
        if (!out.url) throw new Error(out.error || 'create failed');
        window.open(out.url, '_blank');
        toast(kind + ' created in ' + tab + ' folder');
        loadDrivePanel(tab);
      } catch (e) {
        toast('Create failed: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }));
  });

  // Lazy-load each panel when its tab becomes visible
  const obs = new MutationObserver(() => {
    document.querySelectorAll('.drive-panel').forEach(panel => {
      const view = panel.closest('.view');
      if (view?.classList.contains('active') && !panel.dataset.loaded) {
        panel.dataset.loaded = '1';
        loadDrivePanel(panel.dataset.driveTab).catch(() => {});
      }
    });
  });
  document.querySelectorAll('.view').forEach(v => obs.observe(v, { attributes: true, attributeFilter: ['class'] }));

  // Initial fetch + load any already-active panel
  fetchWorkspace().then(() => loadAllDrivePanels());
})();

// -------- SOPS (tiered library, password-gated for clients) --------
const SOP_TIERS = [
  { key: 'starter', label: 'STARTER', price: '8.000.000đ · 4 tuần', desc: 'Chọn 1 module: Content System HOẶC Delivery System' },
  { key: 'growth',  label: 'GROWTH',  price: '15.000.000đ · 8 tuần', desc: 'Full A-Z System · 8 buổi coaching + SOP Library + Template' },
  { key: 'premium', label: 'PREMIUM', price: '25.000.000đ · 8 tuần', desc: 'GROWTH + 1-1 custom build + Done-for-you setup' }
];

async function loadSops() {
  const root = $('#sopsTiers');
  if (!root) return;
  const ws = await fetch('/api/sops/workspace').then(r => r.json()).catch(() => null);
  if (!ws) {
    root.innerHTML = `<div class="card big-card" style="grid-column:1/-1;text-align:center;padding:40px">
      <p class="muted" style="margin-bottom:14px">SOPs folders chưa được tạo trong Drive.</p>
      <button class="btn-pill primary" id="sopsSetupInline"><i class="lucide-folder-plus"></i> Setup SOPs folders now</button>
    </div>`;
    $('#sopsSetupInline')?.addEventListener('click', setupSops);
    return;
  }
  // Render 3 tier cards
  root.innerHTML = SOP_TIERS.map(t => `
    <div class="sop-tier ${t.key}" data-tier="${t.key}">
      <div class="sop-tier-head">
        <span class="sop-tier-tag">${t.label}</span>
        <a href="${ws.tiers[t.key].url}" target="_blank" class="btn-pill sm" title="Open in Drive"><i class="lucide-external-link"></i></a>
      </div>
      <h3>${ws.tiers[t.key].name}</h3>
      <p class="sop-price">${escapeHtml(t.price)} · ${escapeHtml(t.desc)}</p>
      <div class="sop-tier-actions">
        <button class="btn-pill sm sop-new" data-tier="${t.key}" data-kind="doc"><i class="lucide-file-text"></i> Doc</button>
        <button class="btn-pill sm sop-new" data-tier="${t.key}" data-kind="sheet"><i class="lucide-table"></i> Sheet</button>
        <button class="btn-pill sm sop-new" data-tier="${t.key}" data-kind="slide"><i class="lucide-presentation"></i> Slides</button>
      </div>
      <div class="sop-file-list" id="sopList-${t.key}"><p class="muted small" style="padding:14px;text-align:center">Loading…</p></div>
      <div class="sop-pw-row">
        <i class="lucide-lock"></i>
        ${ws.passwords[t.key]
          ? `<span class="has-pw">Password set ✓</span>
             <input type="password" placeholder="Change password (blank = clear)" data-pw-tier="${t.key}" />
             <button class="btn-pill sm sop-pw-save" data-tier="${t.key}">Update</button>`
          : `<span class="no-pw">No password</span>
             <input type="password" placeholder="Set password for clients" data-pw-tier="${t.key}" />
             <button class="btn-pill sm primary sop-pw-save" data-tier="${t.key}">Set</button>`
        }
      </div>
    </div>
  `).join('');
  // Load files per tier
  SOP_TIERS.forEach(t => loadSopFiles(t.key));
  // Wire new-file buttons
  root.querySelectorAll('.sop-new').forEach(btn => btn.addEventListener('click', async () => {
    const tier = btn.dataset.tier, kind = btn.dataset.kind;
    const name = prompt('Name for new ' + kind + ' in ' + tier.toUpperCase() + ':', 'Untitled ' + kind);
    if (!name) return;
    btn.disabled = true;
    try {
      const r = await fetch('/api/sops/' + tier + '/create', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ kind, name }) });
      const out = await r.json();
      if (!out.url) throw new Error(out.error || 'create failed');
      window.open(out.url, '_blank');
      toast('Created in ' + tier);
      loadSopFiles(tier);
    } catch (e) { toast('Failed: ' + e.message); }
    finally { btn.disabled = false; }
  }));
  // Wire password save
  root.querySelectorAll('.sop-pw-save').forEach(btn => btn.addEventListener('click', async () => {
    const tier = btn.dataset.tier;
    const input = root.querySelector(`[data-pw-tier="${tier}"]`);
    const password = input?.value || '';
    if (password && password.length < 4) return toast('Password phải ≥ 4 ký tự');
    try {
      await fetch('/api/sops/' + tier + '/password', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password }) });
      toast(password ? 'Password set for ' + tier : 'Password cleared for ' + tier);
      loadSops();
    } catch (e) { toast('Failed: ' + e.message); }
  }));
}

async function loadSopFiles(tier) {
  const list = $('#sopList-' + tier);
  if (!list) return;
  try {
    const r = await fetch('/api/sops/' + tier + '/files');
    const data = await r.json();
    if (!data.files?.length) {
      list.innerHTML = `<p class="muted small" style="padding:14px;text-align:center">No files in this tier yet.</p>`;
      return;
    }
    list.innerHTML = data.files.map(f => `
      <a class="dp-file" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">
        <i class="${DRIVE_KIND_ICON[f.kind] || 'lucide-file'} kind"></i>
        <div style="min-width:0;flex:1">
          <div class="dpf-name">${escapeHtml(f.name)}</div>
          <div class="dpf-sub">${f.kind} · ${new Date(f.modified).toLocaleDateString()}</div>
        </div>
      </a>
    `).join('');
  } catch (e) {
    list.innerHTML = `<p class="muted small" style="padding:14px;text-align:center;color:#ff8a8a">${escapeHtml(e.message)}</p>`;
  }
}

async function setupSops() {
  toast('Creating SOPs folders in Drive…');
  try {
    const r = await fetch('/api/sops/setup', { method: 'POST' });
    if (r.status === 401) { toast('Connect Google Drive first'); return; }
    const ws = await r.json();
    if (ws.error) return toast(ws.error);
    toast('SOPs folders ready');
    loadSops();
  } catch (e) { toast('Setup failed: ' + e.message); }
}

function openSopsClientPreview() {
  openModal({
    title: 'Client preview — try as a client',
    bodyHTML: `
      <p class="muted">Đây là cách client nhập tier + password để xem SOPs read-only:</p>
      <div class="modal-row">
        <div><label>Tier</label>
          <select id="cpv-tier">
            <option value="starter">STARTER (lowest)</option>
            <option value="growth">GROWTH (mid)</option>
            <option value="premium">PREMIUM (highest)</option>
          </select>
        </div>
        <div><label>Password (leave blank if tier has no pw)</label><input type="password" id="cpv-pw" /></div>
      </div>
      <div id="cpv-result" style="margin-top:14px"></div>
    `,
    actions: [
      { label: 'Close', onClick: closeModal },
      { label: 'Access SOPs', primary: true, icon: 'lucide-unlock', onClick: async () => {
          const tier = $('#cpv-tier').value;
          const password = $('#cpv-pw').value;
          const r = await fetch('/api/sops/client-access', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tier, password }) });
          const out = await r.json();
          if (out.error) { $('#cpv-result').innerHTML = `<p style="color:#ff8a8a">${escapeHtml(out.error)}</p>`; return; }
          $('#cpv-result').innerHTML = `
            <p class="muted small">✓ Unlocked tiers: <b>${out.unlocked.join(', ').toUpperCase()}</b></p>
            ${out.unlocked.map(t => `
              <div style="margin-top:14px">
                <h4 style="margin:0 0 8px">${t.toUpperCase()} (${out.data[t].files.length} files)</h4>
                <div style="display:flex;flex-direction:column;gap:4px">
                  ${out.data[t].files.length ? out.data[t].files.map(f => `
                    <a class="dp-file" href="${escapeHtml(f.url)}" target="_blank">
                      <i class="${DRIVE_KIND_ICON[f.kind] || 'lucide-file'} kind"></i>
                      <div><div class="dpf-name">${escapeHtml(f.name)}</div></div>
                    </a>`).join('')
                    : `<p class="muted small">No files yet</p>`}
                </div>
              </div>
            `).join('')}
          `;
      }}
    ]
  });
}

async function seedSopDemos() {
  if (!confirm('Tạo 10 demo SOP files (4 STARTER + 4 GROWTH + 2 PREMIUM) trong Drive folders? Skip nếu file đã tồn tại.')) return;
  toast('Generating SOP demo content… (~30s)');
  try {
    const r = await fetch('/api/sops/seed-demos', { method: 'POST' });
    const out = await r.json();
    if (out.error) return toast('Failed: ' + out.error);
    toast(`Done · created ${out.total_created} · skipped ${out.total_skipped} existing`);
    loadSops();
  } catch (e) { toast('Failed: ' + e.message); }
}

// Wire SOPs view
(function wireSops() {
  $('#sopsSetupBtn')?.addEventListener('click', setupSops);
  $('#sopsClientView')?.addEventListener('click', openSopsClientPreview);
  $('#sopsSeedBtn')?.addEventListener('click', seedSopDemos);
  // Lazy-load when SOPs view becomes active
  const view = document.getElementById('view-sops');
  if (view) {
    const obs = new MutationObserver(() => {
      if (view.classList.contains('active') && !view.dataset.loaded) {
        view.dataset.loaded = '1';
        loadSops();
      }
    });
    obs.observe(view, { attributes: true, attributeFilter: ['class'] });
  }
})();

// Lightweight Drive file picker — uses our /api/drive/files endpoint
function openDrivePicker(onPick) {
  const kindIcon = (k) => ({ doc:'lucide-file-text', sheet:'lucide-table', slide:'lucide-presentation',
                              pdf:'lucide-file', image:'lucide-image' }[k] || 'lucide-file');
  openModal({
    title: 'Pick a file from Google Drive',
    bodyHTML: `
      <div class="track-input">
        <i class="lucide-search"></i>
        <input id="dp-q" placeholder="Search Drive by filename..." autofocus />
      </div>
      <div id="dp-list" style="margin-top:12px;max-height:420px;overflow:auto;display:flex;flex-direction:column;gap:6px">
        <p class="muted" style="text-align:center;padding:20px">Loading recent files…</p>
      </div>
    `,
    actions: [ { label: 'Close', onClick: closeModal } ]
  });
  const render = (items) => {
    const list = $('#dp-list');
    if (!list) return;
    if (!items.length) { list.innerHTML = `<p class="muted" style="text-align:center;padding:20px">No files found.</p>`; return; }
    list.innerHTML = items.map(f => `
      <div class="dp-row" data-file-id="${f.id}" data-file-url="${escapeHtml(f.url || '')}" data-file-name="${escapeHtml(f.name || '')}"
           style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;cursor:pointer">
        <i class="${kindIcon(f.kind)}" style="color:var(--violet);font-size:18px"></i>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(f.name)}</div>
          <div class="muted small">${f.kind} · ${f.owner || ''} · ${new Date(f.modified).toLocaleDateString()}</div>
        </div>
        <i class="lucide-arrow-up-right muted"></i>
      </div>
    `).join('');
    $$('.dp-row').forEach(row => row.addEventListener('click', () => {
      onPick({ id: row.dataset.fileId, url: row.dataset.fileUrl, name: row.dataset.fileName });
      closeModal();
    }));
  };
  const fetchFiles = async (q='') => {
    try {
      const r = await fetch('/api/drive/files' + (q ? '?q=' + encodeURIComponent(q) : ''));
      if (r.status === 401) {
        $('#dp-list').innerHTML = `<p class="muted" style="text-align:center;padding:20px">Google Drive isn't connected. Open Settings to connect.</p>`;
        return;
      }
      const items = await r.json();
      render(Array.isArray(items) ? items : []);
    } catch (e) {
      $('#dp-list').innerHTML = `<p class="muted" style="text-align:center;padding:20px;color:#ff8a8a">Error: ${e.message}</p>`;
    }
  };
  fetchFiles();
  let timer;
  $('#dp-q')?.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => fetchFiles(e.target.value.trim()), 250);
  });
}

function openMyIdeaModal(idea) {
  const isEdit = !!idea;
  const i = idea || { platform: 'youtube', status: 'idea' };
  openModal({
    title: isEdit ? 'Edit idea' : 'New idea',
    bodyHTML: `
      ${!isEdit ? `
      <div style="padding:14px;background:rgba(167,139,250,0.08);border:1px dashed rgba(167,139,250,0.3);border-radius:12px;margin-bottom:14px">
        <label style="color:var(--violet)">Paste a video URL to AI-breakdown & save</label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <input id="mi-url" placeholder="https://youtube.com/watch?v=... · tiktok.com/... · instagram.com/p/..." style="flex:1" />
          <button class="btn-pill primary sm" id="mi-breakdown-btn"><i class="lucide-sparkles"></i> Break down</button>
        </div>
        <div id="mi-breakdown-result"></div>
      </div>` : ''}
      <div><label>Title</label><input id="mi-title" value="${escapeHtml(i.title || '')}" placeholder="e.g. POV: từ 1-1 → group 15 người" /></div>
      <div class="modal-row">
        <div>
          <label>Target platform</label>
          <select id="mi-platform">
            <option value="youtube" ${i.platform==='youtube'?'selected':''} style="color:#ff8a8a;background:#181828">YouTube</option>
            <option value="tiktok"  ${i.platform==='tiktok' ?'selected':''} style="color:#6ff5f0;background:#181828">TikTok</option>
            <option value="instagram" ${i.platform==='instagram'?'selected':''} style="color:#f47ba6;background:#181828">Instagram</option>
          </select>
        </div>
        <div>
          <label>Format</label>
          <select id="mi-format">${formatOptions(i.platform, i.format)}</select>
        </div>
      </div>
      <div><label>Hook (first 7 words)</label><input id="mi-hook" value="${escapeHtml(i.hook || '')}" /></div>
      <div><label>Description / outline</label><textarea id="mi-desc" rows="3">${escapeHtml(i.description || '')}</textarea></div>
      <div><label>Why this format works</label><textarea id="mi-why" rows="2" placeholder="e.g. Strong split-screen visual, easy hook, audience save-rate high">${escapeHtml(i.why_works || '')}</textarea></div>
      <div>
        <label><i class="lucide-link" style="vertical-align:-2px"></i> Google Docs / Sheets / Slides / Notion / Figma link <span class="muted">(optional)</span></label>
        <input id="mi-docs" placeholder="https://docs.google.com/document/d/... · sheets.google.com/... · notion.so/..." value="${escapeHtml(i.docs_url || '')}" />
        <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
          <button type="button" class="btn-pill sm" id="mi-drive-pick"><i class="lucide-cloud"></i> Pick from Drive</button>
          <button type="button" class="btn-pill sm" id="mi-drive-create"><i class="lucide-file-plus"></i> Create new Doc</button>
        </div>
        <p class="muted small" style="margin-top:4px">Auto-detect: doc / sheet / slide / notion / figma. Hiển thị thành nút mở nhanh ở mỗi card.</p>
      </div>
      ${i.source_url ? `<div><label>Source reference</label><input value="${escapeHtml(i.source_url)}" readonly /></div>` : ''}
      <div>
        <label>Status</label>
        <select id="mi-status">
          ${['idea','drafting','ready','scheduled','dropped'].map(s => `<option ${s===i.status?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: isEdit ? 'Save' : 'Add idea', primary: true, icon: 'lucide-save', onClick: async () => {
          const body = {
            title:       $('#mi-title').value,
            platform:    $('#mi-platform').value,
            format:      $('#mi-format').value,
            hook:        $('#mi-hook').value,
            description: $('#mi-desc').value,
            why_works:   $('#mi-why').value,
            docs_url:    $('#mi-docs').value.trim(),
            status:      $('#mi-status').value
          };
          if (isEdit) await API.updateMyIdea(i.id, body);
          else        await API.addMyIdea(body);
          toast('Saved');
          closeModal();
          loadMyIdeas();
        }}
    ]
  });
  // Platform change → repopulate formats
  const p = $('#mi-platform'), f = $('#mi-format');
  if (p && f) p.addEventListener('change', () => f.innerHTML = formatOptions(p.value));

  // Google Drive picker (lightweight modal — replaces the iframe Google Picker for simplicity)
  $('#mi-drive-pick')?.addEventListener('click', async () => {
    try {
      const probe = await fetch('/api/drive/files?limit=1');
      if (probe.status === 401) return toast('Connect Google Drive in Settings first');
    } catch {}
    openDrivePicker((file) => {
      $('#mi-docs').value = file.url;
      toast('Linked: ' + file.name);
    });
  });
  // Create new Google Doc named after the idea title
  $('#mi-drive-create')?.addEventListener('click', async () => {
    const name = ($('#mi-title')?.value || '').trim() || 'Untitled brainstorm';
    const btn = $('#mi-drive-create');
    btn.disabled = true;
    btn.innerHTML = '<i class="lucide-refresh-cw"></i> Creating…';
    try {
      const r = await fetch('/api/drive/create-doc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (r.status === 401) { toast('Connect Google Drive in Settings first'); return; }
      const out = await r.json();
      if (!out.url) throw new Error(out.error || 'create failed');
      $('#mi-docs').value = out.url;
      window.open(out.url, '_blank');
      toast('New Doc created · linked');
    } catch (e) {
      toast('Create failed: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="lucide-file-plus"></i> Create new Doc';
    }
  });

  // URL breakdown wiring (only for new ideas)
  if (!isEdit) {
    const btn = $('#mi-breakdown-btn');
    btn?.addEventListener('click', async () => {
      const url = $('#mi-url').value.trim();
      if (!url) return toast('Paste a YouTube / TikTok / Instagram URL first');
      btn.disabled = true;
      btn.innerHTML = '<i class="lucide-refresh-cw"></i> Analyzing…';
      const a = await API.breakdownUrl(url);
      btn.disabled = false;
      btn.innerHTML = '<i class="lucide-sparkles"></i> Break down';
      if (!a) return toast('Breakdown failed');

      // Fill form fields with AI suggestions
      if (a.title)            $('#mi-title').value = a.title;
      if (a.platform)         $('#mi-platform').value = a.platform;
      if (f) f.innerHTML = formatOptions($('#mi-platform').value, a.detected_format || '');
      if (a.detected_format)  $('#mi-format').value = a.detected_format;
      if (a.hook_pattern)     $('#mi-hook').value = a.hook_pattern;
      if (a.replicate_for_ang) $('#mi-desc').value = a.replicate_for_ang;
      if (a.why_works)        $('#mi-why').value = a.why_works;

      // Show breakdown panel
      const struct = (a.structure || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');
      $('#mi-breakdown-result').innerHTML = `
        <div class="breakdown-result">
          ${a.thumbnail ? `<div class="bd-thumb"><img src="${a.thumbnail}" alt=""/></div>` : ''}
          <h4>${escapeHtml(a.title || '')} · <span class="muted">by ${escapeHtml(a.author || '?')}</span></h4>
          <div class="bd-section"><b>Detected format:</b> ${a.detected_format} · <b>Swipe score:</b> ${a.swipe_score || '?'}</div>
          <div class="bd-section"><b>Hook pattern:</b> ${escapeHtml(a.hook_pattern || '')}</div>
          <div class="bd-section"><b>Structure:</b><ul>${struct}</ul></div>
          <div class="bd-section"><b>Why it works:</b> ${escapeHtml(a.why_works || '')}</div>
          <div class="bd-section"><b>Replicate for ANG:</b> ${escapeHtml(a.replicate_for_ang || '')}</div>
          ${a.warnings ? `<div class="bd-section muted small">⚠️ ${escapeHtml(a.warnings)}</div>` : ''}
        </div>
      `;
      toast('Form filled with AI breakdown');
    });
  }
}

function openScheduleIdeaModal(idea) {
  const today = new Date().toISOString().slice(0, 10);
  openModal({
    title: `Schedule "${idea.title}"`,
    bodyHTML: `
      <p class="muted">This will push the idea to your content plan and mark it "scheduled".</p>
      <div class="modal-row">
        <div><label>Date</label><input type="date" id="si-date" value="${today}" /></div>
        <div><label>Time</label><input type="time" id="si-time" value="12:00" /></div>
      </div>
      <div><label>CTA</label><input id="si-cta" placeholder='e.g. Comment "HỆ THỐNG" để nhận template' /></div>
      <div class="modal-row">
        <div><label>Target views</label><input type="number" id="si-views" value="${idea.platform==='youtube'?1000:3000}" /></div>
        <div><label>Target leads</label><input type="number" id="si-leads" value="3" /></div>
      </div>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Schedule', primary: true, icon: 'lucide-calendar-plus', onClick: async () => {
          await API.scheduleMyIdea(idea.id, {
            date:         $('#si-date').value,
            time:         $('#si-time').value,
            cta:          $('#si-cta').value,
            target_views: parseInt($('#si-views').value) || 0,
            target_leads: parseInt($('#si-leads').value) || 0
          });
          toast('Scheduled! Find it in Schedule tab.');
          closeModal();
          loadMyIdeas();
          loadSchedule();
          loadStrategy();
        }}
    ]
  });
}

// ---------- FORMAT LIBRARY ----------
async function loadFormats() {
  const platform = ($$('[data-format-platform].active')[0]?.dataset.formatPlatform) || 'all';
  const cat = ($$('[data-format-cat].active')[0]?.dataset.formatCat) || 'all';
  let formats = await API.formats(platform);
  if (cat !== 'all') formats = formats.filter(f => f.category === cat);
  renderFormats(formats);
}
function renderFormats(list) {
  const root = $('#formatsGrid');
  if (!root) return;
  if (!list.length) {
    root.innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;padding:30px">
      <p class="muted">No formats yet. Click "AI suggest formats" to seed your library with 6 winning formats for your niche.</p>
    </div>`;
    return;
  }
  root.innerHTML = list.map(f => `
    <div class="format-card" data-format-id="${f.id}">
      <div class="fc-head">
        <div class="fc-platform ${platCls(f.platform)}">${platIcon(f.platform)}</div>
        <span class="fc-tag">${f.best_for || '—'}</span>
        <span class="fc-cat ${f.category}">${f.category}</span>
      </div>
      <h4>${escapeHtml(f.name)}</h4>
      <p class="fc-desc">${escapeHtml(f.description || '')}</p>
      <div class="fc-stats">
        <div><b>${fmt(f.avg_views || 0)}</b><span class="muted small">avg views</span></div>
        <div><b>${Math.round((f.win_rate||0)*100)}%</b><span class="muted small">win rate</span></div>
      </div>
    </div>
  `).join('');
  $$('.format-card').forEach(el => el.addEventListener('click', () => {
    const f = list.find(x => x.id === el.dataset.formatId);
    openFormatModal(f);
  }));
}
function openFormatModal(f) {
  const s = f.structure || {};
  const beats = (s.beats || []).map(b => `<li>${escapeHtml(b)}</li>`).join('');
  openModal({
    title: f.name,
    bodyHTML: `
      <p class="muted">${escapeHtml(f.description || '')}</p>
      ${s.hook ? `<p><b>Hook seed:</b> <span style="color:var(--violet)">"${escapeHtml(s.hook)}"</span></p>` : ''}
      ${beats ? `<div><b>Beat structure:</b><ul style="padding-left:18px;color:var(--text-2)">${beats}</ul></div>` : ''}
      ${s.cta_pattern ? `<p><b>CTA pattern:</b> ${escapeHtml(s.cta_pattern)}</p>` : ''}
      ${(f.examples||[]).length ? `<p><b>References:</b><br>${(f.examples||[]).map(u => `<a href="${u}" target="_blank" style="color:var(--violet);font-size:12px;display:block">${u}</a>`).join('')}</p>` : ''}
      ${f.notes ? `<p class="muted small">Note: ${escapeHtml(f.notes)}</p>` : ''}
    `,
    actions: [
      { label: 'Close', onClick: closeModal },
      ...(f.category !== 'mine' ? [{ label: 'Save to mine', icon: 'lucide-bookmark', onClick: async () => {
        await API.addFormat({ ...f, category: 'mine', id: undefined });
        toast('Saved');
        closeModal();
        loadFormats();
      }}] : []),
      { label: 'Use → Add idea', primary: true, icon: 'lucide-plus', onClick: () => {
        closeModal();
        openMyIdeaModal({
          platform: f.platform,
          format:   f.name.toLowerCase().includes('pov') ? 'pov' : 'talking-head',
          hook:     s.hook || '',
          description: (s.beats || []).join(' · '),
          why_works: f.notes || '',
          status: 'idea'
        });
      }}
    ]
  });
}

// ---------- Strategy wiring ----------
$('#genStrategy')?.addEventListener('click', async () => {
  toast('AI is drafting your 4-week strategy…');
  const period = yyyymm();
  await API.generateStrategy(period);
  toast('Strategy ready!');
  loadStrategy();
});
$('#editGoal')?.addEventListener('click', async () => {
  const period = yyyymm();
  const g = (await API.getGoal(period)) || { yt_subs:0, tt_followers:0, ig_followers:0, leads:0, revenue:0 };
  openModal({
    title: `Edit goal for ${period}`,
    bodyHTML: `
      <div class="modal-row">
        <div><label>YouTube subs</label><input id="g-yt" type="number" value="${g.yt_subs}" /></div>
        <div><label>TikTok followers</label><input id="g-tt" type="number" value="${g.tt_followers}" /></div>
      </div>
      <div class="modal-row">
        <div><label>Instagram followers</label><input id="g-ig" type="number" value="${g.ig_followers}" /></div>
        <div><label>Leads</label><input id="g-leads" type="number" value="${g.leads}" /></div>
      </div>
      <div>
        <label>Revenue target ($)</label>
        <input id="g-rev" type="number" value="${g.revenue}" />
      </div>
      <div>
        <label>Notes</label>
        <textarea id="g-notes" rows="2">${escapeHtml(g.notes || '')}</textarea>
      </div>`,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Save goal', primary: true, icon: 'lucide-save', onClick: async () => {
          await API.setGoal(period, {
            yt_subs:      parseInt($('#g-yt').value)    || 0,
            tt_followers: parseInt($('#g-tt').value)    || 0,
            ig_followers: parseInt($('#g-ig').value)    || 0,
            leads:        parseInt($('#g-leads').value) || 0,
            revenue:      parseInt($('#g-rev').value)   || 0,
            notes:        $('#g-notes').value
          });
          toast('Goal saved');
          closeModal();
          loadStrategy();
        }}
    ]
  });
});

// Reload strategy when hash changes to it
window.addEventListener('hashchange', () => {
  if (location.hash === '#strategy') loadStrategy();
});

// Recommender button
$('#rec-go')?.addEventListener('click', runRecommender);

// Funnel objective + build
$$('.obj-card').forEach(c => c.addEventListener('click', () => selectObjective(c.dataset.objective)));
$('#fn-build')?.addEventListener('click', buildFunnelPlan);

// ---------- Format library buttons ----------
$('#suggestFormats')?.addEventListener('click', async () => {
  toast('AI suggesting winning formats…');
  await API.suggestFormats();
  toast('6 formats added to library');
  loadFormats();
});
$('#addFormat')?.addEventListener('click', () => {
  openModal({
    title: 'Add a custom format',
    bodyHTML: `
      <div><label>Name</label><input id="af-name" placeholder='e.g. "POV: before vs after"' /></div>
      <div class="modal-row">
        <div>
          <label>Platform</label>
          <select id="af-platform">
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
        <div>
          <label>Best for</label>
          <select id="af-bestfor">
            <option value="awareness">Awareness (TOFU)</option>
            <option value="trust">Trust (MOFU)</option>
            <option value="convert">Convert (BOFU)</option>
          </select>
        </div>
      </div>
      <div><label>Description</label><textarea id="af-desc" rows="3"></textarea></div>
      <div><label>Hook seed</label><input id="af-hook" /></div>
      <div><label>Beats (one per line)</label><textarea id="af-beats" rows="5" placeholder="0-2s hook&#10;2-15s problem&#10;..."></textarea></div>
      <div><label>CTA pattern</label><input id="af-cta" /></div>
      <div class="modal-row">
        <div><label>Avg views (your data)</label><input id="af-views" type="number" /></div>
        <div><label>Win rate (0-1)</label><input id="af-win" type="number" step="0.01" /></div>
      </div>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Add', primary: true, icon: 'lucide-plus', onClick: async () => {
          await API.addFormat({
            name:        $('#af-name').value,
            platform:    $('#af-platform').value,
            category:    'mine',
            description: $('#af-desc').value,
            best_for:    $('#af-bestfor').value,
            structure: {
              hook:  $('#af-hook').value,
              beats: $('#af-beats').value.split('\n').filter(Boolean),
              cta_pattern: $('#af-cta').value
            },
            avg_views: parseInt($('#af-views').value) || 0,
            win_rate:  parseFloat($('#af-win').value)  || 0
          });
          toast('Format added');
          closeModal();
          loadFormats();
        }}
    ]
  });
});

// Format filter chips
$$('[data-format-platform], [data-format-cat]').forEach(chip => {
  chip.addEventListener('click', () => {
    const key = chip.dataset.formatPlatform ? 'formatPlatform' : 'formatCat';
    $$(`[data-${key === 'formatPlatform' ? 'format-platform' : 'format-cat'}]`).forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    loadFormats();
  });
});

// Brainstorm (my-ideas) status filter chips
$$('[data-mine-status]').forEach(chip => chip.addEventListener('click', () => {
  $$('[data-mine-status]').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  loadMyIdeas();
}));
// Brainstorm docs-kind filter chips (filters in-memory, no server call)
$$('[data-docs-kind]').forEach(chip => chip.addEventListener('click', () => {
  $$('[data-docs-kind]').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  renderMyIdeas(applyBrainstormFilter(_brainstormAll));
}));
// Brainstorm search input — debounce + re-filter
let _brainstormSearchTimer;
$('#brainstormSearch')?.addEventListener('input', () => {
  clearTimeout(_brainstormSearchTimer);
  _brainstormSearchTimer = setTimeout(() => renderMyIdeas(applyBrainstormFilter(_brainstormAll)), 120);
});
$('#brainstormClear')?.addEventListener('click', () => {
  const el = $('#brainstormSearch');
  if (el) { el.value = ''; el.focus(); }
  renderMyIdeas(applyBrainstormFilter(_brainstormAll));
});
$('#addMyIdea')?.addEventListener('click', () => openMyIdeaModal(null));

// Mentor / Competitor wiring (replace legacy #addTrack)
$('#addMentor')?.addEventListener('click', async () => {
  const url = $('#mentorUrl').value.trim();
  if (!url) return toast('Paste a URL');
  await API.addTracked({ url, tag: 'Mentor' });
  $('#mentorUrl').value = '';
  toast('Added as mentor');
  loadTracking();
});
$('#addCompetitor')?.addEventListener('click', async () => {
  const url = $('#competitorUrl').value.trim();
  if (!url) return toast('Paste a URL');
  await API.addTracked({ url, tag: 'Competitor' });
  $('#competitorUrl').value = '';
  toast('Added as competitor');
  loadTracking();
});
$('#mineSyncBtn')?.addEventListener('click', async () => {
  toast('Syncing…');
  await API.sync();
  loadMyTracking();
  toast('Synced');
});
$$('[data-mine-platform]').forEach(c => c.addEventListener('click', async () => {
  $$('[data-mine-platform]').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  const v = await API.videos({ platform: c.dataset.minePlatform });
  renderVideoTableInto('#mineVideoTable', v);
}));

// ---------- CLEAR SCHEDULE (multi-option) ----------
$('#clearSchedule')?.addEventListener('click', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date();
  const dow = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - dow);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const monthEnd = new Date(calYear, calMonth, 0).toISOString().slice(0, 10);
  const monthStart = new Date(calYear, calMonth - 1, 1).toISOString().slice(0, 10);

  // Fetch campaigns for the by-campaign option
  const campaigns = await API.campaigns();
  const campaignOptions = campaigns.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  openModal({
    title: 'Clear scheduled items',
    bodyHTML: `
      <p class="muted small">Pick a scope below. This only affects <b>content_plan slots</b> — videos, leads, profile and goals are untouched.</p>

      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
        <label class="scope-pick"><input type="radio" name="clr-scope" value="today" checked> <b>Today only</b> · ${today}</label>
        <label class="scope-pick"><input type="radio" name="clr-scope" value="week"> <b>This week</b> · ${weekStartStr} → ${addDaysISO(weekStartStr, 6)}</label>
        <label class="scope-pick"><input type="radio" name="clr-scope" value="month"> <b>This calendar month</b> · ${monthStart} → ${monthEnd}</label>
        <label class="scope-pick"><input type="radio" name="clr-scope" value="range"> <b>Custom range</b>
          <input type="date" id="clr-from" value="${today}" style="margin-left:8px;width:140px" />
          <span>→</span>
          <input type="date" id="clr-to" value="${addDaysISO(today, 7)}" style="width:140px" />
        </label>
        ${campaigns.length ? `<label class="scope-pick"><input type="radio" name="clr-scope" value="campaign"> <b>Campaign:</b>
          <select id="clr-campaign" style="margin-left:8px">${campaignOptions}</select>
        </label>` : ''}
        <label class="scope-pick"><input type="radio" name="clr-scope" value="status"> <b>Status:</b>
          <select id="clr-status" style="margin-left:8px">
            <option value="idea">idea</option>
            <option value="scripted">scripted</option>
            <option value="filmed">filmed</option>
            <option value="edited">edited</option>
            <option value="published">published</option>
            <option value="measured">measured</option>
          </select>
        </label>
        <label class="scope-pick"><input type="radio" name="clr-scope" value="platform"> <b>Platform:</b>
          <select id="clr-platform" style="margin-left:8px">
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
          </select>
        </label>
        <label class="scope-pick" style="border-color:rgba(248,113,113,0.3)"><input type="radio" name="clr-scope" value="all"> <b style="color:var(--red)">EVERYTHING</b> · all content_plan slots</label>
      </div>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Delete', primary: true, icon: 'lucide-trash', onClick: async () => {
        const scope = document.querySelector('input[name="clr-scope"]:checked')?.value || 'today';
        let r, label;
        switch (scope) {
          case 'today':    r = await API.clearContentPlanDate(today); label = 'today'; break;
          case 'week':     r = await API.clearContentPlanRange(weekStartStr, addDaysISO(weekStartStr, 6)); label = 'this week'; break;
          case 'month':    r = await API.clearContentPlanRange(monthStart, monthEnd); label = 'this month'; break;
          case 'range':    r = await API.clearContentPlanRange($('#clr-from').value, $('#clr-to').value); label = 'date range'; break;
          case 'campaign': r = await API.clearContentPlanCampaign($('#clr-campaign').value); label = 'campaign'; break;
          case 'status':   r = await API.clearContentPlanStatus($('#clr-status').value); label = 'status'; break;
          case 'platform': r = await API.clearContentPlanPlatform($('#clr-platform').value); label = 'platform'; break;
          case 'all':
            if (!confirm('Type-confirm: delete ALL slots forever?')) return;
            r = await API.clearAllContentPlan(); label = 'everything';
            break;
        }
        toast(`Cleared · ${label}${r?.deleted != null ? ' (' + r.deleted + ' items)' : ''}`);
        closeModal();
        loadSchedule();
        loadStrategy();
      }}
    ]
  });
});

// ---------- LEADS UI ----------
$('#addLead')?.addEventListener('click', () => {
  openModal({
    title: 'Log a lead',
    bodyHTML: `
      <div><label>Name</label><input id="ld-name" /></div>
      <div class="modal-row">
        <div><label>Email</label><input id="ld-email" /></div>
        <div><label>Phone</label><input id="ld-phone" /></div>
      </div>
      <div>
        <label>Source</label>
        <select id="ld-source">
          <option value="youtube">YouTube</option>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="form" selected>Google Form</option>
          <option value="manual">Manual / other</option>
        </select>
      </div>
      <div><label>Message / notes</label><textarea id="ld-msg" rows="3"></textarea></div>
    `,
    actions: [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Save', primary: true, icon: 'lucide-save', onClick: async () => {
        await API.addLead({
          source:  $('#ld-source').value,
          name:    $('#ld-name').value,
          email:   $('#ld-email').value,
          phone:   $('#ld-phone').value,
          message: $('#ld-msg').value
        });
        toast('Lead saved');
        closeModal();
        loadLeads();
        loadOverview();
      }}
    ]
  });
});

$('#setupGAS')?.addEventListener('click', () => {
  openModal({
    title: 'Connect your Google Form',
    bodyHTML: `
      <p class="muted">To auto-ingest leads from your Google Form (e.g. <code>forms.gle/RA7aLeQXknZGoXVJ7</code>), paste this Apps Script into your Form's script editor.</p>
      <ol style="padding-left:20px;color:var(--text-2);font-size:13px;line-height:1.7">
        <li>Open your <b>Google Form</b></li>
        <li>Click the <b>3 dots</b> (top right) → <b>Script editor</b></li>
        <li>Paste the script below → save → click <b>Triggers</b> (left clock icon) → Add Trigger → <code>onFormSubmit</code> · <code>From form</code> · <code>On form submit</code></li>
        <li>Authorize when prompted</li>
      </ol>
      <div style="position:relative;margin-top:14px">
        <textarea id="gas-code" readonly rows="14" style="font-family:ui-monospace,'JetBrains Mono',monospace;font-size:11.5px;line-height:1.4">Loading...</textarea>
        <button class="btn-pill sm" id="copyGas" style="position:absolute;top:8px;right:8px"><i class="lucide-copy"></i> Copy</button>
      </div>
      <p class="muted small" style="margin-top:10px">⚠️ For this to work in production, your Contento server must be reachable from the internet. For local dev, use <code>ngrok</code> or similar to tunnel <code>localhost:4000</code>.</p>
    `,
    actions: [{ label: 'Close', onClick: closeModal }]
  });
  // Fetch the snippet
  fetch(API.gasSnippetUrl()).then(r => r.text()).then(code => {
    const t = $('#gas-code');
    if (t) t.value = code;
  });
  $('#copyGas')?.addEventListener('click', () => {
    const t = $('#gas-code');
    if (t) { t.select(); document.execCommand('copy'); toast('Copied'); }
  });
});

// ---------- BOOKMARKLET ----------
$('#bookmarkletBtn')?.addEventListener('click', () => {
  const origin = location.origin;
  const code = `javascript:(function(){var u=location.href,t=document.title,a='',m,p='';
    if(/youtube.com\\/watch/.test(u)){p='youtube';m=document.querySelector('ytd-channel-name a,#owner-name a');if(m)a=m.textContent.trim();}
    else if(/instagram.com/.test(u)){p='instagram';m=document.querySelector('header a');if(m)a=m.textContent.trim();}
    else if(/tiktok.com/.test(u)){p='tiktok';m=document.querySelector('[data-e2e=\\"browse-username\\"]');if(m)a=m.textContent.trim();}
    var img=document.querySelector('meta[property=\\"og:image\\"]');var thumb=img?img.content:'';
    fetch('${origin}/api/ideas/ingest',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url:u,title:t,thumbnail:thumb,author:a,platform:p})})
      .then(r=>r.json()).then(d=>alert('Saved to Contento Ideas ✓'));})()`;
  const encoded = code.replace(/\s+/g, ' ');
  openModal({
    title: 'Save videos from YouTube / Instagram → Ideas',
    bodyHTML: `
      <p class="muted">Drag the button below to your bookmarks bar. Then on any YouTube, Instagram, or TikTok video page, click it — the video saves into "My ideas" automatically.</p>
      <div style="text-align:center;margin:20px 0">
        <a href="${encoded}" class="btn-pill primary lg" style="text-decoration:none;display:inline-flex">
          <i class="lucide-bookmark"></i> Save to Contento
        </a>
      </div>
      <p class="muted small"><b>How to install:</b><br>
        1. Make sure your bookmarks bar is visible (Ctrl+Shift+B in Chrome/Edge)<br>
        2. Drag the violet button above to the bar<br>
        3. Visit any YouTube/Instagram/TikTok video<br>
        4. Click "Save to Contento" → done</p>
    `,
    actions: [{ label: 'Got it', primary: true, onClick: closeModal }]
  });
});

// ---------- BOOT ----------
(async function boot() {
  await Promise.all([loadOverview(), loadSettings(), loadStrategy()]);
  // lazy load others when first navigated to — but pre-warm anyway
  loadChannels();
  loadTracking();
  loadIdeas();
  loadSchedule();
})();
