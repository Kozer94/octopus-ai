const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPluginSandboxed } = require('./pluginSandbox');

function writePlugin(dir, name, code) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, code, 'utf8');
  return filePath;
}

const silentLogger = { log() {}, error() {}, warn() {} };

test('loadPluginSandboxed exports module.exports correctly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'));
  const pluginPath = writePlugin(dir, 'hello.js', `
    module.exports = { id: 'hello', name: 'Hello Plugin' };
  `);
  const plugin = loadPluginSandboxed(pluginPath, silentLogger);
  assert.equal(plugin.id, 'hello');
  assert.equal(plugin.name, 'Hello Plugin');
});

test('loadPluginSandboxed blocks require of child_process', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'));
  const pluginPath = writePlugin(dir, 'evil.js', `
    const cp = require('child_process');
    module.exports = {};
  `);
  assert.throws(
    () => loadPluginSandboxed(pluginPath, silentLogger),
    /blocked/
  );
});

test('loadPluginSandboxed blocks require of net', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'));
  const pluginPath = writePlugin(dir, 'evil-net.js', `
    const net = require('net');
    module.exports = {};
  `);
  assert.throws(
    () => loadPluginSandboxed(pluginPath, silentLogger),
    /blocked/
  );
});

test('loadPluginSandboxed blocks require outside plugin directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'));
  const pluginPath = writePlugin(dir, 'escape.js', `
    const x = require('../../package.json');
    module.exports = {};
  `);
  assert.throws(
    () => loadPluginSandboxed(pluginPath, silentLogger),
    /outside plugin directory/
  );
});

test('loadPluginSandboxed allows require of path and os', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'));
  const pluginPath = writePlugin(dir, 'safe.js', `
    const path = require('path');
    const os   = require('os');
    module.exports = { sep: path.sep, platform: os.platform() };
  `);
  const plugin = loadPluginSandboxed(pluginPath, silentLogger);
  assert.equal(typeof plugin.sep, 'string');
  assert.equal(typeof plugin.platform, 'string');
});

test('loadPluginSandboxed allows require of fs (safe ops)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'));
  const pluginPath = writePlugin(dir, 'fs-safe.js', `
    const fs = require('fs');
    module.exports = { hasExistsSync: typeof fs.existsSync === 'function' };
  `);
  const plugin = loadPluginSandboxed(pluginPath, silentLogger);
  assert.equal(plugin.hasExistsSync, true);
});

test('loadPluginSandboxed blocks access to process', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'));
  const pluginPath = writePlugin(dir, 'proc.js', `
    module.exports = { hasProcess: typeof process !== 'undefined' };
  `);
  const plugin = loadPluginSandboxed(pluginPath, silentLogger);
  assert.equal(plugin.hasProcess, false);
});

test('loadPluginSandboxed enforces 3s timeout on infinite loops', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'));
  const pluginPath = writePlugin(dir, 'infinite.js', `
    while (true) {}
    module.exports = {};
  `);
  assert.throws(
    () => loadPluginSandboxed(pluginPath, silentLogger),
    /sandbox error/
  );
});
