const RUNTIME_SCHEMA_VERSION = 1;

const TASK_STATES = {
  CREATED: 'CREATED',
  PLANNED: 'PLANNED',
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  WAITING_DEPENDENCY: 'WAITING_DEPENDENCY',
  VALIDATING: 'VALIDATING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  RETRYING: 'RETRYING',
};

const TERMINAL_STATES = new Set([TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.CANCELLED]);
const ALLOWED_TRANSITIONS = {
  [TASK_STATES.CREATED]: new Set([TASK_STATES.PLANNED, TASK_STATES.QUEUED, TASK_STATES.CANCELLED]),
  [TASK_STATES.PLANNED]: new Set([TASK_STATES.QUEUED, TASK_STATES.CANCELLED]),
  [TASK_STATES.QUEUED]: new Set([TASK_STATES.RUNNING, TASK_STATES.WAITING_DEPENDENCY, TASK_STATES.FAILED, TASK_STATES.CANCELLED]),
  [TASK_STATES.WAITING_DEPENDENCY]: new Set([TASK_STATES.QUEUED, TASK_STATES.CANCELLED, TASK_STATES.FAILED]),
  [TASK_STATES.RUNNING]: new Set([TASK_STATES.VALIDATING, TASK_STATES.RETRYING, TASK_STATES.FAILED, TASK_STATES.CANCELLED]),
  [TASK_STATES.VALIDATING]: new Set([TASK_STATES.COMPLETED, TASK_STATES.RETRYING, TASK_STATES.FAILED, TASK_STATES.CANCELLED]),
  [TASK_STATES.RETRYING]: new Set([TASK_STATES.QUEUED, TASK_STATES.FAILED, TASK_STATES.CANCELLED]),
  [TASK_STATES.COMPLETED]: new Set([]),
  [TASK_STATES.FAILED]: new Set([TASK_STATES.RETRYING]),
  [TASK_STATES.CANCELLED]: new Set([]),
};

function createRuntimeId(prefix, value) {
  return `${prefix}_${String(value).padStart(6, '0')}`;
}

function normalizePriority(priority) {
  return ['low', 'normal', 'high', 'critical'].includes(priority) ? priority : 'normal';
}

function cloneJson(value, fallback) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function createEmptyMetrics() {
  return {
    completed: 0,
    failed: 0,
    cancelled: 0,
    retried: 0,
    retryCount: 0,
    taskDurationMs: {},
    taskTypeDurationMs: {},
    timeSeries: [],
    validationFailures: 0,
    workerLatencyMs: {},
  };
}

function mergePolicy(...policies) {
  return Object.assign({}, ...policies.filter(Boolean));
}

function normalizeResourceBudget(budget = {}) {
  return {
    cpuBudget: budget.cpuBudget || 'normal',
    memoryBudgetMb: Math.max(64, Number(budget.memoryBudgetMb) || 256),
    tokenBudget: Math.max(0, Number(budget.tokenBudget) || 0),
    timeoutMs: Math.max(1000, Number(budget.timeoutMs || budget.timeout) || 30000),
    retryBudget: Math.max(0, Number(budget.retryBudget) || 0),
  };
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

module.exports = {
  ALLOWED_TRANSITIONS,
  RUNTIME_SCHEMA_VERSION,
  TASK_STATES,
  TERMINAL_STATES,
  average,
  cloneJson,
  createEmptyMetrics,
  createRuntimeId,
  mergePolicy,
  normalizePriority,
  normalizeResourceBudget,
};
