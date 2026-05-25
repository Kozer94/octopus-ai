const rateLimit = require('express-rate-limit');

const DEFAULT_RATE_LIMITS = {
  api: { windowMs: 15 * 60 * 1000, max: 100, message: 'طلبات كثيرة جداً، الرجاء المحاولة لاحقاً' },
  ai: { windowMs: 15 * 60 * 1000, max: 30, message: 'طلبات AI كثيرة جداً، الرجاء المحاولة لاحقاً' },
  terminal: { windowMs: 15 * 60 * 1000, max: 20, message: 'طلبات terminal كثيرة جداً، الرجاء المحاولة لاحقاً' },
  mutation: { windowMs: 15 * 60 * 1000, max: 60, message: 'طلبات تعديل كثيرة جداً، الرجاء المحاولة لاحقاً' },
};

function readLimit(env, key, fallback) {
  const value = Number(env.get(key, String(fallback)));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function buildLimitConfig(env, name, defaults) {
  const envName = name.toUpperCase();
  return {
    ...defaults,
    max: readLimit(env, `OCTOPUS_RATE_LIMIT_${envName}_MAX`, defaults.max),
    windowMs: readLimit(env, `OCTOPUS_RATE_LIMIT_${envName}_WINDOW_MS`, defaults.windowMs),
  };
}

function createLimiter(config, extra = {}) {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, rateLimited: true, error: config.message },
    ...extra,
  });
}

function createApiRateLimiters(env) {
  const config = Object.fromEntries(
    Object.entries(DEFAULT_RATE_LIMITS).map(([name, defaults]) => [name, buildLimitConfig(env, name, defaults)]),
  );

  return {
    aiLimiter: createLimiter(config.ai),
    config,
    limiter: createLimiter(config.api),
    mutationLimiter: createLimiter(config.mutation, {
      skip: req => !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method),
    }),
    terminalLimiter: createLimiter(config.terminal),
  };
}

module.exports = {
  DEFAULT_RATE_LIMITS,
  createApiRateLimiters,
};
