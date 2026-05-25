const {
  ALLOWED_TRANSITIONS,
  RUNTIME_SCHEMA_VERSION,
  TASK_STATES,
  TERMINAL_STATES,
  cloneJson,
  mergePolicy,
  normalizePriority,
  normalizeResourceBudget,
} = require('./taskRuntimeCore');

function assertTransitionAllowed(task, taskId, nextStatus) {
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (TERMINAL_STATES.has(task.status) && task.status !== TASK_STATES.FAILED) {
    throw new Error(`Cannot transition terminal task ${taskId}`);
  }
  if (!ALLOWED_TRANSITIONS[task.status]?.has(nextStatus)) {
    throw new Error(`Invalid task transition ${task.status} -> ${nextStatus}`);
  }
}

function recordTerminalMetrics(task, nextStatus, metrics, recordMetric) {
  task.finishedAt = task.updatedAt;
  if (task.startedAt) {
    task.durationMs = Math.max(0, new Date(task.finishedAt).getTime() - new Date(task.startedAt).getTime());
    metrics.taskDurationMs[task.id] = task.durationMs;
    metrics.taskTypeDurationMs[task.type] = metrics.taskTypeDurationMs[task.type] || [];
    metrics.taskTypeDurationMs[task.type].push(task.durationMs);
  }
  if (nextStatus === TASK_STATES.COMPLETED) metrics.completed += 1;
  if (nextStatus === TASK_STATES.FAILED) metrics.failed += 1;
  if (nextStatus === TASK_STATES.CANCELLED) metrics.cancelled += 1;
  recordMetric('task.duration', task.durationMs || 0, { taskId: task.id, type: task.type, status: nextStatus });
}

function applyTransitionEffects(task, nextStatus, metrics, recordMetric) {
  if (nextStatus === TASK_STATES.RUNNING) {
    task.startedAt = task.startedAt || task.updatedAt;
  }
  if (TERMINAL_STATES.has(nextStatus)) {
    recordTerminalMetrics(task, nextStatus, metrics, recordMetric);
  }
  if (nextStatus === TASK_STATES.RETRYING) {
    metrics.retried += 1;
    metrics.retryCount += 1;
    recordMetric('task.retry', task.attempts, { taskId: task.id, type: task.type });
  }
}

function createScheduledTask(options, context) {
  const {
    defaultMaxRetries,
    makeId,
    timestamp,
    workerRegistry,
  } = context;
  const workflowId = options.workflowId || makeId('workflow');
  const workerDefinition = workerRegistry.resolveWorker({ type: options.type, capabilities: options.capabilities });
  const policies = mergePolicy(workerDefinition?.policies, options.policies);
  const retryPolicy = mergePolicy(policies.retry, options.retry);
  const resourceBudget = normalizeResourceBudget({
    ...workerDefinition?.resourceBudget,
    ...options.resourceBudget,
    timeoutMs: options.timeoutMs || options.timeout || policies.timeout,
    retryBudget: options.retryBudget ?? options.maxRetries ?? (Number.isInteger(retryPolicy?.maxAttempts)
      ? Math.max(0, retryPolicy.maxAttempts - 1)
      : undefined) ?? workerDefinition?.resourceBudget?.retryBudget,
  });

  return {
    id: options.taskId || makeId('task'),
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    type: String(options.type || 'generic'),
    status: TASK_STATES.CREATED,
    priority: normalizePriority(options.priority),
    capabilities: Array.isArray(options.capabilities) ? options.capabilities.filter(Boolean) : workerDefinition?.capabilities || [],
    dependencies: Array.isArray(options.dependencies) ? options.dependencies.filter(Boolean) : [],
    payload: cloneJson(options.payload, {}),
    result: null,
    error: null,
    attempts: 0,
    retryPolicy: cloneJson(retryPolicy, {}),
    maxRetries: Number.isInteger(options.maxRetries)
      ? options.maxRetries
      : Number.isInteger(retryPolicy?.maxAttempts)
        ? Math.max(0, retryPolicy.maxAttempts - 1)
        : defaultMaxRetries,
    resourceBudget,
    timeoutMs: resourceBudget.timeoutMs,
    workerDefinition: cloneJson(workerDefinition, null),
    execution: null,
    sessionId: options.sessionId || null,
    workflowId,
    traceId: options.traceId || `trace_${workflowId}`,
    parentId: options.parentId || null,
    createdAt: timestamp(),
    updatedAt: timestamp(),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    transitions: [],
  };
}

module.exports = {
  applyTransitionEffects,
  assertTransitionAllowed,
  createScheduledTask,
};
