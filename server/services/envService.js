function createEnvReader(env = process.env) {
  return {
    get(name, fallback = '') {
      const value = env[name];
      if (value === undefined || value === null || value === '') return fallback;
      return String(value);
    },
    has(name) {
      return Boolean(String(env[name] || '').trim());
    },
  };
}

module.exports = {
  createEnvReader,
};
