const { createEnvReader } = require('./envService');
const { delay, withTimeout } = require('./asyncControl');
const { hudLog, hudProviderUpdate } = require('../hud-ws');
const { getModelById } = require('./ModelRegistry');
const { recordSuccess, recordFailure, isInCooldown, getRemainingCooldownMs } = require('./providerHealthService');
const structuredLogger = require('./logger');
const { ContextError, ProviderError } = require('./errors');
const { MODEL_TIMEOUT_TIERS } = require('../modelSelector');

const DEFAULT_PROVIDER_NAMES = [
  'OpenRouter',
  'Groq llama-3.1-8b',
  'Groq llama-3.2-3b',
  'Mistral',
  'Cohere',
  'Together',
  'Ollama',
  'Gemini',
];

function readChatChoice(data, providerName) {
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${providerName} empty response`);
  return content;
}

function createGroqProvider(groq, { model, maxTokenCap }) {
  return async (messages, maxTokens, onChunk) => {
    // If streaming is requested and supported
    if (onChunk) {
      const stream = await groq.chat.completions.create({
        model,
        messages,
        temperature: 0.5,
        max_tokens: Math.min(maxTokens, maxTokenCap),
        stream: true,
      });
      
      let fullContent = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          onChunk(content, fullContent);
        }
      }
      return fullContent;
    }
    
    // Non-streaming fallback
    const completion = await groq.chat.completions.create({
      model,
      messages,
      temperature: 0.5,
      max_tokens: Math.min(maxTokens, maxTokenCap),
    });
    return completion.choices[0].message.content;
  };
}

function createHttpChatProvider(env, {
  apiKeyName,
  body,
  endpoint,
  headers = {},
  name,
  readContent = readChatChoice,
}) {
  return async (messages, maxTokens, onChunk) => {
    if (!env.has(apiKeyName)) throw new Error('no key');
    
    // If streaming is requested and supported
    if (onChunk) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.get(apiKeyName)}`, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ ...body(messages, maxTokens), stream: true }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(typeof errorData.error === 'object' ? (errorData.error.message || JSON.stringify(errorData.error)) : errorData.error || `HTTP ${res.status}`);
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                fullContent += content;
                onChunk(content, fullContent);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
      
      return fullContent;
    }
    
    // Non-streaming fallback
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.get(apiKeyName)}`, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body(messages, maxTokens)),
    });
    const data = await res.json();
    if (data.error) throw new Error(typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : data.error);
    return readContent(data, name);
  };
}

function createDefaultProviders({ env = createEnvReader(), groq }) {
  return [
    // OpenRouter - primary provider (stable, paid)
    createHttpChatProvider(env, {
      apiKeyName: 'OPENROUTER_API_KEY',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      name: 'OpenRouter',
      body: (messages, maxTokens) => ({
        model: env.get('OPENROUTER_MODEL', 'deepseek/deepseek-chat-v3-0324'),
        messages,
        max_tokens: maxTokens,
      }),
    }),
    // Groq fallbacks
    createGroqProvider(groq, { model: 'llama-3.1-8b-instant', maxTokenCap: 4096 }),
    createGroqProvider(groq, { model: 'llama-3.1-8b-instant', maxTokenCap: 2048 }),
    createGroqProvider(groq, { model: 'llama-3.2-3b-preview', maxTokenCap: 2048 }),
    createHttpChatProvider(env, {
      apiKeyName: 'MISTRAL_API_KEY',
      endpoint: 'https://api.mistral.ai/v1/chat/completions',
      name: 'Mistral',
      body: (messages, maxTokens) => ({ model: 'mistral-small-latest', messages, max_tokens: maxTokens }),
    }),
    createHttpChatProvider(env, {
      apiKeyName: 'COHERE_API_KEY',
      endpoint: 'https://api.cohere.com/v2/chat',
      name: 'Cohere',
      body: (messages, maxTokens) => ({ model: 'command-r-plus', messages, max_tokens: maxTokens }),
      readContent: data => {
        const text = data.message?.content?.[0]?.text;
        if (!text) throw new Error('Cohere empty response');
        return text;
      },
    }),
    createHttpChatProvider(env, {
      apiKeyName: 'TOGETHER_API_KEY',
      endpoint: 'https://api.together.xyz/v1/chat/completions',
      name: 'Together',
      body: (messages, maxTokens) => ({ model: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo', messages, max_tokens: maxTokens }),
    }),
    // Ollama - local fallback (only works if installed)
    async (messages, maxTokens) => {
      const model = env.get('OLLAMA_MODEL', 'llama3.2');
      const baseUrl = env.get('OLLAMA_BASE_URL', 'http://localhost:11434');
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false, options: { num_predict: Math.min(maxTokens, 4096) } }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`);
      const data = await res.json();
      const content = data.message?.content;
      if (!content) throw new Error('Ollama empty response');
      return content;
    },
    // Gemini
    async (messages, _maxTokens) => {
      if (!env.has('GEMINI_API_KEY')) throw new Error('no key');
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(env.get('GEMINI_API_KEY'));
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const result = await model.generateContent(prompt);
      return result.response.text();
    },
  ];
}

// ─── Context Budget Layer ─────────────────────────────────────
const TOKEN_BUDGET    = 5500; // hard cap (Groq free = 6000 TPM)
const CHARS_PER_TOKEN = 4;   // ASCII baseline لتقديرات الـ audit log

// تقدير دقيق للـ tokens يأخذ بعين الاعتبار العربية والـ CJK
// ASCII/Latin : 4 chars ≈ 1 token
// Arabic/CJK  : 1 char  ≈ 1 token
function estimateTokens(messages) {
  const text = typeof messages === 'string' ? messages : JSON.stringify(messages);
  const arabicAndCjk = (text.match(/[\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF]/g) || []).length;
  const other = text.length - arabicAndCjk;
  return Math.ceil(arabicAndCjk * 1.0 + other / 4);
}

// يحذف من الأمام (الأقدم) ويحافظ على system + آخر message دائماً
// يستخدم estimateTokens بدلاً من char count لدقة أفضل مع العربية
function trimContext(messages, maxTokens = TOKEN_BUDGET) {
  if (!messages || messages.length === 0) return messages;

  // system message دائماً محفوظ
  const system   = messages[0]?.role === 'system' ? messages[0] : null;
  const rest     = system ? messages.slice(1) : messages.slice();
  const mustKeep = system ? [system] : [];

  let usedTokens = estimateTokens(mustKeep);
  const kept     = [];

  for (let i = rest.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(rest[i]);
    if (usedTokens + msgTokens > maxTokens && kept.length > 0) break;
    kept.unshift(rest[i]);
    usedTokens += msgTokens;
  }

  return [...mustKeep, ...kept];
}

const GROQ_TOKEN_LIMIT = 6000;

function auditContext(messages, { originalMessages = null, tokenLimit = GROQ_TOKEN_LIMIT } = {}) {
  const hasSystem     = messages[0]?.role === 'system';
  const systemPreserved = hasSystem;

  const breakdown = messages.map((m, idx) => {
    const char_length = (m.content || '').length;
    return {
      index:            idx,
      role:             m.role,
      char_length,
      estimated_tokens: Math.ceil(char_length / CHARS_PER_TOKEN),
    };
  });

  const total_chars  = breakdown.reduce((s, m) => s + m.char_length, 0);
  const total_tokens = Math.ceil(JSON.stringify(messages).length / CHARS_PER_TOKEN);
  const over_limit   = total_tokens > tokenLimit;
  const trim_needed  = over_limit;

  // How many non-system messages would be dropped to get under limit,
  // simulating trimContext logic (drop from oldest, preserve system + last)
  let droppable_messages = 0;
  if (trim_needed) {
    const rest         = hasSystem ? messages.slice(1) : messages.slice();
    const mustKeep     = hasSystem ? [messages[0]] : [];
    let   usedTokens   = estimateTokens(mustKeep);
    const kept         = [];
    for (let i = rest.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(rest[i]);
      if (usedTokens + msgTokens > tokenLimit && kept.length > 0) break;
      kept.unshift(rest[i]);
      usedTokens += msgTokens;
    }
    droppable_messages = rest.length - kept.length;
  }

  // INVALID_TRIM: system message lost after trim, or still over limit post-trim
  const systemLostAfterTrim = originalMessages?.[0]?.role === 'system' && !systemPreserved;
  const stillOverAfterTrim  = originalMessages && total_tokens > tokenLimit;
  const invalid_trim        = systemLostAfterTrim || (originalMessages && stillOverAfterTrim);

  let verdict;
  if (invalid_trim) {
    verdict = 'INVALID_TRIM';
  } else if (over_limit) {
    verdict = 'OVER_LIMIT';
  } else {
    verdict = 'SAFE';
  }

  const report = {
    messages: breakdown,
    summary: {
      total_chars,
      total_tokens,
      count: messages.length,
    },
    trim_analysis: {
      trim_needed,
      system_preserved: systemPreserved,
      droppable_messages,
    },
    limit: {
      token_limit: tokenLimit,
      over_limit,
    },
    verdict,
  };

  debugLifecycleLog('CONTEXT_AUDIT:', report);
  return report;
}

// بناء provider ديناميكي بناءً على model ID المختار من الـ UI
function buildProviderForModel(groq, env, modelId) {
  const model = getModelById(modelId);
  if (!model) return null;

  if (model.provider === 'groq') {
    return createGroqProvider(groq, { model: model.id, maxTokenCap: model.maxTokenCap || 4096 });
  }

  if (model.provider === 'mistral') {
    return createHttpChatProvider(env, {
      apiKeyName: model.apiKeyName,
      endpoint: model.endpoint,
      name: model.label,
      body: (msgs, maxT) => ({ model: model.id, messages: msgs, max_tokens: maxT }),
    });
  }

  if (model.provider === 'openrouter') {
    return createHttpChatProvider(env, {
      apiKeyName: model.apiKeyName,
      endpoint: model.endpoint,
      name: model.label,
      body: (msgs, maxT) => ({ model: model.id, messages: msgs, max_tokens: maxT }),
    });
  }

  if (model.provider === 'gemini') {
    return async (messages) => {
      if (!env.has(model.apiKeyName)) throw new Error('no key');
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(env.get(model.apiKeyName));
      const gemModel = genAI.getGenerativeModel({ model: model.id });
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const result = await gemModel.generateContent(prompt);
      return result.response.text();
    };
  }

  if (model.provider === 'ollama') {
    return async (messages, maxTokens) => {
      const ollamaModel = env.get(model.envModelName, model.id.replace(/^ollama:/, ''));
      const baseUrl = env.get(model.envBaseUrl, 'http://localhost:11434');
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ollamaModel, messages, stream: false, options: { num_predict: Math.min(maxTokens, 4096) } }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`);
      const data = await res.json();
      const content = data.message?.content;
      if (!content) throw new Error('Ollama empty response');
      return content;
    };
  }

  return null;
}

const DEFAULT_PROVIDER_TIMEOUT_MS = 15000;
const OPENROUTER_PROVIDER_TIMEOUT_MS = 60000;

function getProviderTimeoutMs(providerName, selectedModel, fallbackTimeoutMs) {
  return selectedModel?.provider === 'openrouter' || providerName === 'OpenRouter'
    ? OPENROUTER_PROVIDER_TIMEOUT_MS
    : fallbackTimeoutMs;
}

function isPayloadTooLarge(error, message) {
  return error.status === 413 || message.includes('413') ||
    message.includes('too large') || message.includes('Request too large') ||
    message.includes('tokens per minute') || message.includes('reduce your message size');
}

function isRateLimited(error, message) {
  return error.status === 429 || error.statusCode === 429 ||
    message.includes('Rate limit') || message.includes('rate limit') ||
    message.includes('429') || message.includes('Too Many Requests') ||
    message.includes('quota') || message.includes('Quota');
}

function isTestRuntime() {
  return Boolean(process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === 'test');
}

const aiLog = structuredLogger.withContext('aiService');

function debugLifecycleLog(label, payload) {
  if (isTestRuntime()) return;
  aiLog.debug(label, payload);
}

function logProviderLifecycle(debugPayload, payload) {
  debugLifecycleLog('REQUEST_LIFECYCLE', { ...debugPayload, ...payload });
}

async function handleProviderError({
  activeMessages,
  debugLog,
  error,
  errors,
  logger,
  providerName,
  providerIndex,
  retryRound,
}) {
  const msg = error.message || String(error);
  if (msg === 'no key') {
    errors.push(`provider[${providerIndex}]: no key`);
    hudLog('warn', `${providerName} rejected: no API key`);
    hudProviderUpdate(providerName, 'no-key');
    logProviderLifecycle(debugLog, { decision: 'reject', error_reason: 'no key' });
    return { action: 'continue', activeMessages, retryRound };
  }

  if (isPayloadTooLarge(error, msg)) {
    logger.log(`⚠️ provider[${providerIndex}] payload too large, reducing context 30%...`);
    errors.push(`provider[${providerIndex}]: payload too large`);
    hudLog('warn', `${providerName} payload too large`);
    hudProviderUpdate(providerName, 'error', { reason: 'payload too large' });
    logProviderLifecycle(debugLog, {
      decision: 'retry',
      error_reason: msg,
      error_status: error.status || 413,
    });
    return {
      action: 'continue',
      activeMessages: trimContext(activeMessages, Math.floor(estimateTokens(activeMessages) * 0.7)),
      retryRound: retryRound + 1,
      trimApplied: true,
    };
  }

  if (isRateLimited(error, msg)) {
    const backoffMs = Math.min(1000 * Math.pow(2, retryRound), 8000);
    logger.log(`⚠️ provider[${providerIndex}] rate limited, waiting ${backoffMs}ms then trying next...`);
    errors.push(`provider[${providerIndex}]: rate limited`);
    hudLog('warn', `${providerName} rate limited`);
    hudProviderUpdate(providerName, 'error', { reason: 'rate limited' });
    logProviderLifecycle(debugLog, {
      decision: 'retry',
      error_reason: msg,
      error_status: error.status || error.statusCode || 429,
      backoff_ms: backoffMs,
    });
    await delay(backoffMs);
    return { action: 'continue', activeMessages, retryRound: retryRound + 1 };
  }

  logger.log(`⚠️ provider[${providerIndex}] error: ${msg}`);
  errors.push(`provider[${providerIndex}]: ${msg}`);
  hudLog('warn', `${providerName} failed: ${msg}`);
  hudProviderUpdate(providerName, 'error', { reason: msg });
  logProviderLifecycle(debugLog, {
    decision: 'reject',
    error_reason: msg,
    error_status: error.status || error.statusCode || null,
  });
  return { action: 'continue', activeMessages, retryRound };
}

function createAIService({
  env = createEnvReader(),
  groq,
  pluginManager,
  selectModel,
  providers = createDefaultProviders({ env, groq }),
  logger = structuredLogger.asConsoleAdapter(),
  providerTimeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  maxProviderAttempts = 3,
}) {
  return async function callAI(messages, maxTokens = 8192, command = '', modelOverride = '', onChunk = null) {
    const modelSelection = selectModel(command);
    const selectedModelId = modelOverride || modelSelection.modelName || '';
    const selectedModel = getModelById(selectedModelId);
    const ctxTokens = estimateTokens(messages);
    logger.log(`🧠 [ModelSelector] ${modelSelection.reasoning}${modelOverride ? ` | override: ${modelOverride}` : ''}`);
    logger.log(`📦 [ContextSize] ~${ctxTokens} tokens | messages: ${messages.length}`);

    const pluginProviders = pluginManager.getAllAIProviders();
    logger.log(`🔌 Plugin AI Providers: ${pluginProviders.length}`);

    // ── PHASE 1: Pre-flight audit on raw input ────────────────────
    const preAudit = auditContext(messages);

    // ── PHASE 2: Execution Gate ───────────────────────────────────
    let activeMessages = messages;
    let trimApplied    = false;

    if (preAudit.verdict === 'INVALID_TRIM') {
      debugLifecycleLog('EXECUTION_GATE:', {
        event:  'EXECUTION_ABORTED',
        reason: 'INVALID_TRIM_PRE_FLIGHT',
        tokens: preAudit.summary.total_tokens,
      });
      throw new ContextError('Context corruption detected before trim', {
        verdict: preAudit.verdict, tokens: preAudit.summary.total_tokens,
      });
    }

    if (preAudit.verdict === 'OVER_LIMIT') {
      logger.log(`⚠️ Pre-flight OVER_LIMIT (~${preAudit.summary.total_tokens} tokens), applying aggressive trim...`);
      activeMessages = trimContext(messages, Math.floor(TOKEN_BUDGET * 0.7));
      trimApplied    = true;

      const postAudit = auditContext(activeMessages, { originalMessages: messages });
      if (postAudit.verdict === 'INVALID_TRIM') {
        debugLifecycleLog('EXECUTION_GATE:', {
          event:       'EXECUTION_ABORTED',
          reason:      'POST_TRIM_INVALID',
          pre_tokens:  preAudit.summary.total_tokens,
          post_tokens: postAudit.summary.total_tokens,
        });
        throw new ContextError('Context invalid after trim', {
          pre_tokens: preAudit.summary.total_tokens,
          post_tokens: postAudit.summary.total_tokens,
        });
      }
      debugLifecycleLog('EXECUTION_GATE:', {
        event:            'TRIM_APPLIED',
        pre_tokens:       preAudit.summary.total_tokens,
        post_tokens:      postAudit.summary.total_tokens,
        messages_dropped: preAudit.summary.count - postAudit.summary.count,
        verdict:          postAudit.verdict,
      });
    } else {
      debugLifecycleLog('EXECUTION_GATE:', {
        event:  'SAFE_TO_EXECUTE',
        tokens: preAudit.summary.total_tokens,
      });
    }

    // ── PHASE 3: Provider loop ────────────────────────────────────
    const pluginProviderDescriptors = pluginProviders.map((provider, index) => ({
      call: provider.call,
      name: provider.name || provider.id || `Plugin provider ${index}`,
    }));
    const selectedProvider = buildProviderForModel(groq, env, selectedModelId);
    const selectedProviderDescriptors = selectedProvider
      ? [{
          call: selectedProvider,
          name: selectedModel?.label || selectedModelId,
          timeoutMs: MODEL_TIMEOUT_TIERS[selectedModelId] || getProviderTimeoutMs(selectedModel?.label || selectedModelId, selectedModel, providerTimeoutMs),
        }]
      : [];
    const defaultProviderDescriptors = providers.map((provider, index) => ({
      call: provider,
      name: DEFAULT_PROVIDER_NAMES[index] || `provider[${index}]`,
      timeoutMs: getProviderTimeoutMs(DEFAULT_PROVIDER_NAMES[index], null, providerTimeoutMs),
    }));
    const allProviders = [...selectedProviderDescriptors, ...pluginProviderDescriptors, ...defaultProviderDescriptors]
      .slice(0, Math.max(1, maxProviderAttempts));
    const errors       = [];
    let   retryRound   = 0;

    for (let i = 0; i < allProviders.length; i++) {
      const { call: provider, name: providerName, timeoutMs } = allProviders[i];
      const payloadJson = JSON.stringify(activeMessages);
      const debugLog    = {
        step:                  'before_provider_call',
        estimated_tokens:      estimateTokens(activeMessages),
        message_count:         activeMessages.length,
        trim_applied:          trimApplied,
        retry_round:           retryRound,
        provider_index:        i,
        final_payload_size:    payloadJson.length,
        final_estimated_tokens: Math.ceil(payloadJson.length / CHARS_PER_TOKEN),
        decision:              'send',
      };
      debugLifecycleLog('DEBUG_REQUEST_LIFECYCLE:', debugLog);

      // Circuit Breaker — تجاوز OpenRouter لو في cooldown
      if (providerName === 'OpenRouter' && isInCooldown()) {
        const remMs = getRemainingCooldownMs();
        errors.push(`provider[${i}]: circuit open (cooldown ${Math.ceil(remMs / 1000)}s remaining)`);
        hudLog('warn', `OpenRouter circuit breaker active — retry in ${Math.ceil(remMs / 1000)}s`);
        hudProviderUpdate(providerName, 'cooldown', { cooldownMs: remMs });
        continue;
      }

      try {
        const startedAt = Date.now();
        const result = await withTimeout(
          () => provider(activeMessages, Math.min(maxTokens, TOKEN_BUDGET), onChunk),
          timeoutMs || providerTimeoutMs,
          `provider[${i}]`,
        );
        if (result) {
          const latency = Date.now() - startedAt;
          hudLog('ok', `AI response via ${providerName} - ${latency}ms`);
          hudProviderUpdate(providerName, 'active', { latency });
          recordSuccess(providerName, latency, selectedModelId || null);
          return result;
        }
      } catch (error) {
        const outcome = await handleProviderError({
          activeMessages,
          debugLog,
          error,
          errors,
          logger,
          providerName,
          providerIndex: i,
          retryRound,
        });
        activeMessages = outcome.activeMessages;
        retryRound = outcome.retryRound;
        trimApplied = trimApplied || Boolean(outcome.trimApplied);
        if (outcome.action === 'continue') continue;
      }
    }

    const summary = errors.join(' | ');
    logger.error(`All providers failed — task: ${command?.slice(0, 60) || '(none)'} | errors: ${summary}`);
    recordFailure('all', new Error(summary));
    throw new ProviderError(`All AI providers failed: ${summary}`, {
      providerName: 'all',
      context: { errors, command: command?.slice(0, 80) },
    });
  };
}

module.exports = {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  OPENROUTER_PROVIDER_TIMEOUT_MS,
  TOKEN_BUDGET,
  createAIService,
  createDefaultProviders,
  estimateTokens,
  trimContext,
  withTimeout,
};
