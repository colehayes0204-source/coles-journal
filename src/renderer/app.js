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
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const math = window.journalMathApi;
const PAGES = [
  ['home', 'Home'], ['trades', 'Trades'], ['analytics', 'Analytics'], ['calendar', 'Calendar'],
  ['playbook', 'Playbook'], ['journal', 'Daily journal'], ['education', 'Education'], ['motivation', 'Motivation'],
  ['accounts', 'Accounts'], ['import', 'Import'], ['settings', 'Settings'],
];
const MISTAKES = ['Revenge', 'No setup', 'Chased', 'Early entry', 'Moved stop', 'Oversize', 'FOMO'];
const EMOTIONS = ['Calm', 'Patient', 'Anxious', 'Frustrated', 'Confident', 'Tilt'];
const state = {
  page: 'home', logs: [], accounts: [], playbook: [], days: [], education: [], motivation: [], recaps: [],
  settings: null, accountId: 'all', q: '', detail: null, form: null, day: null, importText: '', importMap: null,
  update: { status: 'idle' },
};
const params = new URLSearchParams(location.search);

function money(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const n = Number(v);
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  return sign + '$' + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function rTxt(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  return (n > 0 ? '+' : '') + n.toFixed(2).replace(/\.00$/, '') + 'R';
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 1600);
}
function filteredLogs() {
  return state.logs.filter(l => {
    if (state.accountId !== 'all' && l.accountId !== state.accountId) return false;
    if (state.q) {
      const blob = [l.instrument, l.setup, l.notes, l.direction, (l.mistakes || []).join(' ')].join(' ').toLowerCase();
      if (!blob.includes(state.q)) return false;
    }
    return true;
  });
}
function acctName(id) {
  const a = state.accounts.find(x => x.id === id);
  return a ? a.name : '—';
}

function renderNav() {
  $('#nav').innerHTML = PAGES.map(([id, label]) => `<button type="button" data-page="${id}" class="${state.page === id ? 'on' : ''}"><span>${label}</span></button>`).join('');
  $$('#nav button').forEach(b => b.onclick = () => go(b.dataset.page));
  const acct = state.accounts.find(a => a.id === state.accountId);
  const label = state.accountId === 'all' ? 'All accounts' : (acct ? acct.name : 'Account');
  $('#sideAcct').textContent = label;
  $('#acctBtn').textContent = label;
}
function go(page) {
  state.page = PAGES.some(p => p[0] === page) ? page : 'home';
  state.detail = null;
  renderNav();
  const view = $('#view');
  view.innerHTML = '';
  try { renderPage(view); }
  catch (err) { console.log('[renderer] page', err && err.stack || err); view.innerHTML = `<div class="empty">This page hit an error. It was logged, and the rest of the app is still open.</div>`; }
}
function renderPage(view) {
  if (state.page === 'home') renderHome(view);
  else if (state.page === 'trades') renderTrades(view);
  else if (state.page === 'analytics') renderAnalytics(view);
  else if (state.page === 'calendar') renderCalendar(view);
  else if (state.page === 'playbook') renderPlaybook(view);
  else if (state.page === 'journal') renderJournal(view);
  else if (state.page === 'education') renderEducation(view);
  else if (state.page === 'motivation') renderMotivation(view);
  else if (state.page === 'accounts') renderAccounts(view);
  else if (state.page === 'import') renderImport(view);
  else if (state.page === 'settings') renderSettings(view);
}

function guardBanner(logs) {
  const maxT = state.settings?.goals?.maxTrades || 0;
  const today = math.todayKey();
  const todays = logs.filter(l => l.date === today);
  const bits = [];
  if (maxT && todays.length >= maxT) bits.push(`Daily trade cap reached (${todays.length}/${maxT}).`);
  if (state.accountId !== 'all') {
    const acct = state.accounts.find(a => a.id === state.accountId);
    if (acct) {
      const prop = math.propStatus(acct, logs);
      if (prop.breachedDaily) bits.push('Daily loss limit is hit.');
      if (prop.breachedDrawdown) bits.push('Trailing drawdown is hit.');
    }
  }
  return bits.length ? `<div class="banner">${bits.map(esc).join(' ')}</div>` : '';
}

function renderHome(view) {
  const logs = filteredLogs();
  const rep = math.report(logs);
  const quote = (state.motivation || []).find(m => m.kind === 'quote' && m.pinned);
  const acct = state.accountId === 'all' ? null : state.accounts.find(a => a.id === state.accountId);
  const prop = acct ? math.propStatus(acct, state.logs) : null;
  view.innerHTML = `
    <div class="page-head"><div><h1>Dashboard</h1><div class="sub">${esc(state.settings?.profile?.name || 'Cole')} · ${logs.length} trades in view</div></div></div>
    ${guardBanner(logs)}
    ${quote ? `<div class="card" style="margin-bottom:12px"><div class="tiny muted">Pinned</div><div>${esc(quote.text)}</div>${quote.author ? `<div class="tiny muted">— ${esc(quote.author)}</div>` : ''}</div>` : ''}
    <div class="kpis">
      ${kpi('Net P&L', money(rep.net), rep.net)}
      ${kpi('Win rate', rep.winRate == null ? '—' : rep.winRate + '%')}
      ${kpi('Profit factor', rep.profitFactor == null ? '—' : String(rep.profitFactor))}
      ${kpi('Expectancy', money(rep.expectancy), rep.expectancy)}
      ${kpi('Avg R', rTxt(rep.avgR), rep.avgR)}
      ${kpi('Max drawdown', money(-(rep.maxDrawdown || 0)))}
    </div>
    <div class="grid-2">
      <div class="card"><h2>Equity</h2>${curveSvg(rep.curve)}</div>
      <div class="card"><h2>${acct ? esc(acct.name) : 'Accounts'}</h2>${acct ? propHtml(acct, prop) : state.accounts.map(a => {
        const p = math.propStatus(a, state.logs);
        return `<div class="row between" style="margin-bottom:8px"><span>${esc(a.name)}</span><b class="mono ${p.totalPnl < 0 ? 'neg' : 'pos'}">${money(p.totalPnl)}</b></div>`;
      }).join('') || '<div class="empty">No accounts yet.</div>'}</div>
    </div>
    <div class="card" style="margin-top:12px"><h2>Recent trades</h2>${tradeTable(logs.slice(0, 8))}</div>`;
  bindTradeRows(view);
}
function kpi(label, value, tone) {
  const cls = typeof tone === 'number' ? (tone > 0 ? 'pos' : tone < 0 ? 'neg' : '') : '';
  return `<div class="card kpi"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
}
function curveSvg(curve) {
  if (!curve || curve.length < 2) return `<div class="empty">The equity curve appears after two closed trades.</div>`;
  const w = 640, h = 180, p = 8;
  const min = Math.min(0, ...curve), max = Math.max(0, ...curve), span = max - min || 1;
  const x = i => p + i * (w - p * 2) / (curve.length - 1);
  const y = v => h - p - (v - min) * (h - p * 2) / span;
  const d = curve.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const col = curve[curve.length - 1] >= 0 ? 'var(--green)' : 'var(--red)';
  return `<svg class="curve" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="${col}" stroke-width="2"/></svg>`;
}
function propHtml(acct, prop) {
  const bar = (label, left, limit, bad) => {
    if (!limit) return '';
    const used = Math.max(0, Math.min(1, 1 - (left / limit)));
    return `<div style="margin:8px 0"><div class="row between tiny"><span>${label}</span><span class="mono">${money(left)} left</span></div><div class="meter ${bad || used > .8 ? 'warn' : 'ok'}"><span style="width:${Math.round(used * 100)}%"></span></div></div>`;
  };
  return `<div class="tiny muted">Equity ${money(prop.equity)}</div>
    ${bar('Daily loss', prop.dailyLeft, Number(acct.dailyLoss) || 0, prop.breachedDaily)}
    ${bar('Trailing drawdown', prop.ddLeft, Number(acct.trailingDrawdown) || 0, prop.breachedDrawdown)}
    ${acct.profitTarget ? `<div class="tiny">Profit target left <b class="mono">${money(prop.targetLeft)}</b></div>` : ''}
    ${acct.consistency ? `<div class="tiny">Best day ${prop.consistencyRatio == null ? '—' : Math.round(prop.consistencyRatio * 100) + '% of profits'} ${prop.consistencyOk === false ? '· over the consistency cap' : ''}</div>` : ''}`;
}

function tradeTable(logs) {
  if (!logs.length) return `<div class="empty">No trades yet. Press N to log one.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Account</th><th>Market</th><th>Side</th><th>Setup</th><th>Session</th><th class="num">P&L</th><th class="num">R</th></tr></thead><tbody>` +
    logs.map(l => `<tr class="click" data-id="${l.id}"><td class="mono">${esc(l.date)} ${esc(l.time || '')}</td><td>${esc(acctName(l.accountId))}</td><td class="mono">${esc(l.instrument)} ×${l.qty || 1}</td><td>${esc(l.direction)}</td><td>${esc(l.setup || '—')}</td><td>${esc(l.session || '')}</td><td class="num ${math.tradePnl(l) < 0 ? 'neg' : 'pos'}">${money(math.tradePnl(l))}</td><td class="num">${rTxt(math.tradeR(l))}</td></tr>`).join('') +
    `</tbody></table></div>`;
}
function bindTradeRows(root) {
  $$('tr.click', root).forEach(tr => tr.onclick = () => openTrade(tr.dataset.id));
}
function renderTrades(view) {
  const logs = filteredLogs();
  view.innerHTML = `<div class="page-head"><div><h1>Trades</h1><div class="sub">${logs.length} shown</div></div><button type="button" class="btn" id="exportBtn">Export CSV</button></div>
    <div class="filters"><input id="tradeQ" placeholder="Filter instrument, setup, notes" value="${esc(state.q)}"></div>
    ${tradeTable(logs)}`;
  $('#tradeQ').oninput = () => { state.q = $('#tradeQ').value.trim().toLowerCase(); renderTrades(view); };
  $('#exportBtn').onclick = exportCsv;
  bindTradeRows(view);
  if (state.detail) mountDetail(state.logs.find(l => l.id === state.detail));
}
function openTrade(id) {
  state.detail = id;
  if (state.page !== 'trades') { state.page = 'trades'; go('trades'); return; }
  mountDetail(state.logs.find(l => l.id === id));
}
function mountDetail(l) {
  $$('.drawer').forEach(n => n.remove());
  if (!l) return;
  const shots = (l.screenshots || []).map(n => `<img class="shot" src="gon://shots/${encodeURIComponent(n)}" alt="">`).join('');
  const el = document.createElement('aside');
  el.className = 'drawer';
  el.innerHTML = `<div class="row between"><h1 style="font-size:18px">${esc(l.instrument)} ${esc(l.direction)}</h1><button type="button" class="icon-btn" id="closeDetail">✕</button></div>
    <div class="sub">${esc(l.date)} ${esc(l.time || '')} · ${esc(acctName(l.accountId))}</div>
    <div class="kpis" style="grid-template-columns:1fr 1fr;margin-top:12px">${kpi('P&L', money(math.tradePnl(l)), math.tradePnl(l))}${kpi('R', rTxt(math.tradeR(l)), math.tradeR(l))}</div>
    <p>${fieldLine('Qty', l.qty || 1)} ${fieldLine('Entry', l.entry)} ${fieldLine('Exit', l.exit)} ${fieldLine('Stop', l.stop)} ${fieldLine('Target', l.target)}</p>
    <p>${fieldLine('Fees', l.fees)} ${fieldLine('MAE', l.mae)} ${fieldLine('MFE', l.mfe)} ${fieldLine('Session', l.session)} ${fieldLine('Confidence', l.confidence)}</p>
    <p><b>Setup</b> ${esc(l.setup || '—')}</p>
    <p><b>Mistakes</b> ${(l.mistakes || []).map(esc).join(', ') || '—'}</p>
    <p><b>Emotions</b> ${(l.emotions || []).map(esc).join(', ') || '—'}</p>
    <p>${esc(l.notes || '')}</p>
    ${shots}
    <div class="row" style="margin-top:12px"><button type="button" class="btn" id="editTrade">Edit</button><button type="button" class="btn danger" id="delTrade">Delete</button></div>`;
  document.body.appendChild(el);
  $('#closeDetail').onclick = () => { state.detail = null; el.remove(); };
  $('#editTrade').onclick = () => openTradeForm(l);
  $('#delTrade').onclick = async () => {
    await gon.logs.remove(l.id);
    state.logs = state.logs.filter(x => x.id !== l.id);
    state.detail = null;
    el.remove();
    go('trades');
    toast('Trade deleted');
  };
}
function fieldLine(k, v) { return `<span class="tiny muted">${k}</span> <span class="mono">${esc(v ?? '—')}</span> `; }

function openTradeForm(existing) {
  const l = existing || {};
  const accounts = state.accounts.map(a => `<option value="${esc(a.id)}" ${a.id === l.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const setups = state.playbook.map(p => `<option ${p.name === l.setup ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  $('#modal').hidden = false;
  $('#modal').innerHTML = `<div class="sheet"><div class="row between"><h1 style="font-size:18px">${existing ? 'Edit trade' : 'Log a trade'}</h1><button type="button" class="icon-btn" id="closeForm">✕</button></div>
    <div class="form-grid" style="margin-top:12px">
      <label class="f">Date<input id="fDate" type="date" value="${esc(l.date || math.todayKey())}"></label>
      <label class="f">Time<input id="fTime" type="time" value="${esc(l.time || '')}"></label>
      <label class="f">Account<select id="fAcct"><option value="">—</option>${accounts}</select></label>
      <label class="f">Instrument<input id="fInst" list="instList" value="${esc(l.instrument || 'MNQ')}"></label>
      <label class="f">Side<select id="fSide"><option ${l.direction === 'short' ? '' : 'selected'}>long</option><option ${l.direction === 'short' ? 'selected' : ''}>short</option></select></label>
      <label class="f">Contracts<input id="fQty" inputmode="decimal" value="${esc(l.qty ?? 1)}"></label>
      <label class="f">Entry<input id="fEntry" inputmode="decimal" value="${esc(l.entry ?? '')}"></label>
      <label class="f">Exit<input id="fExit" inputmode="decimal" value="${esc(l.exit ?? '')}"></label>
      <label class="f">Stop<input id="fStop" inputmode="decimal" value="${esc(l.stop ?? '')}"></label>
      <label class="f">Target<input id="fTarget" inputmode="decimal" value="${esc(l.target ?? '')}"></label>
      <label class="f">Fees<input id="fFees" inputmode="decimal" value="${esc(l.fees ?? '')}"></label>
      <label class="f">P&L override<input id="fPnl" inputmode="decimal" value="${esc(l.pnl ?? '')}" placeholder="Auto from prices"></label>
      <label class="f">MAE<input id="fMae" inputmode="decimal" value="${esc(l.mae ?? '')}"></label>
      <label class="f">MFE<input id="fMfe" inputmode="decimal" value="${esc(l.mfe ?? '')}"></label>
      <label class="f">Confidence<select id="fConf">${[1, 2, 3, 4, 5].map(n => `<option ${Number(l.confidence) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f">Setup<input id="fSetup" list="setupList" value="${esc(l.setup || '')}"></label>
    </div>
    <datalist id="instList">${['MNQ', 'MES', 'NQ', 'ES', 'MYM', 'YM', 'MGC', 'GC'].map(s => `<option value="${s}">`).join('')}</datalist>
    <datalist id="setupList">${setups}</datalist>
    <div class="chips" style="margin-top:10px" id="fMist">${MISTAKES.map(m => `<button type="button" data-m="${esc(m)}" class="${(l.mistakes || []).includes(m) ? 'on' : ''}">${esc(m)}</button>`).join('')}</div>
    <div class="chips" id="fEmo">${EMOTIONS.map(m => `<button type="button" data-e="${esc(m)}" class="${(l.emotions || []).includes(m) ? 'on' : ''}">${esc(m)}</button>`).join('')}</div>
    <label class="f" style="margin-top:8px">Notes<textarea id="fNotes" rows="3">${esc(l.notes || '')}</textarea></label>
    <div id="fPreview" class="tiny muted" style="margin-top:8px"></div>
    <div class="row" style="margin-top:12px"><button type="button" class="btn primary" id="saveTrade">Save</button><button type="button" class="btn ghost" id="cancelTrade">Cancel</button></div>
  </div>`;
  const preview = () => {
    const draft = readForm();
    const pnl = math.futuresPnl(draft);
    const r = math.rMultiple(draft);
    $('#fPreview').textContent = 'Auto P&L ' + (pnl == null ? '—' : money(pnl)) + ' · R ' + (r == null ? '—' : rTxt(r)) + (draft.session ? ' · ' + draft.session : '');
  };
  $$('#modal input, #modal select').forEach(el => el.oninput = preview);
  $$('#fMist button').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $$('#fEmo button').forEach(b => b.onclick = () => b.classList.toggle('on'));
  preview();
  const close = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
  $('#closeForm').onclick = close;
  $('#cancelTrade').onclick = close;
  $('#saveTrade').onclick = async () => {
    const draft = readForm();
    try {
      if (existing) {
        const saved = await gon.logs.update(existing.id, draft);
        state.logs = state.logs.map(x => x.id === saved.id ? saved : x);
      } else {
        const saved = await gon.logs.create(draft);
        state.logs.unshift(saved);
      }
      close();
      go('trades');
      toast('Trade saved');
    } catch (err) { toast(err.message || String(err)); }
  };
}
function readForm() {
  const mistakes = $$('#fMist button.on').map(b => b.dataset.m);
  const emotions = $$('#fEmo button.on').map(b => b.dataset.e);
  const pnlRaw = $('#fPnl').value.trim();
  return {
    date: $('#fDate').value, time: $('#fTime').value, accountId: $('#fAcct').value, instrument: $('#fInst').value.trim(),
    direction: $('#fSide').value, qty: $('#fQty').value, entry: $('#fEntry').value, exit: $('#fExit').value,
    stop: $('#fStop').value, target: $('#fTarget').value, fees: $('#fFees').value, mae: $('#fMae').value, mfe: $('#fMfe').value,
    confidence: $('#fConf').value, setup: $('#fSetup').value.trim(), notes: $('#fNotes').value, mistakes, emotions,
    pnl: pnlRaw, followedPlan: mistakes.length ? false : null, rulesBroken: mistakes,
  };
}

function renderAnalytics(view) {
  const rep = math.report(filteredLogs());
  const block = (title, rows) => `<div class="card"><h2>${title}</h2>${rows.length ? `<table>${rows.slice(0, 8).map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.trades}</td><td class="num ${r.pnl < 0 ? 'neg' : 'pos'}">${money(r.pnl)}</td></tr>`).join('')}</table>` : '<div class="empty">No data</div>'}</div>`;
  view.innerHTML = `<div class="page-head"><div><h1>Analytics</h1><div class="sub">Where the money is made and given back</div></div></div>
    <div class="kpis">
      ${kpi('Profit factor', rep.profitFactor == null ? '—' : String(rep.profitFactor))}
      ${kpi('Expectancy', money(rep.expectancy), rep.expectancy)}
      ${kpi('Avg win', money(rep.avgWin), 1)}
      ${kpi('Avg loss', money(rep.avgLoss), -1)}
      ${kpi('Largest win', money(rep.largestWin), 1)}
      ${kpi('Largest loss', money(rep.largestLoss), -1)}
    </div>
    <div class="grid-3">
      ${block('By setup', rep.bySetup)}
      ${block('By market', rep.byInstrument)}
      ${block('By session', rep.bySession)}
      ${block('By weekday', rep.byWeekday)}
      ${block('By hour', rep.byHour)}
      ${block('Cost of mistakes', rep.byMistake)}
    </div>`;
}

function renderCalendar(view) {
  const logs = filteredLogs();
  const cursor = state.cal || new Date();
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const label = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const first = new Date(y, m, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const by = {};
  for (const l of logs) {
    const p = math.tradePnl(l);
    by[l.date] = by[l.date] || { pnl: 0, n: 0 };
    if (p != null) by[l.date].pnl += p;
    by[l.date].n++;
  }
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = math.todayKey(d);
    const cell = by[key];
    const recap = state.recaps.some(r => r.date === key);
    const on = state.day === key ? ' on' : '';
    cells += `<button type="button" class="day${on}" data-date="${key}"><div class="n">${d.getDate()}${recap ? ' ●' : ''}</div>${cell ? `<div class="mono ${cell.pnl < 0 ? 'neg' : 'pos'}">${money(cell.pnl)}</div>` : ''}</button>`;
  }
  const dayLogs = state.day ? logs.filter(l => l.date === state.day) : [];
  const dayRecaps = state.day ? state.recaps.filter(r => r.date === state.day) : [];
  view.innerHTML = `<div class="page-head"><div><h1>Calendar</h1><div class="sub">Daily net and video recaps</div></div>
    <div class="row"><button type="button" class="btn sm" id="calPrev">←</button><b>${label}</b><button type="button" class="btn sm" id="calNext">→</button></div></div>
    <div class="cal">${cells}</div>
    <div id="dayPanel" style="margin-top:14px">${state.day ? dayPanel(state.day, dayLogs, dayRecaps) : ''}</div>`;
  $('#calPrev').onclick = () => { state.cal = new Date(y, m - 1, 1); renderCalendar(view); };
  $('#calNext').onclick = () => { state.cal = new Date(y, m + 1, 1); renderCalendar(view); };
  $$('.day', view).forEach(b => b.onclick = () => { state.day = b.dataset.date; renderCalendar(view); });
  const add = $('#addRecap');
  if (add) add.onclick = () => addRecap(state.day);
}
function dayPanel(date, logs, recaps) {
  const net = math.report(logs).net;
  const videos = recaps.map(r => {
    let src = '';
    try { if (r.file) src = recapFileUrl(r.date, r.file); } catch (e) { src = ''; }
    const media = src ? `<video class="player" controls src="${esc(src)}"></video>` : (r.url ? `<a href="${esc(r.url)}">${esc(r.url)}</a>` : '');
    return `<div class="card" style="margin-top:8px"><b>${esc(r.title || 'Recap')}</b>${media}</div>`;
  }).join('');
  return `<div class="card"><div class="row between"><h2>${esc(date)} · ${money(net)}</h2><button type="button" class="btn sm" id="addRecap">Add recap</button></div>
    ${logs.map(l => `<div class="row between"><span class="mono">${esc(l.instrument)} ${esc(l.direction)}</span><span class="${math.tradePnl(l) < 0 ? 'neg' : 'pos'}">${money(math.tradePnl(l))}</span></div>`).join('') || '<div class="tiny muted">No trades</div>'}
    ${videos}</div>`;
}
async function addRecap(date) {
  const paths = await gon.recap.pick();
  if (!paths || !paths.length) return;
  state.recaps = await gon.recap.add({ date, srcPaths: paths });
  go('calendar');
  toast('Recap added');
}

function renderPlaybook(view) {
  const cards = state.playbook.map(p => {
    const logs = filteredLogs().filter(l => (l.setup || '').toLowerCase() === p.name.toLowerCase());
    const rep = math.report(logs);
    return `<div class="card"><div class="row between"><h2>${esc(p.name)}</h2><button type="button" class="btn sm" data-edit="${esc(p.id)}">Edit</button></div>
      <div class="tiny muted">${logs.length} trades · ${money(rep.net)} · win ${rep.winRate == null ? '—' : rep.winRate + '%'}</div>
      <p>${esc(p.notes || '')}</p>
      <ul>${(p.rules || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
  }).join('');
  view.innerHTML = `<div class="page-head"><div><h1>Playbook</h1><div class="sub">Setups and the stats behind them</div></div><button type="button" class="btn primary" id="addPlay">New setup</button></div><div class="grid-2">${cards}</div>`;
  $('#addPlay').onclick = () => editPlay(null);
  $$('[data-edit]', view).forEach(b => b.onclick = () => editPlay(state.playbook.find(p => p.id === b.dataset.edit)));
}
function editPlay(existing) {
  const p = existing || { name: '', notes: '', rules: [] };
  $('#modal').hidden = false;
  $('#modal').innerHTML = `<div class="sheet"><h1 style="font-size:18px">${existing ? 'Edit setup' : 'New setup'}</h1>
    <label class="f">Name<input id="pName" value="${esc(p.name)}"></label>
    <label class="f">Rules, one per line<textarea id="pRules" rows="5">${esc((p.rules || []).join('\n'))}</textarea></label>
    <label class="f">Notes<textarea id="pNotes" rows="3">${esc(p.notes || '')}</textarea></label>
    <div class="row" style="margin-top:10px"><button type="button" class="btn primary" id="pSave">Save</button><button type="button" class="btn ghost" id="pCancel">Cancel</button>${existing ? '<button type="button" class="btn danger" id="pDel">Delete</button>' : ''}</div></div>`;
  const close = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
  $('#pCancel').onclick = close;
  $('#pSave').onclick = async () => {
    const saved = await gon.playbook.save({ id: existing && existing.id, name: $('#pName').value, rules: $('#pRules').value, notes: $('#pNotes').value });
    const i = state.playbook.findIndex(x => x.id === saved.id);
    if (i >= 0) state.playbook[i] = saved; else state.playbook.push(saved);
    close(); go('playbook');
  };
  const del = $('#pDel');
  if (del) del.onclick = async () => { state.playbook = await gon.playbook.remove(existing.id); close(); go('playbook'); };
}

function renderJournal(view) {
  const date = state.journalDate || math.todayKey();
  const day = state.days.find(d => d.date === date) || { date };
  const logs = filteredLogs().filter(l => l.date === date);
  view.innerHTML = `<div class="page-head"><div><h1>Daily journal</h1><div class="sub">Plan, then review</div></div><input id="jDate" type="date" value="${esc(date)}" style="width:auto"></div>
    <div class="grid-2">
      <div class="card"><h2>Pre-market</h2>
        <label class="f">Bias<textarea id="jBias" rows="3">${esc(day.bias || '')}</textarea></label>
        <label class="f">Key levels<textarea id="jLevels" rows="3">${esc(day.levels || '')}</textarea></label>
        <label class="f">News<textarea id="jNews" rows="2">${esc(day.news || '')}</textarea></label>
      </div>
      <div class="card"><h2>Review</h2>
        <label class="f">What happened<textarea id="jReview" rows="4">${esc(day.review || '')}</textarea></label>
        <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
          <label class="f">Mood<select id="jMood">${scoreOpts(day.mood)}</select></label>
          <label class="f">Sleep<select id="jSleep">${scoreOpts(day.sleep)}</select></label>
          <label class="f">Discipline<select id="jDisc">${scoreOpts(day.discipline)}</select></label>
          <label class="f">Grade<select id="jGrade">${['', 'A', 'B', 'C', 'D', 'F'].map(g => `<option ${day.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        </div>
        <div class="tiny muted" style="margin-top:8px">${logs.length} trades · ${money(math.report(logs).net)}</div>
        <button type="button" class="btn primary" id="jSave" style="margin-top:10px">Save day</button>
      </div>
    </div>`;
  $('#jDate').onchange = () => { state.journalDate = $('#jDate').value; renderJournal(view); };
  $('#jSave').onclick = async () => {
    const saved = await gon.days.save({
      date: $('#jDate').value, bias: $('#jBias').value, levels: $('#jLevels').value, news: $('#jNews').value,
      review: $('#jReview').value, mood: $('#jMood').value, sleep: $('#jSleep').value, discipline: $('#jDisc').value, grade: $('#jGrade').value,
    });
    state.days = state.days.filter(d => d.date !== saved.date).concat(saved);
    toast('Day saved');
  };
}
function scoreOpts(cur) {
  return ['', 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${String(cur || '') === String(n) ? 'selected' : ''}>${n || '—'}</option>`).join('');
}

function renderEducation(view) {
  const mentors = state.settings?.eduMentors || [];
  view.innerHTML = `<div class="page-head"><div><h1>Education</h1><div class="sub">Lessons by mentor</div></div><button type="button" class="btn primary" id="eduAdd">Add video</button></div>
    <div class="grid-3">${state.education.map(v => `<button type="button" class="card" data-edu="${v.id}" style="text-align:left"><div class="tiny">${esc(v.mentor || 'Unsorted')}</div><b>${esc(v.title)}</b><div class="tiny muted">${esc(v.date || '')}</div></button>`).join('') || '<div class="empty">No lessons yet.</div>'}</div>`;
  $('#eduAdd').onclick = () => eduForm(null);
  $$('[data-edu]', view).forEach(b => b.onclick = () => eduForm(state.education.find(v => v.id === b.dataset.edu)));
}
function eduForm(existing) {
  const v = existing || {};
  const opts = (state.settings.eduMentors || []).map(m => `<option ${m.name === v.mentor ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  $('#modal').hidden = false;
  $('#modal').innerHTML = `<div class="sheet"><h1 style="font-size:18px">${existing ? 'Lesson' : 'Add a lesson'}</h1>
    <label class="f">Title<input id="eTitle" value="${esc(v.title || '')}"></label>
    <label class="f">Mentor<select id="eMentor"><option value="">Unsorted</option>${opts}</select></label>
    <label class="f">Link<input id="eUrl" value="${esc(v.url || '')}" placeholder="https://"></label>
    <div class="row"><button type="button" class="btn sm" id="ePick">Choose a video file</button><span class="tiny muted" id="eFile">${v.file ? 'File attached' : ''}</span></div>
    <label class="f">Notes<textarea id="eNotes" rows="3">${esc(v.notes || '')}</textarea></label>
    <div class="row" style="margin-top:8px"><button class="btn primary" id="eSave" type="button">Save</button><button class="btn ghost" id="eCancel" type="button">Cancel</button></div></div>`;
  let src = null;
  const close = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
  $('#eCancel').onclick = close;
  $('#ePick').onclick = async () => { src = await gon.edu.pick(); if (src) $('#eFile').textContent = src.split(/[/\\]/).pop(); };
  $('#eSave').onclick = async () => {
    const payload = { title: $('#eTitle').value, mentor: $('#eMentor').value, url: $('#eUrl').value, notes: $('#eNotes').value, date: math.todayKey() };
    try {
      let saved;
      if (existing) saved = await gon.edu.update(existing.id, payload);
      else { if (src) payload.srcPath = src; saved = await gon.edu.create(payload); }
      state.education = existing ? state.education.map(x => x.id === saved.id ? saved : x) : [saved, ...state.education];
      close(); go('education');
    } catch (err) { toast(err.message || String(err)); }
  };
}

function renderMotivation(view) {
  view.innerHTML = `<div class="page-head"><div><h1>Motivation</h1><div class="sub">Quotes and videos</div></div>
    <div class="row"><button type="button" class="btn" id="addQuote">Quote</button><button type="button" class="btn primary" id="addVid">Video</button></div></div>
    <div class="grid-3">${state.motivation.map(m => `<div class="card"><div>${m.kind === 'quote' ? esc(m.text) : esc(m.title)}</div><div class="tiny muted">${m.author ? '— ' + esc(m.author) : esc(m.kind)}${m.pinned ? ' · pinned' : ''}</div>
      <button type="button" class="btn sm" data-pin="${m.id}">${m.pinned ? 'Unpin' : 'Pin'}</button></div>`).join('') || '<div class="empty">Nothing saved yet.</div>'}</div>`;
  $('#addQuote').onclick = () => motiveForm('quote');
  $('#addVid').onclick = () => motiveForm('video');
  $$('[data-pin]', view).forEach(b => b.onclick = async () => {
    const m = state.motivation.find(x => x.id === b.dataset.pin);
    const saved = await gon.motivation.update(m.id, { pinned: !m.pinned });
    state.motivation = state.motivation.map(x => x.id === saved.id ? saved : x);
    go('motivation');
  });
}
function motiveForm(kind) {
  $('#modal').hidden = false;
  $('#modal').innerHTML = `<div class="sheet"><h1 style="font-size:18px">${kind === 'quote' ? 'New quote' : 'New video'}</h1>
    ${kind === 'quote' ? '<label class="f">Quote<textarea id="mText" rows="3"></textarea></label><label class="f">Author<input id="mAuthor"></label>' : '<label class="f">Title<input id="mTitle"></label><label class="f">Link<input id="mUrl" placeholder="https://"></label><button type="button" class="btn sm" id="mPick">Choose a file</button>'}
    <div class="row" style="margin-top:8px"><button class="btn primary" id="mSave" type="button">Save</button><button class="btn ghost" id="mCancel" type="button">Cancel</button></div></div>`;
  let src = null;
  const close = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
  $('#mCancel').onclick = close;
  const pick = $('#mPick');
  if (pick) pick.onclick = async () => { src = await gon.motivation.pick(); };
  $('#mSave').onclick = async () => {
    const payload = kind === 'quote'
      ? { kind, text: $('#mText').value, author: $('#mAuthor').value, pinned: false }
      : { kind, title: $('#mTitle').value || 'Video', url: $('#mUrl').value, pinned: false };
    try {
      if (src) payload.srcPath = src;
      const saved = await gon.motivation.create(payload);
      state.motivation.push(saved);
      close(); go('motivation');
    } catch (err) { toast(err.message || String(err)); }
  };
}

function renderAccounts(view) {
  const cards = state.accounts.map(a => {
    const prop = math.propStatus(a, state.logs);
    return `<div class="card"><div class="row between"><h2>${esc(a.name)}</h2><span class="tiny muted">${esc(a.broker || a.kind)}</span></div>
      ${propHtml(a, prop)}
      <div class="form-grid" style="margin-top:8px">
        <label class="f">Balance<input data-k="balance" data-id="${a.id}" value="${a.balance}"></label>
        <label class="f">Daily loss<input data-k="dailyLoss" data-id="${a.id}" value="${a.dailyLoss || ''}"></label>
        <label class="f">Trailing DD<input data-k="trailingDrawdown" data-id="${a.id}" value="${a.trailingDrawdown || ''}"></label>
        <label class="f">Profit target<input data-k="profitTarget" data-id="${a.id}" value="${a.profitTarget || ''}"></label>
        <label class="f">Consistency (0-1)<input data-k="consistency" data-id="${a.id}" value="${a.consistency || ''}"></label>
      </div>
      <button type="button" class="btn sm" data-save="${a.id}" style="margin-top:8px">Save</button>
    </div>`;
  }).join('');
  view.innerHTML = `<div class="page-head"><div><h1>Accounts</h1><div class="sub">Prop rules and personal balances</div></div><button type="button" class="btn primary" id="addAcct">Add account</button></div><div class="grid-2">${cards}</div>`;
  $$('[data-save]', view).forEach(b => b.onclick = async () => {
    const id = b.dataset.save;
    const acct = { ...state.accounts.find(a => a.id === id) };
    $$('[data-id="' + id + '"]', view).forEach(input => { acct[input.dataset.k] = input.value; });
    const saved = await gon.accounts.save(acct);
    state.accounts = state.accounts.map(a => a.id === saved.id ? saved : a);
    toast('Account saved');
    go('accounts');
  });
  $('#addAcct').onclick = async () => {
    const saved = await gon.accounts.save({ name: 'New account', kind: 'personal', balance: 0 });
    state.accounts.push(saved);
    go('accounts');
  };
}

const SAMPLE_CSV = 'date,time,symbol,side,qty,entry price,exit price,pnl,fees,setup\n2026-11-10,09:35,MNQ,Buy,2,21450.00,21470.00,76,4,GxT\n2026-11-10,13:05,MES,Sell,1,5800,5792,38,2.5,Accurate Trades\n';
function renderImport(view) {
  if (!state.importText) state.importText = SAMPLE_CSV;
  const parsed = math.parseCsv(state.importText);
  if (!state.importMap) state.importMap = math.suggestMap(parsed.headers);
  const fields = math.CSV_FIELDS.map(f => `<label class="f">${f}<select data-map="${f}">${[''].concat(parsed.headers).map(h => `<option ${state.importMap[f] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('');
  const preview = parsed.rows.slice(0, 4).map(r => `<tr>${parsed.headers.slice(0, 6).map(h => `<td>${esc(r[h])}</td>`).join('')}</tr>`).join('');
  view.innerHTML = `<div class="page-head"><div><h1>Import</h1><div class="sub">Tradovate or TopstepX CSV. Map the columns, then import. Existing trades stay.</div></div>
    <div class="row"><button type="button" class="btn" id="csvOpen">Open CSV</button><button type="button" class="btn primary" id="csvGo">Import rows</button></div></div>
    <label class="f">Account<select id="csvAcct">${state.accounts.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>
    <div class="form-grid">${fields}</div>
    <div class="table-wrap" style="margin-top:12px"><table><thead><tr>${parsed.headers.slice(0, 6).map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${preview}</tbody></table></div>
    <label class="f" style="margin-top:12px">CSV<textarea id="csvText" rows="6">${esc(state.importText)}</textarea></label>`;
  $$('[data-map]', view).forEach(sel => sel.onchange = () => { state.importMap[sel.dataset.map] = sel.value; });
  $('#csvText').onchange = () => { state.importText = $('#csvText').value; state.importMap = null; renderImport(view); };
  $('#csvOpen').onclick = async () => {
    const text = await gon.csv.open();
    if (!text) return;
    state.importText = text;
    state.importMap = null;
    renderImport(view);
  };
  $('#csvGo').onclick = async () => {
    const parsedNow = math.parseCsv($('#csvText').value);
    const map = {};
    $$('[data-map]').forEach(sel => map[sel.dataset.map] = sel.value);
    const { trades, errors } = math.applyCsvMap(parsedNow.rows, map, $('#csvAcct').value);
    let n = 0;
    for (const t of trades) {
      try { const saved = await gon.logs.create(t); state.logs.unshift(saved); n++; }
      catch (err) { console.log('[import]', err && err.message || err); }
    }
    toast('Imported ' + n + ' trades' + (errors.length ? ' · ' + errors.length + ' skipped' : ''));
    go('trades');
  };
}

function renderSettings(view) {
  const s = state.settings || { profile: {}, themeSong: {}, goals: {}, rules: [] };
  view.innerHTML = `<div class="page-head"><div><h1>Settings</h1><div class="sub">Stored on this computer</div></div></div>
    <div class="grid-2">
      <div class="card"><h2>Profile</h2>
        <label class="f">Name<input id="sName" value="${esc(s.profile.name || '')}"></label>
        <label class="f">Handle<input id="sHandle" value="${esc(s.profile.handle || '')}"></label>
        <label class="f">Account label<input id="sAcct" value="${esc(s.profile.account || '')}"></label>
        <label class="f">Max trades / day<input id="sMax" inputmode="decimal" value="${esc(s.goals.maxTrades || 3)}"></label>
      </div>
      <div class="card"><h2>Rules</h2>
        <label class="f">One per line<textarea id="sRules" rows="6">${esc((s.rules || []).join('\n'))}</textarea></label>
        <h2 style="margin-top:12px">Theme song</h2>
        <label class="row"><input type="checkbox" id="sSong" ${s.themeSong.enabled !== false ? 'checked' : ''}> Play when the app opens</label>
        <div class="tiny muted" id="songName">${esc(s.themeSong.name || 'No file. A short chime plays instead.')}</div>
        <div class="row"><button type="button" class="btn sm" id="pickSong">Choose audio</button><button type="button" class="btn sm ghost" id="clearSong">Remove</button></div>
      </div>
    </div>
    <div class="row" style="margin-top:12px"><button type="button" class="btn primary" id="saveSettings">Save</button><button type="button" class="btn" id="openData">Open data folder</button><span class="tiny muted" id="ver"></span></div>`;
  $('#saveSettings').onclick = async () => {
    state.settings = await gon.settings.save({
      profile: { name: $('#sName').value.trim(), handle: $('#sHandle').value.trim(), account: $('#sAcct').value.trim() },
      rules: $('#sRules').value.split('\n'),
      goals: { maxTrades: $('#sMax').value },
      themeSong: { enabled: $('#sSong').checked },
    });
    toast('Saved');
  };
  $('#pickSong').onclick = async () => { const s2 = await gon.song.pick(); if (s2) { state.settings = s2; toast('Theme song saved'); go('settings'); } };
  $('#clearSong').onclick = async () => { state.settings = await gon.song.clear(); go('settings'); };
  $('#openData').onclick = () => gon.app.openDataDir();
  gon.app.version().then(v => { const el = $('#ver'); if (el) el.textContent = 'v' + v; }).catch(() => {});
}

async function exportCsv() {
  const ok = await gon.csv.save(math.toCsv(filteredLogs()));
  if (ok) toast('Exported');
}

function openPalette() {
  const items = PAGES.map(([id, label]) => ({ id, label })).concat([
    { id: 'new', label: 'Log a trade' },
    { id: 'theme', label: 'Toggle light and dark' },
    { id: 'import', label: 'Import CSV' },
  ]);
  $('#palette').hidden = false;
  const draw = () => {
    const q = $('#paletteQ').value.trim().toLowerCase();
    const list = items.filter(i => i.label.toLowerCase().includes(q));
    $('#paletteList').innerHTML = list.map((i, n) => `<button type="button" data-id="${i.id}" class="${n === 0 ? 'on' : ''}">${esc(i.label)}</button>`).join('');
    $$('#paletteList button').forEach(b => b.onclick = () => runPalette(b.dataset.id));
  };
  $('#paletteQ').value = '';
  $('#paletteQ').oninput = draw;
  $('#paletteQ').onkeydown = (e) => {
    if (e.key === 'Enter') { const first = $('#paletteList button'); if (first) runPalette(first.dataset.id); }
    if (e.key === 'Escape') closePalette();
  };
  draw();
  $('#paletteQ').focus();
}
function closePalette() { $('#palette').hidden = true; }
function runPalette(id) {
  closePalette();
  if (id === 'new') openTradeForm(null);
  else if (id === 'theme') toggleTheme();
  else go(id);
}
async function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  state.settings = await gon.settings.save({ theme: next });
}
function applyTheme(choice) {
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function playOpenSong() {
  try {
    const song = state.settings && state.settings.themeSong;
    if (!song || song.enabled === false) return;
    let url = '';
    if (song.file && typeof themeSongFileUrl === 'function') {
      try { url = themeSongFileUrl(song.file); } catch (e) { console.log('[theme-song]', e.message || e); url = ''; }
    }
    if (url) {
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, Number(song.volume) || 0.7));
      audio.play().catch(err => console.log('[theme-song]', err && err.name));
      return;
    }
    const ctx = new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 660; o.type = 'sine'; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.start(); o.stop(ctx.currentTime + 0.5);
  } catch (err) { console.log('[theme-song]', err && err.message || err); }
}
function paintSession() {
  try {
    if (typeof tradingSessions !== 'function') return;
    const status = tradingSessions(new Date());
    const names = status.sessions.filter(s => s.active).map(s => s.name);
    const el = $('#topSession');
    if (el) el.textContent = status.closed ? 'Market closed' : (names.join(' · ') || 'Between sessions');
  } catch (err) { console.log('[clock]', err && err.message || err); }
}

$('#newTradeBtn').onclick = () => openTradeForm(null);
$('#themeBtn').onclick = toggleTheme;
$('#searchBtn').onclick = () => { state.q = ''; go('trades'); const q = $('#tradeQ'); if (q) q.focus(); };
$('#acctBtn').onclick = () => {
  const ids = ['all', ...state.accounts.map(a => a.id)];
  const i = ids.indexOf(state.accountId);
  state.accountId = ids[(i + 1) % ids.length];
  go(state.page);
};
$('#palette').addEventListener('click', (e) => { if (e.target.id === 'palette') closePalette(); });
document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); gon.app.minimize(); return; }
  if (e.key === 'Escape') {
    if (!$('#palette').hidden) { closePalette(); return; }
    if (!$('#modal').hidden) { $('#modal').hidden = true; $('#modal').innerHTML = ''; return; }
    if (state.detail) { state.detail = null; $$('.drawer').forEach(n => n.remove()); return; }
    gon.app.minimize();
    return;
  }
  if (typing) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openTradeForm(null); }
  if (e.key === '/') { e.preventDefault(); $('#searchBtn').click(); }
});

window.cj = {
  go,
  openFirst() { const id = state.logs[0] && state.logs[0].id; if (id) openTrade(id); },
  openForm() { openTradeForm(null); },
};

(async function boot() {
  try {
    state.settings = await gon.settings.get();
    applyTheme(state.settings.theme || 'dark');
    const [logs, accounts, playbook, days, education, motivation, recaps] = await Promise.all([
      gon.logs.list(), gon.accounts.list(), gon.playbook.list(), gon.days.list(), gon.edu.list(), gon.motivation.list(), gon.recap.list(),
    ]);
    state.logs = logs; state.accounts = accounts; state.playbook = playbook; state.days = days;
    state.education = education; state.motivation = motivation; state.recaps = recaps;
    gon.app.version().then(v => { const el = $('#sideVer'); if (el) el.textContent = 'v' + v; }).catch(() => {});
    gon.updater.onStatus(s => { state.update = s; const pill = $('#updatePill'); if (pill) pill.hidden = s.status !== 'ready'; });
    gon.updater.state().then(s => { if (s && s.status === 'ready') $('#updatePill').hidden = false; }).catch(() => {});
    $('#updateRestart').onclick = () => { if (state.update.status === 'ready') gon.updater.install(); };
    paintSession();
    setInterval(paintSession, 30000);
    playOpenSong();
    go(params.get('tab') || 'home');
  } catch (err) {
    console.log('[renderer] boot', err && err.stack || err);
    $('#view').innerHTML = `<div class="empty">The journal could not finish opening. The error was logged. Your files were not deleted.</div>`;
  }
})();
