async function run(task) {
  return {
    ok: true,
    worker: 'writer',
    filePath: task.payload?.filePath || '',
    plannedWrite: Boolean(task.payload?.content || task.payload?.filePath),
  };
}

module.exports = { run };
