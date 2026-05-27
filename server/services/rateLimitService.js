const rateLimit = require('express-rate-limit');

const DEFAULT_RATE_LIMITS = {
  api: { windowMs: 15 * 60 * 1000, max: 100, message: 'طلبات كثيرة جداً، الرجاء المحاولة لاحقاً' },
  ai: { windowMs: 15 * 60 * 1000, max: 30, message: 'طلبات AI كثيرة جداً، الرجاء المحاولة لاحقاً' },
  terminal: { windowMs: 15 * 60 * 1000, max: 20, message: 'طلبات terminal كثيرة جداً، الرجاء المحاولة لاحقاً' },
  mutation: { windowMs: 15 * 60 * 1000, max: 60, message: 'طلبات تعديل كثيرة جداً، الرجاء المحاولة لاحقاً' },
};

const DEFAULT_EVENTS_BURST_LIMIT = {
  windowMs: 1000,
  max: 10,
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

function isEventsReadRequest(req) {
  return req.method === 'GET' && (req.path === '/api/events' || req.path === '/api/events/stream');
}

function createEventsBurstGuard(options = {}) {
  const windowMs = Number(options.windowMs) > 0 ? Number(options.windowMs) : DEFAULT_EVENTS_BURST_LIMIT.windowMs;
  const max = Number(options.max) > 0 ? Number(options.max) : DEFAULT_EVENTS_BURST_LIMIT.max;
  const hits = new Map();

  return function eventsBurstGuard(req, res, next) {
    if (!(req.method === 'GET' && req.path === '/api/events')) {
      next();
      return;
    }

    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const prev = hits.get(key) || { count: 0, ts: now };

    if (now - prev.ts < windowMs) {
      prev.count += 1;
    } else {
      prev.count = 1;
      prev.ts = now;
    }

    hits.set(key, prev);

    if (prev.count > max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      res.status(429).json({
        success: false,
        rateLimited: true,
        error: 'EVENTS_RATE_LIMIT_TRIGGERED',
      });
      return;
    }

    next();
  };
}

function createApiRateLimiters(env) {
  const config = Object.fromEntries(
    Object.entries(DEFAULT_RATE_LIMITS).map(([name, defaults]) => [name, buildLimitConfig(env, name, defaults)]),
  );

  return {
    aiLimiter: createLimiter(config.ai),
    config,
    eventsBurstGuard: createEventsBurstGuard({
      max: readLimit(env, 'OCTOPUS_EVENTS_BURST_MAX', DEFAULT_EVENTS_BURST_LIMIT.max),
      windowMs: readLimit(env, 'OCTOPUS_EVENTS_BURST_WINDOW_MS', DEFAULT_EVENTS_BURST_LIMIT.windowMs),
    }),
    limiter: createLimiter(config.api, {
      skip: req => isEventsReadRequest(req) || req.path === '/api/events/batch',
    }),
    mutationLimiter: createLimiter(config.mutation, {
      skip: req => req.path === '/api/events/batch' || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method),
    }),
    terminalLimiter: createLimiter(config.terminal),
  };
}

module.exports = {
  DEFAULT_RATE_LIMITS,
  DEFAULT_EVENTS_BURST_LIMIT,
  createApiRateLimiters,
  createEventsBurstGuard,
};
