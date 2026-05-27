const path = require('path');
const express = require('express');
const { createPackageService } = require('../services/packageService');
const { CAPABILITIES } = require('../services/securityKernel');

function sendError(res, error) {
  res.status(error.statusCode || 500).json({ success: false, error: error.message });
}

function registerPackageRoutes(app, {
  getPackageIcon,
  extensionHost,
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

  // 🔐 Defense-in-depth: فحص إضافي (الـ Capability Guard المركزي يفحص أولاً)
  function requireCap(req, capability, resource) {
    const kernel = req.securityKernel;
    if (!kernel || typeof kernel.authorize !== 'function') {
      return { allowed: true }; // الكرنل غير متاح → نترك القرار للـ Enforcement Layer
    }
    const result = kernel.authorize(req, { capability, resource });
    if (!result || result.allowed !== true) {
      return { allowed: false, reason: result?.reason || 'Forbidden by policy' };
    }
    return { allowed: true };
  }

  app.get('/api/npm-packages', async (req, res) => {
    // 🔐 Security Kernel
    const cap = requireCap(req, CAPABILITIES.PACKAGE_SEARCH);
    if (!cap.allowed) return res.status(403).json({ success: false, error: cap.reason, code: 'FORBIDDEN_BY_POLICY' });
    try {
      res.json({ success: true, packages: await packages.listPackages() });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/npm-packages/install', async (req, res) => {
    const cap = requireCap(req, CAPABILITIES.PACKAGE_INSTALL, req.body?.packageName);
    if (!cap.allowed) return res.status(403).json({ success: false, error: cap.reason, code: 'FORBIDDEN_BY_POLICY' });
    try {
      res.json({ success: true, ...(await packages.installPackage(req.body)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/npm-packages/:name/enable', (req, res) => {
    const cap = requireCap(req, CAPABILITIES.PACKAGE_INSTALL, req.params.name);
    if (!cap.allowed) return res.status(403).json({ success: false, error: cap.reason, code: 'FORBIDDEN_BY_POLICY' });
    try {
      res.json({ success: true, ...packages.setPackageEnabled(req.params.name, req.body) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/npm-packages/:name', async (req, res) => {
    const cap = requireCap(req, CAPABILITIES.PACKAGE_UNINSTALL, req.params.name);
    if (!cap.allowed) return res.status(403).json({ success: false, error: cap.reason, code: 'FORBIDDEN_BY_POLICY' });
    try {
      res.json({ success: true, ...(await packages.uninstallPackage(req.params.name)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/npm-search', async (req, res) => {
    const cap = requireCap(req, CAPABILITIES.PACKAGE_SEARCH);
    if (!cap.allowed) return res.status(403).json({ success: false, error: cap.reason, code: 'FORBIDDEN_BY_POLICY' });
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

  app.get('/api/extensions/list', async (_req, res) => {
    try {
      res.json({ success: true, extensions: await packages.listExtensions() });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/extensions/install', async (req, res) => {
    try {
      res.json({ success: true, ...(await packages.installExtension(req.body)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/extensions/install-local-vsix', express.raw({
    type: ['application/octet-stream', 'application/zip', 'application/x-zip-compressed'],
    limit: '80mb',
  }), async (req, res) => {
    try {
      res.json({
        success: true,
        ...(await packages.installLocalVsix({
          bytes: Buffer.from(req.body || []),
          fileName: req.get('x-vsix-filename') || 'extension.vsix',
        })),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/extensions/uninstall', async (req, res) => {
    try {
      res.json({ success: true, ...(await packages.uninstallExtension(req.body)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/extensions/activate', async (req, res) => {
    try {
      res.json({ success: true, status: await extensionHost.activate(req.body.extensionId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/extensions/deactivate', async (req, res) => {
    try {
      res.json({ success: true, status: await extensionHost.deactivate(req.body.extensionId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/extensions/status/:extensionId', (req, res) => {
    try {
      res.json({ success: true, status: extensionHost.getStatus(req.params.extensionId) });
    } catch (error) {
      sendError(res, error);
    }
  });
}

module.exports = { registerPackageRoutes };
