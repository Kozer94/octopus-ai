const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const zlib = require('zlib');
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

function getVsxInstallRoot(rootDir) {
  return path.join(rootDir, 'server', 'state', 'extensions');
}

function getVsxExtensionKey(extension = {}) {
  const namespace = readString(extension.namespace || extension.publisher, 'extension.namespace', {
    max: 120,
    pattern: /^[a-z0-9._-]+$/i,
  });
  const name = readString(extension.name, 'extension.name', {
    max: 120,
    pattern: /^[a-z0-9._-]+$/i,
  });
  const id = readString(extension.id, 'extension.id', {
    max: 240,
    pattern: /^[a-z0-9._-]+$/i,
  });

  if (namespace && name) return `${namespace}.${name}`;
  if (id) return id;

  const error = new Error('Extension namespace and name are required');
  error.statusCode = 400;
  throw error;
}

function getSafeVsixFileName(fileNameValue = 'extension.vsix') {
  const fileName = path.basename(String(fileNameValue || 'extension.vsix')).replace(/[^a-z0-9._-]/gi, '_');
  return fileName.toLowerCase().endsWith('.vsix') ? fileName : `${fileName}.vsix`;
}

function getVsxInstalledExtension(installedNpmPackages, extensionId) {
  const id = readString(extensionId, 'extensionId', {
    required: true,
    max: 240,
    pattern: /^[a-z0-9._-]+$/i,
  });
  return Object.entries(installedNpmPackages)
    .find(([key, extension]) => key === id || extension.id === id || `${extension.namespace}.${extension.name}` === id);
}

function findZipEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readZipEntry(buffer, candidateNames) {
  const entries = readZipEntries(buffer);
  const wanted = new Set(candidateNames.map(name => name.replace(/\\/g, '/')));
  const entry = entries.find(item => wanted.has(item.name));
  return entry ? entry.data : null;
}

function inflateZipEntry(buffer, entry) {
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) return null;
  const localFileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + localFileNameLength + localExtraLength;
  const compressed = buffer.slice(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  return null;
}

function readZipEntries(buffer) {
  const entries = [];
  const eocdOffset = findZipEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) return entries;

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  let cursor = centralDirOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) return entries;

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileName = buffer.slice(cursor + 46, cursor + 46 + fileNameLength).toString('utf8').replace(/\\/g, '/');

    entries.push({
      name: fileName,
      method,
      compressedSize,
      localHeaderOffset,
      data: fileName.endsWith('/') ? Buffer.alloc(0) : inflateZipEntry(buffer, { method, compressedSize, localHeaderOffset }),
    });

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function extractVsixArchive(buffer, destination) {
  const root = path.resolve(destination);
  await fsp.rm(root, { recursive: true, force: true });
  await fsp.mkdir(root, { recursive: true });

  for (const entry of readZipEntries(buffer)) {
    const relativeName = entry.name.startsWith('extension/')
      ? entry.name.slice('extension/'.length)
      : entry.name;
    if (!relativeName || relativeName.includes('\0')) continue;
    const target = path.resolve(root, relativeName);
    if (target !== root && !target.startsWith(root + path.sep)) continue;
    if (entry.name.endsWith('/')) {
      await fsp.mkdir(target, { recursive: true });
      continue;
    }
    if (!entry.data) continue;
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, entry.data);
  }
}

function summarizeExtensionCapabilities(manifest = {}) {
  const contributes = manifest.contributes || {};
  return [
    ['commands', contributes.commands],
    ['themes', contributes.themes],
    ['languages', contributes.languages],
    ['snippets', contributes.snippets],
    ['debuggers', contributes.debuggers],
    ['views', contributes.views ? Object.values(contributes.views).flat() : []],
    ['keybindings', contributes.keybindings],
    ['configuration', contributes.configuration ? [contributes.configuration] : []],
  ]
    .map(([type, value]) => ({ type, count: Array.isArray(value) ? value.length : 0 }))
    .filter(item => item.count > 0);
}

function sanitizeExtensionManifest(manifest = {}) {
  const contributes = manifest.contributes || {};
  return {
    name: manifest.name || '',
    displayName: manifest.displayName || '',
    publisher: manifest.publisher || '',
    version: manifest.version || '',
    description: manifest.description || '',
    engines: manifest.engines || {},
    categories: Array.isArray(manifest.categories) ? manifest.categories.slice(0, 12) : [],
    activationEvents: Array.isArray(manifest.activationEvents) ? manifest.activationEvents.slice(0, 30) : [],
    main: manifest.main || '',
    browser: manifest.browser || '',
    contributes: {
      commands: Array.isArray(contributes.commands) ? contributes.commands.slice(0, 20).map(command => ({
        command: command.command,
        title: command.title,
        category: command.category,
      })) : [],
      themes: Array.isArray(contributes.themes) ? contributes.themes.slice(0, 12).map(theme => ({
        label: theme.label,
        uiTheme: theme.uiTheme,
        path: theme.path,
      })) : [],
      languages: Array.isArray(contributes.languages) ? contributes.languages.slice(0, 20).map(language => ({
        id: language.id,
        aliases: language.aliases,
        extensions: language.extensions,
      })) : [],
      snippets: Array.isArray(contributes.snippets) ? contributes.snippets.slice(0, 20).map(snippet => ({
        language: snippet.language,
        path: snippet.path,
      })) : [],
      debuggers: Array.isArray(contributes.debuggers) ? contributes.debuggers.slice(0, 12).map(debuggerItem => ({
        type: debuggerItem.type,
        label: debuggerItem.label,
      })) : [],
    },
  };
}

function readVsixManifest(buffer) {
  const entry = readZipEntry(buffer, ['extension/package.json', 'package.json']);
  if (!entry) return null;
  return sanitizeExtensionManifest(JSON.parse(entry.toString('utf8')));
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

  async function listExtensions() {
    return Object.values(installedNpmPackages)
      .filter(pkg => pkg.source === 'vsx')
      .map(pkg => ({
        id: pkg.id || `${pkg.namespace}.${pkg.name}`,
        name: pkg.name,
        displayName: pkg.displayName || pkg.name,
        description: pkg.description || '',
        version: pkg.version || '0.0.1',
        installedAt: pkg.installedAt,
        enabled: pkg.enabled !== false,
        icon: pkg.icon || null,
        namespace: pkg.namespace,
        publisher: pkg.publisher || pkg.namespace,
        source: 'vsx',
        installType: pkg.installType || 'metadata',
        activationStatus: pkg.activationStatus || 'downloaded-not-activated',
        localPath: pkg.localPath || '',
        extractedPath: pkg.extractedPath || '',
        runtimeStatus: pkg.runtimeStatus || null,
        capabilities: pkg.capabilities || [],
        manifest: pkg.manifest || null,
      }));
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
    // 🔒 --ignore-scripts يمنع تنفيذ postinstall/preinstall scripts ضارة
    await runNpm(['install', packageName, '--save', '--ignore-scripts'], rootDir);
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

  async function installExtension(body) {
    const { extension } = readObject(body, 'body');
    if (!extension) {
      const error = new Error('Extension data required');
      error.statusCode = 400;
      throw error;
    }

    const extensionPayload = readObject(extension, 'extension');
    const key = getVsxExtensionKey(extensionPayload);
    const [fallbackNamespace = '', fallbackName = ''] = key.split('.');
    const namespace = readString(extensionPayload.namespace || fallbackNamespace, 'extension.namespace', {
      required: true,
      max: 120,
      pattern: /^[a-z0-9._-]+$/i,
    });
    const name = readString(extensionPayload.name || fallbackName, 'extension.name', {
      required: true,
      max: 120,
      pattern: /^[a-z0-9._-]+$/i,
    });

    const detailed = extensionPayload.files?.download
      ? extensionPayload
      : await getVsxExtension({ namespace, name });
    const downloadUrl = readString(detailed.files?.download, 'extension.files.download', { required: true, max: 2000 });
    const version = readString(detailed.version || extensionPayload.version, 'extension.version', { max: 80 }) || '0.0.1';
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      const error = new Error(`Could not download VSIX (${response.status})`);
      error.statusCode = 502;
      throw error;
    }

    const installDir = path.join(getVsxInstallRoot(rootDir), key);
    await fsp.mkdir(installDir, { recursive: true });
    const fileName = `${name}-${version}.vsix`.replace(/[^a-z0-9._-]/gi, '_');
    const fullPath = path.join(installDir, fileName);
    const bytes = Buffer.from(await response.arrayBuffer());
    await fsp.writeFile(fullPath, bytes);
    const manifest = readVsixManifest(bytes);
    const capabilities = manifest ? summarizeExtensionCapabilities(manifest) : [];
    const extractedDir = path.join(installDir, 'extracted');
    await extractVsixArchive(bytes, extractedDir);

    const installed = {
      id: key,
      name,
      displayName: readString(manifest?.displayName || detailed.displayName || extensionPayload.displayName, 'extension.displayName', { max: 120 }) || name,
      description: readString(manifest?.description || detailed.description || extensionPayload.description || extensionPayload.shortDescription, 'extension.description', { max: 1000 }),
      version: manifest?.version || version,
      installedAt: new Date().toISOString(),
      enabled: true,
      hook: 'manual',
      icon: readString(detailed.files?.icon || extensionPayload.icon || extensionPayload.files?.icon, 'extension.icon', { max: 2000 }) || null,
      namespace,
      publisher: readString(detailed.publisher || extensionPayload.publisher || namespace, 'extension.publisher', { max: 120 }) || namespace,
      source: 'vsx',
      installType: 'vsix-download',
      activationStatus: 'downloaded-not-activated',
      localPath: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
      extractedPath: path.relative(rootDir, extractedDir).replace(/\\/g, '/'),
      size: bytes.length,
      downloadUrl,
      manifest,
      capabilities,
    };

    installedNpmPackages[key] = installed;
    saveNpmPackages();
    return {
      message: 'VSIX downloaded and registered locally',
      extension: installed,
    };
  }

  async function installLocalVsix({ bytes, fileName }) {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      const error = new Error('VSIX file is empty');
      error.statusCode = 400;
      throw error;
    }

    const manifest = readVsixManifest(bytes);
    if (!manifest?.name) {
      const error = new Error('VSIX package.json could not be read');
      error.statusCode = 400;
      throw error;
    }

    const namespace = readString(manifest.publisher || 'local', 'manifest.publisher', {
      max: 120,
      pattern: /^[a-z0-9._-]+$/i,
    }) || 'local';
    const name = readString(manifest.name, 'manifest.name', {
      required: true,
      max: 120,
      pattern: /^[a-z0-9._-]+$/i,
    });
    const key = `${namespace}.${name}`;
    const version = readString(manifest.version, 'manifest.version', { max: 80 }) || '0.0.1';
    const installDir = path.join(getVsxInstallRoot(rootDir), key);
    await fsp.mkdir(installDir, { recursive: true });

    const safeFileName = getSafeVsixFileName(fileName || `${name}-${version}.vsix`);
    const fullPath = path.join(installDir, safeFileName);
    await fsp.writeFile(fullPath, bytes);

    const extractedDir = path.join(installDir, 'extracted');
    await extractVsixArchive(bytes, extractedDir);
    const capabilities = summarizeExtensionCapabilities(manifest);

    const installed = {
      id: key,
      name,
      displayName: manifest.displayName || name,
      description: manifest.description || '',
      version,
      installedAt: new Date().toISOString(),
      enabled: true,
      hook: 'manual',
      icon: null,
      namespace,
      publisher: namespace,
      source: 'vsx',
      installType: 'local-vsix-upload',
      activationStatus: 'downloaded-not-activated',
      localPath: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
      extractedPath: path.relative(rootDir, extractedDir).replace(/\\/g, '/'),
      size: bytes.length,
      downloadUrl: '',
      manifest,
      capabilities,
    };

    installedNpmPackages[key] = installed;
    saveNpmPackages();
    return {
      message: 'Local VSIX uploaded and registered',
      extension: installed,
    };
  }

  async function uninstallExtension(body) {
    const entry = getVsxInstalledExtension(installedNpmPackages, readObject(body, 'body').extensionId);
    if (!entry) {
      const error = new Error('Extension not found');
      error.statusCode = 404;
      throw error;
    }

    const [key, extension] = entry;
    if (extension.localPath) {
      const fullPath = path.resolve(rootDir, extension.localPath);
      const installRoot = path.resolve(getVsxInstallRoot(rootDir));
      if (fullPath.startsWith(installRoot + path.sep)) {
        await fsp.rm(fullPath, { force: true });
      }
    }
    if (extension.extractedPath) {
      const extractedPath = path.resolve(rootDir, extension.extractedPath);
      const installRoot = path.resolve(getVsxInstallRoot(rootDir));
      if (extractedPath.startsWith(installRoot + path.sep)) {
        await fsp.rm(extractedPath, { recursive: true, force: true });
      }
    }
    delete installedNpmPackages[key];
    saveNpmPackages();
    return { message: 'Extension removed from local library' };
  }

  return {
    getVsxExtension,
    installExtension,
    installLocalVsix,
    installPackage,
    listExtensions,
    listPackages,
    searchNpm,
    searchVsx,
    setPackageEnabled,
    uninstallExtension,
    uninstallPackage,
  };
}

module.exports = {
  createPackageService,
  extractVsixArchive,
  readVsixManifest,
  readInstalledPackageInfo,
  summarizeExtensionCapabilities,
  runNpm,
};
