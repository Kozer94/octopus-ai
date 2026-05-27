import { BACKEND } from '../config/uiConfig.js';

const MAX_BREADCRUMBS = 40;
const MAX_QUEUE = 120;
const FLUSH_DELAY_MS = 700;
const DUPLICATE_WINDOW_MS = 2500;

// Level 5 — alerting thresholds
const ALERT_THRESHOLD = 5;       // errors before spike alert
const ALERT_WINDOW_MS = 60_000;  // sliding window: 60s

const breadcrumbs = [];
const queue = [];
const duplicateMap = new Map();
const errorWindow = [];          // timestamps of recent errors for spike detection
let flushTimer = null;
let installed = false;
let sessionId = '';
let traceId = '';                // Level 3 — per-page-load trace ID
let originalConsole = null;
let originalFetch = null;

// ─── Level 3: Trace ID ───────────────────────────────────────────────────────

function generateTraceId() {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 18);
}

// ─── Level 2+: Error Fingerprinting ──────────────────────────────────────────

function fingerprint(type, error) {
  const msg  = error?.message || type;
  const stack = (error?.stack || '').split('\n').slice(1, 4).join('|');
  const raw  = `${type}|${msg}|${stack}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ─── Level 5: Alerting ───────────────────────────────────────────────────────

function checkAlertThreshold() {
  const now = Date.now();
  errorWindow.push(now);
  while (errorWindow.length && errorWindow[0] < now - ALERT_WINDOW_MS) errorWindow.shift();
  if (errorWindow.length >= ALERT_THRESHOLD) {
    errorWindow.length = 0; // reset — يمنع spam
    // استخدم enqueue مباشرة بدون checkAlertThreshold لتجنب recursion
    _enqueueRaw('client.alert.error_spike', {
      count: ALERT_THRESHOLD,
      windowMs: ALERT_WINDOW_MS,
      message: `${ALERT_THRESHOLD}+ errors within ${ALERT_WINDOW_MS / 1000}s`,
    }, { severity: 'critical' });
  }
}

// ─── Core Infrastructure ──────────────────────────────────────────────────────

function ensureLastPatchState(source = 'app-runtime') {
  if (globalThis.window && !window.__OCTOPUS_LAST_PATCH__) {
    window.__OCTOPUS_LAST_PATCH__ = {
      status: 'skipped',
      source,
      changed: false,
      message: 'No patch operation has run yet.',
      at: new Date().toISOString(),
    };
  }
}

function getAuthHeaders() {
  const storedToken = globalThis.localStorage?.getItem('octopusApiToken') || '';
  const envToken = import.meta.env?.VITE_OCTOPUS_API_TOKEN || '';
  const token = storedToken || envToken;
  return token ? { 'X-Octopus-Token': token } : {};
}

function trimText(value, max = 500) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function serializeError(error) {
  if (!error) return {};
  return {
    name:    trimText(error.name || 'Error', 80),
    message: trimText(error.message || String(error), 1000),
    stack:   trimText(error.stack || '', 4000),
  };
}

function serializeValue(value) {
  if (value instanceof Error) return serializeError(value);
  if (typeof value === 'string') return trimText(value, 1000);
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return trimText(value, 1000); }
}

function getElementSelector(element) {
  if (!element || element.nodeType !== 1) return '';
  const tag     = element.tagName.toLowerCase();
  const id      = element.id ? `#${CSS.escape(element.id)}` : '';
  const testId  = element.getAttribute('data-testid') || element.getAttribute('data-test');
  const role    = element.getAttribute('role');
  const aria    = element.getAttribute('aria-label');
  const classes = Array.from(element.classList || []).slice(0, 3).map(c => `.${CSS.escape(c)}`).join('');
  if (testId) return `${tag}[data-testid="${trimText(testId, 80)}"]`;
  if (id)     return `${tag}${id}`;
  if (role)   return `${tag}[role="${trimText(role, 80)}"]${classes}`;
  if (aria)   return `${tag}[aria-label="${trimText(aria, 80)}"]${classes}`;
  return `${tag}${classes}`;
}

function captureElement(element) {
  if (!element || element.nodeType !== 1) return {};
  const rect = element.getBoundingClientRect?.();
  return {
    selector: getElementSelector(element),
    tag:  element.tagName?.toLowerCase() || '',
    text: trimText(element.innerText || element.textContent || '', 160),
    href: trimText(element.getAttribute?.('href') || '', 300),
    type: trimText(element.getAttribute?.('type') || '', 80),
    name: trimText(element.getAttribute?.('name') || '', 80),
    rect: rect ? {
      x: Math.round(rect.x), y: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height),
    } : null,
  };
}

function addBreadcrumb(kind, data) {
  breadcrumbs.push({ kind, data, at: Date.now(), url: window.location.href });
  while (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
}

function eventSignature(type, payload) {
  return [
    type,
    payload?.message,
    payload?.error?.message,
    payload?.url,
    payload?.target?.selector,
  ].filter(Boolean).join('|').slice(0, 600);
}

function isTelemetryUrl(url = '') {
  try {
    const parsed = new URL(String(url || ''), window.location.href);
    return parsed.pathname.startsWith('/api/events');
  } catch {
    return String(url || '').includes('/api/events');
  }
}

// Raw enqueue — بدون alert check (يُستخدم من checkAlertThreshold لتجنب recursion)
function _enqueueRaw(type, payload = {}, metadata = {}) {
  if (!installed) return;
  const signature = eventSignature(type, payload);
  const now = Date.now();
  const lastSeen = duplicateMap.get(signature) || 0;
  if (type !== 'client.ui.click') {
    if (signature && now - lastSeen < DUPLICATE_WINDOW_MS) return;
    duplicateMap.set(signature, now);
  }
  queue.push({
    type,
    payload: {
      ...payload,
      breadcrumbs: breadcrumbs.slice(-12),
      page: {
        url: window.location.href,
        title: document.title,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      },
    },
    metadata: {
      category: 'client',
      source: 'client-telemetry',
      sessionId,
      traceId: traceId || undefined,  // Level 3 — trace correlation
      ...metadata,
    },
  });
  while (queue.length > MAX_QUEUE) queue.shift();
  scheduleFlush();
}

function enqueue(type, payload = {}, metadata = {}) {
  _enqueueRaw(type, payload, metadata);
  // Level 5 — spike detection على error events فقط
  if (type.includes('error') || type.includes('alert')) checkAlertThreshold();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_DELAY_MS);
}

function flush() {
  if (!queue.length) return;
  const events = queue.splice(0, 50);
  originalFetch(`${BACKEND}/api/events/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ events }),
    keepalive: true,
  }).catch(() => {});
}

// ─── Monkey Patches ───────────────────────────────────────────────────────────

function patchConsole() {
  originalConsole = {
    error: console.error.bind(console),
    warn:  console.warn.bind(console),
  };
  const isReactDevWarning = msg =>
    typeof msg === 'string' && (msg.startsWith('Warning:') || msg.startsWith('Each child'));

  console.error = (...args) => {
    originalConsole.error(...args);
    if (isReactDevWarning(args[0])) return;
    const err = args.find(a => a instanceof Error);
    enqueue('client.console.error', {
      args: args.map(serializeValue),
      callStack: serializeError(new Error('console.error')).stack,
      groupKey: fingerprint('client.console.error', err),  // Level 2+
    }, { severity: 'error' });
  };

  console.warn = (...args) => {
    originalConsole.warn(...args);
    if (isReactDevWarning(args[0])) return;
    enqueue('client.console.warning', {
      args: args.map(serializeValue),
      callStack: serializeError(new Error('console.warn')).stack,
    }, { severity: 'warning' });
  };
}

function patchFetch() {
  originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const startedAt = performance.now();
    const url    = typeof input === 'string' ? input : input?.url;
    const method = init?.method || input?.method || 'GET';
    const telemetryRequest = isTelemetryUrl(url);

    if (telemetryRequest) return originalFetch(input, init);

    // Level 3 — inject traceId header على كل request غير telemetry
    const augmentedInit = traceId
      ? { ...init, headers: { 'X-Trace-Id': traceId, ...(init.headers || {}) } }
      : init;

    addBreadcrumb('fetch', { method, url: trimText(url, 600) });
    try {
      const response = await originalFetch(input, augmentedInit);
      if (!response.ok) {
        enqueue('client.network.warning', {
          method,
          url:        trimText(url, 600),
          status:     response.status,
          statusText: response.statusText,
          durationMs: Math.round(performance.now() - startedAt),
        }, { severity: response.status >= 500 ? 'error' : 'warning' });
      }
      return response;
    } catch (error) {
      if (error?.name !== 'AbortError') {
        enqueue('client.network.error', {
          method,
          url:        trimText(url, 600),
          durationMs: Math.round(performance.now() - startedAt),
          error:      serializeError(error),
          groupKey:   fingerprint('client.network.error', error),  // Level 2+
        }, { severity: 'error' });
      }
      throw error;
    }
  };
}

// ─── Level 4: Web Vitals ──────────────────────────────────────────────────────

function tryObserve(type, callback) {
  try {
    const obs = new PerformanceObserver(list => callback(list.getEntries()));
    obs.observe({ type, buffered: true });
  } catch {
    // browser doesn't support this metric — skip silently
  }
}

function installWebVitals() {
  if (typeof PerformanceObserver === 'undefined') return;

  // LCP — Largest Contentful Paint (هدف: < 2500ms جيد، > 4000ms سيء)
  tryObserve('largest-contentful-paint', entries => {
    const last = entries.at(-1);
    if (!last) return;
    enqueue('client.perf.lcp', {
      value:   Math.round(last.startTime),
      element: last.element ? getElementSelector(last.element) : null,
    }, { severity: last.startTime > 4000 ? 'warning' : 'info' });
  });

  // FCP — First Contentful Paint (هدف: < 1800ms)
  tryObserve('paint', entries => {
    const fcp = entries.find(e => e.name === 'first-contentful-paint');
    if (!fcp) return;
    enqueue('client.perf.fcp', {
      value: Math.round(fcp.startTime),
    }, { severity: fcp.startTime > 3000 ? 'warning' : 'info' });
  });

  // FID — First Input Delay (هدف: < 100ms)
  tryObserve('first-input', entries => {
    const fid = entries[0];
    if (!fid) return;
    const delay = fid.processingStart - fid.startTime;
    enqueue('client.perf.fid', {
      value:      Math.round(delay),
      eventType:  fid.name,
    }, { severity: delay > 300 ? 'warning' : 'info' });
  });

  // CLS — Cumulative Layout Shift (هدف: < 0.1، يُرسل عند إغلاق الصفحة)
  let clsValue = 0;
  tryObserve('layout-shift', entries => {
    for (const entry of entries) {
      if (!entry.hadRecentInput) clsValue += entry.value;
    }
  });
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    enqueue('client.perf.cls', {
      value: +clsValue.toFixed(4),
    }, { severity: clsValue > 0.25 ? 'warning' : 'info' });
  }, { once: true });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function notifyReactError(error, errorInfo = {}) {
  enqueue('client.react.error', {
    error:          serializeError(error),
    componentStack: trimText(errorInfo.componentStack || '', 4000),
    groupKey:       fingerprint('client.react.error', error),  // Level 2+
  }, { severity: 'critical' });
}

export function installRuntimeTelemetry(options = {}) {
  if (installed || typeof window === 'undefined') return;
  installed  = true;
  sessionId  = options.sessionId || '';
  traceId    = options.traceId || generateTraceId();  // Level 3
  originalFetch = window.fetch.bind(window);
  ensureLastPatchState('app-runtime');

  patchConsole();
  patchFetch();
  installWebVitals();  // Level 4

  window.addEventListener('click', event => {
    const target = event.target?.closest?.('button,a,input,textarea,select,[role="button"],[data-testid],[data-test]') || event.target;
    const payload = {
      target:  captureElement(target),
      pointer: { x: Math.round(event.clientX || 0), y: Math.round(event.clientY || 0), button: event.button },
    };
    addBreadcrumb('click', payload);
    enqueue('client.ui.click', payload, { severity: 'debug' });
  }, true);

  window.addEventListener('error', event => {
    if (event.target && event.target !== window) {
      const target = captureElement(event.target);
      addBreadcrumb('resource-error', { target });
      enqueue('client.resource.error', { target }, { severity: 'warning' });
      return;
    }
    enqueue('client.error', {
      message:  trimText(event.message || 'Unhandled error', 1000),
      filename: trimText(event.filename || '', 600),
      line:     event.lineno || null,
      column:   event.colno || null,
      error:    serializeError(event.error),
      groupKey: fingerprint('client.error', event.error),  // Level 2+
    }, { severity: 'error' });
  }, true);

  window.addEventListener('unhandledrejection', event => {
    enqueue('client.promise.unhandled', {
      error:    serializeError(event.reason),
      reason:   serializeValue(event.reason),
      groupKey: fingerprint('client.promise.unhandled', event.reason),  // Level 2+
    }, { severity: 'error' });
  });

  window.addEventListener('beforeunload', flush);
}
