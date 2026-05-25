function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(operation, timeoutMs, label = 'operation', buildError) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const message = `${label} timed out after ${timeoutMs}ms`;
      reject(buildError ? buildError(message, timeoutMs, label) : new Error(message));
    }, timeoutMs);
  });

  return Promise.race([
    Promise.resolve().then(operation),
    timeout,
  ]).finally(() => clearTimeout(timeoutId));
}

module.exports = {
  delay,
  withTimeout,
};
