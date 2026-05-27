const fs = require('fs');
const vscode = require('vscode');

async function run() {
  const extensionId = process.env.OCTOPUS_EXTENSION_ID;
  const resultPath = process.env.OCTOPUS_EXTENSION_RESULT_PATH;
  const startedAt = new Date().toISOString();

  function writeResult(result) {
    if (!resultPath) return;
    fs.writeFileSync(resultPath, JSON.stringify({ startedAt, ...result }, null, 2), 'utf8');
  }

  try {
    const extensions = vscode.extensions.all.map(extension => ({
      id: extension.id,
      isActive: extension.isActive,
      packageJSON: {
        name: extension.packageJSON?.name,
        publisher: extension.packageJSON?.publisher,
        displayName: extension.packageJSON?.displayName,
      },
    }));
    const extension = vscode.extensions.getExtension(extensionId)
      || vscode.extensions.all.find(item => item.id.toLowerCase() === String(extensionId || '').toLowerCase());

    if (!extension) {
      writeResult({ state: 'failed', error: `Extension not found in VS Code host: ${extensionId}`, extensions });
      throw new Error(`Extension not found in VS Code host: ${extensionId}`);
    }

    await extension.activate();
    const commands = await vscode.commands.getCommands(true);
    writeResult({
      state: 'active',
      engine: 'vscode-test-electron',
      extensionId: extension.id,
      commands: commands.filter(command => command.startsWith(`${extension.packageJSON?.name}.`) || command.includes(extension.packageJSON?.name)),
      activatedAt: new Date().toISOString(),
    });
  } catch (error) {
    writeResult({
      state: 'failed',
      engine: 'vscode-test-electron',
      extensionId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = { run };
