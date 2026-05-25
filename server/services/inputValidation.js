const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

function rejectDangerousKeys(value, path = 'body') {
  if (!value || typeof value !== 'object') return;

  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      const error = new Error(`Unsafe request key: ${path}.${key}`);
      error.statusCode = 400;
      throw error;
    }
    rejectDangerousKeys(value[key], `${path}.${key}`);
  }
}

function createRequestGuard() {
  return function requestGuard(req, res, next) {
    try {
      rejectDangerousKeys(req.body, 'body');
      rejectDangerousKeys(req.query, 'query');
      rejectDangerousKeys(req.params, 'params');
      next();
    } catch (error) {
      res.status(error.statusCode || 400).json({ success: false, error: error.message });
    }
  };
}

function readObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error(`${fieldName} must be an object`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function readString(value, fieldName, { required = false, max = 5000, pattern = null } = {}) {
  const text = value === undefined || value === null ? '' : String(value);
  const trimmed = text.trim();
  if (required && !trimmed) {
    const error = new Error(`${fieldName} مطلوب`);
    error.statusCode = 400;
    throw error;
  }
  if (text.length > max) {
    const error = new Error(`${fieldName} طويل جداً`);
    error.statusCode = 400;
    throw error;
  }
  if (pattern && trimmed && !pattern.test(trimmed)) {
    const error = new Error(`${fieldName} غير صالح`);
    error.statusCode = 400;
    throw error;
  }
  return trimmed;
}

function readBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === 1 || value === '1';
}

function readPackageName(value, fieldName = 'packageName') {
  return readString(value, fieldName, {
    required: true,
    max: 214,
    pattern: PACKAGE_NAME_PATTERN,
  });
}

module.exports = {
  PACKAGE_NAME_PATTERN,
  createRequestGuard,
  readBoolean,
  readObject,
  readPackageName,
  readString,
  rejectDangerousKeys,
};
