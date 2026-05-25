const assert = require('node:assert/strict');
const test = require('node:test');

const {
  readPackageName,
  readString,
  rejectDangerousKeys,
} = require('./inputValidation');

test('rejectDangerousKeys blocks prototype pollution keys', () => {
  assert.throws(() => rejectDangerousKeys(JSON.parse('{"safe":{"__proto__":"x"}}')), /Unsafe request key/);
  assert.throws(() => rejectDangerousKeys({ constructor: {} }), /Unsafe request key/);
});

test('readPackageName accepts normal npm package names', () => {
  assert.equal(readPackageName('react'), 'react');
  assert.equal(readPackageName('@scope/pkg-name'), '@scope/pkg-name');
});

test('readPackageName rejects shell-like package input', () => {
  assert.throws(() => readPackageName('react && rm -rf .'), /غير صالح/);
  assert.throws(() => readPackageName('../pkg'), /غير صالح/);
});

test('readString enforces required and max length', () => {
  assert.throws(() => readString('', 'name', { required: true }), /مطلوب/);
  assert.throws(() => readString('abcd', 'name', { max: 3 }), /طويل/);
  assert.equal(readString('  ok  ', 'name'), 'ok');
});
