const { exec, spawn } = require('child_process');
const path = require('path');

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bdel\s+\/f\s+\/s\b/i,
  /\bformat\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fd\b/i,
];

const SECRET_ENV_PATTERN = /(api|token|secret|password|passwd|private|key)/i;

function resolveWorkingDirectory(cwd, fallback = process.cwd()) {
  const resolved = path.resolve(cwd || fallback);
  const stat = require('fs').statSync(resolved);
  if (!stat.isDirectory()) {
    const error = new Error('المسار ليس مجلداً');
    error.statusCode = 400;
    throw error;
  }
  return resolved;
}

function validateCommand(command) {
  if (!command || typeof command !== 'string') {
    const error = new Error('command مطلوب');
    error.statusCode = 400;
    throw error;
  }

  const normalized = command.trim();
  if (!normalized) {
    const error = new Error('command فارغ');
    error.statusCode = 400;
    throw error;
  }

  const blocked = BLOCKED_PATTERNS.find(pattern => pattern.test(normalized));
  if (blocked) {
    const error = new Error('هذا الأمر ممنوع لأنه قد يسبب حذفاً أو إيقافاً خطيراً');
    error.statusCode = 403;
    throw error;
  }

  return normalized;
}

function buildSafeEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !SECRET_ENV_PATTERN.test(key))
  );
}

function runCommand(command, cwd) {
  const safeCommand = validateCommand(command);
  const workingDir = resolveWorkingDirectory(cwd);

  return new Promise((resolve) => {
    exec(safeCommand, {
      cwd: workingDir,
      timeout: 600000,
      maxBuffer: 1024 * 1024 * 10,
      shell: process.platform === 'win32' ? 'cmd.exe' : true,
      env: buildSafeEnv(),
    }, (error, stdout, stderr) => {
      resolve({
        success: !error || Boolean(stdout),
        output: stdout || stderr || error?.message || '',
      });
    });
  });
}

function spawnCommand(command, cwd) {
  const safeCommand = validateCommand(command);
  const workingDir = resolveWorkingDirectory(cwd);

  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/c', safeCommand], {
      cwd: workingDir,
      env: buildSafeEnv(),
    });
  }

  return spawn(safeCommand, {
    cwd: workingDir,
    env: buildSafeEnv(),
    shell: true,
  });
}

function terminateProcess(proc) {
  if (!proc || proc.killed) return;

  if (process.platform === 'win32' && proc.pid) {
    spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    return;
  }

  proc.kill('SIGTERM');
}

module.exports = {
  buildSafeEnv,
  runCommand,
  spawnCommand,
  terminateProcess,
  validateCommand,
};
