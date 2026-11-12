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
    mentorAdd: (name, color) => inv('edu:mentorAdd', name, color),
    mentorRename: (id, name) => inv('edu:mentorRename', id, name),
    mentorColor: (id, color) => inv('edu:mentorColor', id, color),
    mentorRemove: id => inv('edu:mentorRemove', id),
  },
  motivation: {
    list: () => inv('motivation:list'),
    create: d => inv('motivation:create', d),
    update: (id, p) => inv('motivation:update', id, p),
    remove: id => inv('motivation:remove', id),
    reorder: ids => inv('motivation:reorder', ids),
    pick: () => inv('motivation:pick'),
  },
  recap: {
    list: () => inv('recap:list'),
    pick: () => inv('recap:pick'),
    add: d => inv('recap:add', d),
    update: (id, p) => inv('recap:update', id, p),
    remove: id => inv('recap:remove', id),
    reorder: (date, ids) => inv('recap:reorder', date, ids),
    onProgress: cb => ipcRenderer.on('recap:progress', (_e, p) => cb(p)),
  },
  app: { dataDir: () => inv('app:dataDir'), openDataDir: () => inv('app:openDataDir'), openExternal: u => inv('app:openExternal', u), version: () => inv('app:version') },
  updater: {
    state: () => inv('updater:state'),
    check: () => inv('updater:check'),
    install: () => inv('updater:install'),
    onStatus: cb => ipcRenderer.on('updater:status', (_e, s) => cb(s)),
  },
  platform: process.platform,
});
