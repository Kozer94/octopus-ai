const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const {
  createApiRateLimiters,
  createEventsBurstGuard,
} = require('./rateLimitService');

function createTestEnv(values = {}) {
  return {
    get(key, fallback) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback;
    },
  };
}

async function createTestServer() {
  const app = express();
  const { limiter, mutationLimiter } = createApiRateLimiters(createTestEnv({
    OCTOPUS_RATE_LIMIT_API_MAX: '1',
    OCTOPUS_RATE_LIMIT_MUTATION_MAX: '1',
  }));

  app.use(limiter);
  app.use(mutationLimiter);
  app.get('/api/normal', (req, res) => res.json({ success: true }));
  app.post('/api/normal', (req, res) => res.json({ success: true }));
  app.get('/api/events', (req, res) => res.json({ success: true, events: [] }));
  app.post('/api/events/batch', (req, res) => res.json({ success: true, events: [] }));

  const server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}` };
}

test('rate limiter skips HUD event reads and telemetry batches', async () => {
  const { server, url } = await createTestServer();
  try {
    assert.equal((await fetch(`${url}/api/normal`)).status, 200);
    assert.equal((await fetch(`${url}/api/normal`)).status, 429);

    for (let index = 0; index < 3; index += 1) {
      assert.equal((await fetch(`${url}/api/events?category=client&limit=80`)).status, 200);
    }

    for (let index = 0; index < 3; index += 1) {
      assert.equal((await fetch(`${url}/api/events/batch`, { method: 'POST' })).status, 200);
    }
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('events burst guard stops /api/events spam with a short retry response', async () => {
  const app = express();
  app.use(createEventsBurstGuard({ max: 2, windowMs: 1000 }));
  app.get('/api/events', (req, res) => res.json({ success: true, events: [] }));
  app.get('/api/normal', (req, res) => res.json({ success: true }));

  const server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;

  try {
    assert.equal((await fetch(`${url}/api/events`)).status, 200);
    assert.equal((await fetch(`${url}/api/events`)).status, 200);
    const blocked = await fetch(`${url}/api/events`);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '1');
    assert.equal((await blocked.json()).error, 'EVENTS_RATE_LIMIT_TRIGGERED');

    assert.equal((await fetch(`${url}/api/normal`)).status, 200);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
