# نظام الإضافات (Plugins System)

## نظرة عامة

نظام الإضافات في Octopus AI يسمح لك بتوسيع وظائف التطبيق دون تعديل الكود الأساسي. يمكنك إنشاء إضافات مخصصة لإضافة ميزات جديدة، تعديل السلوك الحالي، أو دمج مع خدمات خارجية.

## البنية الأساسية

### 1. BasePlugin

الفئة الأساسية التي يجب أن ترث منها جميع الإضافات. توفر الوظائف الأساسية:

- `initialize()` - تهيئة الإضافة
- `shutdown()` - إيقاف الإضافة
- `registerHook()` - تسجيل hook
- `executeHook()` - تنفيذ hook
- `enable()` - تفعيل الإضافة
- `disable()` - تعطيل الإضافة

### 2. PluginManager

مدير الإضافات المسؤول عن:
- تحميل وتفريغ الإضافات
- إدارة hooks
- تنفيذ hooks عبر الإضافات
- توفير إحصائيات

## إنشاء إضافة جديدة

### الخطوة 1: إنشاء ملف الإضافة

```javascript
const BasePlugin = require('./basePlugin');

class MyPlugin extends BasePlugin {
  constructor() {
    super({
      id: 'my-plugin',
      name: 'إضافتي',
      version: '1.0.0',
      description: 'وصف الإضافة',
      author: 'اسمك',
    });
  }

  async initialize() {
    await super.initialize();
    
    // تسجيل hooks
    this.registerHook('before-command', this.beforeCommand.bind(this));
    
    console.log('✅ My Plugin initialized!');
    return true;
  }

  async beforeCommand(data) {
    console.log('🔌 My Plugin: Before command');
    return data;
  }

  async shutdown() {
    console.log('👋 My Plugin shutting down...');
    await super.shutdown();
    return true;
  }
}

module.exports = MyPlugin;
```

### الخطوة 2: وضع الملف في مجلد plugins

ضع ملف الإضافة في `server/plugins/`

### الخطوة 3: إعادة تحميل الإضافات

استخدم endpoint API:
```
POST /api/plugins/reload
```

## Hooks المتاحة

### before-command
يُنفذ قبل تنفيذ أي أمر AI.

```javascript
this.registerHook('before-command', async (data) => {
  // تعديل البيانات قبل التنفيذ
  return data;
});
```

### after-command
يُنفذ بعد تنفيذ أي أمر AI.

```javascript
this.registerHook('after-command', async (data) => {
  // معالجة النتائج بعد التنفيذ
  return data;
});
```

## API Endpoints

### الحصول على جميع الإضافات
```
GET /api/plugins
```

### الحصول على إضافة محددة
```
GET /api/plugins/:id
```

### تفعيل إضافة
```
POST /api/plugins/:id/enable
```

### تعطيل إضافة
```
POST /api/plugins/:id/disable
```

### الحصول على إحصائيات
```
GET /api/plugins/stats
```

### إعادة تحميل الإضافات
```
POST /api/plugins/reload
```

## أمثلة على الاستخدام

### إضافة logging مخصص

```javascript
class LoggingPlugin extends BasePlugin {
  async initialize() {
    await super.initialize();
    this.registerHook('before-command', this.logCommand.bind(this));
  }

  async logCommand(data) {
    console.log(`📝 Command: ${data.command}`);
    return data;
  }
}
```

### إضافة تحليل إضافي

```javascript
class AnalysisPlugin extends BasePlugin {
  async initialize() {
    await super.initialize();
    this.registerHook('after-command', this.analyzeResult.bind(this));
  }

  async analyzeResult(data) {
    // تحليل النتيجة وإضافة معلومات إضافية
    data.analysis = 'تحليل مخصص';
    return data;
  }
}
```

## أفضل الممارسات

1. **استخدم معرفات فريدة**: تأكد أن `id` فريد لكل إضافة
2. **معالجة الأخطاء**: استخدم try-catch في جميع دوالك
3. **توثيق جيد**: أضف تعليقات واضحة لكل دالة
4. **اختبار شامل**: اختبر إضافتك قبل نشرها
5. **تحديث الإصدار**: استخدم semantic versioning

## القيود الحالية

- الإضافات محملة فقط من مجلد `server/plugins/`
- لا يوجد marketplace للإضافات حالياً
- لا يوجد تحقق من الأمان للإضافات

## المستقبل

- [ ] إضافة marketplace للإضافات
- [ ] إضافة تحقق من الأمان
- [ ] دعم الإضافات من npm
- [ ] UI لإدارة الإضافات
- [ ] إضافة sandbox للإضافات
