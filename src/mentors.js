'use strict';
// Mentor feed: official X API v2 only (no scraping).
//   1. GET /2/users/by/username/:handle            -> user id (cached forever, so it's billed once)
//   2. GET /2/users/:id/tweets?expansions=attachments.media_keys
//        &media.fields=url,preview_image_url,type&tweet.fields=created_at,attachments
//        &exclude=retweets,replies&since_id=<newest cached>
// Only posts that carry at least one photo (or video/GIF preview image) are kept.
// `fetchImpl` and `download` are injectable so the code path can be tested with mocks.
const path = require('path');
const fs = require('fs');

const API = 'https://api.x.com/2';
const FIRST_PULL = 20;      // first fetch per mentor (each returned post is billed)
const MAX_POSTS_PER_MENTOR = 60;

class RateLimitError extends Error {
  constructor(resetAt) { super('rate limited'); this.resetAt = resetAt; }
}

function describeHttpError(status, body) {
  const detail = body && (body.detail || body.title || (body.errors && body.errors[0] && (body.errors[0].message || body.errors[0].detail)));
  switch (status) {
    case 401: return 'X API rejected the token (401 Unauthorized). Paste a valid Bearer Token in Settings.';
    case 402: return 'X API says the account has no credits left (402). Top up in the X Developer Console.';
    case 403: return 'X API refused access (403)' + (detail ? ': ' + detail : '. Your app/plan may not include reading posts.');
    case 404: return 'Not found (404)' + (detail ? ': ' + detail : '');
    default:  return 'X API error ' + status + (detail ? ': ' + detail : '');
  }
}

class MentorFeed {
  constructor({ store, fetchImpl = globalThis.fetch, download, now = () => Date.now(), log = () => {} }) {
    this.store = store;
    this.fetch = fetchImpl;
    this.now = now;
    this.log = log;
    this.download = download || this._defaultDownload.bind(this);
    this.blockedUntil = 0;   // global back-off after a 429
    this.running = false;
  }

  async _get(url, token) {
    if (this.now() < this.blockedUntil) throw new RateLimitError(this.blockedUntil);
    let res;
    try {
      res = await this.fetch(url, { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'ColesJournal/1.0' } });
    } catch (e) {
      throw new Error('Network error talking to X API: ' + (e.message || e));
    }
    if (res.status === 429) {
      const reset = Number(res.headers.get('x-rate-limit-reset'));
      this.blockedUntil = reset ? reset * 1000 : this.now() + 15 * 60 * 1000;
      throw new RateLimitError(this.blockedUntil);
    }
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok) throw new Error(describeHttpError(res.status, body));
    return body || {};
  }

  async _defaultDownload(url, destName) {
    const dest = path.join(this.store.mediaDir, destName);
    if (fs.existsSync(dest)) return destName;
    const res = await this.fetch(url);
    if (!res.ok) throw new Error('image download failed ' + res.status);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return destName;
  }

  async _resolveUser(handle, token, cache) {
    const key = handle.toLowerCase();
    if (cache.users[key] && cache.users[key].id) return cache.users[key];
    const body = await this._get(`${API}/users/by/username/${encodeURIComponent(handle)}?user.fields=profile_image_url,name`, token);
    if (!body.data) {
      const msg = body.errors && body.errors[0] ? (body.errors[0].detail || body.errors[0].title) : 'user not found';
      throw new Error('@' + handle + ': ' + msg);
    }
    cache.users[key] = { id: body.data.id, name: body.data.name, username: body.data.username, avatar: body.data.profile_image_url || '' };
    return cache.users[key];
  }

  // Returns { added, errors[] } and updates the cache on disk.
  async poll() {
    if (this.running) return { added: 0, errors: [], skipped: 'already running' };
    this.running = true;
    try {
      const settings = this.store.getSettings();
      const token = settings.bearerToken;
      const cache = this.store.getMentorCache();
      cache.status = cache.status || {};
      const result = { added: 0, errors: [], rateLimitedUntil: null };
      if (!token) { result.errors.push('NO_TOKEN'); return result; }
      if (!settings.mentors.length) return result;

      for (const handle of settings.mentors) {
        const key = handle.toLowerCase();
        const st = cache.status[key] = cache.status[key] || {};
        try {
          const user = await this._resolveUser(handle, token, cache);
          const mine = cache.posts.filter(p => p.authorId === user.id);
          const newest = mine.reduce((m, p) => (BigInt(p.id) > BigInt(m || 0) ? p.id : m), null);
          const qs = new URLSearchParams({
            'expansions': 'attachments.media_keys',
            'media.fields': 'url,preview_image_url,type,width,height',
            'tweet.fields': 'created_at,attachments',
            'exclude': 'retweets,replies',
            'max_results': String(newest ? 100 : FIRST_PULL),
          });
          if (newest) qs.set('since_id', newest);
          const body = await this._get(`${API}/users/${user.id}/tweets?${qs}`, token);
          const media = new Map(((body.includes && body.includes.media) || []).map(m => [m.media_key, m]));
          for (const t of body.data || []) {
            const keys = (t.attachments && t.attachments.media_keys) || [];
            const imgs = keys.map(k => media.get(k)).filter(Boolean)
              .map(m => ({ key: m.media_key, type: m.type, remote: m.url || m.preview_image_url }))
              .filter(m => m.remote);
            if (!imgs.length) continue;                 // text-only post: skip
            if (cache.posts.some(p => p.id === t.id)) continue;
            for (const im of imgs) {
              const ext = (im.remote.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i) || [, 'jpg'])[1];
              try { im.local = await this.download(im.remote + (im.type === 'photo' && !im.remote.includes('?') ? '?name=large' : ''), `${t.id}_${im.key}.${ext}`); }
              catch (e) { this.log('media download failed', e.message); }
            }
            cache.posts.push({
              id: t.id, authorId: user.id, handle: user.username, name: user.name, avatar: user.avatar,
              createdAt: t.created_at, text: t.text || '', images: imgs,
              url: `https://x.com/${user.username}/status/${t.id}`, fetchedAt: this.now(),
            });
            result.added++;
          }
          st.lastOk = this.now(); st.error = null;
        } catch (e) {
          if (e instanceof RateLimitError) {
            result.rateLimitedUntil = e.resetAt;
            st.error = 'Rate limited by X API, retrying after ' + new Date(e.resetAt).toLocaleTimeString();
            result.errors.push('@' + handle + ': ' + st.error);
            break;                                      // stop hitting the API until reset
          }
          st.error = e.message; result.errors.push('@' + handle + ': ' + e.message);
        }
      }
      // keep only current mentors, newest first, capped per mentor
      const active = new Set(settings.mentors.map(h => h.toLowerCase()));
      const per = {};
      cache.posts = cache.posts
        .filter(p => active.has(String(p.handle).toLowerCase()))
        .sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1))
        .filter(p => (per[p.authorId] = (per[p.authorId] || 0) + 1) <= MAX_POSTS_PER_MENTOR);
      cache.lastPoll = this.now();
      this.store.saveMentorCache(cache);
      return result;
    } finally { this.running = false; }
  }
}

module.exports = { MentorFeed, RateLimitError, describeHttpError };
