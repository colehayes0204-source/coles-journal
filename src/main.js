'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Store, computeStats, youtubeId } = require('./store');

// Let the entrance theme song start without a click. Must be set before ready.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('high-dpi-support', '1');

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

let win, store;

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

function installAppMenu() {
  // The stock menu binds Ctrl/Cmd+W to close the window. That shortcut returns
  // to the start screen instead, so it is not a quit accelerator. The window X
  // button still closes the app.
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
  ];
  if (process.platform === 'darwin') {
    template.unshift({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const sized = /^(\d+)x(\d+)$/.exec(process.env.GON_SIZE || '');
  win = new BrowserWindow({
    width: sized ? Number(sized[1]) : 1440, height: sized ? Number(sized[2]) : 900, minWidth: 1000, minHeight: 660,
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

app.whenReady().then(() => {
  migrateLegacyData();
  store = new Store(app.getPath('userData'));

  // gon://shots/<file> and gon://media/<file> serve images from the data folder only
  protocol.handle('gon', (req) => {
    const u = new URL(req.url);
    const bases = { shots: store.shotsDir, media: store.mediaDir, videos: store.videosDir, thumbs: store.thumbsDir };
    const base = bases[u.hostname];
    if (!base) return new Response('not found', { status: 404 });
    const file = path.join(base, path.basename(decodeURIComponent(u.pathname)));
    return net.fetch(fileUrl(file), { headers: rangeHeader(req) });
  });
  protocol.handle('journal-media', (req) => serveJournalMedia(req));

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
  ipcMain.handle('settings:save', (_e, patch) => store.saveSettings(patch));
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
  ipcMain.handle('bg:add', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Add start screen backgrounds',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images and video', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov'] }],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return store.importBackgrounds(r.filePaths);
  });
  ipcMain.handle('bg:remove', (_e, id) => store.removeBackground(id));
  ipcMain.handle('bg:update', (_e, id, patch) => store.updateBackground(id, patch || {}));
  ipcMain.handle('bg:prefs', (_e, patch) => store.setStartPrefs(patch || {}));
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
  ipcMain.handle('edu:mentorAdd', (_e, name, color) => store.addEduMentor(name, color));
  ipcMain.handle('edu:mentorRename', (_e, id, name) => store.renameEduMentor(id, name));
  ipcMain.handle('edu:mentorColor', (_e, id, color) => store.recolorEduMentor(id, color));
  ipcMain.handle('edu:mentorRemove', (_e, id) => store.deleteEduMentor(id));
  ipcMain.handle('motivation:list', () => store.listMotivation());
  ipcMain.handle('motivation:create', (_e, input) => {
    const data = { ...(input || {}) };
    if (data.srcPath) { data.file = store.importMotiveVideo(data.srcPath); delete data.srcPath; data.kind = 'video'; }
    return store.createMotivation(data);
  });
  ipcMain.handle('motivation:update', (_e, id, patch) => store.updateMotivation(id, patch || {}));
  ipcMain.handle('motivation:remove', (_e, id) => store.deleteMotivation(id));
  ipcMain.handle('motivation:reorder', (_e, ids) => store.reorderMotivation(ids || []));
  ipcMain.handle('motivation:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a video', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'mkv', 'm4v'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return r.filePaths[0];
  });
  ipcMain.handle('recap:list', () => store.listRecaps());
  ipcMain.handle('recap:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Add video recaps', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'mkv', 'm4v'] }] });
    if (r.canceled) return [];
    return r.filePaths;
  });
  ipcMain.handle('recap:add', async (e, input) => {
    const data = input || {};
    const paths = data.srcPaths && data.srcPaths.length ? data.srcPaths : (data.srcPath ? [data.srcPath] : []);
    const added = [];
    if (!paths.length) {
      added.push(await store.addRecap(data));
      return store.listRecaps();
    }
    for (let i = 0; i < paths.length; i++) {
      const src = paths[i];
      const name = require('path').basename(src);
      added.push(await store.addRecap({ ...data, srcPath: src, title: data.title || name }, (ratio) => {
        if (!e.sender.isDestroyed()) e.sender.send('recap:progress', { name, index: i, total: paths.length, ratio });
      }));
    }
    return store.listRecaps();
  });
  ipcMain.handle('recap:update', (_e, id, patch) => store.updateRecap(id, patch || {}));
  ipcMain.handle('recap:remove', (_e, id) => store.deleteRecap(id));
  ipcMain.handle('recap:reorder', (_e, date, ids) => store.reorderRecaps(date, ids || []));

  installAppMenu();
  createWindow();
  setupAutoUpdater();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

const MEDIA_MIME = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.m4v': 'video/mp4',
};

function fileUrl(filePath) {
  // pathToFileURL leaves apostrophes raw. Chromium then refuses file URLs under
  // folders like "Cole's Journal", so the mp3 never reaches the player.
  return pathToFileURL(filePath).href.replace(/'/g, '%27');
}
function rangeHeader(req) {
  const range = req.headers && req.headers.get && req.headers.get('range');
  return range ? { Range: range } : {};
}
function serveJournalMedia(req) {
  let host = '';
  let name = '';
  try {
    const url = new URL(req.url);
    host = url.hostname;
    name = url.pathname;
  } catch (e) {
    return new Response('not found', { status: 404 });
  }
  const label = host === 'bg' ? '[background]' : host === 'recap' ? '[recap]' : host === 'motive' ? '[motivation]' : '[theme-song]';
  let file;
  try {
    if (host === 'bg') file = store.backgroundPath(name);
    else if (host === 'motive') file = store.motivePath(name);
    else if (host === 'recap') {
      const parts = String(name || '').split('/').filter(Boolean);
      file = store.recapPath(decodeURIComponent(parts[0] || ''), parts[1] || '');
    } else file = store.songPath(name);
  }
  catch (e) { console.log(label, e && e.message ? e.message : e); return new Response('not found', { status: 404 }); }
  if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
  const type = MEDIA_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  return net.fetch(fileUrl(file), { headers: rangeHeader(req) }).then((res) => {
    const headers = new Headers(res.headers);
    headers.set('content-type', type);
    headers.set('accept-ranges', 'bytes');
    return new Response(res.body, { status: res.status, headers });
  }).catch((e) => {
    console.log(label, e && e.message ? e.message : e);
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
