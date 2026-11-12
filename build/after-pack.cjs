'use strict';
// electron-builder skips rcedit when signAndEditExecutable is false, so the
// Windows exe would keep the default Electron icon. Stamp the icon and the
// package version after pack, before NSIS wraps the folder.
const { spawnSync } = require('child_process');
const path = require('path');

async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const exe = path.join(context.appOutDir, 'ColesJournal.exe');
  const ico = path.join(__dirname, 'icon.ico');
  const script = path.join(__dirname, 'set-win-icon.mjs');
  const result = spawnSync(process.execPath, [script, exe, ico], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('set-win-icon failed with status ' + result.status);
  }
}

module.exports = afterPack;
module.exports.afterPack = afterPack;
