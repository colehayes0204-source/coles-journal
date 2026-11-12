'use strict';
// Futures session clock in America/New_York, including DST.
// Asia 19:00–04:00, London 03:00–11:30, New York 08:00–17:00.
// CME-style close: Friday 17:00 ET through Sunday 18:00 ET.

const TZ = 'America/New_York';
const SESSIONS = [
  { id: 'asia', name: 'Asia', start: 19 * 3600, end: 4 * 3600 },
  { id: 'london', name: 'London', start: 3 * 3600, end: 11 * 3600 + 30 * 60 },
  { id: 'ny', name: 'New York', start: 8 * 3600, end: 17 * 3600 },
];
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function pad(n) { return String(n).padStart(2, '0'); }

function zoneParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of dtf.formatToParts(date)) if (part.type !== 'literal') p[part.type] = part.value;
  let hour = Number(p.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour, minute: Number(p.minute), second: Number(p.second),
    dow: WEEKDAYS[p.weekday],
    sec: hour * 3600 + Number(p.minute) * 60 + Number(p.second),
  };
}

// Milliseconds to add to a UTC timestamp so its UTC fields match the zone's wall clock.
function zoneOffsetMs(date, timeZone) {
  const p = zoneParts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

function zonedTime(year, month, day, hour, minute, second, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let date = new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
  const again = zoneOffsetMs(date, timeZone);
  date = new Date(guess - again);
  return date;
}

function addCalendarDays(year, month, day, days) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function atSeconds(parts, targetSec, addDays) {
  const date = addCalendarDays(parts.year, parts.month, parts.day, addDays);
  const hour = Math.floor(targetSec / 3600);
  const minute = Math.floor((targetSec % 3600) / 60);
  const second = targetSec % 60;
  return zonedTime(date.year, date.month, date.day, hour, minute, second, TZ);
}

function sessionActive(sec, session) {
  if (session.start > session.end) return sec >= session.start || sec < session.end;
  return sec >= session.start && sec < session.end;
}

function marketClosed(parts) {
  if (parts.dow === 6) return true;
  if (parts.dow === 0 && parts.sec < 18 * 3600) return true;
  if (parts.dow === 5 && parts.sec >= 17 * 3600) return true;
  return false;
}

function nextSundayOpen(parts) {
  let add = (7 - parts.dow) % 7;
  if (parts.dow === 0 && parts.sec >= 18 * 3600) add = 7;
  return atSeconds(parts, 18 * 3600, add);
}

function nextSessionInstant(parts, session, kind) {
  const target = kind === 'close' ? session.end : session.start;
  const addDays = target <= parts.sec ? 1 : 0;
  return atSeconds(parts, target, addDays);
}

function formatCountdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + pad(sec) + 's';
  return sec + 's';
}

function phraseFor(next, countdownMs) {
  const left = formatCountdown(countdownMs);
  if (next.kind === 'market') return 'Market opens in ' + left;
  return next.name + (next.kind === 'close' ? ' closes' : ' opens') + ' in ' + left;
}

function tradingSessions(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const parts = zoneParts(date, TZ);
  const closed = marketClosed(parts);
  const sessions = SESSIONS.map(s => ({ id: s.id, name: s.name, active: !closed && sessionActive(parts.sec, s) }));
  let next;
  if (closed) next = { kind: 'market', name: 'Market', at: nextSundayOpen(parts) };
  else {
    const events = [];
    for (const s of SESSIONS) {
      const active = sessionActive(parts.sec, s);
      events.push({ kind: active ? 'close' : 'open', id: s.id, name: s.name, at: nextSessionInstant(parts, s, active ? 'close' : 'open') });
    }
    events.sort((a, b) => a.at - b.at);
    next = events[0];
  }
  const countdownMs = Math.max(0, next.at.getTime() - date.getTime());
  return {
    closed,
    timezone: TZ,
    sessions,
    active: sessions.filter(s => s.active).map(s => s.id),
    next: { kind: next.kind, id: next.id || null, name: next.name, at: next.at.toISOString() },
    countdownMs,
    phrase: phraseFor(next, countdownMs),
  };
}

const sessionsApi = { tradingSessions, formatCountdown, SESSIONS, TZ };
if (typeof module !== 'undefined' && module.exports) module.exports = sessionsApi;
if (typeof window !== 'undefined') window.tradingSessions = tradingSessions;
