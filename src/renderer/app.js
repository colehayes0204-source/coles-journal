'use strict';
window.addEventListener('error', (ev) => {
  console.log('[renderer]', ev.message, ev.filename, ev.lineno);
});
window.addEventListener('unhandledrejection', (ev) => {
  const reason = ev.reason;
  console.log('[renderer] rejection', reason && (reason.stack || reason.message) || reason);
});
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = n => Math.round(n * 100) / 100;
const fmtR = r => r == null ? '—' : (r > 0 ? '+' : '') + Number(r).toFixed(2).replace(/\.?0+$/, '') + 'R';
const fmt$ = v => v == null ? '—' : (v < 0 ? '-$' : v > 0 ? '+$' : '$') + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const niceDate = s => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const shotUrl = n => 'gon://shots/' + encodeURIComponent(n);
const mediaUrl = n => 'gon://media/' + encodeURIComponent(n);
const wait = ms => new Promise(r => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) document.body.classList.add('reduced');

// Fallback mascot, used only if the portrait file is missing.
const FALLBACK_MASCOT = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#e8f4ff"/><path d="M50 92c-20 0-30-8-30-8l6-14h48l6 14s-10 8-30 8z" fill="#2e8b3e"/><circle cx="50" cy="52" r="20" fill="#f1c9a5"/><path d="M28 48 22 18l14 14 4-22 10 18 10-20 4 22 14-12-6 30z" fill="#141414"/><circle cx="43" cy="54" r="2.4" fill="#222"/><circle cx="57" cy="54" r="2.4" fill="#222"/><path d="M44 62q6 5 12 0" stroke="#222" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`);
const INSTRUMENTS = ['MNQ', 'MES', 'NQ', 'ES', 'MGC', 'GC', 'MYM'];
const SETUPS = ['10am H6 sweep + CISD', '10am sweep + CISD', 'H6 sweep', 'Continuation', 'Reversal'];
const EMOTIONS = ['Calm', 'Patient', 'Confident', 'Focused', 'FOMO', 'Anxious', 'Frustrated', 'Revenge', 'Greedy', 'Bored'];

const state = { tab: 'home', logs: [], stats: null, settings: null, mode: 'list', calMonth: new Date(), editing: null, form: {}, homeAnimated: false, homeQuoteId: '', pnlMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), pnlDate: null, education: [], eduMentor: '', eduSrcPath: null, eduEditing: null, motivation: [], motiveFilter: 'all', motiveKind: 'quote', motiveSrc: null, recaps: [], recapProgress: null };
const TABS = ['home', 'logs', 'pnl', 'education', 'motivation', 'settings'];

// ---------------- helpers ----------------
const typers = new WeakMap();
function typewrite(el, text, speed = 16) {
  clearInterval(typers.get(el)); el.textContent = ''; let i = 0;
  if (reduced) { el.textContent = text; return; }
  typers.set(el, setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typers.get(el)); }, speed));
}
function countUp(el, to, fmt, dur = 900) {
  if (to == null || !Number.isFinite(to) || reduced) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(p < 1 ? to * e : to); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200); }
function lightbox(src, cap) { $('#lbImg').src = src; $('#lbCap').textContent = cap || ''; $('#lightbox').hidden = false; }
$('#lightbox').onclick = () => { $('#lightbox').hidden = true; };
function ruleState(l) { return l.followedPlan === true ? 'kept' : l.followedPlan === false ? 'broken' : ''; }

// ---------------- tabs ----------------
function moveInk() { const a = $('.tab.active'), ink = $('#tabInk'); if (!a) return; ink.style.width = a.offsetWidth + 'px'; ink.style.transform = `translateX(${a.offsetLeft}px)`; }
function go(tab) {
  if (state.tab === tab && $('#view-' + tab).classList.contains('active')) { render(); return; }
  state.tab = tab;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + tab));
  moveInk(); render();
}
$$('.tab').forEach(b => b.onclick = () => go(b.dataset.tab));
document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto); });
window.addEventListener('resize', moveInk);
document.addEventListener('keydown', e => {
  if (splashOpen()) return;
  const back = typeof shouldReturnToStart === 'function' && shouldReturnToStart(e, modalOpen());
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); returnToStart(); return; }
  if (e.key === 'Escape') {
    if (!$('#lightbox').hidden) { $('#lightbox').hidden = true; return; }
    if ($('#motiveOverlay') && !$('#motiveOverlay').hidden) { closeMotive(); return; }
    if (!$('#eduOverlay').hidden) { closeEdu(); return; }
    if (!$('#wizOverlay').hidden) { closeWizard(); return; }
    if (!$('#overlay').hidden) { closeDrawer(); return; }
    if (back) returnToStart();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openWizard(); }
  if ((e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)) go(TABS[+e.key - 1]);
  if (e.key === 'Enter' && state.tab === 'home' && $('#wizOverlay').hidden && $('#overlay').hidden && document.activeElement === document.body) openWizard();
});
function render() {
  if (state.tab === 'home') renderHome();
  if (state.tab === 'logs') renderLogs();
  if (state.tab === 'pnl') renderPnl();
  if (state.tab === 'education') renderEducation();
  if (state.tab === 'motivation') renderMotivation();
  if (state.tab === 'settings') renderSettings();
}
async function reload() { [state.logs, state.stats] = await Promise.all([gon.logs.list(), gon.logs.stats()]); render(); }

// ---------------- home ----------------
function greetingWords() {
  const h = new Date().getHours(), name = state.settings.profile.name || 'Cole';
  const part = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return { hello: ['Hello,', name + '.'], part };
}
function renderHome() {
  const s = state.stats, now = new Date(), p = state.settings.profile;
  $('#todayStr').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const g = greetingWords();
  $('#greeting').innerHTML = g.hello.map((w, i) => `<span class="w" style="animation-delay:${(state.homeAnimated ? 0 : 250) + i * 120}ms">${esc(w)}</span>`).join('');
  const sub = s.todayCount ? `${g.part}. Today: ${s.todayCount} trade${s.todayCount > 1 ? 's' : ''}, ${fmtR(s.todayR)}.` : `${g.part}. No trades logged today. Patience is a position too.`;
  setTimeout(() => typewrite($('#subGreeting'), sub, 14), state.homeAnimated ? 0 : 550);
  renderHomeQuote();
  state.homeAnimated = true;

  // rule streak
  const rs = s.rules;
  $('#flame').classList.toggle('cold', !rs.current);
  countUp($('#streakNow'), rs.current, v => String(Math.round(v)), 1000);
  $('#streakBest').textContent = `Best: ${rs.best} day${rs.best === 1 ? '' : 's'}`;
  const days = rs.days.slice(-14), pad = Math.max(0, 14 - days.length);
  $('#streakDots').innerHTML = Array.from({ length: pad }, (_, i) => `<span class="sdot none" style="--i:${i}"></span>`).join('') +
    days.map((d, i) => `<span class="sdot ${d.kept ? 'kept' : 'broken'}" style="--i:${pad + i}" title="${d.date}: ${d.kept ? 'all rules kept' : 'rule broken'}">${d.kept ? '✓' : '✕'}</span>`).join('');
  $('#streakNote').textContent = !rs.days.length ? 'Answer the rules step when you log. Every day you keep them all adds to the streak.'
    : rs.current ? `${rs.current} logged day${rs.current > 1 ? 's' : ''} in a row with every rule kept. Keep the flame going.` : `Streak reset${rs.lastBroken ? ' on ' + niceDate(rs.lastBroken) : ''}. Next clean day starts it again.`;

  const streak = s.streak ? `${s.streak}${s.streakType}` : '—';
  const items = [
    ['Total R', s.totalR, fmtR, cls(s.totalR), `${s.count} trades`],
    ['Win rate', s.winRate, v => v == null ? '—' : r2(v).toFixed(1).replace(/\.0$/, '') + '%', '', `${s.wins}W · ${s.losses}L · ${s.breakeven}BE`],
    ['Net P&L', s.totalPnl, v => fmt$(Math.round(v)), cls(s.totalPnl), 'all logged'],
    ['Avg R', s.avgR, v => v == null ? '—' : fmtR(r2(v)), cls(s.avgR), 'per trade'],
    ['Win/loss streak', null, () => streak, s.streakType === 'W' ? 'pos' : s.streakType === 'L' ? 'neg' : '', s.streakType === 'W' ? 'wins in a row' : s.streakType === 'L' ? 'losses in a row' : 'no streak yet'],
  ];
  $('#stats').innerHTML = items.map(([l, , , c, sub], i) => `<div class="card stat lift rise" style="--i:${3 + i}"><div class="label">${l}</div><div class="value ${c}">&nbsp;</div><div class="sub">${esc(sub)}</div></div>`).join('');
  $$('#stats .value').forEach((el, i) => { const [, v, f] = items[i]; if (v == null) el.textContent = f(v); else countUp(el, v, x => f(Number.isInteger(v) ? Math.round(x) : r2(x)), 1100); });
  $('#curve').innerHTML = curveSvg(s.curve);
  const path = $('#curve .line'); if (path) path.style.setProperty('--len', Math.ceil(path.getTotalLength()) + 1);
  const rec = state.logs.slice(0, 6);
  $('#recent').innerHTML = rec.length ? rec.map(l => `<div class="recent-row" data-id="${l.id}"><span class="mono muted">${l.date.slice(5)}</span><span class="mono">${esc(l.instrument)}</span><span class="r-setup">${esc(l.setup || l.notes || l.direction)}</span><span class="rk ${ruleState(l)}" title="rules">${l.followedPlan === true ? '✓' : l.followedPlan === false ? '✕' : ''}</span><span class="mono ${cls(l.resultR)}">${fmtR(l.resultR)}</span></div>`).join('')
    : `<div class="empty small">No logs yet. <button class="link" id="firstLog">Log your first trade</button></div>`;
  $$('#recent .recent-row').forEach(r => r.onclick = () => openDrawer(state.logs.find(l => l.id === r.dataset.id)));
  const fl = $('#firstLog'); if (fl) fl.onclick = () => openWizard();
}
function renderHomeQuote() {
  const el = $('#homeQuote');
  if (!el) return;
  const pinned = (state.motivation || []).filter(m => m.kind === 'quote' && m.pinned && m.text);
  if (!pinned.length) { el.hidden = true; return; }
  if (!pinned.some(q => q.id === state.homeQuoteId)) state.homeQuoteId = pinned[Math.floor(Math.random() * pinned.length)].id;
  const q = pinned.find(m => m.id === state.homeQuoteId) || pinned[0];
  el.hidden = false;
  el.innerHTML = `<p>${esc(q.text)}</p>${q.author ? `<div class="muted small">— ${esc(q.author)}</div>` : ''}`;
}
function curveSvg(curve) {
  if (!curve || curve.length < 2) return `<div class="empty small">Your equity curve draws itself after two trades with a result in R.</div>`;
  const W = 600, H = 210, P = 14, pts = [0, ...curve];
  const min = Math.min(0, ...pts), max = Math.max(0, ...pts), span = max - min || 1;
  const x = i => P + i * (W - 2 * P) / (pts.length - 1), y = v => H - P - (v - min) * (H - 2 * P) / span;
  const d = pts.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const last = pts[pts.length - 1], col = last >= 0 ? 'var(--win)' : 'var(--loss)';
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line x1="${P}" x2="${W - P}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-strong)" stroke-dasharray="3 5"/>
    <path class="area" d="${d} L ${x(pts.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z" fill="${col}"/>
    <path class="line" d="${d}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(pts.length - 1)}" cy="${y(last)}" r="4" fill="${col}" class="area" style="animation-name:none;opacity:1"/>
    <text x="${W - P}" y="${P + 4}" text-anchor="end" fill="var(--muted)" font-family="JetBrains Mono" font-size="12">${fmtR(last)}</text></svg>`;
}
$('#askLog').onclick = () => openWizard();
$('#quickLog').onclick = () => openWizard();

// ---------------- logs ----------------
function filtered() {
  const q = $('#fSearch').value.trim().toLowerCase(), inst = $('#fInst').value, dir = $('#fDir').value, res = $('#fRes').value, from = $('#fFrom').value, to = $('#fTo').value;
  return state.logs.filter(l => {
    if (inst && l.instrument !== inst) return false;
    if (dir && l.direction !== dir) return false;
    if (res === 'win' && !(l.resultR > 0)) return false;
    if (res === 'loss' && !(l.resultR < 0)) return false;
    if (res === 'be' && l.resultR !== 0) return false;
    if (res === 'kept' && l.followedPlan !== true) return false;
    if (res === 'broken' && l.followedPlan !== false) return false;
    if (from && l.date < from) return false;
    if (to && l.date > to) return false;
    if (q && ![l.setup, l.notes, l.mindset, l.instrument, (l.emotions || []).join(' ')].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
}
function renderLogs() {
  const insts = [...new Set(state.logs.map(l => l.instrument))].sort(), sel = $('#fInst'), cur = sel.value;
  sel.innerHTML = '<option value="">All instruments</option>' + insts.map(i => `<option ${i === cur ? 'selected' : ''}>${esc(i)}</option>`).join('');
  const rows = filtered();
  const sumR = rows.reduce((s, l) => s + (l.resultR || 0), 0), sumP = rows.reduce((s, l) => s + (l.pnl || 0), 0);
  $('#filterSummary').innerHTML = `${rows.length} of ${state.logs.length} logs · <span class="${cls(sumR)}">${fmtR(r2(sumR))}</span> · <span class="${cls(sumP)}">${fmt$(r2(sumP))}</span>`;
  $('#logList').hidden = state.mode !== 'list'; $('#logCal').hidden = state.mode !== 'calendar';
  if (state.mode === 'calendar') return renderCalendar(rows);
  if (!state.logs.length) {
    $('#logList').innerHTML = `<div class="empty card"><img class="mascot" src="assets/gon-portrait.jpg" alt=""><h3>No logs yet</h3><p class="small">Write down the next trade you take.</p><button class="btn primary" id="emptyLog">Log your first trade</button></div>`;
    const m = $('#logList .mascot'); m.onerror = () => { m.onerror = null; m.src = FALLBACK_MASCOT; };
    $('#emptyLog').onclick = () => openWizard(); return;
  }
  $('#logList').innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Instrument</th><th>Side</th><th>Setup</th><th class="num">Entry</th><th class="num">Stop</th><th class="num">Target</th><th class="num">R</th><th class="num">P&amp;L</th><th>Rules</th><th></th></tr></thead><tbody>` +
    rows.map((l, i) => `<tr data-id="${l.id}" style="animation-delay:${Math.min(i, 14) * 22}ms"><td class="mono">${l.date}${l.time ? ' <span class="dim">' + l.time + '</span>' : ''}</td><td class="mono">${esc(l.instrument)}</td><td><span class="pill ${l.direction}">${l.direction}</span></td><td class="muted">${esc(l.setup)}</td><td class="num mono">${l.entry ?? ''}</td><td class="num mono">${l.stop ?? ''}</td><td class="num mono">${l.target ?? ''}</td><td class="num mono ${cls(l.resultR)}">${fmtR(l.resultR)}</td><td class="num mono ${cls(l.pnl)}">${fmt$(l.pnl)}</td><td>${l.followedPlan === true ? '<span class="pill kept">kept</span>' : l.followedPlan === false ? '<span class="pill broken">broken</span>' : '<span class="dim">—</span>'}</td><td class="clip">${l.screenshots.length ? '▣ ' + l.screenshots.length : ''}</td></tr>`).join('') + '</tbody></table></div>';
  $$('#logList tbody tr').forEach(tr => tr.onclick = () => openDrawer(state.logs.find(l => l.id === tr.dataset.id)));
}
function renderCalendar(rows) {
  const m = state.calMonth, y = m.getFullYear(), mo = m.getMonth();
  const byDay = {}; rows.forEach(l => { (byDay[l.date] = byDay[l.date] || []).push(l); });
  const rmap = state.stats.rules.byDate;
  const start = new Date(y, mo, 1); start.setDate(1 - ((start.getDay() + 6) % 7));
  const today = ymd(new Date());
  let monthR = 0, cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); const k = ymd(d), list = byDay[k] || [];
    const r = r2(list.reduce((s, l) => s + (l.resultR || 0), 0));
    if (d.getMonth() === mo) monthR += r;
    const rk = list.length && k in rmap ? (rmap[k] ? '<span class="rmark kept" title="All rules kept">✓</span>' : '<span class="rmark broken" title="A rule was broken">✕</span>') : '';
    cells += `<div class="day ${d.getMonth() !== mo ? 'other' : ''} ${k === today ? 'today' : ''} ${list.length ? 'has ' + (r > 0 ? 'win' : r < 0 ? 'loss' : '') : ''}" data-date="${k}" style="--i:${i}"><span class="dnum">${d.getDate()}</span>${rk}${list.length ? `<span class="dr ${cls(r)}">${fmtR(r)}</span><span class="dc">${list.length} trade${list.length > 1 ? 's' : ''}</span>` : ''}</div>`;
  }
  $('#logCal').innerHTML = `<div class="cal-head"><button class="btn sm" id="calPrev">←</button><div><b>${m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b> <span class="mono ${cls(monthR)}" style="margin-left:8px">${fmtR(r2(monthR))}</span></div><button class="btn sm" id="calNext">→</button></div>
    <div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('')}${cells}</div>
    <div class="cal-legend"><span><i style="background:var(--win)"></i>All rules kept</span><span><i style="background:var(--loss)"></i>Rule broken</span></div>`;
  $('#calPrev').onclick = () => { state.calMonth = new Date(y, mo - 1, 1); renderLogs(); };
  $('#calNext').onclick = () => { state.calMonth = new Date(y, mo + 1, 1); renderLogs(); };
  $$('#logCal .day.has').forEach(c => c.onclick = () => { $('#fFrom').value = $('#fTo').value = c.dataset.date; state.mode = 'list'; syncMode(); renderLogs(); });
}
function syncMode() { $$('#logMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === state.mode)); }
$$('#logMode button').forEach(b => b.onclick = () => { state.mode = b.dataset.mode; syncMode(); renderLogs(); });
['#fSearch', '#fInst', '#fDir', '#fRes', '#fFrom', '#fTo'].forEach(s => $(s).addEventListener('input', renderLogs));
$('#fClear').onclick = () => { ['#fSearch', '#fInst', '#fDir', '#fRes', '#fFrom', '#fTo'].forEach(s => $(s).value = ''); renderLogs(); };
$('#newLog').onclick = () => openWizard();

// ---------------- rules checklist (shared) ----------------
// states: 'on' (kept) | 'off' (broken) | '' (unanswered)
function rulesHtml(rules, st) {
  return rules.map((r, i) => `<button type="button" class="rule ${st[i] || ''}" data-i="${i}"><span class="box">${st[i] === 'on' ? '✓' : st[i] === 'off' ? '✕' : ''}</span><span>${esc(r)}</span></button>`).join('');
}
function bindRules(container, st, onChange) {
  $$('.rule', container).forEach(b => b.onclick = () => { const i = +b.dataset.i; st[i] = st[i] === 'on' ? 'off' : 'on'; onChange(); });
}
function rulesFromLog(log, rules) {
  if (!log || log.followedPlan == null) return rules.map(() => '');
  const broken = new Set(log.rulesBroken || []);
  if (log.followedPlan === true) return rules.map(() => 'on');
  return broken.size ? rules.map(r => broken.has(r) ? 'off' : 'on') : rules.map(() => '');
}
function rulesResult(rules, st, fallback = null) {
  if (st.some(s => s === 'off')) return { followedPlan: false, rulesBroken: rules.filter((_, i) => st[i] === 'off') };
  if (rules.length && st.every(s => s === 'on')) return { followedPlan: true, rulesBroken: [] };
  return { followedPlan: fallback, rulesBroken: [] };
}

// ---------------- guided wizard ----------------
const wiz = { step: 0, d: null, dirBack: false };
const STEPS = [
  { key: 'when', title: 'When & what did you trade?', sub: 'Pick the instrument. Date and time default to now.',
    html: d => `<div class="fgrid"><label>Date<input type="date" id="wDate" value="${d.date}"></label><label>Time<input type="time" id="wTime" value="${d.time}"></label></div>
      <div class="label">Instrument</div><div class="chips-pick" id="wInst">${INSTRUMENTS.map(i => `<button class="pick ${d.instrument === i ? 'on' : ''}" data-v="${i}">${i}</button>`).join('')}</div>
      <label>Other<input id="wInstOther" class="mono" placeholder="e.g. MCL" value="${INSTRUMENTS.includes(d.instrument) ? '' : esc(d.instrument)}"></label>`,
    bind: d => {
      $('#wDate').oninput = e => d.date = e.target.value; $('#wTime').oninput = e => d.time = e.target.value;
      pickOne('#wInst', v => { d.instrument = v; $('#wInstOther').value = ''; });
      $('#wInstOther').oninput = e => { d.instrument = e.target.value.toUpperCase(); $$('#wInst .pick').forEach(p => p.classList.remove('on')); };
    },
    valid: d => !/^\d{4}-\d{2}-\d{2}$/.test(d.date) ? 'Pick a date.' : !d.instrument ? 'Pick an instrument.' : null },
  { key: 'dir', title: 'Direction & setup', sub: 'Which way, and which model?',
    html: d => `<div class="big-choice" id="wDir">
        <button class="choice ${d.direction === 'long' ? 'on' : ''}" data-v="long"><span class="ar" style="color:var(--accent)">↗</span><div class="t">Long</div><div class="d">Bought expecting higher</div></button>
        <button class="choice short ${d.direction === 'short' ? 'on' : ''}" data-v="short"><span class="ar">↘</span><div class="t">Short</div><div class="d">Sold expecting lower</div></button></div>
      <div class="label">Setup</div><div class="chips-pick" id="wSetup">${SETUPS.map(s => `<button class="pick ${d.setup === s ? 'on' : ''}" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <label>Or describe it<input id="wSetupTxt" value="${esc(d.setup)}" placeholder="10am H6 sweep + CISD"></label>`,
    bind: d => {
      $$('#wDir .choice').forEach(b => b.onclick = () => { d.direction = b.dataset.v; $$('#wDir .choice').forEach(x => x.classList.toggle('on', x === b)); });
      pickOne('#wSetup', v => { d.setup = v; $('#wSetupTxt').value = v; });
      $('#wSetupTxt').oninput = e => { d.setup = e.target.value; $$('#wSetup .pick').forEach(p => p.classList.toggle('on', p.dataset.v === d.setup)); };
    },
    valid: d => !d.direction ? 'Long or short?' : null },
  { key: 'levels', title: 'Your levels', sub: 'Entry, stop and target. Leave any blank if you don\'t have it.',
    html: d => `<div class="fgrid3"><label>Entry<input id="wEntry" class="big-input" inputmode="decimal" value="${d.entry}"></label><label>Stop<input id="wStop" class="big-input" inputmode="decimal" value="${d.stop}"></label><label>Target<input id="wTarget" class="big-input" inputmode="decimal" value="${d.target}"></label></div>
      <div class="rr-preview" id="wRR"></div>`,
    bind: d => { const upd = () => { d.entry = $('#wEntry').value; d.stop = $('#wStop').value; d.target = $('#wTarget').value; $('#wRR').innerHTML = rrText(d); }; ['#wEntry', '#wStop', '#wTarget'].forEach(s => $(s).oninput = upd); upd(); },
    valid: d => ['entry', 'stop', 'target'].some(k => d[k] !== '' && !Number.isFinite(+d[k])) ? 'Levels must be numbers.' : null },
  { key: 'result', title: 'How did it play out?', sub: 'Result in R and in dollars.',
    html: d => `<div class="chips-pick" id="wRq">${[-1, 0, 1, 2, 3, 5].map(v => `<button class="pick ${v > 0 ? 'win' : v < 0 ? 'loss' : ''} ${String(d.resultR) === String(v) ? 'on' : ''}" data-v="${v}">${v === 0 ? 'BE 0R' : fmtR(v)}</button>`).join('')}</div>
      <div class="fgrid"><label>Result (R)<input id="wR" class="big-input" inputmode="decimal" value="${d.resultR}" placeholder="e.g. 2.5 or -1"></label><label>P&amp;L ($)<input id="wPnl" class="big-input" inputmode="decimal" value="${d.pnl}" placeholder="e.g. 250 or -50"></label></div>`,
    bind: d => { pickOne('#wRq', v => { d.resultR = v; $('#wR').value = v; }); $('#wR').oninput = e => { d.resultR = e.target.value; $$('#wRq .pick').forEach(p => p.classList.toggle('on', p.dataset.v === e.target.value)); }; $('#wPnl').oninput = e => d.pnl = e.target.value; },
    valid: d => (d.resultR !== '' && !Number.isFinite(+d.resultR)) || (d.pnl !== '' && !Number.isFinite(+d.pnl)) ? 'Result and P&L must be numbers.' : null },
  { key: 'rules', title: 'Did you follow all your rules?', sub: 'Tap a rule to mark it kept ✓ or broken ✕. Be honest, it\'s just you here.',
    html: d => `<div class="chips-pick"><button class="pick" id="wAllKept">Yes, I kept every rule</button></div><div class="rule-list" id="wRules">${rulesHtml(state.settings.rules, d.rules)}</div><div id="wVerdict"></div>`,
    bind: d => {
      const upd = () => { $('#wRules').innerHTML = rulesHtml(state.settings.rules, d.rules); bindRules($('#wRules'), d.rules, upd); const r = rulesResult(state.settings.rules, d.rules);
        $('#wVerdict').innerHTML = r.followedPlan === true ? '<div class="rules-verdict kept">Clean trade. This day counts toward your rule streak. 🔥</div>' : r.followedPlan === false ? `<div class="rules-verdict broken">${r.rulesBroken.length} rule${r.rulesBroken.length > 1 ? 's' : ''} broken. This resets the streak, and that's okay. Write down why on the next step.</div>` : ''; };
      $('#wAllKept').onclick = () => { d.rules.fill('on'); upd(); }; upd();
    },
    valid: d => state.settings.rules.length && d.rules.some(s => !s) ? 'Mark every rule as kept or broken (or tap "Yes, I kept every rule").' : null },
  { key: 'mind', title: 'How were you feeling?', sub: 'Pick what fits, then add notes on what price did and why you took it.',
    html: d => `<div class="chips-pick" id="wEmo">${EMOTIONS.map(e => `<button class="pick ${d.emotions.includes(e) ? 'on' : ''}" data-v="${e}">${e}</button>`).join('')}</div>
      <label>Mindset<textarea id="wMind" rows="2" placeholder="Calm, waited for the candle close…">${esc(d.mindset)}</textarea></label>
      <label>Trade notes<textarea id="wNotes" rows="4" placeholder="What did price do? Why did you take it? What would you do differently?">${esc(d.notes)}</textarea></label>`,
    bind: d => { $$('#wEmo .pick').forEach(b => b.onclick = () => { const v = b.dataset.v, i = d.emotions.indexOf(v); i < 0 ? d.emotions.push(v) : d.emotions.splice(i, 1); b.classList.toggle('on'); }); $('#wMind').oninput = e => d.mindset = e.target.value; $('#wNotes').oninput = e => d.notes = e.target.value; },
    valid: () => null },
  { key: 'shots', title: 'Add screenshots', sub: 'Drop chart images from your computer. They\'re copied into the journal.',
    html: () => `<div class="dropzone" id="wDrop" style="padding:46px 18px">Drop images here or click to choose</div><div class="thumbs" id="wThumbs"></div>`,
    bind: d => { const upd = () => thumbs($('#wThumbs'), d.screenshots, upd); upd(); dropzone($('#wDrop'), names => { d.screenshots.push(...names); upd(); }); },
    valid: () => null },
  { key: 'review', title: 'Review & save', sub: 'Looks right? Save it to your training logs.',
    html: d => { const rr = rulesResult(state.settings.rules, d.rules); return `<div class="review">
      <div><div class="k">Date</div><div class="v">${d.date} ${d.time}</div></div><div><div class="k">Trade</div><div class="v">${esc(d.instrument)} · ${d.direction}</div></div>
      <div class="full"><div class="k">Setup</div><div class="v" style="font-family:Inter">${esc(d.setup) || '—'}</div></div>
      <div><div class="k">Entry / Stop / Target</div><div class="v">${d.entry || '—'} / ${d.stop || '—'} / ${d.target || '—'}</div></div><div><div class="k">Planned</div><div class="v">${plannedR(d) ?? '—'}</div></div>
      <div><div class="k">Result</div><div class="v ${cls(+d.resultR)}">${d.resultR === '' ? '—' : fmtR(+d.resultR)}</div></div><div><div class="k">P&amp;L</div><div class="v ${cls(+d.pnl)}">${d.pnl === '' ? '—' : fmt$(+d.pnl)}</div></div>
      <div><div class="k">Rules</div><div class="v">${rr.followedPlan === true ? '<span class="pill kept">all kept</span>' : rr.followedPlan === false ? `<span class="pill broken">${rr.rulesBroken.length} broken</span>` : '—'}</div></div><div><div class="k">Feeling</div><div class="v" style="font-family:Inter">${esc(d.emotions.join(', ')) || '—'}</div></div>
      <div class="full"><div class="k">Screenshots</div><div class="v">${d.screenshots.length}</div></div></div>`; },
    bind: d => {
      d.recapPaths = d.recapPaths || [];
      const note = document.createElement('div');
      note.className = 'row gap wrap';
      note.style.marginTop = '12px';
      note.innerHTML = `<button type="button" class="btn sm" id="wRecap">Add video recap</button><span class="muted small" id="wRecapNote">${d.recapPaths.length ? d.recapPaths.length + ' video' + (d.recapPaths.length > 1 ? 's' : '') + ' for ' + d.date : 'Optional. It shows on the P&L calendar for this date.'}</span>`;
      const review = $('#wizStage .review');
      if (review) review.after(note);
      const b = $('#wRecap');
      if (b) b.onclick = async () => {
        const paths = await gon.recap.pick();
        if (paths && paths.length) { d.recapPaths.push(...paths); $('#wRecapNote').textContent = d.recapPaths.length + ' video' + (d.recapPaths.length > 1 ? 's' : '') + ' for ' + d.date; }
      };
    }, valid: () => null },
];
function pickOne(sel, cb) { $$(sel + ' .pick').forEach(b => b.onclick = () => { $$(sel + ' .pick').forEach(x => x.classList.toggle('on', x === b)); cb(b.dataset.v); }); }
function plannedR(d) { const e = +d.entry, s = +d.stop, t = +d.target; return d.entry !== '' && d.stop !== '' && d.target !== '' && e !== s && [e, s, t].every(Number.isFinite) ? (Math.abs(t - e) / Math.abs(e - s)).toFixed(2) + 'R' : null; }
function rrText(d) { const p = plannedR(d); return p ? `<span>planned <b>${p}</b></span><span class="muted">risk ${r2(Math.abs(d.entry - d.stop))} pts</span><span class="muted">reward ${r2(Math.abs(d.target - d.entry))} pts</span>` : '<span class="muted">Fill in entry, stop and target to see your planned R:R.</span>'; }
function thumbs(el, list, onChange) {
  el.innerHTML = list.map((n, i) => `<div class="thumb"><img src="${shotUrl(n)}" alt=""><button type="button" data-rm="${i}">✕</button></div>`).join('');
  $$('img', el).forEach(im => im.onclick = () => lightbox(im.src));
  $$('[data-rm]', el).forEach(b => b.onclick = () => { list.splice(+b.dataset.rm, 1); onChange(); });
}
function dropzone(el, onAdd) {
  el.onclick = async () => onAdd(await gon.shots.pick());
  ['dragenter', 'dragover'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.remove('over'); }));
  el.addEventListener('drop', async e => { const files = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type)); if (!files.length) return; try { onAdd(await gon.shots.importFiles(files)); } catch (err) { toast('Could not import: ' + err.message); } });
}
function openWizard() {
  const now = new Date();
  wiz.d = { date: ymd(now), time: now.toTimeString().slice(0, 5), instrument: state.logs[0]?.instrument || 'MNQ', direction: '', setup: '', entry: '', stop: '', target: '', resultR: '', pnl: '', rules: state.settings.rules.map(() => ''), emotions: [], mindset: '', notes: '', screenshots: [] };
  wiz.step = 0; wiz.dirBack = false;
  $('#wizOverlay').hidden = false; requestAnimationFrame(() => $('#wizOverlay').classList.add('show'));
  renderStep();
}
function closeWizard() { $('#wizOverlay').classList.remove('show'); setTimeout(() => { $('#wizOverlay').hidden = true; }, 250); }
function renderStep() {
  const st = STEPS[wiz.step], n = STEPS.length;
  $('#wizStepLbl').textContent = `Step ${wiz.step + 1} of ${n}`;
  $('#wizBar').style.width = ((wiz.step + 1) / n * 100) + '%';
  $('#wizStage').innerHTML = `<div class="step ${wiz.dirBack ? 'back' : ''}"><h2>${st.title}</h2><div class="q-sub">${st.sub}</div>${st.html(wiz.d)}<div class="form-err" id="wErr"></div></div>`;
  st.bind(wiz.d);
  $('#wizBack').style.visibility = wiz.step ? 'visible' : 'hidden';
  $('#wizNext').textContent = wiz.step === n - 1 ? 'Save log ✓' : 'Next →';
  const first = $('#wizStage input:not([type=date]):not([type=time]), #wizStage textarea'); if (first && !['when'].includes(st.key)) setTimeout(() => first.focus(), 60);
}
async function wizNext() {
  const st = STEPS[wiz.step], err = st.valid(wiz.d);
  if (err) { $('#wErr').textContent = err; $('#wizStage .step').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 }); return; }
  if (wiz.step < STEPS.length - 1) { wiz.step++; wiz.dirBack = false; renderStep(); return; }
  const d = wiz.d, rr = rulesResult(state.settings.rules, d.rules);
  try {
    await gon.logs.create({ date: d.date, time: d.time, instrument: d.instrument, direction: d.direction, setup: d.setup, entry: d.entry, stop: d.stop, target: d.target, resultR: d.resultR, pnl: d.pnl, notes: d.notes, mindset: d.mindset, emotions: d.emotions, screenshots: d.screenshots, ...rr });
    if (d.recapPaths && d.recapPaths.length) { try { await gon.recap.add({ date: d.date, srcPaths: d.recapPaths }); state.recaps = await gon.recap.list(); } catch (e) { console.log('[recap]', e); } }
  } catch (e) { $('#wErr').textContent = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); return; }
  $('#wizStage').innerHTML = `<div class="saved-burst"><div class="check-circle"><svg width="40" height="40" viewBox="0 0 40 40"><path d="M10 21l7 7 14-15" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><h2 style="margin-top:18px">Logged.</h2><p class="muted">${rr.followedPlan === true ? 'Rules kept. The flame grows. 🔥' : 'Saved to your training logs.'}</p></div>`;
  $('#wizBar').style.width = '100%';
  await wait(1100); closeWizard(); state.homeAnimated = false; await reload(); toast('Trade logged');
}
$('#wizNext').onclick = wizNext;
$('#wizBack').onclick = () => { if (wiz.step) { wiz.step--; wiz.dirBack = true; renderStep(); } };
$('#wizClose').onclick = closeWizard;
$('#wizOverlay').addEventListener('click', e => { if (e.target.id === 'wizOverlay') closeWizard(); });
$('#wiz').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); wizNext(); } });

// ---------------- edit drawer ----------------
const F = () => $('#logForm').elements;
function openDrawer(log) {
  if (!log) return openWizard();
  state.editing = log;
  const f = F(); $('#logForm').reset(); $('#formErr').textContent = '';
  for (const k of ['date', 'time', 'instrument', 'entry', 'stop', 'target', 'setup', 'resultR', 'pnl', 'notes', 'mindset']) f[k].value = log[k] ?? '';
  state.form = { direction: log.direction, screenshots: [...(log.screenshots || [])], rules: rulesFromLog(log, state.settings.rules) };
  syncDir(); renderDrawerThumbs(); plannedRRDrawer(); renderDrawerRules();
  $('#overlay').hidden = false; requestAnimationFrame(() => { $('#overlay').classList.add('show'); $('#drawer').classList.add('open'); });
  $('#drawer').setAttribute('aria-hidden', 'false');
}
function closeDrawer() { $('#drawer').classList.remove('open'); $('#overlay').classList.remove('show'); $('#drawer').setAttribute('aria-hidden', 'true'); setTimeout(() => { $('#overlay').hidden = true; }, 260); }
$('#closeDrawer').onclick = $('#cancelLog').onclick = $('#overlay').onclick = closeDrawer;
function syncDir() { $$('#dirSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === state.form.direction)); }
$$('#dirSeg button').forEach(b => b.onclick = () => { state.form.direction = b.dataset.v; syncDir(); });
function renderDrawerRules() { $('#drawerRules').innerHTML = rulesHtml(state.settings.rules, state.form.rules); bindRules($('#drawerRules'), state.form.rules, renderDrawerRules); }
function plannedRRDrawer() { const f = F(); const p = plannedR({ entry: f.entry.value, stop: f.stop.value, target: f.target.value }); $('#plannedRR').textContent = p ? `planned ${p} · risk ${r2(Math.abs(f.entry.value - f.stop.value))} pts` : ''; }
['entry', 'stop', 'target'].forEach(n => F()[n].addEventListener('input', plannedRRDrawer));
function renderDrawerThumbs() { thumbs($('#thumbs'), state.form.screenshots, renderDrawerThumbs); }
$('#addShots').onclick = async () => { state.form.screenshots.push(...await gon.shots.pick()); renderDrawerThumbs(); };
dropzone($('#dropzone'), names => { state.form.screenshots.push(...names); renderDrawerThumbs(); });
$('#logForm').onsubmit = async e => {
  e.preventDefault(); const f = F();
  const data = { direction: state.form.direction, screenshots: state.form.screenshots, ...rulesResult(state.settings.rules, state.form.rules, state.editing.followedPlan) };
  for (const k of ['date', 'time', 'instrument', 'entry', 'stop', 'target', 'setup', 'resultR', 'pnl', 'notes', 'mindset']) data[k] = f[k].value;
  try { await gon.logs.update(state.editing.id, data); closeDrawer(); toast('Log updated'); await reload(); }
  catch (err) { $('#formErr').textContent = String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
};
$('#deleteLog').onclick = async () => { if (!state.editing || !confirm('Delete this log and its screenshots?')) return; await gon.logs.remove(state.editing.id); closeDrawer(); toast('Log deleted'); await reload(); };

// ---------------- settings ----------------
let rulesDraft = [];
function renderRulesEditor() {
  $('#rulesEditor').innerHTML = rulesDraft.map((r, i) => `<div class="rule-edit"><span class="n">${i + 1}</span><textarea rows="2" data-i="${i}">${esc(r)}</textarea><button class="icon" data-rm="${i}" title="Remove">✕</button></div>`).join('') || '<div class="muted small">No rules yet.</div>';
  $$('#rulesEditor textarea').forEach(t => t.oninput = () => rulesDraft[+t.dataset.i] = t.value);
  $$('#rulesEditor [data-rm]').forEach(b => b.onclick = () => { rulesDraft.splice(+b.dataset.rm, 1); renderRulesEditor(); });
}
$('#addRule').onclick = () => { rulesDraft.push(''); renderRulesEditor(); $$('#rulesEditor textarea').pop().focus(); };
async function renderSettings() {
  const s = state.settings;
  $('#sName').value = s.profile.name || ''; $('#sHandle').value = s.profile.handle || ''; $('#sAcct').value = s.profile.account || '';
  $('#sSplash').checked = s.splash !== false;
  rulesDraft = [...s.rules]; renderRulesEditor();
  $('#dataDir').textContent = await gon.app.dataDir();
  const ver = $('#appVersion');
  if (ver) ver.textContent = await gon.app.version();
  applyUpdateState(updateState);
  syncThemeSeg();
  syncSongForm();
  renderBackgroundLibrary();
}
$('#openData').onclick = () => gon.app.openDataDir();

let updateState = { status: 'idle' };
function applyUpdateState(s) {
  if (!s) return;
  updateState = s;
  const pill = $('#updatePill');
  if (pill) pill.hidden = s.status !== 'ready';
  const msg = $('#updateMsg');
  if (!msg) return;
  if (s.status === 'checking') msg.textContent = 'Checking…';
  else if (s.status === 'downloading') msg.textContent = 'Downloading update…';
  else if (s.status === 'ready') msg.textContent = s.version ? `Update ${s.version} ready. Restart to install.` : 'Update ready. Restart to install.';
  else if (s.status === 'current') msg.textContent = "You're up to date.";
  else if (s.status === 'dev') msg.textContent = 'Updates apply to the installed app.';
  else msg.textContent = '';
}
$('#checkUpdates').onclick = async () => {
  const b = $('#checkUpdates');
  if (updateState.status === 'ready') { applyUpdateState(updateState); return; }
  b.disabled = true;
  applyUpdateState({ status: 'checking' });
  try { applyUpdateState(await gon.updater.check()); }
  finally { b.disabled = false; }
};
$('#updateRestart').onclick = () => { if (updateState.status === 'ready') gon.updater.install(); };
$('#saveSettings').onclick = async () => {
  state.settings = await gon.settings.save({ profile: { name: $('#sName').value.trim(), handle: $('#sHandle').value.trim().replace(/^@/, ''), account: $('#sAcct').value.trim() }, rules: rulesDraft, splash: $('#sSplash').checked });
  renderSettings(); $('#saveMsg').textContent = 'Saved ✓'; setTimeout(() => $('#saveMsg').textContent = '', 1800); toast('Settings saved');
};

// ---------------- images ----------------
function setupImages() {
  for (const im of [$('#avatar'), $('.brand-av')]) { const fb = () => { im.onerror = null; im.src = FALLBACK_MASCOT; }; im.onerror = fb; if (im.complete && !im.naturalWidth) fb(); }
  const b = new Image(); b.onload = () => { $('#banner').style.backgroundImage = 'url(assets/gon-banner.jpg)'; }; b.onerror = () => $('#banner').classList.add('none'); b.src = 'assets/gon-banner.jpg';
}

// ---------------- entrance ----------------
let entranceArmed = false;
let entranceBound = false;
let entranceItemId = '';
let bgToken = 0;
let shuffleStamp = 0;
const DEFAULT_ENTRANCE_SRC = 'assets/entrance-loop.mp4';

function splashOpen() {
  const sp = $('#splash');
  return !!(sp && !sp.hidden && !sp.classList.contains('out'));
}
function modalOpen() {
  const open = (id) => { const el = $(id); return !!(el && !el.hidden); };
  return open('#lightbox') || open('#eduOverlay') || open('#motiveOverlay') || open('#wizOverlay') || open('#overlay');
}
function enterApp() {
  if (document.body.classList.contains('entered') && !document.body.classList.contains('booting')) return;
  document.body.classList.remove('booting');
  document.body.classList.add('entered');
  const video = $('#splashVideo');
  if (video) { try { video.pause(); } catch (e) {} }
  requestAnimationFrame(() => { try { moveInk(); } catch (e) {} });
}
function shuffleTarget(ev) {
  const t = ev && ev.target;
  return !!(t && t.closest && t.closest('#splashShuffle'));
}
function bindEntranceOnce() {
  if (entranceBound) return;
  entranceBound = true;
  const finish = (ev) => {
    if (!splashOpen() || !entranceArmed) return;
    if (shuffleTarget(ev)) return;
    if (ev && ev.type === 'keydown' && (ev.ctrlKey || ev.metaKey || ev.altKey)) return;
    if (typeof shouldDismissEntrance === 'function' && !shouldDismissEntrance(ev, false)) return;
    entranceArmed = false;
    console.log('[entrance] enter', ev && ev.type);
    leaveEntrance();
  };
  window.addEventListener('pointerdown', finish, true);
  window.addEventListener('mousedown', finish, true);
  window.addEventListener('click', finish, true);
  window.addEventListener('keydown', finish, true);
}
function showEntranceStage() {
  const stage = document.querySelector('.splash-stage');
  if (!stage) return;
  stage.style.transition = 'none';
  stage.style.opacity = '1';
  stage.style.visibility = 'visible';
}
function releaseEntranceMedia() {
  // Drop the full-resolution photo before the window fades in. Fading a 4K
  // bitmap while the rest of the window animates a blur has been exiting the
  // process on Windows instead of showing Home.
  const img = $('#splashImage');
  const video = $('#splashVideo');
  const stage = document.querySelector('.splash-stage');
  try {
    if (img) { img.onload = null; img.onerror = null; img.removeAttribute('src'); img.hidden = true; }
    if (video) {
      video.onerror = null;
      try { video.pause(); } catch (e) {}
      video.removeAttribute('src');
      try { video.load(); } catch (e) {}
      video.hidden = true;
    }
    if (stage) { stage.style.transition = 'none'; stage.style.opacity = '0'; stage.style.visibility = 'hidden'; }
  } catch (e) { console.log('[entrance]', e); }
}
function leaveEntrance() {
  entranceArmed = false;
  releaseEntranceMedia();
  const sp = $('#splash');
  if (sp) sp.classList.add('out');
  enterApp();
  setTimeout(() => { try { fadeOutSong(); } catch (e) { console.log('[theme-song]', e); } }, 0);
}
function pauseAppMedia() {
  $$('video').forEach(v => { if (v.id !== 'splashVideo') { try { v.pause(); } catch (e) {} } });
}
function paintSplashName() {
  const name = (state.settings && state.settings.profile && state.settings.profile.handle) || 'colehys';
  const el = $('#splashName');
  if (!el) return;
  el.innerHTML = [...name].map((ch, i) => `<span style="animation-delay:${0.35 + i * 0.06}s">${esc(ch)}</span>`).join('');
  const W = el.offsetWidth;
  $$('span', el).forEach(span => { span.style.setProperty('--w', W + 'px'); span.style.setProperty('--x', span.offsetLeft - el.offsetLeft + 'px'); });
}
function returnToStart() {
  const sp = $('#splash');
  if (!sp || splashOpen()) return;
  // The trade wizard stays open underneath so an unsaved draft is still there on the way back in.
  sp.hidden = false;
  sp.classList.add('out');
  document.body.classList.add('booting');
  document.body.classList.remove('entered');
  entranceArmed = true;
  try { pauseAppMedia(); } catch (e) {}
  try { paintSplashName(); } catch (e) { console.log('[entrance]', e); }
  try { showEntranceStage(); showEntranceBackground({ fresh: true }); } catch (e) { console.log('[background]', e); }
  try { playEntranceSong(); } catch (e) { console.log('[theme-song]', e); }
  try { paintNow(); } catch (e) { console.log('[clock]', e); }
  requestAnimationFrame(() => { if (sp) sp.classList.remove('out'); sharpenEntrance(); });
}
function currentLibrary() {
  try {
    if (typeof backgroundsApi !== 'undefined') return backgroundsApi.normalizeLibrary(state.settings && state.settings.startScreen);
  } catch (e) { console.log('[background]', e); }
  return { mode: 'random', fit: 'fill', selectedId: 'default', lastId: '', items: [{ id: 'default', builtin: true, kind: 'video', file: '', name: 'Dock', enabled: true, speed: 0.5 }] };
}
function rememberBackground(id) {
  const lib = currentLibrary();
  if (!id || lib.lastId === id) return;
  lib.lastId = id;
  if (state.settings) state.settings.startScreen = lib;
  if (!gon.bg || !gon.bg.prefs) return;
  gon.bg.prefs({ lastId: id }).then(s => { if (s) state.settings = s; }).catch(e => console.log('[background]', e && e.message ? e.message : e));
}
function showEntranceBackground(opts) {
  const token = ++bgToken;
  const lib = currentLibrary();
  let chosen = null;
  try {
    if (opts && opts.shuffleFrom && typeof backgroundsApi !== 'undefined') chosen = backgroundsApi.nextShuffleBackground(lib, opts.shuffleFrom);
    else if (typeof backgroundsApi !== 'undefined') chosen = backgroundsApi.pickStartBackground(lib);
  } catch (e) { console.log('[background]', e); }
  const chain = (typeof backgroundsApi !== 'undefined') ? backgroundsApi.fallbackChain(lib, chosen) : [chosen].filter(Boolean);
  applyBackgroundChain(chain.length ? chain : [{ id: 'default', builtin: true, kind: 'video', speed: 0.5 }], 0, token, lib.fit || 'fill');
}
function applyBackgroundChain(chain, index, token, fit) {
  if (token !== bgToken) return;
  const sp = $('#splash');
  const item = chain[index];
  if (!sp || !item) { applyDefaultEntrance(token, fit); return; }
  sp.classList.toggle('fit-contain', fit === 'fit');
  const fail = (err) => {
    console.log('[background]', item.id, err && (err.message || err.code || err.name) || err);
    if (token !== bgToken) return;
    if (index + 1 < chain.length) applyBackgroundChain(chain, index + 1, token, fit);
    else applyDefaultEntrance(token, fit);
  };
  if (item.kind === 'image' && !item.builtin) {
    let url = '';
    try { url = backgroundFileUrl(item.file); }
    catch (e) { fail(e); return; }
    showEntranceImage(url, item, token, fail);
    return;
  }
  let url = DEFAULT_ENTRANCE_SRC;
  if (!item.builtin && item.file) {
    try { url = backgroundFileUrl(item.file); }
    catch (e) { fail(e); return; }
  }
  const speed = (typeof backgroundsApi !== 'undefined') ? backgroundsApi.normalizeSpeed(item.speed) : (Number(item.speed) || 0.5);
  showEntranceVideo(url, speed, item, token, fail);
}
function sharpenEntrance() {
  for (const el of [$('#splash'), $('.splash-stage'), $('#splashImage'), $('#splashVideo')]) {
    if (!el) continue;
    el.style.transform = 'none';
    el.style.filter = 'none';
  }
}
function showEntranceImage(url, item, token, fail) {
  const video = $('#splashVideo');
  const image = $('#splashImage');
  if (video) { video.onerror = null; try { video.pause(); } catch (e) {} video.hidden = true; }
  if (!image) { fail(new Error('no image element')); return; }
  let failed = false;
  const once = (err) => { if (failed || token !== bgToken) return; failed = true; fail(err); };
  image.hidden = false;
  image.onload = () => {
    if (token !== bgToken || failed) return;
    entranceItemId = item.id;
    rememberBackground(item.id);
    sharpenEntrance();
  };
  image.onerror = () => once(new Error('image failed'));
  if (image.getAttribute('src') === url && image.complete && image.naturalWidth) {
    entranceItemId = item.id;
    rememberBackground(item.id);
    return;
  }
  image.src = url;
}
function showEntranceVideo(url, speed, item, token, fail) {
  const image = $('#splashImage');
  const video = $('#splashVideo');
  if (image) { image.onerror = null; image.removeAttribute('src'); image.hidden = true; }
  if (!video) { fail(new Error('no video')); return; }
  let failed = false;
  const once = (err) => { if (failed || token !== bgToken) return; failed = true; video.onerror = null; fail(err); };
  video.hidden = false;
  const arm = () => { try { video.playbackRate = speed; video.muted = true; video.loop = true; } catch (e) {} };
  video.onerror = null;
  const same = video.getAttribute('src') === url;
  if (!same) video.src = url;
  video.onerror = (e) => { if (e && e.stopPropagation) e.stopPropagation(); if (video.getAttribute('src') !== url) return; once(video.error || new Error('video failed')); };
  video.onloadedmetadata = arm;
  video.onplay = arm;
  video.onloadeddata = () => {
    if (token !== bgToken || failed) return;
    entranceItemId = item.id;
    rememberBackground(item.id);
    arm();
  };
  arm();
  try { video.currentTime = 0; } catch (e) {}
  const played = video.play();
  if (played && played.then) played.then(() => { if (token === bgToken && !failed) { entranceItemId = item.id; rememberBackground(item.id); } }).catch((err) => {
    console.log('[background] play', err && err.name);
    if (err && err.name !== 'AbortError' && err && err.name !== 'NotAllowedError') once(err);
  });
}
function applyDefaultEntrance(token, fit) {
  if (token !== bgToken) return;
  console.log('[background] using dock video');
  showEntranceVideo(DEFAULT_ENTRANCE_SRC, 0.5, { id: 'default', builtin: true, speed: 0.5 }, token, (err) => {
    console.log('[background] dock video failed', err && err.message ? err.message : err);
  });
  const sp = $('#splash');
  if (sp) sp.classList.toggle('fit-contain', fit === 'fit');
}
function shuffleEntrance() {
  const now = Date.now();
  if (now - shuffleStamp < 280) return;
  shuffleStamp = now;
  if (!splashOpen()) return;
  try { showEntranceBackground({ shuffleFrom: entranceItemId || 'default' }); }
  catch (e) { console.log('[background]', e); }
}
function entrance() {
  bindEntranceOnce();
  if (params.get('nosplash') || (state.settings && state.settings.splash === false)) { enterApp(); return; }
  const sp = $('#splash');
  if (!sp) { enterApp(); return; }
  sp.hidden = false;
  sp.classList.remove('out');
  entranceArmed = true;
  try { paintSplashName(); } catch (e) { console.log('[entrance]', e); }
  try { showEntranceStage(); showEntranceBackground({ fresh: true }); } catch (e) { console.log('[background]', e); }
  try { playEntranceSong(); } catch (e) { console.log('[theme-song]', e); }
  try { paintNow(); } catch (e) { console.log('[clock]', e); }
  sharpenEntrance();
}
$('#closeJournal').onclick = () => returnToStart();
$('#splashShuffle').addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  shuffleEntrance();
}, true);
$('#splashShuffle').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  ev.preventDefault();
  ev.stopPropagation();
  shuffleEntrance();
});

function paintNow() {
  try { paintClock(); } catch (err) { console.log('[clock]', err && err.message ? err.message : err); }
}
function paintClock() {
  const now = new Date();
  $('#clock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const status = tradingSessions(now);
  const pill = $('#topSession');
  if (pill) {
    const names = status.sessions.filter(s => s.active).map(s => s.name);
    pill.textContent = status.closed ? 'Market closed' : (names.join(' · ') || 'Between sessions');
    pill.classList.toggle('closed', status.closed || !names.length);
  }
  const sp = $('#splash');
  if (!sp || sp.hidden || sp.classList.contains('out')) return;
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).formatToParts(now)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  $('#splashHm').textContent = parts.hour + ':' + parts.minute;
  $('#splashSec').textContent = parts.second;
  $('#splashAm').textContent = parts.dayPeriod || '';
  $('#splashDate').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const tz = new Intl.DateTimeFormat('en-US', { timeZoneName: 'long' }).formatToParts(now).find(p => p.type === 'timeZoneName');
  $('#splashTz').textContent = tz ? tz.value : '';
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ny = $('#splashNy');
  if (localZone !== 'America/New_York') {
    ny.hidden = false;
    ny.textContent = 'New York  ' + new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZoneName: 'short' }).format(now);
  } else ny.hidden = true;
  $('#splashClosed').hidden = !status.closed;
  $('#splashSessions').innerHTML = status.sessions.map(s => `<span class="sess ${s.active ? 'on' : ''}">${esc(s.name)}</span>`).join('');
  $('#splashNext').textContent = status.phrase;
}
setInterval(paintNow, 1000);
paintNow();

// ---------------- theme ----------------
function applyTheme(choice) {
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function syncThemeSeg() {
  const cur = state.settings?.theme || 'light';
  $$('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.theme === cur));
}
async function setTheme(choice) {
  applyTheme(choice);
  state.settings = await gon.settings.save({ theme: choice });
  syncThemeSeg();
}
$('#themeToggle').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
$$('#themeSeg button').forEach(b => b.onclick = () => setTheme(b.dataset.theme));

// ---------------- theme song ----------------
let songHandle = null;
let retiringSong = null;
let songRetireTimer = null;
function songBin() {
  let bin = $('#songBin');
  if (!bin) {
    bin = document.createElement('div');
    bin.id = 'songBin';
    bin.hidden = true;
    document.body.appendChild(bin);
  }
  return bin;
}
function releaseSong(h) {
  if (!h) return;
  try { h.stop(); } catch (e) {}
}
function claimSongSlot() {
  if (songRetireTimer) { clearTimeout(songRetireTimer); songRetireTimer = null; }
  if (retiringSong) { releaseSong(retiringSong); retiringSong = null; }
  if (songHandle) { releaseSong(songHandle); songHandle = null; }
}
function songVolume() {
  const v = Number(state.settings?.themeSong?.volume);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
}
function playChime(vol, loop) {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = Math.max(0.0001, vol * 0.4);
  master.connect(ctx.destination);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const schedule = (t0) => notes.forEach((freq, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(master);
    const t = t0 + i * 0.22;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.start(t); o.stop(t + 0.9);
  });
  schedule(ctx.currentTime + 0.05);
  let timer = null;
  if (loop) timer = setInterval(() => schedule(ctx.currentTime + 0.05), 4200);
  return { kind: 'chime', ctx, master, timer, stop() { clearInterval(timer); ctx.close().catch(() => {}); } };
}
let songRetry = null;
function reportSongError(err) {
  const msg = err && (err.message || String(err));
  console.log('[theme-song]', msg || err);
  const el = $('#songErr');
  if (el) el.textContent = "Couldn't play that audio file. Try another mp3, m4a, wav, or ogg.";
}
function clearSongError() { const el = $('#songErr'); if (el) el.textContent = ''; }
function fadeAudio(audio, to, ms) {
  const from = audio.volume, t0 = performance.now();
  const step = (now) => {
    if (!songHandle || songHandle.audio !== audio) return;
    const p = Math.min(1, (now - t0) / ms);
    audio.volume = from + (to - from) * p;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function playFile(file, vol, loop) {
  clearSongError();
  let url;
  try { url = themeSongFileUrl(file); }
  catch (err) { reportSongError(err); return null; }
  const audio = new Audio();
  audio.preload = 'auto';
  audio.loop = !!loop;
  audio.volume = 0;
  audio.src = url;
  songBin().appendChild(audio);
  audio.addEventListener('error', () => reportSongError(audio.error || new Error('audio failed to load')));
  const handle = { kind: 'file', audio, stop() { try { audio.pause(); } catch (e) {} audio.removeAttribute('src'); try { audio.load(); } catch (e) {} audio.remove(); } };
  const begin = () => audio.play().then(() => fadeAudio(audio, vol, 700));
  begin().catch((err) => {
    console.log('[theme-song]', err && err.name, err && err.message);
    if (err && err.name === 'NotAllowedError') songRetry = () => begin().catch(reportSongError);
    else reportSongError(err);
  });
  return handle;
}
function activeSongFile() {
  const file = state.settings?.themeSong?.file;
  if (!file || typeof themeSongFileUrl !== 'function') return '';
  try { themeSongFileUrl(file); return file; }
  catch (err) { console.log('[theme-song] ignoring saved path', err && err.message ? err.message : err); return ''; }
}
function startSong(loop) {
  try {
    claimSongSlot();
    songRetry = null;
    const s = state.settings.themeSong || {};
    if (s.enabled === false) return null;
    const vol = songVolume();
    const file = activeSongFile();
    const handle = file ? playFile(file, vol, loop) : playChime(vol, loop);
    songHandle = handle;
    return songHandle;
  } catch (err) {
    console.log('[theme-song]', err && err.message ? err.message : err);
    return null;
  }
}
function playEntranceSong() { startSong(true); }
function retrySong() {
  if (!songRetry) return;
  const retry = songRetry; songRetry = null;
  Promise.resolve(retry()).catch(reportSongError);
}
function stopSong(immediate) {
  const h = songHandle; songHandle = null;
  if (!h) return;
  if (immediate || h.kind !== 'file') { h.stop(); return; }
  const a = h.audio, from = a.volume, t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 700);
    a.volume = from * (1 - p);
    if (p < 1) requestAnimationFrame(step); else h.stop();
  };
  requestAnimationFrame(step);
}
function fadeOutSong() {
  const h = songHandle; songHandle = null;
  if (!h) return;
  if (retiringSong && retiringSong !== h) releaseSong(retiringSong);
  retiringSong = h;
  if (songRetireTimer) clearTimeout(songRetireTimer);
  songRetireTimer = setTimeout(() => {
    songRetireTimer = null;
    if (retiringSong === h) { releaseSong(h); retiringSong = null; }
  }, 900);
  try {
    if (h.kind === 'chime' && h.master && h.ctx) {
      const g = h.master.gain, from = g.value, t = h.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, from), t);
      g.linearRampToValueAtTime(0.0001, t + 0.7);
      return;
    }
    if (h.audio) {
      const a = h.audio, from = a.volume, t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 700);
        try { a.volume = from * (1 - p); } catch (e) {}
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  } catch (e) { console.log('[theme-song]', e); }
}
function syncSongForm() {
  const s = state.settings.themeSong || {};
  const on = $('#sSongOn'); if (on) on.checked = s.enabled !== false;
  const vol = $('#sSongVol'); if (vol) vol.value = Math.round(songVolume() * 100);
  const name = $('#songName');
  if (name) name.textContent = activeSongFile() ? (s.name || 'Custom theme song') : (s.file ? "The saved song couldn't be used. Choose the file again." : 'No file chosen. A short original chime plays instead.');
}
$('#pickSong').onclick = async () => {
  try {
    const s = await gon.song.pick();
    if (!s) return;
    state.settings = s; clearSongError(); syncSongForm(); toast('Theme song saved');
  } catch (err) { reportSongError(err); }
};
$('#clearSong').onclick = async () => { state.settings = await gon.song.clear(); clearSongError(); syncSongForm(); toast('Theme song removed'); };
$('#sSongOn').onchange = async () => { state.settings = await gon.settings.save({ themeSong: { enabled: $('#sSongOn').checked } }); };
$('#sSongVol').oninput = async () => {
  const volume = +$('#sSongVol').value / 100;
  state.settings = await gon.settings.save({ themeSong: { volume } });
  if (songHandle?.kind === 'file') songHandle.audio.volume = volume;
  if (songHandle?.kind === 'chime') songHandle.master.gain.value = Math.max(0.0001, volume * 0.4);
};
$('#previewSong').onclick = () => {
  if (songHandle) { stopSong(true); songRetry = null; $('#previewSong').textContent = 'Play'; return; }
  clearSongError();
  startSong(false);
  $('#previewSong').textContent = 'Stop';
  setTimeout(() => { if ($('#previewSong').textContent === 'Stop') { stopSong(true); $('#previewSong').textContent = 'Play'; } }, 8000);
};

function renderBackgroundLibrary() {
  const grid = $('#bgGrid');
  if (!grid) return;
  const lib = currentLibrary();
  $$('#bgMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === lib.mode));
  $$('#bgFit button').forEach(b => b.classList.toggle('on', b.dataset.fit === lib.fit));
  const speeds = (typeof backgroundsApi !== 'undefined' && backgroundsApi.BG_SPEEDS) || [0.25, 0.5, 0.75, 1];
  const thumb = (item) => {
    if (item.kind === 'image' && item.file) {
      let url = '';
      try { url = backgroundFileUrl(item.file); } catch (e) { url = ''; }
      return `<img src="${esc(url)}" alt="">`;
    }
    let src = 'assets/entrance-loop.mp4#t=0.4';
    if (!item.builtin && item.file) { try { src = backgroundFileUrl(item.file) + '#t=0.1'; } catch (e) { src = ''; } }
    return `<video muted preload="metadata" playsinline src="${esc(src)}"></video>`;
  };
  grid.innerHTML = lib.items.map(item => {
    const speed = item.kind === 'video'
      ? `<label class="bg-speed">Speed<select data-speed>${speeds.map(s => `<option value="${s}"${Number(s) === Number(item.speed) ? ' selected' : ''}>${s}x</option>`).join('')}</select></label>`
      : '';
    const remove = item.builtin ? '<span class="muted small">Built in</span>' : '<button type="button" class="icon" data-rm title="Remove">✕</button>';
    return `<article class="bg-tile${item.id === lib.selectedId ? ' on' : ''}" data-id="${esc(item.id)}">
      <button type="button" class="bg-thumb" data-pick>${thumb(item)}<span class="bg-badge">${item.kind === 'video' ? 'Video' : 'Image'}</span></button>
      <div class="bg-meta">
        <div class="bg-meta-row"><div class="ellipsis" title="${esc(item.name)}">${esc(item.name)}</div>${remove}</div>
        <label class="check"><input type="checkbox" data-on ${item.enabled ? 'checked' : ''}> In rotation</label>
        ${speed}
      </div>
    </article>`;
  }).join('');
  $$('#bgGrid video').forEach(v => v.addEventListener('loadeddata', () => { try { if (v.currentTime < 0.05) v.currentTime = Math.min(0.4, (v.duration || 1) / 5); } catch (e) {} }, { once: true }));
}
async function applyBackgroundSettings(next) {
  if (!next) return;
  state.settings = next;
  renderBackgroundLibrary();
}
$('#addBackgrounds').onclick = async () => {
  try {
    const saved = await gon.bg.add();
    if (!saved) return;
    await applyBackgroundSettings(saved);
    toast('Backgrounds added');
  } catch (err) { console.log('[background]', err); toast('Could not add that file'); }
};
$('#bgGrid').addEventListener('click', async (e) => {
  const tile = e.target.closest('.bg-tile');
  if (!tile) return;
  try {
    if (e.target.closest('[data-rm]')) { e.preventDefault(); await applyBackgroundSettings(await gon.bg.remove(tile.dataset.id)); return; }
    if (e.target.closest('[data-pick]')) await applyBackgroundSettings(await gon.bg.prefs({ selectedId: tile.dataset.id }));
  } catch (err) { console.log('[background]', err); }
});
$('#bgGrid').addEventListener('change', async (e) => {
  const tile = e.target.closest('.bg-tile');
  if (!tile) return;
  try {
    if (e.target.matches('[data-on]')) await applyBackgroundSettings(await gon.bg.update(tile.dataset.id, { enabled: e.target.checked }));
    if (e.target.matches('[data-speed]')) await applyBackgroundSettings(await gon.bg.update(tile.dataset.id, { speed: Number(e.target.value) }));
  } catch (err) { console.log('[background]', err); }
});
$$('#bgMode button').forEach(b => b.onclick = async () => { try { await applyBackgroundSettings(await gon.bg.prefs({ mode: b.dataset.mode })); } catch (err) { console.log('[background]', err); } });
$$('#bgFit button').forEach(b => b.onclick = async () => { try { await applyBackgroundSettings(await gon.bg.prefs({ fit: b.dataset.fit })); } catch (err) { console.log('[background]', err); } });

// ---------------- P&L calendar ----------------
function renderPnl() {
  const y = state.pnlMonth.getFullYear(), m = state.pnlMonth.getMonth();
  const cal = pnlCalendar(state.logs, y, m + 1);
  $('#pnlMonthLabel').textContent = state.pnlMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const max = Math.max(1, ...cal.weeks.flatMap(w => w.days.filter(d => d.inMonth).map(d => Math.abs(d.pnl))));
  const paint = (pnl) => {
    if (!pnl) return '';
    const t = Math.min(1, Math.abs(pnl) / max);
    const a = (0.16 + 0.72 * t).toFixed(3);
    return `background:${pnl > 0 ? `rgba(47,158,68,${a})` : `rgba(217,84,43,${a})`}${t > 0.55 ? ';color:#fff' : ''}`;
  };
  $('#pnlKpis').innerHTML = [
    ['Net P&L', fmt$(cal.monthPnl), cls(cal.monthPnl)],
    ['Net R', fmtR(cal.monthR), cls(cal.monthR)],
    ['Win days', String(cal.winDays), 'pos'],
    ['Loss days', String(cal.lossDays), 'neg'],
  ].map(([l, v, c]) => `<div class="card"><div class="label">${l}</div><div class="value ${c}">${v}</div></div>`).join('');
  const head = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('') + '<div class="week-h">Week</div>';
  const rows = cal.weeks.map(w => w.days.map(d => {
    const on = state.pnlDate === d.date ? ' on' : '';
    const body = d.trades ? `<span class="p">${fmt$(d.pnl)}</span><span class="rr">${fmtR(d.r)}</span>` : '';
    const dot = (state.recaps || []).some(r => r.date === d.date) ? '<span class="pnl-dot" title="Video recap"></span>' : '';
    return `<button type="button" class="pnl-cell${d.inMonth ? '' : ' other'}${d.date === ymd(new Date()) ? ' today' : ''}${on}" data-date="${d.date}" style="${d.trades ? paint(d.pnl) : ''}"><span class="d">${d.day}${dot}</span>${body}</button>`;
  }).join('') + `<div class="pnl-cell week" style="${paint(w.totalPnl)}"><span class="d">${w.trades ? w.trades + ' trades' : '—'}</span><span class="p">${w.trades ? fmt$(w.totalPnl) : ''}</span><span class="rr">${w.trades ? fmtR(w.totalR) : ''}</span></div>`).join('');
  $('#pnlCal').innerHTML = `<div class="pnl-grid">${head}${rows}</div>`;
  $$('#pnlCal .pnl-cell[data-date]').forEach(b => b.onclick = () => { state.pnlDate = b.dataset.date; renderPnl(); });
  renderPnlDay();
}
function renderPnlDay() {
  const box = $('#pnlDay'), date = state.pnlDate;
  if (!date) { box.innerHTML = '<div class="empty small">Click a day to see its trades.</div>'; return; }
  const logs = state.logs.filter(l => l.date === date);
  const pnl = r2(logs.reduce((s, l) => s + (typeof l.pnl === 'number' ? l.pnl : 0), 0));
  const r = r2(logs.reduce((s, l) => s + (typeof l.resultR === 'number' ? l.resultR : 0), 0));
  const recaps = (state.recaps || []).filter(r => r.date === date);
  const prog = state.recapProgress && state.recapProgress.date === date ? `<div class="recap-progress" title="${esc(state.recapProgress.name)}"><span style="width:${Math.round((state.recapProgress.ratio || 0) * 100)}%"></span></div>` : '';
  box.innerHTML = `<div class="eyebrow">${niceDate(date)}</div><h3 class="${cls(pnl)}">${logs.length ? fmt$(pnl) : 'No trades'}</h3><div class="muted small mono">${logs.length ? fmtR(r) + ' · ' + logs.length + ' trade' + (logs.length > 1 ? 's' : '') : 'Nothing logged this day.'}</div>` +
    logs.map(l => `<button type="button" class="pnl-trade" data-id="${l.id}"><span class="mono">${esc(l.time || '—')}</span><span>${esc(l.instrument)} <span class="muted">${esc(l.setup || l.direction)}</span></span><span class="mono ${cls(l.pnl)}">${fmt$(l.pnl)}</span></button>`).join('') +
    `<div class="row between" style="margin-top:16px"><h3>Video recaps</h3><button type="button" class="btn sm" id="addRecap">Add recap</button></div>${prog}` +
    `<div class="recap-list">${recaps.map(recapCard).join('') || '<div class="muted small">No recap for this day yet.</div>'}</div>` +
    `<form id="recapUrl" class="row gap" style="margin-top:8px"><input id="recapLink" placeholder="https://… YouTube or other link"><button class="btn sm" type="submit">Add link</button></form>`;
  $$('#pnlDay .pnl-trade').forEach(b => b.onclick = () => openDrawer(state.logs.find(l => l.id === b.dataset.id)));
  const add = $('#addRecap'); if (add) add.onclick = () => addRecapFiles(date);
  const form = $('#recapUrl'); if (form) form.onsubmit = async (e) => { e.preventDefault(); const url = $('#recapLink').value.trim(); if (!url) return; try { state.recaps = await gon.recap.add({ date, url, title: 'Link' }); renderPnl(); } catch (err) { toast(err.message || String(err)); } };
  $$('#pnlDay [data-open]').forEach(b => b.onclick = () => gon.app.openExternal(b.dataset.open));
  $$('#pnlDay [data-recap-del]').forEach(b => b.onclick = async () => { await gon.recap.remove(b.dataset.recapDel); state.recaps = await gon.recap.list(); renderPnl(); });
  $$('#pnlDay [data-recap-move]').forEach(b => b.onclick = async () => { await moveRecap(date, b.dataset.recapMove, b.dataset.dir); });
}
function recapCard(r) {
  let media = '';
  if (r.file) {
    let src = '';
    try { src = recapFileUrl(r.date, r.file); } catch (e) { src = ''; }
    media = `<video controls preload="metadata" playsinline src="${esc(src)}#t=0.1"></video>`;
  } else if (r.url && youtubeId(r.url)) {
    media = `<iframe src="https://www.youtube-nocookie.com/embed/${youtubeId(r.url)}" allowfullscreen></iframe>`;
  } else if (r.url) {
    media = `<button type="button" class="btn sm" data-open="${esc(r.url)}">Open link</button>`;
  }
  return `<article class="card recap-card"><div class="row between"><b class="ellipsis">${esc(r.title || 'Recap')}</b><span class="row gap"><button type="button" class="icon" data-recap-move="${r.id}" data-dir="-1" title="Move up">↑</button><button type="button" class="icon" data-recap-move="${r.id}" data-dir="1" title="Move down">↓</button><button type="button" class="icon" data-recap-del="${r.id}" title="Delete">✕</button></span></div>${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}${media}</article>`;
}
async function addRecapFiles(date) {
  try {
    const paths = await gon.recap.pick();
    if (!paths || !paths.length) return;
    state.recapProgress = { date, name: 'Copying…', ratio: 0 };
    renderPnl();
    state.recaps = await gon.recap.add({ date, srcPaths: paths });
    state.recapProgress = null;
    renderPnl();
  } catch (err) { state.recapProgress = null; toast(err.message || String(err)); renderPnl(); }
}
async function moveRecap(date, id, dir) {
  const list = (state.recaps || []).filter(r => r.date === date);
  const i = list.findIndex(r => r.id === id);
  const j = i + Number(dir);
  if (i < 0 || j < 0 || j >= list.length) return;
  const ids = list.map(r => r.id);
  const tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp;
  state.recaps = state.recaps.map(r => r.date === date ? { ...r, order: ids.indexOf(r.id) } : r);
  await gon.recap.reorder(date, ids);
  state.recaps = await gon.recap.list();
  renderPnl();
}
$('#pnlPrev').onclick = () => { const d = state.pnlMonth; state.pnlMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1); state.pnlDate = null; renderPnl(); };
$('#pnlNext').onclick = () => { const d = state.pnlMonth; state.pnlMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1); state.pnlDate = null; renderPnl(); };
function pnlCalendar(logs, year, month) {
  const by = {};
  for (const l of logs) {
    const c = by[l.date] = by[l.date] || { pnl: 0, r: 0, trades: 0 };
    c.trades++;
    if (typeof l.pnl === 'number') c.pnl = r2(c.pnl + l.pnl);
    if (typeof l.resultR === 'number') c.r = r2(c.r + l.resultR);
  }
  const first = new Date(year, month - 1, 1), start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const weeks = []; let monthPnl = 0, monthR = 0, winDays = 0, lossDays = 0;
  for (let w = 0; w < 6; w++) {
    const days = []; let weekPnl = 0, weekR = 0, weekTrades = 0, any = false;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + w * 7 + i);
      const key = ymd(d), cell = by[key] || { pnl: 0, r: 0, trades: 0 };
      const inMonth = d.getFullYear() === year && d.getMonth() === month - 1;
      if (inMonth) {
        any = true;
        if (cell.trades) {
          monthPnl = r2(monthPnl + cell.pnl); monthR = r2(monthR + cell.r);
          weekPnl = r2(weekPnl + cell.pnl); weekR = r2(weekR + cell.r); weekTrades += cell.trades;
          if (cell.pnl > 0) winDays++; else if (cell.pnl < 0) lossDays++;
        }
      }
      days.push({ date: key, inMonth, day: d.getDate(), pnl: cell.trades ? cell.pnl : 0, r: cell.trades ? cell.r : 0, trades: cell.trades });
    }
    if (any) weeks.push({ days, totalPnl: weekPnl, totalR: weekR, trades: weekTrades });
  }
  return { weeks, monthPnl, monthR, winDays, lossDays };
}

// ---------------- education ----------------
function youtubeId(url) { const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/); return m ? m[1] : null; }
function mentorColor(name) {
  const m = (state.settings.eduMentors || []).find(x => x.name.toLowerCase() === String(name || '').toLowerCase());
  return m ? m.color : '#9a9aa0';
}
function mentorOptions(selected) {
  const mentors = state.settings.eduMentors || [];
  return `<option value="" ${selected ? '' : 'selected'}>Unsorted</option>` + mentors.map(m => `<option value="${esc(m.name)}" ${m.name === selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}
function renderEducation() {
  const mentors = state.settings.eduMentors || [];
  const q = ($('#eduSearch').value || '').trim().toLowerCase();
  const count = (name) => state.education.filter(v => name ? v.mentor === name : !v.mentor).length;
  const side = $('#eduSide');
  if (side) {
    const rows = [`<button type="button" class="side ${state.eduMentor === '' ? 'on' : ''}" data-m=""><span>All</span><span class="count">${state.education.length}</span></button>`]
      .concat(mentors.map(m => `<button type="button" class="side ${state.eduMentor === m.name ? 'on' : ''}" data-m="${esc(m.name)}"><span class="dot" style="background:${esc(m.color)}"></span><span class="ellipsis">${esc(m.name)}</span><span class="count">${count(m.name)}</span></button>`))
      .concat([`<button type="button" class="side ${state.eduMentor === '__none' ? 'on' : ''}" data-m="__none"><span>Unsorted</span><span class="count">${count('')}</span></button>`]);
    const manage = mentors.map(m => `<div class="mentor-row" data-id="${m.id}"><input type="color" value="${esc(m.color)}" data-color title="Color"><input type="text" value="${esc(m.name)}" data-name><button type="button" class="icon" data-del title="Delete mentor">✕</button></div>`).join('');
    side.innerHTML = rows.join('') + `<div class="muted small" style="margin-top:12px">Mentors</div>` + manage + `<div class="mentor-row"><input type="text" id="newMentorName" placeholder="New mentor"><button type="button" class="btn sm" id="addMentorBtn">Add</button></div>`;
    $$('#eduSide .side').forEach(b => b.onclick = () => { state.eduMentor = b.dataset.m; renderEducation(); });
    $$('#eduSide [data-color]').forEach(input => input.onchange = async () => { state.settings = await gon.edu.mentorColor(input.closest('.mentor-row').dataset.id, input.value); renderEducation(); });
    $$('#eduSide [data-name]').forEach(input => input.onchange = async () => { try { const res = await gon.edu.mentorRename(input.closest('.mentor-row').dataset.id, input.value); state.settings = res.settings; state.education = res.education; renderEducation(); } catch (err) { toast(err.message || String(err)); } });
    $$('#eduSide [data-del]').forEach(b => b.onclick = async () => { const res = await gon.edu.mentorRemove(b.closest('.mentor-row').dataset.id); state.settings = res.settings; state.education = res.education; if (state.eduMentor && !state.settings.eduMentors.some(m => m.name === state.eduMentor)) state.eduMentor = ''; renderEducation(); });
    $('#addMentorBtn').onclick = async () => { const name = $('#newMentorName').value.trim(); if (!name) return; state.settings = await gon.edu.mentorAdd(name); renderEducation(); };
  }
  let items = state.education.slice();
  if (state.eduMentor === '__none') items = items.filter(v => !v.mentor);
  else if (state.eduMentor) items = items.filter(v => v.mentor === state.eduMentor);
  if (q) items = items.filter(v => [v.title, v.mentor, v.notes, (v.tags || []).join(' ')].join(' ').toLowerCase().includes(q));
  if (!items.length) { $('#eduBoard').innerHTML = `<div class="empty card"><h3>${state.education.length ? 'Nothing matches' : 'No lessons yet'}</h3><p class="small">Add a video and choose the mentor it came from.</p></div>`; return; }
  $('#eduBoard').innerHTML = `<div class="edu-cards">${items.map((v, i) => eduCard(v, i)).join('')}</div>`;
  $$('#eduBoard .edu-card').forEach(c => c.onclick = e => { if (e.target.closest('select, button, a, input')) return; openEdu(c.dataset.id); });
  $$('#eduBoard [data-watched]').forEach(b => b.onclick = async (e) => { e.stopPropagation(); const v = state.education.find(x => x.id === b.dataset.watched); const next = await gon.edu.update(v.id, { watched: !v.watched }); state.education = state.education.map(x => x.id === next.id ? next : x); renderEducation(); });
  $$('#eduBoard [data-move]').forEach(sel => sel.onchange = async (e) => { e.stopPropagation(); const next = await gon.edu.update(sel.dataset.move, { mentor: sel.value }); state.education = state.education.map(x => x.id === next.id ? next : x); renderEducation(); });
}
function eduCard(v, i) {
  const color = mentorColor(v.mentor);
  const thumb = v.thumb ? `style="background-image:url('gon://thumbs/${encodeURIComponent(v.thumb)}')"` : '';
  return `<article class="card edu-card ${v.watched ? 'watched' : ''}" data-id="${v.id}" style="animation:riseIn .22s ease-out both;animation-delay:${Math.min(i, 12) * 28}ms"><div class="thumb" ${thumb}><span class="play">▶</span></div><div class="body"><div class="who"><span class="dot" style="background:${esc(color)}"></span>${esc(v.mentor || 'Unsorted')}</div><div class="title">${esc(v.title)}</div><div class="muted small">${esc(v.date)}${v.watched ? ' · watched' : ''}</div><select data-move="${v.id}" title="Move to another mentor">${mentorOptions(v.mentor || '')}</select><button type="button" class="link" data-watched="${v.id}">${v.watched ? 'Mark unwatched' : 'Mark watched'}</button></div></article>`;
}
$('#eduSearch').addEventListener('input', renderEducation);
$('#addEdu').onclick = () => openEdu(null);
function closeEdu() { $('#eduOverlay').hidden = true; const p = $('#eduPlayer video, #eduPlayer iframe'); if (p) p.remove(); state.eduEditing = null; state.eduSrcPath = null; }
function openEdu(id) {
  const v = id ? state.education.find(x => x.id === id) : null;
  state.eduEditing = id; state.eduSrcPath = null;
  $('#eduDialogTitle').textContent = v ? 'Edit video' : 'Add a video';
  $('#eduDelete').hidden = !v;
  $('#eTitle').value = v?.title || '';
  const mentorSel = $('#eMentor');
  mentorSel.innerHTML = mentorOptions(v?.mentor || '') + '<option value="__new">Add new mentor…</option>';
  mentorSel.value = v?.mentor && (state.settings.eduMentors || []).some(m => m.name === v.mentor) ? v.mentor : '';
  mentorSel.onchange = async () => {
    if (mentorSel.value !== '__new') return;
    const name = window.prompt('Mentor name');
    const clean = String(name || '').trim().replace(/^@/, '');
    if (!clean) { mentorSel.value = v?.mentor || ''; return; }
    state.settings = await gon.edu.mentorAdd(clean);
    mentorSel.innerHTML = mentorOptions(clean) + '<option value="__new">Add new mentor…</option>';
    mentorSel.value = clean;
  };
  $('#eDate').value = v?.date || ymd(new Date());
  $('#eTags').value = (v?.tags || []).join(', ');
  $('#eUrl').value = v?.url || '';
  $('#eNotes').value = v?.notes || '';
  $('#eWatched').checked = !!v?.watched;
  $('#eFileName').textContent = v?.file ? 'Local video attached' : 'Or paste a link above';
  $('#eduErr').textContent = '';
  renderStamps(v?.stamps || []);
  renderEduPlayer(v);
  $('#eduOverlay').hidden = false;
}
function renderEduPlayer(v) {
  const box = $('#eduPlayer');
  if (!v) { box.innerHTML = '<div class="small" style="padding:24px">A player shows up after you save a file or a YouTube link.</div>'; return; }
  const id = youtubeId(v.url);
  if (v.file) box.innerHTML = `<video id="eduVideo" controls src="gon://videos/${encodeURIComponent(v.file)}"></video>`;
  else if (id) box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  else if (v.url) box.innerHTML = `<div style="padding:24px;text-align:center"><p class="small">This link opens in your browser.</p><button class="btn" id="eduOpen" type="button">Open video</button></div>`;
  else box.innerHTML = '';
  const open = $('#eduOpen'); if (open) open.onclick = () => gon.app.openExternal(v.url);
}
function renderStamps(stamps) {
  $('#eStamps').innerHTML = stamps.map((s, i) => `<div class="row gap"><input class="t mono" data-i="${i}" data-k="t" value="${esc(s.t)}" placeholder="1:24"><input data-i="${i}" data-k="note" value="${esc(s.note)}" placeholder="Note"><button type="button" class="icon" data-rm="${i}">✕</button></div>`).join('');
  $$('#eStamps [data-rm]').forEach(b => b.onclick = () => { const next = readStamps(); next.splice(+b.dataset.rm, 1); renderStamps(next); });
}
function readStamps() { const rows = {}; $$('#eStamps input').forEach(el => { const i = el.dataset.i; rows[i] = rows[i] || { t: '', note: '' }; rows[i][el.dataset.k] = el.value; }); return Object.values(rows); }
$('#eAddStamp').onclick = () => {
  const stamps = readStamps();
  const video = $('#eduVideo');
  let t = '';
  if (video && Number.isFinite(video.currentTime)) { const s = Math.floor(video.currentTime); t = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  stamps.push({ t, note: '' }); renderStamps(stamps);
};
$('#ePick').onclick = async () => { const p = await gon.edu.pick(); if (!p) return; state.eduSrcPath = p; $('#eFileName').textContent = p.split(/[/\\]/).pop(); };
$('#eduClose').onclick = closeEdu; $('#eduCancel').onclick = closeEdu;
$('#eduDelete').onclick = async () => {
  if (!state.eduEditing || !confirm('Delete this video?')) return;
  await gon.edu.remove(state.eduEditing); state.education = state.education.filter(v => v.id !== state.eduEditing); closeEdu(); renderEducation(); toast('Video deleted');
};
$('#eduSave').onclick = async () => {
  const mentorValue = $('#eMentor').value === '__new' ? '' : $('#eMentor').value;
  const payload = { title: $('#eTitle').value.trim(), mentor: mentorValue, date: $('#eDate').value, tags: $('#eTags').value, url: $('#eUrl').value.trim(), notes: $('#eNotes').value, stamps: readStamps(), watched: $('#eWatched').checked };
  try {
    let saved;
    if (state.eduEditing) saved = await gon.edu.update(state.eduEditing, payload);
    else { if (state.eduSrcPath) payload.srcPath = state.eduSrcPath; saved = await gon.edu.create(payload); }
    if (saved.file && !saved.thumb) { const data = await captureThumb(saved.file).catch(() => null); if (data) saved = await gon.edu.thumb(saved.id, data); }
    state.education = state.eduEditing ? state.education.map(v => v.id === saved.id ? saved : v) : [saved, ...state.education];
    closeEdu(); renderEducation(); toast('Video saved');
  } catch (err) { $('#eduErr').textContent = err.message || String(err); }
};
function captureThumb(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = 'gon://videos/' + encodeURIComponent(file);
    const fail = () => reject(new Error('thumb'));
    v.onerror = fail;
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.4, (v.duration || 1) / 8); } catch { fail(); } };
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas'); c.width = 480; c.height = 270;
        c.getContext('2d').drawImage(v, 0, 0, 480, 270);
        resolve(c.toDataURL('image/jpeg', 0.82));
      } catch (e) { reject(e); }
    };
  });
}

function motiveMedia(item) {
  if (item.file) {
    let src = '';
    try { src = storedVideoUrl('motive', item.file); } catch (e) { src = ''; }
    return `<video controls preload="metadata" playsinline src="${esc(src)}#t=0.1"></video>`;
  }
  const id = youtubeId(item.url);
  if (id) return `<iframe src="https://www.youtube-nocookie.com/embed/${id}" allowfullscreen></iframe>`;
  if (item.url) return `<button type="button" class="btn sm" data-open="${esc(item.url)}">Open video</button>`;
  return '';
}
function renderMotivation() {
  $$('#motiveFilters .chip').forEach(b => b.classList.toggle('on', b.dataset.f === state.motiveFilter));
  let items = state.motivation || [];
  if (state.motiveFilter !== 'all') items = items.filter(m => m.kind === state.motiveFilter);
  const pinned = items.filter(m => m.pinned);
  const rest = items.filter(m => !m.pinned);
  const ordered = pinned.concat(rest);
  const board = $('#motiveBoard');
  if (!ordered.length) { board.innerHTML = `<div class="empty card" style="width:100%"><h3>Nothing here yet</h3><p class="small">Add a quote or a video.</p></div>`; return; }
  board.innerHTML = ordered.map((m, i) => {
    const body = m.kind === 'quote'
      ? `<p>${esc(m.text)}</p>${m.author ? `<div class="muted small">— ${esc(m.author)}</div>` : ''}`
      : `<div class="title" style="font-weight:600;margin-bottom:8px">${esc(m.title)}</div>${motiveMedia(m)}`;
    return `<article class="card motive-card" draggable="true" data-id="${m.id}" style="animation-delay:${Math.min(i, 10) * 30}ms">${body}<div class="row gap" style="margin-top:10px"><button type="button" class="btn sm" data-pin="${m.id}">${m.pinned ? 'Pinned' : 'Pin'}</button><button type="button" class="btn sm ghost" data-edit="${m.id}">Edit</button><button type="button" class="icon" data-del="${m.id}" title="Delete">✕</button></div></article>`;
  }).join('');
  $$('#motiveBoard [data-pin]').forEach(b => b.onclick = async () => { const m = state.motivation.find(x => x.id === b.dataset.pin); const next = await gon.motivation.update(m.id, { pinned: !m.pinned }); state.motivation = state.motivation.map(x => x.id === next.id ? next : x); renderMotivation(); renderHomeQuote(); });
  $$('#motiveBoard [data-del]').forEach(b => b.onclick = async () => { await gon.motivation.remove(b.dataset.del); state.motivation = state.motivation.filter(x => x.id !== b.dataset.del); renderMotivation(); });
  $$('#motiveBoard [data-edit]').forEach(b => b.onclick = () => openMotive(state.motivation.find(x => x.id === b.dataset.edit)));
  $$('#motiveBoard [data-open]').forEach(b => b.onclick = () => gon.app.openExternal(b.dataset.open));
  let dragId = '';
  $$('#motiveBoard .motive-card').forEach(card => {
    card.ondragstart = () => { dragId = card.dataset.id; };
    card.ondragover = (e) => e.preventDefault();
    card.ondrop = async (e) => {
      e.preventDefault();
      if (!dragId || dragId === card.dataset.id) return;
      const ids = (state.motivation || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(m => m.id);
      const from = ids.indexOf(dragId), to = ids.indexOf(card.dataset.id);
      if (from < 0 || to < 0) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      state.motivation = await gon.motivation.reorder(ids);
      renderMotivation();
    };
  });
}
function closeMotive() { $('#motiveOverlay').hidden = true; state.motiveSrc = null; state.motiveEditing = null; }
function openMotive(item, kind) {
  const m = item || null;
  state.motiveEditing = m ? m.id : null;
  state.motiveKind = m ? m.kind : (kind || 'quote');
  state.motiveSrc = null;
  const video = state.motiveKind === 'video';
  $('#motiveTitle').textContent = m ? (video ? 'Edit video' : 'Edit quote') : (video ? 'Add a video' : 'Add a quote');
  $('#motiveTextLabel').hidden = false;
  if ($('#motiveTextLabel').firstChild) $('#motiveTextLabel').firstChild.textContent = video ? 'Title' : 'Quote';
  $('#motiveAuthorLabel').hidden = video;
  $('#motiveLinkLabel').hidden = !video;
  $('#motiveFileRow').hidden = !video;
  $('#mText').value = video ? (m?.title || '') : (m?.text || '');
  $('#mAuthor').value = m?.author || '';
  $('#mUrl').value = m?.url || '';
  $('#mPin').checked = !!m?.pinned;
  $('#mFileName').textContent = m?.file ? 'Local video attached' : 'Or paste a link';
  $('#motiveErr').textContent = '';
  $('#motiveOverlay').hidden = false;
}
$('#motiveFilters').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; state.motiveFilter = b.dataset.f; renderMotivation(); });
$('#addQuote').onclick = () => openMotive(null, 'quote');
$('#addMotiveVideo').onclick = () => openMotive(null, 'video');
$('#motiveClose').onclick = closeMotive;
$('#motiveCancel').onclick = closeMotive;
$('#mPick').onclick = async () => { const p = await gon.motivation.pick(); if (!p) return; state.motiveSrc = p; $('#mFileName').textContent = p.split(/[/\\]/).pop(); };
$('#motiveSave').onclick = async () => {
  const video = state.motiveKind === 'video';
  const fileLabel = state.motiveSrc ? state.motiveSrc.split(/[/\\]/).pop() : '';
  const payload = {
    kind: video ? 'video' : 'quote',
    text: video ? '' : $('#mText').value.trim(),
    title: video ? ($('#mText').value.trim() || fileLabel || 'Video') : '',
    author: video ? '' : $('#mAuthor').value.trim(),
    url: video ? $('#mUrl').value.trim() : '',
    pinned: $('#mPin').checked,
  };
  try {
    let saved;
    if (state.motiveEditing) saved = await gon.motivation.update(state.motiveEditing, payload);
    else { if (state.motiveSrc) payload.srcPath = state.motiveSrc; saved = await gon.motivation.create(payload); }
    state.motivation = state.motiveEditing ? state.motivation.map(x => x.id === saved.id ? saved : x) : state.motivation.concat([saved]);
    closeMotive(); renderMotivation(); toast('Saved');
  } catch (err) { $('#motiveErr').textContent = err.message || String(err); }
};
if (gon.recap && gon.recap.onProgress) gon.recap.onProgress((p) => {
  state.recapProgress = { date: state.pnlDate, name: p.name, ratio: Math.min(1, ((p.index || 0) + (p.ratio || 0)) / (p.total || 1)) };
  const bar = document.querySelector('#pnlDay .recap-progress span');
  if (bar) bar.style.width = Math.round(state.recapProgress.ratio * 100) + '%';
});

(async function init() {
  state.settings = await gon.settings.get();
  applyTheme(state.settings.theme || 'light');
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.settings.theme === 'system') applyTheme('system'); });
  gon.updater.onStatus(applyUpdateState);
  gon.updater.state().then(applyUpdateState).catch(() => {});
  gon.app.version().then(v => { const el = $('#appVersion'); if (el) el.textContent = v; }).catch(() => {});
  setupImages();
  [state.logs, state.stats, state.education, state.motivation, state.recaps] = await Promise.all([gon.logs.list(), gon.logs.stats(), gon.edu.list(), gon.motivation.list(), gon.recap.list()]);
  const t = params.get('tab');
  const startTab = t === 'logs-calendar' ? 'logs' : (TABS.includes(t) ? t : 'home');
  if (t === 'logs-calendar') { state.mode = 'calendar'; syncMode(); }
  state.tab = null;
  entrance();
  go(startTab);
})();
