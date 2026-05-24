require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const pathModule = require('path');
const { exec, execFile, spawn } = require('child_process');
const chokidar = require('chokidar');
const {
  ensureProjectMap,
  ensureProjectMapWatcher,
  getProjectContextForTask,
  summarizeProjectMap,
} = require('./projectMapEngine');
const {
  runBrainController,
  previewBrainController,
} = require('./brainController');
const {
  validateProjectBinding,
} = require('./validatorLayer');
const { selectModel } = require('./modelSelector');
const pluginManager = require('./plugins/pluginManager');
const marketplace = require('./plugins/marketplace');

// Simple Plugin System - Module Exports Style
const pluginsDir = path.join(__dirname, 'plugins');
const pluginsStatePath = path.join(pluginsDir, 'plugins.json');
const npmPackagesPath = path.join(pluginsDir, 'npm-packages.json');
let loadedPlugins = [];
let pluginsState = {};
let installedNpmPackages = {};
const packageIconCache = new Map();

async function getPackageIcon(packageName) {
  if (!packageName) return null;
  if (packageIconCache.has(packageName)) return packageIconCache.get(packageName);

  try {
    const reg = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`);
    const data = await reg.json();

    const homepage = String(data.homepage || '')
      .replace(/^git\+/, '')
      .replace(/\.git$/, '')
      .replace(/^git:\/\//, 'https://')
      .replace(/^git@github.com:/, 'https://github.com/');

    if (homepage.startsWith('http') && !homepage.includes('github.com')) {
      const domain = new URL(homepage).hostname.replace(/^www\./, '');
      if (!['npmjs.com', 'npm.im'].includes(domain)) {
        const icon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        packageIconCache.set(packageName, icon);
        return icon;
      }
    }

    const repositoryUrl = typeof data.repository === 'string'
      ? data.repository
      : data.repository?.url;
    const bugsUrl = typeof data.bugs === 'string' ? data.bugs : data.bugs?.url;
    const sources = [repositoryUrl, data.homepage, bugsUrl].filter(Boolean).join(' ');
    const githubMatch = sources.match(/github\.com[/:]([^/\\s.]+)\/([^/\s.]+)/i);

    if (githubMatch) {
      const icon = `https://avatars.githubusercontent.com/${githubMatch[1]}?s=64`;
      packageIconCache.set(packageName, icon);
      return icon;
    }
  } catch { }

  packageIconCache.set(packageName, null);
  return null;
}

// Load plugins state from JSON
function loadPluginsState() {
  try {
    if (fs.existsSync(pluginsStatePath)) {
      pluginsState = JSON.parse(fs.readFileSync(pluginsStatePath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading plugins state:', error);
    pluginsState = {};
  }
}

// Save plugins state to JSON
function savePluginsState() {
  try {
    fs.writeFileSync(pluginsStatePath, JSON.stringify(pluginsState, null, 2));
  } catch (error) {
    console.error('Error saving plugins state:', error);
  }
}

// Load installed npm packages
function loadNpmPackages() {
  try {
    if (fs.existsSync(npmPackagesPath)) {
      installedNpmPackages = JSON.parse(fs.readFileSync(npmPackagesPath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading npm packages:', error);
    installedNpmPackages = {};
  }
}

// Save installed npm packages
function saveNpmPackages() {
  try {
    fs.writeFileSync(npmPackagesPath, JSON.stringify(installedNpmPackages, null, 2));
  } catch (error) {
    console.error('Error saving npm packages:', error);
  }
}

// Load simple plugins (module.exports style)
function loadSimplePlugins() {
  loadPluginsState();
  const pluginFiles = fs.readdirSync(pluginsDir)
    .filter(f => f.endsWith('.js') && 
              f !== 'basePlugin.js' && 
              f !== 'pluginManager.js' && 
              f !== 'marketplace.js' &&
              !f.includes('plugin.js') &&
              f !== 'smart-comments.js' &&
              f !== 'auto-save.js' &&
              f !== 'code-formatter.js' &&
              f !== 'project-stats.js'); // Skip new simple plugins for now

  for (const file of pluginFiles) {
    try {
      const pluginPath = path.join(pluginsDir, file);
      const plugin = require(pluginPath);
      
      // Apply saved state
      if (pluginsState[plugin.id]) {
        plugin.enabled = pluginsState[plugin.id].enabled;
      }
      
      loadedPlugins.push(plugin);
      console.log(`🔌 Loaded plugin: ${plugin.name} (${plugin.id}) - ${plugin.enabled ? 'enabled' : 'disabled'}`);
      
      // Register plugin routes
      if (plugin.routes && Array.isArray(plugin.routes)) {
        for (const route of plugin.routes) {
          const fullPath = route.path;
          const handler = async (req, res) => {
            try {
              await route.handler(req, res);
            } catch (error) {
              res.status(500).json({ success: false, error: error.message });
            }
          };
          
          if (route.method === 'GET') app.get(fullPath, handler);
          else if (route.method === 'POST') app.post(fullPath, handler);
          else if (route.method === 'PUT') app.put(fullPath, handler);
          else if (route.method === 'DELETE') app.delete(fullPath, handler);
          
          console.log(`   ↳ Registered route: ${route.method} ${fullPath}`);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to load plugin ${file}:`, error.message);
    }
  }
}

// Get enabled plugins
function getEnabledPlugins() {
  return loadedPlugins.filter(p => p.enabled);
}

// Execute hook across all enabled plugins
async function executeHook(hookName, data) {
  const enabled = getEnabledPlugins();
  let result = data;
  
  for (const plugin of enabled) {
    if (plugin.hooks && plugin.hooks[hookName]) {
      try {
        result = await plugin.hooks[hookName](result);
      } catch (error) {
        console.error(`Hook error in ${plugin.name} (${hookName}):`, error.message);
      }
    }
  }
  
  return result;
}

const app = express();
const PORT = process.env.PORT || 3001;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exitCode = 1;
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exitCode = 1;
});

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // حد أقصى 100 طلب لكل 15 دقيقة
  message: 'طلبات كثيرة جداً، الرجاء المحاولة لاحقاً',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting أقوى للـ endpoints الثقيلة (AI)
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 30, // حد أقصى 30 طلب AI لكل 15 دقيقة
  message: 'طلبات AI كثيرة جداً، الرجاء المحاولة لاحقاً',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json());
app.use(limiter);

// تخزين تاريخ المحادثات لكل جلسة
const sessions = {};
let runningProcess = null;
let watcher = null;
let watchClients = [];

const PROVIDERS = [
  // Groq - llama 3.3 70b (أقوى)
  async (messages, maxTokens) => {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages, temperature: 0.5, max_tokens: Math.min(maxTokens, 4096),
    });
    return completion.choices[0].message.content;
  },
  // Groq - llama 3.1 8b (سريع)
  async (messages, maxTokens) => {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages, temperature: 0.5, max_tokens: Math.min(maxTokens, 4096),
    });
    return completion.choices[0].message.content;
  },
  // Groq - llama 3 70b (بديل)
  async (messages, maxTokens) => {
    const completion = await groq.chat.completions.create({
      model: 'llama3-70b-8192',
      messages, temperature: 0.5, max_tokens: Math.min(maxTokens, 4096),
    });
    return completion.choices[0].message.content;
  },
  // Mistral
  async (messages, maxTokens) => {
    if (!process.env.MISTRAL_API_KEY) throw new Error('no key');
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
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
      headers: { 'Authorization': `Bearer ${process.env.COHERE_API_KEY}`, 'Content-Type': 'application/json' },
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
      headers: { 'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`, 'Content-Type': 'application/json' },
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
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
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

async function callAI(messages, maxTokens = 8192, command = '') {
  // استخدام Model Selector لاختيار النموذج المناسب
  const modelSelection = selectModel(command);
  console.log(`🧠 Model Selection: ${modelSelection.reasoning}`);
  
  // الحصول على مزودين AI من الإضافات
  const pluginProviders = pluginManager.getAllAIProviders();
  console.log(`🔌 Plugin AI Providers: ${pluginProviders.length}`);
  
  // دمج مزودين الإضافات مع PROVIDERS الأساسية
  const allProviders = [...pluginProviders.map(p => p.call), ...PROVIDERS];
  
  const errors = [];
  for (let i = 0; i < allProviders.length; i++) {
    const provider = allProviders[i];
    try {
      const result = await provider(messages, maxTokens);
      if (result) return result;
    } catch (error) {
      const msg = error.message || String(error);
      if (msg === 'no key') { errors.push(`provider[${i}]: no key`); continue; }
      const is429 = error.status === 429 || error.statusCode === 429 ||
        msg.includes('Rate limit') || msg.includes('rate limit') ||
        msg.includes('429') || msg.includes('Too Many Requests') ||
        msg.includes('quota') || msg.includes('Quota');
      if (is429) {
        console.log(`⚠️ provider[${i}] rate limited, trying next...`);
        errors.push(`provider[${i}]: rate limited`);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      console.log(`⚠️ provider[${i}] error: ${msg}`);
      errors.push(`provider[${i}]: ${msg}`);
      continue;
    }
  }
  const summary = errors.join(' | ');
  console.error(`❌ All providers failed: ${summary}`);
  throw new Error(`All AI providers failed: ${summary}`);
}

function isReportCommand(command = '') {
  return /فحص|تقرير|تقريري|حلل|تحليل|وثق|توثيق|ملخص|ملخّص|report|analyze|analysis|documentation|markdown|\bmd\b/i
    .test(String(command || ''));
}

const SYSTEM_PROMPT = `أنت أخطبوط 🐙 — مساعد ذكاء اصطناعي متخصص في بناء المشاريع البرمجية.

## قاعدة ذهبية:
- إنشاء مشروع Laravel = <terminal>composer create-project laravel/laravel .</terminal>
- إنشاء مشروع React = <terminal>npx create-react-app .</terminal>
- إنشاء مشروع Next.js = <terminal>npx create-next-app .</terminal>
- لا تكتب محتوى composer.json أو package.json يدوياً أبداً عند إنشاء مشروع جديد

## قواعد صارمة:

### لتشغيل أمر في terminal:
<terminal>npm install</terminal>
<terminal>composer create-project laravel/laravel .</terminal>
<terminal>php artisan migrate</terminal>

### لإنشاء أو تعديل ملف:
<file path="routes/web.php">
<?php
Route::get('/', function () {
    return view('welcome');
});
</file>

### مهم جداً:
- إنشاء مشروع = <terminal>composer create-project...</terminal> وليس <file>
- كل ملف له وسم <file path="..."> خاص به
- لا تضع كل شيء في ملف واحد
- الأوامر في <terminal> فقط
- الكود في <file path="..."> فقط
- تجيب بالعربية دائماً
- استخدم أفضل الممارسات البرمجية
- اكتب كود نظيف وقابل للصيانة
- أضف تعليقات عند الحاجة
- تأكد من اتباع معايير المشروع الموجود

### عند التعديل:
- افهم سياق المشروع أولاً
- احافظ على نمط الكود الموجود
- لا تعدل ملفات لا علاقة لها بالمهمة
- استخدم المسموحات المحددة في Brain Controller
- تجنب تعديل الملفات الحساسة (.env, package.json, main.js, preload.js)

### عند إنشاء ملفات جديدة:
- استخدم مسارات منطقية ومنظمة
- اتبع هيكل المشروع الموجود
- أنشئ المجلدات اللازمة إذا لم تكن موجودة
- استخدم التسميات المناسبة

### عند حل المشاكل:
- حلل المشكلة بعمق قبل اقتراح الحل
- اشرح السبب الجذري للمشكلة
- قدم حلولاً متعددة إذا أمكن
- تأكد من أن الحل لا يسبب مشاكل جديدة

### عند التحليل:
- ركز على الملفات المهمة والمرتبطة
- استخرج الأنماط والممارسات المستخدمة
- حدد نقاط القوة والضعف
- قدم توصيات عملية

أنت مساعد ذكي ومحترف. كن دقيقاً ومفيداً دائماً.`;

async function saveTaggedFiles(response, projectDir = '', allowedFiles = null) {
  const fileMatches = response.matchAll(/<file path="([^"]+)">([\s\S]*?)<\/file>/g);
  const savedFiles = [];
  const rootDir = projectDir ? pathModule.resolve(projectDir) : process.cwd();

  // ملفات محمية لا يمكن تعديلها
  const PROTECTED = [
    'package.json',
    'package-lock.json',
    'main.js',
    'preload.js',
    '.env',
    'server/index.js',
    'client/src/App.jsx',
  ];

  for (const match of fileMatches) {
    const filePath = match[1];
    const fileContent = match[2].trim();

    if (filePath.toLowerCase() === 'terminal') continue;

    // تحقق من الملفات المحمية
    const isProtected = PROTECTED.some(p =>
      filePath === p || filePath.endsWith(p) || pathModule.basename(filePath) === 'package.json'
    );

    if (isProtected) {
      console.warn(`🛡️ ملف محمي، تم تجاهله: ${filePath}`);
      continue;
    }

    // منع الكتابة في ملفات حساسة
    if (isSensitiveFile(filePath)) {
      console.warn(`🔒 ملف حساس، تم تجاهله: ${filePath}`);
      continue;
    }

    if (allowedFiles && !allowedFiles.some(a =>
      filePath === a || filePath.endsWith('/' + a) || pathModule.basename(filePath) === a
    )) {
      console.warn(`🚫 وضع التقرير: تجاهل ${filePath} (مسموح فقط: ${allowedFiles.join(', ')})`);
      continue;
    }

    try {
      const fullPath = pathModule.resolve(rootDir, filePath);
      // حماية Path Traversal — يجب أن يكون المسار داخل المشروع فقط
      if (!fullPath.startsWith(rootDir + pathModule.sep) && fullPath !== rootDir) {
        console.warn(`🚫 مسار ممنوع خارج المشروع: ${filePath}`);
        continue;
      }
      fs.mkdirSync(pathModule.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, fileContent, 'utf8');
      savedFiles.push({ path: fullPath, name: pathModule.basename(fullPath), expectedLength: fileContent.length });
      console.log(`🐙 حفظ: ${fullPath}`);
      
      // تشغيل onFileSave hooks
      await executeHook('onFileSave', { filePath: fullPath, content: fileContent, projectDir: rootDir });
    } catch (e) {
      console.error(`خطأ في حفظ ${filePath}:`, e.message);
    }
  }

  if (savedFiles.length > 0) {
    try { ensureProjectMap(rootDir, { force: true }); } catch { }
  }

  return savedFiles;
}

const PROJECT_CONTENT_IGNORED = ['node_modules', '.git', 'dist', 'build', 'vendor', '.next', '.nuxt', '.cache', 'coverage', '__pycache__', '.vscode', '.idea', 'target', '.output'];

function shouldIgnoreProjectItem(name) {
  return PROJECT_CONTENT_IGNORED.includes(name);
}

// ملفات حساسة — يُمنع قراءتها أو كتابتها نهائياً
const SENSITIVE_PATTERNS = [
  '.env', '.env.local', '.env.production', '.env.development', '.env.staging', '.env.test',
  '.key', '.pem', '.cert', '.crt', '.p12', '.pfx',
  'package-lock.json', 'yarn.lock', 'bun.lockb',
];

function isSensitiveFile(filePath) {
  const base = pathModule.basename(filePath).toLowerCase();
  const nameLower = filePath.toLowerCase();
  return SENSITIVE_PATTERNS.some(p => {
    if (p.startsWith('.')) {
      // .env و .env.* — تطابق البداية
      return base === p || base.startsWith(p + '.') || nameLower.endsWith('/' + p) || nameLower.endsWith('/' + p.substring(1) + '-');
    }
    return base === p || nameLower.endsWith('/' + p);
  });
}

// حماية Path Traversal — التأكد أن المسار داخل workspace فقط
function isPathSafe(filePath, projectRoot) {
  const resolved = pathModule.resolve(projectRoot, filePath);
  const normalizedRoot = pathModule.resolve(projectRoot);
  // يجب أن يبدأ المسار المحلول بجذر المشروع
  if (!resolved.startsWith(normalizedRoot + pathModule.sep) && resolved !== normalizedRoot) {
    return false;
  }
  return true;
}

function resolveExistingDirectory(dirPath, fallback = process.cwd()) {
  const resolved = pathModule.resolve(dirPath || fallback);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error('المسار ليس مجلداً');
  }
  return resolved;
}

function resolveProjectDirOrNull(projectDir) {
  try {
    if (!projectDir) return null;
    return resolveExistingDirectory(projectDir);
  } catch {
    return null;
  }
}

// validateProjectBinding تم نقلها إلى validatorLayer

function hasUsableProjectMap(projectDir) {
  try {
    const projectMap = projectDir ? ensureProjectMap(projectDir, { watch: false }) : null;
    return Boolean(projectMap && projectMap.stats && projectMap.stats.scannedFiles > 0);
  } catch {
    return false;
  }
}

function runGit(args, cwd, callback) {
  execFile('git', args, {
    cwd: resolveExistingDirectory(cwd),
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 10,
    windowsHide: true,
  }, callback);
}

// قراءة هيكل المشروع — أسماء ملفات فقط بدون محتوى
function getProjectStructure(projectDir) {
  try {
    const projectMap = ensureProjectMap(projectDir);
    if (!projectMap) return [];
    const dirs = projectMap.sourceFolders.map(item => `📁 ${item}/`);
    const files = projectMap.filePaths.map(item => `📄 ${item}`);
    return [...dirs, ...files];
  } catch {
    return [];
  }
}

// Project Map Engine: لا يقرأ كل الملفات؛ يعيد خريطة ذكية وملفات سياق منتقاة فقط
function readKeyFiles(projectDir) {
  try {
    const projectMap = ensureProjectMap(projectDir);
    return summarizeProjectMap(projectMap);
  } catch {
    return '';
  }
}

function getTaskFileCandidates(task, activeFile = '') {
  const text = [
    task?.file,
    task?.path,
    task?.filename,
    task?.task,
    task?.prompt,
    activeFile,
  ].filter(Boolean).join('\n');

  const matches = text.match(/[A-Za-z0-9_.\-\/\\]+\.[A-Za-z0-9]+/g) || [];
  return [...new Set(matches.map(p => p.replace(/\\/g, '/')))];
}

function readTaskFiles(projectDir, task, activeFile = '', activeFileContent = '') {
  const rootDir = projectDir ? pathModule.resolve(projectDir) : process.cwd();
  const candidates = getTaskFileCandidates(task, activeFile);
  const results = [];

  for (const candidate of candidates) {
    try {
      const fullPath = pathModule.resolve(rootDir, candidate);
      const relFromRoot = pathModule.relative(rootDir, fullPath);
      if (relFromRoot.startsWith('..') || pathModule.isAbsolute(relFromRoot) || isSensitiveFile(candidate) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      results.push(`### ${candidate}\n\`\`\`\n${content}\n\`\`\``);
    } catch { }
  }

  if (results.length === 0 && projectDir) {
    const taskText = [task?.task, task?.prompt, activeFile].filter(Boolean).join('\n');
    const mapContext = getProjectContextForTask(projectDir, taskText, activeFile, activeFileContent);
    if (mapContext) return `سياق Project Map Engine:\n${mapContext}`;
  }

  if (results.length === 0 && activeFileContent) {
    results.push(`### ${activeFile || 'active file'}\n\`\`\`\n${activeFileContent}\n\`\`\``);
  }

  return results.length > 0
    ? `محتوى الملف الحالي:\n${results.join('\n\n')}`
    : 'محتوى الملف الحالي:\nلا يوجد ملف محدد أو قابل للقراءة لهذه المهمة';
}

function verifySavedFiles(savedFiles) {
  return savedFiles.map(file => {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      return {
        path: file.path,
        name: file.name,
        exists: true,
        length: content.length,
        complete: content.trim().length > 0 && (
          typeof file.expectedLength !== 'number' || content.length === file.expectedLength
        ),
        expectedLength: file.expectedLength,
      };
    } catch (error) {
      return {
        path: file.path,
        name: file.name,
        exists: false,
        length: 0,
        complete: false,
        error: error.message,
      };
    }
  });
}

app.get('/', (req, res) => {
  res.json({ message: '🐙 أخطبوط يعمل!' });
});

app.post('/api/project-map', (req, res) => {
  try {
    const { projectDir = '', force = false, command = '', activeFile = '', activeFileContent = '', clientProjectName = '' } = req.body;
    const binding = validateProjectBinding(projectDir, clientProjectName);
    if (!binding.ok) return res.status(400).json({ success: false, error: binding.error });

    const cachedMap = ensureProjectMap(binding.projectRoot, { force: !!force });
    const context = command
      ? getProjectContextForTask(binding.projectRoot, command, activeFile, activeFileContent)
      : '';

    res.json({
      success: true,
      projectMap: cachedMap,
      context,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Truth Layer Endpoint - عرض الحقائق من النظام
app.get('/api/truth/state', (req, res) => {
  try {
    const { projectDir = '' } = req.query;
    const realState = buildRealState(projectDir, sessions);
    const validation = validateRealState(realState);

    res.json({
      success: true,
      realState,
      validation,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/octopus', aiLimiter, async (req, res) => {
  try {
    const { command, sessionId = 'default', activeFile = '', activeFileContent = '', projectDir = '', projectContext = '', clientProjectName = '' } = req.body;
    const binding = projectDir ? validateProjectBinding(projectDir, clientProjectName) : { ok: true, projectRoot: '' };
    if (!binding.ok) return res.status(400).json({ success: false, error: binding.error });

    if (isReportCommand(command)) {
      return res.status(400).json({
        success: false,
        error: 'طلبات التقرير يجب أن تمر عبر /api/octopus/preview حتى يتم إنشاء report.md فقط بعد التأكيد.',
        requiresPreview: true,
      });
    }

    if (!sessions[sessionId]) {
      sessions[sessionId] = [];
    }

    const projectMapContext = binding.projectRoot
      ? getProjectContextForTask(binding.projectRoot, command, activeFile, activeFileContent)
      : '';

    let fullCommand = projectMapContext
      ? `خريطة المشروع والسياق الذكي:\n${projectMapContext}\n\nطلب المستخدم: ${command}`
      : projectContext
      ? `ملفات المشروع المفتوحة:\n${projectContext}\n\nالملف الحالي: ${activeFile}\n\nطلب المستخدم: ${command}`
      : activeFileContent
        ? `الملف الحالي (${activeFile}):\n\`\`\`\n${activeFileContent.slice(0, 2000)}\n\`\`\`\n\nطلب المستخدم: ${command}`
        : command;

    // تشغيل beforeSend hooks
    fullCommand = await executeHook('beforeSend', fullCommand);

    sessions[sessionId].push({ role: 'user', content: fullCommand });

    if (sessions[sessionId].length > 20) {
      sessions[sessionId] = sessions[sessionId].slice(-20);
    }

    let response = await callAI([
      { role: 'system', content: SYSTEM_PROMPT },
      ...sessions[sessionId]
    ], 100000, command);

    // تشغيل afterResponse hooks
    response = await executeHook('afterResponse', response);

    const savedFiles = await saveTaggedFiles(response, binding.projectRoot || projectDir);

    sessions[sessionId].push({ role: 'assistant', content: response });

    res.json({ success: true, result: response, sessionId, savedFiles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Preview route — Brain Controller v3
app.post('/api/octopus/preview', aiLimiter, async (req, res) => {
  try {
    const { command, projectDir = '' } = req.body;
    if (!command) return res.status(400).json({ success: false, error: 'command is required' });

    const preview = await previewBrainController({ command, projectDir, callAI });

    res.json({
      success: true,
      mode: preview.mode,
      plan: preview.plan,
      eng1Result: preview.eng1Result,
      eng2Result: preview.eng2Result,
      frameworks: preview.snapshot?.frameworks,
      preview: `## Brain Decision\n${preview.plan.decision}\n\n## Rejected\n${preview.plan.rejected || 'None'}\n\n## Tasks\n${
        preview.plan.tasks?.filter(t => t.active).map(t => `- Leg ${t.leg}: ${t.task}`).join('\n') || ''
      }`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Parallel execution route — Brain Controller v3
app.post('/api/octopus/parallel', aiLimiter, async (req, res) => {
  try {
    const {
      command,
      sessionId = 'default',
      activeFile = '',
      activeFileContent = '',
      projectDir = '',
      confirmed = false,
      plan: approvedPlan = null,
    } = req.body;

    if (!confirmed) {
      return res.status(400).json({
        success: false,
        error: 'Plan must be confirmed first. Use /api/octopus/preview then send confirmed: true',
        requiresConfirmation: true,
      });
    }

    const updates = [];
    const onUpdate = (entry) => {
      updates.push(entry);
      const label = entry.legId === 0 ? '🧠 Brain' : `🦾 Leg ${entry.legId}`;
      console.log(`${label}: ${entry.status}${entry.task ? ' — ' + entry.task : ''}`);
    };

    const result = await runBrainController({
      command,
      projectDir,
      activeFile,
      activeFileContent,
      callAI,
      onUpdate,
    });

    if (!sessions[sessionId]) sessions[sessionId] = [];
    sessions[sessionId].push({ role: 'user', content: command });
    sessions[sessionId].push({ role: 'assistant', content: result.finalResult });
    if (sessions[sessionId].length > 20) sessions[sessionId] = sessions[sessionId].slice(-20);

    res.json({
      success: true,
      result: result.finalResult,
      mode: result.mode,
      plan: result.plan,
      legResults: result.legResults.map(r => ({
        leg: r.legId,
        task: result.plan?.tasks?.find(t => t.leg === r.legId)?.task || '',
        result: r.result,
        error: r.error,
      })),
      savedFiles: result.savedFiles.map(f => ({
        name: require('path').basename(f.path),
        path: f.absolutePath || require('path').resolve(projectDir || process.cwd(), f.path),
        relativePath: f.path,
        size: f.size,
      })),
      rejectedFiles: result.rejectedFiles,
      terminalCommands: result.terminalCommands,
      terminalCommand: result.terminalCommands?.[0] || null,
      timeline: result.timeline,
      sessionId,
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// مسح جلسة معينة
app.post('/api/reset', (req, res) => {
  const { sessionId = 'default' } = req.body;
  sessions[sessionId] = [];
  res.json({ success: true, message: 'تم مسح المحادثة' });
});

// كتابة ملف
app.post('/api/files/write', async (req, res) => {
  try {
    const { filePath, content, projectDir, clientProjectName = '' } = req.body;
    if (!filePath) return res.status(400).json({ success: false, error: 'filePath مطلوب' });

    const binding = projectDir ? validateProjectBinding(projectDir, clientProjectName) : { ok: true, projectRoot: process.cwd() };
    if (!binding.ok) return res.status(400).json({ success: false, error: binding.error });
    const projectRoot = binding.projectRoot || process.cwd();

    // حماية Path Traversal
    if (!isPathSafe(filePath, projectRoot)) {
      return res.status(403).json({ success: false, error: 'مسار ممنوع — يجب أن يكون داخل workspace فقط' });
    }

    // منع الكتابة فوق ملفات حساسة
    if (isSensitiveFile(filePath)) {
      return res.status(403).json({ success: false, error: 'ملف حساس — يُمنع الكتابة فيه' });
    }

    const fullPath = pathModule.resolve(projectRoot, filePath);
    fs.mkdirSync(pathModule.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    try { ensureProjectMap(projectRoot, { force: true }); } catch { }
    res.json({ success: true, path: fullPath });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// قراءة ملف
app.post('/api/files/read', async (req, res) => {
  try {
    const { filePath, projectDir, clientProjectName = '' } = req.body;
    if (!filePath) return res.status(400).json({ success: false, error: 'filePath مطلوب' });

    const binding = projectDir ? validateProjectBinding(projectDir, clientProjectName) : { ok: true, projectRoot: process.cwd() };
    if (!binding.ok) return res.status(400).json({ success: false, error: binding.error });
    const projectRoot = binding.projectRoot || process.cwd();

    // حماية Path Traversal
    if (!isPathSafe(filePath, projectRoot)) {
      return res.status(403).json({ success: false, error: 'مسار ممنوع — يجب أن يكون داخل workspace فقط' });
    }

    // منع قراءة ملفات حساسة
    if (isSensitiveFile(filePath)) {
      return res.status(403).json({ success: false, error: 'ملف حساس — يُمنع قراءته' });
    }

    const fullPath = pathModule.resolve(projectRoot, filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    res.json({ success: true, content });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// قراءة مجلد
app.post('/api/files/list', async (req, res) => {
  try {
    const { dirPath } = req.body;
    const fullPath = resolveExistingDirectory(dirPath);
    try { ensureProjectMap(fullPath); } catch { }

    function readDir(dir, base = '') {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      let dirs = [];
      let files = [];

      for (const item of items) {
        if (['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', 'vendor'].includes(item.name)) continue;
        if (item.name === '.env' || item.name.endsWith('.env')) continue;
        const fullItemPath = pathModule.join(dir, item.name);
        if (item.isDirectory()) {
          dirs.push({ name: item.name, type: 'dir', path: fullItemPath, children: readDir(fullItemPath) });
        } else {
          files.push({ name: item.name, type: 'file', path: fullItemPath });
        }
      }

      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));

      return [...dirs, ...files];
    }

    const items = readDir(fullPath);
    res.json({
      success: true,
      rootDir: fullPath,
      name: pathModule.basename(fullPath),
      items,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// حذف ملف
app.post('/api/files/delete', async (req, res) => {
  try {
    const { filePath, projectDir, clientProjectName = '' } = req.body;
    if (!filePath) return res.status(400).json({ success: false, error: 'filePath مطلوب' });

    const binding = projectDir ? validateProjectBinding(projectDir, clientProjectName) : { ok: true, projectRoot: '' };
    if (!binding.ok) return res.status(400).json({ success: false, error: binding.error });

    const fullPath = resolveExistingDirectory(filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ success: false, error: 'الملف غير موجود' });

    fs.unlinkSync(fullPath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// إعادة تسمية ملف
app.post('/api/files/rename', async (req, res) => {
  try {
    const { oldPath, newPath, projectDir, clientProjectName = '' } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ success: false, error: 'oldPath و newPath مطلوبان' });

    const binding = projectDir ? validateProjectBinding(projectDir, clientProjectName) : { ok: true, projectRoot: '' };
    if (!binding.ok) return res.status(400).json({ success: false, error: binding.error });

    const fullOldPath = resolveExistingDirectory(oldPath);
    if (!fs.existsSync(fullOldPath)) return res.status(404).json({ success: false, error: 'الملف غير موجود' });

    const dir = pathModule.dirname(fullOldPath);
    const fullNewPath = pathModule.join(dir, newPath);

    fs.renameSync(fullOldPath, fullNewPath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// إظهار في Explorer
app.post('/api/files/show-in-explorer', async (req, res) => {
  try {
    const { filePath, projectDir, clientProjectName = '' } = req.body;
    if (!filePath) return res.status(400).json({ success: false, error: 'filePath مطلوب' });

    const binding = projectDir ? validateProjectBinding(projectDir, clientProjectName) : { ok: true, projectRoot: '' };
    if (!binding.ok) return res.status(400).json({ success: false, error: binding.error });

    const fullPath = resolveExistingDirectory(filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ success: false, error: 'الملف غير موجود' });

    const { exec } = require('child_process');
    if (process.platform === 'win32') {
      exec(`explorer /select,"${fullPath}"`);
    } else if (process.platform === 'darwin') {
      exec(`open -R "${fullPath}"`);
    } else {
      exec(`xdg-open "${pathModule.dirname(fullPath)}"`);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/terminal', async (req, res) => {
  try {
    const { command, cwd } = req.body;
    const workingDir = resolveExistingDirectory(cwd);
    const blocked = ['rm -rf', 'del /f /s', 'format', 'shutdown', 'reboot'];
    if (blocked.some(b => command.toLowerCase().includes(b))) {
      return res.json({ success: false, error: 'هذا الأمر ممنوع' });
    }

    exec(command, {
      cwd: workingDir,
      timeout: 600000,
      maxBuffer: 1024 * 1024 * 10,
      shell: 'cmd.exe'
    }, (error, stdout, stderr) => {
      if (!res.headersSent) {
        res.json({
          success: !error || !!stdout,
          output: stdout || stderr || error?.message || '',
        });
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/terminal/stream', async (req, res) => {
  try {
    const { command, cwd } = req.body;
    const workingDir = resolveExistingDirectory(cwd);
    const blocked = ['rm -rf', 'del /f /s', 'format', 'shutdown', 'reboot'];
    if (blocked.some(b => command.toLowerCase().includes(b))) {
      return res.json({ success: false, error: 'هذا الأمر ممنوع' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    req.setTimeout(0);
    res.setTimeout(0);

    const proc = spawn('cmd.exe', ['/c', command], {
      cwd: workingDir,
      env: { ...process.env }
    });

    proc.stdout.on('data', d => {
      try { res.write(`data: ${JSON.stringify({ output: d.toString() })}\n\n`); } catch { }
    });

    proc.stderr.on('data', d => {
      try { res.write(`data: ${JSON.stringify({ output: d.toString() })}\n\n`); } catch { }
    });

    proc.on('close', (code) => {
      try {
        res.write(`data: ${JSON.stringify({ done: true, code: code || 0 })}\n\n`);
        res.end();
      } catch { }
    });

    proc.on('error', (err) => {
      try {
        res.write(`data: ${JSON.stringify({ output: err.message, done: true, code: 1 })}\n\n`);
        res.end();
      } catch { }
    });

    req.on('close', () => proc.kill());
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// تشغيل عملية طويلة
app.post('/api/run', async (req, res) => {
  try {
    const { command, cwd } = req.body;
    const workingDir = resolveExistingDirectory(cwd);

    if (runningProcess) {
      runningProcess.kill('SIGTERM');
      runningProcess = null;
    }

    const parts = command.split(' ');
    runningProcess = spawn(parts[0], parts.slice(1), {
      cwd: workingDir,
      shell: true,
      env: { ...process.env }
    });

    let output = '';
    runningProcess.stdout.on('data', d => { output += d.toString(); });
    runningProcess.stderr.on('data', d => { output += d.toString(); });
    runningProcess.on('exit', () => { runningProcess = null; });

    setTimeout(() => {
      res.json({ success: true, output: output || '✅ العملية شغّالة في الخلفية', pid: runningProcess?.pid });
    }, 5000);

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// إيقاف العملية
app.post('/api/stop', async (req, res) => {
  try {
    if (runningProcess) {
      runningProcess.kill('SIGTERM');
      runningProcess = null;
      res.json({ success: true, output: '⏹ تم الإيقاف' });
    } else {
      res.json({ success: true, output: 'لا توجد عملية شغّالة' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// SSE لمراقبة الملفات
app.get('/api/watch', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write('data: {"connected": true}\n\n');

  watchClients.push(res);
  req.on('close', () => {
    watchClients = watchClients.filter(client => client !== res);
  });
});

app.post('/api/watch/start', (req, res) => {
  try {
    const { dirPath } = req.body;
    const fullPath = resolveExistingDirectory(dirPath);
    if (watcher) watcher.close();
    try {
      ensureProjectMap(fullPath);
      ensureProjectMapWatcher(fullPath);
    } catch { }

    watcher = chokidar.watch(fullPath, {
      ignored: /(node_modules|\.git|vendor|\.next|dist)/,
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on('add', filePath => {
      const event = JSON.stringify({ type: 'add', path: filePath, name: pathModule.basename(filePath) });
      watchClients.forEach(client => {
        try { client.write(`data: ${event}\n\n`); } catch { }
      });
    });

    watcher.on('change', filePath => {
      const event = JSON.stringify({ type: 'change', path: filePath, name: pathModule.basename(filePath) });
      watchClients.forEach(client => {
        try { client.write(`data: ${event}\n\n`); } catch { }
      });
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/watch/stop', (req, res) => {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  res.json({ success: true });
});

app.post('/api/search', async (req, res) => {
  try {
    const { query, dirPath } = req.body;
    if (!query || !dirPath) return res.json({ success: true, results: [] });

    const results = [];
    const rootDir = resolveExistingDirectory(dirPath);
    const normalizedQuery = String(query).toLowerCase();

    function searchDir(dir) {
      if (results.length >= 100) return;
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (results.length >= 100) return;
        if (shouldIgnoreProjectItem(item.name) || isSensitiveFile(item.name)) continue;
        const fullPath = pathModule.join(dir, item.name);
        if (item.isDirectory()) {
          searchDir(fullPath);
        } else {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 1024 * 1024) continue;
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, i) => {
              if (results.length < 100 && line.toLowerCase().includes(normalizedQuery)) {
                results.push({
                  file: item.name,
                  path: fullPath,
                  line: i + 1,
                  text: line.trim(),
                });
              }
            });
          } catch { }
        }
      }
    }

    searchDir(rootDir);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Git status
app.post('/api/git/status', async (req, res) => {
  try {
    const { cwd } = req.body;
    runGit(['status', '--porcelain'], cwd, (error, stdout) => {
      if (error) return res.json({ success: false, error: 'ليس مشروع Git' });
      const files = stdout.trim().split('\n').filter(Boolean).map(line => ({
        status: line.slice(0, 2).trim(),
        file: line.slice(2).trim(),
      }));
      res.json({ success: true, files });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Git commit
app.post('/api/git/commit', async (req, res) => {
  try {
    const { cwd, message } = req.body;
    const commitMessage = String(message || '').trim();
    if (!commitMessage) return res.status(400).json({ success: false, error: 'message مطلوب' });

    runGit(['add', '.'], cwd, (addError, addStdout, addStderr) => {
      if (addError) {
        return res.json({ success: false, output: addStdout || addStderr || addError.message });
      }

      runGit(['commit', '-m', commitMessage], cwd, (commitError, stdout, stderr) => {
        res.json({ success: !commitError, output: stdout || stderr || commitError?.message });
      });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Git diff
app.post('/api/git/diff', async (req, res) => {
  try {
    const { cwd, file } = req.body;
    const args = ['diff'];
    if (file) args.push('--', String(file));
    runGit(args, cwd, (error, stdout, stderr) => {
      if (error && !stdout) return res.json({ success: false, diff: '', error: stderr || error.message });
      res.json({ success: true, diff: stdout });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ==================== Plugins API ====================

// الحصول على جميع الإضافات
app.get('/api/plugins', (req, res) => {
  try {
    const plugins = pluginManager.getAllPlugins();
    res.json({ success: true, plugins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// الحصول على إضافة محددة
app.get('/api/plugins/:id', (req, res) => {
  try {
    const plugin = pluginManager.getPlugin(req.params.id);
    if (!plugin) {
      return res.status(404).json({ success: false, error: 'Plugin not found' });
    }
    res.json({ success: true, plugin: plugin.getInfo() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// تفعيل إضافة
app.post('/api/plugins/:id/enable', async (req, res) => {
  try {
    const result = await pluginManager.enablePlugin(req.params.id);
    if (result) {
      res.json({ success: true, message: 'Plugin enabled successfully' });
    } else {
      res.status(400).json({ success: false, error: 'Failed to enable plugin' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// تعطيل إضافة
app.post('/api/plugins/:id/disable', async (req, res) => {
  try {
    const result = await pluginManager.disablePlugin(req.params.id);
    if (result) {
      res.json({ success: true, message: 'Plugin disabled successfully' });
    } else {
      res.status(400).json({ success: false, error: 'Failed to disable plugin' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// الحصول على إحصائيات الإضافات
app.get('/api/plugins/stats', (req, res) => {
  try {
    const stats = pluginManager.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// تحميل الإضافات من مجلد
app.post('/api/plugins/reload', async (req, res) => {
  try {
    await pluginManager.loadPluginsFromDirectory(path.join(__dirname, 'plugins'));
    res.json({ success: true, message: 'Plugins reloaded successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Simple Plugin System API ====================

// Get all simple plugins
app.get('/api/simple-plugins', (req, res) => {
  try {
    const plugins = loadedPlugins.map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      author: p.author,
      icon: p.icon,
      enabled: p.enabled,
      hooks: p.hooks ? Object.keys(p.hooks) : [],
      routes: p.routes ? p.routes.length : 0,
    }));
    res.json({ success: true, plugins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enable a simple plugin
app.post('/api/simple-plugins/:id/enable', (req, res) => {
  try {
    const plugin = loadedPlugins.find(p => p.id === req.params.id);
    if (!plugin) {
      return res.status(404).json({ success: false, error: 'Plugin not found' });
    }
    plugin.enabled = true;
    pluginsState[plugin.id] = { enabled: true };
    savePluginsState();
    res.json({ success: true, message: 'Plugin enabled successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disable a simple plugin
app.post('/api/simple-plugins/:id/disable', (req, res) => {
  try {
    const plugin = loadedPlugins.find(p => p.id === req.params.id);
    if (!plugin) {
      return res.status(404).json({ success: false, error: 'Plugin not found' });
    }
    plugin.enabled = false;
    pluginsState[plugin.id] = { enabled: false };
    savePluginsState();
    res.json({ success: true, message: 'Plugin disabled successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Install a new simple plugin
app.post('/api/simple-plugins/install', (req, res) => {
  try {
    const { plugin } = req.body;
    if (!plugin || !plugin.id || !plugin.name) {
      return res.status(400).json({ success: false, error: 'Invalid plugin data' });
    }
    
    const pluginPath = path.join(pluginsDir, `${plugin.id}.js`);
    const pluginCode = `module.exports = ${JSON.stringify(plugin, null, 2)};`;
    
    fs.writeFileSync(pluginPath, pluginCode, 'utf8');
    
    // Load the new plugin
    const newPlugin = require(pluginPath);
    newPlugin.enabled = true;
    loadedPlugins.push(newPlugin);
    pluginsState[newPlugin.id] = { enabled: true };
    savePluginsState();
    
    // Register routes
    if (newPlugin.routes && Array.isArray(newPlugin.routes)) {
      for (const route of newPlugin.routes) {
        const handler = async (req, res) => {
          try {
            await route.handler(req, res);
          } catch (error) {
            res.status(500).json({ success: false, error: error.message });
          }
        };
        
        if (route.method === 'GET') app.get(route.path, handler);
        else if (route.method === 'POST') app.post(route.path, handler);
        else if (route.method === 'PUT') app.put(route.path, handler);
        else if (route.method === 'DELETE') app.delete(route.path, handler);
      }
    }
    
    res.json({ success: true, message: 'Plugin installed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a simple plugin
app.delete('/api/simple-plugins/:id', (req, res) => {
  try {
    const pluginIndex = loadedPlugins.findIndex(p => p.id === req.params.id);
    if (pluginIndex === -1) {
      return res.status(404).json({ success: false, error: 'Plugin not found' });
    }
    
    const plugin = loadedPlugins[pluginIndex];
    const pluginPath = path.join(pluginsDir, `${plugin.id}.js`);
    
    // Delete file
    if (fs.existsSync(pluginPath)) {
      fs.unlinkSync(pluginPath);
    }
    
    // Remove from memory
    loadedPlugins.splice(pluginIndex, 1);
    delete pluginsState[plugin.id];
    savePluginsState();
    
    res.json({ success: true, message: 'Plugin deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== NPM Package Installation System ====================

// Get all installed npm packages
app.get('/api/npm-packages', async (req, res) => {
  try {
    const packages = await Promise.all(Object.values(installedNpmPackages).map(async pkg => ({
      name: pkg.name,
      displayName: pkg.displayName,
      version: pkg.version,
      description: pkg.description,
      installedAt: pkg.installedAt,
      enabled: pkg.enabled,
      hook: pkg.hook,
      icon: pkg.icon || await getPackageIcon(pkg.name),
      namespace: pkg.namespace,
      source: pkg.source || 'npm',
    })));
    res.json({ success: true, packages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Install npm package
app.post('/api/npm-packages/install', async (req, res) => {
  try {
    const { packageName, hook, vsxData } = req.body;
    if (!packageName) {
      return res.status(400).json({ success: false, error: 'packageName required' });
    }

    if (vsxData) {
      installedNpmPackages[packageName] = {
        name: packageName,
        displayName: vsxData.displayName || packageName,
        description: vsxData.description || '',
        version: vsxData.version || '0.0.1',
        installedAt: new Date().toISOString(),
        enabled: true,
        hook: hook || 'afterResponse',
        icon: vsxData.icon || null,
        namespace: vsxData.namespace || '',
        source: 'vsx',
      };
      saveNpmPackages();
      return res.json({ success: true, message: 'VSX extension installed successfully', package: installedNpmPackages[packageName] });
    }

    console.log(`📦 Installing npm package: ${packageName}`);
    
    // Run npm install
    const { spawn } = require('child_process');
    const npmInstall = spawn('npm', ['install', packageName, '--save'], {
      cwd: path.join(__dirname, '..'),
      shell: true
    });

    let output = '';
    let error = '';

    npmInstall.stdout.on('data', (data) => {
      output += data.toString();
    });

    npmInstall.stderr.on('data', (data) => {
      error += data.toString();
    });

    npmInstall.on('close', async (code) => {
      if (code !== 0) {
        console.error(`npm install failed with code ${code}`);
        return res.status(500).json({ success: false, error: error || 'npm install failed' });
      }

      console.log(`✅ npm install completed for ${packageName}`);

      // Try to get package info
      let packageInfo = { name: packageName, version: '1.0.0', description: '' };
      try {
        const packageJsonPath = path.join(__dirname, '..', 'node_modules', packageName, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          packageInfo = {
            name: packageJson.name || packageName,
            version: packageJson.version || '1.0.0',
            description: packageJson.description || ''
          };
        }
      } catch (e) {
        console.error('Failed to read package.json:', e.message);
      }

      // Save to npm-packages.json
      installedNpmPackages[packageName] = {
        ...packageInfo,
        installedAt: new Date().toISOString(),
        enabled: true,
        hook: hook || 'afterResponse'
      };
      saveNpmPackages();

      res.json({ success: true, message: 'Package installed successfully', package: packageInfo });
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enable/disable npm package
app.post('/api/npm-packages/:name/enable', (req, res) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;
    
    if (!installedNpmPackages[name]) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }
    
    installedNpmPackages[name].enabled = enabled !== false;
    saveNpmPackages();
    
    res.json({ success: true, message: enabled ? 'Package enabled' : 'Package disabled' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Uninstall npm package
app.delete('/api/npm-packages/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    if (!installedNpmPackages[name]) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }

    if (installedNpmPackages[name].source === 'vsx') {
      delete installedNpmPackages[name];
      saveNpmPackages();
      return res.json({ success: true, message: 'VSX extension removed successfully' });
    }

    console.log(`🗑️ Uninstalling npm package: ${name}`);
    
    // Run npm uninstall
    const { spawn } = require('child_process');
    const npmUninstall = spawn('npm', ['uninstall', name], {
      cwd: path.join(__dirname, '..'),
      shell: true
    });

    npmUninstall.on('close', (code) => {
      if (code !== 0) {
        console.error(`npm uninstall failed with code ${code}`);
        return res.status(500).json({ success: false, error: 'npm uninstall failed' });
      }

      // Remove from npm-packages.json
      delete installedNpmPackages[name];
      saveNpmPackages();

      console.log(`✅ npm uninstall completed for ${name}`);
      res.json({ success: true, message: 'Package uninstalled successfully' });
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== NPM Search API ====================

// البحث في npm registry
app.get('/api/npm-search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
      return res.json({ success: true, objects: [] });
    }

    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`;
    const npmRes = await fetch(url);
    const data = await npmRes.json();
    if (data.error) {
      console.warn(`NPM search warning for "${query}": ${data.error}`);
      return res.json({ success: true, objects: [] });
    }
    const objects = await Promise.all((data.objects || []).map(async obj => ({
      ...obj,
      package: {
        ...obj.package,
        icon: await getPackageIcon(obj.package.name),
      },
    })));
    console.log(`NPM search "${query}": ${objects.length} results`);
    res.json({ success: true, objects });
  } catch (error) {
    console.error('NPM search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Open VSX API ====================

// بحث في Open VSX Registry
app.get('/api/vsx-search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const size = Math.min(parseInt(req.query.size, 10) || 20, 50);
  const sortBy = String(req.query.sortBy || 'relevance');

  if (!query) {
    return res.json({ extensions: [] });
  }

  try {
    const response = await fetch(
      `https://open-vsx.org/api/-/search?query=${encodeURIComponent(query)}&size=${size}&sortBy=${encodeURIComponent(sortBy)}&sortOrder=desc`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.json({ error: error.message, extensions: [] });
  }
});

// تفاصيل إضافة معينة من Open VSX
app.get('/api/vsx-extension/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params;

  try {
    const response = await fetch(
      `https://open-vsx.org/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.json({ error: error.message });
  }
});

// تثبيت إضافة
app.post('/api/extensions/install', async (req, res) => {
  const { extension } = req.body;

  if (!extension) {
    return res.status(400).json({ success: false, error: 'Extension data required' });
  }

  try {
    // هنا يمكن إضافة منطق التثبيت الفعلي
    // حالياً سنقوم فقط بحفظ الإضافة في قائمة المثبتة
    console.log('Installing extension:', extension.name);
    res.json({ success: true, message: 'Extension installed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// إلغاء تثبيت إضافة
app.post('/api/extensions/uninstall', async (req, res) => {
  const { extensionId } = req.body;

  if (!extensionId) {
    return res.status(400).json({ success: false, error: 'Extension ID required' });
  }

  try {
    // هنا يمكن إضافة منطق إلغاء التثبيت الفعلي
    console.log('Uninstalling extension:', extensionId);
    res.json({ success: true, message: 'Extension uninstalled successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Marketplace API ====================

// الحصول على جميع الإضافات في Marketplace
app.get('/api/marketplace/plugins', (req, res) => {
  try {
    const plugins = marketplace.getAllPlugins();
    res.json({ success: true, plugins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// الحصول على إضافة محددة من Marketplace
app.get('/api/marketplace/plugins/:id', (req, res) => {
  try {
    const plugin = marketplace.getPlugin(req.params.id);
    if (!plugin) {
      return res.status(404).json({ success: false, error: 'Plugin not found' });
    }
    res.json({ success: true, plugin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// البحث في Marketplace
app.get('/api/marketplace/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, error: 'Query parameter required' });
    }
    const plugins = marketplace.searchPlugins(q);
    res.json({ success: true, plugins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// الحصول على الفئات
app.get('/api/marketplace/categories', (req, res) => {
  try {
    const categories = marketplace.getCategories();
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// الحصول على الإضافات الأكثر تحميلاً
app.get('/api/marketplace/popular', (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const plugins = marketplace.getPopularPlugins(parseInt(limit));
    res.json({ success: true, plugins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// الحصول على الإضافات الأعلى تقييماً
app.get('/api/marketplace/top-rated', (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const plugins = marketplace.getTopRatedPlugins(parseInt(limit));
    res.json({ success: true, plugins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// تثبيت إضافة من Marketplace
app.post('/api/marketplace/install/:id', async (req, res) => {
  try {
    const result = await marketplace.installPlugin(req.params.id, pluginManager);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// إلغاء تثبيت إضافة
app.post('/api/marketplace/uninstall/:id', async (req, res) => {
  try {
    const result = await marketplace.uninstallPlugin(req.params.id, pluginManager);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🐙 أخطبوط شغّال على http://localhost:${PORT}`);
  
  // تحميل الإضافات البسيطة (module.exports style)
  console.log(`📂 Loading simple plugins from: ${pluginsDir}`);
  loadSimplePlugins();
  const enabledCount = getEnabledPlugins().length;
  console.log(`✅ Simple plugins loaded: ${loadedPlugins.length} total, ${enabledCount} enabled`);
  
  // تحميل npm packages
  console.log(`📦 Loading npm packages...`);
  loadNpmPackages();
  const npmCount = Object.keys(installedNpmPackages).length;
  console.log(`✅ NPM packages loaded: ${npmCount} packages`);
  
    // تحميل الإضافات القديمة (class-based) - محمي بـ try/catch لمنع إيقاف العملية
  pluginManager.loadPluginsFromDirectory(pluginsDir).then(() => {
    console.log(`✅ Class-based plugins loaded successfully`);
    try {
      const stats = pluginManager.getStats();
      console.log(`📊 Plugins stats: ${stats.total} total, ${stats.enabled} enabled`);
      console.log('✅ All plugins loaded successfully, server is ready');
    } catch (err) {
      console.error('❌ Error getting plugin stats:', err);
    }
  }).catch(err => {
    // هنا تم التعديل: طباعة الخطأ دون إيقاف العملية (process.exit أو throw)
    console.error('❌ Failed to load class-based plugins, but the server will continue running:', err.message);
  });

});

server.on('error', (err) => {
  console.error('❌ Server listen error:', err);
  process.exitCode = 1;
});
