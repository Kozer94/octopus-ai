/**
 * 🛡️ Validator Layer
 * فحوصات deterministic فقط — true/false بدون AI
 * لا يتخذ قرارات ذكاء اصطناعي
 */

const path = require('path');
const fs = require('fs');
const { writeFile } = require('./truthLayer');

const PROTECTED_FILES = new Set([
  'package.json', 'package-lock.json', 'yarn.lock', 'bun.lockb',
  'main.js', 'preload.js',
  'server/index.js', 'server/truthLayer.js', 'server/validatorLayer.js',
  'server/brainController.js', 'server/executionEngine.js',
  'client/src/App.jsx',
]);

const SENSITIVE_PATTERNS = [
  '.env', '.env.local', '.env.production', '.env.development',
  '.key', '.pem', '.cert', '.crt', '.p12', '.pfx',
];

function isProtected(relPath) {
  const normalized = relPath.replace(/\\/g, '/').toLowerCase();
  const base = path.basename(normalized);
  if (PROTECTED_FILES.has(normalized) || PROTECTED_FILES.has(base)) return true;
  return SENSITIVE_PATTERNS.some(p =>
    base === p || base.startsWith(p + '.') || normalized.endsWith('/' + p)
  );
}

function isPathSafe(relPath, rootDir) {
  try {
    const full = path.resolve(rootDir, relPath);
    const rel  = path.relative(rootDir, full);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  } catch { return false; }
}

// ─── فحص ملف واحد قبل الكتابة ────────────────────────────────
function validateWrite(relPath, rootDir) {
  if (!relPath || typeof relPath !== 'string') {
    return { ok: false, reason: 'مسار فارغ' };
  }
  if (!isPathSafe(relPath, rootDir)) {
    return { ok: false, reason: `مسار خارج المشروع: ${relPath}` };
  }
  if (isProtected(relPath)) {
    return { ok: false, reason: `ملف محمي: ${relPath}` };
  }
  return { ok: true };
}

// ─── تطبيق الكتابة بعد الفحص ─────────────────────────────────
function safeWrite(projectDir, relPath, content) {
  const rootDir = require('path').resolve(projectDir || process.cwd());
  const check = validateWrite(relPath, rootDir);
  if (!check.ok) {
    console.warn(`🛡️ Validator رفض: ${check.reason}`);
    return { success: false, reason: check.reason };
  }
  try {
    const fullPath = writeFile(projectDir, relPath, content);
    console.log(`✅ كُتب: ${relPath}`);
    return { success: true, path: fullPath };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

function buildLineDiff(oldContent, newContent) {
  const oldLines = oldContent === '' ? [] : oldContent.split(/\r?\n/);
  const newLines = newContent === '' ? [] : newContent.split(/\r?\n/);
  const table = Array.from({ length: oldLines.length + 1 }, () =>
    Array(newLines.length + 1).fill(0)
  );

  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      table[i][j] = oldLines[i] === newLines[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const diff = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      diff.push(`- ${oldLines[i++]}`);
    } else {
      diff.push(`+ ${newLines[j++]}`);
    }
  }
  while (i < oldLines.length) diff.push(`- ${oldLines[i++]}`);
  while (j < newLines.length) diff.push(`+ ${newLines[j++]}`);

  return diff;
}

// ─── استخراج وكتابة الملفات من رد AI ────────────────────────
function extractAndWrite(aiResponse, projectDir) {
  const written = [];
  const rejected = [];
  const fileMatches = [...aiResponse.matchAll(/<file path="([^"]+)">([\s\S]*?)<\/file>/g)];
  const editMatches = [...aiResponse.matchAll(/<edit path="([^"]+)">[\s\S]*?<old>([\s\S]*?)<\/old>[\s\S]*?<new>([\s\S]*?)<\/new>[\s\S]*?<\/edit>/g)];
  const rootDir = path.resolve(projectDir || process.cwd());

  for (const match of fileMatches) {
    const relPath = match[1].trim();
    const content = match[2].trim();
    if (relPath.toLowerCase() === 'terminal') continue;
    const check = validateWrite(relPath, rootDir);
    if (!check.ok) {
      rejected.push({ path: relPath, reason: check.reason });
      continue;
    }
    const fullPath = path.resolve(rootDir, relPath);
    const oldContent = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : null;
    if (oldContent !== null) {
      rejected.push({ path: relPath, reason: 'استخدم <edit> لتعديل ملف موجود' });
      continue;
    }
    const diffLines = buildLineDiff(oldContent || '', content);
    written.push({
      path: relPath,
      size: content.length,
      oldContent: oldContent || null,
      newContent: content,
      diff: diffLines
    });
  }

  for (const match of editMatches) {
    const relPath = match[1].trim();
    const oldPart = match[2];
    const newPart = match[3];
    const check = validateWrite(relPath, rootDir);
    if (!check.ok) {
      rejected.push({ path: relPath, reason: check.reason });
      continue;
    }
    const fullPath = path.resolve(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
      rejected.push({ path: relPath, reason: 'الملف غير موجود، استخدم <file> لإنشاء ملف جديد' });
      continue;
    }
    const oldContent = fs.readFileSync(fullPath, 'utf8');
    if (!oldContent.includes(oldPart)) {
      rejected.push({ path: relPath, reason: 'النص القديم غير مطابق داخل الملف' });
      continue;
    }
    const content = oldContent.replace(oldPart, newPart);
    const diffLines = buildLineDiff(oldContent, content);
    written.push({
      path: relPath,
      size: content.length,
      oldContent: oldContent || null,
      newContent: content,
      diff: diffLines
    });
  }

  return { written, rejected };
}

// ─── استخراج terminal commands ───────────────────────────────
function extractTerminalCommands(aiResponse) {
  const matches = [...aiResponse.matchAll(/<terminal>([\s\S]*?)<\/terminal>/g)];
  return matches.map(m => m[1].trim()).filter(Boolean);
}

// ─── validateProjectBinding ──────────────────────────────────
function validateProjectBinding(projectDir, _clientProjectName = '') {
  if (!projectDir) return { ok: true, projectRoot: '' };
  try {
    const resolved = path.resolve(projectDir);
    if (!fs.statSync(resolved).isDirectory()) {
      return { ok: false, error: `Path is not a directory: ${projectDir}` };
    }
    return { ok: true, projectRoot: resolved };
  } catch (e) {
    return { ok: false, error: `Invalid project directory: ${e.message}` };
  }
}

module.exports = { validateWrite, safeWrite, extractAndWrite, extractTerminalCommands, isProtected, validateProjectBinding };
