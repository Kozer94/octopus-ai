const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildRealState,
  getConfiguredProviders,
  validateRealState,
} = require('./stateService');

test('getConfiguredProviders reports configured API keys without exposing values', () => {
  const providers = getConfiguredProviders({
    GROQ_API_KEY: 'secret',
    GEMINI_API_KEY: '',
  });

  assert.equal(providers.groq, true);
  assert.equal(providers.gemini, false);
  assert.equal(Object.values(providers).includes('secret'), false);
});

test('buildRealState includes process, sessions, providers, and project info', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-state-'));
  fs.writeFileSync(path.join(projectDir, 'package.json'), '{"name":"demo"}');

  const state = buildRealState(projectDir, { default: [{ role: 'user' }] });

  assert.equal(state.projectDir, projectDir);
  assert.equal(state.sessions.count, 1);
  assert.equal(state.sessions.ids[0], 'default');
  assert.equal(typeof state.process.pid, 'number');
});

test('validateRealState returns ok for a generated state', () => {
  const state = buildRealState('', {});
  const validation = validateRealState(state);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.issues, []);
});
