const assert = require('node:assert/strict');
const test = require('node:test');

const { createEventBus } = require('./eventBusService');
const { createExecutionControlPlane, normalizeBudget } = require('./executionControlService');
const { createWorkerRegistry } = require('./workerRegistryService');

function createTask(overrides = {}) {
  return {
    id: 'task_1',
    type: 'writer',
    priority: 'high',
    attempts: 0,
    maxRetries: 1,
    capabilities: ['code_generation'],
    resourceBudget: { memoryBudgetMb: 256, retryBudget: 1, timeoutMs: 2000 },
    traceId: 'trace_1',
    ...overrides,
  };
}

test('execution control plane issues leases with allocated budgets', () => {
  const events = [];
  const eventBus = createEventBus();
  eventBus.subscribe(event => events.push(event));
  const workerRegistry = createWorkerRegistry();
  const controlPlane = createExecutionControlPlane({ eventBus, workerRegistry });

  const lease = controlPlane.acquire(createTask());

  assert.equal(lease.leased, true);
  assert.equal(lease.contract.taskId, 'task_1');
  assert.equal(lease.contract.workerId, 'writer');
  assert.equal(lease.contract.allocatedBudget.timeoutMs, 2000);
  assert.equal(events.some(event => event.type === 'execution.lease.acquired'), true);

  controlPlane.release(lease.contract, 'completed');
  assert.equal(controlPlane.getState().leases.length, 0);
});

test('execution control plane enforces concurrency by queueing', () => {
  const workerRegistry = createWorkerRegistry({
    workers: [
      { type: 'generic', worker: 'generic', capabilities: ['generic_execution'], concurrency: 1 },
      { type: 'writer', worker: 'writer', capabilities: ['code_generation'], concurrency: 1, resourceBudget: { retryBudget: 1 } },
    ],
  });
  const controlPlane = createExecutionControlPlane({ workerRegistry });

  const first = controlPlane.acquire(createTask({ id: 'task_1' }));
  const second = controlPlane.acquire(createTask({ id: 'task_2' }));

  assert.equal(first.leased, true);
  assert.equal(second.leased, false);
  assert.equal(second.reason, 'concurrency_limit');
  assert.equal(controlPlane.getState().queue.length, 1);
});

test('execution control plane rejects budget violations', () => {
  const controlPlane = createExecutionControlPlane({ workerRegistry: createWorkerRegistry() });

  assert.throws(() => controlPlane.acquire(createTask({
    maxRetries: 3,
    resourceBudget: { retryBudget: 1, memoryBudgetMb: 256, timeoutMs: 1000 },
  })), /Retry budget exceeded/);
});

test('normalizeBudget applies safe defaults', () => {
  const budget = normalizeBudget({}, { resourceBudget: { memoryBudgetMb: 512 }, policies: { timeout: 9000 } });

  assert.equal(budget.memoryBudgetMb, 512);
  assert.equal(budget.timeoutMs, 9000);
});
