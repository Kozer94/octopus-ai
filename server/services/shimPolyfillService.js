const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const GENERATED_HEADER = `// This file is managed by Octopus AI.\n// It contains narrowly-scoped VS Code shim defaults generated from runtime failures.\n\n`;

const TODO_TREE_CONFIG_DEFAULTS = {
  general: {
    tags: ['BUG', 'HACK', 'FIXME', 'TODO', 'XXX', '[ ]', '[x]'],
    tagGroups: {},
    statusBar: 'tags',
  },
  highlights: {
    customHighlight: {
      BUG: { icon: 'bug' },
      HACK: { icon: 'tools' },
      FIXME: { icon: 'flame' },
      XXX: { icon: '$(close)' },
    },
    defaultHighlight: {},
    enabled: true,
    highlightDelay: 500,
    useColourScheme: false,
    foregroundColourScheme: ['white', 'black', 'black', 'white', 'white', 'white', 'black'],
    backgroundColourScheme: ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'],
  },
  regex: {
    regex: '(//|#|<!--|;|/\\*|^|^[ \\t]*(-|\\d+.))\\s*($TAGS)',
    regexCaseSensitive: true,
    subTagRegex: '',
    enableMultiLine: false,
  },
  tree: {
    buttons: {},
    expanded: false,
    flat: false,
    grouped: true,
    groupedByTag: false,
    groupedBySubTag: false,
    tagsOnly: false,
    labelFormat: '${tag} ${after}',
    tooltipFormat: '${filepath}, line ${line}',
    scanMode: 'workspace',
    scanAtStartup: false,
    showBadges: true,
    showCurrentScanMode: true,
    showCountsInTree: false,
    showScanModeButton: true,
  },
  filtering: {
    excludedWorkspaces: [],
    excludeGlobs: ['**/node_modules'],
    includedWorkspaces: [],
    includeGlobs: [],
    includeHiddenFiles: false,
    passGlobsToRipgrep: true,
    scopes: [],
    useBuiltInExcludes: 'none',
  },
  ripgrep: {
    ripgrep: '',
    ripgrepArgs: '--max-columns=1000 --no-config ',
    ripgrepMaxBuffer: 200,
    usePatternFile: true,
  },
};

function normalizeExtensionId(value = '') {
  return String(value).trim().toLowerCase();
}

function loadPolyfills(polyfillsPath) {
  if (!fs.existsSync(polyfillsPath)) return { configDefaults: {}, apiPolyfills: {} };
  delete require.cache[require.resolve(polyfillsPath)];
  const polyfills = require(polyfillsPath);
  return {
    configDefaults: { ...(polyfills.configDefaults || {}) },
    apiPolyfills: { ...(polyfills.apiPolyfills || {}) },
  };
}

function writePolyfills(polyfillsPath, polyfills) {
  const body = `${GENERATED_HEADER}module.exports = ${JSON.stringify(polyfills, null, 2)};\n`;
  return fsp.writeFile(polyfillsPath, body, 'utf8');
}

function createShimPolyfillService({
  polyfillsPath = path.join(__dirname, '..', 'runtime', 'extensionHost', 'generatedShimPolyfills.js'),
} = {}) {
  async function repairCompatibilityGap({ extensionId, errorSignal = '' } = {}) {
    const normalizedId = normalizeExtensionId(extensionId);
    const signal = String(errorSignal || '');
    const isTodoTree = normalizedId.includes('todo-tree');
    const isConfigObjectFailure = /Cannot convert undefined or null to object|Object\.keys|customHighlight|configuration/i.test(signal);
    const isDecorationTypeFailure = /createTextEditorDecorationType/i.test(signal);
    const isWorkspaceFileEventFailure = /workspace\.onDid(?:Create|Delete|Rename)Files/i.test(signal);

    if (!isTodoTree || !isConfigObjectFailure) {
      if (isDecorationTypeFailure) {
        const polyfills = loadPolyfills(polyfillsPath);
        const key = 'window.createTextEditorDecorationType';
        const wasPresent = Boolean(polyfills.apiPolyfills[key]);
        polyfills.apiPolyfills[key] = true;
        await writePolyfills(polyfillsPath, polyfills);

        return {
          applied: !wasPresent,
          polyfillId: 'window.createTextEditorDecorationType',
          message: 'Added a safe text editor decoration type shim for extensions that create editor highlights.',
          changedFiles: [
            path.relative(path.join(__dirname, '..', '..'), polyfillsPath).replace(/\\/g, '/'),
            'server/runtime/extensionHost/vscodeShim.js',
          ],
        };
      }

      if (isWorkspaceFileEventFailure) {
        const polyfills = loadPolyfills(polyfillsPath);
        const keys = [
          'workspace.onDidCreateFiles',
          'workspace.onDidDeleteFiles',
          'workspace.onDidRenameFiles',
        ];
        const wasPresent = keys.every(key => polyfills.apiPolyfills[key]);
        for (const key of keys) polyfills.apiPolyfills[key] = true;
        await writePolyfills(polyfillsPath, polyfills);

        return {
          applied: !wasPresent,
          polyfillId: 'workspace.file-events',
          message: 'Added safe workspace file event shims for extensions that listen to created, deleted, or renamed files.',
          changedFiles: [
            path.relative(path.join(__dirname, '..', '..'), polyfillsPath).replace(/\\/g, '/'),
            'server/runtime/extensionHost/vscodeShim.js',
          ],
        };
      }

      const isWebviewProviderFailure = /registerWebviewViewProvider/i.test(signal);

      if (isWebviewProviderFailure) {
        const polyfills = loadPolyfills(polyfillsPath);
        const key = 'window.registerWebviewViewProvider';
        const wasPresent = Boolean(polyfills.apiPolyfills[key]);
        polyfills.apiPolyfills[key] = true;
        await writePolyfills(polyfillsPath, polyfills);

        return {
          applied: !wasPresent,
          polyfillId: 'window.registerWebviewViewProvider',
          message: 'Added a safe registerWebviewViewProvider stub — extension activates without a webview UI.',
          changedFiles: [
            path.relative(path.join(__dirname, '..', '..'), polyfillsPath).replace(/\\/g, '/'),
            'server/runtime/extensionHost/vscodeShim.js',
          ],
          confidence: 'low',
          sideEffects: ['Webview panel will not render — activation succeeds without UI'],
        };
      }

      const error = new Error('No safe shim recipe is available for this runtime failure yet');
      error.statusCode = 422;
      throw error;
    }

    const polyfills = loadPolyfills(polyfillsPath);
    const previousDefaults = JSON.stringify(polyfills.configDefaults['todo-tree'] || null);
    polyfills.configDefaults['todo-tree'] = {
      ...(polyfills.configDefaults['todo-tree'] || {}),
      ...TODO_TREE_CONFIG_DEFAULTS,
    };

    await writePolyfills(polyfillsPath, polyfills);

    return {
      applied: JSON.stringify(polyfills.configDefaults['todo-tree']) !== previousDefaults,
      polyfillId: 'todo-tree.configuration-defaults',
      message: 'Added safe Todo Tree configuration defaults to the VS Code shim polyfills.',
      changedFiles: [path.relative(path.join(__dirname, '..', '..'), polyfillsPath).replace(/\\/g, '/')],
    };
  }

  return { repairCompatibilityGap };
}

module.exports = { createShimPolyfillService };
