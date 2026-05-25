const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

function registerPluginRoutes(app, plugin) {
  if (!plugin.routes || !Array.isArray(plugin.routes)) return;

  for (const route of plugin.routes) {
    const handler = async (req, res) => {
      try {
        await route.handler(req, res);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    };

    if (route.method === 'GET') app.get(route.path, handler);
    else if (route.method === 'POST') app.post(route.path, handler);
    else if (route.method === 'PUT') app.put(route.path, handler);
    else if (route.method === 'DELETE') app.delete(route.path, handler);
  }
}

function registerSimplePluginRoutes(app, {
  loadedPlugins,
  pluginsDir,
  pluginsState,
  savePluginsState,
}) {
  app.get('/api/simple-plugins', (req, res) => {
    try {
      const plugins = loadedPlugins.map(p => ({
        id: p.id,
        name: p.name,
        version: p.version,
        description: p.description,
        author: p.author,
        icon: p.icon,
        enabled: p.enabled,
        hooks: p.hooks ? Object.keys(p.hooks) : [],
        routes: p.routes ? p.routes.length : 0,
      }));
      res.json({ success: true, plugins });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/simple-plugins/:id/enable', (req, res) => {
    try {
      const plugin = loadedPlugins.find(p => p.id === req.params.id);
      if (!plugin) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      plugin.enabled = true;
      pluginsState[plugin.id] = { enabled: true };
      savePluginsState();
      res.json({ success: true, message: 'Plugin enabled successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/simple-plugins/:id/disable', (req, res) => {
    try {
      const plugin = loadedPlugins.find(p => p.id === req.params.id);
      if (!plugin) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      plugin.enabled = false;
      pluginsState[plugin.id] = { enabled: false };
      savePluginsState();
      res.json({ success: true, message: 'Plugin disabled successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/simple-plugins/install', async (req, res) => {
    try {
      const { plugin } = req.body;
      if (!plugin || !plugin.id || !plugin.name) {
        return res.status(400).json({ success: false, error: 'Invalid plugin data' });
      }

      const pluginPath = path.join(pluginsDir, `${plugin.id}.js`);
      const pluginCode = `module.exports = ${JSON.stringify(plugin, null, 2)};`;

      await fsp.writeFile(pluginPath, pluginCode, 'utf8');

      const newPlugin = require(pluginPath);
      newPlugin.enabled = true;
      loadedPlugins.push(newPlugin);
      pluginsState[newPlugin.id] = { enabled: true };
      savePluginsState();

      registerPluginRoutes(app, newPlugin);

      res.json({ success: true, message: 'Plugin installed successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/simple-plugins/:id', async (req, res) => {
    try {
      const pluginIndex = loadedPlugins.findIndex(p => p.id === req.params.id);
      if (pluginIndex === -1) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }

      const plugin = loadedPlugins[pluginIndex];
      const pluginPath = path.join(pluginsDir, `${plugin.id}.js`);

      if (fs.existsSync(pluginPath)) {
        await fsp.unlink(pluginPath);
      }

      loadedPlugins.splice(pluginIndex, 1);
      delete pluginsState[plugin.id];
      savePluginsState();

      res.json({ success: true, message: 'Plugin deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerSimplePluginRoutes };
