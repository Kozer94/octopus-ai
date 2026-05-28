export const AI_MODELS = [
  {
    id: 'deepseek/deepseek-chat-v3-0324',
    provider: 'openrouter',
    label: 'Deepseek V3',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyName: 'OPENROUTER_API_KEY',
  },
];

export const DEFAULT_MODEL_ID = 'deepseek/deepseek-chat-v3-0324';

export function getModelById(id) {
  return AI_MODELS.find(model => model.id === id) || null;
}

export function getDefaultModelId() {
  return getModelById(DEFAULT_MODEL_ID)?.id || AI_MODELS[0].id;
}
