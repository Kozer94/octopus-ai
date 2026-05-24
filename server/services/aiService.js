function createDefaultProviders({ groq }) {
  return [
    // Groq - llama 3.3 70b
    async (messages, maxTokens) => {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.5,
        max_tokens: Math.min(maxTokens, 4096),
      });
      return completion.choices[0].message.content;
    },
    // Groq - llama 3.1 8b
    async (messages, maxTokens) => {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages,
        temperature: 0.5,
        max_tokens: Math.min(maxTokens, 4096),
      });
      return completion.choices[0].message.content;
    },
    // Groq - llama 3 70b
    async (messages, maxTokens) => {
      const completion = await groq.chat.completions.create({
        model: 'llama3-70b-8192',
        messages,
        temperature: 0.5,
        max_tokens: Math.min(maxTokens, 4096),
      });
      return completion.choices[0].message.content;
    },
    // Mistral
    async (messages, maxTokens) => {
      if (!process.env.MISTRAL_API_KEY) throw new Error('no key');
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'mistral-small-latest', messages, max_tokens: maxTokens }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.choices[0].message.content;
    },
    // Cohere
    async (messages, maxTokens) => {
      if (!process.env.COHERE_API_KEY) throw new Error('no key');
      const res = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.COHERE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'command-r-plus', messages, max_tokens: maxTokens }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data.message.content[0].text;
    },
    // Together AI
    async (messages, maxTokens) => {
      if (!process.env.TOGETHER_API_KEY) throw new Error('no key');
      const res = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', messages, max_tokens: maxTokens }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.choices[0].message.content;
    },
    // OpenRouter
    async (messages, maxTokens) => {
      if (!process.env.OPENROUTER_API_KEY) throw new Error('no key');
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'meta-llama/llama-3.3-70b-instruct:free', messages, max_tokens: maxTokens }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.choices[0].message.content;
    },
    // Gemini
    async (messages, _maxTokens) => {
      if (!process.env.GEMINI_API_KEY) throw new Error('no key');
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const result = await model.generateContent(prompt);
      return result.response.text();
    },
  ];
}

function createAIService({
  groq,
  pluginManager,
  selectModel,
  providers = createDefaultProviders({ groq }),
  logger = console,
}) {
  return async function callAI(messages, maxTokens = 8192, command = '') {
    const modelSelection = selectModel(command);
    logger.log(`🧠 Model Selection: ${modelSelection.reasoning}`);

    const pluginProviders = pluginManager.getAllAIProviders();
    logger.log(`🔌 Plugin AI Providers: ${pluginProviders.length}`);

    const allProviders = [...pluginProviders.map(p => p.call), ...providers];
    const errors = [];

    for (let i = 0; i < allProviders.length; i++) {
      const provider = allProviders[i];
      try {
        const result = await provider(messages, maxTokens);
        if (result) return result;
      } catch (error) {
        const msg = error.message || String(error);
        if (msg === 'no key') {
          errors.push(`provider[${i}]: no key`);
          continue;
        }
        const is429 = error.status === 429 || error.statusCode === 429 ||
          msg.includes('Rate limit') || msg.includes('rate limit') ||
          msg.includes('429') || msg.includes('Too Many Requests') ||
          msg.includes('quota') || msg.includes('Quota');
        if (is429) {
          logger.log(`⚠️ provider[${i}] rate limited, trying next...`);
          errors.push(`provider[${i}]: rate limited`);
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        logger.log(`⚠️ provider[${i}] error: ${msg}`);
        errors.push(`provider[${i}]: ${msg}`);
      }
    }

    const summary = errors.join(' | ');
    logger.error(`❌ All providers failed: ${summary}`);
    throw new Error(`All AI providers failed: ${summary}`);
  };
}

module.exports = {
  createAIService,
  createDefaultProviders,
};
