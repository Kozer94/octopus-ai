const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createAuthMiddleware,
  isLocalAddress,
  timingSafeEqualString,
} = require('./authService');

function makeReq({ path = '/api/files/list', baseUrl = '', headers = {}, ip = '203.0.113.7' } = {}) {
  return {
    path,
    baseUrl,
    ip,
    socket: { remoteAddress: ip },
    get(name) {
      return headers[name] || headers[name.toLowerCase()];
    },
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('isLocalAddress detects loopback addresses only', () => {
  assert.equal(isLocalAddress('127.0.0.1'), true);
  assert.equal(isLocalAddress('::1'), true);
  assert.equal(isLocalAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLocalAddress('203.0.113.7'), false);
});

test('auth middleware allows public api paths', () => {
  const auth = createAuthMiddleware({ env: { OCTOPUS_API_TOKEN: 'secret' } });
  const res = makeRes();
  let called = false;
  auth(makeReq({ path: '/api/health' }), res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('auth middleware allows public api paths when mounted at /api', () => {
  const auth = createAuthMiddleware({ env: { OCTOPUS_API_TOKEN: 'secret' } });
  const res = makeRes();
  let called = false;
  auth(makeReq({ baseUrl: '/api', path: '/health' }), res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('auth middleware allows matching token', () => {
  const auth = createAuthMiddleware({ env: { OCTOPUS_API_TOKEN: 'secret' } });
  const res = makeRes();
  let called = false;
  auth(makeReq({ headers: { 'X-Octopus-Token': 'secret' } }), res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('auth middleware rejects missing token when configured', () => {
  const auth = createAuthMiddleware({ env: { OCTOPUS_API_TOKEN: 'secret' } });
  const res = makeRes();
  let called = false;
  auth(makeReq(), res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { success: false, error: 'Unauthorized' });
});

test('auth middleware allows local development and marks local dev auth', () => {
  const auth = createAuthMiddleware({
    env: {},
    nodeEnv: 'development',
  });
  const req = makeReq({ ip: '127.0.0.1' });
  const res = makeRes();
  let called = false;
  auth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req._localDevAuth, true);
  assert.equal(res.headers['X-Octopus-Auth'], undefined);
});

test('auth middleware allows explicit local bypass in production', () => {
  const auth = createAuthMiddleware({
    env: { OCTOPUS_ALLOW_LOCAL_NO_AUTH: '1' },
    nodeEnv: 'production',
  });
  const req = makeReq({ ip: '127.0.0.1' });
  const res = makeRes();
  let called = false;
  auth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req._localDevAuth, true);
});

test('auth middleware rejects production without configured token', () => {
  const auth = createAuthMiddleware({ env: {}, nodeEnv: 'production' });
  const res = makeRes();
  let called = false;
  auth(makeReq({ ip: '127.0.0.1' }), res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test('timingSafeEqualString compares equal strings only', () => {
  assert.equal(timingSafeEqualString('abc', 'abc'), true);
  assert.equal(timingSafeEqualString('abc', 'abcd'), false);
  assert.equal(timingSafeEqualString('abc', 'abd'), false);
});
