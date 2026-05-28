const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getAllowedOrigins,
  isAllowedCorsOrigin,
} = require('./httpSecurity');

test('isAllowedCorsOrigin allows configured local app origins and rejects empty origins', () => {
  const allowed = getAllowedOrigins('');

  assert.equal(isAllowedCorsOrigin(undefined, allowed), false);
  assert.equal(isAllowedCorsOrigin('http://localhost:5173', allowed), true);
  assert.equal(isAllowedCorsOrigin('http://127.0.0.1:5173', allowed), true);
});

test('isAllowedCorsOrigin blocks unrelated browser origins', () => {
  const allowed = getAllowedOrigins('');

  assert.equal(isAllowedCorsOrigin('https://example.com', allowed), false);
});

test('getAllowedOrigins accepts configured extra origins', () => {
  const allowed = getAllowedOrigins('http://localhost:3000, https://trusted.test');

  assert.equal(allowed.has('http://localhost:3000'), true);
  assert.equal(allowed.has('https://trusted.test'), true);
});
