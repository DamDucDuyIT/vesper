const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const { spawn } = require('child_process');
const {
  getDiskOverview,
  scanDirectory,
  runSmartScan
} = require('./scanner');

let mainWindow = null;
let dirScanAbortController = null;
let smartScanAbortController = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Vesper',
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// IPC Handlers
// ============================================================================

ipcMain.handle('disk:overview', async () => {
  const overview = await getDiskOverview();
  const home = os.homedir();
  const shortcuts = [
    { label: 'Thư mục Home (~)', path: home, icon: '🏠', badge: 'Gốc Documents' },
    { label: 'Documents', path: path.join(home, 'Documents'), icon: '📄', badge: '' },
    { label: 'Downloads', path: path.join(home, 'Downloads'), icon: '⬇️', badge: '' },
    { label: 'Library (Ẩn)', path: path.join(home, 'Library'), icon: '📚', badge: 'System Data' },
    { label: 'Library/Caches', path: path.join(home, 'Library', 'Caches'), icon: '🧹', badge: 'An toàn xóa' },
    { label: 'Application Support', path: path.join(home, 'Library', 'Application Support'), icon: '📦', badge: 'App Data' },
    { label: 'Containers', path: path.join(home, 'Library', 'Containers'), icon: '🐳', badge: 'Sandbox/Docker' },
    { label: 'Thùng rác (~/.Trash)', path: path.join(home, '.Trash'), icon: '🗑️', badge: 'Trash' },
    { label: 'Desktop', path: path.join(home, 'Desktop'), icon: '🖥️', badge: '' },
    { label: 'Ổ đĩa ngoài (/Volumes)', path: '/Volumes', icon: '💾', badge: '' }
  ];
  return {
    ...overview,
    shortcuts
  };
});

ipcMain.handle('scan:directory', async (event, dirPath) => {
  if (dirScanAbortController) {
    dirScanAbortController.abort();
  }
  const controller = new AbortController();
  dirScanAbortController = controller;

  const targetDir = dirPath || os.homedir();

  try {
    const result = await scanDirectory(targetDir, {
      signal: controller.signal,
      onInitialList: (payload) => {
        if (!controller.signal.aborted && mainWindow && !mainWindow.isDestroyed()) {
          event.sender.send('scan:dir-initial', payload);
        }
      },
      onFolderSize: (payload) => {
        if (!controller.signal.aborted && mainWindow && !mainWindow.isDestroyed()) {
          event.sender.send('scan:dir-progress', payload);
        }
      }
    });
    return { ok: true, aborted: controller.signal.aborted, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('scan:cancel-directory', () => {
  if (dirScanAbortController) {
    dirScanAbortController.abort();
    dirScanAbortController = null;
  }
  return { ok: true };
});

ipcMain.handle('scan:smart-start', async (event, rootDir) => {
  if (smartScanAbortController) {
    smartScanAbortController.abort();
  }
  const controller = new AbortController();
  smartScanAbortController = controller;

  try {
    const items = await runSmartScan(rootDir || os.homedir(), {
      signal: controller.signal,
      onPhase: (phaseInfo) => {
        if (!controller.signal.aborted && mainWindow && !mainWindow.isDestroyed()) {
          event.sender.send('scan:smart-phase', phaseInfo);
        }
      },
      onItemFound: (item) => {
        if (!controller.signal.aborted && mainWindow && !mainWindow.isDestroyed()) {
          event.sender.send('scan:smart-item', item);
        }
      }
    });
    return { ok: true, aborted: controller.signal.aborted, items };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('scan:cancel-smart', () => {
  if (smartScanAbortController) {
    smartScanAbortController.abort();
    smartScanAbortController = null;
  }
  return { ok: true };
});

ipcMain.handle('dialog:pick-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn thư mục cần phân tích dung lượng',
    defaultPath: os.homedir(),
    properties: ['openDirectory', 'showHiddenFiles']
  });
  if (res.canceled || !res.filePaths.length) {
    return { canceled: true };
  }
  return { canceled: false, path: res.filePaths[0] };
});

ipcMain.handle('item:reveal-in-finder', async (_event, targetPath) => {
  if (!targetPath) return { ok: false };
  shell.showItemInFolder(targetPath);
  return { ok: true };
});

ipcMain.handle('item:open-terminal', async (_event, targetPath) => {
  if (!targetPath) return { ok: false };
  try {
    const stats = await fsp.stat(targetPath);
    const dir = stats.isDirectory() ? targetPath : path.dirname(targetPath);
    spawn('open', ['-a', 'Terminal', dir], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/**
 * Safety check to prevent deleting critical root folders accidentally.
 */
function isProtectedPath(targetPath) {
  const resolved = path.resolve(targetPath);
  const home = os.homedir();
  const protectedSet = new Set([
    '/',
    '/System',
    '/Users',
    '/Applications',
    '/Library',
    '/Volumes',
    home,
    path.join(home, 'Documents'),
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads'),
    path.join(home, 'Library')
  ]);
  return protectedSet.has(resolved);
}

ipcMain.handle('item:delete', async (event, { items, mode }) => {
  // items: Array<{ path, sizeBytes, name }>
  // mode: 'trash' | 'permanent'
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Không có mục nào được chọn để xóa.' };
  }

  const home = os.homedir();
  const trashDir = path.join(home, '.Trash');
  const results = [];
  let freedBytes = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const targetPath = item.path;

    if (mainWindow && !mainWindow.isDestroyed()) {
      event.sender.send('delete:progress', {
        current: i + 1,
        total: items.length,
        path: targetPath,
        name: item.name || path.basename(targetPath)
      });
    }

    if (isProtectedPath(targetPath)) {
      results.push({
        path: targetPath,
        ok: false,
        error: 'Thư mục hệ thống/gốc được bảo vệ, không cho phép xóa toàn bộ thư mục gốc này (hãy mở bên trong để xóa từng mục con).'
      });
      continue;
    }

    try {
      const isInTrash = targetPath === trashDir || targetPath.startsWith(trashDir + path.sep);

      if (mode === 'trash' && !isInTrash) {
        await shell.trashItem(targetPath);
      } else if (targetPath === trashDir) {
        // Empty ~/.Trash contents without deleting the ~/.Trash directory itself
        const entries = await fsp.readdir(trashDir);
        for (const entryName of entries) {
          await fsp.rm(path.join(trashDir, entryName), { recursive: true, force: true });
        }
      } else {
        await fsp.rm(targetPath, { recursive: true, force: true });
      }

      freedBytes += item.sizeBytes || 0;
      results.push({ path: targetPath, ok: true });
    } catch (err) {
      results.push({
        path: targetPath,
        ok: false,
        error: err.message
      });
    }
  }

  return {
    ok: true,
    results,
    succeededCount: results.filter((r) => r.ok).length,
    failedCount: results.filter((r) => !r.ok).length,
    freedBytes
  };
});

