const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { createShimPolyfillService } = require('./shimPolyfillService');

test('shim polyfill service applies Todo Tree configuration defaults safely', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-shim-polyfills-'));
  const polyfillsPath = path.join(dir, 'generatedShimPolyfills.js');
  const service = createShimPolyfillService({ polyfillsPath });

  const result = await service.repairCompatibilityGap({
    extensionId: 'Gruntfuggly.todo-tree',
    errorSignal: 'TypeError: Cannot convert undefined or null to object',
  });

  assert.equal(result.applied, true);
  assert.equal(result.polyfillId, 'todo-tree.configuration-defaults');

  delete require.cache[require.resolve(polyfillsPath)];
  const generated = require(polyfillsPath);
  assert.deepEqual(generated.configDefaults['todo-tree'].highlights.customHighlight.BUG, { icon: 'bug' });
  assert.deepEqual(generated.configDefaults['todo-tree'].general.tagGroups, {});
  assert.deepEqual(generated.configDefaults['todo-tree'].general.tags.slice(0, 2), ['BUG', 'HACK']);
});

test('shim polyfill service rejects unknown compatibility gaps', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-shim-polyfills-'));
  const service = createShimPolyfillService({ polyfillsPath: path.join(dir, 'generatedShimPolyfills.js') });

  await assert.rejects(
    () => service.repairCompatibilityGap({
      extensionId: 'Unknown.extension',
      errorSignal: 'TypeError: vscode.window.someApi is not a function',
    }),
    /No safe shim recipe/,
  );
});

test('shim polyfill service applies editor decoration type shim recipe', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-shim-polyfills-'));
  const polyfillsPath = path.join(dir, 'generatedShimPolyfills.js');
  const service = createShimPolyfillService({ polyfillsPath });

  const result = await service.repairCompatibilityGap({
    extensionId: 'Blackboxapp.blackboxagent',
    errorSignal: 'Sb.window.createTextEditorDecorationType is not a function',
  });

  assert.equal(result.applied, true);
  assert.equal(result.polyfillId, 'window.createTextEditorDecorationType');

  delete require.cache[require.resolve(polyfillsPath)];
  const generated = require(polyfillsPath);
  assert.equal(generated.apiPolyfills['window.createTextEditorDecorationType'], true);
});

test('shim polyfill service accepts editor decoration gaps for unknown extensions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-shim-polyfills-'));
  const service = createShimPolyfillService({ polyfillsPath: path.join(dir, 'generatedShimPolyfills.js') });

  const result = await service.repairCompatibilityGap({
    extensionId: 'Unknown.publisher',
    errorSignal: 'vscode.window.createTextEditorDecorationType is not a function',
  });

  assert.equal(result.polyfillId, 'window.createTextEditorDecorationType');
});

test('shim polyfill service applies registerWebviewViewProvider shim recipe', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-shim-polyfills-'));
  const polyfillsPath = path.join(dir, 'generatedShimPolyfills.js');
  const service = createShimPolyfillService({ polyfillsPath });

  const result = await service.repairCompatibilityGap({
    extensionId: 'Blackboxapp.blackboxagent',
    errorSignal: 'Bb.window.registerWebviewViewProvider is not a function',
  });

  assert.equal(result.applied, true);
  assert.equal(result.polyfillId, 'window.registerWebviewViewProvider');
  assert.equal(result.confidence, 'low');
  assert.ok(Array.isArray(result.sideEffects) && result.sideEffects.length > 0);

  delete require.cache[require.resolve(polyfillsPath)];
  const generated = require(polyfillsPath);
  assert.equal(generated.apiPolyfills['window.registerWebviewViewProvider'], true);
});

test('shim polyfill service marks registerWebviewViewProvider as not-applied on second call', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-shim-polyfills-'));
  const polyfillsPath = path.join(dir, 'generatedShimPolyfills.js');
  const service = createShimPolyfillService({ polyfillsPath });

  await service.repairCompatibilityGap({
    extensionId: 'Blackboxapp.blackboxagent',
    errorSignal: 'registerWebviewViewProvider is not a function',
  });
  const second = await service.repairCompatibilityGap({
    extensionId: 'Blackboxapp.blackboxagent',
    errorSignal: 'registerWebviewViewProvider is not a function',
  });

  assert.equal(second.applied, false);
  assert.equal(second.polyfillId, 'window.registerWebviewViewProvider');
});

test('shim polyfill service applies workspace file event shim recipe', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-shim-polyfills-'));
  const polyfillsPath = path.join(dir, 'generatedShimPolyfills.js');
  const service = createShimPolyfillService({ polyfillsPath });

  const result = await service.repairCompatibilityGap({
    extensionId: 'Blackboxapp.blackboxagent',
    errorSignal: 'Bb.workspace.onDidCreateFiles is not a function',
  });

  assert.equal(result.applied, true);
  assert.equal(result.polyfillId, 'workspace.file-events');

  delete require.cache[require.resolve(polyfillsPath)];
  const generated = require(polyfillsPath);
  assert.equal(generated.apiPolyfills['workspace.onDidCreateFiles'], true);
  assert.equal(generated.apiPolyfills['workspace.onDidDeleteFiles'], true);
  assert.equal(generated.apiPolyfills['workspace.onDidRenameFiles'], true);
});
