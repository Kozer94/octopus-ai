const path = require('path');
const { createPackageService } = require('../services/packageService');

function sendError(res, error) {
  res.status(error.statusCode || 500).json({ success: false, error: error.message });
}

function registerPackageRoutes(app, {
  getPackageIcon,
  installedNpmPackages,
  saveNpmPackages,
  rootDir = path.join(__dirname, '..', '..'),
}) {
  const packages = createPackageService({
    getPackageIcon,
    installedNpmPackages,
    saveNpmPackages,
    rootDir,
  });

  app.get('/api/npm-packages', async (_req, res) => {
    try {
      res.json({ success: true, packages: await packages.listPackages() });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/npm-packages/install', async (req, res) => {
    try {
      res.json({ success: true, ...(await packages.installPackage(req.body)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/npm-packages/:name/enable', (req, res) => {
    try {
      res.json({ success: true, ...packages.setPackageEnabled(req.params.name, req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/npm-packages/:name', async (req, res) => {
    try {
      res.json({ success: true, ...(await packages.uninstallPackage(req.params.name)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/npm-search', async (req, res) => {
    try {
      res.json({ success: true, objects: await packages.searchNpm(req.query.q) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/vsx-search', async (req, res) => {
    try {
      res.json(await packages.searchVsx(req.query));
    } catch (error) {
      res.json({ error: error.message, extensions: [] });
    }
  });

  app.get('/api/vsx-extension/:namespace/:name', async (req, res) => {
    try {
      res.json(await packages.getVsxExtension(req.params));
    } catch (error) {
      res.json({ error: error.message });
    }
  });

  app.post('/api/extensions/install', async (req, res) => {
    try {
      res.json({ success: true, ...packages.validateExtensionInstall(req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/extensions/uninstall', async (req, res) => {
    try {
      res.json({ success: true, ...packages.validateExtensionUninstall(req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });
}

module.exports = { registerPackageRoutes };
