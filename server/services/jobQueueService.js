const DEFAULT_MAX_PENDING = 100;
const DEFAULT_CONCURRENCY = 2;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function createJobQueue({
  concurrency = DEFAULT_CONCURRENCY,
  eventBus,
  maxPending = DEFAULT_MAX_PENDING,
  now = () => new Date(),
} = {}) {
  const jobs = new Map();
  const pending = [];
  let activeCount = 0;
  let nextJobId = 1;

  function timestamp() {
    return now().toISOString();
  }

  function publish(job, action, payload = {}) {
    eventBus?.publish(`job.${action}`, {
      jobId: job.id,
      type: job.type,
      status: job.status,
      ...payload,
    }, {
      category: 'job',
      severity: action === 'failed' ? 'error' : 'info',
      source: 'jobQueueService',
      taskId: job.id,
      traceId: job.traceId,
    });
  }

  function serialize(job) {
    if (!job) return null;
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      queuedAt: job.queuedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
      error: job.error,
      result: job.result,
      traceId: job.traceId,
    };
  }

  function drain() {
    while (activeCount < concurrency && pending.length > 0) {
      const job = pending.shift();
      if (!job || TERMINAL_STATUSES.has(job.status)) continue;
      activeCount += 1;
      job.status = 'running';
      job.startedAt = timestamp();
      publish(job, 'started');

      Promise.resolve()
        .then(job.handler)
        .then(result => {
          job.status = 'completed';
          job.result = result;
          job.finishedAt = timestamp();
          job.durationMs = Math.max(0, new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime());
          publish(job, 'completed');
        })
        .catch(error => {
          job.status = 'failed';
          job.error = error.message || String(error);
          job.finishedAt = timestamp();
          job.durationMs = job.startedAt
            ? Math.max(0, new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime())
            : null;
          publish(job, 'failed', { error: job.error });
        })
        .finally(() => {
          activeCount -= 1;
          drain();
        });
    }
  }

  function enqueue(type, handler, metadata = {}) {
    const pendingCount = pending.length + activeCount;
    if (pendingCount >= maxPending) {
      const error = new Error('Job queue is full');
      error.statusCode = 429;
      throw error;
    }

    const id = `job_${nextJobId++}`;
    const job = {
      id,
      type: String(type || 'generic'),
      status: 'queued',
      queuedAt: timestamp(),
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      error: null,
      result: null,
      traceId: metadata.traceId || `trace_${id}`,
      handler,
      metadata,
    };
    jobs.set(id, job);
    pending.push(job);
    publish(job, 'queued', { position: pending.length });
    queueMicrotask(drain);
    return serialize(job);
  }

  function get(id) {
    return serialize(jobs.get(id));
  }

  function cancel(id, reason = 'cancelled') {
    const job = jobs.get(id);
    if (!job) return null;
    if (TERMINAL_STATUSES.has(job.status)) return serialize(job);
    job.status = 'cancelled';
    job.error = reason;
    job.finishedAt = timestamp();
    const index = pending.findIndex(item => item.id === id);
    if (index >= 0) pending.splice(index, 1);
    publish(job, 'cancelled', { reason });
    return serialize(job);
  }

  function list({ limit = 100, status = '', type = '' } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    return [...jobs.values()]
      .filter(job => !status || job.status === status)
      .filter(job => !type || job.type === type)
      .slice(-safeLimit)
      .map(serialize);
  }

  function getState() {
    return {
      activeCount,
      concurrency,
      maxPending,
      pendingCount: pending.length,
      totalJobs: jobs.size,
    };
  }

  return {
    cancel,
    enqueue,
    get,
    getState,
    list,
  };
}

module.exports = {
  createJobQueue,
};
