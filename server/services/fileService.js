const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const {
  validateProjectBinding,
  validateWrite,
  isProtected,
} = require('../validatorLayer');

const SENSITIVE_PATTERNS = [
  '.env', '.env.local', '.env.production', '.env.development', '.env.staging', '.env.test',
  '.key', '.pem', '.cert', '.crt', '.p12', '.pfx',
  'package-lock.json', 'yarn.lock', 'bun.lockb',
];

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__', 'vendor',
]);
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const DEFAULT_MAX_LIST_ITEMS = 1000;
const DEFAULT_MAX_LIST_DEPTH = 8;

function isSensitiveFile(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  const base = path.basename(normalized);
  return SENSITIVE_PATTERNS.some(pattern => {
    if (pattern.startsWith('.')) {
      return base === pattern || base.startsWith(pattern + '.') || normalized.endsWith('/' + pattern);
    }
    return base === pattern || normalized.endsWith('/' + pattern);
  });
}

function getProjectRoot(projectDir, clientProjectName = '') {
  const binding = projectDir
    ? validateProjectBinding(projectDir, clientProjectName)
    : { ok: true, projectRoot: process.cwd() };

  if (!binding.ok) {
    const error = new Error(binding.error || 'Invalid project directory');
    error.statusCode = 400;
    throw error;
  }

  return path.resolve(binding.projectRoot || process.cwd());
}

function getOperationRoot(projectDir, targetPath, clientProjectName = '') {
  if (projectDir) return getProjectRoot(projectDir, clientProjectName);
  if (targetPath && path.isAbsolute(targetPath)) return path.dirname(path.resolve(targetPath));
  return getProjectRoot('', clientProjectName);
}

function resolveInsideRoot(projectRoot, targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    const error = new Error('filePath مطلوب');
    error.statusCode = 400;
    throw error;
  }

  const root = path.resolve(projectRoot);
  const fullPath = path.resolve(root, targetPath);
  const relative = path.relative(root, fullPath);

  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('مسار ممنوع - يجب أن يكون داخل workspace فقط');
    error.statusCode = 403;
    throw error;
  }

  return { fullPath, relativePath: relative.replace(/\\/g, '/') };
}

function assertReadable(relativePath) {
  if (isSensitiveFile(relativePath)) {
    const error = new Error('ملف حساس - يمنع قراءته');
    error.statusCode = 403;
    throw error;
  }
}

function assertWritable(relativePath, projectRoot, options = {}) {
  if (options.protectCore) {
    const check = validateWrite(relativePath, projectRoot);
    if (!check.ok) {
      const error = new Error(check.reason);
      error.statusCode = 403;
      throw error;
    }
    return;
  }

  if (isSensitiveFile(relativePath)) {
    const error = new Error('ملف حساس - يمنع الكتابة فيه');
    error.statusCode = 403;
    throw error;
  }
}

function writeProjectFile({ projectDir, clientProjectName = '', filePath, content, protectCore = false }) {
  const projectRoot = getOperationRoot(projectDir, filePath, clientProjectName);
  const target = resolveInsideRoot(projectRoot, filePath);
  assertWritable(target.relativePath, projectRoot, { protectCore });

  fs.mkdirSync(path.dirname(target.fullPath), { recursive: true });
  fs.writeFileSync(target.fullPath, content ?? '', 'utf8');

  return {
    projectRoot,
    fullPath: target.fullPath,
    relativePath: target.relativePath,
  };
}

async function writeProjectFileAsync({ projectDir, clientProjectName = '', filePath, content, protectCore = false }) {
  const projectRoot = getOperationRoot(projectDir, filePath, clientProjectName);
  const target = resolveInsideRoot(projectRoot, filePath);
  assertWritable(target.relativePath, projectRoot, { protectCore });

  await fsp.mkdir(path.dirname(target.fullPath), { recursive: true });
  await fsp.writeFile(target.fullPath, content ?? '', 'utf8');

  return {
    projectRoot,
    fullPath: target.fullPath,
    relativePath: target.relativePath,
  };
}

function readProjectFile({ projectDir, clientProjectName = '', filePath }) {
  const projectRoot = getOperationRoot(projectDir, filePath, clientProjectName);
  const target = resolveInsideRoot(projectRoot, filePath);
  assertReadable(target.relativePath);

  const stat = fs.statSync(target.fullPath);
  if (!stat.isFile()) {
    const error = new Error('المسار ليس ملفاً');
    error.statusCode = 400;
    throw error;
  }

  return {
    projectRoot,
    fullPath: target.fullPath,
    relativePath: target.relativePath,
    content: fs.readFileSync(target.fullPath, 'utf8'),
  };
}

async function readProjectFileAsync({ projectDir, clientProjectName = '', filePath, maxBytes = DEFAULT_MAX_FILE_BYTES }) {
  const projectRoot = getOperationRoot(projectDir, filePath, clientProjectName);
  const target = resolveInsideRoot(projectRoot, filePath);
  assertReadable(target.relativePath);

  const stat = await fsp.stat(target.fullPath);
  if (!stat.isFile()) {
    const error = new Error('المسار ليس ملفاً');
    error.statusCode = 400;
    throw error;
  }
  if (stat.size > maxBytes) {
    const error = new Error(`الملف كبير جداً للقراءة عبر API (${stat.size} bytes)`);
    error.statusCode = 413;
    throw error;
  }

  return {
    projectRoot,
    fullPath: target.fullPath,
    relativePath: target.relativePath,
    size: stat.size,
    content: await fsp.readFile(target.fullPath, 'utf8'),
  };
}

function listProjectFiles(dirPath, allowedRoot = null) {
  const rootDir = path.resolve(dirPath || process.cwd());

  if (allowedRoot) {
    const norm = path.resolve(allowedRoot);
    if (rootDir !== norm && !rootDir.startsWith(norm + path.sep)) {
      const err = new Error('المسار خارج نطاق المشروع المسموح به');
      err.statusCode = 403;
      throw err;
    }
  }

  const stat = fs.statSync(rootDir);
  if (!stat.isDirectory()) {
    const error = new Error('المسار ليس مجلداً');
    error.statusCode = 400;
    throw error;
  }

  function readDir(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const dirs = [];
    const files = [];

    for (const item of items) {
      if (IGNORED_DIRS.has(item.name)) continue;
      if (isSensitiveFile(item.name)) continue;

      const fullItemPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        dirs.push({ name: item.name, type: 'dir', path: fullItemPath, children: readDir(fullItemPath) });
      } else {
        files.push({ name: item.name, type: 'file', path: fullItemPath });
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  }

  return {
    rootDir,
    name: path.basename(rootDir),
    items: readDir(rootDir),
  };
}

async function listProjectFilesAsync(dirPath, allowedRoot = null, {
  maxItems = DEFAULT_MAX_LIST_ITEMS,
  maxDepth = DEFAULT_MAX_LIST_DEPTH,
} = {}) {
  const rootDir = path.resolve(dirPath || process.cwd());
  let count = 0;
  let truncated = false;

  if (allowedRoot) {
    const norm = path.resolve(allowedRoot);
    if (rootDir !== norm && !rootDir.startsWith(norm + path.sep)) {
      const err = new Error('المسار خارج نطاق المشروع المسموح به');
      err.statusCode = 403;
      throw err;
    }
  }

  const stat = await fsp.stat(rootDir);
  if (!stat.isDirectory()) {
    const error = new Error('المسار ليس مجلداً');
    error.statusCode = 400;
    throw error;
  }

  async function readDir(dir, depth = 0) {
    if (count >= maxItems || depth > maxDepth) {
      truncated = true;
      return [];
    }

    const items = await fsp.readdir(dir, { withFileTypes: true });
    const dirs = [];
    const files = [];

    for (const item of items) {
      if (count >= maxItems) {
        truncated = true;
        break;
      }
      if (IGNORED_DIRS.has(item.name)) continue;
      if (isSensitiveFile(item.name)) continue;

      const fullItemPath = path.join(dir, item.name);
      count += 1;
      if (item.isDirectory()) {
        dirs.push({ name: item.name, type: 'dir', path: fullItemPath, children: await readDir(fullItemPath, depth + 1) });
      } else {
        files.push({ name: item.name, type: 'file', path: fullItemPath });
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  }

  return {
    rootDir,
    name: path.basename(rootDir),
    items: await readDir(rootDir),
    meta: {
      count,
      maxItems,
      maxDepth,
      truncated,
    },
  };
}

function deleteProjectFile({ projectDir, clientProjectName = '', filePath }) {
  const projectRoot = getOperationRoot(projectDir, filePath, clientProjectName);
  const target = resolveInsideRoot(projectRoot, filePath);

  if (isSensitiveFile(target.relativePath) || isProtected(target.relativePath)) {
    const error = new Error('ملف محمي أو حساس - يمنع حذفه');
    error.statusCode = 403;
    throw error;
  }

  const stat = fs.statSync(target.fullPath);
  if (!stat.isFile()) {
    const error = new Error('الحذف الحالي مخصص للملفات فقط');
    error.statusCode = 400;
    throw error;
  }

  fs.unlinkSync(target.fullPath);
  return { projectRoot, fullPath: target.fullPath, relativePath: target.relativePath };
}

async function deleteProjectFileAsync({ projectDir, clientProjectName = '', filePath }) {
  const projectRoot = getOperationRoot(projectDir, filePath, clientProjectName);
  const target = resolveInsideRoot(projectRoot, filePath);

  if (isSensitiveFile(target.relativePath) || isProtected(target.relativePath)) {
    const error = new Error('ملف محمي أو حساس - يمنع حذفه');
    error.statusCode = 403;
    throw error;
  }

  const stat = await fsp.stat(target.fullPath);
  if (!stat.isFile()) {
    const error = new Error('الحذف الحالي مخصص للملفات فقط');
    error.statusCode = 400;
    throw error;
  }

  await fsp.unlink(target.fullPath);
  return { projectRoot, fullPath: target.fullPath, relativePath: target.relativePath };
}

function renameProjectFile({ projectDir, clientProjectName = '', oldPath, newName }) {
  const projectRoot = getOperationRoot(projectDir, oldPath, clientProjectName);
  const oldTarget = resolveInsideRoot(projectRoot, oldPath);

  if (!newName || typeof newName !== 'string' || newName.includes('/') || newName.includes('\\')) {
    const error = new Error('اسم الملف الجديد غير صالح');
    error.statusCode = 400;
    throw error;
  }

  if (isSensitiveFile(oldTarget.relativePath) || isProtected(oldTarget.relativePath)) {
    const error = new Error('ملف محمي أو حساس - يمنع إعادة تسميته');
    error.statusCode = 403;
    throw error;
  }

  const newTarget = resolveInsideRoot(projectRoot, path.join(path.dirname(oldTarget.relativePath), newName));
  if (isSensitiveFile(newTarget.relativePath) || isProtected(newTarget.relativePath)) {
    const error = new Error('الاسم الجديد محمي أو حساس');
    error.statusCode = 403;
    throw error;
  }

  fs.renameSync(oldTarget.fullPath, newTarget.fullPath);
  return { projectRoot, oldPath: oldTarget.fullPath, newPath: newTarget.fullPath };
}

async function renameProjectFileAsync({ projectDir, clientProjectName = '', oldPath, newName }) {
  const projectRoot = getOperationRoot(projectDir, oldPath, clientProjectName);
  const oldTarget = resolveInsideRoot(projectRoot, oldPath);

  if (!newName || typeof newName !== 'string' || newName.includes('/') || newName.includes('\\')) {
    const error = new Error('اسم الملف الجديد غير صالح');
    error.statusCode = 400;
    throw error;
  }

  if (isSensitiveFile(oldTarget.relativePath) || isProtected(oldTarget.relativePath)) {
    const error = new Error('ملف محمي أو حساس - يمنع إعادة تسميته');
    error.statusCode = 403;
    throw error;
  }

  const newTarget = resolveInsideRoot(projectRoot, path.join(path.dirname(oldTarget.relativePath), newName));
  if (isSensitiveFile(newTarget.relativePath) || isProtected(newTarget.relativePath)) {
    const error = new Error('الاسم الجديد محمي أو حساس');
    error.statusCode = 403;
    throw error;
  }

  await fsp.rename(oldTarget.fullPath, newTarget.fullPath);
  return { projectRoot, oldPath: oldTarget.fullPath, newPath: newTarget.fullPath };
}

module.exports = {
  deleteProjectFile,
  deleteProjectFileAsync,
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_LIST_DEPTH,
  DEFAULT_MAX_LIST_ITEMS,
  getProjectRoot,
  getOperationRoot,
  isSensitiveFile,
  listProjectFiles,
  listProjectFilesAsync,
  readProjectFile,
  readProjectFileAsync,
  renameProjectFile,
  renameProjectFileAsync,
  resolveInsideRoot,
  writeProjectFile,
  writeProjectFileAsync,
};
