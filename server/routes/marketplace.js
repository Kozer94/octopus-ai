function registerMarketplaceRoutes(app, { marketplace, pluginManager }) {
  app.get('/api/marketplace/plugins', (req, res) => {
    try {
      const plugins = marketplace.getAllPlugins();
      res.json({ success: true, plugins });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/marketplace/plugins/:id', (req, res) => {
    try {
      const plugin = marketplace.getPlugin(req.params.id);
      if (!plugin) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      res.json({ success: true, plugin });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/marketplace/search', (req, res) => {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({ success: false, error: 'Query parameter required' });
      }
      const plugins = marketplace.searchPlugins(q);
      res.json({ success: true, plugins });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/marketplace/categories', (req, res) => {
    try {
      const categories = marketplace.getCategories();
      res.json({ success: true, categories });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/marketplace/popular', (req, res) => {
    try {
      const { limit = 5 } = req.query;
      const plugins = marketplace.getPopularPlugins(parseInt(limit));
      res.json({ success: true, plugins });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/marketplace/top-rated', (req, res) => {
    try {
      const { limit = 5 } = req.query;
      const plugins = marketplace.getTopRatedPlugins(parseInt(limit));
      res.json({ success: true, plugins });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/marketplace/install/:id', async (req, res) => {
    try {
      const result = await marketplace.installPlugin(req.params.id, pluginManager);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/marketplace/uninstall/:id', async (req, res) => {
    try {
      const result = await marketplace.uninstallPlugin(req.params.id, pluginManager);
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerMarketplaceRoutes };
