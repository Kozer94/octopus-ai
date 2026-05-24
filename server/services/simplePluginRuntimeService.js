const fs = require('fs');
const path = require('path');

const SIMPLE_PLUGIN_EXCLUDED_FILES = new Set([
  'basePlugin.js',
  'pluginManager.js',
  'marketplace.js',
  'smart-comments.js',
  'auto-save.js',
  'code-formatter.js',
  'project-stats.js',
]);

function shouldLoadSimplePluginFile(fileName) {
  return fileName.endsWith('.js') &&
    !SIMPLE_PLUGIN_EXCLUDED_FILES.has(fileName) &&
    !fileName.includes('plugin.js');
}

function registerPluginRoutes(app, plugin, logger = console) {
  if (!plugin.routes || !Array.isArray(plugin.routes)) return;

  for (const route of plugin.routes) {
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
        const plugin = require(pluginPath);

        if (pluginsState[plugin.id]) {
          plugin.enabled = pluginsState[plugin.id].enabled;
        }

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

    for (const plugin of enabled) {
      if (plugin.hooks && plugin.hooks[hookName]) {
        try {
          result = await plugin.hooks[hookName](result);
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
  registerPluginRoutes,
  shouldLoadSimplePluginFile,
};
