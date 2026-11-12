'use strict';
// Pure helpers for the theme song. The stored file name is always a safe id
// plus a lowercase extension, so the playback URL never contains spaces,
// apostrophes, backslashes, #, or %.

const AUDIO_EXTS = ['.mp3', '.m4a', '.wav', '.ogg'];

function audioExtension(srcPath) {
  const norm = String(srcPath || '').replace(/\\/g, '/');
  const base = norm.slice(norm.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot).toLowerCase() : '';
}

function safeStoredAudioName(id, srcPath) {
  const ext = audioExtension(srcPath);
  if (!AUDIO_EXTS.includes(ext)) throw new Error('unsupported file type ' + (ext || '(none)'));
  const cleanId = String(id || '').replace(/[^A-Za-z0-9-]/g, '');
  if (!cleanId) throw new Error('bad id');
  return cleanId + ext;
}

function themeSongFileUrl(fileName) {
  const norm = String(fileName || '').replace(/\\/g, '/');
  const base = norm.slice(norm.lastIndexOf('/') + 1);
  let decoded = base;
  try { decoded = decodeURIComponent(base); } catch (e) { throw new Error('unsafe media name'); }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(decoded) || decoded.includes('..')) throw new Error('unsafe media name');
  const ext = audioExtension(decoded);
  if (!AUDIO_EXTS.includes(ext)) throw new Error('unsupported file type ' + ext);
  const safe = decoded.slice(0, -ext.length) + ext;
  return 'journal-media://theme/' + encodeURIComponent(safe);
}

const mediaPathApi = { AUDIO_EXTS, audioExtension, safeStoredAudioName, themeSongFileUrl };
if (typeof module !== 'undefined' && module.exports) module.exports = mediaPathApi;
if (typeof window !== 'undefined') Object.assign(window, mediaPathApi);
