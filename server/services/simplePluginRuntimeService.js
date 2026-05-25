const fs = require('fs');
const path = require('path');
const { loadPluginSandboxed } = require('./pluginSandbox');

const SIMPLE_PLUGIN_EXCLUDED_FILES = new Set([
  'basePlugin.js',
  'pluginManager.js',
  'marketplace.js',
]);

function shouldLoadSimplePluginFile(fileName) {
  return fileName.endsWith('.js') &&
    !SIMPLE_PLUGIN_EXCLUDED_FILES.has(fileName) &&
    !fileName.endsWith('-plugin.js');
}

const PLUGIN_ROUTE_PREFIX = '/api/plugins/';
const LEGACY_PLUGIN_ROUTE_PREFIX = '/api/plugin/';
const ALLOWED_ROUTE_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);

function normalizePluginExport(pluginExport) {
  const plugin = typeof pluginExport === 'function' ? new pluginExport() : pluginExport;
  if (!plugin || typeof plugin !== 'object') {
    throw new Error('Plugin export must be an object or class');
  }
  plugin.hooks = plugin.hooks || {};
  plugin.enabled = plugin.enabled !== false;
  return plugin;
}

function registerPluginRoutes(app, plugin, logger = console) {
  if (!plugin.routes || !Array.isArray(plugin.routes)) return;

  for (const route of plugin.routes) {
    if (!route.path || (!route.path.startsWith(PLUGIN_ROUTE_PREFIX) && !route.path.startsWith(LEGACY_PLUGIN_ROUTE_PREFIX))) {
      logger.error(`🛡️ Plugin "${plugin.name}" route "${route.path}" rejected — must start with ${PLUGIN_ROUTE_PREFIX}`);
      continue;
    }

    if (!ALLOWED_ROUTE_METHODS.has(route.method)) {
      logger.error(`🛡️ Plugin "${plugin.name}" method "${route.method}" not allowed`);
      continue;
    }

    const fullPath = route.path;
    const handler = async (req, res) => {
      try {
        await route.handler(req, res);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    };

    if (route.method === 'GET') app.get(fullPath, handler);
    else if (route.method === 'POST') app.post(fullPath, handler);
    else if (route.method === 'PUT') app.put(fullPath, handler);
    else if (route.method === 'DELETE') app.delete(fullPath, handler);

    logger.log(`   ↳ Registered route: ${route.method} ${fullPath}`);
  }
}

function createSimplePluginRuntime({
  app,
  pluginsDir,
  loadedPlugins = [],
  pluginsState = {},
  loadPluginsState,
  logger = console,
}) {
  function loadSimplePlugins() {
    loadPluginsState();
    const pluginFiles = fs.readdirSync(pluginsDir).filter(shouldLoadSimplePluginFile);

    for (const file of pluginFiles) {
      try {
        const pluginPath = path.join(pluginsDir, file);
        const plugin = normalizePluginExport(loadPluginSandboxed(pluginPath, logger));

        if (pluginsState[plugin.id]) {
          plugin.enabled = pluginsState[plugin.id].enabled;
        }

        if (loadedPlugins.some(item => item.id === plugin.id)) continue;
        plugin.initialize?.();
        loadedPlugins.push(plugin);
        logger.log(`🔌 Loaded plugin: ${plugin.name} (${plugin.id}) - ${plugin.enabled ? 'enabled' : 'disabled'}`);
        registerPluginRoutes(app, plugin, logger);
      } catch (error) {
        logger.error(`❌ Failed to load plugin ${file}:`, error.message);
      }
    }

    return loadedPlugins;
  }

  function getEnabledPlugins() {
    return loadedPlugins.filter(plugin => plugin.enabled);
  }

  async function executeHook(hookName, data) {
    const enabled = getEnabledPlugins();
    let result = data;
    const originalType = typeof data;
    const originalLength = typeof data === 'string' ? data.length : JSON.stringify(data).length;
    const maxAllowedLength = Math.max(originalLength * 2, 500) + 500;

    for (const plugin of enabled) {
      if (plugin.hooks && plugin.hooks[hookName]) {
        try {
          const hookResult = await plugin.hooks[hookName](result);

          if (typeof hookResult !== originalType) {
            logger.error(`🛡️ Hook "${hookName}" in "${plugin.name}" returned wrong type (${typeof hookResult}) — rejected`);
            continue;
          }

          const hookLength = typeof hookResult === 'string' ? hookResult.length : JSON.stringify(hookResult).length;
          if (hookLength > maxAllowedLength) {
            logger.error(`🛡️ Hook "${hookName}" in "${plugin.name}" returned oversized output (${hookLength} > ${maxAllowedLength}) — rejected`);
            continue;
          }

          result = hookResult;
        } catch (error) {
          logger.error(`Hook error in ${plugin.name} (${hookName}):`, error.message);
        }
      }
    }

    return result;
  }

  return {
    executeHook,
    getEnabledPlugins,
    loadSimplePlugins,
    registerPluginRoutes: plugin => registerPluginRoutes(app, plugin, logger),
  };
}

module.exports = {
  createSimplePluginRuntime,
  normalizePluginExport,
  registerPluginRoutes,
  shouldLoadSimplePluginFile,
};
