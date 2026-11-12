'use strict';
// Confirms a packaged build can update from public GitHub Releases:
// app-update.yml points at this repo with no token, electron-updater is inside
// the asar, and (on Windows) latest.yml names the NSIS installer.
const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const requireLatest = process.argv.includes('--require-latest');
const root = path.resolve('dist');

function walk(dir, hits, depth) {
  if (depth > 8 || !fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, hits, depth + 1);
    else if (name === 'app-update.yml' || name === 'app.asar' || name === 'latest.yml') hits.push(p);
  }
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(root)) fail('dist/ was not produced');
const hits = [];
walk(root, hits, 0);
const updateYml = hits.find(p => p.endsWith('app-update.yml'));
const appAsar = hits.find(p => p.endsWith('app.asar'));
const latest = hits.find(p => path.basename(p) === 'latest.yml');

if (!updateYml) fail('app-update.yml is missing from the packaged app');
if (!appAsar) fail('app.asar is missing');
const meta = fs.readFileSync(updateYml, 'utf8');
console.log('--- ' + updateYml + ' ---\n' + meta.trim());
if (!/provider:\s*github/.test(meta)) fail('app-update.yml is missing the github provider');
if (!/owner:\s*colehayes0204-source/.test(meta)) fail('app-update.yml has the wrong owner');
if (!/repo:\s*coles-journal/.test(meta)) fail('app-update.yml has the wrong repo');
if (/(^|\n)\s*token\s*:/i.test(meta)) fail('app-update.yml must not contain a token');

const listed = asar.listPackage(appAsar).map(p => p.replace(/\\/g, '/'));
if (!listed.some(p => p.includes('node_modules/electron-updater/package.json'))) {
  const mods = listed.filter(p => p.includes('node_modules')).slice(0, 40);
  fail('electron-updater was not packaged in app.asar\n' + mods.join('\n'));
}
console.log('electron-updater is inside', appAsar);

if (requireLatest) {
  if (!latest) fail('latest.yml was not generated');
  const yml = fs.readFileSync(latest, 'utf8');
  console.log('--- ' + latest + ' ---\n' + yml.trim());
  if (!/ColesJournal-Setup-/.test(yml)) fail('latest.yml does not reference the NSIS installer');
  const setup = hits.length && fs.readdirSync(root).some(n => /^ColesJournal-Setup-.*\.exe$/.test(n));
  if (!setup) fail('ColesJournal-Setup-*.exe is missing from dist/');
}
console.log('update package looks good');
