/**
 * Structured Logger — Octopus AI
 * بديل console.log المباشر — ينتج structured output في production
 * ويدعم level filtering عبر LOG_LEVEL env
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const IS_PROD = process.env.NODE_ENV === 'production';
const IS_TEST = Boolean(process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === 'test');

const configuredLevel = LEVELS[String(process.env.LOG_LEVEL || '').toLowerCase()];
const LOG_LEVEL = configuredLevel !== undefined ? configuredLevel : (IS_PROD ? LEVELS.info : LEVELS.debug);

const ICONS = { debug: '🔍', info: 'ℹ️ ', warn: '⚠️ ', error: '❌' };

function serialize(arg) {
  if (arg === null || arg === undefined) return String(arg);
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack || arg.message;
  try { return JSON.stringify(arg); } catch { return String(arg); }
}

function emit(level, args) {
  if (IS_TEST) return;
  if (LEVELS[level] < LOG_LEVEL) return;

  const ts = new Date().toISOString();
  const msg = args.map(serialize).join(' ');

  if (IS_PROD) {
    // نمط JSON لـ log aggregators (Datadog, Loki, etc.)
    const line = JSON.stringify({ ts, level, msg });
    (console[level] || console.log)(line);
  } else {
    // نمط قابل للقراءة للتطوير
    (console[level] || console.log)(`${ICONS[level]} [${ts}] ${msg}`);
  }
}

/**
 * مثيل Logger يدعم الـ context binding
 * استخدام: const log = logger.withContext('aiService')
 */
const logger = {
  debug: (...args) => emit('debug', args),
  info:  (...args) => emit('info',  args),
  warn:  (...args) => emit('warn',  args),
  error: (...args) => emit('error', args),

  /**
   * يربط الـ logger بـ context محدد (اسم الموديول أو traceId)
   * @param {string} ctx
   */
  withContext(ctx) {
    const prefix = `[${ctx}]`;
    return {
      debug: (...args) => emit('debug', [prefix, ...args]),
      info:  (...args) => emit('info',  [prefix, ...args]),
      warn:  (...args) => emit('warn',  [prefix, ...args]),
      error: (...args) => emit('error', [prefix, ...args]),
    };
  },

  /** adapter متوافق مع واجهة console للاستخدام كـ default logger */
  asConsoleAdapter() {
    return {
      log:   (...args) => emit('info',  args),
      info:  (...args) => emit('info',  args),
      warn:  (...args) => emit('warn',  args),
      error: (...args) => emit('error', args),
      debug: (...args) => emit('debug', args),
    };
  },
};

module.exports = logger;
