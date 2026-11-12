'use strict';
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

const state = { tab: 'home', logs: [], stats: null, settings: null, mode: 'list', calMonth: new Date(), editing: null, form: {}, seenPosts: new Set(), homeAnimated: false };
const TABS = ['home', 'logs', 'mentors', 'settings'];

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
  if (!$('#splash') || $('#splash').hidden) {
    if (e.key === 'Escape') { if (!$('#lightbox').hidden) $('#lightbox').hidden = true; else if (!$('#wizOverlay').hidden) closeWizard(); else closeDrawer(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openWizard(); }
    if ((e.ctrlKey || e.metaKey) && /^[1-4]$/.test(e.key)) go(['home', 'logs', 'mentors', 'settings'][+e.key - 1]);
    if (e.key === 'Enter' && state.tab === 'home' && $('#wizOverlay').hidden && $('#overlay').hidden && document.activeElement === document.body) openWizard();
  }
});
function render() {
  if (state.tab === 'home') renderHome();
  if (state.tab === 'logs') renderLogs();
  if (state.tab === 'mentors') renderMentors();
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
  $('#licName').textContent = p.name || 'Cole'; $('#licHandle').textContent = '@' + (p.handle || 'colehys'); $('#licAcct').textContent = p.account || '';
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
    $('#logList').innerHTML = `<div class="empty card"><img class="mascot" src="assets/gon-portrait.jpg" alt=""><h3>No training logs yet</h3><p class="small">Every hunter starts somewhere.</p><button class="btn primary" id="emptyLog">Log your first trade</button></div>`;
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
    bind: () => {}, valid: () => null },
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

// ---------------- mentors ----------------
let lastPollResult = null;
async function renderMentors() {
  const s = state.settings, cache = await gon.mentors.cache(), st = cache.status || {};
  $('#mentorChips').innerHTML = s.mentors.map(h => `<span class="chip ${st[h.toLowerCase()]?.error ? 'err' : 'on'}" title="${esc(st[h.toLowerCase()]?.error || '')}">@${esc(h)}</span>`).join('') + `<button class="link" data-goto="settings">Edit mentors</button>`;
  $('#mentorStatus').textContent = cache.lastPoll ? `last checked ${new Date(cache.lastPoll).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · every ${s.pollMinutes} min` : '';
  const errs = (lastPollResult?.errors || []).filter(x => x !== 'NO_TOKEN');
  $('#mentorErrors').innerHTML = errs.map(e => `<div class="alert">${esc(e)}</div>`).join('');
  if (!s.bearerToken) {
    $('#feed').innerHTML = `<div class="empty howto card" style="column-span:all"><h3 style="margin-bottom:8px">Connect the X API to see mentor posts</h3>
      <p class="small">The Mentors feed reads posts through X's official API, which needs your own bearer token. Nothing is scraped.</p>
      <ol class="small"><li>Sign in at <a class="link" href="https://console.x.com" target="_blank">console.x.com</a> (X Developer Console) and create a project + app.</li>
      <li>Add API credits. Reads are pay-per-use, roughly $0.005 per post returned.</li>
      <li>Copy the app's <b>Bearer Token</b> and paste it in <button class="link" data-goto="settings">Settings</button>.</li>
      <li>Add your mentors' handles. New image posts appear here automatically.</li></ol></div>`;
    return;
  }
  if (!s.mentors.length) { $('#feed').innerHTML = `<div class="empty card" style="column-span:all">No mentors yet. Add X handles in <button class="link" data-goto="settings">Settings</button>.</div>`; return; }
  if (!cache.posts.length) { $('#feed').innerHTML = `<div style="column-span:all">${[0, 1, 2].map(() => '<div class="skeleton" style="height:220px;margin-bottom:14px"></div>').join('')}<div class="muted small">No image posts yet. Checking every ${s.pollMinutes} minutes.</div></div>`; return; }
  const first = state.seenPosts.size === 0;
  $('#feed').innerHTML = cache.posts.map((p, i) => {
    const imgs = p.images.filter(im => im.local || im.remote), n = Math.min(imgs.length, 4);
    return `<article class="card post ${!first && !state.seenPosts.has(p.id) ? 'new' : ''}" style="animation-delay:${Math.min(i, 9) * 50}ms">
      <div class="imgs n${n}">${imgs.slice(0, 4).map(im => `<img src="${im.local ? mediaUrl(im.local) : ''}" alt="" loading="lazy">`).join('')}</div>
      <div class="body"><div class="meta"><span><b>${esc(p.name || p.handle)}</b> @${esc(p.handle)}</span><span class="mono">${new Date(p.createdAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
      <div class="cap">${esc(p.text)}</div><a class="link open" href="${esc(p.url)}" target="_blank">Open on X ↗</a></div></article>`;
  }).join('');
  $$('#feed .post').forEach((el, i) => { const p = cache.posts[i]; $$('img', el).forEach(im => im.onclick = () => lightbox(im.src, `@${p.handle} · ${new Date(p.createdAt).toLocaleString()} · ${p.text}`)); });
  cache.posts.forEach(p => state.seenPosts.add(p.id));
}
$('#refreshMentors').onclick = async () => {
  const b = $('#refreshMentors'); b.disabled = true; b.textContent = 'Checking…';
  try { lastPollResult = await gon.mentors.poll(); toast(lastPollResult.added ? `${lastPollResult.added} new post${lastPollResult.added > 1 ? 's' : ''}` : 'No new posts'); }
  finally { b.disabled = false; b.textContent = 'Refresh now'; renderMentors(); }
};
gon.mentors.onUpdate(r => { lastPollResult = r; if (r.added) toast(`${r.added} new mentor post${r.added > 1 ? 's' : ''}`); if (state.tab === 'mentors') renderMentors(); });

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
  $('#sMentors').value = s.mentors.map(h => '@' + h).join('\n'); $('#sPoll').value = s.pollMinutes;
  $('#sToken').value = s.bearerToken; $('#sSplash').checked = s.splash !== false;
  rulesDraft = [...s.rules]; renderRulesEditor();
  $('#dataDir').textContent = await gon.app.dataDir();
}
$('#toggleToken').onclick = () => { const t = $('#sToken'); t.type = t.type === 'password' ? 'text' : 'password'; $('#toggleToken').textContent = t.type === 'password' ? 'Show' : 'Hide'; };
$('#openData').onclick = () => gon.app.openDataDir();
$('#saveSettings').onclick = async () => {
  const before = state.settings;
  state.settings = await gon.settings.save({ profile: { name: $('#sName').value.trim(), handle: $('#sHandle').value.trim().replace(/^@/, ''), account: $('#sAcct').value.trim() }, rules: rulesDraft, mentors: $('#sMentors').value, pollMinutes: +$('#sPoll').value, bearerToken: $('#sToken').value, splash: $('#sSplash').checked });
  renderSettings(); $('#saveMsg').textContent = 'Saved ✓'; setTimeout(() => $('#saveMsg').textContent = '', 1800); toast('Settings saved');
  if (state.settings.bearerToken && (state.settings.bearerToken !== before.bearerToken || state.settings.mentors.join() !== before.mentors.join())) gon.mentors.poll().then(r => { lastPollResult = r; });
};

// ---------------- images ----------------
function setupImages() {
  for (const im of [$('#avatar'), $('.brand-av')]) { const fb = () => { im.onerror = null; im.src = FALLBACK_MASCOT; }; im.onerror = fb; if (im.complete && !im.naturalWidth) fb(); }
  const b = new Image(); b.onload = () => { $('#banner').style.backgroundImage = 'url(assets/gon-banner.jpg)'; }; b.onerror = () => $('#banner').classList.add('none'); b.src = 'assets/gon-banner.jpg';
}

// ---------------- entrance ----------------
function enterApp() {
  document.body.classList.remove('booting'); document.body.classList.add('entered');
  requestAnimationFrame(moveInk);
}
async function entrance() {
  if (params.get('nosplash') || state.settings.splash === false) { enterApp(); return; }
  const sp = $('#splash'); sp.hidden = false;
  const name = state.settings.profile.handle || 'colehys';
  $('#splashName').innerHTML = [...name].map((ch, i) => `<span style="animation-delay:${0.6 + i * 0.06}s, ${1.4 + i * 0.03}s">${esc(ch)}</span>`).join('');
  const h = $('#splashName'), W = h.offsetWidth;
  $$('span', h).forEach(sp => { sp.style.setProperty('--w', W + 'px'); sp.style.setProperty('--x', sp.offsetLeft - h.offsetLeft + 'px'); });
  const gif = $('#splashGif'); gif.onerror = () => { if (!gif.dataset.fb) { gif.dataset.fb = 1; gif.src = 'assets/gon-rod.gif'; return; } $('.splash-media').remove(); $('.splash').style.background = 'linear-gradient(180deg, #bfe1ff, #f4faff)'; };
  const total = reduced ? 700 : 4200;
  const t0 = performance.now();
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    sp.classList.add('out'); enterApp();
    setTimeout(() => sp.remove(), 800);
    document.removeEventListener('keydown', finish, true);
  };
  const tick = () => { if (done) return; const p = Math.min(1, (performance.now() - t0) / total); if (p < 1) requestAnimationFrame(tick); else finish(); };
  requestAnimationFrame(tick);
  sp.addEventListener('click', finish);
  document.addEventListener('keydown', finish, true);
}

setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }, 1000);

(async function init() {
  state.settings = await gon.settings.get();
  setupImages();
  [state.logs, state.stats] = await Promise.all([gon.logs.list(), gon.logs.stats()]);
  const t = params.get('tab');
  const startTab = t === 'logs-calendar' ? 'logs' : (TABS.includes(t) ? t : 'home');
  if (t === 'logs-calendar') { state.mode = 'calendar'; syncMode(); }
  state.tab = null;
  entrance();
  go(startTab);
})();
