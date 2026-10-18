const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('storageAPI', {
  getDiskOverview: () => ipcRenderer.invoke('disk:overview'),
  scanDirectory: (dirPath) => ipcRenderer.invoke('scan:directory', dirPath),
  cancelDirectoryScan: () => ipcRenderer.invoke('scan:cancel-directory'),
  startSmartScan: (rootDir) => ipcRenderer.invoke('scan:smart-start', rootDir),
  cancelSmartScan: () => ipcRenderer.invoke('scan:cancel-smart'),
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  revealInFinder: (targetPath) => ipcRenderer.invoke('item:reveal-in-finder', targetPath),
  openTerminal: (targetPath) => ipcRenderer.invoke('item:open-terminal', targetPath),
  deleteItems: (payload) => ipcRenderer.invoke('item:delete', payload),

  onDirInitial: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('scan:dir-initial', listener);
    return () => ipcRenderer.removeListener('scan:dir-initial', listener);
  },
  onDirProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('scan:dir-progress', listener);
    return () => ipcRenderer.removeListener('scan:dir-progress', listener);
  },
  onSmartPhase: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('scan:smart-phase', listener);
    return () => ipcRenderer.removeListener('scan:smart-phase', listener);
  },
  onSmartItem: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('scan:smart-item', listener);
    return () => ipcRenderer.removeListener('scan:smart-item', listener);
  },
  onDeleteProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('delete:progress', listener);
    return () => ipcRenderer.removeListener('delete:progress', listener);
  }
});

