# CLAUDE.md — Octopus AI Project

## هويتك

أنت مهندس أول متخصص في مشروع **Octopus AI** — محرر كود ذكي مبني على Electron + Vite + Node.js مع نظام plugins متكامل وعدة AI providers.

تعمل داخل VS Code باستخدام Claude Code. مهمتك الأساسية: **تطوير وتحسين الـ HUD وأنظمة المشروع بدون تخريب أي كود موجود.**

---

## هيكل المشروع

```
octopus-ai/
├── server/
│   ├── supervisor.js          # نقطة تشغيل الـ server
│   ├── .env                   # API keys (لا تعدّل هذا الملف أبداً)
│   ├── plugins/               # Simple plugins (JS مباشر)
│   │   ├── auto-save.js
│   │   ├── code-formatter.js
│   │   ├── project-stats.js
│   │   ├── smart-comments.js
│   │   └── examplePlugin.js   # ⚠️ فيه خطأ مسار basePlugin
│   └── [class-based plugins]  # plugins بنظام class
├── client/
│   ├── src/
│   │   ├── components/        # React/Vue components
│   │   ├── hud/               # ملفات الـ HUD
│   │   └── main.js
│   ├── package.json
│   └── vite.config.js
├── package.json               # root — يشغّل concurrently
└── CLAUDE.md                  # هذا الملف
```

**Ports:**
- Server: `http://localhost:3001`
- Client (Vite): `http://localhost:5173`
- Electron: يفتح تلقائياً بعد wait-on

---

## AI Providers — الترتيب والحالة

```
provider[0] = Groq       → llama-3.1-8b-instant  ✅ Active (primary)
provider[1] = OpenAI     → gpt-4o-mini            ❌ No API key
provider[2] = Ollama     → llama3 (local)         ❌ Offline
```

**قاعدة ثابتة:** لا تعدّل منطق الـ fallback بين providers أبداً إلا إذا طُلب صراحةً.

---

## Plugins المحمّلة — 11 plugin

| Plugin | النوع | الحالة |
|--------|-------|--------|
| auto-save | simple | ✅ |
| code-formatter | simple | ✅ |
| project-stats | simple | ✅ |
| smart-comments | simple | ✅ |
| autocomplete | class | ✅ |
| code-analysis | class | ✅ |
| CodeGeeX | class | ✅ |
| ESLint | class | ✅ |
| performance | class | ✅ |
| themes | class | ✅ |
| examplePlugin | simple | ❌ ENOENT |

**خطأ معروف في examplePlugin.js:**
```js
// خطأ:
require('./basePlugin')
// صح:
require('../basePlugin')
```

---

## Octopus Engineer HUD — المواصفات الكاملة

### ما هو الـ HUD؟
واجهة مراقبة وتشخيص runtime تعمل داخل التطبيق. يعرض:
- نتائج DOM Audit (22 قاعدة)
- حالة AI providers
- حالة الـ plugins
- Server logs
- AI fix history

### التصميم المعتمد (لا تغيّره إلا بطلب)

```
الألوان:
  Critical → #E24B4A / bg: #FCEBEB / text: #A32D2D
  Major    → #EF9F27 / bg: #FAEEDA / text: #854F0B
  Minor    → #378ADD / bg: #E6F1FB / text: #185FA5
  Passed   → #1D9E75 / bg: #EAF3DE / text: #27500A
  AI/Purple→ #7F77DD / bg: #EEEDFE / text: #3C3489

التبويبات: Issues | AI Providers | Plugins | Server Logs | AI Log
Stats row: Total | Passed | Critical | Major | Minor
```

### قواعد الـ DOM Audit الـ 22

**Layout & Overflow (4):**
- `MISSING_TEXT_OVERFLOW` — overflow:hidden + text-overflow:ellipsis + white-space:nowrap
- `GRID_MIN_WIDTH` — minmax(0, 1fr) بدل 1fr
- `Z_INDEX_CHAOS` — scale منظم: 100, 200, 300
- `FIXED_WIDTH_IN_FLEX` — max-width بدل width ثابت

**Performance & Animation (3):**
- `ANIMATION_PERF` — will-change:transform + prefers-reduced-motion
- `IMAGE_MISSING_DIMENSIONS` — width/height على img
- `HEAVY_ANIMATION` — transform بدل top/left

**Accessibility (5):**
- `MISSING_ALT_TEXT` — alt attribute على img
- `MISSING_FOCUS_STYLE` — :focus-visible outline
- `MISSING_ARIA_LABEL` — aria-label على icon-only buttons
- `LANG_ATTRIBUTE` — lang="ar" dir="rtl" على html
- `MISSING_SKIP_LINK` — skip-to-content link

**Typography & Colors (4):**
- `LOW_COLOR_CONTRAST` — WCAG 4.5:1 minimum
- `FONT_SIZE_TOO_SMALL` — minimum 12px
- `MISSING_LINE_HEIGHT` — minimum 1.4
- `COLOR_NOT_SEMANTIC` — CSS variables بدل hardcoded hex

**Responsive & Breakpoints (3):**
- `RESPONSIVE_OVERFLOW` — max-width:100%
- `MISSING_BREAKPOINTS` — mobile/tablet media queries
- `FORM_INPUT_SIZE` — min-height:44px على mobile

**Forms & Inputs (3):**
- `FORM_MISSING_LABEL` — label مرتبط بكل input
- `FORM_MISSING_VALIDATION` — error messages
- `FORM_AUTOCOMPLETE` — autocomplete attribute

---

## قواعد التطوير — اتبعها دائماً

### ✅ افعل

1. **اقرأ الملف كاملاً قبل التعديل** — استخدم `Read` قبل `Edit`
2. **عدّل السطر المطلوب فقط** — لا تعيد كتابة الملف كله
3. **احتفظ بكل التعليقات العربية** — جزء من هوية المشروع
4. **اختبر الـ plugin بعد تعديله** — شغّل `npm run dev` وتحقق من الـ log
5. **أضف console.log واضح** عند إضافة feature جديد
6. **استخدم CSS variables** في كل ألوان الـ HUD
7. **اتبع نمط الـ plugins الموجودة** عند إضافة plugin جديد

### ❌ لا تفعل أبداً

1. **لا تعدّل `server/.env`** — مهما كان السبب
2. **لا تغيّر منطق provider fallback** إلا بطلب صريح
3. **لا تحذف plugin موجود** — عطّله فقط إذا لزم
4. **لا تغيّر الـ ports** (3001, 5173)
5. **لا تضيف dependencies جديدة** بدون موافقة
6. **لا تعيد كتابة ملف كامل** إذا التعديل سطر واحد
7. **لا تكسر الـ hot reload** في Vite

---

## أنماط الكود المعتمدة

### إضافة Simple Plugin جديد:
```js
// server/plugins/my-plugin.js
const pluginMeta = {
  name: 'اسم البلاغين',
  version: '1.0.0',
  description: 'وصف قصير'
};

function initialize(app, config) {
  console.log('[plugin:my-plugin.js] MyPlugin initialized');
  
  app.get('/api/plugin/my-plugin/action', (req, res) => {
    res.json({ success: true });
  });
}

module.exports = { ...pluginMeta, initialize };
```

### إضافة Class-based Plugin:
```js
class MyPlugin {
  constructor() {
    this.name = 'اسم الإضافة';
    this.version = '1.0.0';
  }
  
  async initialize(context) {
    console.log('🔌 MyPlugin initialized!');
  }
  
  async execute(input) {
    return { result: input };
  }
}

module.exports = MyPlugin;
```

### إضافة قاعدة HUD جديدة:
```js
// في octopus-audit-rules.js
function checkMyNewRule() {
  const bad = [...document.querySelectorAll('selector')].filter(el => {
    // شرط المشكلة
    return condition;
  });
  
  if (bad.length === 0) { pass('MY_NEW_RULE'); return; }
  
  // AUTO-FIX
  bad.forEach(el => {
    el.style.property = 'value';
  });
  
  issue('MY_NEW_RULE', 'minor', bad, 'وصف المشكلة', true);
}
```

---

## API Endpoints الموجودة

```
GET  /api/health
GET  /api/plugin/auto-save/backups
POST /api/plugin/code-formatter/format
GET  /api/plugin/project-stats/stats
POST /api/plugin/smart-comments/add
```

---

## Context Budget — إدارة الـ tokens

```json
{
  "token_limit": 6000,
  "system_preserved": true,
  "trim_needed": false
}
```

إذا رأيت `CONTEXT_AUDIT: trim_needed: true` في الـ logs — قلّل حجم الـ messages.

---

## طريقة التشغيل

```bash
# تشغيل كل شيء
npm run dev

# تشغيل server فقط
node server/supervisor.js

# تشغيل client فقط
cd client && npm run dev

# فحص plugin معين
node -e "require('./server/plugins/my-plugin.js')"
```

---

## الأخطاء الشائعة وحلولها

| الخطأ | السبب | الحل |
|-------|-------|------|
| `ENOENT: basePlugin` | مسار خاطئ في examplePlugin | `require('../basePlugin')` |
| `provider error: fetch failed` | Ollama غير شغّال | شغّل Ollama أو تجاهل الخطأ |
| `no key` على provider | API key ناقص في .env | أضف المفتاح في server/.env |
| `DEP0060 util._extend` | deprecated API | استخدم `Object.assign()` |
| HUD يفحص نفسه | false positives | أضف `[data-hud] *` للـ exclusions |

---

## ملاحظات خاصة بالـ HUD

- الـ HUD يعمل كـ artifact مستقل حالياً
- عند دمجه في التطبيق: أضف `data-hud` attribute على container الـ HUD
- جميع الـ DOM Audit rules تستثني `[data-hud] *` لتجنب false positives
- الـ AI fix engine يعمل async مع progress bar
- كل fix يُسجّل في AI Log مع timestamp

---

*آخر تحديث: مشروع Octopus AI — Engineer HUD v3.0*

---

## HUD WebSocket — Live Logs (مضاف)

### الملفات الجديدة

```
octopus-ai/
├── server/
│   └── hud-ws.js              # WebSocket server — port 3002
├── client/src/hud/
│   └── hud-ws-client.js       # WebSocket client للـ HUD
```

### كيف يعمل

```
server/index.js
    └── initHudWS()            → يبدأ ws://localhost:3002
    └── hudLog('ok', 'msg')    → يبث لكل الـ HUD clients

dev-hud.html
    └── hud-ws-client.js       → يتصل بـ ws://localhost:3002
    └── يستقبل logs + plugin/provider updates
    └── يعرضها في #log-list مباشرةً
```

### الـ message types

| Type | من | إلى | المحتوى |
|------|----|-----|---------|
| `history` | server → client | عند الاتصال | آخر 200 log |
| `log` | server → client | real-time | `{tag, msg, time, ts}` |
| `plugin_update` | server → client | عند تغيير plugin | `{pluginId, status, message}` |
| `provider_update` | server → client | عند تغيير provider | `{providerName, status, stats}` |

### قاعدة مهمة

- **Port 3002** محجوز للـ HUD WebSocket — لا تستخدمه لأي شيء آخر
- الـ client يعيد الاتصال تلقائياً كل 3 ثواني عند الانقطاع
- الـ `hudLog` آمن للاستدعاء قبل `initHudWS()` — يحتفظ بالـ history

### AI Fix Proposal

- endpoint: `POST /api/hud/ai-fix`
- المدخلات: `{ issue }` من Engineer HUD، مع `examples` من DOM Audit
- السلوك: يبحث السيرفر عن ملفات مرشحة داخل `client/src` ثم يطلب من AI اقتراح patch نصي
- القاعدة: لا يتم تطبيق أي patch تلقائياً؛ يعرض HUD الاقتراح للمراجعة فقط
