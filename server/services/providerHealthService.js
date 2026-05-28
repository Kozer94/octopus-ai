/**
 * Provider Health Service
 * Circuit Breaker + Runtime Metrics + Health Timeline + Event Emission
 */

const { EventEmitter } = require('events');

const HISTORY_MAX       = 100;   // آخر 100 entry في الـ timeline
const COOLDOWN_BASE_MS  = 30000; // 30s cooldown أساسي بعد 3 failures
const COOLDOWN_MAX_MS   = 300000; // 5 دقائق حد أقصى

// ─── State ──────────────────────────────────────────────────────
const state = {
  provider:             'openrouter',
  model:                null,
  status:               'unknown',   // 'healthy' | 'degraded' | 'offline' | 'unknown'
  available:            false,
  streaming:            true,
  latencyMs:            null,
  lastSuccessAt:        null,
  lastFailureAt:        null,
  lastError:            null,
  consecutiveFailures:  0,
  cooldownUntil:        null,        // Circuit Breaker — ms timestamp
  lastCheck:            null,

  // Metrics (accumulated)
  totalRequests:  0,
  successCount:   0,
  totalLatencyMs: 0,
  cooldownCount:  0,                 // كم مرة انقطعت الـ circuit
};

// ─── History Timeline ────────────────────────────────────────────
const history = [];

function pushHistory(entry) {
  history.push({ ...entry, timestamp: Date.now() });
  if (history.length > HISTORY_MAX) history.shift();
}

// ─── Event Emitter ───────────────────────────────────────────────
const emitter = new EventEmitter();
let _eventBus = null;   // اختياري — يُسجَّل من index.js بعد إنشاء eventBus

function setEventBus(bus) {
  _eventBus = bus;
}

function emitHealthEvent(type, payload) {
  emitter.emit(type, payload);
  if (_eventBus) {
    try {
      _eventBus.publish(`provider.${type}`, payload, { category: 'ai', source: 'providerHealth' });
    } catch (_) { /* eventBus failures لا تكسر الـ health service */ }
  }
}

// ─── Circuit Breaker ─────────────────────────────────────────────

function isInCooldown() {
  return state.cooldownUntil !== null && Date.now() < state.cooldownUntil;
}

function getRemainingCooldownMs() {
  if (!isInCooldown()) return 0;
  return state.cooldownUntil - Date.now();
}

function setCooldown(durationMs) {
  state.cooldownUntil = Date.now() + durationMs;
  state.cooldownCount += 1;
}

function clearCooldown() {
  state.cooldownUntil = null;
}

// ─── Core Update ─────────────────────────────────────────────────

function updateHealth(patch) {
  Object.assign(state, patch, { lastCheck: Date.now() });
}

// ─── Public API ──────────────────────────────────────────────────

function recordSuccess(providerName, latencyMs, modelId) {
  const wasOfflineOrDegraded = state.status === 'offline' || state.status === 'degraded';

  state.totalRequests  += 1;
  state.successCount   += 1;
  state.totalLatencyMs += latencyMs;

  const prevStatus = state.status;
  updateHealth({
    provider:            providerName,
    model:               modelId || state.model,
    status:              'healthy',
    available:           true,
    latencyMs,
    lastSuccessAt:       Date.now(),
    lastError:           null,
    consecutiveFailures: 0,
    cooldownUntil:       null,     // Circuit Breaker reset on success
  });

  pushHistory({ status: 'healthy', latencyMs, provider: providerName });

  if (wasOfflineOrDegraded && prevStatus !== 'healthy') {
    emitHealthEvent('recovered', { provider: providerName, latencyMs });
  } else {
    emitHealthEvent('healthy', { provider: providerName, latencyMs });
  }
}

function recordFailure(providerName, error) {
  const consecutive = state.consecutiveFailures + 1;
  state.totalRequests += 1;

  const newStatus = consecutive >= 3 ? 'offline' : 'degraded';

  // Circuit Breaker: عند الوصول لـ offline → cooldown exponential backoff
  let cooldownMs = null;
  if (newStatus === 'offline') {
    cooldownMs = Math.min(COOLDOWN_BASE_MS * Math.pow(2, state.cooldownCount), COOLDOWN_MAX_MS);
    setCooldown(cooldownMs);
  }

  updateHealth({
    provider:            providerName,
    status:              newStatus,
    available:           newStatus !== 'offline',
    lastFailureAt:       Date.now(),
    lastError:           error?.message || String(error),
    consecutiveFailures: consecutive,
  });

  pushHistory({ status: newStatus, error: state.lastError, provider: providerName });

  emitHealthEvent(newStatus, {
    provider:     providerName,
    error:        state.lastError,
    consecutive,
    cooldownMs,
  });
}

function getHealth() {
  const successRate    = state.totalRequests > 0 ? (state.successCount / state.totalRequests) : null;
  const avgLatencyMs   = state.successCount  > 0 ? Math.round(state.totalLatencyMs / state.successCount) : null;
  const uptimePercent  = successRate !== null ? Math.round(successRate * 1000) / 10 : null;
  const cooldownRemMs  = getRemainingCooldownMs();

  return {
    provider:            state.provider,
    model:               state.model,
    status:              state.status,
    available:           isInCooldown() ? false : state.available,
    streaming:           state.streaming,
    latencyMs:           state.latencyMs,
    avgLatencyMs,
    lastSuccessAt:       state.lastSuccessAt,
    lastFailureAt:       state.lastFailureAt,
    lastError:           state.lastError,
    consecutiveFailures: state.consecutiveFailures,
    circuitBreaker: {
      active:        isInCooldown(),
      cooldownUntil: state.cooldownUntil,
      cooldownRemMs,
      cooldownCount: state.cooldownCount,
    },
    metrics: {
      totalRequests: state.totalRequests,
      successCount:  state.successCount,
      successRate,
      uptimePercent,
      avgLatencyMs,
    },
    lastCheck: state.lastCheck,
  };
}

function getHistory(limit = 50) {
  return history.slice(-limit);
}

module.exports = {
  emitter,
  setEventBus,
  isInCooldown,
  getRemainingCooldownMs,
  updateHealth,
  recordSuccess,
  recordFailure,
  getHealth,
  getHistory,
};
