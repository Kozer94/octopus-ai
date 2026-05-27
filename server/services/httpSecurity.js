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
  // 🔒 رفض origin الفارغ لمنع CSRF attacks
  if (!origin) return false;
  return allowedOrigins.has(origin);
}

function createCorsOptions(allowedOrigins = getAllowedOrigins()) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  return {
    origin(origin, callback) {
      // In development, allow all origins for easier local testing
      if (isDevelopment) return callback(null, true);
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
