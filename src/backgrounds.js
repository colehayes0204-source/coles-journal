'use strict';
// Start-screen library: which background to show, and what to try if it fails.
// Loaded as its own classic script. Does not declare a global named `api`.

let mediaPath = null;
try { if (typeof require === 'function') mediaPath = require('./media-path'); } catch (e) { mediaPath = null; }

const BG_SPEEDS = [0.25, 0.5, 0.75, 1];

const DEFAULT_BACKGROUND = {
  id: 'default',
  builtin: true,
  kind: 'video',
  file: '',
  name: 'Dock',
  enabled: true,
  speed: 0.5,
};

function bgUrl(file) {
  const fn = (mediaPath && mediaPath.backgroundFileUrl) || (typeof backgroundFileUrl === 'function' ? backgroundFileUrl : null);
  if (!fn) throw new Error('background url unavailable');
  return fn(file);
}

function normalizeSpeed(value) {
  const n = Number(value);
  return BG_SPEEDS.includes(n) ? n : 0.5;
}

function normalizeBackgroundItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.builtin === true || raw.id === 'default') {
    return {
      id: 'default',
      builtin: true,
      kind: 'video',
      file: '',
      name: 'Dock',
      enabled: raw.enabled !== false,
      speed: normalizeSpeed(raw.speed),
    };
  }
  const id = String(raw.id || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(id)) return null;
  const file = String(raw.file || '');
  let kind = '';
  let safe = '';
  try {
    const url = bgUrl(file);
    safe = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));
    kind = (mediaPath && mediaPath.backgroundKind) ? mediaPath.backgroundKind(safe) : backgroundKind(safe);
  } catch (e) {
    return null;
  }
  if (kind !== 'image' && kind !== 'video') return null;
  return {
    id,
    builtin: false,
    kind,
    file: safe,
    name: String(raw.name || safe).slice(0, 180),
    enabled: raw.enabled !== false,
    speed: normalizeSpeed(raw.speed),
  };
}

function normalizeLibrary(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const items = [];
  const push = (item) => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };
  const list = Array.isArray(src.items) ? src.items : [];
  const savedDefault = list.find(i => i && (i.builtin || i.id === 'default')) || {};
  push(normalizeBackgroundItem({ ...savedDefault, id: 'default', builtin: true }));
  if (Array.isArray(src.items)) {
    for (const item of src.items) push(normalizeBackgroundItem(item));
  }
  if (!items.length) push({ ...DEFAULT_BACKGROUND });
  const mode = src.mode === 'selected' ? 'selected' : 'random';
  const fit = src.fit === 'fit' ? 'fit' : 'fill';
  const selectedId = items.some(i => i.id === src.selectedId) ? src.selectedId : 'default';
  const lastId = items.some(i => i.id === src.lastId) ? src.lastId : '';
  return { mode, fit, selectedId, lastId, items };
}

function enabledItems(lib) {
  return lib.items.filter(i => i.enabled);
}

function pickFrom(list, rng) {
  const random = typeof rng === 'function' ? rng : Math.random;
  const idx = Math.min(list.length - 1, Math.max(0, Math.floor(random() * list.length)));
  return list[idx];
}

function pickStartBackground(library, rng) {
  const lib = normalizeLibrary(library);
  const enabled = enabledItems(lib);
  const pool = enabled.length ? enabled : lib.items.filter(i => i.builtin);
  const fallback = pool[0] || lib.items[0];
  if (lib.mode === 'selected') return pool.find(i => i.id === lib.selectedId) || fallback;
  let choices = pool;
  if (pool.length >= 2 && lib.lastId) {
    const rest = pool.filter(i => i.id !== lib.lastId);
    if (rest.length) choices = rest;
  }
  return pickFrom(choices, rng);
}

function nextShuffleBackground(library, currentId, rng) {
  const lib = normalizeLibrary(library);
  const enabled = enabledItems(lib);
  const pool = enabled.length ? enabled : lib.items.filter(i => i.builtin);
  if (!pool.length) return lib.items[0];
  const rest = pool.filter(i => i.id !== currentId);
  return pickFrom(rest.length ? rest : pool, rng);
}

function fallbackChain(library, chosen) {
  const lib = normalizeLibrary(library);
  const out = [];
  const push = (item) => {
    const norm = normalizeBackgroundItem(item);
    if (!norm || out.some(i => i.id === norm.id)) return;
    out.push(norm);
  };
  push(chosen);
  for (const item of lib.items) if (item.enabled && !item.builtin) push(item);
  push(lib.items.find(i => i.builtin));
  return out;
}

const backgroundsApi = {
  BG_SPEEDS,
  DEFAULT_BACKGROUND,
  normalizeSpeed,
  normalizeLibrary,
  pickStartBackground,
  nextShuffleBackground,
  fallbackChain,
};
if (typeof module !== 'undefined' && module.exports) module.exports = backgroundsApi;
if (typeof window !== 'undefined') window.backgroundsApi = backgroundsApi;
