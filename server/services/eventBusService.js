const { EventEmitter } = require('events');
const { appendEventLog, readEventLog } = require('./eventLogService');

const DEFAULT_MAX_EVENTS = 250;
const DEFAULT_EVENT_RESPONSE_LIMIT = 100;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const EVENT_SCHEMA_VERSION = 1;
const EVENT_CATEGORIES = new Set([
  'ai',
  'client',
  'event',
  'execution',
  'file',
  'git',
  'octopus',
  'planner',
  'process',
  'session',
  'system',
  'task',
  'terminal',
  'validation',
  'workflow',
]);
const EVENT_SEVERITIES = new Set(['debug', 'info', 'warning', 'error', 'critical']);

function normalizeType(type) {
  const value = String(type || '').trim();
  if (!value || value.length > 120) {
    throw new Error('event type is required and must be 120 characters or fewer');
  }
  if (!/^[a-zA-Z0-9:._-]+$/.test(value)) {
    throw new Error('event type contains invalid characters');
  }
  return value;
}

function normalizeCategory(category, type) {
  const value = String(category || type.split('.')[0] || 'system').trim().toLowerCase();
  return EVENT_CATEGORIES.has(value) ? value : 'system';
}

function normalizeSeverity(severity) {
  const value = String(severity || 'info').trim().toLowerCase();
  return EVENT_SEVERITIES.has(value) ? value : 'info';
}

function normalizeOptionalId(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function cloneJson(value, fallback) {
  if (value === undefined) return fallback;
  try {
    const json = JSON.stringify(value);
    if (json && Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new Error('event payload is too large');
    }
    return JSON.parse(json);
  } catch (error) {
    if (error.message === 'event payload is too large') throw error;
    return fallback;
  }
}

function matchesFilter(event, filter = {}) {
  if (filter.type && event.type !== filter.type) return false;
  if (filter.category && event.category !== filter.category) return false;
  if (filter.severity && event.severity !== filter.severity) return false;
  if (filter.sessionId && event.sessionId !== filter.sessionId) return false;
  if (filter.taskId && event.taskId !== filter.taskId) return false;
  if (filter.traceId && event.traceId !== filter.traceId) return false;
  if (filter.sinceId && event.id <= Number(filter.sinceId)) return false;
  return true;
}

function createEventBus({
  eventLogPath = '',
  maxEvents = DEFAULT_MAX_EVENTS,
  logger = console,
  now = () => new Date(),
} = {}) {
  const emitter = new EventEmitter();
  const history = [];
  const lastSequenceByCausalKey = new Map();
  let nextId = 1;
  let nextSequence = 1;

  function publish(type, payload = {}, metadata = {}) {
    const normalizedType = normalizeType(type);
    const normalizedMetadata = cloneJson(metadata, {});
    const causalKeys = [
      normalizedMetadata.taskId ? `task:${normalizedMetadata.taskId}` : '',
      normalizedMetadata.traceId ? `trace:${normalizedMetadata.traceId}` : '',
    ].filter(Boolean);
    const previousSequence = Math.max(0, ...causalKeys.map(key => lastSequenceByCausalKey.get(key) || 0));
    const event = {
      schemaVersion: EVENT_SCHEMA_VERSION,
      id: nextId++,
      sequence: nextSequence++,
      type: normalizedType,
      category: normalizeCategory(normalizedMetadata.category, normalizedType),
      source: String(normalizedMetadata.source || normalizedMetadata.service || 'system'),
      severity: normalizeSeverity(normalizedMetadata.severity),
      sessionId: normalizeOptionalId(normalizedMetadata.sessionId),
      taskId: normalizeOptionalId(normalizedMetadata.taskId),
      traceId: normalizeOptionalId(normalizedMetadata.traceId),
      parentId: normalizeOptionalId(normalizedMetadata.parentId),
      parentSequence: Number(normalizedMetadata.parentSequence) || null,
      previousSequence: previousSequence || null,
      payload: cloneJson(payload, {}),
      metadata: normalizedMetadata,
      timestamp: now().toISOString(),
    };

    history.push(event);
    while (history.length > maxEvents) history.shift();
    for (const key of causalKeys) lastSequenceByCausalKey.set(key, event.sequence);
    if (eventLogPath) appendEventLog(eventLogPath, event, logger);

    emitter.emit('event', event);
    emitter.emit(event.type, event);
    return event;
  }

  function getRecent(filter = {}) {
    const limit = Math.max(1, Math.min(Number(filter.limit) || DEFAULT_EVENT_RESPONSE_LIMIT, maxEvents));
    return history
      .filter(event => matchesFilter(event, filter))
      .slice(-limit);
  }

  function getEventLog(filter = {}) {
    const limit = Math.max(1, Math.min(Number(filter.limit) || DEFAULT_EVENT_RESPONSE_LIMIT, maxEvents));
    const source = history.length ? history : (eventLogPath ? readEventLog(eventLogPath, logger) : history);
    return source
      .filter(event => matchesFilter(event, filter))
      .slice(-limit);
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== 'function') {
      throw new Error('event listener must be a function');
    }

    const wrapped = event => {
      if (!matchesFilter(event, options)) return;
      try {
        listener(event);
      } catch (error) {
        logger.error('EventBus listener error:', error);
      }
    };

    emitter.on('event', wrapped);

    if (options.replay) {
      for (const event of getRecent(options)) wrapped(event);
    }

    return () => emitter.off('event', wrapped);
  }

  function on(type, listener) {
    const normalizedType = normalizeType(type);
    emitter.on(normalizedType, listener);
    return () => emitter.off(normalizedType, listener);
  }

  function clear() {
    history.length = 0;
  }

  return {
    clear,
    getRecent,
    getEventLog,
    on,
    publish,
    subscribe,
  };
}

module.exports = {
  EVENT_CATEGORIES,
  DEFAULT_EVENT_RESPONSE_LIMIT,
  EVENT_SCHEMA_VERSION,
  EVENT_SEVERITIES,
  createEventBus,
  matchesFilter,
  normalizeCategory,
  normalizeSeverity,
  normalizeType,
};
