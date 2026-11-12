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
  theme: 'light', // light | dark | system
  themeSong: { enabled: true, volume: 0.7, file: '', name: '' },
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
    this.eduFile = path.join(dir, 'education.json');
    this.videosDir = path.join(dir, 'videos');
    this.thumbsDir = path.join(dir, 'thumbs');
    this.songDir = path.join(dir, 'theme-song');
    fs.mkdirSync(this.shotsDir, { recursive: true });
    fs.mkdirSync(this.mediaDir, { recursive: true });
    fs.mkdirSync(this.videosDir, { recursive: true });
    fs.mkdirSync(this.thumbsDir, { recursive: true });
    fs.mkdirSync(this.songDir, { recursive: true });
  }

  // ---------- settings ----------
  getSettings() {
    const s = readJSON(this.settingsFile, {});
    return {
      ...DEFAULT_SETTINGS, ...s,
      profile: { ...DEFAULT_SETTINGS.profile, ...(s.profile || {}) },
      themeSong: { ...DEFAULT_SETTINGS.themeSong, ...(s.themeSong || {}) },
    };
  }
  saveSettings(patch) {
    const cur = this.getSettings();
    const next = { ...cur, ...patch };
    if (patch.profile) next.profile = { ...cur.profile, ...patch.profile };
    if (patch.mentors) next.mentors = normalizeHandles(patch.mentors);
    if (patch.rules) next.rules = patch.rules.map(r => String(r).trim()).filter(Boolean).slice(0, 30);
    if (patch.themeSong) {
      const song = { ...cur.themeSong, ...patch.themeSong };
      song.volume = Math.max(0, Math.min(1, Number(song.volume)));
      if (!Number.isFinite(song.volume)) song.volume = 0.7;
      song.enabled = song.enabled !== false;
      song.file = String(song.file || '');
      song.name = String(song.name || '');
      next.themeSong = song;
    }
    if (patch.theme) next.theme = ['light', 'dark', 'system'].includes(patch.theme) ? patch.theme : cur.theme || 'light';
    next.pollMinutes = Math.max(1, Math.min(1440, Number(next.pollMinutes) || 15));
    next.bearerToken = String(next.bearerToken || '').trim();
    writeJSON(this.settingsFile, next);
    return next;
  }

  importThemeSong(srcPath) {
    const prev = this.getSettings().themeSong || {};
    if (prev.file) this._rmFile(this.songDir, prev.file);
    const file = this._importFile(srcPath, this.songDir, ['.mp3', '.m4a', '.wav', '.ogg']);
    return this.saveSettings({ themeSong: { file, name: path.basename(srcPath), enabled: true } });
  }
  clearThemeSong() {
    const prev = this.getSettings().themeSong || {};
    if (prev.file) this._rmFile(this.songDir, prev.file);
    return this.saveSettings({ themeSong: { file: '', name: '' } });
  }
  songPath(name) { return path.join(this.songDir, path.basename(name || '')); }

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

  // ---------- education videos ----------
  listEducation() {
    const items = readJSON(this.eduFile, []);
    return items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  }
  createEducation(input) {
    const items = readJSON(this.eduFile, []);
    const now = Date.now();
    const item = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...this._cleanEdu(input) };
    items.push(item);
    writeJSON(this.eduFile, items);
    return item;
  }
  updateEducation(id, patch) {
    const items = readJSON(this.eduFile, []);
    const i = items.findIndex(x => x.id === id);
    if (i < 0) throw new Error('video not found: ' + id);
    const prev = items[i];
    const next = this._cleanEdu({ ...prev, ...patch });
    if (prev.thumb && prev.thumb !== next.thumb) this._rmFile(this.thumbsDir, prev.thumb);
    if (prev.file && prev.file !== next.file) this._rmFile(this.videosDir, prev.file);
    items[i] = { ...prev, ...next, updatedAt: Date.now() };
    writeJSON(this.eduFile, items);
    return items[i];
  }
  deleteEducation(id) {
    const items = readJSON(this.eduFile, []);
    const item = items.find(x => x.id === id);
    if (!item) return false;
    if (item.file) this._rmFile(this.videosDir, item.file);
    if (item.thumb) this._rmFile(this.thumbsDir, item.thumb);
    writeJSON(this.eduFile, items.filter(x => x.id !== id));
    return true;
  }
  _cleanEdu(input) {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('title is required');
    const url = String(input.url || '').trim();
    const file = path.basename(String(input.file || '').trim());
    if (!url && !file) throw new Error('a video file or URL is required');
    if (url && !/^https:\/\//i.test(url)) throw new Error('URL must start with https://');
    const tags = (Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(/[,#]/))
      .map(t => String(t).trim().replace(/^#/, '')).filter(Boolean).slice(0, 12);
    const stamps = (Array.isArray(input.stamps) ? input.stamps : []).slice(0, 40).map(s => ({
      t: String(s.t || '').trim().slice(0, 16),
      note: String(s.note || '').trim().slice(0, 500),
    })).filter(s => s.t || s.note);
    let date = String(input.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = ymd(new Date());
    return {
      title: title.slice(0, 160),
      mentor: String(input.mentor || '').trim().replace(/^@/, '').slice(0, 40),
      tags, date,
      notes: String(input.notes || '').slice(0, 8000),
      stamps, url, file,
      thumb: path.basename(String(input.thumb || '').trim()),
      watched: !!input.watched,
    };
  }
  importVideo(srcPath) {
    return this._importFile(srcPath, this.videosDir, ['.mp4', '.webm', '.ogg', '.mov', '.m4v', '.mkv']);
  }
  saveThumbBuffer(buf, ext) {
    const name = crypto.randomUUID() + (ext || '.jpg');
    fs.writeFileSync(path.join(this.thumbsDir, name), buf);
    return name;
  }
  saveThumbDataUrl(dataUrl) {
    const m = String(dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!m) throw new Error('bad thumbnail');
    const ext = m[1] === 'png' ? '.png' : m[1] === 'webp' ? '.webp' : '.jpg';
    return this.saveThumbBuffer(Buffer.from(m[2], 'base64'), ext);
  }
  videoPath(name) { return path.join(this.videosDir, path.basename(name || '')); }
  thumbPath(name) { return path.join(this.thumbsDir, path.basename(name || '')); }

  _importFile(srcPath, dir, exts) {
    const ext = (path.extname(srcPath) || '').toLowerCase();
    if (!exts.includes(ext)) throw new Error('unsupported file type ' + ext);
    if (!fs.existsSync(srcPath)) throw new Error('file not found');
    const name = crypto.randomUUID() + ext;
    fs.copyFileSync(srcPath, path.join(dir, name));
    return name;
  }
  _rmFile(dir, name) { try { fs.unlinkSync(path.join(dir, path.basename(name))); } catch {} }
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

// Monthly P&L calendar. `month` is 1-12. Weeks start Monday.
// Week and month totals include only days inside the month, so the weeks add up to the month.
function computePnlCalendar(logs, year, month) {
  const byDate = {};
  for (const l of logs || []) {
    if (!l || !/^\d{4}-\d{2}-\d{2}$/.test(l.date || '')) continue;
    const cell = byDate[l.date] = byDate[l.date] || { pnl: 0, r: 0, trades: 0 };
    cell.trades++;
    if (typeof l.pnl === 'number') cell.pnl = round(cell.pnl + l.pnl);
    if (typeof l.resultR === 'number') cell.r = round(cell.r + l.resultR);
  }
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const weeks = [];
  let winDays = 0, lossDays = 0, flatDays = 0, monthPnl = 0, monthR = 0;
  for (let w = 0; w < 6; w++) {
    const days = [];
    let weekPnl = 0, weekR = 0, weekTrades = 0, anyInMonth = false;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      const key = ymd(d);
      const cell = byDate[key] || { pnl: 0, r: 0, trades: 0 };
      const inMonth = d.getFullYear() === year && d.getMonth() === month - 1;
      if (inMonth) {
        anyInMonth = true;
        if (cell.trades) {
          monthPnl = round(monthPnl + cell.pnl);
          monthR = round(monthR + cell.r);
          weekPnl = round(weekPnl + cell.pnl);
          weekR = round(weekR + cell.r);
          weekTrades += cell.trades;
          if (cell.pnl > 0) winDays++;
          else if (cell.pnl < 0) lossDays++;
          else flatDays++;
        }
      }
      days.push({
        date: key, inMonth, day: d.getDate(),
        pnl: cell.trades ? cell.pnl : 0,
        r: cell.trades ? cell.r : 0,
        trades: cell.trades,
      });
    }
    if (anyInMonth) weeks.push({ days, totalPnl: weekPnl, totalR: weekR, trades: weekTrades });
  }
  return { year, month, weeks, monthPnl, monthR, winDays, lossDays, flatDays };
}

function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}

module.exports = { Store, computeStats, computeRuleStreak, computePnlCalendar, normalizeHandles, youtubeId, DEFAULT_SETTINGS };
