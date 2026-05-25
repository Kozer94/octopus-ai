const path = require('path');

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { input += chunk; });
    process.stdin.on('error', reject);
    process.stdin.on('end', () => resolve(input));
  });
}

async function main() {
  const workerPath = path.resolve(process.argv[2] || '');
  if (!workerPath) throw new Error('worker path is required');

  const input = JSON.parse(await readStdin() || '{}');
  const worker = require(workerPath);
  if (typeof worker.run !== 'function') throw new Error(`Worker ${workerPath} must export run(task)`);

  const result = await worker.run(input.task || {});
  process.stdout.write(JSON.stringify({ success: true, result }));
}

main().catch(error => {
  process.stdout.write(JSON.stringify({ success: false, error: error.message }));
  process.exitCode = 1;
});
