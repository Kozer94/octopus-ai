const { RUNTIME_SCHEMA_VERSION, average } = require('./taskRuntimeCore');

function clampLimit(value, fallback = 250, max = 1000) {
  return Math.min(Math.max(Number(value) || fallback, 1), max);
}

function buildDependencyGraph(tasks, workflowId, options = {}) {
  const limit = clampLimit(options.limit);
  const workflowTasks = [...tasks.values()]
    .filter(task => task.workflowId === workflowId)
    .slice(-limit);
  const included = new Set(workflowTasks.map(task => task.id));
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    workflowId,
    meta: {
      count: workflowTasks.length,
      limit,
      truncated: [...tasks.values()].filter(task => task.workflowId === workflowId).length > workflowTasks.length,
    },
    nodes: workflowTasks.map(task => ({
      id: task.id,
      type: task.type,
      status: task.status,
      priority: task.priority,
      parentId: task.parentId,
      durationMs: task.durationMs,
    })),
    edges: workflowTasks.flatMap(task => task.dependencies
      .filter(dep => included.has(dep))
      .map(dep => ({ from: dep, to: task.id }))),
    statusMap: Object.fromEntries(workflowTasks.map(task => [task.id, task.status])),
  };
}

function buildExecutionTree(tasks, workflowId, options = {}) {
  const limit = clampLimit(options.limit);
  const workflowTasks = [...tasks.values()]
    .filter(task => task.workflowId === workflowId)
    .slice(-limit);
  const childrenByParent = new Map();
  for (const task of workflowTasks) {
    const parent = task.parentId || 'root';
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(task);
  }

  function toNode(task) {
    return {
      id: task.id,
      type: task.type,
      status: task.status,
      durationMs: task.durationMs,
      attempts: task.attempts,
      children: (childrenByParent.get(task.id) || []).map(toNode),
    };
  }

  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    workflowId,
    meta: {
      count: workflowTasks.length,
      limit,
      truncated: [...tasks.values()].filter(task => task.workflowId === workflowId).length > workflowTasks.length,
    },
    roots: (childrenByParent.get('root') || []).map(toNode),
  };
}

function buildRuntimeMetrics(metrics) {
  const byType = Object.fromEntries(
    Object.entries(metrics.taskTypeDurationMs).map(([type, values]) => [type, {
      averageDurationMs: average(values),
      completed: values.length,
    }]),
  );

  return {
    completed: metrics.completed,
    failed: metrics.failed,
    cancelled: metrics.cancelled,
    retried: metrics.retried,
    retryCount: metrics.retryCount,
    validationFailures: metrics.validationFailures,
    averageTaskDurationMs: average(Object.values(metrics.taskDurationMs)),
    averageWorkerLatencyMs: average(Object.values(metrics.workerLatencyMs)),
    byType,
    timeSeries: metrics.timeSeries.slice(-250),
  };
}

module.exports = {
  buildDependencyGraph,
  buildExecutionTree,
  buildRuntimeMetrics,
  clampLimit,
};
