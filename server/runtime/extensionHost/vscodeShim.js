const commandRegistry = new Map();

let generatedPolyfills = { configDefaults: {} };
try {
  generatedPolyfills = require('./generatedShimPolyfills');
} catch (_error) {
  generatedPolyfills = { configDefaults: {} };
}

class Disposable {
  constructor(dispose) {
    this._dispose = typeof dispose === 'function' ? dispose : () => {};
  }

  dispose() {
    this._dispose();
  }

  static from(...items) {
    return new Disposable(() => items.forEach(item => item?.dispose?.()));
  }
}

class EventEmitter {
  constructor() {
    this.listeners = new Set();
    this.event = listener => {
      this.listeners.add(listener);
      return new Disposable(() => this.listeners.delete(listener));
    };
  }

  fire(value) {
    for (const listener of this.listeners) listener(value);
  }

  dispose() {
    this.listeners.clear();
  }
}

class Uri {
  constructor({ scheme = 'file', path = '', fsPath = path, query = '', fragment = '' } = {}) {
    this.scheme = scheme;
    this.path = path;
    this.fsPath = fsPath;
    this.query = query;
    this.fragment = fragment;
  }

  toString() {
    return this.scheme === 'file' ? `file://${this.fsPath.replace(/\\/g, '/')}` : `${this.scheme}:${this.path}`;
  }

  static file(fsPath) {
    return new Uri({ scheme: 'file', path: fsPath.replace(/\\/g, '/'), fsPath });
  }

  static parse(value = '') {
    if (value.startsWith('file://')) return Uri.file(value.slice('file://'.length));
    const [scheme, ...rest] = value.split(':');
    return new Uri({ scheme: rest.length ? scheme : 'file', path: rest.join(':') || value, fsPath: rest.join(':') || value });
  }
}

class TreeItem {
  constructor(label, collapsibleState = 0) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

function post(type, payload = {}) {
  if (process.send) process.send({ type, ...payload });
}

function createOutputChannel(name) {
  return {
    name,
    append: value => post('output', { channel: name, value: String(value) }),
    appendLine: value => post('output', { channel: name, value: `${String(value)}\n` }),
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
  };
}

function createTerminal(options = {}) {
  const name = typeof options === 'string' ? options : options.name || 'Extension Terminal';
  return {
    name,
    processId: Promise.resolve(0),
    sendText: text => post('terminal.sendText', { terminal: name, text }),
    show: () => post('terminal.show', { terminal: name }),
    hide: () => {},
    dispose: () => {},
  };
}

function createTreeView(viewId, options = {}) {
  post('treeView.create', { viewId });
  return {
    title: options.title || viewId,
    description: '',
    message: '',
    visible: false,
    selection: [],
    onDidCollapseElement: () => new Disposable(),
    onDidChangeCheckboxState: () => new Disposable(),
    onDidChangeSelection: () => new Disposable(),
    onDidChangeVisibility: () => new Disposable(),
    onDidExpandElement: () => new Disposable(),
    reveal: () => Promise.resolve(),
    dispose: () => {},
  };
}

function registerTreeDataProvider(viewId) {
  post('treeDataProvider.register', { viewId });
  return new Disposable();
}

function createTextEditorDecorationType(options = {}) {
  post('textEditorDecorationType.create', {
    hasOptions: Boolean(options && Object.keys(options).length),
  });
  return {
    key: `octopus-decoration-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    dispose: () => {},
  };
}

function createWorkspaceEventRegistration(eventName) {
  return listener => {
    post('workspace.eventRegistered', { eventName });
    return new Disposable(() => {
      if (typeof listener === 'function') post('workspace.eventDisposed', { eventName });
    });
  };
}

function cloneValue(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return { ...value };
  return value;
}

function getNestedValue(source, key) {
  if (!source || !key) return undefined;
  return String(key).split('.').reduce((value, part) => value?.[part], source);
}

function getConfigurationRoot(section = '') {
  const parts = String(section || '').split('.').filter(Boolean);
  const rootSection = parts[0] || '';
  const sectionPath = parts.slice(1).join('.');
  const rootDefaults = generatedPolyfills.configDefaults?.[rootSection] || {};
  const sectionDefaults = sectionPath ? getNestedValue(rootDefaults, sectionPath) : rootDefaults;
  return { rootSection, sectionDefaults: sectionDefaults || {}, sectionPath };
}

function getConfigurationDefault(section, key, fallback) {
  const rawKey = String(key || '');
  const { rootSection, sectionPath, sectionDefaults } = getConfigurationRoot(section || rawKey);
  const effectiveKey = section
    ? rawKey
    : rawKey.split('.').slice(1).join('.');
  const exactValue = Object.prototype.hasOwnProperty.call(sectionDefaults, effectiveKey)
    ? sectionDefaults[effectiveKey]
    : getNestedValue(sectionDefaults, effectiveKey || rawKey)
      ?? getNestedValue(generatedPolyfills.configDefaults?.[rootSection], sectionPath && rawKey ? `${sectionPath}.${rawKey}` : rawKey);
  return exactValue === undefined ? fallback : cloneValue(exactValue);
}

function getConfigurationHasDefault(section, key) {
  const marker = {};
  return getConfigurationDefault(section, key, marker) !== marker;
}

function inspectConfigurationDefault(section, key) {
  const value = getConfigurationDefault(section, key, undefined);
  if (value === undefined) return undefined;
  return { defaultValue: value, globalValue: undefined, workspaceValue: undefined };
}

function getConfigurationSection(section = '') {
  const { sectionDefaults } = getConfigurationRoot(section);
  return {
    ...cloneValue(sectionDefaults),
    get: (key, fallback) => getConfigurationDefault(section, key, fallback),
    has: key => getConfigurationHasDefault(section, key),
    inspect: key => inspectConfigurationDefault(section, key),
    update: () => Promise.resolve(),
  };
}

const vscode = {
  version: '1.94.0-octopus-shim',
  Disposable,
  EventEmitter,
  TreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  Uri,
  ThemeIcon: class ThemeIcon {
    constructor(id) {
      this.id = id;
    }
  },
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  commands: {
    registerCommand(name, handler) {
      commandRegistry.set(name, handler);
      post('commandRegistered', { command: name });
      return new Disposable(() => commandRegistry.delete(name));
    },
    executeCommand(name, ...args) {
      const command = commandRegistry.get(name);
      if (!command) return Promise.resolve(undefined);
      return Promise.resolve(command(...args));
    },
    getCommands() {
      return Promise.resolve([...commandRegistry.keys()]);
    },
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 },
  window: {
    activeTextEditor: undefined,
    visibleTextEditors: [],
    showInformationMessage: message => {
      post('info', { message: String(message) });
      return Promise.resolve(undefined);
    },
    showWarningMessage: message => {
      post('warn', { message: String(message) });
      return Promise.resolve(undefined);
    },
    showErrorMessage: message => {
      post('errorMessage', { message: String(message) });
      return Promise.resolve(undefined);
    },
    createOutputChannel,
    createTerminal,
    createStatusBarItem: () => ({
      text: '',
      tooltip: '',
      command: undefined,
      show: () => {},
      hide: () => {},
      dispose: () => {},
    }),
    createWebviewPanel: (viewType, title) => ({
      viewType,
      title,
      webview: {
        html: '',
        options: {},
        onDidReceiveMessage: () => new Disposable(),
        postMessage: () => Promise.resolve(true),
      },
      reveal: () => {},
      dispose: () => {},
      onDidDispose: () => new Disposable(),
    }),
    createTreeView,
    registerTreeDataProvider,
    registerWebviewViewProvider: (viewType) => {
      post('webviewViewProvider.register', { viewType });
      return new Disposable();
    },
    createTextEditorDecorationType,
    onDidChangeActiveTextEditor: () => new Disposable(),
    onDidChangeVisibleTextEditors: () => new Disposable(),
    onDidChangeWindowState: () => new Disposable(),
  },
  workspace: {
    workspaceFolders: [],
    rootPath: undefined,
    name: 'Octopus Workspace',
    fs: {},
    getConfiguration: getConfigurationSection,
    asRelativePath: value => String(value?.fsPath || value || ''),
    findFiles: () => Promise.resolve([]),
    openTextDocument: () => Promise.resolve({ getText: () => '', uri: Uri.file('') }),
    onDidChangeConfiguration: () => new Disposable(),
    onDidChangeTextDocument: () => new Disposable(),
    onDidChangeWorkspaceFolders: () => new Disposable(),
    onDidSaveTextDocument: () => new Disposable(),
    onDidOpenTextDocument: () => new Disposable(),
    onDidCloseTextDocument: () => new Disposable(),
    onDidCreateFiles: createWorkspaceEventRegistration('onDidCreateFiles'),
    onDidDeleteFiles: createWorkspaceEventRegistration('onDidDeleteFiles'),
    onDidRenameFiles: createWorkspaceEventRegistration('onDidRenameFiles'),
    registerTextDocumentContentProvider: (scheme) => {
      post('textDocumentContentProvider.register', { scheme });
      return new Disposable();
    },
    createFileSystemWatcher: () => ({
      onDidCreate: () => new Disposable(),
      onDidChange: () => new Disposable(),
      onDidDelete: () => new Disposable(),
      dispose: () => {},
    }),
  },
  env: {
    appName: 'Octopus AI',
    appRoot: process.cwd(),
    language: 'en',
    machineId: 'octopus-local',
    sessionId: `octopus-${Date.now()}`,
    openExternal: uri => {
      post('openExternal', { uri: String(uri) });
      return Promise.resolve(true);
    },
  },
};

module.exports = { commandRegistry, vscode };
