'use strict';
// Headless tests: logs CRUD + stats, and the X API mentor path with mocked responses.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { Store, computeStats, computeRuleStreak, computePnlCalendar, normalizeHandles, youtubeId } = require('../src/store');
const { MentorFeed } = require('../src/mentors');
const { tradingSessions } = require('../src/sessions');
const { audioExtension, safeStoredAudioName, themeSongFileUrl, safeStoredBackgroundName, backgroundFileUrl, backgroundKind } = require('../src/media-path');
const { shouldDismissEntrance, shouldReturnToStart } = require('../src/entrance-gate');
const { normalizeLibrary, pickStartBackground, nextShuffleBackground, fallbackChain, normalizeSpeed } = require('../src/backgrounds');

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('  ✓ ' + name); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gon-test-'));

function mockFetch(routes, calls) {
  return async (url, opts) => {
    calls.push({ url: String(url), auth: opts && opts.headers && opts.headers.Authorization });
    for (const [re, h] of routes) if (re.test(url)) {
      const r = typeof h === 'function' ? h(String(url)) : h;
      const headers = new Map(Object.entries(r.headers || {}));
      return { status: r.status || 200, ok: (r.status || 200) < 400, headers: { get: k => headers.get(k) ?? null },
        json: async () => r.body, arrayBuffer: async () => Buffer.from('fakeimg') };
    }
    throw new Error('unexpected url ' + url);
  };
}

(async () => {
  console.log('Logs CRUD');
  const dir = tmp(); const store = new Store(dir);
  let a, b;
  await test('create validates required fields', () => {
    assert.throws(() => store.createLog({ date: 'bad', instrument: '', direction: 'up' }), /date.*instrument.*direction/);
    assert.throws(() => store.createLog({ date: '2026-11-06', instrument: 'MNQ', direction: 'long', resultR: 'abc' }), /resultR must be a number/);
  });
  await test('create stores normalized values', () => {
    a = store.createLog({ date: '2026-11-05', time: '10:02', instrument: 'mnq', direction: 'long', entry: '21050.25', stop: '21040', target: '21100', resultR: '5', pnl: '250', setup: '10am sweep + CISD', notes: 'clean', mindset: 'calm' });
    b = store.createLog({ date: '2026-11-06', instrument: 'MES', direction: 'short', resultR: -1, pnl: -100 });
    assert.strictEqual(a.instrument, 'MNQ'); assert.strictEqual(a.entry, 21050.25); assert.strictEqual(a.resultR, 5);
    assert.strictEqual(store.listLogs().length, 2); assert.strictEqual(store.listLogs()[0].id, b.id); // newest first
  });
  await test('screenshots are copied into app data and removed with the log', () => {
    const src = path.join(dir, 'chart.png'); fs.writeFileSync(src, 'png');
    const name = store.importScreenshot(src);
    assert.ok(fs.existsSync(store.shotPath(name)));
    store.updateLog(b.id, { screenshots: [name] });
    assert.deepStrictEqual(store.getLog(b.id).screenshots, [name]);
    assert.throws(() => store.importScreenshot(path.join(dir, 'x.exe')), /unsupported/);
    store.deleteLog(b.id);
    assert.ok(!fs.existsSync(store.shotPath(name)));
    b = store.createLog({ date: '2026-11-06', instrument: 'MES', direction: 'short', resultR: -1, pnl: -100 });
  });
  await test('update edits fields and rejects bad data', () => {
    const u = store.updateLog(a.id, { resultR: 4.5, mindset: 'patient' });
    assert.strictEqual(u.resultR, 4.5); assert.strictEqual(u.mindset, 'patient'); assert.strictEqual(u.setup, '10am sweep + CISD');
    assert.throws(() => store.updateLog(a.id, { direction: 'sideways' }), /direction/);
    assert.throws(() => store.updateLog('nope', {}), /not found/);
  });
  await test('delete removes the log', () => {
    const c = store.createLog({ date: '2026-11-07', instrument: 'MGC', direction: 'long', resultR: 0 });
    assert.ok(store.deleteLog(c.id)); assert.ok(!store.deleteLog(c.id));
    assert.strictEqual(store.listLogs().length, 2);
  });
  await test('stats: total R, win rate, streak, curve', () => {
    store.createLog({ date: '2026-11-10', instrument: 'MNQ', direction: 'long', resultR: -1, pnl: -50 });
    const s = computeStats(store.listLogs(), new Date('2026-11-10T12:00:00'));
    assert.strictEqual(s.totalR, 2.5); assert.strictEqual(s.winRate, 33.3); assert.strictEqual(s.totalPnl, 100);
    assert.strictEqual(s.streak, 2); assert.strictEqual(s.streakType, 'L'); assert.deepStrictEqual(s.curve, [4.5, 3.5, 2.5]);
    assert.strictEqual(s.todayR, -1);
  });
  await test('data persists to logs.json', () => { assert.strictEqual(new Store(dir).listLogs().length, 3); });
  await test('handle normalization', () => {
    assert.deepStrictEqual(normalizeHandles('@Alpha, beta\nhttps://x.com/Gamma_1/status/1 @alpha bad-handle!'), ['Alpha', 'beta', 'Gamma_1']);
  });

  console.log('Rules & rule streak');
  await test('default rules are Cole\'s 4 mental rules and are editable', () => {
    const st = new Store(tmp());
    assert.strictEqual(st.getSettings().rules.length, 4); assert.match(st.getSettings().rules[0], /revenge/i);
    const saved = st.saveSettings({ rules: ['  Only A+ setups ', '', 'Max 2 trades'] });
    assert.deepStrictEqual(saved.rules, ['Only A+ setups', 'Max 2 trades']);
  });
  await test('logs keep rulesBroken + emotions', () => {
    const st = new Store(tmp());
    const l = st.createLog({ date: '2026-11-06', instrument: 'MNQ', direction: 'long', followedPlan: false, rulesBroken: ['No revenge trading.'], emotions: ['Revenge'] });
    assert.strictEqual(l.followedPlan, false); assert.deepStrictEqual(l.rulesBroken, ['No revenge trading.']); assert.deepStrictEqual(l.emotions, ['Revenge']);
    assert.strictEqual(st.createLog({ date: '2026-11-07', instrument: 'MNQ', direction: 'long' }).followedPlan, null);
  });
  await test('streak counts consecutive kept days, resets on a broken day, ignores unanswered', () => {
    const L = (date, f) => ({ date, followedPlan: f });
    let r = computeRuleStreak([L('2026-11-01', true), L('2026-11-02', true), L('2026-11-03', true), L('2026-11-04', false), L('2026-11-05', true), L('2026-11-06', null), L('2026-11-07', true)]);
    assert.strictEqual(r.current, 2); assert.strictEqual(r.best, 3); assert.strictEqual(r.lastBroken, '2026-11-04');
    r = computeRuleStreak([L('2026-11-01', true), L('2026-11-01', false)]);   // one bad trade breaks the whole day
    assert.strictEqual(r.current, 0); assert.strictEqual(r.best, 0); assert.strictEqual(r.byDate['2026-11-01'], false);
    r = computeRuleStreak([]); assert.strictEqual(r.current, 0); assert.strictEqual(r.days.length, 0);
    assert.strictEqual(computeStats([{ date: '2026-11-01', followedPlan: true, resultR: 1, createdAt: 1 }]).rules.current, 1);
  });

  console.log('Mentors (mocked X API v2)');
  const mdir = tmp(); const ms = new Store(mdir);
  await test('no token -> NO_TOKEN, no network', async () => {
    const calls = []; ms.saveSettings({ mentors: ['mentorA'] });
    const r = await new MentorFeed({ store: ms, fetchImpl: mockFetch([], calls) }).poll();
    assert.deepStrictEqual(r.errors, ['NO_TOKEN']); assert.strictEqual(calls.length, 0);
  });
  const userRoute = [/users\/by\/username\/mentorA/, { body: { data: { id: '111', name: 'Mentor A', username: 'mentorA' } } }];
  const page1 = { body: {
    data: [
      { id: '1003', text: 'NQ long, 5R ✅', created_at: '2026-11-10T15:02:00.000Z', attachments: { media_keys: ['3_a'] } },
      { id: '1002', text: 'text only, no image', created_at: '2026-11-09T15:00:00.000Z' },
      { id: '1001', text: 'ES short recap', created_at: '2026-11-08T15:00:00.000Z', attachments: { media_keys: ['3_b', '7_c'] } },
    ],
    includes: { media: [
      { media_key: '3_a', type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg' },
      { media_key: '3_b', type: 'photo', url: 'https://pbs.twimg.com/media/b.png' },
      { media_key: '7_c', type: 'video', preview_image_url: 'https://pbs.twimg.com/ext_tw_video_thumb/c.jpg' },
    ] } } };
  ms.saveSettings({ bearerToken: 'TEST_TOKEN', mentors: ['mentorA'] });
  const calls = [];
  const dl = async (url, name) => { fs.writeFileSync(path.join(ms.mediaDir, name), 'img'); return name; };
  let feed = new MentorFeed({ store: ms, fetchImpl: mockFetch([userRoute, [/users\/111\/tweets/, page1]], calls), download: dl });
  await test('first poll: lookup user, fetch tweets with required params, keep image posts only', async () => {
    const r = await feed.poll();
    assert.strictEqual(r.added, 2); assert.deepStrictEqual(r.errors, []);
    const tl = new URL(calls[1].url);
    assert.strictEqual(tl.searchParams.get('expansions'), 'attachments.media_keys');
    assert.ok(tl.searchParams.get('media.fields').includes('url') && tl.searchParams.get('media.fields').includes('preview_image_url'));
    assert.ok(tl.searchParams.get('tweet.fields').includes('created_at'));
    assert.strictEqual(tl.searchParams.get('since_id'), null);
    assert.strictEqual(calls[0].auth, 'Bearer TEST_TOKEN');
    const c = ms.getMentorCache();
    assert.deepStrictEqual(c.posts.map(p => p.id), ['1003', '1001']); // newest first, text-only skipped
    assert.strictEqual(c.posts[0].text, 'NQ long, 5R ✅'); assert.strictEqual(c.posts[0].createdAt, '2026-11-10T15:02:00.000Z');
    assert.strictEqual(c.posts[1].images.length, 2); assert.ok(c.posts[1].images.every(i => i.local));
  });
  await test('second poll: cached user id (no lookup), since_id = newest, adds only new', async () => {
    calls.length = 0;
    feed = new MentorFeed({ store: ms, fetchImpl: mockFetch([[/users\/111\/tweets/, { body: { data: [{ id: '1004', text: 'new one', created_at: '2026-11-11T15:00:00.000Z', attachments: { media_keys: ['3_d'] } }], includes: { media: [{ media_key: '3_d', type: 'photo', url: 'https://pbs.twimg.com/media/d.jpg' }] } } }]], calls), download: dl });
    const r = await feed.poll();
    assert.strictEqual(calls.length, 1); assert.strictEqual(new URL(calls[0].url).searchParams.get('since_id'), '1003');
    assert.strictEqual(r.added, 1); assert.deepStrictEqual(ms.getMentorCache().posts.map(p => p.id), ['1004', '1003', '1001']);
  });
  await test('429 rate limit: backs off until x-rate-limit-reset, keeps cache', async () => {
    let now = 1_700_000_000_000; const reset = Math.floor(now / 1000) + 600;
    calls.length = 0;
    feed = new MentorFeed({ store: ms, now: () => now, fetchImpl: mockFetch([[/tweets/, { status: 429, headers: { 'x-rate-limit-reset': String(reset) }, body: { title: 'Too Many Requests' } }]], calls), download: dl });
    const r = await feed.poll();
    assert.strictEqual(r.rateLimitedUntil, reset * 1000); assert.match(r.errors[0], /Rate limited/);
    const r2 = await feed.poll(); assert.strictEqual(calls.length, 1, 'no request while blocked'); assert.match(r2.errors[0], /Rate limited/);
    assert.strictEqual(ms.getMentorCache().posts.length, 3);
  });
  await test('401 bad token and unknown user produce readable errors', async () => {
    ms.saveSettings({ mentors: ['mentorA', 'ghost'] });
    const c = ms.getMentorCache(); delete c.users.mentora; ms.saveMentorCache(c);
    feed = new MentorFeed({ store: ms, fetchImpl: mockFetch([[/username\/mentorA/, { status: 401, body: { title: 'Unauthorized' } }], [/username\/ghost/, { body: { errors: [{ detail: 'Could not find user with username: [ghost].' }] } }]], []) });
    const r = await feed.poll();
    assert.match(r.errors[0], /401/); assert.match(r.errors[1], /@ghost: Could not find user/);
  });
  await test('network failure is caught', async () => {
    feed = new MentorFeed({ store: ms, fetchImpl: async () => { throw new Error('ENOTFOUND api.x.com'); } });
    const r = await feed.poll(); assert.match(r.errors[0], /Network error/);
  });
  await test('removing a mentor drops their cached posts', async () => {
    ms.saveSettings({ mentors: ['someoneElse'] });
    await new MentorFeed({ store: ms, fetchImpl: mockFetch([[/username/, { status: 403, body: { title: 'Forbidden' } }]], []) }).poll();
    assert.strictEqual(ms.getMentorCache().posts.length, 0);
  });

  console.log('P&L calendar');
  await test('month and week totals count only in-month days', () => {
    const logs = [
      { date: '2026-11-02', pnl: 100, resultR: 2 },
      { date: '2026-11-02', pnl: -40, resultR: -1 },
      { date: '2026-11-03', pnl: 250, resultR: 5 },
      { date: '2026-11-10', pnl: -70, resultR: -1 },
      { date: '2026-10-31', pnl: 999, resultR: 9 },
    ];
    const cal = computePnlCalendar(logs, 2026, 11);
    assert.strictEqual(cal.monthPnl, 240);
    assert.strictEqual(cal.monthR, 5);
    assert.strictEqual(cal.winDays, 2);
    assert.strictEqual(cal.lossDays, 1);
    assert.strictEqual(cal.flatDays, 0);
    const week = cal.weeks.find(w => w.days.some(d => d.date === '2026-11-02'));
    assert.strictEqual(week.totalPnl, 310);
    assert.strictEqual(week.totalR, 6);
    assert.strictEqual(week.days.find(d => d.date === '2026-11-02').pnl, 60);
    assert.strictEqual(week.days.find(d => d.date === '2026-11-02').r, 1);
    assert.strictEqual(week.days.find(d => d.date === '2026-11-02').trades, 2);
    assert.ok(cal.weeks.every(w => w.days.length === 7));
    assert.strictEqual(cal.weeks.reduce((s, w) => s + w.totalPnl, 0), cal.monthPnl);
  });

  console.log('Education');
  await test('education stores a link, edits notes, and deletes the files', () => {
    const dir = tmp(); const store = new Store(dir);
    assert.throws(() => store.createEducation({ title: '', url: 'https://example.com/a' }), /title/);
    assert.throws(() => store.createEducation({ title: 'Lesson', url: 'http://example.com/a' }), /https/);
    const src = path.join(dir, 'clip.mp4'); fs.writeFileSync(src, 'video');
    const file = store.importVideo(src);
    const item = store.createEducation({ title: 'Sweep walkthrough', mentor: '@nq_mentor', tags: 'sweep, CISD', date: '2026-11-10', notes: 'Wait.', url: '', file, stamps: [{ t: '1:20', note: 'entry' }] });
    assert.strictEqual(item.mentor, 'nq_mentor');
    assert.deepStrictEqual(item.tags, ['sweep', 'CISD']);
    assert.strictEqual(item.stamps[0].note, 'entry');
    assert.strictEqual(store.listEducation()[0].id, item.id);
    const thumb = store.saveThumbBuffer(Buffer.from('jpeg'), '.jpg');
    const updated = store.updateEducation(item.id, { watched: true, thumb, notes: 'Updated' });
    assert.strictEqual(updated.watched, true);
    assert.strictEqual(updated.file, file);
    assert.ok(fs.existsSync(store.videoPath(file)));
    assert.strictEqual(store.deleteEducation(item.id), true);
    assert.strictEqual(store.listEducation().length, 0);
    assert.ok(!fs.existsSync(store.videoPath(file)));
    assert.ok(!fs.existsSync(store.thumbPath(thumb)));
    assert.strictEqual(youtubeId('https://www.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk');
    assert.strictEqual(youtubeId('https://youtu.be/abcdefghijk'), 'abcdefghijk');
    assert.strictEqual(youtubeId('https://example.com/v'), null);
  });

  console.log('Trading sessions (ET)');
  const expectSession = (iso, active, kind, name) => {
    const s = tradingSessions(new Date(iso));
    assert.deepStrictEqual(s.active, active, iso + ' active ' + s.phrase);
    assert.strictEqual(s.next.kind, kind);
    assert.strictEqual(s.next.name, name);
    assert.ok(s.countdownMs > 0);
  };
  await test('London and New York overlap at 10:00 ET, winter and summer', () => {
    expectSession('2026-01-05T15:00:00Z', ['london', 'ny'], 'close', 'London');
    expectSession('2026-07-06T14:00:00Z', ['london', 'ny'], 'close', 'London');
  });
  await test('Asia, the gap, and the London open are ordered', () => {
    expectSession('2026-01-06T01:00:00Z', ['asia'], 'open', 'London'); // Mon 20:00 EST
    expectSession('2026-01-06T07:00:00Z', ['asia'], 'open', 'London'); // Tue 02:00
    expectSession('2026-01-06T08:30:00Z', ['asia', 'london'], 'close', 'Asia'); // Tue 03:30
    expectSession('2026-01-05T23:00:00Z', [], 'open', 'Asia'); // Mon 18:00
    expectSession('2026-01-05T17:00:00Z', ['ny'], 'close', 'New York'); // Mon 12:00
  });
  await test('weekend is closed from Friday 17:00 ET until Sunday 18:00 ET', () => {
    expectSession('2026-01-09T21:00:00Z', ['ny'], 'close', 'New York'); // Fri 16:00
    const fri = tradingSessions(new Date('2026-01-09T23:00:00Z')); // Fri 18:00 EST
    assert.strictEqual(fri.closed, true);
    assert.deepStrictEqual(fri.active, []);
    assert.strictEqual(fri.next.at, '2026-01-11T23:00:00.000Z');
    assert.strictEqual(tradingSessions(new Date('2026-01-10T17:00:00Z')).closed, true); // Saturday
    const sunEarly = tradingSessions(new Date('2026-01-11T22:59:00Z')); // Sun 17:59 EST
    assert.strictEqual(sunEarly.closed, true);
    assert.ok(sunEarly.countdownMs < 90 * 1000);
    const sunOpen = tradingSessions(new Date('2026-01-11T23:00:00Z')); // Sun 18:00 EST
    assert.strictEqual(sunOpen.closed, false);
    assert.deepStrictEqual(sunOpen.active, []);
    assert.strictEqual(sunOpen.next.name, 'Asia');
  });
  console.log('Theme song paths');
  await test('mp3 paths with spaces, apostrophes, and backslashes become a safe URL', () => {
    const messy = "C:\\Users\\Cole\\AppData\\Roaming\\Cole's Journal\\My Song #1.MP3";
    assert.strictEqual(audioExtension(messy), '.mp3');
    assert.strictEqual(audioExtension('/tmp/track.M4A'), '.m4a');
    const stored = safeStoredAudioName('abc-123', messy);
    assert.strictEqual(stored, 'abc-123.mp3');
    const url = themeSongFileUrl(stored);
    assert.strictEqual(url, 'journal-media://theme/abc-123.mp3');
    assert.ok(!/['\\ #%]/.test(url));
    assert.strictEqual(themeSongFileUrl("..\\..\\Cole's Journal\\secret.mp3"), 'journal-media://theme/secret.mp3');
    assert.throws(() => themeSongFileUrl("Cole's song.mp3"), /unsafe/);
    assert.throws(() => themeSongFileUrl('my song.mp3'), /unsafe/);
    assert.throws(() => safeStoredAudioName('id', 'notes.txt'), /unsupported/);

    const dir = tmp();
    const nested = path.join(dir, "Cole's Journal");
    fs.mkdirSync(nested);
    const src = path.join(nested, 'My Song #1.MP3');
    fs.writeFileSync(src, 'ID3fake');
    const store = new Store(path.join(dir, 'data'));
    const saved = store.importThemeSong(src);
    assert.match(saved.themeSong.file, /^[0-9a-f-]+\.mp3$/);
    assert.strictEqual(saved.themeSong.name, 'My Song #1.MP3');
    assert.strictEqual(fs.readFileSync(store.songPath(saved.themeSong.file), 'utf8'), 'ID3fake');
    const again = new Store(store.dir);
    assert.strictEqual(again.getSettings().themeSong.file, saved.themeSong.file);
    const playback = again.themeSongUrl(again.getSettings().themeSong.file);
    assert.strictEqual(playback, 'journal-media://theme/' + saved.themeSong.file);
    const escaped = store.songPath("..\\..\\Cole's Journal\\secret.mp3");
    const root = path.resolve(store.songDir);
    assert.strictEqual(path.basename(escaped), 'secret.mp3');
    assert.ok(path.resolve(escaped).startsWith(root + path.sep));
    assert.ok(store.songPath(saved.themeSong.file).startsWith(root));
  });
  console.log('Start screen library');
  await test('background paths with spaces, apostrophes, and backslashes become a safe URL', () => {
    const messy = "C:\\Users\\Cole\\AppData\\Roaming\\Cole's Journal\\Sunset #1.MP4";
    assert.strictEqual(audioExtension(messy), '.mp4');
    assert.strictEqual(backgroundKind(messy), 'video');
    assert.strictEqual(backgroundKind('C:\\Photos\\Dawn.JPEG'), 'image');
    assert.strictEqual(backgroundKind('/tmp/loop.GIF'), 'image');
    assert.strictEqual(safeStoredBackgroundName('abc-123', messy), 'abc-123.mp4');
    assert.strictEqual(backgroundFileUrl('abc-123.mp4'), 'journal-media://bg/abc-123.mp4');
    assert.ok(!/['\\ #%]/.test(backgroundFileUrl('abc-123.webm')));
    assert.strictEqual(backgroundFileUrl("..\\..\\Cole's Journal\\secret.png"), 'journal-media://bg/secret.png');
    assert.throws(() => backgroundFileUrl("Cole's pic.png"), /unsafe/);
    assert.throws(() => safeStoredBackgroundName('id', 'notes.txt'), /unsupported/);
  });
  await test('the library keeps the dock video, persists files, and will not delete the dock', () => {
    const dir = tmp();
    const nested = path.join(dir, "Cole's Journal");
    fs.mkdirSync(nested);
    const pic = path.join(nested, 'Dawn Photo.PNG');
    const clip = path.join(nested, 'Loop #2.mp4');
    fs.writeFileSync(pic, 'png');
    fs.writeFileSync(clip, 'mp4');
    const store = new Store(path.join(dir, 'data'));
    const saved = store.importBackgrounds([pic, clip, path.join(nested, 'missing.png'), path.join(nested, 'notes.txt')]);
    assert.strictEqual(saved.startScreen.mode, 'random');
    assert.strictEqual(saved.startScreen.items[0].id, 'default');
    assert.strictEqual(saved.startScreen.items[0].builtin, true);
    assert.strictEqual(saved.startScreen.items.length, 3);
    assert.strictEqual(saved.startScreen.items[1].kind, 'image');
    assert.strictEqual(saved.startScreen.items[1].name, 'Dawn Photo.PNG');
    assert.strictEqual(saved.startScreen.items[2].kind, 'video');
    assert.strictEqual(saved.startScreen.items[2].speed, 0.5);
    assert.strictEqual(fs.readFileSync(store.backgroundPath(saved.startScreen.items[1].file), 'utf8'), 'png');
    const again = new Store(store.dir);
    assert.strictEqual(again.getSettings().startScreen.items.length, 3);
    assert.strictEqual(again.backgroundUrl(again.getSettings().startScreen.items[2].file), 'journal-media://bg/' + again.getSettings().startScreen.items[2].file);
    const root = path.resolve(store.bgDir);
    const escaped = store.backgroundPath("..\\..\\Cole's Journal\\secret.mp4");
    assert.ok(path.resolve(escaped).startsWith(root + path.sep));
    const imageId = saved.startScreen.items[1].id;
    const kept = store.removeBackground('default');
    assert.ok(kept.startScreen.items.some(i => i.id === 'default'));
    const removed = store.removeBackground(imageId);
    assert.ok(!removed.startScreen.items.some(i => i.id === imageId));
    assert.strictEqual(fs.existsSync(path.join(store.bgDir, saved.startScreen.items[1].file)), false);
    const slowed = store.updateBackground(saved.startScreen.items[2].id, { speed: 0.25, enabled: false });
    const video = slowed.startScreen.items.find(i => i.id === saved.startScreen.items[2].id);
    assert.strictEqual(video.speed, 0.25);
    assert.strictEqual(video.enabled, false);
    const picked = store.setStartPrefs({ mode: 'selected', fit: 'fit', selectedId: video.id });
    assert.strictEqual(picked.startScreen.mode, 'selected');
    assert.strictEqual(picked.startScreen.fit, 'fit');
    assert.strictEqual(picked.startScreen.selectedId, video.id);
    assert.strictEqual(normalizeSpeed(0.3), 0.5);
    assert.strictEqual(normalizeSpeed(1), 1);
  });
  await test('random avoids the previous launch, selected stays put, and a failure tries another then the dock', () => {
    const items = [
      { id: 'default', builtin: true, kind: 'video', file: '', name: 'Dock', enabled: true, speed: 0.5 },
      { id: 'pic', builtin: false, kind: 'image', file: 'pic.png', name: 'pic', enabled: true, speed: 0.5 },
      { id: 'clip', builtin: false, kind: 'video', file: 'clip.mp4', name: 'clip', enabled: true, speed: 1 },
    ];
    const lib = { mode: 'random', fit: 'fill', selectedId: 'default', lastId: '', items };
    let last = '';
    const seen = [];
    for (const n of [0, 0.4, 0.9, 0, 0.4, 0.9]) {
      const pick = pickStartBackground({ ...lib, lastId: last }, () => n);
      if (last) assert.notStrictEqual(pick.id, last);
      seen.push(pick.id);
      last = pick.id;
    }
    assert.ok(new Set(seen).size >= 2);
    const selected = pickStartBackground({ ...lib, mode: 'selected', selectedId: 'clip', lastId: 'clip' }, () => 0);
    assert.strictEqual(selected.id, 'clip');
    const shuffled = nextShuffleBackground(lib, 'clip', () => 0);
    assert.notStrictEqual(shuffled.id, 'clip');
    const chain = fallbackChain({ ...lib, items: items.map(i => i.id === 'default' ? { ...i, enabled: false } : i) }, items[2]);
    assert.deepStrictEqual(chain.map(i => i.id), ['clip', 'pic', 'default']);
    const normalized = normalizeLibrary({ items: [{ id: 'pic', file: 'pic.png', kind: 'image', name: 'pic' }] });
    assert.strictEqual(normalized.items[0].id, 'default');
    assert.strictEqual(normalized.mode, 'random');
    assert.strictEqual(normalizeLibrary({ items: [{ id: 'nope', file: "Cole's pic.png" }] }).items.length, 1);
  });
  console.log('Entrance');
  await test('click, pointer, and any key enter once; repeats and a second event do not', () => {
    assert.strictEqual(shouldDismissEntrance({ type: 'click' }, false), true);
    assert.strictEqual(shouldDismissEntrance({ type: 'pointerdown' }, false), true);
    assert.strictEqual(shouldDismissEntrance({ type: 'mousedown' }, false), true);
    assert.strictEqual(shouldDismissEntrance({ type: 'keydown', key: 'Enter', repeat: false }, false), true);
    assert.strictEqual(shouldDismissEntrance({ type: 'keydown', key: 'a', repeat: false }, false), true);
    assert.strictEqual(shouldDismissEntrance({ type: 'keydown', key: ' ', repeat: true }, false), false);
    assert.strictEqual(shouldDismissEntrance({ type: 'click' }, true), false);
    assert.strictEqual(shouldDismissEntrance({ type: 'scroll' }, false), false);
  });
  await test('Esc returns to the start screen only when nothing is open, and Ctrl+W always does', () => {
    assert.strictEqual(shouldReturnToStart({ key: 'Escape', ctrlKey: false, metaKey: false }, false), true);
    assert.strictEqual(shouldReturnToStart({ key: 'Escape', ctrlKey: false, metaKey: false }, true), false);
    assert.strictEqual(shouldReturnToStart({ key: 'w', ctrlKey: true, metaKey: false }, true), true);
    assert.strictEqual(shouldReturnToStart({ key: 'w', ctrlKey: false, metaKey: true }, false), true);
    assert.strictEqual(shouldReturnToStart({ key: 'a', ctrlKey: false, metaKey: false }, false), false);
  });
  console.log(`\n${passed} tests passed`);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
