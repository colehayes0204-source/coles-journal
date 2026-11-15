'use strict';
// Futures journal math: point values, P&L, prop-firm distance, reports, CSV maps.
// No Electron. Loaded in the page as journalMathApi (not `api`).

const POINT_VALUE = {
  MNQ: 2, NQ: 20, MES: 5, ES: 50, MYM: 0.5, YM: 5, MGC: 10, GC: 100,
  M2K: 5, RTY: 50, MCL: 100, CL: 1000,
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pointValue(instrument) {
  const k = String(instrument || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(POINT_VALUE, k) ? POINT_VALUE[k] : null;
}

function tradeSign(direction) {
  return direction === 'short' ? -1 : 1;
}

function futuresPnl(trade) {
  const pv = pointValue(trade.instrument);
  const entry = num(trade.entry);
  const exit = num(trade.exit);
  if (pv == null || entry == null || exit == null) return null;
  const qty = num(trade.qty) == null ? 1 : num(trade.qty);
  const fees = num(trade.fees) || 0;
  return round2((exit - entry) * tradeSign(trade.direction) * pv * qty - fees);
}

function rMultiple(trade) {
  const entry = num(trade.entry);
  const stop = num(trade.stop);
  const exit = num(trade.exit);
  if (entry == null || stop == null || exit == null) return null;
  const risk = Math.abs(entry - stop);
  if (!risk) return null;
  return round2((exit - entry) * tradeSign(trade.direction) / risk);
}

function riskDollars(trade) {
  const pv = pointValue(trade.instrument);
  const entry = num(trade.entry);
  const stop = num(trade.stop);
  if (pv == null || entry == null || stop == null) return null;
  const qty = num(trade.qty) == null ? 1 : num(trade.qty);
  return round2(Math.abs(entry - stop) * pv * qty);
}

function sessionFromTime(time) {
  const m = String(time || '').match(/^(\d{1,2})/);
  if (!m) return '';
  const h = Number(m[1]);
  if (h >= 19 || h < 3) return 'Asia';
  if (h < 8) return 'London';
  if (h < 12) return 'NY AM';
  if (h < 17) return 'NY PM';
  return 'After hours';
}

function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function tradePnl(trade) {
  const computed = futuresPnl(trade);
  if (computed != null) return computed;
  return num(trade.pnl);
}

function tradeR(trade) {
  const computed = rMultiple(trade);
  if (computed != null) return computed;
  return num(trade.resultR);
}

function dayKey(log) {
  return log.date || '';
}

function sum(list, fn) {
  return round2(list.reduce((s, x) => s + (fn(x) || 0), 0));
}

function maxDrawdown(pnls) {
  let equity = 0, peak = 0, dd = 0;
  for (const p of pnls) {
    equity = round2(equity + p);
    if (equity > peak) peak = equity;
    dd = Math.min(dd, round2(equity - peak));
  }
  return { maxDrawdown: round2(Math.abs(dd)), equity: round2(equity), peak: round2(peak) };
}

function chrono(logs) {
  return logs.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) || (a.createdAt || 0) - (b.createdAt || 0));
}

function report(logs) {
  const rows = logs.map(l => ({ ...l, _pnl: tradePnl(l), _r: tradeR(l) }));
  const withP = rows.filter(l => l._pnl != null);
  const wins = withP.filter(l => l._pnl > 0);
  const losses = withP.filter(l => l._pnl < 0);
  const grossWin = sum(wins, l => l._pnl);
  const grossLoss = Math.abs(sum(losses, l => l._pnl));
  const decided = wins.length + losses.length;
  const net = sum(withP, l => l._pnl);
  const rs = rows.map(l => l._r).filter(v => v != null);
  const curve = [];
  let acc = 0;
  for (const l of chrono(withP)) { acc = round2(acc + l._pnl); curve.push(acc); }
  const dd = maxDrawdown(chrono(withP).map(l => l._pnl));
  let streak = 0, streakType = null;
  for (let i = chrono(withP).length - 1; i >= 0; i--) {
    const t = chrono(withP)[i]._pnl > 0 ? 'W' : chrono(withP)[i]._pnl < 0 ? 'L' : null;
    if (!t) continue;
    if (!streakType) streakType = t;
    if (t !== streakType) break;
    streak++;
  }
  return {
    count: rows.length,
    decided,
    wins: wins.length,
    losses: losses.length,
    winRate: decided ? round2(100 * wins.length / decided) : null,
    net,
    profitFactor: grossLoss ? round2(grossWin / grossLoss) : (grossWin ? null : 0),
    expectancy: withP.length ? round2(net / withP.length) : null,
    avgWin: wins.length ? round2(grossWin / wins.length) : null,
    avgLoss: losses.length ? round2(-grossLoss / losses.length) : null,
    largestWin: wins.length ? round2(Math.max(...wins.map(l => l._pnl))) : null,
    largestLoss: losses.length ? round2(Math.min(...losses.map(l => l._pnl))) : null,
    avgR: rs.length ? round2(rs.reduce((s, n) => s + n, 0) / rs.length) : null,
    netR: rs.length ? round2(rs.reduce((s, n) => s + n, 0)) : null,
    maxDrawdown: dd.maxDrawdown,
    streak, streakType,
    curve,
    bySetup: group(rows, l => l.setup || 'Untagged'),
    byInstrument: group(rows, l => l.instrument || '—'),
    bySession: group(rows, l => l.session || sessionFromTime(l.time) || 'Unknown'),
    byDirection: group(rows, l => l.direction || '—'),
    byWeekday: group(rows, l => weekday(l.date)),
    byHour: group(rows, l => hourLabel(l.time)),
    byMistake: mistakeGroup(rows),
  };
}

function group(rows, keyFn) {
  const map = new Map();
  for (const l of rows) {
    const k = keyFn(l) || '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(l);
  }
  return [...map.entries()].map(([name, list]) => {
    const pnl = sum(list, l => tradePnl(l));
    const wins = list.filter(l => tradePnl(l) > 0).length;
    const decided = list.filter(l => tradePnl(l) != null && tradePnl(l) !== 0).length;
    return { name, trades: list.length, pnl, winRate: decided ? round2(100 * wins / decided) : null };
  }).sort((a, b) => b.pnl - a.pnl);
}

function mistakeGroup(rows) {
  const map = new Map();
  for (const l of rows) {
    const tags = Array.isArray(l.mistakes) ? l.mistakes : [];
    for (const tag of tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(l);
    }
  }
  return [...map.entries()].map(([name, list]) => ({
    name, trades: list.length, pnl: sum(list, l => tradePnl(l)),
  })).sort((a, b) => a.pnl - b.pnl);
}

function weekday(date) {
  if (!date) return '—';
  const d = new Date(date + 'T12:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}
function hourLabel(time) {
  const m = String(time || '').match(/^(\d{1,2})/);
  return m ? String(Number(m[1])).padStart(2, '0') + ':00' : '—';
}

function propStatus(account, logs) {
  const mine = logs.filter(l => !account || !l.accountId || l.accountId === account.id);
  const ordered = chrono(mine);
  const start = num(account.balance) || 0;
  let equity = start, peak = start;
  const trail = num(account.trailingDrawdown) || 0;
  for (const l of ordered) {
    const p = tradePnl(l);
    if (p == null) continue;
    equity = round2(equity + p);
    if (equity > peak) peak = equity;
  }
  const floor = trail ? round2(peak - trail) : null;
  const today = todayKey();
  const todayPnl = sum(mine.filter(l => l.date === today), l => tradePnl(l));
  const dailyLimit = num(account.dailyLoss);
  const dailyLeft = dailyLimit ? round2(dailyLimit + Math.min(0, todayPnl)) : null;
  const ddLeft = floor == null ? null : round2(equity - floor);
  const totalPnl = round2(equity - start);
  const target = num(account.profitTarget);
  const targetLeft = target ? round2(Math.max(0, target - totalPnl)) : null;
  const byDay = new Map();
  for (const l of mine) {
    const p = tradePnl(l);
    if (p == null) continue;
    byDay.set(l.date, round2((byDay.get(l.date) || 0) + p));
  }
  let bestDay = 0;
  for (const v of byDay.values()) if (v > bestDay) bestDay = v;
  const consistencyCap = num(account.consistency);
  const consistencyRatio = totalPnl > 0 ? round2(bestDay / totalPnl) : null;
  const consistencyOk = consistencyCap && consistencyRatio != null ? consistencyRatio <= consistencyCap : null;
  return {
    equity, peak, floor, totalPnl, todayPnl, dailyLeft, ddLeft, targetLeft,
    bestDay: round2(bestDay), consistencyRatio, consistencyOk,
    breachedDaily: dailyLimit ? todayPnl <= -dailyLimit : false,
    breachedDrawdown: floor != null ? equity <= floor : false,
  };
}

function todayKey(date = new Date()) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(x => String(x).trim()));
  if (!clean.length) return { headers: [], rows: [] };
  const headers = clean[0].map(h => String(h).trim());
  const body = clean.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] == null ? '' : String(r[i]).trim(); });
    return o;
  });
  return { headers, rows: body };
}

const CSV_FIELDS = ['date', 'time', 'instrument', 'direction', 'qty', 'entry', 'exit', 'stop', 'target', 'pnl', 'fees', 'setup', 'notes'];

function suggestMap(headers) {
  const alias = {
    date: ['date', 'trade date', 'tradedate', 'day', 'closed', 'close date', 'exit time'],
    time: ['time', 'open time', 'entry time', 'opened', 'fill time'],
    instrument: ['symbol', 'contract', 'product', 'instrument', 'market'],
    direction: ['side', 'b/s', 'buy/sell', 'buysell', 'direction', 'type'],
    qty: ['qty', 'quantity', 'size', 'contracts', 'filled qty', 'volume'],
    entry: ['entry', 'entry price', 'avg entry', 'open price', 'buy price'],
    exit: ['exit', 'exit price', 'avg exit', 'close price', 'sell price'],
    stop: ['stop', 'stop price'],
    target: ['target', 'target price'],
    pnl: ['pnl', 'p&l', 'profit', 'net pnl', 'net p&l', 'pl', 'net profit'],
    fees: ['fees', 'fee', 'commission', 'commissions'],
    setup: ['setup', 'strategy', 'playbook', 'tag'],
    notes: ['notes', 'note', 'comment', 'comments'],
  };
  const map = {};
  const norm = headers.map(h => String(h).trim().toLowerCase());
  for (const field of CSV_FIELDS) {
    const names = alias[field] || [];
    const idx = norm.findIndex(h => names.includes(h));
    map[field] = idx >= 0 ? headers[idx] : '';
  }
  return map;
}

function normalizeSide(value) {
  const s = String(value || '').trim().toLowerCase();
  if (['buy', 'b', 'long', 'l'].includes(s)) return 'long';
  if (['sell', 's', 'short'].includes(s)) return 'short';
  return '';
}

function applyCsvMap(rows, map, accountId) {
  const out = [];
  const errors = [];
  rows.forEach((row, i) => {
    const get = (field) => {
      const col = map[field];
      return col ? row[col] : '';
    };
    let date = String(get('date') || '').trim() || todayKey();
    const timeRaw = String(get('time') || '').trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]/.test(date) && !timeRaw) {
      const [d, t] = date.split(/[ T]/);
      date = d;
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
      const [m, d, y] = date.split('/');
      date = y + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0');
    }
    const direction = normalizeSide(get('direction'));
    const instrument = String(get('instrument') || '').trim().toUpperCase();
    if (!date || !instrument || !direction) {
      errors.push('Row ' + (i + 2) + ' needs a date, symbol, and side');
      return;
    }
    let time = timeRaw;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d/.test(timeRaw)) time = timeRaw.split(/[ T]/)[1].slice(0, 5);
    else if (time.length >= 5) time = time.slice(0, 5);
    out.push({
      date, time, instrument, direction, accountId: accountId || '',
      qty: get('qty'), entry: get('entry'), exit: get('exit'), stop: get('stop'), target: get('target'),
      pnl: get('pnl'), fees: get('fees'), setup: get('setup'), notes: get('notes'),
    });
  });
  return { trades: out, errors };
}

function toCsv(logs) {
  const cols = ['date', 'time', 'accountId', 'instrument', 'direction', 'qty', 'entry', 'exit', 'stop', 'target', 'fees', 'pnl', 'resultR', 'session', 'setup', 'mistakes', 'emotions', 'notes'];
  const esc = (v) => {
    const s = Array.isArray(v) ? v.join('; ') : (v == null ? '' : String(v));
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(',')].concat(logs.map(l => cols.map(c => esc(l[c])).join(','))).join('\n') + '\n';
}

const journalMathApi = {
  POINT_VALUE, pointValue, futuresPnl, rMultiple, riskDollars, sessionFromTime,
  tradePnl, tradeR, report, propStatus, parseCsv, suggestMap, applyCsvMap, toCsv, CSV_FIELDS, todayKey,
};
if (typeof module !== 'undefined' && module.exports) module.exports = journalMathApi;
if (typeof window !== 'undefined') window.journalMathApi = journalMathApi;
