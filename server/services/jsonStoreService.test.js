const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadJsonFile, replaceObjectContents, saveJsonFile } = require('./jsonStoreService');

const silentLogger = {
  error() {},
};

test('loadJsonFile returns fallback for missing files', () => {
  const missingPath = path.join(os.tmpdir(), `missing-${Date.now()}.json`);

  assert.deepEqual(loadJsonFile(missingPath, { ok: true }, silentLogger), { ok: true });
});

test('saveJsonFile writes JSON and creates parent directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-json-store-'));
  const filePath = path.join(root, 'nested', 'state.json');

  assert.equal(saveJsonFile(filePath, { enabled: true }, silentLogger), true);
  assert.deepEqual(loadJsonFile(filePath, {}, silentLogger), { enabled: true });
});

test('loadJsonFile returns fallback for invalid JSON', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-json-store-invalid-'));
  const filePath = path.join(root, 'bad.json');
  fs.writeFileSync(filePath, '{bad', 'utf8');

  assert.deepEqual(loadJsonFile(filePath, { safe: true }, silentLogger), { safe: true });
});

test('replaceObjectContents preserves the target object reference', () => {
  const target = { old: true };
  const sameReference = target;

  const result = replaceObjectContents(target, { next: 1 });

  assert.equal(result, sameReference);
  assert.deepEqual(target, { next: 1 });
});
