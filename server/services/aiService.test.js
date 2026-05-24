const test = require('node:test');
const assert = require('node:assert/strict');
const { createAIService } = require('./aiService');

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
