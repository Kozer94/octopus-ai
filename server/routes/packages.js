const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function registerPackageRoutes(app, {
  getPackageIcon,
  installedNpmPackages,
  saveNpmPackages,
  rootDir = path.join(__dirname, '..', '..'),
}) {
  app.get('/api/npm-packages', async (_req, res) => {
    try {
      const packages = await Promise.all(Object.values(installedNpmPackages).map(async pkg => ({
        name: pkg.name,
        displayName: pkg.displayName,
        version: pkg.version,
        description: pkg.description,
        installedAt: pkg.installedAt,
        enabled: pkg.enabled,
        hook: pkg.hook,
        icon: pkg.icon || await getPackageIcon(pkg.name),
        namespace: pkg.namespace,
        source: pkg.source || 'npm',
      })));
      res.json({ success: true, packages });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/npm-packages/install', async (req, res) => {
    try {
      const { packageName, hook, vsxData } = req.body;
      if (!packageName) {
        return res.status(400).json({ success: false, error: 'packageName required' });
      }

      if (vsxData) {
        installedNpmPackages[packageName] = {
          name: packageName,
          displayName: vsxData.displayName || packageName,
          description: vsxData.description || '',
          version: vsxData.version || '0.0.1',
          installedAt: new Date().toISOString(),
          enabled: true,
          hook: hook || 'afterResponse',
          icon: vsxData.icon || null,
          namespace: vsxData.namespace || '',
          source: 'vsx',
        };
        saveNpmPackages();
        return res.json({ success: true, message: 'VSX extension installed successfully', package: installedNpmPackages[packageName] });
      }

      console.log(`📦 Installing npm package: ${packageName}`);
      const npmInstall = spawn('npm', ['install', packageName, '--save'], {
        cwd: rootDir,
        shell: true
      });

      let error = '';

      npmInstall.stderr.on('data', (data) => {
        error += data.toString();
      });

      npmInstall.on('close', async (code) => {
        if (code !== 0) {
          console.error(`npm install failed with code ${code}`);
          return res.status(500).json({ success: false, error: error || 'npm install failed' });
        }

        console.log(`✅ npm install completed for ${packageName}`);

        let packageInfo = { name: packageName, version: '1.0.0', description: '' };
        try {
          const packageJsonPath = path.join(rootDir, 'node_modules', packageName, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            packageInfo = {
              name: packageJson.name || packageName,
              version: packageJson.version || '1.0.0',
              description: packageJson.description || ''
            };
          }
        } catch (e) {
          console.error('Failed to read package.json:', e.message);
        }

        installedNpmPackages[packageName] = {
          ...packageInfo,
          installedAt: new Date().toISOString(),
          enabled: true,
          hook: hook || 'afterResponse'
        };
        saveNpmPackages();

        res.json({ success: true, message: 'Package installed successfully', package: packageInfo });
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/npm-packages/:name/enable', (req, res) => {
    try {
      const { name } = req.params;
      const { enabled } = req.body;

      if (!installedNpmPackages[name]) {
        return res.status(404).json({ success: false, error: 'Package not found' });
      }

      installedNpmPackages[name].enabled = enabled !== false;
      saveNpmPackages();

      res.json({ success: true, message: enabled ? 'Package enabled' : 'Package disabled' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/npm-packages/:name', async (req, res) => {
    try {
      const { name } = req.params;

      if (!installedNpmPackages[name]) {
        return res.status(404).json({ success: false, error: 'Package not found' });
      }

      if (installedNpmPackages[name].source === 'vsx') {
        delete installedNpmPackages[name];
        saveNpmPackages();
        return res.json({ success: true, message: 'VSX extension removed successfully' });
      }

      console.log(`🗑️ Uninstalling npm package: ${name}`);
      const npmUninstall = spawn('npm', ['uninstall', name], {
        cwd: rootDir,
        shell: true
      });

      npmUninstall.on('close', (code) => {
        if (code !== 0) {
          console.error(`npm uninstall failed with code ${code}`);
          return res.status(500).json({ success: false, error: 'npm uninstall failed' });
        }

        delete installedNpmPackages[name];
        saveNpmPackages();

        console.log(`✅ npm uninstall completed for ${name}`);
        res.json({ success: true, message: 'Package uninstalled successfully' });
      });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/npm-search', async (req, res) => {
    try {
      const query = String(req.query.q || '').trim();
      if (query.length < 2) {
        return res.json({ success: true, objects: [] });
      }

      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`;
      const npmRes = await fetch(url);
      const data = await npmRes.json();
      if (data.error) {
        console.warn(`NPM search warning for "${query}": ${data.error}`);
        return res.json({ success: true, objects: [] });
      }
      const objects = await Promise.all((data.objects || []).map(async obj => ({
        ...obj,
        package: {
          ...obj.package,
          icon: await getPackageIcon(obj.package.name),
        },
      })));
      console.log(`NPM search "${query}": ${objects.length} results`);
      res.json({ success: true, objects });
    } catch (error) {
      console.error('NPM search error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/vsx-search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    const size = Math.min(parseInt(req.query.size, 10) || 20, 50);
    const sortBy = String(req.query.sortBy || 'relevance');

    if (!query) {
      return res.json({ extensions: [] });
    }

    try {
      const response = await fetch(
        `https://open-vsx.org/api/-/search?query=${encodeURIComponent(query)}&size=${size}&sortBy=${encodeURIComponent(sortBy)}&sortOrder=desc`
      );
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.json({ error: error.message, extensions: [] });
    }
  });

  app.get('/api/vsx-extension/:namespace/:name', async (req, res) => {
    const { namespace, name } = req.params;

    try {
      const response = await fetch(
        `https://open-vsx.org/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
      );
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.json({ error: error.message });
    }
  });

  app.post('/api/extensions/install', async (req, res) => {
    const { extension } = req.body;

    if (!extension) {
      return res.status(400).json({ success: false, error: 'Extension data required' });
    }

    try {
      console.log('Installing extension:', extension.name);
      res.json({ success: true, message: 'Extension installed successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/extensions/uninstall', async (req, res) => {
    const { extensionId } = req.body;

    if (!extensionId) {
      return res.status(400).json({ success: false, error: 'Extension ID required' });
    }

    try {
      console.log('Uninstalling extension:', extensionId);
      res.json({ success: true, message: 'Extension uninstalled successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerPackageRoutes };
