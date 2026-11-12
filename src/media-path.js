'use strict';
// Pure helpers for the theme song. The stored file name is always a safe id
// plus a lowercase extension, so the playback URL never contains spaces,
// apostrophes, backslashes, #, or %.

const AUDIO_EXTS = ['.mp3', '.m4a', '.wav', '.ogg'];
const BG_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const BG_VIDEO_EXTS = ['.mp4', '.webm', '.mov'];

function audioExtension(srcPath) {
  const norm = String(srcPath || '').replace(/\\/g, '/');
  const base = norm.slice(norm.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot).toLowerCase() : '';
}

function safeMediaBase(fileName) {
  const norm = String(fileName || '').replace(/\\/g, '/');
  const base = norm.slice(norm.lastIndexOf('/') + 1);
  let decoded = base;
  try { decoded = decodeURIComponent(base); } catch (e) { throw new Error('unsafe media name'); }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(decoded) || decoded.includes('..')) throw new Error('unsafe media name');
  return decoded;
}

function safeStoredAudioName(id, srcPath) {
  const ext = audioExtension(srcPath);
  if (!AUDIO_EXTS.includes(ext)) throw new Error('unsupported file type ' + (ext || '(none)'));
  const cleanId = String(id || '').replace(/[^A-Za-z0-9-]/g, '');
  if (!cleanId) throw new Error('bad id');
  return cleanId + ext;
}

function themeSongFileUrl(fileName) {
  const decoded = safeMediaBase(fileName);
  const ext = audioExtension(decoded);
  if (!AUDIO_EXTS.includes(ext)) throw new Error('unsupported file type ' + ext);
  const safe = decoded.slice(0, -ext.length) + ext;
  return 'journal-media://theme/' + encodeURIComponent(safe);
}

function backgroundKind(srcPath) {
  const ext = audioExtension(srcPath);
  if (BG_VIDEO_EXTS.includes(ext)) return 'video';
  if (BG_IMAGE_EXTS.includes(ext)) return 'image';
  return '';
}

function safeStoredBackgroundName(id, srcPath) {
  const ext = audioExtension(srcPath);
  if (!backgroundKind(srcPath)) throw new Error('unsupported file type ' + (ext || '(none)'));
  const cleanId = String(id || '').replace(/[^A-Za-z0-9-]/g, '');
  if (!cleanId) throw new Error('bad id');
  return cleanId + ext;
}

function backgroundFileUrl(fileName) {
  const decoded = safeMediaBase(fileName);
  const ext = audioExtension(decoded);
  if (!backgroundKind(decoded)) throw new Error('unsupported file type ' + ext);
  const safe = decoded.slice(0, -ext.length) + ext;
  return 'journal-media://bg/' + encodeURIComponent(safe);
}

const mediaPathApi = {
  AUDIO_EXTS, BG_IMAGE_EXTS, BG_VIDEO_EXTS,
  audioExtension, safeStoredAudioName, themeSongFileUrl,
  backgroundKind, safeStoredBackgroundName, backgroundFileUrl,
};
if (typeof module !== 'undefined' && module.exports) module.exports = mediaPathApi;
if (typeof window !== 'undefined') Object.assign(window, mediaPathApi);
