/**
 * Correlation Layer — Client-side Distributed Tracing (GPS System)
 *
 * المبدأ: كل عملية (HTTP, render, stream, AI) تحصل على span
 * كل span يعرف أباه → ينتج شجرة كاملة قابلة للتصوير
 *
 * Data model لكل span:
 * {
 *   spanId, traceId, parentSpanId, name,
 *   tags, startedAtMs, startedAtIso,
 *   status, durationMs, finishedAtIso,
 *   error: null | { name, message }
 * }
 */

import { BACKEND } from '../config/uiConfig.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_COMPLETED_SPANS  = 500;
const SLOW_SPAN_THRESHOLD  = 1000;   // ms — span يُعتبر بطيء فوق هذا
const FLUSH_DELAY_MS       = 400;
const MAX_EXPORT_QUEUE     = 80;
const MAX_SPAN_EVENTS      = 30;
const ACTIVE_SPAN_TIMEOUT  = 120_000;
const TRACEPARENT_VERSION  = '00';
const DEFAULT_SAMPLE_RATE  = 0.20;
const MAX_ACTIVE_SPANS     = 160;
const MAX_SESSION_SPANS    = 2500;
const ROUTE_SAMPLE_RATES   = [
  { pattern: /\/api\/octopus|\/api\/terminal\/stream/, rate: 1 },
  { pattern: /\/api\/events|\/api\/health/, rate: 0 },
  { pattern: /\/api\/files\/list|\/api\/search/, rate: 0.10 },
];

// ─── Module State ─────────────────────────────────────────────────────────────

let _traceId    = '';
let _rootSpanId = '';
let _sessionId  = '';
let _verbose    = false;   // إذا true → يُصدَّر كل span بدون sampling

const activeSpans    = new Map();   // spanId → span
const completedSpans = [];          // آخر MAX_COMPLETED spans
const exportQueue    = [];          // spans pending flush to server
const contextStack   = [];          // stack of spanIds — يتتبع الـ "current span"

let flushTimer    = null;
let _authToken    = '';
let _initialized  = false;
let _originalFetch = null;
let _fetchPatched = false;
let _sessionSpanCount = 0;
let _droppedSpanCount = 0;

// ─── ID Generation ────────────────────────────────────────────────────────────

function generateId(prefix = 'sp') {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${prefix}_${hex}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function generateTraceHex() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(16).padStart(12, '0')}${Math.random().toString(16).slice(2).padEnd(20, '0')}`.slice(0, 32);
}

function toTraceHex(traceId) {
  const clean = String(traceId || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  return clean.length >= 32 ? clean.slice(0, 32) : generateTraceHex();
}

function spanHex(spanId) {
  const clean = String(spanId || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (clean.length >= 16) return clean.slice(-16);
  return generateId('').replace(/[^a-fA-F0-9]/g, '').padStart(16, '0').slice(-16);
}

function nowIso() {
  return new Date().toISOString();
}

function safeLocation() {
  return globalThis.location?.href || '';
}

function sanitizeTagValue(value, max = 500) {
  if (value == null) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function sanitizeTags(tags = {}) {
  return Object.fromEntries(
    Object.entries(tags || {}).map(([key, value]) => [key, sanitizeTagValue(value)]),
  );
}

function serializeError(error) {
  if (!error) return null;
  return {
    name:    sanitizeTagValue(error.name || 'Error', 80),
    message: sanitizeTagValue(error.message || String(error), 1000),
    stack:   sanitizeTagValue(error.stack || '', 2000),
  };
}

function isTelemetryUrl(url = '') {
  try {
    const parsed = new URL(String(url || ''), safeLocation() || undefined);
    return parsed.pathname.startsWith('/api/events');
  } catch {
    return String(url || '').includes('/api/events');
  }
}

function describeRequest(input, init = {}) {
  const rawUrl = typeof input === 'string' ? input : input?.url;
  const method = (init?.method || input?.method || 'GET').toUpperCase();
  let path = String(rawUrl || '');
  try {
    const parsed = new URL(path, safeLocation() || undefined);
    path = parsed.pathname;
  } catch {
    // Keep the raw URL/path when URL parsing is unavailable.
  }
  return { method, rawUrl, path };
}

function sampleRateForTags(tags = {}) {
  const path = String(tags.path || tags.url || '');
  const matched = ROUTE_SAMPLE_RATES.find(item => item.pattern.test(path));
  return matched ? matched.rate : DEFAULT_SAMPLE_RATE;
}

function shouldSampleSpan({ sample, tags }) {
  if (typeof sample === 'boolean') return sample;
  const rate = Math.max(0, Math.min(1, sampleRateForTags(tags)));
  return rate >= 1 || Math.random() < rate;
}

function enforceActiveSpanLimit() {
  if (activeSpans.size <= MAX_ACTIVE_SPANS) return;
  const oldest = [...activeSpans.values()]
    .filter(span => span.spanId !== _rootSpanId)
    .sort((a, b) => a.startedAtMs - b.startedAtMs)[0];
  if (oldest) {
    _finishSpanById(oldest.spanId, {
      status: 'timeout',
      error: new Error(`Active span limit exceeded (${MAX_ACTIVE_SPANS})`),
      tags: { droppedBy: 'active_span_limit' },
    });
  }
}

function mergeHeaders(existing, additions) {
  const headers = new Headers(existing || {});
  for (const [key, value] of Object.entries(additions || {})) {
    if (value != null && !headers.has(key)) headers.set(key, value);
  }
  return headers;
}

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * يُستدعى مرة واحدة في main.jsx
 * @param {{ traceId, sessionId, verbose?, authToken? }} options
 * @returns {{ traceId, rootSpanId }}
 */
export function initCorrelation({ traceId, sessionId, verbose = false, authToken = '', patchFetch = true } = {}) {
  if (_initialized) return { traceId: _traceId, rootSpanId: _rootSpanId };

  _traceId   = traceId   || generateTraceHex();
  _sessionId = sessionId || '';
  _verbose   = verbose;
  _authToken = authToken;
  _rootSpanId = generateId('root');
  _initialized = true;

  // span جذر يمثّل عمر الصفحة كاملاً
  activeSpans.set(_rootSpanId, {
    spanId:       _rootSpanId,
    traceId:      _traceId,
    parentSpanId: null,
    name:         'page.lifetime',
    tags:         {
      url: safeLocation(),
      userAgent: globalThis.navigator?.userAgent?.slice(0, 120) || '',
      sessionId: _sessionId,
    },
    startedAtMs:  performance.now(),
    startedAtIso: nowIso(),
    status:       'active',
    events:       [],
  });

  contextStack.push(_rootSpanId);

  window.addEventListener('beforeunload', () => {
    _finishSpanById(_rootSpanId, { status: 'ok' });
    _flush();
  });

  if (patchFetch) patchFetchCorrelation();

  return { traceId: _traceId, rootSpanId: _rootSpanId };
}

// ─── Context Stack Helpers ────────────────────────────────────────────────────

/** الـ span الحالي النشط (أعمق واحد في الـ stack) */
export function currentSpanId() {
  return contextStack[contextStack.length - 1] || _rootSpanId;
}

function _pushContext(spanId) { contextStack.push(spanId); }
function _popContext(spanId) {
  const idx = contextStack.lastIndexOf(spanId);
  if (idx !== -1) contextStack.splice(idx, 1);
}

// ─── Span Lifecycle ───────────────────────────────────────────────────────────

/**
 * يبدأ span جديد
 * @param {string} name  — اسم العملية (e.g. 'http.post./api/octopus', 'groq.stream')
 * @param {{ parentSpanId?, tags?, sample? }} options
 * @returns {string} spanId
 */
export function startSpan(name, { parentSpanId, tags = {}, sample, links = [] } = {}) {
  if (!_initialized) initCorrelation();
  if (_sessionSpanCount >= MAX_SESSION_SPANS) {
    _droppedSpanCount++;
    return '';
  }

  const spanId     = generateId();
  const parent     = parentSpanId ?? currentSpanId();
  const startedAtMs = performance.now();
  const cleanTags = sanitizeTags(tags);

  const span = {
    spanId,
    traceId:      _traceId,
    parentSpanId: parent,
    name,
    tags:         cleanTags,
    sample:       shouldSampleSpan({ sample, tags: cleanTags }),
    links,
    startedAtMs,
    startedAtIso: nowIso(),
    status:       'active',
    events:       [],
    deadlineAtMs: startedAtMs + ACTIVE_SPAN_TIMEOUT,
  };

  activeSpans.set(spanId, span);
  _sessionSpanCount++;
  enforceActiveSpanLimit();
  _pushContext(spanId);
  return spanId;
}

/**
 * ينهي span ويُسجّله
 * @param {string} spanId
 * @param {{ status?, error?, tags? }} result
 * @returns {object|null} الـ span المكتمل
 */
export function finishSpan(spanId, { status = 'ok', error = null, tags = {} } = {}) {
  return _finishSpanById(spanId, { status, error, tags });
}

function _finishSpanById(spanId, { status = 'ok', error = null, tags = {} } = {}) {
  if (!spanId) return null;
  const span = activeSpans.get(spanId);
  if (!span) return null;

  const durationMs = Math.round(performance.now() - span.startedAtMs);
  const finished = {
    ...span,
    tags:          { ...span.tags, ...sanitizeTags(tags) },
    status,
    error:         serializeError(error),
    durationMs,
    finishedAtIso: nowIso(),
  };

  activeSpans.delete(spanId);
  _popContext(spanId);

  completedSpans.push(finished);
  while (completedSpans.length > MAX_COMPLETED_SPANS) completedSpans.shift();

  // Sampling logic — أرسل للـ server لو:
  const shouldExport = _verbose
    || status === 'error'
    || status === 'timeout'
    || durationMs >= SLOW_SPAN_THRESHOLD
    || finished.sample === true;

  if (shouldExport) _scheduleExport(finished);

  return finished;
}

// ─── withSpan — Async Wrapper ─────────────────────────────────────────────────

/**
 * يلف async function بـ span تلقائي
 * @param {string} name
 * @param {(spanId: string) => Promise<T>} fn
 * @param {{ parentSpanId?, tags?, sample? }} options
 * @returns {Promise<T>}
 */
export async function withSpan(name, fn, options = {}) {
  const spanId = startSpan(name, options);
  try {
    const result = await fn(spanId);
    finishSpan(spanId, { status: 'ok' });
    return result;
  } catch (err) {
    finishSpan(spanId, {
      status: 'error',
      error: err,
    });
    throw err;
  }
}

/**
 * نسخة sync من withSpan (للعمليات المتزامنة)
 */
export function withSpanSync(name, fn, options = {}) {
  const spanId = startSpan(name, options);
  try {
    const result = fn(spanId);
    finishSpan(spanId, { status: 'ok' });
    return result;
  } catch (err) {
    finishSpan(spanId, {
      status: 'error',
      error: err,
    });
    throw err;
  }
}

export function addSpanEvent(spanId = currentSpanId(), name, attributes = {}) {
  if (!spanId) return false;
  const span = activeSpans.get(spanId);
  if (!span) return false;
  span.events.push({
    name,
    attributes: sanitizeTags(attributes),
    atMs: Math.round(performance.now()),
    atIso: nowIso(),
  });
  while (span.events.length > MAX_SPAN_EVENTS) span.events.shift();
  return true;
}

// ─── HTTP Header Injection ────────────────────────────────────────────────────

/**
 * يُعيد headers للـ HTTP requests — يربط الـ server request بالـ client span
 * @param {string?} spanId — الـ span الحالي (اختياري، يأخذ currentSpanId تلقائياً)
 */
export function getCorrelationHeaders(spanId) {
  if (!_initialized) return {};
  const current = spanId || currentSpanId();
  return {
    'X-Trace-Id':      _traceId,
    'X-Span-Id':       current,
    'X-Root-Span-Id':  _rootSpanId,
    traceparent:       `${TRACEPARENT_VERSION}-${toTraceHex(_traceId)}-${spanHex(current)}-01`,
  };
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export const getTraceId    = () => _traceId;
export const getRootSpanId = () => _rootSpanId;
export const isInitialized = () => _initialized;

/** كل الـ spans النشطة الآن */
export function getActiveSpans() {
  return [...activeSpans.values()];
}

/** كل الـ spans المكتملة (آخر MAX_COMPLETED) */
export function getCompletedSpans() {
  return [...completedSpans];
}

/**
 * يُعيد timeline كامل لـ traceId معين
 * مُرتّب زمنياً — يمكن تصويره كـ flame graph
 */
export function getTimeline(targetTraceId = _traceId) {
  const all = [
    ...activeSpans.values(),
    ...completedSpans,
  ].filter(s => s.traceId === targetTraceId);

  all.sort((a, b) => a.startedAtMs - b.startedAtMs);

  // بناء شجرة الـ spans
  const byId = Object.fromEntries(all.map(s => [s.spanId, s]));
  return all.map(s => ({
    ...s,
    depth:    _getSpanDepth(s, byId),
    children: all.filter(c => c.parentSpanId === s.spanId).map(c => c.spanId),
  }));
}

export function getCriticalPath(targetTraceId = _traceId) {
  const timeline = getTimeline(targetTraceId);
  const byParent = new Map();
  for (const span of timeline) {
    const parent = span.parentSpanId || '__root__';
    byParent.set(parent, [...(byParent.get(parent) || []), span]);
  }

  function score(span) {
    const children = byParent.get(span.spanId) || [];
    const childPath = children.map(score).sort((a, b) => b.totalMs - a.totalMs)[0] || { totalMs: 0, spans: [] };
    return {
      totalMs: (span.durationMs || 0) + childPath.totalMs,
      spans: [span, ...childPath.spans],
    };
  }

  return (byParent.get('__root__') || []).map(score).sort((a, b) => b.totalMs - a.totalMs)[0] || { totalMs: 0, spans: [] };
}

function _getSpanDepth(span, byId, maxDepth = 20) {
  let depth = 0;
  let current = span;
  while (current?.parentSpanId && depth < maxDepth) {
    current = byId[current.parentSpanId];
    depth++;
  }
  return depth;
}

/**
 * يُعيد summary إحصائي للـ trace
 */
export function getTraceSummary(targetTraceId = _traceId) {
  const spans = getTimeline(targetTraceId);
  const errors   = spans.filter(s => s.status === 'error');
  const timeouts = spans.filter(s => s.status === 'timeout');
  const slow     = spans.filter(s => (s.durationMs ?? 0) >= SLOW_SPAN_THRESHOLD);
  const active   = spans.filter(s => s.status === 'active');

  return {
    traceId:    targetTraceId,
    totalSpans: spans.length,
    active:     active.length,
    errors:     errors.length,
    timeouts:   timeouts.length,
    slow:       slow.length,
    totalDurationMs: spans.reduce((sum, span) => sum + (span.durationMs || 0), 0),
    maxDepth:   spans.reduce((max, span) => Math.max(max, span.depth || 0), 0),
    sessionSpanCount: _sessionSpanCount,
    droppedSpanCount: _droppedSpanCount,
    criticalPath: getCriticalPath(targetTraceId).spans.map(s => ({ name: s.name, durationMs: s.durationMs || 0 })),
    slowSpans:  slow.map(s => ({ name: s.name, durationMs: s.durationMs })),
    errorSpans: errors.map(s => ({ name: s.name, error: s.error })),
  };
}

export function patchFetchCorrelation() {
  if (_fetchPatched || typeof window === 'undefined' || typeof window.fetch !== 'function') return false;
  _originalFetch = window.fetch.bind(window);
  _fetchPatched = true;

  window.fetch = async (input, init = {}) => {
    const { method, rawUrl, path } = describeRequest(input, init);
    if (isTelemetryUrl(rawUrl)) return _originalFetch(input, init);

    const spanId = startSpan(method === 'GET' ? SpanNames.HTTP_GET(path) : SpanNames.HTTP_POST(path), {
      tags: { method, url: rawUrl, path },
    });

    const headers = mergeHeaders(init.headers || input?.headers, getCorrelationHeaders(spanId));
    const nextInit = { ...init, headers };

    try {
      const response = await _originalFetch(input, nextInit);
      addSpanEvent(spanId, 'http.response', { status: response.status, ok: response.ok });
      finishSpan(spanId, {
        status: response.ok ? 'ok' : 'error',
        tags: {
          httpStatus: response.status,
          statusText: response.statusText,
        },
      });
      return response;
    } catch (error) {
      if (error?.name === 'AbortError') {
        finishSpan(spanId, { status: 'timeout', error });
      } else {
        finishSpan(spanId, { status: 'error', error });
      }
      throw error;
    }
  };
  return true;
}

export function sweepExpiredSpans(timeoutMs = ACTIVE_SPAN_TIMEOUT) {
  const now = performance.now();
  const expired = [];
  for (const span of activeSpans.values()) {
    if (span.spanId === _rootSpanId) continue;
    if (now - span.startedAtMs >= timeoutMs) expired.push(span.spanId);
  }
  return expired.map(spanId => _finishSpanById(spanId, {
    status: 'timeout',
    error: new Error(`Span exceeded ${timeoutMs}ms without finishing`),
  })).filter(Boolean);
}

// ─── Export to Server ─────────────────────────────────────────────────────────

function _scheduleExport(span) {
  exportQueue.push({
    type: 'client.span.finished',
    payload: {
      span,
      summary: {
        name:        span.name,
        durationMs:  span.durationMs,
        status:      span.status,
        depth:       _getSpanDepth(span, Object.fromEntries([...completedSpans, ...activeSpans.values()].map(s => [s.spanId, s]))),
        parentSpanId: span.parentSpanId,
      },
    },
    metadata: {
      category:  'client',
      source:    'correlation-layer',
      sessionId: _sessionId,
      traceId:   _traceId,
      severity:  span.status === 'error' ? 'error' : span.durationMs >= SLOW_SPAN_THRESHOLD ? 'warning' : 'info',
    },
  });
  while (exportQueue.length > MAX_EXPORT_QUEUE) exportQueue.shift();
  _scheduleFlush();
}

function _scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; _flush(); }, FLUSH_DELAY_MS);
}

function _flush() {
  if (!exportQueue.length) return;
  const events = exportQueue.splice(0, 50);
  const token = localStorage.getItem('octopusApiToken') || '';
  const headers = {
    'Content-Type': 'application/json',
    'X-Trace-Id': _traceId,
    ...(token ? { 'X-Octopus-Token': token } : {}),
  };
  fetch(`${BACKEND}/api/events/batch`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ events }),
    keepalive: true,
  }).catch(() => {});
}

// ─── Predefined Span Names (consistency) ─────────────────────────────────────

export const SpanNames = {
  // HTTP
  HTTP_POST:           name => `http.post.${name}`,
  HTTP_GET:            name => `http.get.${name}`,
  HTTP_STREAM:         name => `http.stream.${name}`,

  // AI
  AI_SEND:             'ai.send',
  AI_PARALLEL_STREAM:  'ai.parallel.stream',
  AI_PREVIEW:          'ai.preview',
  AI_CHUNK:            'ai.chunk.accumulate',

  // User actions
  USER_SEND:           'user.action.send',
  USER_ACCEPT_DIFF:    'user.action.accept_diff',
  USER_RUN_TERMINAL:   'user.action.run_terminal',
  USER_APPROVE_PLAN:   'user.action.approve_plan',

  // Rendering
  RENDER_DIFF:         'ui.render.diff',
  RENDER_STREAM:       'ui.render.stream',

  // File ops
  FILE_WRITE:          name => `file.write.${name}`,
  FILE_READ:           name => `file.read.${name}`,

  // Terminal
  TERMINAL_STREAM:     'terminal.stream',
  TERMINAL_COMMAND:    cmd => `terminal.command.${cmd.split(' ')[0]}`,
};
