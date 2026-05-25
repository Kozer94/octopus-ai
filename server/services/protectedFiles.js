const path = require('path');

const PROTECTED_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'main.js',
  'preload.js',
  'server/index.js',
  'server/truthLayer.js',
  'server/validatorLayer.js',
  'server/brainController.js',
  'server/executionEngine.js',
  'client/src/App.jsx',
]);

const SENSITIVE_PATTERNS = Object.freeze([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.staging',
  '.env.test',
  '.key',
  '.pem',
  '.cert',
  '.crt',
  '.p12',
  '.pfx',
]);

const PROTECTED_SET = new Set(PROTECTED_PATHS.map(normalizeProtectedPath));

function normalizeProtectedPath(filePath = '') {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase();
}

function isProtectedFile(filePath = '') {
  const normalized = normalizeProtectedPath(filePath);
  const base = path.posix.basename(normalized);

  if (PROTECTED_SET.has(normalized) || PROTECTED_SET.has(base)) return true;

  return [...PROTECTED_SET].some(protectedPath =>
    normalized.endsWith(`/${protectedPath}`)
  );
}

function isSensitiveProtectedFile(filePath = '') {
  const normalized = normalizeProtectedPath(filePath);
  const base = path.posix.basename(normalized);

  return SENSITIVE_PATTERNS.some(pattern =>
    base === pattern ||
    base.endsWith(pattern) ||
    base.startsWith(`${pattern}.`) ||
    normalized.endsWith(`/${pattern}`)
  );
}

module.exports = {
  PROTECTED_PATHS,
  PROTECTED_SET,
  SENSITIVE_PATTERNS,
  isProtectedFile,
  isSensitiveProtectedFile,
  normalizeProtectedPath,
};
