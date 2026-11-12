'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('gon', {
  logs: { list: () => inv('logs:list'), create: d => inv('logs:create', d), update: (id, d) => inv('logs:update', id, d), remove: id => inv('logs:delete', id), stats: () => inv('logs:stats') },
  shots: { pick: () => inv('shots:pick'), importFiles: files => inv('shots:import', Array.from(files).map(f => webUtils.getPathForFile(f))), open: n => inv('shots:open', n) },
  settings: { get: () => inv('settings:get'), save: p => inv('settings:save', p) },
  song: { pick: () => inv('song:pick'), clear: () => inv('song:clear') },
  bg: {
    add: () => inv('bg:add'),
    remove: id => inv('bg:remove', id),
    update: (id, patch) => inv('bg:update', id, patch),
    prefs: patch => inv('bg:prefs', patch),
  },
  edu: {
    list: () => inv('edu:list'),
    pick: () => inv('edu:pick'),
    create: d => inv('edu:create', d),
    update: (id, p) => inv('edu:update', id, p),
    remove: id => inv('edu:delete', id),
    thumb: (id, dataUrl) => inv('edu:thumb', id, dataUrl),
  },
  mentors: { cache: () => inv('mentors:cache'), poll: () => inv('mentors:poll'), onUpdate: cb => ipcRenderer.on('mentors:updated', (_e, r) => cb(r)) },
  app: { dataDir: () => inv('app:dataDir'), openDataDir: () => inv('app:openDataDir'), openExternal: u => inv('app:openExternal', u), version: () => inv('app:version') },
  updater: {
    state: () => inv('updater:state'),
    check: () => inv('updater:check'),
    install: () => inv('updater:install'),
    onStatus: cb => ipcRenderer.on('updater:status', (_e, s) => cb(s)),
  },
  platform: process.platform,
});
