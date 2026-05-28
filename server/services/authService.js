const crypto = require('crypto');

const DEFAULT_PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/events',
  '/api/events/stream',
  '/api/events/batch',
  '/events',
  '/events/stream',
  '/events/batch',
]);

function isLocalAddress(address = '') {
  return [
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'localhost',
  ].includes(String(address));
}

function getClientToken(req) {
  return req.get?.('X-Octopus-Token') || req.get?.('Authorization')?.replace(/^Bearer\s+/i, '') || '';
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createAuthMiddleware({
  env = process.env,
  publicApiPaths = DEFAULT_PUBLIC_API_PATHS,
  nodeEnv = env.NODE_ENV || 'development',
  allowLocalWithoutToken = env.OCTOPUS_ALLOW_LOCAL_NO_AUTH === '1',
} = {}) {
  return function authRequired(req, res, next) {
    const mountedPath = `${req.baseUrl || ''}${req.path || ''}`;
    if (publicApiPaths.has(req.path) || publicApiPaths.has(mountedPath)) return next();

    const configuredToken = String(env.OCTOPUS_API_TOKEN || '').trim();
    const remoteAddress = req.ip || req.socket?.remoteAddress || '';
    const isLocal = isLocalAddress(remoteAddress);

    // ✅ Dev mode: allow ALL localhost requests without requiring a token
    // Security kernel will assign 'developer' role as fallback if no token matches
    // This enables zero-config local development
    if (nodeEnv !== 'production' && isLocal) {
      req._localDevAuth = true; // علامة للـ security kernel يعطي developer role كـ fallback
      // If a token IS configured and client sends matching one → will get 'admin' role via identity resolver
      const clientToken = String(getClientToken(req)).trim();
      if (configuredToken && clientToken && timingSafeEqualString(clientToken, configuredToken)) {
        res.set?.('X-Octopus-Auth', 'token');
      }
      return next();
    }

    // ✅ Explicit local bypass: OCTOPUS_ALLOW_LOCAL_NO_AUTH=1 also bypasses in production
    if (allowLocalWithoutToken && isLocal) {
      req._localDevAuth = true;
      return next();
    }

    // 🔐 Non-local: token required
    const clientToken = String(getClientToken(req)).trim();
    if (configuredToken && clientToken && timingSafeEqualString(clientToken, configuredToken)) {
      res.set?.('X-Octopus-Auth', 'token');
      return next();
    }

    // ❌ Deny: no valid auth
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  };
}

module.exports = {
  DEFAULT_PUBLIC_API_PATHS,
  createAuthMiddleware,
  getClientToken,
  isLocalAddress,
  timingSafeEqualString,
};
