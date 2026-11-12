'use strict';
// Seeds a throwaway data dir with sample logs and a mocked mentor cache (for screenshots only).
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { Store } = require('../src/store');
const dir = process.argv[2]; fs.rmSync(dir, { recursive: true, force: true });
const s = new Store(dir);
const mode = process.argv[3];
s.saveSettings({ profile: { name: 'Cole', account: 'Tradovate · $1,000' }, mentors: mode === 'empty' ? [] : ['mentor_one', 'nq_mentor'], bearerToken: mode === 'empty' ? '' : 'DEMO', pollMinutes: 15, theme: mode === 'dark' ? 'dark' : 'light' });
if (mode === 'empty') process.exit(0);
const shots = path.join(dir, 'tmp-shots'); fs.mkdirSync(shots);
execFileSync('python3', [path.join(__dirname, 'fake-charts.py'), shots, s.mediaDir]);
const T = [
  ['2026-10-20','10:01','MNQ','long',21010,20995,21085,5,250,'10am H6 sweep + CISD','Swept the 6am high, CISD on 1m, rode to target.','Calm, waited for confirmation.',true],
  ['2026-10-21','10:04','MES','short',5875.5,5879,5858,-1,-50,'10am sweep + CISD','Stopped out, displacement was weak.','Slightly impatient.',true],
  ['2026-10-22','10:00','MNQ','short',21120,21135,21045,5,250,'10am H6 sweep + CISD','Textbook. Held through the pullback.','Confident.',true],
  ['2026-10-28','10:07','MGC','long',2741.2,2738.4,2755.2,0,0,'Gold reclaim','Moved stop to BE, tagged out.','Neutral.',true],
  ['2026-10-29','10:02','MNQ','long',21300,21285,21375,-1,-50,'10am sweep + CISD','Chop day, no follow-through.','Fine with it, plan followed.',true],
  ['2026-10-30','10:03','MES','long',5902,5898.5,5919.5,5,250,'10am H6 sweep + CISD','News-free morning, clean run.','Patient.',true],
  ['2026-11-04','10:05','MNQ','short',21450,21466,21370,-1,-80,'10am sweep + CISD','Entered early before CISD closed.','FOMO.',false],
  ['2026-11-05','10:01','MNQ','long',21390,21376,21460,5,350,'10am H6 sweep + CISD','Waited for the full candle close.','Calm, rules first.',true],
  ['2026-11-06','10:02','MNQ','long',21510,21490,21610,-1.5,-400,'10am sweep + CISD','First loss, then sized up.','Frustrated after the first stop.',false],
  ['2026-11-06','10:41','MNQ','short',21480,21510,21400,-2,-600,'Revenge','No setup. Revenge trade.','Revenge. Should have walked away.',false],
  ['2026-11-07','10:03','MNQ','long',21530,21515,21605,5,250,'10am H6 sweep + CISD','Reset after Thursday. One trade, full size, done.','Calm. Walked away after.',true],
  ['2026-11-10','10:00','MES','short',5930,5934,5910,2.5,125,'10am sweep + CISD','Partial at 2.5R into CPI week.','Disciplined.',true],
  ['2026-11-11','10:02','MNQ','long',21620,21606,21690,-1,-70,'10am H6 sweep + CISD','Clean setup, just didn\'t work. Stop respected.','Accepting. Process over outcome.',true],
];
const shotFiles = fs.readdirSync(shots).filter(f => f.startsWith('chart'));
T.forEach((t, i) => {
  const [date,time,instrument,direction,entry,stop,target,resultR,pnl,setup,notes,mindset,followedPlan] = t;
  const screenshots = i % 3 === 0 ? [s.importScreenshot(path.join(shots, shotFiles[i % shotFiles.length]))] : [];
  const rules = s.getSettings().rules;
  const rulesBroken = followedPlan ? [] : (setup === 'Revenge' ? [rules[0], rules[1]] : [rules[2]]);
  const emotions = followedPlan ? ['Calm', 'Patient'] : ['FOMO', 'Frustrated'];
  s.createLog({ date,time,instrument,direction,entry,stop,target,resultR,pnl,setup,notes,mindset,followedPlan,rulesBroken,emotions,screenshots });
});
const now = Date.now();
const posts = [
  ['1856000000000000005','nq_mentor','NQ Mentor','NQ 10am sweep into CISD, 4R on the day. Patience paid. 🎯','2026-11-11T15:24:00.000Z',['m1.png']],
  ['1856000000000000004','mentor_one','Mentor One','ES recap: took the London low sweep, scaled at 2R, runner to 5R.','2026-11-10T16:02:00.000Z',['m2.png','m3.png']],
  ['1856000000000000003','nq_mentor','NQ Mentor','No trade today. CPI tomorrow, flat is a position.','2026-11-09T14:40:00.000Z',['m4.png']],
  ['1856000000000000002','mentor_one','Mentor One','Gold reclaim of the Asia high. Clean.','2026-11-06T15:10:00.000Z',['m5.png']],
];
s.saveMentorCache({ users: { mentor_one: { id: '1', username: 'mentor_one', name: 'Mentor One' }, nq_mentor: { id: '2', username: 'nq_mentor', name: 'NQ Mentor' } },
  posts: posts.map(([id, handle, name, text, createdAt, imgs]) => ({ id, authorId: handle === 'nq_mentor' ? '2' : '1', handle, name, text, createdAt, url: `https://x.com/${handle}/status/${id}`, images: imgs.map(m => ({ key: m, type: 'photo', local: m, remote: '' })), fetchedAt: now })),
  status: {}, lastPoll: now });
fs.rmSync(shots, { recursive: true });
const lessons = [
  ['10am sweep, start to finish', 'nq_mentor', '2026-11-11', ['sweep', 'CISD'], 'Wait for the 1m close before you enter.', false, '#1d4e89'],
  ['No trade is a trade', 'nq_mentor', '2026-11-09', ['patience'], 'CPI day. Flat.', true, '#2f6f4e'],
  ['London low sweep recap', 'mentor_one', '2026-11-10', ['london', 'ES'], 'Scaled at 2R, runner to 5R.', false, '#245c78'],
  ['Gold reclaim of Asia', 'mentor_one', '2026-11-06', ['gold'], 'Only after the level is reclaimed.', true, '#8a5a2a'],
];
const thumbDir = path.join(dir, 'thumb-src'); fs.mkdirSync(thumbDir);
execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
import sys
out, color, label = sys.argv[1:]
im = Image.new('RGB', (480, 270), color)
d = ImageDraw.Draw(im)
d.polygon([(210,95),(210,175),(280,135)], fill=(255,255,255))
d.text((24, 220), label, fill=(255,255,255))
im.save(out, 'JPEG', quality=85)
`, path.join(thumbDir, 't.jpg'), '#1d4e89', 'lesson'])
for (const [title, mentor, date, tags, notes, watched, color] of lessons) {
  const src = path.join(thumbDir, title.slice(0, 12).replace(/\s/g, '_') + '.jpg');
  execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
import sys
out, color, label = sys.argv[1:]
im = Image.new('RGB', (480, 270), color)
d = ImageDraw.Draw(im)
d.polygon([(210,95),(210,175),(280,135)], fill=(255,255,255))
d.text((24, 24), label, fill=(255,255,255))
im.save(out, 'JPEG', quality=85)
`, src, color, mentor]);
  const item = s.createEducation({ title, mentor, date, tags, notes, watched, url: 'https://www.youtube.com/watch?v=aqzKE1bpKQ0' });
  const thumb = s.saveThumbBuffer(fs.readFileSync(src), '.jpg');
  s.updateEducation(item.id, { thumb });
}
fs.rmSync(thumbDir, { recursive: true });
console.log('seeded', dir);
