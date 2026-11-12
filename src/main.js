'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { Store, computeStats } = require('./store');
const { MentorFeed } = require('./mentors');

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

protocol.registerSchemesAsPrivileged([{ scheme: 'gon', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let win, store, feed, pollTimer;

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
    const base = u.hostname === 'shots' ? store.shotsDir : u.hostname === 'media' ? store.mediaDir : null;
    if (!base) return new Response('not found', { status: 404 });
    const file = path.join(base, path.basename(decodeURIComponent(u.pathname)));
    return net.fetch(pathToFileURL(file).toString());
  });

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

  createWindow();
  schedulePoll();
  if (!process.env.GON_NO_POLL) setTimeout(runPoll, 4000); // first pull shortly after launch
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
