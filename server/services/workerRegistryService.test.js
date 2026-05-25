const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createWorkerRegistry,
  normalizeWorker,
} = require('./workerRegistryService');

test('worker registry resolves workers by type and capabilities', () => {
  const registry = createWorkerRegistry({
    workers: [
      { type: 'generic', worker: 'generic', capabilities: ['generic_execution'] },
      { type: 'writer', worker: 'writer', capabilities: ['code_generation', 'typescript'], concurrency: 2 },
    ],
  });

  assert.equal(registry.resolveWorker({ type: 'writer' }).worker, 'writer');
  assert.equal(registry.resolveWorker({ capabilities: ['code_generation'] }).type, 'writer');
  assert.equal(registry.resolveWorker({ capabilities: ['missing'] }).type, 'generic');
});

test('normalizeWorker preserves declarative policies and budgets', () => {
  const worker = normalizeWorker({
    type: 'terminal',
    capabilities: ['terminal_execution'],
    policies: { timeout: 1000, retry: { maxAttempts: 1 } },
    resourceBudget: { memoryBudgetMb: 128 },
  });

  assert.equal(worker.schemaVersion, 1);
  assert.equal(worker.concurrency, 1);
  assert.deepEqual(worker.capabilities, ['terminal_execution']);
  assert.equal(worker.policies.timeout, 1000);
  assert.equal(worker.resourceBudget.memoryBudgetMb, 128);
});
