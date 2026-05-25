async function run(task) {
  return {
    ok: true,
    worker: 'review',
    findings: [],
    reviewed: task.payload?.filePath || task.payload?.target || null,
  };
}

module.exports = { run };
