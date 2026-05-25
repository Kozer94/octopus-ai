const CONTROL_PLANE_SCHEMA_VERSION = 1;
const PRIORITY_WEIGHT = { critical: 4, high: 3, normal: 2, low: 1 };

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function createExecutionId(value) {
  return `exec_${String(value).padStart(8, '0')}`;
}

function normalizeBudget(task, worker) {
  const budget = task.resourceBudget || {};
  return {
    cpuBudget: budget.cpuBudget || 'normal',
    memoryBudgetMb: Math.max(64, Number(budget.memoryBudgetMb) || worker?.resourceBudget?.memoryBudgetMb || 256),
    tokenBudget: Math.max(0, Number(budget.tokenBudget) || worker?.resourceBudget?.tokenBudget || 0),
    timeoutMs: Math.max(1000, Number(task.timeoutMs || budget.timeoutMs || worker?.policies?.timeout) || 30000),
    retryBudget: Math.max(0, Number(budget.retryBudget) || 0),
  };
}

function createExecutionControlPlane({
  eventBus,
  workerRegistry,
  now = () => new Date(),
} = {}) {
  const activeByWorker = new Map();
  const leases = new Map();
  const queue = [];
  let nextExecutionId = 1;

  function timestamp() {
    return now().toISOString();
  }

  function publish(type, payload, metadata = {}) {
    eventBus?.publish(type, payload, {
      category: 'execution',
      source: 'executionControlService',
      ...metadata,
    });
  }

  function getActiveCount(workerId) {
    return activeByWorker.get(workerId) || 0;
  }

  function enforceGovernance(task, worker, budget) {
    if (task.attempts > task.maxRetries) {
      throw new Error(`Retry limit exceeded for ${task.id}`);
    }
    if (task.maxRetries > budget.retryBudget) {
      throw new Error(`Retry budget exceeded for ${task.id}`);
    }
    if (budget.memoryBudgetMb > 4096) {
      throw new Error(`Memory budget exceeded for ${task.id}`);
    }
    if (!worker) {
      throw new Error(`No worker available for ${task.type}`);
    }
  }

  function queuePosition(task, worker, budget) {
    const entry = {
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
      taskId: task.id,
      workerId: worker.type,
      priority: task.priority,
      priorityWeight: PRIORITY_WEIGHT[task.priority] || PRIORITY_WEIGHT.normal,
      queuedAt: timestamp(),
      allocatedBudget: budget,
    };
    queue.push(entry);
    queue.sort((a, b) => b.priorityWeight - a.priorityWeight || a.queuedAt.localeCompare(b.queuedAt));
    return queue.findIndex(item => item.taskId === task.id) + 1;
  }

  function acquire(task) {
    const worker = workerRegistry.resolveWorker({ type: task.type, capabilities: task.capabilities });
    const budget = normalizeBudget(task, worker);
    enforceGovernance(task, worker, budget);

    const activeCount = getActiveCount(worker.type);
    if (activeCount >= worker.concurrency) {
      const position = queuePosition(task, worker, budget);
      publish('execution.queued', { taskId: task.id, workerId: worker.type, position }, {
        taskId: task.id,
        traceId: task.traceId,
        severity: 'warning',
      });
      return { leased: false, reason: 'concurrency_limit', position };
    }

    const executionId = createExecutionId(nextExecutionId++);
    const leaseTimeout = budget.timeoutMs;
    const acquiredAt = timestamp();
    const expiresAt = new Date(new Date(acquiredAt).getTime() + leaseTimeout).toISOString();
    const contract = {
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
      executionId,
      taskId: task.id,
      workerId: worker.type,
      capabilities: worker.capabilities,
      allocatedBudget: budget,
      leaseTimeout,
      acquiredAt,
      expiresAt,
    };

    activeByWorker.set(worker.type, activeCount + 1);
    leases.set(executionId, contract);
    publish('execution.lease.acquired', contract, {
      taskId: task.id,
      traceId: task.traceId,
    });
    return { leased: true, contract, worker };
  }

  function release(contract, status = 'released') {
    if (!contract || !leases.has(contract.executionId)) return;
    leases.delete(contract.executionId);
    activeByWorker.set(contract.workerId, Math.max(0, getActiveCount(contract.workerId) - 1));
    publish('execution.lease.released', { ...contract, status }, {
      taskId: contract.taskId,
      severity: status === 'failed' || status === 'timeout' ? 'error' : 'info',
    });
  }

  function getState() {
    return {
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
      activeByWorker: Object.fromEntries(activeByWorker.entries()),
      leases: [...leases.values()].map(lease => cloneJson(lease, lease)),
      queue: queue.map(entry => cloneJson(entry, entry)),
    };
  }

  function buildReplayArtifact({ trace, tasks = [] }) {
    return {
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
      mode: 'simulation',
      traceId: trace.traceId,
      events: (trace.events || []).map((event, index) => ({
        step: index + 1,
        taskId: event.taskId,
        status: event.status,
        at: event.at,
        attempts: event.attempts,
      })),
      tasks: tasks
        .filter(task => task.traceId === trace.traceId)
        .map(task => ({
          taskId: task.id,
          type: task.type,
          status: task.status,
          transitions: task.transitions,
          worker: task.worker,
        })),
    };
  }

  return {
    acquire,
    buildReplayArtifact,
    getState,
    release,
  };
}

module.exports = {
  CONTROL_PLANE_SCHEMA_VERSION,
  createExecutionControlPlane,
  normalizeBudget,
};
