/**
 * Typed Error Hierarchy — Octopus AI
 *
 * كل error يحمل:
 *   code       — معرّف machine-readable
 *   severity   — low | medium | high | critical
 *   retryable  — هل يجب إعادة المحاولة
 *   context    — snapshot من البيانات وقت الخطأ
 *   ts         — timestamp
 */

class AIError extends Error {
  constructor(message, { code = 'AI_ERROR', severity = 'high', retryable = false, context = {} } = {}) {
    super(message);
    this.name  = 'AIError';
    this.code  = code;
    this.severity  = severity;
    this.retryable = retryable;
    this.context   = context;
    this.ts        = Date.now();
    if (Error.captureStackTrace) Error.captureStackTrace(this, new.target);
  }

  toJSON() {
    return {
      name:      this.name,
      message:   this.message,
      code:      this.code,
      severity:  this.severity,
      retryable: this.retryable,
      context:   this.context,
      ts:        this.ts,
    };
  }
}

// ─── Concrete Error Types ────────────────────────────────────

/**
 * خطأ تحقق — المُدخل غير صالح (لا يجب إعادة المحاولة)
 */
class ValidationError extends AIError {
  constructor(message, context = {}) {
    super(message, { code: 'VALIDATION_ERROR', severity: 'medium', retryable: false, context });
    this.name = 'ValidationError';
  }
}

/**
 * خطأ provider خارجي — يمكن إعادة المحاولة مع provider آخر
 */
class ProviderError extends AIError {
  constructor(message, { providerName = '', statusCode = null, context = {} } = {}) {
    super(message, {
      code:      'PROVIDER_ERROR',
      severity:  'high',
      retryable: true,
      context:   { ...context, providerName, statusCode },
    });
    this.name         = 'ProviderError';
    this.providerName = providerName;
    this.statusCode   = statusCode;
  }
}

/**
 * خطأ timeout — يمكن إعادة المحاولة
 */
class TimeoutError extends AIError {
  constructor(message, { phase = '', limitMs = 0, context = {} } = {}) {
    super(message, {
      code:      'TIMEOUT',
      severity:  'medium',
      retryable: true,
      context:   { ...context, phase, limitMs },
    });
    this.name    = 'TimeoutError';
    this.phase   = phase;
    this.limitMs = limitMs;
  }
}

/**
 * خطأ context — تعارض أو تلف في context (لا يعاد)
 */
class ContextError extends AIError {
  constructor(message, context = {}) {
    super(message, { code: 'CONTEXT_ERROR', severity: 'critical', retryable: false, context });
    this.name = 'ContextError';
  }
}

/**
 * خطأ rate limit — يجب الانتظار قبل إعادة المحاولة
 */
class RateLimitError extends AIError {
  constructor(message, { providerName = '', retryAfterMs = 0, context = {} } = {}) {
    super(message, {
      code:      'RATE_LIMIT',
      severity:  'low',
      retryable: true,
      context:   { ...context, providerName, retryAfterMs },
    });
    this.name         = 'RateLimitError';
    this.providerName = providerName;
    this.retryAfterMs = retryAfterMs;
  }
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * يعيد رسالة آمنة للـ client بدون تسرب context داخلي
 */
function safeClientMessage(error) {
  if (error instanceof ValidationError) return error.message;
  if (error instanceof TimeoutError)    return 'Request timed out. Please try again.';
  if (error instanceof RateLimitError)  return 'Rate limit reached. Please wait and retry.';
  if (error instanceof ProviderError)   return 'AI provider temporarily unavailable. Retrying...';
  if (error instanceof ContextError)    return 'Request context error. Please reset and try again.';
  return error.message || 'An unexpected error occurred.';
}

module.exports = {
  AIError,
  ValidationError,
  ProviderError,
  TimeoutError,
  ContextError,
  RateLimitError,
  safeClientMessage,
};
