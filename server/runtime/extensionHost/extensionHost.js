const Module = require('module');
const path = require('path');
const { commandRegistry, vscode } = require('./vscodeShim');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.call(this, request, parent, isMain);
};

global.vscode = vscode;

function post(type, payload = {}) {
  if (process.send) process.send({ type, ...payload });
}

function logHost(message, payload = {}) {
  console.log(message, payload);
  post('debug', { message, ...payload });
}

function createMemento() {
  const values = new Map();
  return {
    get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    update: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    keys: () => [...values.keys()],
  };
}

function createContext(extensionPath, manifest) {
  return {
    subscriptions: [],
    extensionPath,
    extensionUri: vscode.Uri.file(extensionPath),
    globalStorageUri: vscode.Uri.file(path.join(extensionPath, '.octopus-global-storage')),
    logUri: vscode.Uri.file(path.join(extensionPath, '.octopus-logs')),
    storageUri: vscode.Uri.file(path.join(extensionPath, '.octopus-storage')),
    extensionMode: vscode.ExtensionMode.Production,
    extension: {
      id: `${manifest.publisher || 'local'}.${manifest.name || path.basename(extensionPath)}`,
      packageJSON: manifest,
      extensionPath,
      extensionUri: vscode.Uri.file(extensionPath),
      isActive: true,
    },
    globalState: createMemento(),
    workspaceState: createMemento(),
    secrets: {
      get: () => Promise.resolve(undefined),
      store: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      onDidChange: () => ({ dispose: () => {} }),
    },
    asAbsolutePath: relativePath => path.join(extensionPath, relativePath),
  };
}

async function loadExtensionModule(entryPath) {
  try {
    return require(entryPath);
  } catch (error) {
    if (error.code !== 'ERR_REQUIRE_ESM') throw error;
    logHost('ERR_REQUIRE_ESM, retrying with dynamic import', { entryPath });
    return import(`file://${entryPath.replace(/\\/g, '/')}`);
  }
}

async function main() {
  const extensionPath = process.argv[2];
  const manifest = JSON.parse(process.argv[3] || '{}');
  const entry = manifest.main || manifest.browser;

  if (!extensionPath || !entry) {
    post('activationFailed', { error: 'Extension manifest does not define main/browser entrypoint' });
    return;
  }

  const entryPath = path.resolve(extensionPath, entry);
  post('hostStarted', { entryPath });

  logHost('=================================');
  logHost('EXTENSION LOADING');
  logHost('PATH', { entryPath });

  const extensionModule = await loadExtensionModule(entryPath);
  logHost('MODULE', { keys: Object.keys(extensionModule || {}) });

  if (typeof extensionModule.activate === 'function') {
    logHost('ACTIVATE FOUND');
    try {
      await extensionModule.activate(createContext(extensionPath, manifest));
      logHost('ACTIVATE SUCCESS');
    } catch (error) {
      console.error('ACTIVATE FAILED');
      console.error(error);
      post('activationFailed', {
        error: error.message,
        stack: error.stack,
      });
      return;
    }
  } else {
    logHost('NO ACTIVATE FUNCTION');
  }
  logHost('=================================');

  post('activated', { commands: [...commandRegistry.keys()] });
  setInterval(() => {}, 60_000);
}

main().catch(error => {
  post('activationFailed', {
    error: error.message,
    stack: error.stack,
  });
  process.exitCode = 1;
});
