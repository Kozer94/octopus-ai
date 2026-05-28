const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bdel\s+\/f\b/i,
  /\bformat\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fd\b/i,
  /\bmigrate(:|$|\s)/i,
];

const CAUTION_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(install|add|remove|update|upgrade)\b/i,
  /\bcomposer\s+(install|update|require|remove)\b/i,
  /\bpip(3)?\s+install\b/i,
  /\bdocker\s+(compose\s+)?(up|run|build)\b/i,
  /\b(taskkill|kill)\b/i,
];

export function analyzeTerminalCommandRisk(command = '') {
  const text = String(command || '').trim();
  if (!text) {
    return {
      level: 'safe',
      label: 'Safe',
      color: '#7ee787',
      message: 'No command queued.',
    };
  }

  if (DESTRUCTIVE_PATTERNS.some(pattern => pattern.test(text))) {
    return {
      level: 'destructive',
      label: 'High risk',
      color: '#ff7b72',
      message: 'Can delete data, reset state, stop services, or change the database. Confirm only if this exact action is intended.',
    };
  }

  if (CAUTION_PATTERNS.some(pattern => pattern.test(text))) {
    return {
      level: 'caution',
      label: 'Review',
      color: '#ffa657',
      message: 'Can install packages or start external processes. Review the command and working directory before running.',
    };
  }

  return {
    level: 'safe',
    label: 'Low risk',
    color: '#7ee787',
    message: 'Command appears routine, but it will still run through server-side policy checks.',
  };
}
