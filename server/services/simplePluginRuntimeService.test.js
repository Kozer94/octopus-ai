const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSimplePluginRuntime,
  shouldLoadSimplePluginFile,
} = require('./simplePluginRuntimeService');

const silentLogger = {
  log() {},
  error() {},
};

function createFakeApp() {
  return {
    routes: [],
    get(routePath, handler) {
      this.routes.push({ method: 'GET', routePath, handler });
    },
    post(routePath, handler) {
      this.routes.push({ method: 'POST', routePath, handler });
    },
    put(routePath, handler) {
      this.routes.push({ method: 'PUT', routePath, handler });
    },
    delete(routePath, handler) {
      this.routes.push({ method: 'DELETE', routePath, handler });
    },
  };
}

test('shouldLoadSimplePluginFile filters non-simple plugin files', () => {
  assert.equal(shouldLoadSimplePluginFile('hello.js'), true);
  assert.equal(shouldLoadSimplePluginFile('pluginManager.js'), false);
  assert.equal(shouldLoadSimplePluginFile('basePlugin.js'), false);
  assert.equal(shouldLoadSimplePluginFile('my-plugin.js'), false);
  assert.equal(shouldLoadSimplePluginFile('README.md'), false);
});

test('createSimplePluginRuntime loads plugins, applies saved state, and registers routes', () => {
  const pluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-simple-plugins-'));
  const pluginPath = path.join(pluginsDir, 'sample.js');
  fs.writeFileSync(pluginPath, `
    module.exports = {
      id: 'sample',
      name: 'Sample',
      enabled: false,
      routes: [{ method: 'GET', path: '/sample', handler: async (_req, res) => res.json({ ok: true }) }],
      hooks: { afterResponse: async value => value + '!' },
    };
  `, 'utf8');

  const app = createFakeApp();
  const loadedPlugins = [];
  const pluginsState = { sample: { enabled: true } };
  const runtime = createSimplePluginRuntime({
    app,
    pluginsDir,
    loadedPlugins,
    pluginsState,
    loadPluginsState() {},
    logger: silentLogger,
  });

  runtime.loadSimplePlugins();

  assert.equal(loadedPlugins.length, 1);
  assert.equal(loadedPlugins[0].enabled, true);
  assert.deepEqual(app.routes.map(route => `${route.method} ${route.routePath}`), ['GET /sample']);
  assert.equal(runtime.getEnabledPlugins().length, 1);
});

test('executeHook runs enabled hooks in order and skips disabled plugins', async () => {
  const loadedPlugins = [
    {
      name: 'A',
      enabled: true,
      hooks: { beforeSend: async value => `${value}A` },
    },
    {
      name: 'B',
      enabled: false,
      hooks: { beforeSend: async value => `${value}B` },
    },
    {
      name: 'C',
      enabled: true,
      hooks: { beforeSend: async value => `${value}C` },
    },
  ];
  const runtime = createSimplePluginRuntime({
    app: createFakeApp(),
    pluginsDir: os.tmpdir(),
    loadedPlugins,
    pluginsState: {},
    loadPluginsState() {},
    logger: silentLogger,
  });

  assert.equal(await runtime.executeHook('beforeSend', 'start-'), 'start-AC');
});
