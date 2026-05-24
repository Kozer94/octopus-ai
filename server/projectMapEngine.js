const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { detectTaskType, detectComplexity } = require('./modelSelector');

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage',
  'vendor', '.cache', '__pycache__', 'pycache', '.idea', '.vscode', 'target',
  'out', '.output',
]);

const IGNORED_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.mp4', '.mp3',
  '.zip', '.rar', '.7z', '.exe', '.dll', '.woff', '.woff2', '.ttf',
]);

const IMPORTANT_FILE_NAMES = new Set([
  'readme.md', 'package.json', 'composer.json', 'pubspec.yaml',
  'requirements.txt', 'pyproject.toml', 'pom.xml', 'build.gradle',
  'vite.config.js', 'vite.config.ts', 'next.config.js', 'next.config.mjs',
  'nuxt.config.js', 'nuxt.config.ts', 'vue.config.js', 'tsconfig.json',
  'jsconfig.json', 'tailwind.config.js', 'eslint.config.js', 'artisan',
  'manage.py', 'app.py', 'main.py', 'index.js', 'server.js',
]);

const IMPORTANT_DIR_NAMES = new Set([
  'src', 'app', 'pages', 'api', 'routes', 'config', 'controllers',
  'middleware', 'services', 'components', 'layouts', 'views', 'resources',
  'public', 'lib', 'utils', 'models',
]);

const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.vue', '.php', '.py', '.java', '.dart',
  '.mjs', '.cjs',
]);

const CONFIG_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.toml', '.xml']);
const MAX_FILES = 20000;
const MAX_DEPTH = 18;
const MAX_DEPENDENCY_FILES = 2000;
const MAX_DEPENDENCY_FILE_SIZE = 512 * 1024;
const MAX_CONTEXT_FILES = 18;
const MAX_CONTEXT_FILE_SIZE = 220 * 1024;
const MAX_CONTEXT_CHARS = 90000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 12;

const projectMapCache = new Map();
const watcherCache = new Map();
const rebuildTimers = new Map();

function closeWatcher(watcher) {
  try {
    const result = watcher?.close?.();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch { }
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function normalizeRoot(projectDir) {
  return path.resolve(projectDir || process.cwd());
}

function isInsideRoot(fullPath, rootDir) {
  const rel = path.relative(rootDir, fullPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function shouldIgnoreDir(name) {
  const lower = String(name || '').toLowerCase();
  return IGNORED_DIRS.has(lower);
}

function shouldIgnoreFile(name) {
  const lower = String(name || '').toLowerCase();
  if (lower === '.env' || lower.startsWith('.env.') || lower.endsWith('.env')) return true;
  if (['package-lock.json', 'yarn.lock', 'bun.lockb', 'composer.lock'].includes(lower)) return true;
  if (lower.endsWith('.min.js') || lower.endsWith('.min.css')) return true;
  if (lower.endsWith('.map') || lower.endsWith('.lock')) return true;
  return IGNORED_FILE_EXTENSIONS.has(path.extname(lower));
}

function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) return 'javascript';
  if (ext === '.vue') return 'vue';
  if (ext === '.php') return 'php';
  if (ext === '.py') return 'python';
  if (ext === '.java') return 'java';
  if (ext === '.dart') return 'dart';
  if (['.json', '.yaml', '.yml', '.toml', '.xml'].includes(ext)) return 'config';
  if (['.md', '.txt'].includes(ext)) return 'docs';
  if (['.css', '.scss', '.sass', '.less'].includes(ext)) return 'style';
  return ext ? ext.slice(1) : 'unknown';
}

function isImportantPath(relPath, isDirectory = false) {
  const normalized = normalizePath(relPath).toLowerCase();
  const base = path.posix.basename(normalized);
  const parts = normalized.split('/');
  if (isDirectory) return IMPORTANT_DIR_NAMES.has(base);
  if (IMPORTANT_FILE_NAMES.has(base)) return true;
  return parts.some(part => IMPORTANT_DIR_NAMES.has(part));
}

function readJsonIfSmall(fullPath) {
  try {
    const stat = fs.statSync(fullPath);
    if (stat.size > MAX_CONTEXT_FILE_SIZE) return null;
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch {
    return null;
  }
}

function detectFrameworks(rootDir, fileIndex) {
  const frameworks = new Set();
  const dependencies = {};

  const packageEntries = [...fileIndex.entries()]
    .filter(([relPath]) => relPath === 'package.json' || relPath.endsWith('/package.json'))
    .map(([, entry]) => entry)
    .slice(0, 12);

  for (const packageEntry of packageEntries) {
    const pkg = readJsonIfSmall(packageEntry.fullPath);
    const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
    Object.assign(dependencies, deps);
    if (deps.react || deps['react-dom']) frameworks.add('React');
    if (deps.next || [...fileIndex.keys()].some(p => p.endsWith('next.config.js') || p.endsWith('next.config.mjs'))) frameworks.add('Next.js');
    if (deps.express) frameworks.add('Express');
    if (deps.vue) frameworks.add('Vue');
    if (deps.nuxt || [...fileIndex.keys()].some(p => p.endsWith('nuxt.config.js') || p.endsWith('nuxt.config.ts'))) frameworks.add('Nuxt');
    if (deps.vite || [...fileIndex.keys()].some(p => p.endsWith('vite.config.js') || p.endsWith('vite.config.ts'))) frameworks.add('Vite');
  }

  const composerEntries = [...fileIndex.entries()]
    .filter(([relPath]) => relPath === 'composer.json' || relPath.endsWith('/composer.json'))
    .map(([, entry]) => entry)
    .slice(0, 12);

  for (const composerEntry of composerEntries) {
    frameworks.add('PHP');
    const composer = readJsonIfSmall(composerEntry.fullPath);
    const deps = { ...(composer?.require || {}), ...(composer?.['require-dev'] || {}) };
    Object.assign(dependencies, deps);
    if (deps['laravel/framework'] || [...fileIndex.keys()].some(p => p.endsWith('/artisan') || p === 'artisan' || p.endsWith('routes/web.php'))) {
      frameworks.add('Laravel');
    }
  }

  if ([...fileIndex.keys()].some(p => p === 'pubspec.yaml' || p.endsWith('/pubspec.yaml'))) frameworks.add('Flutter');
  if ([...fileIndex.keys()].some(p => ['requirements.txt', 'pyproject.toml', 'manage.py'].includes(path.posix.basename(p)))) frameworks.add('Python');
  if ([...fileIndex.keys()].some(p => ['pom.xml', 'build.gradle'].includes(path.posix.basename(p)))) frameworks.add('Java');
  if ([...fileIndex.keys()].some(p => p.endsWith('.php'))) frameworks.add('PHP');

  return { frameworks: [...frameworks], dependencies };
}

function createNode(name, relPath, type, size = 0) {
  return {
    name,
    path: normalizePath(relPath),
    type,
    size,
    children: type === 'dir' ? [] : undefined,
  };
}

function sortTree(node) {
  if (!node.children) return node;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
  return node;
}

function buildTreeText(node, depth = 0, lines = []) {
  const prefix = depth === 0 ? '' : `${'  '.repeat(depth - 1)}- `;
  const suffix = node.type === 'dir' ? '/' : ` (${node.fileType || 'file'}, ${node.size}b)`;
  lines.push(`${prefix}${node.name}${suffix}`);
  if (node.children) {
    for (const child of node.children) buildTreeText(child, depth + 1, lines);
  }
  return lines;
}

function scanProject(rootDir) {
  const rootName = path.basename(rootDir) || rootDir;
  const tree = createNode(rootName, '.', 'dir');
  const files = [];
  const directories = [];
  const fileIndex = new Map();
  const importantFiles = [];
  const sourceFolders = new Set();
  const routes = [];
  const configFiles = [];
  const stats = {
    scannedFiles: 0,
    scannedDirs: 0,
    skippedFiles: 0,
    skippedDirs: 0,
    truncated: false,
    totalSize: 0,
  };

  function walk(dir, parent, depth) {
    if (depth > MAX_DEPTH || stats.scannedFiles >= MAX_FILES) {
      stats.truncated = true;
      return;
    }

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (stats.scannedFiles >= MAX_FILES) {
        stats.truncated = true;
        return;
      }

      const fullPath = path.join(dir, entry.name);
      const relPath = normalizePath(path.relative(rootDir, fullPath));
      if (!relPath || !isInsideRoot(fullPath, rootDir)) continue;

      if (entry.isDirectory()) {
        if (shouldIgnoreDir(entry.name)) {
          stats.skippedDirs += 1;
          continue;
        }

        const dirNode = createNode(entry.name, relPath, 'dir');
        parent.children.push(dirNode);
        directories.push(relPath);
        stats.scannedDirs += 1;
        if (isImportantPath(relPath, true)) sourceFolders.add(relPath);
        walk(fullPath, dirNode, depth + 1);
        continue;
      }

      if (!entry.isFile() || shouldIgnoreFile(entry.name)) {
        stats.skippedFiles += 1;
        continue;
      }

      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      const fileType = getFileType(entry.name);
      const fileNode = createNode(entry.name, relPath, 'file', stat.size);
      fileNode.fileType = fileType;
      parent.children.push(fileNode);

      const meta = {
        path: relPath,
        fullPath,
        name: entry.name,
        ext,
        type: fileType,
        size: stat.size,
        important: isImportantPath(relPath, false),
      };

      files.push(meta);
      fileIndex.set(relPath, meta);
      stats.scannedFiles += 1;
      stats.totalSize += stat.size;

      if (meta.important) importantFiles.push(relPath);
      if (CONFIG_EXTENSIONS.has(ext) || fileType === 'config') configFiles.push(relPath);
      if (SOURCE_EXTENSIONS.has(ext)) {
        const dirName = normalizePath(path.dirname(relPath));
        if (dirName && dirName !== '.') sourceFolders.add(dirName);
      }
      if (relPath.toLowerCase().includes('/routes/') || relPath.toLowerCase().startsWith('routes/')) {
        routes.push(relPath);
      }
      if (relPath.toLowerCase().includes('/api/') || relPath.toLowerCase().startsWith('api/')) {
        routes.push(relPath);
      }
    }
  }

  walk(rootDir, tree, 0);
  sortTree(tree);
  return {
    tree,
    treeText: buildTreeText(tree).join('\n'),
    files,
    directories,
    filePaths: files.map(file => file.path),
    fileIndex,
    importantFiles: [...new Set(importantFiles)].slice(0, 250),
    sourceFolders: [...sourceFolders].slice(0, 250),
    routes: [...new Set(routes)].slice(0, 250),
    configFiles: [...new Set(configFiles)].slice(0, 250),
    stats,
  };
}

function extractDependencies(content) {
  const deps = new Set();
  const patterns = [
    /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /export\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /include(?:_once)?\s*(?:\(?\s*)['"]([^'"]+)['"]/g,
    /require(?:_once)?\s*(?:\(?\s*)['"]([^'"]+)['"]/g,
    /from\s+([A-Za-z0-9_.]+)\s+import/g,
    /import\s+([A-Za-z0-9_.]+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content))) {
      deps.add(match[1]);
    }
  }

  return [...deps];
}

function resolveImportPath(fromRelPath, specifier, fileIndex) {
  if (!specifier || !specifier.startsWith('.')) return null;
  const fromDir = path.posix.dirname(normalizePath(fromRelPath));
  const base = normalizePath(path.posix.normalize(path.posix.join(fromDir, specifier)));
  const candidates = [
    base,
    ...[...SOURCE_EXTENSIONS, ...CONFIG_EXTENSIONS].map(ext => `${base}${ext}`),
    ...[...SOURCE_EXTENSIONS].map(ext => `${base}/index${ext}`),
  ];
  return candidates.find(candidate => fileIndex.has(candidate)) || null;
}

function buildDependencyGraph(rootDir, files, fileIndex) {
  const graph = {};
  const reverseGraph = {};
  let analyzed = 0;

  for (const file of files) {
    if (analyzed >= MAX_DEPENDENCY_FILES) break;
    if (!SOURCE_EXTENSIONS.has(file.ext) || file.size > MAX_DEPENDENCY_FILE_SIZE) continue;

    let content;
    try {
      content = fs.readFileSync(file.fullPath, 'utf8');
    } catch {
      continue;
    }

    const imports = extractDependencies(content);
    const internal = imports
      .map(specifier => resolveImportPath(file.path, specifier, fileIndex))
      .filter(Boolean);

    graph[file.path] = {
      imports,
      internal,
      exports: /\bexport\b|module\.exports|exports\./.test(content),
    };

    for (const target of internal) {
      if (!reverseGraph[target]) reverseGraph[target] = [];
      reverseGraph[target].push(file.path);
    }

    analyzed += 1;
  }

  return { graph, reverseGraph, analyzedFiles: analyzed };
}

function enforceCacheLimit() {
  if (projectMapCache.size <= MAX_CACHE_ENTRIES) return;
  const entries = [...projectMapCache.entries()].sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
  for (const [root] of entries.slice(0, projectMapCache.size - MAX_CACHE_ENTRIES)) {
    projectMapCache.delete(root);
    const watcher = watcherCache.get(root);
    if (watcher) closeWatcher(watcher);
    watcherCache.delete(root);
  }
}

function buildProjectMap(projectDir) {
  const rootDir = normalizeRoot(projectDir);
  const startedAt = Date.now();
  const scanned = scanProject(rootDir);
  const detection = detectFrameworks(rootDir, scanned.fileIndex);
  const dependencyGraph = buildDependencyGraph(rootDir, scanned.files, scanned.fileIndex);

  return {
    projectRoot: rootDir,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    tree: scanned.tree,
    treeText: scanned.treeText,
    filePaths: scanned.filePaths,
    fileTypes: scanned.files.reduce((acc, file) => {
      acc[file.path] = file.type;
      return acc;
    }, {}),
    fileSizes: scanned.files.reduce((acc, file) => {
      acc[file.path] = file.size;
      return acc;
    }, {}),
    files: scanned.files.map(({ fullPath, ...file }) => file),
    frameworks: detection.frameworks,
    framework: detection.frameworks[0] || 'Unknown',
    dependencies: detection.dependencies,
    dependencyGraph,
    importantFiles: scanned.importantFiles,
    sourceFolders: scanned.sourceFolders,
    routes: scanned.routes,
    configFiles: scanned.configFiles,
    stats: scanned.stats,
  };
}

function cacheProjectMap(projectDir, projectMap) {
  const rootDir = normalizeRoot(projectDir);
  projectMapCache.set(rootDir, {
    map: projectMap,
    lastAccessed: Date.now(),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  enforceCacheLimit();
  return projectMap;
}

function getCachedProjectMap(projectDir) {
  const rootDir = normalizeRoot(projectDir);
  const entry = projectMapCache.get(rootDir);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    projectMapCache.delete(rootDir);
    const watcher = watcherCache.get(rootDir);
    if (watcher) closeWatcher(watcher);
    watcherCache.delete(rootDir);
    return null;
  }
  entry.lastAccessed = Date.now();
  return entry.map;
}

function scheduleProjectMapRebuild(projectDir) {
  const rootDir = normalizeRoot(projectDir);
  const currentTimer = rebuildTimers.get(rootDir);
  if (currentTimer) clearTimeout(currentTimer);

  const timer = setTimeout(() => {
    rebuildTimers.delete(rootDir);
    try {
      cacheProjectMap(rootDir, buildProjectMap(rootDir));
    } catch (error) {
      console.warn(`Project Map rebuild failed: ${error.message}`);
    }
  }, 350);

  if (timer.unref) timer.unref();
  rebuildTimers.set(rootDir, timer);
}

function ensureProjectMap(projectDir, options = {}) {
  if (!projectDir) return null;
  const rootDir = normalizeRoot(projectDir);
  const cached = getCachedProjectMap(rootDir);
  if (cached && !options.force) {
    if (options.watch !== false) ensureProjectMapWatcher(rootDir);
    return cached;
  }

  const projectMap = cacheProjectMap(rootDir, buildProjectMap(rootDir));
  if (options.watch !== false) ensureProjectMapWatcher(rootDir);
  return projectMap;
}

function ensureProjectMapWatcher(projectDir) {
  const rootDir = normalizeRoot(projectDir);
  if (watcherCache.has(rootDir)) return watcherCache.get(rootDir);

  const watcher = chokidar.watch(rootDir, {
    ignored: watchedPath => {
      const rel = normalizePath(path.relative(rootDir, watchedPath));
      if (!rel || rel === '.') return false;
      const parts = rel.split('/');
      const base = parts[parts.length - 1] || '';
      return parts.some(shouldIgnoreDir) || shouldIgnoreFile(base);
    },
    persistent: false,
    ignoreInitial: true,
    depth: MAX_DEPTH,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 80 },
  });

  watcher.on('add', () => scheduleProjectMapRebuild(rootDir));
  watcher.on('change', () => scheduleProjectMapRebuild(rootDir));
  watcher.on('unlink', () => scheduleProjectMapRebuild(rootDir));
  watcher.on('addDir', () => scheduleProjectMapRebuild(rootDir));
  watcher.on('unlinkDir', () => scheduleProjectMapRebuild(rootDir));
  watcher.on('error', error => console.warn(`Project Map watcher error: ${error.message}`));

  watcherCache.set(rootDir, watcher);
  return watcher;
}

function tokenize(text) {
  const raw = String(text || '').toLowerCase();
  const tokens = raw.match(/[\p{L}\p{N}_-]+/gu) || [];
  const expanded = new Set(tokens);
  const synonyms = {
    login: ['auth', 'signin', 'session', 'user'],
    signin: ['login', 'auth', 'session'],
    auth: ['login', 'signin', 'session', 'middleware'],
    route: ['routes', 'router', 'api'],
    routes: ['route', 'router', 'api'],
    api: ['route', 'routes', 'service', 'client'],
    middleware: ['auth', 'guard'],
    database: ['model', 'migration', 'schema'],
    db: ['database', 'model', 'migration'],
  };
  for (const token of tokens) {
    for (const item of synonyms[token] || []) expanded.add(item);
  }
  return [...expanded].filter(token => token.length > 1);
}

function scoreFile(file, tokens, map) {
  const lowerPath = file.path.toLowerCase();
  const base = file.name.toLowerCase();
  let score = 0;

  if (file.important) score += 8;
  if (map.routes.includes(file.path)) score += 6;
  if (map.configFiles.includes(file.path)) score += 3;

  for (const token of tokens) {
    if (base.includes(token)) score += 18;
    if (lowerPath.includes(token)) score += 10;
    if (lowerPath.includes(`/${token}/`)) score += 14;
  }

  if (SOURCE_EXTENSIONS.has(file.ext)) score += 2;
  if (file.size > MAX_CONTEXT_FILE_SIZE) score -= 20;
  return score;
}

function expandWithDependencyNeighbors(selected, map) {
  const result = new Set(selected);
  const graph = map.dependencyGraph?.graph || {};
  const reverseGraph = map.dependencyGraph?.reverseGraph || {};

  for (const file of selected) {
    for (const dep of graph[file]?.internal || []) result.add(dep);
    for (const parent of reverseGraph[file] || []) result.add(parent);
  }

  return [...result];
}

function selectContextFiles(command, projectMap, activeFile = '') {
  if (!projectMap) return [];
  const activeRel = normalizePath(activeFile || '');
  const tokens = tokenize(command);
  
  // استخدام task type detection لتحسين الاختيار
  const taskType = detectTaskType(command);
  const complexity = detectComplexity(command);
  
  // تعديل scoring بناءً على نوع المهمة
  const scored = projectMap.files
    .map(file => {
      let baseScore = scoreFile(file, tokens, projectMap);
      
      // زيادة score للملفات المهمة في المهام المعينة
      if (taskType === 'debug' || taskType === 'refactor') {
        // للمهام التقنية، ركز على الملفات المصدرية
        if (['javascript', 'vue', 'php', 'python', 'java', 'dart'].includes(file.type)) {
          baseScore += 10;
        }
      }
      
      if (taskType === 'planning' || taskType === 'analysis') {
        // للتخطيط والتحليل، ركز على الملفات المهمة والـ config
        if (file.important || file.type === 'config') {
          baseScore += 8;
        }
      }
      
      if (taskType === 'testing') {
        // للاختبار، ركز على ملفات الاختبار والـ controllers
        if (file.path.includes('test') || file.path.includes('spec') || file.path.includes('controller')) {
          baseScore += 12;
        }
      }
      
      // للمهام المعقدة، زد عدد الملفات المسموحة
      return { file, score: baseScore };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));

  const selected = [];
  if (activeRel && projectMap.filePaths.includes(activeRel)) selected.push(activeRel);

  // تعديل الحد الأقصى بناءً على التعقيد
  const maxFiles = complexity === 'high' ? MAX_CONTEXT_FILES + 6 : MAX_CONTEXT_FILES;
  
  for (const item of scored) {
    if (selected.length >= maxFiles) break;
    if (!selected.includes(item.file.path)) selected.push(item.file.path);
  }

  if (selected.length === 0) {
    selected.push(...projectMap.importantFiles.slice(0, 8));
    selected.push(...projectMap.routes.slice(0, 6));
  }

  return expandWithDependencyNeighbors(selected, projectMap).slice(0, maxFiles);
}

function readSelectedFiles(projectDir, filePaths) {
  const rootDir = normalizeRoot(projectDir);
  const parts = [];
  let usedChars = 0;

  for (const relPath of filePaths) {
    const fullPath = path.resolve(rootDir, relPath);
    if (!isInsideRoot(fullPath, rootDir) || shouldIgnoreFile(path.basename(relPath))) continue;

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_CONTEXT_FILE_SIZE) continue;

    let content;
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const chunk = `### ${normalizePath(relPath)}\n\`\`\`\n${content}\n\`\`\``;
    if (usedChars + chunk.length > MAX_CONTEXT_CHARS) break;
    parts.push(chunk);
    usedChars += chunk.length;
  }

  return parts.join('\n\n');
}

function summarizeProjectMap(projectMap) {
  if (!projectMap) return 'لم يتم تحديد مجلد مشروع';
  return [
    'PROJECT MAP ENGINE',
    `Root: ${projectMap.projectRoot}`,
    `Frameworks: ${projectMap.frameworks.join(', ') || 'Unknown'}`,
    `Files: ${projectMap.stats.scannedFiles}, Dirs: ${projectMap.stats.scannedDirs}, Skipped: ${projectMap.stats.skippedFiles + projectMap.stats.skippedDirs}`,
    `Important files: ${projectMap.importantFiles.slice(0, 40).join(', ') || 'none'}`,
    `Source folders: ${projectMap.sourceFolders.slice(0, 40).join(', ') || 'none'}`,
    `Routes/API: ${projectMap.routes.slice(0, 40).join(', ') || 'none'}`,
    '',
    'Tree:',
    projectMap.treeText,
  ].join('\n');
}

function getProjectContextForTask(projectDir, command, activeFile = '', activeFileContent = '') {
  const projectMap = ensureProjectMap(projectDir);
  if (!projectMap) return activeFileContent || '';

  const selectedFiles = selectContextFiles(command, projectMap, activeFile);
  const selectedText = readSelectedFiles(projectDir, selectedFiles);
  const activeBlock = activeFileContent
    ? `### ${activeFile || 'active file'}\n\`\`\`\n${activeFileContent}\n\`\`\``
    : '';

  return [
    summarizeProjectMap(projectMap),
    `\nSelected context files:\n${selectedFiles.join('\n') || 'none'}`,
    activeBlock,
    selectedText,
  ].filter(Boolean).join('\n\n');
}

function clearProjectMapCache(projectDir = null) {
  if (!projectDir) {
    for (const watcher of watcherCache.values()) closeWatcher(watcher);
    watcherCache.clear();
    projectMapCache.clear();
    return;
  }
  const rootDir = normalizeRoot(projectDir);
  projectMapCache.delete(rootDir);
  const watcher = watcherCache.get(rootDir);
  if (watcher) closeWatcher(watcher);
  watcherCache.delete(rootDir);
}

module.exports = {
  buildProjectMap,
  ensureProjectMap,
  ensureProjectMapWatcher,
  getCachedProjectMap,
  getProjectContextForTask,
  summarizeProjectMap,
  selectContextFiles,
  clearProjectMapCache,
  projectMapCache,
  constants: {
    IGNORED_DIRS: [...IGNORED_DIRS],
    IGNORED_FILE_EXTENSIONS: [...IGNORED_FILE_EXTENSIONS],
    MAX_FILES,
    MAX_CONTEXT_FILES,
  },
};
