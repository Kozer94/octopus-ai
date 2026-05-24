/**
 * Example Plugin
 * إضافة مثال توضح كيفية إنشاء إضافة جديدة
 */

const BasePlugin = require('./basePlugin');

class ExamplePlugin extends BasePlugin {
  constructor() {
    super({
      id: 'example-plugin',
      name: 'إضافة مثال',
      version: '1.0.0',
      description: 'إضافة مثال توضح كيفية عمل نظام الإضافات',
      author: 'Octopus AI Team',
    });
  }

  async initialize() {
    await super.initialize();
    
    // تسجيل hooks
    this.registerHook('before-command', this.beforeCommand.bind(this));
    this.registerHook('after-command', this.afterCommand.bind(this));
    
    // تسجيل أمر مخصص
    this.registerCommand({
      name: 'hello',
      description: 'يقول مرحباً',
      handler: this.helloCommand.bind(this),
    });
    
    console.log('🎉 Example Plugin initialized successfully!');
    return true;
  }

  async beforeCommand(data) {
    console.log('🔌 Example Plugin: Before command hook');
    // تعديل البيانات قبل تنفيذ الأمر
    return data;
  }

  async afterCommand(data) {
    console.log('🔌 Example Plugin: After command hook');
    // معالجة البيانات بعد تنفيذ الأمر
    return data;
  }

  async helloCommand(args) {
    return 'مرحباً! أنا إضافة مثال 🎉';
  }

  async shutdown() {
    console.log('👋 Example Plugin shutting down...');
    await super.shutdown();
    return true;
  }
}

module.exports = ExamplePlugin;
