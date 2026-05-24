const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildSafeEnv,
  validateCommand,
} = require('./terminalService');

test('validateCommand accepts ordinary commands', () => {
  assert.equal(validateCommand('npm run build'), 'npm run build');
});

test('validateCommand blocks destructive commands', () => {
  for (const command of [
    'rm -rf .',
    'del /f /s C:\\temp',
    'format C:',
    'shutdown /s',
    'git reset --hard',
    'git clean -fd',
  ]) {
    assert.throws(() => validateCommand(command), /ممنوع/);
  }
});

test('buildSafeEnv filters likely secrets', () => {
  const original = {
    API_TOKEN: process.env.API_TOKEN,
    NORMAL_TEST_ENV: process.env.NORMAL_TEST_ENV,
  };

  process.env.API_TOKEN = 'secret';
  process.env.NORMAL_TEST_ENV = 'visible';

  try {
    const env = buildSafeEnv();
    assert.equal(env.API_TOKEN, undefined);
    assert.equal(env.NORMAL_TEST_ENV, 'visible');
  } finally {
    if (original.API_TOKEN === undefined) delete process.env.API_TOKEN;
    else process.env.API_TOKEN = original.API_TOKEN;

    if (original.NORMAL_TEST_ENV === undefined) delete process.env.NORMAL_TEST_ENV;
    else process.env.NORMAL_TEST_ENV = original.NORMAL_TEST_ENV;
  }
});
