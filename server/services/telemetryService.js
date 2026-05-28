/**
 * Telemetry Service — Octopus AI
 *
 * نظام مراقبة خفيف الوزن يعمل في الذاكرة:
 *   - requestId فريد لكل طلب
 *   - تتبع مراحل الـ pipeline (context build → model selection → AI call → post-process)
 *   - latency breakdown لكل مرحلة
 *   - ring buffer لآخر N span (للـ debug endpoint)
 *
 * Opt-in:  TELEMETRY_ENABLED=false يوقف الكتابة إلى buffer (الـ spans تُنشأ لكن لا تُحفظ)
 * Buffer:  TELEMETRY_MAX_SPANS=200 (default)
 */

const crypto = require('crypto');
const logger  = require('./logger').withContext('telemetry');

const IS_ENABLED   = process.env.TELEMETRY_ENABLED !== 'false';
const MAX_SPANS    = Math.max(10, Number(process.env.TELEMETRY_MAX_SPANS) || 200);

// Ring buffer: oldest entry is overwritten when full
const spanBuffer = [];

// ─── Span Object ─────────────────────────────────────────────

/**
 * ينشئ span جديد لتتبع دورة حياة request واحد
 * @param {object}  opts
 * @param {string} [opts.requestId]  — يُولَّد تلقائياً إذا لم يُعطَ
 * @param {string} [opts.label]      — وصف مختصر (octopus.chat / octopus.stream)
 * @param {string} [opts.sessionId]
 */
function createSpan({ requestId, label = 'request', sessionId = '' } = {}) {
  const id        = requestId || crypto.randomBytes(8).toString('hex');
  const startedAt = Date.now();
  const phases    = {};   // phaseName → { startedAt, endedAt, durationMs, meta }
  let   _closed   = false;

  const span = {
    get requestId() { return id; },
    get label()     { return label; },
    get sessionId() { return sessionId; },
    get startedAt() { return startedAt; },

    /**
     * بداية مرحلة
     * @param {string} phase
     */
    mark(phase) {
      if (!_closed && !phases[phase]) {
        phases[phase] = { startedAt: Date.now(), endedAt: null, durationMs: null, meta: {} };
      }
      return span;
    },

    /**
     * نهاية مرحلة مع metadata اختيارية
     * @param {string} phase
     * @param {object} [meta]
     */
    end(phase, meta = {}) {
      if (!_closed && phases[phase] && phases[phase].endedAt === null) {
        const now = Date.now();
        phases[phase].endedAt    = now;
        phases[phase].durationMs = now - phases[phase].startedAt;
        phases[phase].meta       = meta;
      }
      return span;
    },

    /**
     * يُغلق الـ span ويحفظه في buffer
     * @param {object} [summary]  — بيانات إضافية (model, tokens, error)
     * @returns {object}           — snapshot الـ span المكتمل
     */
    complete(summary = {}) {
      if (_closed) return null;
      _closed = true;

      const totalMs = Date.now() - startedAt;
      const breakdown = {};
      for (const [name, data] of Object.entries(phases)) {
        breakdown[name] = { durationMs: data.durationMs, meta: data.meta };
      }

      const snapshot = {
        requestId:  id,
        sessionId,
        label,
        startedAt,
        totalMs,
        phases:    breakdown,
        summary,
        endedAt:   Date.now(),
      };

      if (IS_ENABLED) {
        if (spanBuffer.length >= MAX_SPANS) spanBuffer.shift();
        spanBuffer.push(snapshot);
        logger.debug(`[${label}] ${id} completed in ${totalMs}ms`, { model: summary.model, tokens: summary.tokens });
      }

      return snapshot;
    },

    /**
     * يُعيد ملخص مؤقت (بدون إغلاق الـ span)
     */
    toSummary() {
      const breakdown = {};
      for (const [name, data] of Object.entries(phases)) {
        breakdown[name] = data.durationMs !== null ? data.durationMs : Date.now() - data.startedAt;
      }
      return { requestId: id, label, elapsedMs: Date.now() - startedAt, phases: breakdown };
    },
  };

  return span;
}

// ─── Buffer Access ────────────────────────────────────────────

/**
 * يعيد span مكتمل بـ requestId محدد
 * @param {string} requestId
 */
function getSpan(requestId) {
  return spanBuffer.find(s => s.requestId === requestId) || null;
}

/**
 * يعيد آخر N span
 * @param {number} limit
 */
function listSpans(limit = 50) {
  return spanBuffer.slice(-Math.min(limit, MAX_SPANS));
}

/**
 * يعيد إحصائيات الـ buffer الحالية
 */
function getStats() {
  if (spanBuffer.length === 0) return { count: 0 };
  const latencies = spanBuffer.map(s => s.totalMs).filter(Boolean);
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const max = Math.max(...latencies);
  const min = Math.min(...latencies);
  return { count: spanBuffer.length, avg_ms: avg, max_ms: max, min_ms: min };
}

module.exports = { createSpan, getSpan, listSpans, getStats };
