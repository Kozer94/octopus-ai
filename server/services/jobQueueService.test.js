const assert = require('assert');
const test = require('node:test');
const { createJobQueue } = require('./jobQueueService');

test('job queue runs jobs asynchronously with bounded concurrency', async () => {
  let active = 0;
  let maxActive = 0;
  const queue = createJobQueue({ concurrency: 1 });

  const first = queue.enqueue('demo', async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 15));
    active -= 1;
    return { ok: 1 };
  });
  const second = queue.enqueue('demo', async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    active -= 1;
    return { ok: 2 };
  });

  assert.equal(first.status, 'queued');
  assert.equal(second.status, 'queued');

  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(queue.get(first.id).status, 'completed');
  assert.equal(queue.get(second.id).status, 'completed');
  assert.deepEqual(queue.get(first.id).result, { ok: 1 });
  assert.equal(maxActive, 1);
});

test('job queue rejects new jobs when pending capacity is full', () => {
  const queue = createJobQueue({ concurrency: 0, maxPending: 1 });
  queue.enqueue('demo', async () => ({ ok: true }));

  assert.throws(
    () => queue.enqueue('demo', async () => ({ ok: false })),
    /Job queue is full/,
  );
});
