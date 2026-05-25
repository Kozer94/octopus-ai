async function run(task) {
  return {
    ok: true,
    worker: 'terminal',
    command: task.payload?.command || '',
    dryRun: true,
  };
}

module.exports = { run };
