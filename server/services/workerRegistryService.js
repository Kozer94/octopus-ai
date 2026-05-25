const WORKER_REGISTRY_SCHEMA_VERSION = 1;

const DEFAULT_WORKERS = [
  {
    type: 'generic',
    worker: 'generic',
    capabilities: ['generic_execution'],
    concurrency: 4,
    policies: { timeout: 30000, retry: { maxAttempts: 1, strategy: 'none' } },
    resourceBudget: { cpuBudget: 'normal', memoryBudgetMb: 256, tokenBudget: 0, retryBudget: 0 },
  },
  {
    type: 'writer',
    worker: 'writer',
    capabilities: ['code_generation', 'file_write', 'javascript', 'typescript'],
    concurrency: 2,
    policies: { timeout: 30000, retry: { maxAttempts: 2, strategy: 'linear' } },
    resourceBudget: { cpuBudget: 'normal', memoryBudgetMb: 512, tokenBudget: 12000, retryBudget: 1 },
  },
  {
    type: 'review',
    worker: 'review',
    capabilities: ['code_review', 'validation', 'static_analysis'],
    concurrency: 2,
    policies: { timeout: 30000, retry: { maxAttempts: 2, strategy: 'linear' } },
    resourceBudget: { cpuBudget: 'normal', memoryBudgetMb: 384, tokenBudget: 8000, retryBudget: 1 },
  },
  {
    type: 'merge',
    worker: 'merge',
    capabilities: ['result_merge', 'workflow_merge'],
    concurrency: 1,
    policies: { timeout: 30000, retry: { maxAttempts: 1, strategy: 'none' } },
    resourceBudget: { cpuBudget: 'low', memoryBudgetMb: 256, tokenBudget: 4000, retryBudget: 0 },
  },
  {
    type: 'terminal',
    worker: 'terminal',
    capabilities: ['terminal_execution', 'command_dry_run'],
    concurrency: 1,
    policies: { timeout: 15000, retry: { maxAttempts: 1, strategy: 'none' } },
    resourceBudget: { cpuBudget: 'limited', memoryBudgetMb: 256, tokenBudget: 0, retryBudget: 0 },
    sandbox: { env: 'safe', filesystem: 'project', network: 'disabled' },
  },
];

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeWorker(definition) {
  return {
    schemaVersion: WORKER_REGISTRY_SCHEMA_VERSION,
    type: String(definition.type || definition.worker || 'generic'),
    worker: String(definition.worker || definition.type || 'generic'),
    capabilities: Array.isArray(definition.capabilities) ? [...new Set(definition.capabilities)] : [],
    concurrency: Math.max(1, Number(definition.concurrency) || 1),
    policies: cloneJson(definition.policies || {}, {}),
    resourceBudget: cloneJson(definition.resourceBudget || {}, {}),
    sandbox: cloneJson(definition.sandbox || {}, {}),
  };
}

function createWorkerRegistry({ workers = DEFAULT_WORKERS } = {}) {
  const registry = new Map();
  for (const definition of workers) {
    const worker = normalizeWorker(definition);
    registry.set(worker.type, worker);
  }

  function registerWorker(definition) {
    const worker = normalizeWorker(definition);
    registry.set(worker.type, worker);
    return worker;
  }

  function listWorkers() {
    return [...registry.values()].map(worker => cloneJson(worker, worker));
  }

  function getWorker(type) {
    return registry.get(type) || registry.get('generic') || null;
  }

  function findByCapabilities(requiredCapabilities = []) {
    const required = requiredCapabilities.filter(Boolean);
    if (required.length === 0) return getWorker('generic');
    return [...registry.values()].find(worker =>
      required.every(capability => worker.capabilities.includes(capability)),
    ) || getWorker('generic');
  }

  function resolveWorker({ type, capabilities = [] } = {}) {
    if (type && registry.has(type)) return getWorker(type);
    return findByCapabilities(capabilities);
  }

  return {
    findByCapabilities,
    getWorker,
    listWorkers,
    registerWorker,
    resolveWorker,
  };
}

module.exports = {
  DEFAULT_WORKERS,
  WORKER_REGISTRY_SCHEMA_VERSION,
  createWorkerRegistry,
  normalizeWorker,
};
