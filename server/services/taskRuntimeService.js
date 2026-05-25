const path = require('path');
const { createExecutionControlPlane } = require('./executionControlService');
const { createWorkerAdapter } = require('./workerAdapterService');
const { createWorkerRegistry } = require('./workerRegistryService');
const { createTaskRuntimePersistence } = require('./taskRuntimePersistence');
const { buildDependencyGraph, buildExecutionTree, buildRuntimeMetrics } = require('./taskRuntimeViews');
const {
  RUNTIME_SCHEMA_VERSION,
  TASK_STATES,
  cloneJson,
  createEmptyMetrics,
  createRuntimeId,
} = require('./taskRuntimeCore');
const {
  applyTransitionEffects,
  assertTransitionAllowed,
  createScheduledTask,
} = require('./taskRuntimeLifecycle');

function createTaskRuntime({
  eventBus,
  stateDir = path.join(__dirname, '..', 'state', 'runtime'),
  workers = {},
  workerAdapter,
  workerRegistry = createWorkerRegistry(),
  executionControl,
  logger = console,
  now = () => new Date(),
  idFactory,
  defaultMaxRetries = 0,
} = {}) {
  const tasks = new Map();
  const workflows = new Map();
  const metrics = createEmptyMetrics();
  let nextTaskId = 1;
  let nextWorkflowId = 1;
  const adapter = workerAdapter || createWorkerAdapter({ workers, workerRegistry });
  const controlPlane = executionControl || createExecutionControlPlane({ eventBus, workerRegistry, now });

  function makeId(prefix) {
    return idFactory ? idFactory(prefix) : createRuntimeId(prefix, prefix === 'task' ? nextTaskId++ : nextWorkflowId++);
  }

  function timestamp() {
    return now().toISOString();
  }

  function getWorkflow(workflowId) {
    if (!workflows.has(workflowId)) {
      workflows.set(workflowId, {
        schemaVersion: RUNTIME_SCHEMA_VERSION,
        id: workflowId,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        tasks: [],
      });
    }
    return workflows.get(workflowId);
  }

  function getDependencyGraph(workflowId, options = {}) {
    return buildDependencyGraph(tasks, workflowId, options);
  }

  function getExecutionTree(workflowId, options = {}) {
    return buildExecutionTree(tasks, workflowId, options);
  }

  const { getTrace, persistTask } = createTaskRuntimePersistence({
    getDependencyGraph,
    getMetrics,
    getWorkflow,
    logger,
    stateDir,
    tasks,
    timestamp,
    workflows,
  });

  function publishTaskEvent(task, action, payload = {}, severity = 'info') {
    eventBus?.publish(`task.${action}`, {
      taskId: task.id,
      workflowId: task.workflowId,
      type: task.type,
      status: task.status,
      ...payload,
    }, {
      category: 'task',
      severity,
      source: 'taskRuntimeService',
      sessionId: task.sessionId,
      taskId: task.id,
      traceId: task.traceId,
      parentId: task.parentId,
    });
  }

  function recordMetric(name, value, tags = {}) {
    metrics.timeSeries.push({
      at: timestamp(),
      name,
      value,
      tags: cloneJson(tags, {}),
    });
    if (metrics.timeSeries.length > 1000) metrics.timeSeries.shift();
  }

  function transition(taskId, nextStatus, details = {}) {
    const task = tasks.get(taskId);
    assertTransitionAllowed(task, taskId, nextStatus);

    const previousStatus = task.status;
    task.status = nextStatus;
    task.updatedAt = timestamp();
    task.transitions.push({ from: previousStatus, to: nextStatus, at: task.updatedAt, details: cloneJson(details, {}) });
    applyTransitionEffects(task, nextStatus, metrics, recordMetric);

    persistTask(task);
    publishTaskEvent(task, nextStatus.toLowerCase(), { previousStatus, details });
    return task;
  }

  function schedule(options = {}) {
    const task = createScheduledTask(options, {
      defaultMaxRetries,
      makeId,
      timestamp,
      workerRegistry,
    });

    tasks.set(task.id, task);
    getWorkflow(task.workflowId).tasks.push(task.id);
    persistTask(task);
    publishTaskEvent(task, 'created');
    transition(task.id, TASK_STATES.QUEUED);
    if (!dependenciesSatisfied(task)) {
      transition(task.id, TASK_STATES.WAITING_DEPENDENCY, { dependencies: task.dependencies });
    }
    return task;
  }

  function validateGovernance(task) {
    if (task.attempts > task.maxRetries + 1) {
      throw new Error(`Retry budget exhausted for ${task.id}`);
    }
    if (task.maxRetries > task.resourceBudget.retryBudget && task.resourceBudget.retryBudget >= 0) {
      throw new Error(`Task ${task.id} exceeds retry budget`);
    }
    if (task.resourceBudget.memoryBudgetMb > 4096) {
      throw new Error(`Task ${task.id} exceeds memory budget`);
    }
  }

  function dependenciesSatisfied(task) {
    return task.dependencies.every(depId => tasks.get(depId)?.status === TASK_STATES.COMPLETED);
  }

  async function run(taskId) {
    const task = tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status === TASK_STATES.WAITING_DEPENDENCY && dependenciesSatisfied(task)) {
      transition(task.id, TASK_STATES.QUEUED, { dependenciesReady: true });
    }
    if (!dependenciesSatisfied(task)) {
      if (task.status === TASK_STATES.QUEUED) transition(task.id, TASK_STATES.WAITING_DEPENDENCY, { dependencies: task.dependencies });
      return task;
    }
    if (task.status !== TASK_STATES.QUEUED) {
      throw new Error(`Task ${task.id} is not queued`);
    }

    try {
      validateGovernance(task);
      const lease = controlPlane.acquire(task);
      if (!lease.leased) {
        persistTask(task);
        publishTaskEvent(task, 'deferred', { reason: lease.reason, position: lease.position }, 'warning');
        return task;
      }

      task.execution = lease.contract;
      transition(task.id, TASK_STATES.RUNNING);
      task.attempts += 1;
      persistTask(task);

      const workerStarted = Date.now();
      const execution = await adapter.execute(task, {
        executionContract: lease.contract,
        runtime: api,
        eventBus,
      });
      const workerLatency = Date.now() - workerStarted;
      metrics.workerLatencyMs[task.id] = workerLatency;
      recordMetric('worker.latency', workerLatency, { taskId: task.id, type: task.type, backend: execution.backend || adapter.mode });
      const result = execution.result;
      task.worker = {
        backend: execution.backend || adapter.mode,
        executionId: lease.contract.executionId,
        latencyMs: workerLatency,
        definition: execution.worker || task.workerDefinition,
        workerPath: execution.workerPath || null,
      };
      transition(task.id, TASK_STATES.VALIDATING, { resultType: typeof result });

      if (result?.validation === false) {
        metrics.validationFailures += 1;
        throw new Error(result.error || 'Task validation failed');
      }

      task.result = cloneJson(result, { ok: true });
      transition(task.id, TASK_STATES.COMPLETED);
      controlPlane.release(lease.contract, 'completed');
      await runReady(task.workflowId);
      return task;
    } catch (error) {
      task.error = error.message;
      if (task.execution) controlPlane.release(task.execution, error.message.includes('lease expired') ? 'timeout' : 'failed');
      if (task.status === TASK_STATES.QUEUED) {
        transition(task.id, TASK_STATES.FAILED, { error: error.message });
      } else if (task.attempts <= task.maxRetries) {
        transition(task.id, TASK_STATES.RETRYING, { error: error.message, attempt: task.attempts });
        transition(task.id, TASK_STATES.QUEUED, { retry: true });
      } else {
        transition(task.id, TASK_STATES.FAILED, { error: error.message },);
      }
      return task;
    }
  }

  async function runReady(workflowId) {
    const ready = [...tasks.values()]
      .filter(task => task.workflowId === workflowId)
      .filter(task => task.status === TASK_STATES.WAITING_DEPENDENCY && dependenciesSatisfied(task));

    for (const task of ready) {
      transition(task.id, TASK_STATES.QUEUED, { dependenciesReady: true });
      await run(task.id);
    }
  }

  function cancel(taskId, reason = 'cancelled') {
    const task = tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    transition(task.id, TASK_STATES.CANCELLED, { reason });
    return task;
  }

  async function retry(taskId) {
    const task = tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== TASK_STATES.FAILED) throw new Error(`Task ${task.id} is not failed`);
    transition(task.id, TASK_STATES.RETRYING, { manual: true });
    transition(task.id, TASK_STATES.QUEUED, { manualRetry: true });
    return run(task.id);
  }

  function getTask(taskId) {
    return tasks.get(taskId) || null;
  }

  function listTasks(filter = {}) {
    const limit = Math.min(Math.max(Number(filter.limit) || 250, 1), 1000);
    return [...tasks.values()].filter(task => {
      if (filter.workflowId && task.workflowId !== filter.workflowId) return false;
      if (filter.status && task.status !== filter.status) return false;
      if (filter.type && task.type !== filter.type) return false;
      return true;
    }).slice(-limit);
  }

  function getMetrics() {
    return buildRuntimeMetrics(metrics);
  }

  function listWorkers() {
    return workerRegistry.listWorkers();
  }

  function getControlPlaneState() {
    return controlPlane.getState();
  }

  function getReplayArtifact(traceId) {
    const trace = getTrace(traceId);
    return controlPlane.buildReplayArtifact({ trace, tasks: listTasks() });
  }

  const api = {
    cancel,
    getDependencyGraph,
    getExecutionTree,
    getMetrics,
    getTask,
    getTrace,
    getControlPlaneState,
    getReplayArtifact,
    listTasks,
    listWorkers,
    retry,
    run,
    runReady,
    schedule,
    transition,
  };

  return api;
}

module.exports = {
  RUNTIME_SCHEMA_VERSION,
  TASK_STATES,
  createTaskRuntime,
};
