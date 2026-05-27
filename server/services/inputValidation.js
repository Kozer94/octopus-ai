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

// 🔒 تعميم رسائل الخطأ في الإنتاج لمنع تسريب معلومات حساسة
const SAFE_ERROR_MESSAGES = {
  400: 'طلب غير صالح',
  401: 'غير مصرح',
  403: 'محظور',
  404: 'غير موجود',
  413: 'الحمولة كبيرة جداً',
  429: 'طلبات كثيرة جداً',
  500: 'خطأ داخلي في الخادم',
  504: 'انتهت المهلة',
};

function safeErrorMessage(error, nodeEnv = process.env.NODE_ENV || 'development') {
  // في وضع التطوير نعرض الرسالة الحقيقية
  if (nodeEnv === 'development') return error.message;

  const status = error.statusCode || 500;

  // الأخطاء المتوقعة (4xx) نعرض رسالتها الآمنة
  if (status >= 400 && status < 500 && error.message) {
    return error.message;
  }

  // أخطاء 5xx نعممها لمنع تسريب مسارات ملفات أو معلومات داخلية
  return SAFE_ERROR_MESSAGES[status] || 'خطأ داخلي';
}

module.exports = {
  PACKAGE_NAME_PATTERN,
  createRequestGuard,
  readBoolean,
  readObject,
  readPackageName,
  readString,
  rejectDangerousKeys,
  safeErrorMessage,
};
