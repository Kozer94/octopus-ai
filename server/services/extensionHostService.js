const { fork } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { extractVsixArchive } = require('./packageService');
const { createVSCodeTestElectronService } = require('./vscodeTestElectronService');

function extensionKeys(value = {}) {
  return [
    value.id,
    value.name,
    value.namespace && value.name ? `${value.namespace}.${value.name}` : '',
    value.publisher && value.name ? `${value.publisher}.${value.name}` : '',
  ].filter(Boolean).map(item => String(item).toLowerCase());
}

function findExtension(installedNpmPackages, extensionId) {
  const target = new Set(extensionKeys({ id: extensionId }));
  return Object.entries(installedNpmPackages)
    .find(([key, extension]) => extensionKeys({ ...extension, id: extension.id || key }).some(item => target.has(item)));
}

function safeRelative(rootDir, relativePath) {
  if (!relativePath) return '';
  const fullPath = path.resolve(rootDir, relativePath);
  const root = path.resolve(rootDir);
  return fullPath === root || fullPath.startsWith(root + path.sep) ? fullPath : '';
}

function trimLogs(logs) {
  return logs.slice(-80);
}

function createExtensionHostService({
  installedNpmPackages,
  rootDir = path.join(__dirname, '..', '..'),
  saveNpmPackages,
  runtimeBase = process.env.OCTOPUS_EXTENSION_RUNTIME || 'shim',
  vscodeTestElectron = createVSCodeTestElectronService(),
}) {
  const hosts = new Map();
  const hostScript = path.join(__dirname, '..', 'runtime', 'extensionHost', 'extensionHost.js');

  function getStatus(extensionId) {
    const entry = findExtension(installedNpmPackages, extensionId);
    if (!entry) return null;
    const [key, extension] = entry;
    const host = hosts.get(key);
    return {
      extensionId: key,
      activationStatus: extension.activationStatus || 'downloaded-not-activated',
      runtimeStatus: host ? {
        pid: host.child.pid,
        state: host.state,
        commands: host.commands,
        error: host.error,
        stack: host.stack,
        logs: trimLogs(host.logs),
      } : extension.runtimeStatus || null,
    };
  }

  async function ensureExtracted(key, extension) {
    const existingExtracted = safeRelative(rootDir, extension.extractedPath);
    if (existingExtracted && fs.existsSync(path.join(existingExtracted, 'package.json'))) return existingExtracted;

    const vsixPath = safeRelative(rootDir, extension.localPath);
    if (!vsixPath || !fs.existsSync(vsixPath)) {
      const error = new Error('Local VSIX file is missing');
      error.statusCode = 404;
      throw error;
    }

    const extractedPath = path.join(path.dirname(vsixPath), 'extracted');
    await extractVsixArchive(await fsp.readFile(vsixPath), extractedPath);
    extension.extractedPath = path.relative(rootDir, extractedPath).replace(/\\/g, '/');
    saveNpmPackages();
    return extractedPath;
  }

  async function activate(extensionId) {
    const entry = findExtension(installedNpmPackages, extensionId);
    if (!entry) {
      const error = new Error('Extension not found');
      error.statusCode = 404;
      throw error;
    }

    const [key, extension] = entry;
    if (hosts.has(key)) return getStatus(key);

    const extractedPath = await ensureExtracted(key, extension);
    const manifestPath = path.join(extractedPath, 'package.json');
    const manifest = extension.manifest || JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
    if (!manifest.main && !manifest.browser) {
      const error = new Error('Extension has no runtime entrypoint');
      error.statusCode = 400;
      throw error;
    }

    if (runtimeBase === 'vscode-test-electron') {
      extension.activationStatus = 'activating-vscode-electron';
      extension.runtimeStatus = {
        state: 'starting',
        engine: 'vscode-test-electron',
        logs: [{ level: 'host', message: 'Starting VS Code test-electron extension host', at: new Date().toISOString() }],
      };
      saveNpmPackages();

      const result = await vscodeTestElectron.activate({ extractedPath, extensionId: key, manifest });
      extension.activationStatus = result.state === 'active' ? 'activated-vscode-electron' : 'activation-failed';
      extension.runtimeStatus = {
        state: result.state,
        engine: 'vscode-test-electron',
        extensionId: result.extensionId || key,
        commands: result.commands || [],
        error: result.error,
        stack: result.stack,
        activatedAt: result.activatedAt,
        logs: trimLogs([
          ...(extension.runtimeStatus.logs || []),
          { level: result.state === 'active' ? 'host' : 'err', message: result.error || 'VS Code test-electron activation completed', at: new Date().toISOString() },
        ]),
      };
      saveNpmPackages();
      return getStatus(key);
    }

    const host = {
      state: 'starting',
      commands: [],
      logs: [],
      child: null,
    };

    const child = fork(hostScript, [extractedPath, JSON.stringify(manifest)], {
      cwd: extractedPath,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    host.child = child;
    hosts.set(key, host);

    const pushLog = (level, message) => {
      host.logs = trimLogs([...host.logs, { level, message: String(message), at: new Date().toISOString() }]);
    };
    child.stdout.on('data', data => {
      const text = data.toString();
      pushLog('out', text);
      process.stdout.write(`[extension:${key}] ${text}`);
    });
    child.stderr.on('data', data => {
      const text = data.toString();
      pushLog('err', text);
      process.stderr.write(`[extension:${key}] ${text}`);
    });
    child.on('message', message => {
      pushLog('host', `${message.type}${message.command ? `: ${message.command}` : ''}${message.error ? `: ${message.error}` : ''}`);
      if (message.type === 'debug') console.log(`[extension:${key}] ${message.message}`, message);
      if (message.type === 'commandRegistered') host.commands = [...new Set([...host.commands, message.command])];
      if (message.type === 'activated') {
        host.state = 'active';
        host.commands = message.commands || host.commands;
        extension.activationStatus = 'activated-shim';
        extension.runtimeStatus = { state: host.state, commands: host.commands, activatedAt: new Date().toISOString() };
        saveNpmPackages();
      }
      if (message.type === 'activationFailed') {
        console.error(`[extension:${key}] RUNTIME FAILED: ${message.error}`);
        if (message.stack) console.error(message.stack);
        host.state = 'failed';
        host.error = message.error;
        host.stack = message.stack;
        extension.activationStatus = 'activation-failed';
        extension.runtimeStatus = {
          state: host.state,
          error: host.error,
          stack: host.stack,
          commands: host.commands,
          logs: trimLogs(host.logs),
        };
        saveNpmPackages();
      }
    });
    child.on('exit', code => {
      pushLog('host', `exit ${code}`);
      host.state = host.state === 'active' ? 'stopped' : host.state;
      hosts.delete(key);
      extension.runtimeStatus = {
        state: host.state,
        commands: host.commands,
        error: host.error,
        stack: host.stack,
        logs: trimLogs(host.logs),
      };
      saveNpmPackages();
    });

    return await new Promise(resolve => {
      const timeout = setTimeout(() => resolve(getStatus(key)), 3500);
      child.on('message', message => {
        if (message.type === 'activated' || message.type === 'activationFailed') {
          clearTimeout(timeout);
          resolve(getStatus(key));
        }
      });
    });
  }

  async function deactivate(extensionId) {
    const entry = findExtension(installedNpmPackages, extensionId);
    if (!entry) {
      const error = new Error('Extension not found');
      error.statusCode = 404;
      throw error;
    }
    const [key, extension] = entry;
    const host = hosts.get(key);
    if (host) {
      await new Promise(resolve => {
        if (host.child.exitCode !== null || host.child.killed) {
          resolve();
          return;
        }
        host.child.once('exit', resolve);
        host.child.kill();
        setTimeout(resolve, 1500);
      });
      hosts.delete(key);
    }
    extension.activationStatus = 'downloaded-not-activated';
    extension.runtimeStatus = null;
    saveNpmPackages();
    return getStatus(key);
  }

  return { activate, deactivate, getStatus };
}

module.exports = { createExtensionHostService };
