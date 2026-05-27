const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { runTests } = require('@vscode/test-electron');

function toExtensionId(manifest = {}, fallback = '') {
  const publisher = manifest.publisher || manifest.namespace;
  const name = manifest.name || fallback;
  return publisher && name ? `${publisher}.${name}` : fallback;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createVSCodeTestElectronService({
  runnerPath = path.join(__dirname, '..', 'runtime', 'vscodeTestElectron', 'activationTestRunner.js'),
  workspacePath = path.join(os.tmpdir(), 'octopus-vscode-extension-host-workspace'),
} = {}) {
  async function activate({ extractedPath, extensionId, manifest }) {
    const safeManifest = manifest || readJsonFile(path.join(extractedPath, 'package.json'));
    const realExtensionId = toExtensionId(safeManifest, extensionId);
    const resultPath = path.join(os.tmpdir(), `octopus-vscode-extension-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

    await fsp.mkdir(workspacePath, { recursive: true });

    try {
      await runTests({
        extensionDevelopmentPath: extractedPath,
        extensionTestsPath: runnerPath,
        extensionTestsEnv: {
          OCTOPUS_EXTENSION_ID: realExtensionId,
          OCTOPUS_EXTENSION_RESULT_PATH: resultPath,
        },
        launchArgs: [
          workspacePath,
          '--disable-extensions',
        ],
      });
    } catch (error) {
      if (fs.existsSync(resultPath)) return readJsonFile(resultPath);
      return {
        state: 'failed',
        engine: 'vscode-test-electron',
        extensionId: realExtensionId,
        error: error.message,
        stack: error.stack,
      };
    }

    if (!fs.existsSync(resultPath)) {
      return {
        state: 'failed',
        engine: 'vscode-test-electron',
        extensionId: realExtensionId,
        error: 'VS Code test-electron finished without an activation result',
      };
    }

    return readJsonFile(resultPath);
  }

  return { activate };
}

module.exports = { createVSCodeTestElectronService };
