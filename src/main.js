'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Store, computeStats, youtubeId } = require('./store');
const { MentorFeed } = require('./mentors');

// Let the entrance theme song start without a click. Must be set before ready.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Optional: GON_DATA_DIR overrides the data folder (used for tests/screenshots).
app.setName("Cole's Journal");
if (process.env.GON_DATA_DIR) app.setPath('userData', process.env.GON_DATA_DIR);

// v1.0.0 was called "Gon Journal": copy its data into the new folder once (old folder is left untouched).
function migrateLegacyData() {
  if (process.env.GON_DATA_DIR) return;
  const fs = require('fs');
  const dest = app.getPath('userData');
  const legacy = path.join(app.getPath('appData'), 'Gon Journal');
  try {
    if (fs.existsSync(path.join(dest, 'logs.json')) || fs.existsSync(path.join(dest, 'settings.json'))) return;
    if (!fs.existsSync(legacy)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const f of ['logs.json', 'settings.json', 'mentor-cache.json', 'screenshots', 'mentor-media']) {
      const src = path.join(legacy, f);
      if (fs.existsSync(src)) fs.cpSync(src, path.join(dest, f), { recursive: true });
    }
    fs.writeFileSync(path.join(dest, 'MIGRATED_FROM_GON_JOURNAL.txt'), 'Copied from ' + legacy + ' on ' + new Date().toISOString() + '\n');
  } catch (e) { console.error('legacy migration failed', e); }
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'gon', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  // stream is required or <audio> cannot play; without it an uploaded mp3 stays silent.
  { scheme: 'journal-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

let win, store, feed, pollTimer;

// In-app updates via GitHub Releases. Download in the background; restart only
// when the user clicks Restart. Offline and other errors are logged, not shown.
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000;
let autoUpdater = null;
let updateState = { status: 'idle', version: null };

function sendUpdate() {
  if (win && !win.isDestroyed()) win.webContents.send('updater:status', updateState);
}
function updaterLog(...args) { console.log('[updater]', ...args); }

function setupAutoUpdater() {
  if (process.env.GON_SHOT || process.env.GON_NO_UPDATE) return;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (e) {
    updaterLog('unavailable:', e && e.message ? e.message : e);
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.logger = { info: updaterLog, warn: updaterLog, error: updaterLog, debug: updaterLog };

  autoUpdater.on('checking-for-update', () => {
    if (updateState.status === 'ready' || updateState.status === 'downloading') return;
    updateState = { status: 'checking', version: null };
    sendUpdate();
  });
  autoUpdater.on('update-available', (info) => {
    updateState = { status: 'downloading', version: info && info.version };
    sendUpdate();
  });
  autoUpdater.on('update-not-available', () => {
    if (updateState.status === 'ready') return;
    updateState = { status: 'current', version: app.getVersion() };
    sendUpdate();
  });
  autoUpdater.on('update-downloaded', (info) => {
    updateState = { status: 'ready', version: info && info.version };
    sendUpdate();
  });
  autoUpdater.on('error', (err) => {
    updaterLog(err && err.message ? err.message : err);
    if (updateState.status !== 'ready') {
      updateState = { status: 'idle', version: null };
      sendUpdate();
    }
  });

  if (!app.isPackaged) {
    updaterLog('not packaged; checks run only in the installed app');
    return;
  }
  setTimeout(checkForUpdates, 12000);
  setInterval(checkForUpdates, UPDATE_CHECK_MS);
}

function checkForUpdates() {
  if (!autoUpdater || !app.isPackaged) return Promise.resolve({ status: 'dev', version: app.getVersion() });
  if (updateState.status === 'ready' || updateState.status === 'downloading') return Promise.resolve(updateState);
  return autoUpdater.checkForUpdates().then(() => updateState).catch((err) => {
    updaterLog(err && err.message ? err.message : err);
    if (updateState.status !== 'ready') updateState = { status: 'idle', version: null };
    return updateState;
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 660,
    backgroundColor: '#e8f4ff', title: "Cole's Journal",
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: process.env.GON_TAB ? (process.env.GON_SPLASH ? { tab: process.env.GON_TAB } : { tab: process.env.GON_TAB, nosplash: '1' }) : {} });
  win.once('ready-to-show', () => { if (!process.env.GON_SHOT) win.maximize(); win.show(); });
  // Test hook: GON_SHOT=<file.png> captures the window after load, then quits.
  if (process.env.GON_SHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.GON_EVAL) { // test hook: run JS in the renderer, save the JSON result
        const r = await win.webContents.executeJavaScript(require('fs').readFileSync(process.env.GON_EVAL, 'utf8')).catch(e => ({ error: String(e) }));
        require('fs').writeFileSync(process.env.GON_SHOT + '.json', JSON.stringify(r, null, 2));
      }
      if (process.env.GON_OPEN_FORM) await win.webContents.executeJavaScript("document.querySelector('#logList tbody tr')?.click()");
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        require('fs').writeFileSync(process.env.GON_SHOT, img.toPNG()); app.quit();
      }, Number(process.env.GON_SHOT_DELAY || 1500));
    }, 300));
  }
  const mainLog = (msg) => {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'main.log'), new Date().toISOString() + ' ' + msg + '\n');
  } catch (e) { console.log('[main] log failed', e && e.message ? e.message : e); }
};
win.webContents.on('render-process-gone', (_e, details) => { mainLog('render-process-gone ' + JSON.stringify(details)); console.log('[main] render-process-gone', details); });
win.webContents.on('did-fail-load', (_e, code, desc, url) => { mainLog('did-fail-load ' + code + ' ' + desc + ' ' + url); console.log('[main] did-fail-load', code, desc, url); });
win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https:/.test(url)) shell.openExternal(url); } });
}

function schedulePoll() {
  clearInterval(pollTimer);
  const mins = store.getSettings().pollMinutes || 15;
  pollTimer = setInterval(runPoll, mins * 60 * 1000);
}
async function runPoll() {
  const r = await feed.poll();
  if (win && !win.isDestroyed()) win.webContents.send('mentors:updated', r);
  return r;
}

app.whenReady().then(() => {
  migrateLegacyData();
  store = new Store(app.getPath('userData'));
  feed = new MentorFeed({ store, fetchImpl: (u, o) => net.fetch(u, o), log: console.log });

  // gon://shots/<file> and gon://media/<file> serve images from the data folder only
  protocol.handle('gon', (req) => {
    const u = new URL(req.url);
    const bases = { shots: store.shotsDir, media: store.mediaDir, videos: store.videosDir, thumbs: store.thumbsDir };
    const base = bases[u.hostname];
    if (!base) return new Response('not found', { status: 404 });
    const file = path.join(base, path.basename(decodeURIComponent(u.pathname)));
    return net.fetch(fileUrl(file), { headers: rangeHeader(req) });
  });
  protocol.handle('journal-media', (req) => serveThemeSong(req));

  ipcMain.handle('logs:list', () => store.listLogs());
  ipcMain.handle('logs:create', (_e, d) => store.createLog(d));
  ipcMain.handle('logs:update', (_e, id, d) => store.updateLog(id, d));
  ipcMain.handle('logs:delete', (_e, id) => store.deleteLog(id));
  ipcMain.handle('logs:stats', () => computeStats(store.listLogs()));
  ipcMain.handle('shots:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Attach screenshots', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }] });
    if (r.canceled) return [];
    return r.filePaths.map(p => store.importScreenshot(p));
  });
  ipcMain.handle('shots:import', (_e, paths) => (paths || []).filter(Boolean).map(p => store.importScreenshot(p)));
  ipcMain.handle('shots:open', (_e, name) => shell.openPath(store.shotPath(name)));
  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:save', (_e, patch) => { const s = store.saveSettings(patch); schedulePoll(); return s; });
  ipcMain.handle('mentors:cache', () => store.getMentorCache());
  ipcMain.handle('mentors:poll', () => runPoll());
  ipcMain.handle('app:dataDir', () => store.dir);
  ipcMain.handle('app:openDataDir', () => shell.openPath(store.dir));
  ipcMain.handle('app:openExternal', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('updater:state', () => updateState.status === 'idle' && !app.isPackaged ? { status: 'dev', version: app.getVersion() } : updateState);
  ipcMain.handle('updater:check', () => checkForUpdates());
  ipcMain.handle('updater:install', () => {
    if (!autoUpdater || updateState.status !== 'ready') return false;
    // Silent install, then relaunch. This is the only path that restarts the app.
    autoUpdater.quitAndInstall(true, true);
    return true;
  });
  ipcMain.handle('song:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a theme song', properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'ogg'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return store.importThemeSong(r.filePaths[0]);
  });
  ipcMain.handle('song:clear', () => store.clearThemeSong());
  ipcMain.handle('edu:list', () => store.listEducation());
  ipcMain.handle('edu:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a video', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'mkv'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return r.filePaths[0];
  });
  ipcMain.handle('edu:create', async (_e, input) => {
    const data = { ...(input || {}) };
    if (data.srcPath) { data.file = store.importVideo(data.srcPath); delete data.srcPath; }
    let item = store.createEducation(data);
    if (item.url && !item.file) {
      const thumb = await fetchYoutubeThumb(item.url);
      if (thumb) item = store.updateEducation(item.id, { thumb });
    }
    return item;
  });
  ipcMain.handle('edu:update', (_e, id, patch) => store.updateEducation(id, patch));
  ipcMain.handle('edu:delete', (_e, id) => store.deleteEducation(id));
  ipcMain.handle('edu:thumb', (_e, id, dataUrl) => {
    const thumb = store.saveThumbDataUrl(dataUrl);
    return store.updateEducation(id, { thumb });
  });

  createWindow();
  setupAutoUpdater();
  schedulePoll();
  if (!process.env.GON_NO_POLL) setTimeout(runPoll, 4000); // first pull shortly after launch
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

const AUDIO_MIME = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };

function fileUrl(filePath) {
  // pathToFileURL leaves apostrophes raw. Chromium then refuses file URLs under
  // folders like "Cole's Journal", so the mp3 never reaches the player.
  return pathToFileURL(filePath).href.replace(/'/g, '%27');
}
function rangeHeader(req) {
  const range = req.headers && req.headers.get && req.headers.get('range');
  return range ? { Range: range } : {};
}
function serveThemeSong(req) {
  let file;
  try { file = store.songPath(new URL(req.url).pathname); }
  catch (e) { console.log('[theme-song]', e && e.message ? e.message : e); return new Response('not found', { status: 404 }); }
  if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
  const type = AUDIO_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  return net.fetch(fileUrl(file), { headers: rangeHeader(req) }).then((res) => {
    const headers = new Headers(res.headers);
    headers.set('content-type', type);
    headers.set('accept-ranges', 'bytes');
    return new Response(res.body, { status: res.status, headers });
  }).catch((e) => {
    console.log('[theme-song]', e && e.message ? e.message : e);
    return new Response('not found', { status: 404 });
  });
}

async function fetchYoutubeThumb(url) {
  const id = youtubeId(url);
  if (!id) return null;
  try {
    const res = await net.fetch('https://img.youtube.com/vi/' + id + '/hqdefault.jpg');
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 800) return null;
    return store.saveThumbBuffer(buf, '.jpg');
  } catch (e) { console.log('youtube thumb', e && e.message ? e.message : e); return null; }
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
