const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { createEventBus } = require('./eventBusService');
const { RUNTIME_SCHEMA_VERSION, TASK_STATES, createTaskRuntime } = require('./taskRuntimeService');

function createRuntime(options = {}) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-runtime-'));
  const eventBus = createEventBus();
  const events = [];
  eventBus.subscribe(event => events.push(event));
  let id = 1;
  const runtime = createTaskRuntime({
    eventBus,
    stateDir,
    idFactory: prefix => `${prefix}_${id++}`,
    now: () => new Date(Date.now()),
    ...options,
  });
  return { events, runtime, stateDir };
}

test('schedule creates queued task snapshots and emits taxonomy events', () => {
  const { events, runtime, stateDir } = createRuntime();

  const task = runtime.schedule({
    type: 'writer',
    priority: 'high',
    sessionId: 'sess_1',
    payload: { filePath: 'src/App.jsx' },
  });

  assert.equal(task.status, TASK_STATES.QUEUED);
  assert.equal(task.schemaVersion, RUNTIME_SCHEMA_VERSION);
  assert.equal(task.priority, 'high');
  assert.equal(task.workerDefinition.type, 'writer');
  assert.equal(task.resourceBudget.retryBudget, 1);
  assert.equal(events[0].type, 'task.created');
  assert.equal(events[0].category, 'task');
  assert.equal(events[0].sessionId, 'sess_1');
  assert.equal(fs.existsSync(path.join(stateDir, 'tasks', `${task.id}.json`)), true);
  assert.equal(fs.existsSync(path.join(stateDir, 'workflows', `${task.workflowId}.json`)), true);
  const snapshot = JSON.parse(fs.readFileSync(path.join(stateDir, 'tasks', `${task.id}.json`), 'utf8'));
  assert.equal(snapshot.schemaVersion, RUNTIME_SCHEMA_VERSION);
});

test('dependencies wait until parent completes, then run through the graph', async () => {
  const { runtime } = createRuntime({
    workers: {
      writer: async task => ({ ok: true, wrote: task.payload.filePath }),
      validator: async task => ({ ok: true, checked: task.dependencies[0] }),
    },
  });

  const parent = runtime.schedule({ type: 'writer', workflowId: 'workflow_demo', payload: { filePath: 'a.js' } });
  const child = runtime.schedule({ type: 'validator', workflowId: parent.workflowId, dependencies: [parent.id] });

  assert.equal(child.status, TASK_STATES.WAITING_DEPENDENCY);

  await runtime.run(parent.id);

  assert.equal(runtime.getTask(parent.id).status, TASK_STATES.COMPLETED);
  assert.equal(runtime.getTask(child.id).status, TASK_STATES.COMPLETED);
  assert.deepEqual(runtime.getDependencyGraph(parent.workflowId).edges, [{ from: parent.id, to: child.id }]);
});

test('runtime retries failed tasks and records metrics', async () => {
  let attempts = 0;
  const { events, runtime } = createRuntime({
    workers: {
      flaky: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary failure');
        return { ok: true };
      },
    },
  });

  const task = runtime.schedule({ type: 'flaky', maxRetries: 1 });
  await runtime.run(task.id);
  await runtime.run(task.id);

  assert.equal(runtime.getTask(task.id).status, TASK_STATES.COMPLETED);
  assert.equal(runtime.getMetrics().retryCount, 1);
  assert.equal(runtime.getMetrics().timeSeries.some(point => point.name === 'task.retry'), true);
  assert.equal(events.some(event => event.type === 'task.retrying'), true);
});

test('cancel transitions queued task to cancelled', () => {
  const { runtime } = createRuntime();
  const task = runtime.schedule({ type: 'writer' });

  runtime.cancel(task.id, 'user request');

  assert.equal(runtime.getTask(task.id).status, TASK_STATES.CANCELLED);
  assert.equal(runtime.getMetrics().cancelled, 1);
});

test('runtime exposes execution tree, trace, and worker registry facts', async () => {
  const { runtime } = createRuntime({
    workers: {
      writer: async () => ({ ok: true }),
      review: async () => ({ ok: true }),
    },
  });

  const parent = runtime.schedule({ type: 'writer', workflowId: 'workflow_tree' });
  const child = runtime.schedule({ type: 'review', workflowId: parent.workflowId, parentId: parent.id, dependencies: [parent.id] });
  await runtime.run(parent.id);

  const tree = runtime.getExecutionTree(parent.workflowId);
  assert.equal(tree.roots[0].id, parent.id);
  assert.equal(tree.roots[0].children[0].id, child.id);
  assert.equal(runtime.getTrace(parent.traceId).events.length > 0, true);
  assert.equal(runtime.getReplayArtifact(parent.traceId).mode, 'simulation');
  assert.equal(runtime.listWorkers().some(worker => worker.type === 'writer'), true);
});
