const path = require('path');

function registerPluginManagerRoutes(app, { pluginManager, pluginsDir }) {
  app.get('/api/plugins', (req, res) => {
    try {
      const plugins = pluginManager.getAllPlugins();
      res.json({ success: true, plugins });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/plugins/:id', (req, res) => {
    try {
      const plugin = pluginManager.getPlugin(req.params.id);
      if (!plugin) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      res.json({ success: true, plugin: plugin.getInfo() });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/plugins/:id/enable', async (req, res) => {
    try {
      const result = await pluginManager.enablePlugin(req.params.id);
      if (result) {
        res.json({ success: true, message: 'Plugin enabled successfully' });
      } else {
        res.status(400).json({ success: false, error: 'Failed to enable plugin' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/plugins/:id/disable', async (req, res) => {
    try {
      const result = await pluginManager.disablePlugin(req.params.id);
      if (result) {
        res.json({ success: true, message: 'Plugin disabled successfully' });
      } else {
        res.status(400).json({ success: false, error: 'Failed to disable plugin' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/plugins/stats', (req, res) => {
    try {
      const stats = pluginManager.getStats();
      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/plugins/reload', async (req, res) => {
    try {
      await pluginManager.loadPluginsFromDirectory(path.resolve(pluginsDir));
      res.json({ success: true, message: 'Plugins reloaded successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerPluginManagerRoutes };
