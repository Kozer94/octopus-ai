const test = require('node:test');
const assert = require('node:assert/strict');
const { createAIService, estimateTokens, trimContext, TOKEN_BUDGET } = require('./aiService');

const silentLogger = {
  log() {},
  error() {},
};

function createSelectModel() {
  return () => ({ reasoning: 'test model selection' });
}

test('createAIService prefers plugin providers before default providers', async () => {
  const calls = [];
  const callAI = createAIService({
    groq: {},
    pluginManager: {
      getAllAIProviders() {
        return [
          {
            call: async (messages, maxTokens) => {
              calls.push({ messages, maxTokens });
              return 'plugin result';
            },
          },
        ];
      },
    },
    selectModel: createSelectModel(),
    providers: [
      async () => {
        throw new Error('default provider should not run');
      },
    ],
    logger: silentLogger,
  });

  const messages = [{ role: 'user', content: 'hello' }];
  const result = await callAI(messages, 123, 'build');

  assert.equal(result, 'plugin result');
  assert.deepEqual(calls, [{ messages, maxTokens: 123 }]);
});

test('createAIService skips providers without keys and returns later provider result', async () => {
  const callAI = createAIService({
    groq: {},
    pluginManager: {
      getAllAIProviders() {
        return [];
      },
    },
    selectModel: createSelectModel(),
    providers: [
      async () => {
        throw new Error('no key');
      },
      async () => 'fallback result',
    ],
    logger: silentLogger,
  });

  const result = await callAI([{ role: 'user', content: 'hello' }]);

  assert.equal(result, 'fallback result');
});

test('createAIService times out a stuck provider and falls back', async () => {
  const callAI = createAIService({
    groq: {},
    pluginManager: {
      getAllAIProviders() {
        return [];
      },
    },
    selectModel: createSelectModel(),
    providers: [
      async () => new Promise(() => {}),
      async () => 'timeout fallback result',
    ],
    logger: silentLogger,
    providerTimeoutMs: 10,
  });

  const result = await callAI([{ role: 'user', content: 'hello' }]);

  assert.equal(result, 'timeout fallback result');
});

test('createAIService reports provider failures when every provider fails', async () => {
  const callAI = createAIService({
    groq: {},
    pluginManager: {
      getAllAIProviders() {
        return [];
      },
    },
    selectModel: createSelectModel(),
    providers: [
      async () => {
        throw new Error('no key');
      },
      async () => {
        throw new Error('boom');
      },
    ],
    logger: silentLogger,
  });

  await assert.rejects(
    callAI([{ role: 'user', content: 'hello' }]),
    /All AI providers failed: provider\[0\]: no key \| provider\[1\]: boom/,
  );
});

// ─── estimateTokens ───────────────────────────────────────────
test('estimateTokens counts ASCII at ~4 chars per token', () => {
  const tokens = estimateTokens('abcd'); // 4 chars → 1 token
  assert.equal(tokens, 1);
});

test('estimateTokens counts Arabic at 1 char per token', () => {
  const tokens = estimateTokens('مرحبا'); // 5 Arabic chars → 5 tokens
  assert.equal(tokens, 5);
});

test('estimateTokens handles mixed Arabic and ASCII', () => {
  // 'hi' = 2 ASCII = 0.5 tokens → ceil = 1; 'مرحبا' = 5 Arabic = 5 tokens → total ceil(5.5) = 6
  const tokens = estimateTokens('hiمرحبا');
  assert.equal(tokens, 6);
});

test('estimateTokens accepts a messages array', () => {
  const tokens = estimateTokens([{ role: 'user', content: 'hi' }]);
  // JSON.stringify adds overhead — just check it returns a positive number
  assert.ok(tokens > 0);
});

// ─── trimContext ──────────────────────────────────────────────
test('trimContext always keeps the system message', () => {
  const system = { role: 'system', content: 'you are helpful' };
  const msgs = [
    system,
    { role: 'user',      content: 'a'.repeat(10000) },
    { role: 'assistant', content: 'b'.repeat(10000) },
    { role: 'user',      content: 'short' },
  ];
  const trimmed = trimContext(msgs, 10); // very tight budget
  assert.equal(trimmed[0], system);
});

test('trimContext keeps the last message when budget is very tight', () => {
  const system = { role: 'system', content: 's' };
  const last   = { role: 'user', content: 'last' };
  const msgs   = [system, { role: 'user', content: 'old'.repeat(5000) }, last];
  const trimmed = trimContext(msgs, 50);
  assert.ok(trimmed.some(m => m === last));
});

test('trimContext returns all messages when under budget', () => {
  const msgs = [
    { role: 'system', content: 'sys' },
    { role: 'user',   content: 'hi' },
  ];
  const trimmed = trimContext(msgs, TOKEN_BUDGET);
  assert.equal(trimmed.length, msgs.length);
});
