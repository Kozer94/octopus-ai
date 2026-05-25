async function run(task) {
  return {
    ok: true,
    worker: 'merge',
    mergedDependencies: task.dependencies || [],
  };
}

module.exports = { run };
