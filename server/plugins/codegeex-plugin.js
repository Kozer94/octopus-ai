const BasePlugin = require('./basePlugin');

class CodeGeeXPlugin extends BasePlugin {
  constructor() {
    super({
      id: 'codegeex-plugin',
      name: 'إضافة CodeGeeX',
      version: '1.0.0',
      description: 'مزود AI CodeGeeX لتوليد الكود',
      author: 'Octopus AI Team',
    });
  }

  async initialize() {
    await super.initialize();
    
    // تسجيل مزود AI
    this.registerAIProvider({
      name: 'CodeGeeX',
      id: 'codegeex',
      call: this.callCodeGeeX.bind(this),
    });
    
    console.log('🤖 CodeGeeX Plugin initialized!');
    return true;
  }

  async callCodeGeeX(messages, maxTokens) {
    const apiKey = process.env.CODEGEEX_API_KEY;
    if (!apiKey) {
      throw new Error('no key');
    }

    try {
      const response = await fetch('https://api.codegeex.com/v3/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'codegeex-4',
          messages: messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw { status: 429, message: 'Rate limit exceeded' };
        }
        throw new Error(`CodeGeeX API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('CodeGeeX error:', error);
      throw error;
    }
  }

  async shutdown() {
    console.log('👋 CodeGeeX Plugin shutting down...');
    await super.shutdown();
    return true;
  }
}

module.exports = CodeGeeXPlugin;