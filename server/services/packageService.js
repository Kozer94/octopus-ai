const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const {
  readBoolean,
  readObject,
  readPackageName,
  readString,
} = require('./inputValidation');

function runNpm(args, rootDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, {
      cwd: rootDir,
      shell: false,
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', data => { stderr += data.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr || `npm exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function readInstalledPackageInfo(rootDir, packageName) {
  const packageJsonPath = path.join(rootDir, 'node_modules', packageName, 'package.json');
  let packageInfo = { name: packageName, version: '1.0.0', description: '' };

  try {
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf8'));
      packageInfo = {
        name: packageJson.name || packageName,
        version: packageJson.version || '1.0.0',
        description: packageJson.description || '',
      };
    }
  } catch {
    return packageInfo;
  }

  return packageInfo;
}

function createPackageService({
  getPackageIcon,
  installedNpmPackages,
  saveNpmPackages,
  rootDir = path.join(__dirname, '..', '..'),
  logger = console,
}) {
  async function listPackages() {
    return Promise.all(Object.values(installedNpmPackages).map(async pkg => ({
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
  }

  async function installPackage(body) {
    const payload = readObject(body, 'body');
    const packageName = readPackageName(payload.packageName);
    const hook = readString(payload.hook, 'hook', { max: 80 }) || 'afterResponse';
    const vsxData = payload.vsxData && readObject(payload.vsxData, 'vsxData');

    if (vsxData) {
      installedNpmPackages[packageName] = {
        name: packageName,
        displayName: readString(vsxData.displayName, 'vsxData.displayName', { max: 120 }) || packageName,
        description: readString(vsxData.description, 'vsxData.description', { max: 1000 }),
        version: readString(vsxData.version, 'vsxData.version', { max: 80 }) || '0.0.1',
        installedAt: new Date().toISOString(),
        enabled: true,
        hook,
        icon: readString(vsxData.icon, 'vsxData.icon', { max: 2000 }) || null,
        namespace: readString(vsxData.namespace, 'vsxData.namespace', { max: 120 }),
        source: 'vsx',
      };
      saveNpmPackages();
      return { message: 'VSX extension installed successfully', package: installedNpmPackages[packageName] };
    }

    logger.log(`📦 Installing npm package: ${packageName}`);
    await runNpm(['install', packageName, '--save'], rootDir);
    const packageInfo = await readInstalledPackageInfo(rootDir, packageName);
    installedNpmPackages[packageName] = {
      ...packageInfo,
      installedAt: new Date().toISOString(),
      enabled: true,
      hook,
    };
    saveNpmPackages();
    return { message: 'Package installed successfully', package: packageInfo };
  }

  function setPackageEnabled(nameValue, body) {
    const name = readPackageName(nameValue, 'name');
    const enabled = readBoolean(readObject(body, 'body').enabled, true);
    if (!installedNpmPackages[name]) {
      const error = new Error('Package not found');
      error.statusCode = 404;
      throw error;
    }
    installedNpmPackages[name].enabled = enabled;
    saveNpmPackages();
    return { message: enabled ? 'Package enabled' : 'Package disabled' };
  }

  async function uninstallPackage(nameValue) {
    const name = readPackageName(nameValue, 'name');
    if (!installedNpmPackages[name]) {
      const error = new Error('Package not found');
      error.statusCode = 404;
      throw error;
    }

    const isVsx = installedNpmPackages[name].source === 'vsx';
    if (!isVsx) {
      logger.log(`🗑️ Uninstalling npm package: ${name}`);
      await runNpm(['uninstall', name], rootDir);
    }

    delete installedNpmPackages[name];
    saveNpmPackages();
    return { message: isVsx ? 'VSX extension removed successfully' : 'Package uninstalled successfully' };
  }

  async function searchNpm(queryValue) {
    const query = readString(queryValue, 'q', { max: 120 });
    if (query.length < 2) return [];
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`;
    const npmRes = await fetch(url);
    const data = await npmRes.json();
    if (data.error) return [];
    return Promise.all((data.objects || []).map(async obj => ({
      ...obj,
      package: {
        ...obj.package,
        icon: await getPackageIcon(obj.package.name),
      },
    })));
  }

  async function searchVsx({ q, size, sortBy }) {
    const query = readString(q, 'q', { max: 120 });
    const safeSize = Math.min(parseInt(size, 10) || 20, 50);
    const safeSortBy = readString(sortBy || 'relevance', 'sortBy', {
      max: 40,
      pattern: /^(relevance|downloadCount|timestamp|averageRating)$/i,
    });
    if (!query) return { extensions: [] };
    const response = await fetch(
      `https://open-vsx.org/api/-/search?query=${encodeURIComponent(query)}&size=${safeSize}&sortBy=${encodeURIComponent(safeSortBy)}&sortOrder=desc`,
    );
    return response.json();
  }

  async function getVsxExtension({ namespace, name }) {
    const safeNamespace = readString(namespace, 'namespace', { required: true, max: 120, pattern: /^[a-z0-9._-]+$/i });
    const safeName = readString(name, 'name', { required: true, max: 120, pattern: /^[a-z0-9._-]+$/i });
    const response = await fetch(
      `https://open-vsx.org/api/${encodeURIComponent(safeNamespace)}/${encodeURIComponent(safeName)}`,
    );
    return response.json();
  }

  function validateExtensionInstall(body) {
    const { extension } = readObject(body, 'body');
    if (!extension) {
      const error = new Error('Extension data required');
      error.statusCode = 400;
      throw error;
    }
    return { message: 'Extension installed successfully' };
  }

  function validateExtensionUninstall(body) {
    readString(readObject(body, 'body').extensionId, 'extensionId', { required: true, max: 200 });
    return { message: 'Extension uninstalled successfully' };
  }

  return {
    getVsxExtension,
    installPackage,
    listPackages,
    searchNpm,
    searchVsx,
    setPackageEnabled,
    uninstallPackage,
    validateExtensionInstall,
    validateExtensionUninstall,
  };
}

module.exports = {
  createPackageService,
  readInstalledPackageInfo,
  runNpm,
};
