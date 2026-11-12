'use strict';
// Local JSON store for trade logs, settings and the mentor cache.
// Pure Node (no Electron imports) so it can be unit-tested headless.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SETTINGS = {
  profile: { name: 'Cole', handle: 'colehys', account: 'Tradovate $1,000', startBalance: 1000 },
  mentors: [],            // ["handle1", "handle2"] (no @)
  pollMinutes: 15,
  bearerToken: '',
  splash: true,
  rules: [
    'No revenge trading.',
    'No trading without a setup.',
    'If invalidated or stopped out, no re-entry until a higher-timeframe candle close confirms (reversals: only re-enter on continuation higher).',
    'For continuation, wait for an extreme to be hit before trading the reversal. No re-entering off of nothing.',
  ],
};

const NUM_FIELDS = ['entry', 'stop', 'target', 'resultR', 'pnl'];

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // atomic replace
}
function toNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.shotsDir = path.join(dir, 'screenshots');
    this.mediaDir = path.join(dir, 'mentor-media');
    this.logsFile = path.join(dir, 'logs.json');
    this.settingsFile = path.join(dir, 'settings.json');
    this.cacheFile = path.join(dir, 'mentor-cache.json');
    fs.mkdirSync(this.shotsDir, { recursive: true });
    fs.mkdirSync(this.mediaDir, { recursive: true });
  }

  // ---------- settings ----------
  getSettings() {
    const s = readJSON(this.settingsFile, {});
    return { ...DEFAULT_SETTINGS, ...s, profile: { ...DEFAULT_SETTINGS.profile, ...(s.profile || {}) } };
  }
  saveSettings(patch) {
    const cur = this.getSettings();
    const next = { ...cur, ...patch };
    if (patch.profile) next.profile = { ...cur.profile, ...patch.profile };
    if (patch.mentors) next.mentors = normalizeHandles(patch.mentors);
    if (patch.rules) next.rules = patch.rules.map(r => String(r).trim()).filter(Boolean).slice(0, 30);
    next.pollMinutes = Math.max(1, Math.min(1440, Number(next.pollMinutes) || 15));
    next.bearerToken = String(next.bearerToken || '').trim();
    writeJSON(this.settingsFile, next);
    return next;
  }

  // ---------- trade logs ----------
  listLogs() {
    const logs = readJSON(this.logsFile, []);
    return logs.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || b.createdAt - a.createdAt);
  }
  getLog(id) { return this.listLogs().find(l => l.id === id) || null; }

  validate(input) {
    const errors = [];
    if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.push('date must be YYYY-MM-DD');
    if (!input.instrument || !String(input.instrument).trim()) errors.push('instrument is required');
    if (!['long', 'short'].includes(input.direction)) errors.push('direction must be long or short');
    for (const f of NUM_FIELDS) {
      if (input[f] !== undefined && input[f] !== '' && input[f] !== null && toNum(input[f]) === null) errors.push(f + ' must be a number');
    }
    return errors;
  }

  _clean(input) {
    const o = {
      date: input.date,
      time: input.time || '',
      instrument: String(input.instrument || '').trim().toUpperCase(),
      direction: input.direction,
      setup: String(input.setup || '').trim(),
      notes: String(input.notes || ''),
      mindset: String(input.mindset || ''),
      followedPlan: input.followedPlan === undefined || input.followedPlan === null ? null : !!input.followedPlan,
      rulesBroken: Array.isArray(input.rulesBroken) ? input.rulesBroken.map(String) : [],
      emotions: Array.isArray(input.emotions) ? input.emotions.map(String) : [],
      screenshots: Array.isArray(input.screenshots) ? input.screenshots.slice() : [],
    };
    for (const f of NUM_FIELDS) o[f] = toNum(input[f]);
    return o;
  }

  createLog(input) {
    const errors = this.validate(input);
    if (errors.length) throw new Error(errors.join('; '));
    const logs = readJSON(this.logsFile, []);
    const now = Date.now();
    const log = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...this._clean(input) };
    logs.push(log);
    writeJSON(this.logsFile, logs);
    return log;
  }

  updateLog(id, input) {
    const logs = readJSON(this.logsFile, []);
    const i = logs.findIndex(l => l.id === id);
    if (i < 0) throw new Error('log not found: ' + id);
    const merged = { ...logs[i], ...input };
    const errors = this.validate(merged);
    if (errors.length) throw new Error(errors.join('; '));
    // delete screenshot files that were removed from the log
    const kept = new Set(merged.screenshots || []);
    for (const s of logs[i].screenshots || []) if (!kept.has(s)) this._rmShot(s);
    logs[i] = { ...logs[i], ...this._clean(merged), updatedAt: Date.now() };
    writeJSON(this.logsFile, logs);
    return logs[i];
  }

  deleteLog(id) {
    const logs = readJSON(this.logsFile, []);
    const log = logs.find(l => l.id === id);
    if (!log) return false;
    for (const s of log.screenshots || []) this._rmShot(s);
    writeJSON(this.logsFile, logs.filter(l => l.id !== id));
    return true;
  }

  // Copy an image from anywhere on disk into app data; returns the stored file name.
  importScreenshot(srcPath) {
    const ext = (path.extname(srcPath) || '.png').toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) throw new Error('unsupported image type ' + ext);
    const name = crypto.randomUUID() + ext;
    fs.copyFileSync(srcPath, path.join(this.shotsDir, name));
    return name;
  }
  shotPath(name) { return path.join(this.shotsDir, path.basename(name)); }
  _rmShot(name) { try { fs.unlinkSync(this.shotPath(name)); } catch {} }

  // ---------- mentor cache ----------
  getMentorCache() { return readJSON(this.cacheFile, { users: {}, posts: [], status: {} }); }
  saveMentorCache(c) { writeJSON(this.cacheFile, c); }
}

function normalizeHandles(list) {
  const arr = Array.isArray(list) ? list : String(list).split(/[\s,]+/);
  const out = [];
  for (let h of arr) {
    h = String(h).trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').split(/[/?]/)[0];
    if (/^[A-Za-z0-9_]{1,15}$/.test(h) && !out.some(o => o.toLowerCase() === h.toLowerCase())) out.push(h);
  }
  return out;
}

// ---------- stats (shared with renderer via IPC) ----------
function computeStats(logs, today = new Date()) {
  const withR = logs.filter(l => typeof l.resultR === 'number');
  const wins = withR.filter(l => l.resultR > 0).length;
  const losses = withR.filter(l => l.resultR < 0).length;
  const totalR = round(withR.reduce((s, l) => s + l.resultR, 0));
  const totalPnl = round(logs.reduce((s, l) => s + (typeof l.pnl === 'number' ? l.pnl : 0), 0));
  const decided = wins + losses;
  // streak from most recent (logs are newest-first)
  const chrono = withR.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) || a.createdAt - b.createdAt);
  let streak = 0, streakType = null;
  for (let i = chrono.length - 1; i >= 0; i--) {
    const t = chrono[i].resultR > 0 ? 'W' : chrono[i].resultR < 0 ? 'L' : null;
    if (t === null) continue;           // breakevens don't break or extend a streak
    if (!streakType) streakType = t;
    if (t !== streakType) break;
    streak++;
  }
  let cum = 0;
  const curve = chrono.map(l => (cum = round(cum + l.resultR)));
  const todayStr = ymd(today);
  const todays = withR.filter(l => l.date === todayStr);
  return {
    count: logs.length, wins, losses, breakeven: withR.length - decided,
    winRate: decided ? round((wins / decided) * 100, 1) : null,
    totalR, totalPnl,
    avgR: withR.length ? round(totalR / withR.length) : null,
    streak, streakType, curve,
    todayR: round(todays.reduce((s, l) => s + l.resultR, 0)), todayCount: todays.length,
    rules: computeRuleStreak(logs),
  };
}
// Rule-following streak over logged trading days (newest first).
// A day is "kept" when every trade that day has followedPlan === true, "broken" if any is false.
// Days whose trades never answered the rules question are ignored (they neither extend nor break).
function computeRuleStreak(logs) {
  const days = {};
  for (const l of logs) {
    if (l.followedPlan === null || l.followedPlan === undefined) continue;
    const d = days[l.date] = days[l.date] || { date: l.date, kept: true, trades: 0 };
    d.trades++; if (l.followedPlan === false) d.kept = false;
  }
  const list = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
  let best = 0, run = 0;
  for (const d of list) { run = d.kept ? run + 1 : 0; best = Math.max(best, run); }
  let current = 0;
  for (let i = list.length - 1; i >= 0 && list[i].kept; i--) current++;
  const byDate = Object.fromEntries(list.map(d => [d.date, d.kept]));
  return { current, best, days: list.slice(-14), byDate, lastBroken: (list.filter(d => !d.kept).pop() || {}).date || null };
}
function round(n, d = 2) { const p = 10 ** d; return Math.round(n * p) / p; }
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

module.exports = { Store, computeStats, computeRuleStreak, normalizeHandles, DEFAULT_SETTINGS };
