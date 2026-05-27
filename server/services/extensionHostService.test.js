const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createExtensionHostService } = require('./extensionHostService');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-extension-host-'));
}

test('extension host activates an extracted extension and records registered commands', async () => {
  const rootDir = makeTempRoot();
  const extractedDir = path.join(rootDir, 'server', 'state', 'extensions', 'Demo.extension', 'extracted');
  fs.mkdirSync(extractedDir, { recursive: true });
  fs.writeFileSync(path.join(extractedDir, 'package.json'), JSON.stringify({
    name: 'extension',
    publisher: 'Demo',
    main: './extension.js',
  }));
  fs.writeFileSync(path.join(extractedDir, 'extension.js'), `
    const vscode = require('vscode');
    exports.activate = async function activate(context) {
      context.subscriptions.push(vscode.commands.registerCommand('demo.hello', () => 'hello'));
      context.subscriptions.push(vscode.window.registerTreeDataProvider('demo.tree', { getTreeItem() {}, getChildren() { return []; } }));
      vscode.window.createTreeView('demo.tree', { treeDataProvider: { getTreeItem() {}, getChildren() { return []; } } });
      const item = new vscode.TreeItem('Demo', vscode.TreeItemCollapsibleState.Collapsed);
      if (item.label !== 'Demo') throw new Error('TreeItem shim failed');
      await vscode.workspace.findFiles('**/*.js');
      vscode.window.showInformationMessage('activated');
    };
  `);

  const installedNpmPackages = {
    'Demo.extension': {
      id: 'Demo.extension',
      name: 'extension',
      namespace: 'Demo',
      source: 'vsx',
      extractedPath: 'server/state/extensions/Demo.extension/extracted',
      manifest: {
        name: 'extension',
        publisher: 'Demo',
        main: './extension.js',
      },
    },
  };
  let saveCount = 0;
  const service = createExtensionHostService({
    installedNpmPackages,
    rootDir,
    saveNpmPackages: () => { saveCount += 1; },
  });

  try {
    const status = await service.activate('Demo.extension');

    assert.equal(status.activationStatus, 'activated-shim');
    assert.equal(status.runtimeStatus.state, 'active');
    assert.deepEqual(status.runtimeStatus.commands, ['demo.hello']);
    assert.equal(saveCount > 0, true);
  } finally {
    await service.deactivate('Demo.extension');
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('extension host can use @vscode/test-electron as an activation base', async () => {
  const rootDir = makeTempRoot();
  const extractedDir = path.join(rootDir, 'server', 'state', 'extensions', 'Demo.extension', 'extracted');
  fs.mkdirSync(extractedDir, { recursive: true });
  fs.writeFileSync(path.join(extractedDir, 'package.json'), JSON.stringify({
    name: 'extension',
    publisher: 'Demo',
    main: './extension.js',
  }));
  fs.writeFileSync(path.join(extractedDir, 'extension.js'), 'exports.activate = function activate() {};');

  const installedNpmPackages = {
    'Demo.extension': {
      id: 'Demo.extension',
      name: 'extension',
      namespace: 'Demo',
      source: 'vsx',
      extractedPath: 'server/state/extensions/Demo.extension/extracted',
      manifest: {
        name: 'extension',
        publisher: 'Demo',
        main: './extension.js',
      },
    },
  };
  const calls = [];
  const service = createExtensionHostService({
    installedNpmPackages,
    rootDir,
    runtimeBase: 'vscode-test-electron',
    saveNpmPackages: () => {},
    vscodeTestElectron: {
      activate: async input => {
        calls.push(input);
        return {
          state: 'active',
          engine: 'vscode-test-electron',
          extensionId: 'Demo.extension',
          commands: ['demo.hello'],
          activatedAt: '2026-05-26T00:00:00.000Z',
        };
      },
    },
  });

  try {
    const status = await service.activate('Demo.extension');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].extractedPath, extractedDir);
    assert.equal(status.activationStatus, 'activated-vscode-electron');
    assert.equal(status.runtimeStatus.engine, 'vscode-test-electron');
    assert.deepEqual(status.runtimeStatus.commands, ['demo.hello']);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
