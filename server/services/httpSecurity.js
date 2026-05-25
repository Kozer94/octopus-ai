const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];
const { createEnvReader } = require('./envService');

function getAllowedOrigins(extraOrigins = createEnvReader().get('ALLOWED_ORIGINS')) {
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...String(extraOrigins)
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
  ]);
}

function isAllowedCorsOrigin(origin, allowedOrigins = getAllowedOrigins()) {
  return !origin || allowedOrigins.has(origin);
}

function createCorsOptions(allowedOrigins = getAllowedOrigins()) {
  return {
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin, allowedOrigins)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
  };
}

module.exports = {
  DEFAULT_ALLOWED_ORIGINS,
  createCorsOptions,
  getAllowedOrigins,
  isAllowedCorsOrigin,
};
