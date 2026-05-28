const assert = require('node:assert/strict');
const test = require('node:test');

const { AI_MODELS, DEFAULT_MODEL_ID, getDefaultModel, getModelById } = require('./ModelRegistry');

test('model registry exposes the base selectable model catalog', () => {
  assert.equal(AI_MODELS.some(model => model.provider === 'groq'), true);
  assert.equal(AI_MODELS.some(model => model.provider === 'gemini'), true);
  assert.equal(AI_MODELS.some(model => model.provider === 'openrouter'), true);
  assert.equal(AI_MODELS.some(model => model.provider === 'mistral'), true);
  assert.equal(AI_MODELS.some(model => model.provider === 'ollama'), true);
  assert.equal(getModelById('mistral-small-latest').provider, 'mistral');
  assert.equal(getModelById(DEFAULT_MODEL_ID)?.id, DEFAULT_MODEL_ID);
  assert.equal(getDefaultModel().id, DEFAULT_MODEL_ID);
});

test('model registry entries provide metadata for dynamic provider resolution', () => {
  for (const model of AI_MODELS) {
    assert.equal(typeof model.id, 'string');
    assert.equal(model.id.length > 0, true);
    assert.equal(typeof model.provider, 'string');
    assert.equal(model.provider.length > 0, true);
    assert.equal(typeof model.label, 'string');
    assert.equal(model.label.length > 0, true);
  }

  for (const model of AI_MODELS.filter(model => model.provider !== 'ollama')) {
    assert.equal(typeof model.endpoint, 'string');
    assert.equal(model.endpoint.startsWith('http'), true);
    assert.equal(typeof model.apiKeyName, 'string');
    assert.equal(model.apiKeyName.length > 0, true);
  }
});
