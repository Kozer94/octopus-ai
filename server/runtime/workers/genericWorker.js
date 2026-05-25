async function run(task) {
  return {
    ok: true,
    worker: 'generic',
    payload: task.payload || {},
  };
}

module.exports = { run };
