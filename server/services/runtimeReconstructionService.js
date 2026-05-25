const RECONSTRUCTION_SCHEMA_VERSION = 1;

function sortEvents(events) {
  return [...events].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
}

function reduceRuntimeState(events = []) {
  const ordered = sortEvents(events);
  const tasks = {};
  const leases = {};
  const queue = [];
  const issues = [];

  for (const event of ordered) {
    if (event.category === 'task' && event.taskId) {
      tasks[event.taskId] = tasks[event.taskId] || {
        taskId: event.taskId,
        transitions: [],
      };
      tasks[event.taskId].type = event.payload?.type || tasks[event.taskId].type;
      tasks[event.taskId].workflowId = event.payload?.workflowId || tasks[event.taskId].workflowId;
      tasks[event.taskId].traceId = event.traceId || tasks[event.taskId].traceId;
      tasks[event.taskId].status = event.payload?.status || tasks[event.taskId].status;
      tasks[event.taskId].lastSequence = event.sequence;
      tasks[event.taskId].transitions.push({
        type: event.type,
        sequence: event.sequence,
        status: event.payload?.status,
        timestamp: event.timestamp,
      });
    }

    if (event.type === 'execution.lease.acquired') {
      leases[event.payload.executionId] = {
        ...event.payload,
        status: 'active',
        acquiredSequence: event.sequence,
      };
    }

    if (event.type === 'execution.lease.released') {
      const lease = leases[event.payload.executionId];
      if (!lease) {
        issues.push({ type: 'orphan_release', executionId: event.payload.executionId, sequence: event.sequence });
      } else {
        lease.status = event.payload.status || 'released';
        lease.releasedSequence = event.sequence;
      }
    }

    if (event.type === 'execution.queued') {
      queue.push({
        taskId: event.payload.taskId,
        workerId: event.payload.workerId,
        position: event.payload.position,
        sequence: event.sequence,
      });
    }
  }

  return {
    schemaVersion: RECONSTRUCTION_SCHEMA_VERSION,
    lastSequence: ordered.at(-1)?.sequence || 0,
    tasks,
    activeLeases: Object.fromEntries(Object.entries(leases).filter(([, lease]) => lease.status === 'active')),
    leases,
    queue,
    issues,
  };
}

function buildDeterministicReplay(events = [], { traceId = '' } = {}) {
  const ordered = sortEvents(events).filter(event => !traceId || event.traceId === traceId);
  return {
    schemaVersion: RECONSTRUCTION_SCHEMA_VERSION,
    mode: 'deterministic_event_replay',
    traceId: traceId || ordered[0]?.traceId || null,
    firstSequence: ordered[0]?.sequence || 0,
    lastSequence: ordered.at(-1)?.sequence || 0,
    steps: ordered.map((event, index) => ({
      step: index + 1,
      sequence: event.sequence,
      type: event.type,
      category: event.category,
      taskId: event.taskId,
      traceId: event.traceId,
      parentSequence: event.parentSequence,
      previousSequence: event.previousSequence,
      timestamp: event.timestamp,
      payload: event.payload,
    })),
  };
}

module.exports = {
  RECONSTRUCTION_SCHEMA_VERSION,
  buildDeterministicReplay,
  reduceRuntimeState,
  sortEvents,
};
