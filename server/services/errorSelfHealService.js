/**
 * 🔧 Error Self-Heal Service
 * Bridges terminal errors to AI for automatic workspace healing
 * Intercepts stderr from terminal commands and prompts AI to fix compilation/execution errors
 */

const { hudLog } = require('../hud-ws');

// Error patterns that trigger auto-healing
const ERROR_PATTERNS = [
  // Compilation errors
  /error\s+TS\d+:/i,
  /error\s+CS\d+:/i,
  /error\s+\w+\.js:/i,
  /error:\s+cannot find/i,
  /error:\s+module not found/i,
  /error:\s+unexpected token/i,
  /error:\s+syntax error/i,
  /error:\s+undefined is not a function/i,
  /error:\s+cannot read/i,
  // Build errors
  /build failed/i,
  /compilation failed/i,
  /npm\s+ERR!/i,
  /yarn\s+error/i,
  // Runtime errors
  /referenceerror/i,
  /typeerror/i,
  /rangeerror/i,
  /uncaught exception/i,
];

let healingInProgress = false;
let lastErrorTime = 0;
const ERROR_COOLDOWN_MS = 5000; // 5 seconds cooldown between healing attempts

function isErrorHealable(stderr) {
  if (!stderr || typeof stderr !== 'string') return false;
  
  // Check if any error pattern matches
  return ERROR_PATTERNS.some(pattern => pattern.test(stderr));
}

async function triggerAutoHeal({
  command,
  stderr,
  cwd,
  projectDir,
  callAI,
  systemPrompt,
}) {
  if (healingInProgress) {
    hudLog('warn', 'Auto-heal already in progress, skipping');
    return null;
  }

  const now = Date.now();
  if (now - lastErrorTime < ERROR_COOLDOWN_MS) {
    hudLog('warn', 'Auto-heal cooldown active, skipping');
    return null;
  }

  healingInProgress = true;
  lastErrorTime = now;
  hudLog('info', `🔧 Auto-heal triggered for command: ${command}`);

  try {
    const healingPrompt = `The following terminal command failed with an error:

Command: ${command}
Working Directory: ${cwd || projectDir}
Error Output:
${stderr}

Analyze this error and provide a fix. Your response must include:
1. A brief explanation of what went wrong
2. The exact fix (code change or command) to resolve it
3. Use <file path="..."> tags for file changes or <terminal> tags for commands

Respond concisely and directly.`;

    const fix = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: healingPrompt },
    ], 4096, 'auto-heal', '');

    hudLog('ok', '🔧 Auto-heal suggestion generated');
    return {
      success: true,
      originalCommand: command,
      stderr,
      suggestion: fix,
      timestamp: now,
    };
  } catch (error) {
    hudLog('err', `🔧 Auto-heal failed: ${error.message}`);
    return {
      success: false,
      originalCommand: command,
      stderr,
      error: error.message,
      timestamp: now,
    };
  } finally {
    healingInProgress = false;
  }
}

function createErrorSelfHealService({ eventBus, callAI, systemPrompt }) {
  if (!eventBus) {
    console.warn('⚠️ Error Self-Heal Service: eventBus not provided, service disabled');
    return { triggerAutoHeal, isErrorHealable };
  }

  // Subscribe to terminal stream failures
  eventBus.on('terminal.stream.failed', (event) => {
    const { command, cwd, error } = event.payload;
    if (isErrorHealable(error)) {
      hudLog('warn', `🔧 Detected healable error in terminal: ${error.slice(0, 100)}`);
      // Note: We don't auto-trigger healing here to avoid infinite loops
      // The UI can call triggerAutoHeal explicitly if needed
    }
  });

  // Subscribe to terminal command failures
  eventBus.on('terminal.command.failed', (event) => {
    const { error } = event.payload;
    if (isErrorHealable(error)) {
      hudLog('warn', `🔧 Detected healable error in command: ${error.slice(0, 100)}`);
    }
  });

  // Subscribe to process run failures
  eventBus.on('process.run.exited', (event) => {
    const { command, code } = event.payload;
    if (code !== 0) {
      hudLog('warn', `🔧 Process exited with error code: ${code}`);
    }
  });

  return {
    triggerAutoHeal,
    isErrorHealable,
    getHealingStatus: () => ({ inProgress: healingInProgress, lastErrorTime }),
  };
}

module.exports = {
  createErrorSelfHealService,
  triggerAutoHeal,
  isErrorHealable,
  ERROR_PATTERNS,
};
