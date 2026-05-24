/**
 * Base Plugin Class
 * الفئة الأساسية التي يجب أن ترث منها جميع الإضافات
 */

class BasePlugin {
  constructor(config = {}) {
    this.id = config.id || 'unknown-plugin';
    this.name = config.name || 'Unknown Plugin';
    this.version = config.version || '1.0.0';
    this.description = config.description || '';
    this.author = config.author || '';
    this.enabled = config.enabled !== false;
    this.hooks = {};
    this.middleware = [];
    this.commands = [];
    this.aiProviders = []; // للمزودين AI
  }

  /**
   * تهيئة الإضافة
   */
  async initialize() {
    console.log(`🔌 Initializing plugin: ${this.name} v${this.version}`);
    return true;
  }

  /**
   * إيقاف الإضافة
   */
  async shutdown() {
    console.log(`🔌 Shutting down plugin: ${this.name}`);
    return true;
  }

  /**
   * تسجيل hook
   */
  registerHook(hookName, callback) {
    if (!this.hooks[hookName]) {
      this.hooks[hookName] = [];
    }
    this.hooks[hookName].push(callback);
  }

  /**
   * تنفيذ hook
   */
  async executeHook(hookName, data = {}) {
    if (!this.hooks[hookName]) return data;
    
    let result = data;
    for (const callback of this.hooks[hookName]) {
      try {
        result = await callback(result);
      } catch (error) {
        console.error(`Hook error in ${this.name}:`, error);
      }
    }
    return result;
  }

  /**
   * إضافة middleware
   */
  addMiddleware(middlewareFn) {
    this.middleware.push(middlewareFn);
  }

  /**
   * تنفيذ middleware
   */
  async executeMiddleware(data, direction = 'in') {
    let result = data;
    for (const middleware of this.middleware) {
      try {
        result = await middleware(result, direction);
      } catch (error) {
        console.error(`Middleware error in ${this.name}:`, error);
      }
    }
    return result;
  }

  /**
   * تسجيل أمر مخصص
   */
  registerCommand(command) {
    this.commands.push(command);
  }

  /**
   * تسجيل مزود AI
   */
  registerAIProvider(provider) {
    this.aiProviders.push(provider);
  }

  /**
   * الحصول على مزودين AI
   */
  getAIProviders() {
    return this.aiProviders;
  }

  /**
   * الحصول على معلومات الإضافة
   */
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      description: this.description,
      author: this.author,
      enabled: this.enabled,
      hooks: Object.keys(this.hooks),
      commands: this.commands.map(c => c.name),
      aiProviders: this.aiProviders.length,
    };
  }

  /**
   * تفعيل الإضافة
   */
  async enable() {
    this.enabled = true;
    await this.initialize();
    return true;
  }

  /**
   * تعطيل الإضافة
   */
  async disable() {
    this.enabled = false;
    await this.shutdown();
    return true;
  }
}

module.exports = BasePlugin;
