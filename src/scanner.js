const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

/**
 * Knowledge base of common macOS / Developer / Hidden folders
 * to explain what they are and whether they are safe to delete.
 */
const KNOWN_ITEMS = {
  '.Trash': {
    category: 'cache',
    safety: 'safe',
    label: 'Thùng rác người dùng (~/.Trash)',
    hint: 'Các file bạn đã xóa nhưng vẫn nằm trong Thùng rác và chiếm dung lượng ổ cứng. Xóa vĩnh viễn để giải phóng ngay.'
  },
  '.npm': {
    category: 'hidden-home',
    safety: 'safe',
    label: 'Bộ nhớ đệm npm (~/.npm)',
    hint: 'Cache các gói thư viện Node.js đã tải về. macOS xếp mục này vào "Documents" nhưng ẩn khỏi Finder. Xóa hoàn toàn an toàn.'
  },
  '.yarn': {
    category: 'hidden-home',
    safety: 'safe',
    label: 'Bộ nhớ đệm Yarn (~/.yarn)',
    hint: 'Cache các package của Yarn. Nằm ẩn trong Home nên làm phình mục Documents. Có thể xóa an toàn.'
  },
  '.pnpm-store': {
    category: 'hidden-home',
    safety: 'safe',
    label: 'Kho lưu trữ gói pnpm (~/.pnpm-store)',
    hint: 'Chứa hàng vạn file hardlink của pnpm. Xóa an toàn (cần chạy lại pnpm install cho dự án đang làm).'
  },
  '.bun': {
    category: 'hidden-home',
    safety: 'safe',
    label: 'Cache & Runtime Bun (~/.bun)',
    hint: 'Chứa global cache của Bun package manager. Có thể xóa ~/.bun/install/cache an toàn.'
  },
  '.cache': {
    category: 'hidden-home',
    safety: 'safe',
    label: 'Bộ nhớ đệm chung (~/.cache)',
    hint: 'Thư mục ẩn chứa cache của nhiều công cụ CLI, Python, HuggingFace, Playwright, pip... Xóa an toàn, công cụ sẽ tự tải lại khi cần.'
  },
  '.gradle': {
    category: 'hidden-home',
    safety: 'safe',
    label: 'Gradle Cache & Wrapper (~/.gradle)',
    hint: 'Thủ phạm cực lớn chứa hàng chục nghìn file build Java/Android. Nằm ẩn trong Home làm phình Documents.'
  },
  '.m2': {
    category: 'hidden-home',
    safety: 'safe',
    label: 'Maven Repository (~/.m2)',
    hint: 'Kho thư viện Java Maven đã tải về. Xóa an toàn, Maven sẽ tải lại khi build.'
  },
  '.cargo': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'Rust Cargo Cache & Binaries (~/.cargo)',
    hint: 'Chứa registry cache của Rust (có thể xóa ~/.cargo/registry và ~/.cargo/git an toàn).'
  },
  '.rustup': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'Rust Toolchains (~/.rustup)',
    hint: 'Chứa trình biên dịch Rust. Chỉ xóa nếu bạn không còn lập trình Rust hoặc muốn gỡ bớt toolchain cũ.'
  },
  '.cocoapods': {
    category: 'hidden-home',
    safety: 'safe',
    label: 'CocoaPods Repo & Cache (~/.cocoapods)',
    hint: 'Chứa hàng trăm nghìn file spec nhỏ của iOS CocoaPods. Xóa an toàn.'
  },
  '.pub-cache': {
    category: 'hidden-home',
    safety: 'safe',
    label: 'Dart / Flutter Pub Cache (~/.pub-cache)',
    hint: 'Chứa các package đã tải của Flutter/Dart. Xóa an toàn (chạy flutter pub get để tải lại).'
  },
  '.pyenv': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'Python Versions (~/.pyenv)',
    hint: 'Chứa các phiên bản Python cài qua pyenv và virtualenv. Kiểm tra các bản Python không dùng nữa.'
  },
  '.nvm': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'Node Version Manager (~/.nvm)',
    hint: 'Chứa các phiên bản Node.js và global node_modules. Có thể xóa các bản Node.js cũ không còn dùng.'
  },
  '.conda': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'Conda Environments (~/.conda)',
    hint: 'Chứa môi trường ảo và package Python/Data Science.'
  },
  '.ollama': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'Ollama AI Models (~/.ollama)',
    hint: 'Chứa các model AI chạy local (mỗi model nặng nhiều GB). Xóa nếu không còn dùng model đó.'
  },
  '.lmstudio': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'LM Studio Models (~/.lmstudio)',
    hint: 'Chứa các file model LLM GGUF dung lượng rất lớn nằm ẩn trong Home.'
  },
  '.docker': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'Docker Config & Data (~/.docker)',
    hint: 'Dữ liệu cấu hình và image/buildx của Docker.'
  },
  '.local': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'Dữ liệu ứng dụng CLI (~/.local)',
    hint: 'Thư mục ẩn chuẩn XDG chứa share/state/pipx/uv/nvim data. Thường rất nặng nhưng không hiện trong Finder.'
  },
  '.gemini': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'Dữ liệu Gemini / Antigravity (~/.gemini)',
    hint: 'Chứa dữ liệu cấu hình, browser profile, logs và brain của AI Agent.'
  },
  '.cursor': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'Cursor Extensions & Data (~/.cursor)',
    hint: 'Chứa các extension đã cài đặt của Cursor IDE.'
  },
  '.vscode': {
    category: 'hidden-home',
    safety: 'caution',
    label: 'VS Code Extensions (~/.vscode)',
    hint: 'Chứa các extension của Visual Studio Code (mỗi extension có thể nặng vài trăm MB).'
  },
  'node_modules': {
    category: 'dev-artifact',
    safety: 'safe',
    label: 'Thư viện Node.js (node_modules)',
    hint: 'Chứa hàng chục nghìn file nhỏ nên KHÔNG hiện trong Large Files nhưng ngốn hàng chục GB ở mục Documents! Xóa an toàn (chạy npm/yarn/pnpm install lại khi cần).'
  },
  '.next': {
    category: 'dev-artifact',
    safety: 'safe',
    label: 'Next.js Build Cache (.next)',
    hint: 'File cache và build tạm của dự án Next.js. Xóa hoàn toàn an toàn.'
  },
  '.nuxt': {
    category: 'dev-artifact',
    safety: 'safe',
    label: 'Nuxt Build Cache (.nuxt)',
    hint: 'File build tạm của Nuxt. Xóa hoàn toàn an toàn.'
  },
  '.turbo': {
    category: 'dev-artifact',
    safety: 'safe',
    label: 'Turborepo Cache (.turbo)',
    hint: 'Bộ nhớ đệm build của Turborepo. Xóa hoàn toàn an toàn.'
  },
  '.parcel-cache': {
    category: 'dev-artifact',
    safety: 'safe',
    label: 'Parcel Cache (.parcel-cache)',
    hint: 'Bộ nhớ đệm của Parcel bundler. Xóa hoàn toàn an toàn.'
  },
  '.venv': {
    category: 'dev-artifact',
    safety: 'safe',
    label: 'Môi trường ảo Python (.venv)',
    hint: 'Chứa hàng nghìn file thư viện Python. Xóa an toàn nếu dự án cũ không còn chạy (có thể tạo lại từ requirements.txt).'
  },
  'venv': {
    category: 'dev-artifact',
    safety: 'safe',
    label: 'Môi trường ảo Python (venv)',
    hint: 'Chứa hàng nghìn file thư viện Python. Xóa an toàn nếu dự án cũ không còn chạy.'
  },
  'target': {
    category: 'dev-artifact',
    safety: 'safe',
    label: 'Thư mục Build Rust/Java (target)',
    hint: 'Chứa artifact biên dịch của Rust Cargo hoặc Maven (thường nặng vài GB mỗi dự án). Xóa an toàn.'
  },
  'Pods': {
    category: 'dev-artifact',
    safety: 'safe',
    label: 'Thư viện iOS CocoaPods (Pods)',
    hint: 'Chứa dependencies của dự án iOS. Có thể chạy pod install lại bất cứ lúc nào.'
  },
  'DerivedData': {
    category: 'cache',
    safety: 'safe',
    label: 'Xcode DerivedData (Build Cache)',
    hint: 'Bộ nhớ đệm biên dịch của Xcode. Nổi tiếng chiếm từ 10GB - 50GB. Xóa hoàn toàn an toàn.'
  }
};

/**
 * Classify any path into a human-friendly descriptor with safety level.
 */
function classifyItem(fullPath, name, isDirectory) {
  const home = os.homedir();
  const relToHome = path.relative(home, fullPath);

  if (KNOWN_ITEMS[name]) {
    return { ...KNOWN_ITEMS[name] };
  }

  if (relToHome.startsWith('Library/Caches')) {
    return {
      category: 'cache',
      safety: 'safe',
      label: relToHome === 'Library/Caches' ? 'Toàn bộ Cache Ứng dụng (~/Library/Caches)' : `Cache ứng dụng (${name})`,
      hint: 'Bộ nhớ đệm tạm thời của các ứng dụng trên macOS. Xóa an toàn để giải phóng System Data / Documents.'
    };
  }

  if (relToHome.startsWith('Library/Logs') || relToHome.includes('CrashReporter')) {
    return {
      category: 'cache',
      safety: 'safe',
      label: `Nhật ký hệ thống & App (${name})`,
      hint: 'File log ghi lịch sử lỗi/hoạt động của ứng dụng. Xóa hoàn toàn an toàn.'
    };
  }

  if (relToHome.startsWith('Library/Developer/Xcode/DerivedData')) {
    return {
      category: 'cache',
      safety: 'safe',
      label: `Xcode Build Cache (${name})`,
      hint: 'File tạm sinh ra khi build project trên Xcode. Xóa hoàn toàn an toàn.'
    };
  }

  if (relToHome.startsWith('Library/Developer/Xcode/iOS DeviceSupport') || relToHome.startsWith('Library/Developer/CoreSimulator')) {
    return {
      category: 'cache',
      safety: 'caution',
      label: `Dữ liệu Simulator / iOS DeviceSupport (${name})`,
      hint: 'Các bản iOS Simulator hoặc debug symbol thiết bị cũ. Xóa an toàn các bản iOS cũ không còn test.'
    };
  }

  if (relToHome.startsWith('Library/Application Support')) {
    return {
      category: 'app-data',
      safety: 'careful',
      label: `Dữ liệu Ứng dụng (${name})`,
      hint: 'Chứa dữ liệu, cấu hình hoặc cache nội bộ của ứng dụng. Nếu bạn đã gỡ app này khỏi máy thì có thể xóa hoàn toàn.'
    };
  }

  if (relToHome.startsWith('Library/Containers') || relToHome.startsWith('Library/Group Containers')) {
    return {
      category: 'app-data',
      safety: 'careful',
      label: `Sandbox Container (${name})`,
      hint: 'Dữ liệu đóng gói của ứng dụng Mac App Store / Docker / Telegram / Zalo... Kiểm tra kỹ trước khi xóa.'
    };
  }

  if (name.startsWith('.')) {
    return {
      category: 'hidden-home',
      safety: 'caution',
      label: isDirectory ? `Thư mục ẩn (${name})` : `File ẩn (${name})`,
      hint: 'Thư mục/file bắt đầu bằng dấu chấm (.). macOS tính dung lượng mục này vào Documents nhưng ẩn khỏi Finder và File Browser mặc định!'
    };
  }

  if (!isDirectory) {
    const ext = path.extname(name).toLowerCase();
    if (['.dmg', '.iso', '.pkg', '.zip', '.tar', '.gz', '.rar', '.7z'].includes(ext)) {
      return {
        category: 'large-file',
        safety: 'safe',
        label: `File bộ cài / File nén (${ext})`,
        hint: 'File cài đặt hoặc file nén dung lượng lớn. Nếu đã cài đặt hoặc giải nén xong thì bạn có thể xóa.'
      };
    }
    if (['.gguf', '.safetensors', '.bin', '.pt', '.pth', '.onnx'].includes(ext)) {
      return {
        category: 'large-file',
        safety: 'caution',
        label: `File Model AI / Trọng số (${ext})`,
        hint: 'File mô hình AI dung lượng rất lớn.'
      };
    }
  }

  return {
    category: isDirectory ? 'folder' : 'file',
    safety: 'careful',
    label: isDirectory ? 'Thư mục dữ liệu' : 'Tập tin',
    hint: 'Dữ liệu trong máy của bạn. Hãy mở trong Finder để kiểm tra nếu chưa chắc chắn.'
  };
}

/**
 * Run `du -skx <targetPath>` to get exact physical disk usage in bytes on macOS.
 * Handles exit code 1 gracefully (when some sub-items are TCC/SIP protected).
 */
function getDiskUsageBytes(targetPath, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      return resolve(0);
    }

    const child = spawn('/usr/bin/du', ['-skx', targetPath], {
      stdio: ['ignore', 'pipe', 'ignore']
    });

    let stdout = '';
    const onAbort = () => {
      try {
        child.kill('SIGTERM');
      } catch (_) {}
      resolve(0);
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.on('error', () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve(0);
    });

    child.on('close', () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      const lines = stdout.trim().split('\n').filter(Boolean);
      if (lines.length === 0) {
        return resolve(0);
      }
      const lastLine = lines[lines.length - 1];
      const match = lastLine.match(/^(\d+)/);
      if (match) {
        const kb = parseInt(match[1], 10);
        return resolve(kb * 1024);
      }
      resolve(0);
    });
  });
}

/**
 * Run promises with a concurrency limit.
 */
async function mapConcurrent(items, concurrency, iteratorFn, signal) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      if (signal?.aborted) break;
      const currentIndex = index++;
      await iteratorFn(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
}

/**
 * Get disk overview for Macintosh HD and mounted volumes.
 */
async function getDiskOverview() {
  return new Promise((resolve) => {
    const child = spawn('/bin/df', ['-k'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.on('close', () => {
      const lines = stdout.trim().split('\n').slice(1);
      const volumes = [];
      for (const line of lines) {
        // Format: Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on
        const parts = line.trim().split(/\s+/);
        if (parts.length < 9) continue;
        const mountPoint = parts.slice(8).join(' ');
        const totalBytes = parseInt(parts[1], 10) * 1024;
        const usedBytes = parseInt(parts[2], 10) * 1024;
        const availBytes = parseInt(parts[3], 10) * 1024;
        if (
          mountPoint === '/' ||
          mountPoint === '/System/Volumes/Data' ||
          mountPoint.startsWith('/Volumes/')
        ) {
          volumes.push({
            filesystem: parts[0],
            mountPoint,
            name: mountPoint === '/' ? 'Macintosh HD (Root)' : mountPoint === '/System/Volumes/Data' ? 'Macintosh HD (Data)' : path.basename(mountPoint),
            totalBytes,
            usedBytes,
            availBytes,
            usedPercent: totalBytes > 0 ? Math.round(((totalBytes - availBytes) / totalBytes) * 100) : 0
          });
        }
      }
      resolve({
        homeDir: os.homedir(),
        volumes
      });
    });
    child.on('error', () => {
      resolve({ homeDir: os.homedir(), volumes: [] });
    });
  });
}

/**
 * Scan a single directory's immediate children (files + folders, including hidden ones),
 * emit immediate listing, and progressively compute folder sizes via parallel `du -skx`.
 */
async function scanDirectory(dirPath, { onInitialList, onFolderSize, signal } = {}) {
  let entries;
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Không thể đọc thư mục "${dirPath}": ${err.message}`);
  }

  const items = [];
  const foldersToMeasure = [];

  for (const entry of entries) {
    if (signal?.aborted) break;
    const name = entry.name;
    const fullPath = path.join(dirPath, name);

    let stats;
    try {
      stats = await fsp.lstat(fullPath);
    } catch (_) {
      continue;
    }

    const isSymlink = stats.isSymbolicLink();
    const isDirectory = stats.isDirectory() && !isSymlink;
    const isHidden = name.startsWith('.');
    const meta = classifyItem(fullPath, name, isDirectory);

    // Physical disk space for files (blocks * 512 handles sparse/dataless iCloud files accurately!)
    const fileSizeBytes = isDirectory
      ? 0
      : typeof stats.blocks === 'number' && stats.blocks > 0
      ? stats.blocks * 512
      : stats.size;

    const itemObj = {
      name,
      path: fullPath,
      isDirectory,
      isSymlink,
      isHidden,
      sizeBytes: fileSizeBytes,
      logicalSizeBytes: stats.size,
      calculating: isDirectory,
      mtimeMs: stats.mtimeMs,
      ...meta
    };

    items.push(itemObj);
    if (isDirectory) {
      foldersToMeasure.push(itemObj);
    }
  }

  if (onInitialList) {
    onInitialList({
      dirPath,
      items: [...items].sort((a, b) => b.sizeBytes - a.sizeBytes),
      totalFolders: foldersToMeasure.length
    });
  }

  let completedFolders = 0;
  await mapConcurrent(
    foldersToMeasure,
    6,
    async (folderItem) => {
      if (signal?.aborted) return;
      const sizeBytes = await getDiskUsageBytes(folderItem.path, signal);
      folderItem.sizeBytes = sizeBytes;
      folderItem.calculating = false;
      completedFolders++;
      if (onFolderSize && !signal?.aborted) {
        onFolderSize({
          dirPath,
          itemPath: folderItem.path,
          sizeBytes,
          completedFolders,
          totalFolders: foldersToMeasure.length
        });
      }
    },
    signal
  );

  items.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return {
    dirPath,
    items,
    totalSizeBytes: items.reduce((acc, it) => acc + (it.sizeBytes || 0), 0)
  };
}

/**
 * Helper to find nested developer/build artifact folders (`node_modules`, `.venv`, `target`, etc.)
 * using macOS native `/usr/bin/find` with `-prune` so it doesn't traverse inside them.
 */
function findArtifactDirectories(rootDir, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve([]);

    const home = os.homedir();
    const libraryPath = path.join(home, 'Library');
    const trashPath = path.join(home, '.Trash');

    // Prune Library, .Trash, .git, and stop descending once an artifact dir is matched
    const artifactNames = [
      'node_modules',
      '.venv',
      'venv',
      'target',
      '.next',
      '.nuxt',
      '.turbo',
      '.parcel-cache',
      'Pods',
      'DerivedData',
      '__pycache__',
      '.gradle'
    ];

    const args = [
      rootDir,
      '-xdev',
      '(',
      '-path', libraryPath,
      '-o', '-path', trashPath,
      '-o', '-name', '.git',
      ')',
      '-prune',
      '-o',
      '-type', 'd',
      '('
    ];

    artifactNames.forEach((name, idx) => {
      if (idx > 0) args.push('-o');
      args.push('-name', name);
    });
    args.push(')', '-print', '-prune');

    const child = spawn('/usr/bin/find', args, {
      stdio: ['ignore', 'pipe', 'ignore']
    });

    let stdout = '';
    const onAbort = () => {
      try { child.kill('SIGTERM'); } catch (_) {}
      resolve([]);
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.on('close', () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      const paths = stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      resolve(paths);
    });

    child.on('error', () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve([]);
    });
  });
}

/**
 * Helper to find individual large files >= minSizeMB (e.g. 100MB) across rootDir,
 * including inside hidden folders!
 */
function findLargeFiles(rootDir, minSizeMB = 100, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve([]);

    const args = [
      rootDir,
      '-xdev',
      '-type', 'f',
      '-size', `+${minSizeMB}M`,
      '-print'
    ];

    const child = spawn('/usr/bin/find', args, {
      stdio: ['ignore', 'pipe', 'ignore']
    });

    let stdout = '';
    const onAbort = () => {
      try { child.kill('SIGTERM'); } catch (_) {}
      resolve([]);
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.on('close', () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      const paths = stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      resolve(paths);
    });

    child.on('error', () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve([]);
    });
  });
}

/**
 * Comprehensive Smart Scan specifically designed to uncover why macOS "Documents" (60GB+)
 * and "System Data" (80GB+) are full when "Large Files" shows nothing.
 */
async function runSmartScan(rootDir, { onPhase, onItemFound, signal } = {}) {
  const home = rootDir || os.homedir();
  const discovered = [];
  const seenPaths = new Set();

  const emitItem = (item) => {
    if (signal?.aborted) return;
    if (seenPaths.has(item.path)) return;
    seenPaths.add(item.path);
    discovered.push(item);
    if (onItemFound) onItemFound(item);
  };

  // ============================================================================
  // PHASE 1: Hidden Dot-Folders & Dot-Files in Home (`~/.*`)
  // ============================================================================
  if (onPhase) {
    onPhase({
      phase: 1,
      totalPhases: 4,
      title: 'Đang quét các thư mục ẩn (~/.*) làm phình mục Documents...'
    });
  }

  let homeEntries = [];
  try {
    homeEntries = await fsp.readdir(home, { withFileTypes: true });
  } catch (_) {}

  const dotEntries = homeEntries.filter(
    (e) => e.name.startsWith('.') && e.name !== '.' && e.name !== '..'
  );

  await mapConcurrent(
    dotEntries,
    6,
    async (entry) => {
      if (signal?.aborted) return;
      const fullPath = path.join(home, entry.name);
      let stats;
      try {
        stats = await fsp.lstat(fullPath);
      } catch (_) {
        return;
      }
      if (stats.isSymbolicLink()) return;

      const isDirectory = stats.isDirectory();
      const sizeBytes = isDirectory
        ? await getDiskUsageBytes(fullPath, signal)
        : (typeof stats.blocks === 'number' && stats.blocks > 0 ? stats.blocks * 512 : stats.size);

      // Report any hidden item in Home >= 5 MB
      if (sizeBytes >= 5 * 1024 * 1024) {
        const meta = classifyItem(fullPath, entry.name, isDirectory);
        emitItem({
          name: entry.name,
          path: fullPath,
          isDirectory,
          isHidden: true,
          sizeBytes,
          mtimeMs: stats.mtimeMs,
          group: entry.name === '.Trash' ? 'caches-logs' : 'hidden-home',
          ...meta
        });
      }
    },
    signal
  );

  if (signal?.aborted) return discovered;

  // ============================================================================
  // PHASE 2: ~/Library Caches, Logs, Xcode/Developer, Application Support, Containers
  // ============================================================================
  if (onPhase) {
    onPhase({
      phase: 2,
      totalPhases: 4,
      title: 'Đang phân tích ~/Library (Caches, Logs, Developer, App Support, Containers)...'
    });
  }

  const libraryDir = path.join(home, 'Library');
  const librarySubTargets = [
    { rel: 'Caches', group: 'caches-logs', minMB: 15 },
    { rel: 'Logs', group: 'caches-logs', minMB: 10 },
    { rel: 'Developer/Xcode/DerivedData', group: 'caches-logs', minMB: 15 },
    { rel: 'Developer/Xcode/iOS DeviceSupport', group: 'caches-logs', minMB: 20 },
    { rel: 'Developer/Xcode/Archives', group: 'caches-logs', minMB: 20 },
    { rel: 'Developer/CoreSimulator/Caches', group: 'caches-logs', minMB: 15 },
    { rel: 'Developer/CoreSimulator/Devices', group: 'caches-logs', minMB: 50 },
    { rel: 'Application Support', group: 'app-data', minMB: 40 },
    { rel: 'Containers', group: 'app-data', minMB: 50 },
    { rel: 'Group Containers', group: 'app-data', minMB: 50 }
  ];

  for (const target of librarySubTargets) {
    if (signal?.aborted) break;
    const parentDir = path.join(libraryDir, target.rel);
    let children = [];
    try {
      children = await fsp.readdir(parentDir, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    await mapConcurrent(
      children,
      6,
      async (child) => {
        if (signal?.aborted) return;
        const fullPath = path.join(parentDir, child.name);
        let stats;
        try {
          stats = await fsp.lstat(fullPath);
        } catch (_) {
          return;
        }
        if (stats.isSymbolicLink()) return;
        const isDirectory = stats.isDirectory();
        const sizeBytes = isDirectory
          ? await getDiskUsageBytes(fullPath, signal)
          : (typeof stats.blocks === 'number' && stats.blocks > 0 ? stats.blocks * 512 : stats.size);

        if (sizeBytes >= target.minMB * 1024 * 1024) {
          const meta = classifyItem(fullPath, child.name, isDirectory);
          emitItem({
            name: `${target.rel}/${child.name}`,
            path: fullPath,
            isDirectory,
            isHidden: false,
            sizeBytes,
            mtimeMs: stats.mtimeMs,
            group: target.group,
            ...meta
          });
        }
      },
      signal
    );
  }

  if (signal?.aborted) return discovered;

  // ============================================================================
  // PHASE 3: Dev & Build Artifacts (`node_modules`, `.venv`, `target`, `.next`, etc.)
  // ============================================================================
  if (onPhase) {
    onPhase({
      phase: 3,
      totalPhases: 4,
      title: 'Đang tìm các ổ chứa hàng vạn file nhỏ (node_modules, .venv, target, .next...)'
    });
  }

  const artifactPaths = await findArtifactDirectories(home, signal);
  await mapConcurrent(
    artifactPaths,
    6,
    async (artPath) => {
      if (signal?.aborted) return;
      if (seenPaths.has(artPath)) return;
      let stats;
      try {
        stats = await fsp.lstat(artPath);
      } catch (_) {
        return;
      }
      const sizeBytes = await getDiskUsageBytes(artPath, signal);
      // Only include >= 10 MB
      if (sizeBytes >= 10 * 1024 * 1024) {
        const baseName = path.basename(artPath);
        const parentName = path.basename(path.dirname(artPath));
        const meta = classifyItem(artPath, baseName, true);
        emitItem({
          name: `${parentName}/${baseName}`,
          path: artPath,
          isDirectory: true,
          isHidden: baseName.startsWith('.'),
          sizeBytes,
          mtimeMs: stats.mtimeMs,
          group: 'dev-artifacts',
          ...meta
        });
      }
    },
    signal
  );

  if (signal?.aborted) return discovered;

  // ============================================================================
  // PHASE 4: Large Individual Files (>= 100 MB) including inside hidden folders
  // ============================================================================
  if (onPhase) {
    onPhase({
      phase: 4,
      totalPhases: 4,
      title: 'Đang quét các file đơn lẻ lớn (>= 100MB) kể cả trong thư mục ẩn...'
    });
  }

  const largeFilePaths = await findLargeFiles(home, 100, signal);
  await mapConcurrent(
    largeFilePaths,
    8,
    async (filePath) => {
      if (signal?.aborted) return;
      let stats;
      try {
        stats = await fsp.lstat(filePath);
      } catch (_) {
        return;
      }
      if (stats.isSymbolicLink() || stats.isDirectory()) return;
      const sizeBytes =
        typeof stats.blocks === 'number' && stats.blocks > 0
          ? stats.blocks * 512
          : stats.size;

      // Skip cloud-only (dataless) files that take < 100MB on physical disk!
      if (sizeBytes < 100 * 1024 * 1024) return;

      const baseName = path.basename(filePath);
      const meta = classifyItem(filePath, baseName, false);
      emitItem({
        name: baseName,
        path: filePath,
        isDirectory: false,
        isHidden: filePath.split(path.sep).some((part) => part.startsWith('.')),
        sizeBytes,
        mtimeMs: stats.mtimeMs,
        group: 'large-files',
        ...meta
      });
    },
    signal
  );

  discovered.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return discovered;
}

module.exports = {
  getDiskOverview,
  scanDirectory,
  runSmartScan,
  getDiskUsageBytes,
  classifyItem
};

