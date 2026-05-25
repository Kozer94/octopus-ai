const crypto = require('crypto');

const DEFAULT_PUBLIC_API_PATHS = new Set([
  '/api/health',
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

    if (!configuredToken && nodeEnv !== 'production' && allowLocalWithoutToken && isLocalAddress(remoteAddress)) {
      res.set?.('X-Octopus-Auth', 'local-dev');
      return next();
    }

    const clientToken = String(getClientToken(req)).trim();
    if (configuredToken && clientToken && timingSafeEqualString(clientToken, configuredToken)) {
      res.set?.('X-Octopus-Auth', 'token');
      return next();
    }

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
