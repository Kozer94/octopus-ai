const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const {
  createEventBus,
  normalizeType,
} = require('./eventBusService');

const silentLogger = {
  error() {},
};

test('publish stores ordered events with immutable payload snapshots', () => {
  const source = { nested: { value: 1 } };
  const bus = createEventBus({
    logger: silentLogger,
    now: () => new Date('2026-05-25T00:00:00.000Z'),
  });

  const event = bus.publish('file.written', source, { source: 'test' });
  source.nested.value = 2;

  assert.equal(event.id, 1);
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.sequence, 1);
  assert.equal(event.type, 'file.written');
  assert.equal(event.category, 'file');
  assert.equal(event.source, 'test');
  assert.equal(event.severity, 'info');
  assert.equal(event.timestamp, '2026-05-25T00:00:00.000Z');
  assert.deepEqual(bus.getRecent()[0].payload, { nested: { value: 1 } });
});

test('publish records causal ordering and append-only event log', () => {
  const eventLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-event-log-')), 'events.ndjson');
  const bus = createEventBus({ eventLogPath, logger: silentLogger });

  const first = bus.publish('task.created', {}, { category: 'task', taskId: 'task_1', traceId: 'trace_1' });
  const second = bus.publish('task.running', {}, { category: 'task', taskId: 'task_1', traceId: 'trace_1' });

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(second.previousSequence, 1);
  assert.equal(bus.getEventLog({ traceId: 'trace_1' }).length, 2);
});

test('history is capped and can be filtered by taxonomy fields and sinceId', () => {
  const bus = createEventBus({ maxEvents: 3, logger: silentLogger });

  bus.publish('a', { value: 1 });
  bus.publish('b', { value: 2 }, { category: 'terminal', severity: 'warning', sessionId: 'sess_1' });
  bus.publish('a', { value: 3 });
  bus.publish('b', { value: 4 }, { category: 'terminal', severity: 'error', sessionId: 'sess_2' });

  assert.deepEqual(bus.getRecent().map(event => event.id), [2, 3, 4]);
  assert.deepEqual(bus.getRecent({ type: 'b' }).map(event => event.payload.value), [2, 4]);
  assert.deepEqual(bus.getRecent({ category: 'terminal' }).map(event => event.id), [2, 4]);
  assert.deepEqual(bus.getRecent({ severity: 'error' }).map(event => event.id), [4]);
  assert.deepEqual(bus.getRecent({ sessionId: 'sess_1' }).map(event => event.id), [2]);
  assert.deepEqual(bus.getRecent({ sinceId: 2 }).map(event => event.id), [3, 4]);
});

test('subscribe receives future events and optional replay', () => {
  const bus = createEventBus({ logger: silentLogger });
  bus.publish('file.written', { path: 'a.js' });

  const received = [];
  const unsubscribe = bus.subscribe(event => received.push(event.type), {
    type: 'file.written',
    replay: true,
  });

  bus.publish('file.deleted', { path: 'a.js' });
  bus.publish('file.written', { path: 'b.js' });
  unsubscribe();
  bus.publish('file.written', { path: 'c.js' });

  assert.deepEqual(received, ['file.written', 'file.written']);
});

test('normalizeType rejects empty or unsafe event names', () => {
  assert.equal(normalizeType('octopus:task.done'), 'octopus:task.done');
  assert.throws(() => normalizeType(''), /event type/);
  assert.throws(() => normalizeType('bad event'), /invalid/);
});
