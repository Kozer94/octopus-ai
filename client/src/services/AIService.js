import { octopusApi } from './apiClient';
import { getDefaultModelId, getModelById } from './ModelRegistry';

function normalizeMessages(messages = []) {
  return Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages || '') }];
}

function commandFromMessages(messages = []) {
  const normalized = normalizeMessages(messages);
  const lastUser = [...normalized].reverse().find(message => message.role === 'user');
  return lastUser?.content || normalized.map(message => message.content || '').join('\n\n');
}

function normalizeAIError(error) {
  if (error?.rateLimited || error?.status === 429) {
    const err = new Error(error.message || 'AI rate limit reached. Please try again shortly.');
    err.rateLimited = true;
    err.status = 429;
    err.retryAfterMs = error.retryAfterMs;
    return err;
  }

  if (error?.name === 'AbortError' || /timed out|timeout/i.test(error?.message || '')) {
    const err = new Error('AI request timed out. Please try again.');
    err.timeout = true;
    return err;
  }

  return error instanceof Error ? error : new Error(String(error || 'AI request failed'));
}

export async function sendToAI(model, messages, systemPrompt = '', options = {}) {
  const selectedModel = getModelById(model)?.id || getDefaultModelId();
  const command = commandFromMessages(messages);
  if (!command.trim()) throw new Error('AI command is empty');

  try {
    return await octopusApi.send({
      ...options,
      command: systemPrompt ? `${systemPrompt}\n\n${command}` : command,
      model: selectedModel,
    });
  } catch (error) {
    throw normalizeAIError(error);
  }
}
