/* global storageAPI */

// ============================================================================
// Application State
// ============================================================================
const state = {
  mode: 'smart', // 'smart' | 'explorer'
  layout: 'split', // 'split' | 'list' | 'treemap'
  inspectorOpen: true,

  homeDir: '',
  volumes: [],
  shortcuts: [],

  // Smart Scan state
  smartScanning: false,
  smartHasScanned: false,
  smartItems: [],
  smartGroupFilter: 'all',
  smartSafetyFilter: 'all',

  // Explorer state
  currentDir: '',
  historyStack: [],
  dirScanning: false,
  dirItems: [],
  dirCache: new Map(),
  showHidden: true,

  // Shared Filter & Focus
  searchQuery: '',
  focusedPath: null,
  selectedItems: new Map(), // path -> item
  pendingDeleteMode: 'trash'
};

const GROUP_TITLES = {
  all: 'Tất cả phát hiện',
  'hidden-home': 'Thư mục ẩn trong Home (~/.*)',
  'dev-artifacts': 'Code & Build (node_modules, .venv...)',
  'caches-logs': 'Caches, Logs & Thùng rác',
  'app-data': 'Application Support & Containers',
  'large-files': 'File đơn lẻ lớn (≥ 100 MB)'
};

// ============================================================================
// Formatting & Icons
// ============================================================================
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const val = bytes / Math.pow(k, i);
  return `${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[i]}`;
}

function formatDate(ms) {
  if (!ms) return '—';
  try {
    const d = new Date(ms);
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (_) {
    return '—';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, durationMs = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
}

function getItemSvg(item) {
  if (item.name === '.Trash' || item.path.endsWith('/.Trash')) {
    return `<svg class="icon icon-red" viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15z"/></svg>`;
  }
  if (item.category === 'dev-artifact') {
    return `<svg class="icon icon-cyan" viewBox="0 0 16 16"><path d="M8.878.392a1.75 1.75 0 0 0-1.756 0l-5.25 3.045A1.75 1.75 0 0 0 1 4.951v6.098c0 .624.332 1.2.872 1.514l5.25 3.045a1.75 1.75 0 0 0 1.756 0l5.25-3.045c.54-.313.872-.89.872-1.514V4.951c0-.624-.332-1.2-.872-1.514L8.878.392z"/></svg>`;
  }
  if (item.category === 'cache') {
    return `<svg class="icon icon-green" viewBox="0 0 16 16"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/></svg>`;
  }
  if (item.isDirectory) {
    const colorClass = item.isHidden ? 'icon-violet' : 'icon-blue';
    return `<svg class="icon ${colorClass}" viewBox="0 0 16 16"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/></svg>`;
  }
  return `<svg class="icon icon-amber" viewBox="0 0 16 16"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25V1.75z"/></svg>`;
}

function getSafetyLabel(safety) {
  if (safety === 'safe') return { text: 'An toàn xóa', cls: 'safe' };
  if (safety === 'caution') return { text: 'Cân nhắc', cls: 'caution' };
  return { text: 'Cẩn trọng', cls: 'careful' };
}

function getTreemapTileColor(item) {
  if (item.safety === 'safe') return '#157f4b';
  if (item.category === 'dev-artifact') return '#0e7490';
  if (item.isHidden || item.category === 'hidden-home') return '#6d28d9';
  if (item.safety === 'caution') return '#b45309';
  if (!item.isDirectory) return '#9d174d';
  return '#1d4ed8';
}

// ============================================================================
// Balanced Binary Treemap
// ============================================================================
function computeTreemapRects(items, x, y, width, height) {
  if (!items.length || width <= 0 || height <= 0) return [];
  if (items.length === 1) {
    return [{ item: items[0], x, y, w: width, h: height }];
  }

  const total = items.reduce((sum, it) => sum + it.sizeBytes, 0);
  if (total <= 0) return [];

  let halfSum = 0;
  let splitIndex = 0;
  for (let i = 0; i < items.length; i++) {
    halfSum += items[i].sizeBytes;
    if (halfSum >= total / 2) {
      splitIndex = i + 1;
      break;
    }
  }
  if (splitIndex <= 0) splitIndex = 1;
  if (splitIndex >= items.length) splitIndex = items.length - 1;

  const leftItems = items.slice(0, splitIndex);
  const rightItems = items.slice(splitIndex);
  const leftWeight = leftItems.reduce((sum, it) => sum + it.sizeBytes, 0);
  const ratio = leftWeight / total;

  if (width >= height) {
    const leftW = Math.round(width * ratio);
    return [
      ...computeTreemapRects(leftItems, x, y, leftW, height),
      ...computeTreemapRects(rightItems, x + leftW, y, width - leftW, height)
    ];
  } else {
    const topH = Math.round(height * ratio);
    return [
      ...computeTreemapRects(leftItems, x, y, width, topH),
      ...computeTreemapRects(rightItems, x, y + topH, width, height - topH)
    ];
  }
}

function renderTreemapSurface(items) {
  const canvasEl = document.getElementById('treemapCanvas');
  canvasEl.innerHTML = '';

  const validItems = items
    .filter((it) => it.sizeBytes > 0)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 30);

  const totalBytes = items.reduce((acc, it) => acc + (it.sizeBytes || 0), 0);
  document.getElementById('treemapTotalLabel').textContent = formatBytes(totalBytes);

  if (validItems.length === 0) {
    return;
  }

  const width = canvasEl.clientWidth || 760;
  const height = canvasEl.clientHeight || 145;
  const rects = computeTreemapRects(validItems, 0, 0, width, height);

  const frag = document.createDocumentFragment();
  for (const r of rects) {
    if (r.w < 14 || r.h < 14) continue;
    const node = document.createElement('div');
    node.className = 'treemap-node';
    if (state.focusedPath === r.item.path) {
      node.classList.add('active');
    }
    node.dataset.path = r.item.path;
    node.style.left = `${r.x}px`;
    node.style.top = `${r.y}px`;
    node.style.width = `${r.w}px`;
    node.style.height = `${r.h}px`;
    node.style.background = getTreemapTileColor(r.item);
    node.title = `${r.item.name} (${formatBytes(r.item.sizeBytes)})\n${r.item.path}`;

    if (r.w >= 46 && r.h >= 22) {
      const label = document.createElement('div');
      label.className = 'treemap-node-label';
      label.textContent = r.item.name;
      node.appendChild(label);
    }

    if (r.w >= 54 && r.h >= 36) {
      const sizeEl = document.createElement('div');
      sizeEl.className = 'treemap-node-size';
      sizeEl.textContent = formatBytes(r.item.sizeBytes);
      node.appendChild(sizeEl);
    }

    node.addEventListener('click', () => {
      focusItem(r.item);
    });

    node.addEventListener('dblclick', () => {
      if (r.item.isDirectory) {
        switchToExplorer(r.item.path);
      } else {
        storageAPI.revealInFinder(r.item.path);
      }
    });

    frag.appendChild(node);
  }
  canvasEl.appendChild(frag);
}

// ============================================================================
// Disk Overview & Sidebar Shortcuts
// ============================================================================
async function loadDiskOverview() {
  const data = await storageAPI.getDiskOverview();
  state.homeDir = data.homeDir;
  state.volumes = data.volumes || [];
  state.shortcuts = data.shortcuts || [];

  if (!state.currentDir && state.homeDir) {
    state.currentDir = state.homeDir;
  }

  renderSidebarVolumes();
  renderSidebarShortcuts();
}

function renderSidebarVolumes() {
  const strip = document.getElementById('volumesStrip');
  if (!state.volumes.length) {
    strip.innerHTML = '';
    return;
  }

  strip.innerHTML = state.volumes
    .map((vol) => {
      const isHigh = vol.usedPercent >= 80;
      const usedReal = vol.totalBytes - vol.availBytes;
      return `
        <div class="volume-mini-card" data-mount="${escapeHtml(vol.mountPoint)}" title="Click để mở ${escapeHtml(vol.mountPoint)}">
          <div class="volume-mini-top">
            <span class="volume-mini-name">${escapeHtml(vol.name)}</span>
            <span class="volume-mini-free">Trống ${formatBytes(vol.availBytes)}</span>
          </div>
          <div class="volume-mini-bar">
            <div class="volume-mini-fill ${isHigh ? 'high' : ''}" style="width: ${vol.usedPercent}%"></div>
          </div>
          <div class="volume-mini-sub">
            Đã dùng ${formatBytes(usedReal)} / ${formatBytes(vol.totalBytes)} (${vol.usedPercent}%)
          </div>
        </div>
      `;
    })
    .join('');

  strip.querySelectorAll('.volume-mini-card').forEach((card) => {
    card.addEventListener('click', () => {
      const mount = card.getAttribute('data-mount');
      const target = mount === '/' || mount === '/System/Volumes/Data' ? state.homeDir : mount;
      switchToExplorer(target);
    });
  });
}

function renderSidebarShortcuts() {
  const list = document.getElementById('shortcutsList');
  list.innerHTML = state.shortcuts
    .map((sc) => {
      const isActive = state.mode === 'explorer' && state.currentDir === sc.path;
      return `
        <button class="sidebar-item ${isActive ? 'active' : ''}" data-path="${escapeHtml(sc.path)}">
          <span class="sidebar-item-left">
            <svg class="icon icon-blue" viewBox="0 0 16 16"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/></svg>
            <span class="sidebar-label">${escapeHtml(sc.label)}</span>
          </span>
          ${sc.badge ? `<span class="sidebar-badge">${escapeHtml(sc.badge)}</span>` : ''}
        </button>
      `;
    })
    .join('');

  list.querySelectorAll('.sidebar-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetPath = btn.getAttribute('data-path');
      switchToExplorer(targetPath);
    });
  });
}

function updateSidebarActiveState() {
  document.querySelectorAll('#smartCategoryBar .sidebar-item').forEach((btn) => {
    const g = btn.getAttribute('data-group');
    btn.classList.toggle('active', state.mode === 'smart' && state.smartGroupFilter === g);
  });
  renderSidebarShortcuts();
}

// ============================================================================
// Mode Switching (Smart vs Explorer)
// ============================================================================
function switchToSmartGroup(group) {
  state.mode = 'smart';
  state.smartGroupFilter = group || 'all';
  updateSidebarActiveState();
  syncToolbarForMode();
  renderMainWorkspace();
}

function switchToExplorer(dirPath) {
  state.mode = 'explorer';
  updateSidebarActiveState();
  syncToolbarForMode();
  navigateToDirectory(dirPath || state.currentDir || state.homeDir);
}

function syncToolbarForMode() {
  const isSmart = state.mode === 'smart';
  document.getElementById('explorerNavCluster').classList.toggle('hidden', isSmart);
  document.getElementById('smartTitleWrap').classList.toggle('hidden', !isSmart);
  document.getElementById('breadcrumbBar').classList.toggle('hidden', isSmart);
  document.getElementById('smartToolbarControls').classList.toggle('hidden', !isSmart);
  document.getElementById('explorerToolbarControls').classList.toggle('hidden', isSmart);

  if (isSmart) {
    document.getElementById('smartViewTitle').textContent =
      GROUP_TITLES[state.smartGroupFilter] || 'Tất cả phát hiện';
  }
}

// ============================================================================
// Smart Scan Execution
// ============================================================================
let renderDebounceTimer = null;
function scheduleWorkspaceRender() {
  if (renderDebounceTimer) return;
  renderDebounceTimer = setTimeout(() => {
    renderDebounceTimer = null;
    updateSmartSidebarCounts();
    renderMainWorkspace();
  }, 120);
}

async function startSmartScan() {
  if (state.smartScanning) return;
  state.smartScanning = true;
  state.smartHasScanned = true;
  state.smartItems = [];
  state.focusedPath = null;

  document.getElementById('startSmartScanBtn').classList.add('hidden');
  document.getElementById('cancelSmartScanBtn').classList.remove('hidden');
  document.getElementById('liveScanStrip').classList.remove('hidden');
  document.getElementById('liveScanText').textContent = 'Đang khởi động trình quét thông minh...';
  document.getElementById('liveScanFill').style.width = '10%';

  updateSmartSidebarCounts();
  renderMainWorkspace();

  const res = await storageAPI.startSmartScan(state.homeDir);
  state.smartScanning = false;

  document.getElementById('startSmartScanBtn').classList.remove('hidden');
  document.getElementById('cancelSmartScanBtn').classList.add('hidden');
  document.getElementById('liveScanStrip').classList.add('hidden');

  if (res && res.ok) {
    state.smartItems.sort((a, b) => b.sizeBytes - a.sizeBytes);
    updateSmartSidebarCounts();
    renderMainWorkspace();
    const totalBytes = state.smartItems.reduce((s, it) => s + it.sizeBytes, 0);
    showToast(`Hoàn tất quét: Phát hiện ${state.smartItems.length} mục (${formatBytes(totalBytes)})`);
  }
}

async function cancelSmartScan() {
  await storageAPI.cancelSmartScan();
  state.smartScanning = false;
  document.getElementById('startSmartScanBtn').classList.remove('hidden');
  document.getElementById('cancelSmartScanBtn').classList.add('hidden');
  document.getElementById('liveScanStrip').classList.add('hidden');
}

function updateSmartSidebarCounts() {
  const groups = ['all', 'hidden-home', 'dev-artifacts', 'caches-logs', 'app-data', 'large-files'];
  for (const g of groups) {
    const list = g === 'all' ? state.smartItems : state.smartItems.filter((it) => it.group === g);
    const sum = list.reduce((acc, it) => acc + (it.sizeBytes || 0), 0);
    const badge = document.getElementById(`catSize-${g}`);
    if (badge) {
      badge.textContent = sum > 0 ? formatBytes(sum) : state.smartHasScanned ? '0 B' : '—';
    }
  }

  const totalBytes = state.smartItems.reduce((acc, it) => acc + (it.sizeBytes || 0), 0);
  const sub = document.getElementById('smartFoundSummary');
  if (sub) {
    sub.textContent = state.smartHasScanned
      ? `${state.smartItems.length} mục • ${formatBytes(totalBytes)}`
      : 'Chưa quét';
  }
}

// ============================================================================
// Explorer Directory Navigation
// ============================================================================
async function navigateToDirectory(dirPath, { pushHistory = true, forceRescan = false } = {}) {
  if (!dirPath) return;

  if (pushHistory && state.currentDir && state.currentDir !== dirPath) {
    state.historyStack.push(state.currentDir);
  }
  state.currentDir = dirPath;
  state.focusedPath = null;

  renderBreadcrumbs();
  updateSidebarActiveState();

  if (!forceRescan && state.dirCache.has(dirPath)) {
    await storageAPI.cancelDirectoryScan();
    state.dirScanning = false;
    document.getElementById('liveScanStrip').classList.add('hidden');
    state.dirItems = state.dirCache.get(dirPath);
    renderMainWorkspace();
    return;
  }

  state.dirScanning = true;
  state.dirItems = [];
  document.getElementById('liveScanStrip').classList.remove('hidden');
  document.getElementById('liveScanText').textContent = `Đang đọc ${dirPath}...`;
  document.getElementById('liveScanFill').style.width = '8%';
  renderMainWorkspace();

  const res = await storageAPI.scanDirectory(dirPath);
  if (state.currentDir !== dirPath) return;

  state.dirScanning = false;
  document.getElementById('liveScanStrip').classList.add('hidden');

  if (!res.ok) {
    showToast(res.error || 'Không thể đọc thư mục.');
    return;
  }

  if (!res.aborted && res.items) {
    state.dirItems = res.items;
    state.dirCache.set(dirPath, res.items);
    renderMainWorkspace();
  }
}

function renderBreadcrumbs() {
  const bar = document.getElementById('breadcrumbBar');
  const dir = state.currentDir || '/';
  const parts = dir.split('/').filter(Boolean);

  let html = `<button class="crumb-btn ${parts.length === 0 ? 'current' : ''}" data-path="/">Macintosh HD</button>`;
  let accum = '';
  parts.forEach((part, idx) => {
    accum += '/' + part;
    const isCurrent = idx === parts.length - 1;
    html += `<span class="crumb-sep">›</span>`;
    html += `<button class="crumb-btn ${isCurrent ? 'current' : ''}" data-path="${escapeHtml(accum)}">${escapeHtml(part)}</button>`;
  });

  bar.innerHTML = html;
  bar.querySelectorAll('.crumb-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-path');
      if (target && target !== state.currentDir) {
        navigateToDirectory(target);
      }
    });
  });
}

// ============================================================================
// Active Items List Filtering
// ============================================================================
function getCurrentVisibleItems() {
  const q = state.searchQuery.trim().toLowerCase();

  if (state.mode === 'smart') {
    return state.smartItems
      .filter((item) => {
        if (state.smartGroupFilter !== 'all' && item.group !== state.smartGroupFilter) return false;
        if (state.smartSafetyFilter !== 'all' && item.safety !== state.smartSafetyFilter) return false;
        if (q) {
          const hay = `${item.name} ${item.path} ${item.label || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.sizeBytes - a.sizeBytes);
  } else {
    return state.dirItems
      .filter((item) => {
        if (!state.showHidden && item.isHidden) return false;
        if (q) {
          const hay = `${item.name} ${item.label || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.sizeBytes - a.sizeBytes);
  }
}

// ============================================================================
// Main Workspace Renderer (Empty State / Treemap / NSTableView / Inspector)
// ============================================================================
function renderMainWorkspace() {
  const emptyState = document.getElementById('smartEmptyState');
  const treemapSection = document.getElementById('treemapSection');
  const tableSection = document.getElementById('tableSection');

  if (state.mode === 'smart' && !state.smartHasScanned && !state.smartScanning) {
    emptyState.classList.remove('hidden');
    treemapSection.classList.add('hidden');
    tableSection.classList.add('hidden');
    renderInspector(null, []);
    updateStatusBar([]);
    return;
  }

  emptyState.classList.add('hidden');
  treemapSection.classList.remove('hidden');
  tableSection.classList.remove('hidden');

  const items = getCurrentVisibleItems();
  renderTreemapSurface(items);
  renderTableRows(items);

  const focusedItem = items.find((it) => it.path === state.focusedPath) || null;
  renderInspector(focusedItem, items);
  updateStatusBar(items);
}

function renderTableRows(items) {
  const tbody = document.getElementById('tableBody');

  if (items.length === 0) {
    const msg =
      state.smartScanning || state.dirScanning
        ? 'Đang phân tích dữ liệu ổ đĩa...'
        : 'Không có mục nào khớp với bộ lọc hiện tại.';
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding: 36px; color: var(--text-muted);">
          ${msg}
        </td>
      </tr>
    `;
    return;
  }

  const maxBytes = Math.max(...items.map((i) => i.sizeBytes || 0), 1);

  tbody.innerHTML = items
    .map((item) => {
      const isChecked = state.selectedItems.has(item.path);
      const isFocused = state.focusedPath === item.path;
      const safety = getSafetyLabel(item.safety);
      const pct = item.calculating ? 0 : Math.max(2, Math.round((item.sizeBytes / maxBytes) * 100));
      const sizeTone =
        item.sizeBytes >= 2 * 1024 * 1024 * 1024
          ? 'huge'
          : item.sizeBytes >= 300 * 1024 * 1024
          ? 'large'
          : '';
      const barTone = sizeTone === 'huge' ? 'huge' : safety.cls;

      return `
        <tr class="${isFocused ? 'row-focused' : ''}" data-path="${escapeHtml(item.path)}">
          <td class="cell-check">
            <input type="checkbox" class="row-check" data-path="${escapeHtml(item.path)}" ${isChecked ? 'checked' : ''} />
          </td>
          <td>
            <div class="cell-name-inner">
              ${getItemSvg(item)}
              <span class="row-title ${item.isDirectory ? 'folder-link' : ''}" data-open="${escapeHtml(item.path)}">
                ${escapeHtml(item.name)}
              </span>
              ${item.isHidden ? '<span class="tag-dot-hidden">.*</span>' : ''}
            </div>
          </td>
          <td class="cell-kind">${escapeHtml(item.label || (item.isDirectory ? 'Thư mục' : 'Tập tin'))}</td>
          <td class="cell-path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
          <td>
            <span class="safety-pill">
              <span class="safety-dot ${safety.cls}"></span>
              <span>${safety.text}</span>
            </span>
          </td>
          <td>
            <div class="cell-size-inner">
              <div class="micro-bar-track">
                <div class="micro-bar-fill ${barTone}" style="width: ${pct}%"></div>
              </div>
              <span class="size-num ${sizeTone}">
                ${item.calculating ? 'Đang tính…' : formatBytes(item.sizeBytes)}
              </span>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  const itemMap = new Map(items.map((it) => [it.path, it]));

  tbody.querySelectorAll('tr[data-path]').forEach((tr) => {
    const p = tr.getAttribute('data-path');
    const item = itemMap.get(p);
    if (!item) return;

    tr.addEventListener('click', (e) => {
      if (e.target.classList.contains('row-check')) return;
      focusItem(item);
    });

    tr.addEventListener('dblclick', (e) => {
      if (e.target.classList.contains('row-check')) return;
      if (item.isDirectory) {
        switchToExplorer(item.path);
      } else {
        storageAPI.revealInFinder(item.path);
      }
    });
  });

  tbody.querySelectorAll('.row-check').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const p = e.target.getAttribute('data-path');
      const item = itemMap.get(p);
      if (e.target.checked && item) {
        state.selectedItems.set(p, item);
      } else {
        state.selectedItems.delete(p);
      }
      updateSelectionBar();
    });
  });
}

function focusItem(item) {
  state.focusedPath = item ? item.path : null;

  document.querySelectorAll('#tableBody tr[data-path]').forEach((tr) => {
    tr.classList.toggle('row-focused', tr.getAttribute('data-path') === state.focusedPath);
  });

  document.querySelectorAll('#treemapCanvas .treemap-node').forEach((node) => {
    node.classList.toggle('active', node.dataset.path === state.focusedPath);
  });

  const items = getCurrentVisibleItems();
  renderInspector(item, items);
}

// ============================================================================
// Right-Hand Inspector Renderer
// ============================================================================
function renderInspector(item, currentList) {
  const pane = document.getElementById('inspectorPane');
  pane.classList.toggle('hidden', !state.inspectorOpen);
  if (!state.inspectorOpen) return;

  const container = document.getElementById('inspectorContent');

  if (!item) {
    const totalBytes = currentList.reduce((acc, it) => acc + (it.sizeBytes || 0), 0);
    const safeBytes = currentList
      .filter((it) => it.safety === 'safe')
      .reduce((acc, it) => acc + (it.sizeBytes || 0), 0);
    const hiddenBytes = currentList
      .filter((it) => it.isHidden || it.group === 'hidden-home')
      .reduce((acc, it) => acc + (it.sizeBytes || 0), 0);

    container.innerHTML = `
      <div class="inspector-hero">
        <div class="inspector-icon-box">
          <svg class="icon icon-blue" viewBox="0 0 16 16"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/></svg>
        </div>
        <div class="inspector-title">
          ${state.mode === 'smart' ? escapeHtml(GROUP_TITLES[state.smartGroupFilter]) : escapeHtml(state.currentDir || 'Tổng quan')}
        </div>
        <div class="inspector-size-big">${formatBytes(totalBytes)}</div>
      </div>

      <div class="inspector-card">
        <div class="inspector-card-title">Thống kê danh sách</div>
        <div class="inspector-meta-list">
          <div class="inspector-meta-row">
            <span class="inspector-meta-key">Số lượng mục</span>
            <span class="inspector-meta-val">${currentList.length} mục</span>
          </div>
          <div class="inspector-meta-row">
            <span class="inspector-meta-key">An toàn xóa ngay</span>
            <span class="inspector-meta-val text-green">${formatBytes(safeBytes)}</span>
          </div>
          <div class="inspector-meta-row">
            <span class="inspector-meta-key">Mục ẩn (.*)</span>
            <span class="inspector-meta-val">${formatBytes(hiddenBytes)}</span>
          </div>
        </div>
      </div>

      <div class="inspector-card">
        <div class="inspector-card-title">Mẹo thao tác nhanh</div>
        <div class="inspector-hint-text">
          • <strong>Click</strong> vào một dòng hoặc khối trên Treemap để xem chi tiết.<br/>
          • <strong>Double-click</strong> vào thư mục để đi sâu vào bên trong.<br/>
          • Tích chọn nhiều mục để dọn dẹp hàng loạt ở thanh công cụ phía dưới.
        </div>
      </div>
    `;
    return;
  }

  const safety = getSafetyLabel(item.safety);

  container.innerHTML = `
    <div class="inspector-hero">
      <div class="inspector-icon-box">
        ${getItemSvg(item)}
      </div>
      <div class="inspector-title">${escapeHtml(item.name)}</div>
      <div class="inspector-size-big">${item.calculating ? 'Đang tính…' : formatBytes(item.sizeBytes)}</div>
    </div>

    <div class="inspector-card">
      <div class="inspector-card-title">Chẩn đoán &amp; Ý nghĩa</div>
      <div style="margin-bottom: 6px;">
        <span class="safety-pill">
          <span class="safety-dot ${safety.cls}"></span>
          <strong>${safety.text}</strong>
        </span>
      </div>
      <div class="inspector-hint-text">
        ${escapeHtml(item.hint || 'Dữ liệu lưu trữ trên ổ đĩa của bạn.')}
      </div>
    </div>

    <div class="inspector-card">
      <div class="inspector-card-title">Thuộc tính</div>
      <div class="inspector-meta-list">
        <div class="inspector-meta-row">
          <span class="inspector-meta-key">Phân loại</span>
          <span class="inspector-meta-val">${escapeHtml(item.label || (item.isDirectory ? 'Thư mục' : 'Tập tin'))}</span>
        </div>
        <div class="inspector-meta-row">
          <span class="inspector-meta-key">Hiển thị Finder</span>
          <span class="inspector-meta-val">${item.isHidden ? 'Bị ẩn (.*)' : 'Hiển thị'}</span>
        </div>
        <div class="inspector-meta-row">
          <span class="inspector-meta-key">Sửa đổi</span>
          <span class="inspector-meta-val">${formatDate(item.mtimeMs)}</span>
        </div>
      </div>
    </div>

    <div>
      <div class="inspector-card-title" style="padding: 0 2px;">Đường dẫn đầy đủ</div>
      <div class="inspector-path-box">${escapeHtml(item.path)}</div>
    </div>

    <div class="inspector-actions">
      ${
        item.isDirectory
          ? `<button id="inspOpenDirBtn" class="mac-btn mac-btn-primary">Mở thư mục này</button>`
          : ''
      }
      <button id="inspFinderBtn" class="mac-btn">Hiển thị trong Finder</button>
      <button id="inspTerminalBtn" class="mac-btn">Mở trong Terminal</button>
      <button id="inspTrashBtn" class="mac-btn mac-btn-warning">Đưa vào Thùng rác</button>
      <button id="inspPermDeleteBtn" class="mac-btn mac-btn-danger">Xóa vĩnh viễn...</button>
    </div>
  `;

  const openBtn = document.getElementById('inspOpenDirBtn');
  if (openBtn) {
    openBtn.addEventListener('click', () => switchToExplorer(item.path));
  }
  document.getElementById('inspFinderBtn')?.addEventListener('click', () => {
    storageAPI.revealInFinder(item.path);
  });
  document.getElementById('inspTerminalBtn')?.addEventListener('click', () => {
    storageAPI.openTerminal(item.path);
  });
  document.getElementById('inspTrashBtn')?.addEventListener('click', () => {
    state.selectedItems.set(item.path, item);
    updateSelectionBar();
    openDeleteModal('trash');
  });
  document.getElementById('inspPermDeleteBtn')?.addEventListener('click', () => {
    state.selectedItems.set(item.path, item);
    updateSelectionBar();
    openDeleteModal('permanent');
  });
}

// ============================================================================
// Status Bar & Selection Bar
// ============================================================================
function updateStatusBar(visibleItems) {
  const totalBytes = visibleItems.reduce((acc, it) => acc + (it.sizeBytes || 0), 0);
  const hiddenCount = visibleItems.filter((it) => it.isHidden).length;
  document.getElementById('statusSummaryText').textContent =
    `${visibleItems.length} mục (${ hiddenCount } mục ẩn) • Tổng cộng ${formatBytes(totalBytes)}`;
  updateSelectionBar();
}

function updateSelectionBar() {
  const cluster = document.getElementById('selectionActionCluster');
  const count = state.selectedItems.size;
  if (count === 0) {
    cluster.classList.add('hidden');
    return;
  }

  cluster.classList.remove('hidden');
  let sumBytes = 0;
  for (const it of state.selectedItems.values()) {
    sumBytes += it.sizeBytes || 0;
  }
  document.getElementById('selectedCountBadge').textContent = `${count} mục`;
  document.getElementById('selectedSizeText').textContent = formatBytes(sumBytes);
}

// ============================================================================
// Delete Confirmation Sheet Modal
// ============================================================================
function openDeleteModal(mode) {
  if (state.selectedItems.size === 0) return;
  state.pendingDeleteMode = mode;

  const modal = document.getElementById('deleteModal');
  const titleEl = document.getElementById('modalTitle');
  const descEl = document.getElementById('modalDescription');
  const warningEl = document.getElementById('modalCarefulWarning');
  const listEl = document.getElementById('modalItemsList');
  const confirmBtn = document.getElementById('confirmModalBtn');
  const progressArea = document.getElementById('modalProgressArea');

  progressArea.classList.add('hidden');
  confirmBtn.disabled = false;

  const items = Array.from(state.selectedItems.values());
  const totalBytes = items.reduce((s, it) => s + (it.sizeBytes || 0), 0);
  const hasCareful = items.some((it) => it.safety === 'careful');

  warningEl.classList.toggle('hidden', !hasCareful);

  if (mode === 'trash') {
    titleEl.textContent = `Chuyển ${items.length} mục vào Thùng rác (${formatBytes(totalBytes)})`;
    descEl.innerHTML =
      'Các mục đã chọn sẽ được đưa vào <strong>Thùng rác của macOS</strong> (Nếu mục đã nằm trong <code>~/.Trash</code> thì sẽ được dọn sạch vĩnh viễn).';
    confirmBtn.textContent = `Đưa vào Thùng rác (${formatBytes(totalBytes)})`;
    confirmBtn.className = 'mac-btn mac-btn-warning';
  } else {
    titleEl.textContent = `Xóa vĩnh viễn ${items.length} mục (${formatBytes(totalBytes)})`;
    descEl.innerHTML =
      `Các mục bên dưới sẽ bị xóa vĩnh viễn và <strong>giải phóng ngay lập tức ${formatBytes(totalBytes)}</strong> trên ổ đĩa. Thao tác này không thể hoàn tác.`;
    confirmBtn.textContent = `Xóa Vĩnh Viễn (${formatBytes(totalBytes)})`;
    confirmBtn.className = 'mac-btn mac-btn-danger';
  }

  listEl.innerHTML = items
    .map(
      (it) => `
      <div class="modal-item-row">
        <span class="modal-item-path">${escapeHtml(it.path)}</span>
        <span class="modal-item-size">${formatBytes(it.sizeBytes)}</span>
      </div>
    `
    )
    .join('');

  modal.classList.remove('hidden');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.add('hidden');
}

async function executeConfirmedDelete() {
  const items = Array.from(state.selectedItems.values()).map((it) => ({
    path: it.path,
    name: it.name,
    sizeBytes: it.sizeBytes
  }));
  if (!items.length) return;

  const confirmBtn = document.getElementById('confirmModalBtn');
  const progressArea = document.getElementById('modalProgressArea');
  confirmBtn.disabled = true;
  progressArea.classList.remove('hidden');
  document.getElementById('modalProgressText').textContent = 'Đang xóa...';
  document.getElementById('modalProgressBar').style.width = '8%';

  const res = await storageAPI.deleteItems({
    items,
    mode: state.pendingDeleteMode
  });

  closeDeleteModal();

  if (!res || !res.ok) {
    showToast(res?.error || 'Có lỗi xảy ra khi xóa.');
    return;
  }

  const deletedSet = new Set(res.results.filter((r) => r.ok).map((r) => r.path));
  for (const delPath of deletedSet) {
    state.selectedItems.delete(delPath);
    if (state.focusedPath === delPath) state.focusedPath = null;
  }

  state.smartItems = state.smartItems.filter((it) => !deletedSet.has(it.path));
  state.dirItems = state.dirItems.filter((it) => !deletedSet.has(it.path));
  state.dirCache.clear();

  updateSmartSidebarCounts();
  renderMainWorkspace();
  await loadDiskOverview();

  const failed = res.results.filter((r) => !r.ok);
  if (failed.length > 0) {
    showToast(
      `Đã xóa ${res.succeededCount} mục (${formatBytes(res.freedBytes)}). Lỗi ${failed.length} mục: ${failed[0].error}`,
      5500
    );
  } else {
    showToast(`Đã giải phóng thành công ${formatBytes(res.freedBytes)} (${res.succeededCount} mục).`);
  }
}

// ============================================================================
// Initialization & Event Listeners
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  await loadDiskOverview();
  syncToolbarForMode();
  renderMainWorkspace();

  // Sidebar Smart Scan Category Click
  document.querySelectorAll('#smartCategoryBar .sidebar-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.getAttribute('data-group');
      switchToSmartGroup(group);
    });
  });

  // Segmented Layout Control (Split | List | Treemap)
  document.querySelectorAll('.segmented-control .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.segmented-control .seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.layout = btn.getAttribute('data-layout');
      document.getElementById('dataPane').setAttribute('data-layout', state.layout);
      renderMainWorkspace();
    });
  });

  // Inspector Toggle
  document.getElementById('toggleInspectorBtn').addEventListener('click', (e) => {
    state.inspectorOpen = !state.inspectorOpen;
    e.currentTarget.classList.toggle('active', state.inspectorOpen);
    renderMainWorkspace();
  });

  // Smart Scan Buttons
  document.getElementById('startSmartScanBtn').addEventListener('click', startSmartScan);
  document.getElementById('emptyStateStartBtn').addEventListener('click', startSmartScan);
  document.getElementById('cancelSmartScanBtn').addEventListener('click', cancelSmartScan);

  document.getElementById('smartSelectSafeBtn').addEventListener('click', () => {
    const visible = getCurrentVisibleItems();
    const safeList = (visible.length ? visible : state.smartItems).filter((it) => it.safety === 'safe');
    if (safeList.length === 0) {
      showToast('Chưa có mục Safe nào. Hãy bấm "Quét Hệ Thống" trước.');
      return;
    }
    safeList.forEach((it) => state.selectedItems.set(it.path, it));
    renderMainWorkspace();
    showToast(`Đã chọn ${safeList.length} mục an toàn để xóa.`);
  });

  document.getElementById('smartSafetyFilter').addEventListener('change', (e) => {
    state.smartSafetyFilter = e.target.value;
    renderMainWorkspace();
  });

  // Explorer Toolbar Buttons
  document.getElementById('navBackBtn').addEventListener('click', () => {
    if (state.historyStack.length === 0) return;
    const prev = state.historyStack.pop();
    navigateToDirectory(prev, { pushHistory: false });
  });

  document.getElementById('navUpBtn').addEventListener('click', () => {
    if (!state.currentDir || state.currentDir === '/') return;
    const parent = state.currentDir.split('/').slice(0, -1).join('/') || '/';
    navigateToDirectory(parent);
  });

  document.getElementById('navRescanBtn').addEventListener('click', () => {
    if (state.mode === 'explorer' && state.currentDir) {
      navigateToDirectory(state.currentDir, { pushHistory: false, forceRescan: true });
    }
  });

  document.getElementById('pickCustomFolderBtn').addEventListener('click', async () => {
    const res = await storageAPI.pickFolder();
    if (!res.canceled && res.path) {
      switchToExplorer(res.path);
    }
  });

  document.getElementById('refreshDiskBtn').addEventListener('click', async () => {
    await loadDiskOverview();
    showToast('Đã cập nhật dung lượng ổ đĩa.');
  });

  document.getElementById('showHiddenToggle').addEventListener('change', (e) => {
    state.showHidden = e.target.checked;
    renderMainWorkspace();
  });

  // Search Input
  document.getElementById('globalSearchInput').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderMainWorkspace();
  });

  // Select All Checkbox
  document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
    const items = getCurrentVisibleItems();
    if (e.target.checked) {
      items.forEach((it) => state.selectedItems.set(it.path, it));
    } else {
      items.forEach((it) => state.selectedItems.delete(it.path));
    }
    renderMainWorkspace();
  });

  // Selection Action Bar & Modal
  document.getElementById('clearSelectionBtn').addEventListener('click', () => {
    state.selectedItems.clear();
    document.getElementById('selectAllCheckbox').checked = false;
    renderMainWorkspace();
  });

  document.getElementById('deleteTrashBtn').addEventListener('click', () => openDeleteModal('trash'));
  document.getElementById('deletePermanentBtn').addEventListener('click', () => openDeleteModal('permanent'));
  document.getElementById('cancelModalBtn').addEventListener('click', closeDeleteModal);
  document.getElementById('confirmModalBtn').addEventListener('click', executeConfirmedDelete);

  // Keyboard Shortcuts (↑/↓ to navigate rows, Enter to open folder, Cmd+F to search)
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      document.getElementById('globalSearchInput').focus();
      return;
    }

    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') {
      return;
    }

    const items = getCurrentVisibleItems();
    if (!items.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = items.findIndex((it) => it.path === state.focusedPath);
      const nextIdx =
        e.key === 'ArrowDown'
          ? Math.min(items.length - 1, idx + 1)
          : Math.max(0, idx <= 0 ? 0 : idx - 1);
      focusItem(items[nextIdx]);
      const rowEl = document.querySelector(`#tableBody tr[data-path="${CSS.escape(items[nextIdx].path)}"]`);
      rowEl?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && state.focusedPath) {
      const item = items.find((it) => it.path === state.focusedPath);
      if (item && item.isDirectory) {
        switchToExplorer(item.path);
      }
    }
  });

  window.addEventListener('resize', () => {
    const items = getCurrentVisibleItems();
    if (items.length) renderTreemapSurface(items);
  });

  // IPC Streaming Listeners
  storageAPI.onSmartPhase((info) => {
    const pct = Math.round(((info.phase - 0.5) / info.totalPhases) * 100);
    document.getElementById('liveScanText').textContent = `[Bước ${info.phase}/${info.totalPhases}] ${info.title}`;
    document.getElementById('liveScanFill').style.width = `${pct}%`;
  });

  storageAPI.onSmartItem((item) => {
    state.smartItems.push(item);
    scheduleWorkspaceRender();
  });

  storageAPI.onDirInitial((payload) => {
    if (payload.dirPath !== state.currentDir) return;
    state.dirItems = payload.items || [];
    if (state.mode === 'explorer') renderMainWorkspace();
  });

  storageAPI.onDirProgress((payload) => {
    if (payload.dirPath !== state.currentDir) return;
    const target = state.dirItems.find((it) => it.path === payload.itemPath);
    if (target) {
      target.sizeBytes = payload.sizeBytes;
      target.calculating = false;
    }
    const pct = payload.totalFolders > 0 ? Math.round((payload.completedFolders / payload.totalFolders) * 100) : 100;
    document.getElementById('liveScanText').textContent =
      `Đang tính dung lượng: ${payload.completedFolders}/${payload.totalFolders} thư mục (${pct}%)...`;
    document.getElementById('liveScanFill').style.width = `${pct}%`;
    scheduleWorkspaceRender();
  });

  storageAPI.onDeleteProgress((info) => {
    const pct = Math.round((info.current / info.total) * 100);
    document.getElementById('modalProgressText').textContent =
      `Đang xóa (${info.current}/${info.total}): ${info.name}...`;
    document.getElementById('modalProgressBar').style.width = `${pct}%`;
  });
});
