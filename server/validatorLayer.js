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

// ─── استخراج وكتابة الملفات من رد AI ────────────────────────
function extractAndWrite(aiResponse, projectDir) {
  const written = [];
  const rejected = [];
  const fileMatches = [...aiResponse.matchAll(/<file path="([^"]+)">([\s\S]*?)<\/file>/g)];

  for (const match of fileMatches) {
    const relPath = match[1].trim();
    const content = match[2].trim();
    if (relPath.toLowerCase() === 'terminal') continue;
    const result = safeWrite(projectDir, relPath, content);
    if (result.success) {
      written.push({ path: relPath, size: content.length });
    } else {
      rejected.push({ path: relPath, reason: result.reason });
    }
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