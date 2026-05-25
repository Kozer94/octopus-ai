const path = require('path');
const { loadJsonFile, saveJsonFile } = require('./jsonStoreService');
const { RUNTIME_SCHEMA_VERSION } = require('./taskRuntimeCore');

function createTaskRuntimePersistence({
  stateDir,
  logger,
  tasks,
  workflows,
  getWorkflow,
  getDependencyGraph,
  getMetrics,
  timestamp,
}) {
  function snapshotPaths(task) {
    return {
      checkpoint: path.join(stateDir, 'checkpoints', `${task.workflowId}.json`),
      task: path.join(stateDir, 'tasks', `${task.id}.json`),
      trace: path.join(stateDir, 'traces', `${task.traceId}.json`),
      workflow: path.join(stateDir, 'workflows', `${task.workflowId}.json`),
    };
  }

  function indexPath(name) {
    return path.join(stateDir, 'indexes', `${name}.json`);
  }

  function persistTask(task) {
    const paths = snapshotPaths(task);
    const workflow = getWorkflow(task.workflowId);
    workflow.updatedAt = timestamp();
    workflow.tasks = [...new Set([...workflow.tasks, task.id])];
    workflow.graph = getDependencyGraph(task.workflowId);

    saveJsonFile(paths.task, task, logger);
    saveJsonFile(paths.workflow, workflow, logger);
    saveJsonFile(paths.checkpoint, {
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      workflowId: task.workflowId,
      updatedAt: timestamp(),
      graph: workflow.graph,
      metrics: getMetrics(),
    }, logger);

    saveJsonFile(indexPath('tasks'), {
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      updatedAt: timestamp(),
      tasks: [...tasks.values()].map(item => ({
        id: item.id,
        workflowId: item.workflowId,
        traceId: item.traceId,
        type: item.type,
        status: item.status,
        updatedAt: item.updatedAt,
      })),
    }, logger);
    saveJsonFile(indexPath('workflows'), {
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      updatedAt: timestamp(),
      workflows: [...workflows.values()].map(item => ({
        id: item.id,
        tasks: item.tasks,
        updatedAt: item.updatedAt,
      })),
    }, logger);
    saveJsonFile(indexPath('traces'), {
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      updatedAt: timestamp(),
      traces: [...new Set([...tasks.values()].map(item => item.traceId))].map(traceId => ({
        traceId,
        taskIds: [...tasks.values()].filter(item => item.traceId === traceId).map(item => item.id),
      })),
    }, logger);

    const trace = loadJsonFile(paths.trace, { schemaVersion: RUNTIME_SCHEMA_VERSION, traceId: task.traceId, events: [] }, logger);
    trace.schemaVersion = trace.schemaVersion || RUNTIME_SCHEMA_VERSION;
    trace.events.push({
      taskId: task.id,
      status: task.status,
      at: task.updatedAt,
      attempts: task.attempts,
    });
    saveJsonFile(paths.trace, trace, logger);
  }

  function getTrace(traceId) {
    const tracePath = path.join(stateDir, 'traces', `${traceId}.json`);
    return loadJsonFile(tracePath, { schemaVersion: RUNTIME_SCHEMA_VERSION, traceId, events: [] }, logger);
  }

  return {
    getTrace,
    persistTask,
  };
}

module.exports = {
  createTaskRuntimePersistence,
};
