const { spawn } = require('child_process');
const path = require('path');

const MAX_COMMAND_LENGTH = 500;

const BLOCKED_PATTERNS = [
  // الأوامر المدمرة
  /\brm\s+-rf\b/i,
  /\bdel\s+\/f\s+\/s\b/i,
  /\bformat\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fd\b/i,
  // قراءة ملفات الأسرار من الـ disk
  /\b(cat|type|Get-Content|more|less|head|tail)\b.*\.env\b/i,
  /\b(cat|type|Get-Content|more|less|head|tail)\b.*\.(key|pem|pfx|p12|crt)\b/i,
  // تنفيذ كود محمّل من الشبكة
  /\b(curl|wget)\b.*\|\s*(bash|sh|cmd|powershell)\b/i,
  // shell command substitution — injection via backticks or $()
  /`[^`]+`/,
  /\$\([^)]*\)/,
  // command chaining — منع injection عبر chaining operators
  /;/,
  /&&/,
  /\|\|/,
  /\|/,
  />/,
  /</,
  /\r|\n/,
];

const SECRET_ENV_PATTERN = /(api|token|secret|password|passwd|private|key)/i;

function resolveWorkingDirectory(cwd, fallback = process.cwd(), allowedRoot = null) {
  const resolved = path.resolve(cwd || fallback);

  if (allowedRoot) {
    const normalizedRoot = path.resolve(allowedRoot);
    const isInside = resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep);
    if (!isInside) {
      const error = new Error('المسار خارج نطاق المشروع المسموح به');
      error.statusCode = 403;
      throw error;
    }
  }

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

  if (normalized.length > MAX_COMMAND_LENGTH) {
    const error = new Error(`الأمر طويل جداً (الحد الأقصى: ${MAX_COMMAND_LENGTH} حرف)`);
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

function splitCommand(command) {
  const matches = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map(part => {
    const quote = part[0];
    if ((quote === '"' || quote === "'") && part.endsWith(quote)) {
      return part.slice(1, -1);
    }
    return part;
  });
}

function runCommand(command, cwd, allowedRoot = null) {
  const safeCommand = validateCommand(command);
  const workingDir = resolveWorkingDirectory(cwd, process.cwd(), allowedRoot);
  const [executable, ...args] = splitCommand(safeCommand);

  return new Promise((resolve) => {
    if (!executable) {
      resolve({ success: false, output: 'command مطلوب' });
      return;
    }

    const child = spawn(executable, args, {
      cwd: workingDir,
      env: buildSafeEnv(),
      shell: false,
      windowsHide: true,
    });

    let output = '';
    const timeout = setTimeout(() => {
      terminateProcess(child);
      resolve({ success: false, output: 'command timed out' });
    }, 30000);

    child.stdout.on('data', data => { output += data.toString(); });
    child.stderr.on('data', data => { output += data.toString(); });
    child.on('error', error => {
      clearTimeout(timeout);
      resolve({ success: false, output: error.message });
    });
    child.on('close', code => {
      clearTimeout(timeout);
      resolve({ success: code === 0, output });
    });
  });
}

function spawnCommand(command, cwd, allowedRoot = null) {
  const safeCommand = validateCommand(command);
  const workingDir = resolveWorkingDirectory(cwd, process.cwd(), allowedRoot);
  const [executable, ...args] = splitCommand(safeCommand);

  return spawn(executable, args, {
    cwd: workingDir,
    env: buildSafeEnv(),
    shell: false,
    windowsHide: true,
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
  resolveWorkingDirectory,
  runCommand,
  spawnCommand,
  splitCommand,
  terminateProcess,
  validateCommand,
};
