const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildDeterministicReplay,
  reduceRuntimeState,
} = require('./runtimeReconstructionService');

test('reduceRuntimeState rebuilds tasks and active leases from ordered events', () => {
  const state = reduceRuntimeState([
    {
      sequence: 1,
      type: 'task.created',
      category: 'task',
      taskId: 'task_1',
      traceId: 'trace_1',
      payload: { taskId: 'task_1', workflowId: 'wf_1', type: 'writer', status: 'CREATED' },
      timestamp: '2026-05-25T00:00:00.000Z',
    },
    {
      sequence: 2,
      type: 'execution.lease.acquired',
      category: 'execution',
      payload: { executionId: 'exec_1', taskId: 'task_1', workerId: 'writer' },
    },
  ]);

  assert.equal(state.lastSequence, 2);
  assert.equal(state.tasks.task_1.status, 'CREATED');
  assert.equal(state.activeLeases.exec_1.workerId, 'writer');
});

test('buildDeterministicReplay sorts by sequence and preserves causal fields', () => {
  const replay = buildDeterministicReplay([
    { sequence: 2, type: 'task.completed', category: 'task', taskId: 'task_1', traceId: 'trace_1', previousSequence: 1, payload: {} },
    { sequence: 1, type: 'task.created', category: 'task', taskId: 'task_1', traceId: 'trace_1', payload: {} },
  ], { traceId: 'trace_1' });

  assert.equal(replay.mode, 'deterministic_event_replay');
  assert.deepEqual(replay.steps.map(step => step.sequence), [1, 2]);
  assert.equal(replay.steps[1].previousSequence, 1);
});
