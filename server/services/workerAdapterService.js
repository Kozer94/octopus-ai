const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createWorkerRegistry } = require('./workerRegistryService');

const WORKER_RESULT_SCHEMA_VERSION = 1;

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function createInProcessWorkerAdapter({ workers = {}, workerRegistry = createWorkerRegistry() } = {}) {
  return {
    mode: 'in_process',
    workerRegistry,
    async execute(task, context = {}) {
      const definition = workerRegistry.resolveWorker({ type: task.type, capabilities: task.capabilities });
      const worker = workers[definition?.worker] || workers[task.type] || workers.generic || (async value => ({ ok: true, payload: value.payload }));
      const result = await worker(task, context);
      return {
        schemaVersion: WORKER_RESULT_SCHEMA_VERSION,
        backend: 'in_process',
        executionContract: context.executionContract || null,
        worker: definition,
        result: cloneJson(result, { ok: true }),
      };
    },
  };
}

function createChildProcessWorkerAdapter({
  workerDir = path.join(__dirname, '..', 'runtime', 'workers'),
  hostPath = path.join(__dirname, '..', 'runtime', 'workerHost.js'),
  workerRegistry = createWorkerRegistry(),
  logger = console,
} = {}) {
  return {
    mode: 'child_process',
    workerRegistry,
    execute(task, context = {}) {
      return new Promise((resolve, reject) => {
        const definition = workerRegistry.resolveWorker({ type: task.type, capabilities: task.capabilities });
        const workerName = definition?.worker || task.type || 'generic';
        const workerPath = path.join(workerDir, `${workerName}Worker.js`);
        const fallbackPath = path.join(workerDir, 'genericWorker.js');
        const selectedWorkerPath = fs.existsSync(workerPath) ? workerPath : fallbackPath;
        const executionContract = context.executionContract || null;
        const timeoutMs = executionContract?.leaseTimeout || task.timeoutMs || 30000;
        const child = spawn(process.execPath, [hostPath, selectedWorkerPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill();
          reject(new Error(`Worker lease expired after ${timeoutMs}ms`));
        }, timeoutMs);

        child.stdout.on('data', chunk => { stdout += chunk.toString(); });
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.on('error', error => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
        child.on('close', code => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (code !== 0) {
            logger.error(`Worker exited with code ${code}: ${stderr}`);
            reject(new Error(stderr.trim() || `Worker exited with code ${code}`));
            return;
          }
          try {
            const message = JSON.parse(stdout || '{}');
            if (!message.success) {
              reject(new Error(message.error || 'Worker failed'));
              return;
            }
            resolve({
              schemaVersion: WORKER_RESULT_SCHEMA_VERSION,
              backend: 'child_process',
              executionContract,
              worker: definition,
              workerPath: selectedWorkerPath,
              result: cloneJson(message.result, { ok: true }),
            });
          } catch (error) {
            reject(new Error(`Invalid worker response: ${error.message}`));
          }
        });

        child.stdin.end(JSON.stringify({
          schemaVersion: 1,
          task: cloneJson(task, {}),
        }));
      });
    },
  };
}

function createWorkerAdapter(options = {}) {
  if (options.mode === 'child_process') return createChildProcessWorkerAdapter(options);
  return createInProcessWorkerAdapter(options);
}

module.exports = {
  WORKER_RESULT_SCHEMA_VERSION,
  createChildProcessWorkerAdapter,
  createInProcessWorkerAdapter,
  createWorkerAdapter,
};
