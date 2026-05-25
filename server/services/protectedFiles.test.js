const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PROTECTED_SET,
  isProtectedFile,
  isSensitiveProtectedFile,
  normalizeProtectedPath,
} = require('./protectedFiles');

test('protected files exposes a single normalized protected set', () => {
  assert.equal(PROTECTED_SET.has('package.json'), true);
  assert.equal(PROTECTED_SET.has('server/index.js'), true);
  assert.equal(PROTECTED_SET.has('client/src/app.jsx'), true);
});

test('isProtectedFile detects core files by basename and relative path', () => {
  assert.equal(isProtectedFile('package.json'), true);
  assert.equal(isProtectedFile('src/package.json'), true);
  assert.equal(isProtectedFile('server/index.js'), true);
  assert.equal(isProtectedFile('client\\src\\App.jsx'), true);
  assert.equal(isProtectedFile('src/feature.js'), false);
});

test('isSensitiveProtectedFile detects env and key-like files', () => {
  assert.equal(isSensitiveProtectedFile('.env'), true);
  assert.equal(isSensitiveProtectedFile('.env.local'), true);
  assert.equal(isSensitiveProtectedFile('certs/private.pem'), true);
  assert.equal(isSensitiveProtectedFile('src/index.js'), false);
});

test('normalizeProtectedPath uses lowercase slash-separated paths', () => {
  assert.equal(normalizeProtectedPath('.\\Client\\Src\\App.jsx'), 'client/src/app.jsx');
  assert.equal(normalizeProtectedPath('server\\index.js'), 'server/index.js');
});
