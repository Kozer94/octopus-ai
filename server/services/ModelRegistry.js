/**
 * Model Registry — سجل النماذج المتاحة
 * كل نموذج يُعرَّف مرة واحدة هنا ويُستدعى من modelSelector + aiService
 */

const AI_MODELS = [
  // ─── PRIMARY: Balanced (default) ────────────────────────────────
  {
    id: 'deepseek/deepseek-chat-v3-0324',
    provider: 'openrouter',
    label: 'DeepSeek Chat V3',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyName: 'OPENROUTER_API_KEY',
    strengths: ['general', 'code_generation', 'refactor'],
    contextWindow: 64000,
  },

  // ─── REASONING: Debug + Analysis ────────────────────────────────
  {
    id: 'deepseek/deepseek-r1',
    provider: 'openrouter',
    label: 'DeepSeek R1 (Reasoning)',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyName: 'OPENROUTER_API_KEY',
    strengths: ['debug', 'analysis', 'planning'],
    contextWindow: 64000,
  },

  // ─── CODE-SPECIALIZED: Code Generation + Refactor ───────────────
  {
    id: 'qwen/qwen2.5-coder-32b-instruct',
    provider: 'openrouter',
    label: 'Qwen 2.5 Coder 32B',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyName: 'OPENROUTER_API_KEY',
    strengths: ['code_generation', 'refactor', 'testing'],
    contextWindow: 32000,
  },

  // ─── FAST/CHEAP: Testing + Documentation ────────────────────────
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    provider: 'openrouter',
    label: 'Llama 3.1 8B (Fast)',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyName: 'OPENROUTER_API_KEY',
    strengths: ['testing', 'documentation'],
    contextWindow: 128000,
  },

  // ─── LARGE CONTEXT: Planning ─────────────────────────────────────
  {
    id: 'google/gemini-flash-1.5',
    provider: 'openrouter',
    label: 'Gemini Flash 1.5 (Large Context)',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyName: 'OPENROUTER_API_KEY',
    strengths: ['planning', 'analysis'],
    contextWindow: 1000000,
  },
];

const DEFAULT_MODEL_ID = 'deepseek/deepseek-chat-v3-0324';

function getModelById(id) {
  return AI_MODELS.find(model => model.id === id) || null;
}

function getDefaultModel() {
  return getModelById(DEFAULT_MODEL_ID) || AI_MODELS[0];
}

module.exports = {
  AI_MODELS,
  DEFAULT_MODEL_ID,
  getDefaultModel,
  getModelById,
};
