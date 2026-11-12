'use strict';
// Headless tests: logs CRUD + stats, and the X API mentor path with mocked responses.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { Store, computeStats, computeRuleStreak, normalizeHandles } = require('../src/store');
const { MentorFeed } = require('../src/mentors');

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
  console.log(`\n${passed} tests passed`);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
