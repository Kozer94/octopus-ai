const { buildDeterministicReplay } = require('../services/runtimeReconstructionService');

function serializeTask(task) {
  return task ? { ...task } : null;
}

function readLimit(value, fallback = 250, max = 1000) {
  return Math.min(Math.max(Number(value) || fallback, 1), max);
}

function registerRuntimeRoutes(app, { eventBus, taskRuntime }) {
  app.get('/api/runtime/tasks', (req, res) => {
    try {
      const { workflowId = '', status = '', type = '', limit = '250' } = req.query;
      const safeLimit = readLimit(limit);
      const tasks = taskRuntime.listTasks({
        workflowId: workflowId || undefined,
        status: status || undefined,
        type: type || undefined,
        limit: safeLimit,
      }).map(serializeTask);
      res.json({
        success: true,
        tasks,
        meta: { count: tasks.length, limit: safeLimit, truncated: tasks.length === safeLimit },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/runtime/tasks', (req, res) => {
    try {
      const task = taskRuntime.schedule(req.body || {});
      res.json({ success: true, task: serializeTask(task), graph: taskRuntime.getDependencyGraph(task.workflowId, { limit: 250 }) });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/runtime/tasks/:taskId', (req, res) => {
    const task = taskRuntime.getTask(req.params.taskId);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    return res.json({ success: true, task: serializeTask(task) });
  });

  app.post('/api/runtime/tasks/:taskId/run', async (req, res) => {
    try {
      const task = await taskRuntime.run(req.params.taskId);
      res.json({ success: true, task: serializeTask(task), graph: taskRuntime.getDependencyGraph(task.workflowId, { limit: 250 }) });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/runtime/tasks/:taskId/cancel', (req, res) => {
    try {
      const task = taskRuntime.cancel(req.params.taskId, req.body?.reason);
      res.json({ success: true, task: serializeTask(task) });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/runtime/tasks/:taskId/retry', async (req, res) => {
    try {
      const task = await taskRuntime.retry(req.params.taskId);
      res.json({ success: true, task: serializeTask(task), graph: taskRuntime.getDependencyGraph(task.workflowId, { limit: 250 }) });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/runtime/graph/:workflowId', (req, res) => {
    try {
      res.json({ success: true, graph: taskRuntime.getDependencyGraph(req.params.workflowId, { limit: readLimit(req.query.limit) }) });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/runtime/tree/:workflowId', (req, res) => {
    try {
      res.json({ success: true, tree: taskRuntime.getExecutionTree(req.params.workflowId, { limit: readLimit(req.query.limit) }) });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/runtime/traces/:traceId', (req, res) => {
    try {
      const limit = readLimit(req.query.limit);
      const trace = taskRuntime.getTrace(req.params.traceId);
      const events = Array.isArray(trace.events) ? trace.events.slice(-limit) : [];
      res.json({
        success: true,
        trace: { ...trace, events },
        meta: { count: events.length, limit, truncated: Array.isArray(trace.events) && trace.events.length > events.length },
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/runtime/workers', (_req, res) => {
    res.json({ success: true, workers: taskRuntime.listWorkers() });
  });

  app.get('/api/runtime/control-plane', (_req, res) => {
    res.json({ success: true, controlPlane: taskRuntime.getControlPlaneState() });
  });

  app.get('/api/runtime/replay/:traceId', (req, res) => {
    try {
      res.json({ success: true, replay: taskRuntime.getReplayArtifact(req.params.traceId) });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/runtime/replay-v2/:traceId', (req, res) => {
    try {
      const limit = readLimit(req.query.limit);
      res.json({
        success: true,
        replay: buildDeterministicReplay(eventBus.getEventLog({ traceId: req.params.traceId, limit }), {
          traceId: req.params.traceId,
        }),
        meta: { limit },
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/runtime/metrics', (_req, res) => {
    res.json({ success: true, metrics: taskRuntime.getMetrics() });
  });
}

module.exports = { registerRuntimeRoutes };
