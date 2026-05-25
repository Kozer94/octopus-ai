const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const {
  createChildProcessWorkerAdapter,
  createInProcessWorkerAdapter,
} = require('./workerAdapterService');

test('in-process worker adapter executes mapped workers', async () => {
  const adapter = createInProcessWorkerAdapter({
    workers: {
      writer: async task => ({ ok: true, filePath: task.payload.filePath }),
    },
  });

  const result = await adapter.execute({ type: 'writer', payload: { filePath: 'a.js' } });

  assert.equal(result.backend, 'in_process');
  assert.equal(result.worker.type, 'writer');
  assert.deepEqual(result.result, { ok: true, filePath: 'a.js' });
});

test('child-process worker adapter isolates worker execution', async () => {
  const workerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-worker-'));
  fs.writeFileSync(path.join(workerDir, 'writerWorker.js'), `
    async function run(task) {
      return { ok: true, pid: process.pid, filePath: task.payload.filePath };
    }
    module.exports = { run };
  `, 'utf8');

  const adapter = createChildProcessWorkerAdapter({
    workerDir,
    hostPath: path.join(__dirname, '..', 'runtime', 'workerHost.js'),
  });
  const result = await adapter.execute({
    type: 'writer',
    timeoutMs: 5000,
    payload: { filePath: 'child.js' },
  });

  assert.equal(result.backend, 'child_process');
  assert.equal(result.worker.type, 'writer');
  assert.equal(result.result.filePath, 'child.js');
  assert.notEqual(result.result.pid, process.pid);
});
