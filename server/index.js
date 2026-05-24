require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Groq = require('groq-sdk');
const path = require('path');
const {
  ensureProjectMap,
  ensureProjectMapWatcher,
  getProjectContextForTask,
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
const { buildRealState, validateRealState } = require('./services/stateService');
const { SYSTEM_PROMPT, isReportCommand } = require('./services/octopusConfig');
const { createTaggedFileSaver } = require('./services/taggedFileService');
const { createAIService } = require('./services/aiService');
const {
  isSensitiveFile,
  writeProjectFile,
} = require('./services/fileService');
const { createCorsOptions } = require('./services/httpSecurity');
const { loadJsonFile, replaceObjectContents, saveJsonFile } = require('./services/jsonStoreService');
const { createPackageIconResolver } = require('./services/packageIconService');
const { createSimplePluginRuntime } = require('./services/simplePluginRuntimeService');
const { appendTodoUpdate } = require('./services/todoLogService');
const { registerFileRoutes } = require('./routes/files');
const { registerTerminalRoutes } = require('./routes/terminal');
const { registerGitRoutes } = require('./routes/git');
const { registerWorkspaceRoutes } = require('./routes/workspace');
const { registerSystemRoutes } = require('./routes/system');
const { registerCoreRoutes } = require('./routes/core');
const { registerMarketplaceRoutes } = require('./routes/marketplace');
const { registerPackageRoutes } = require('./routes/packages');
const { registerPluginManagerRoutes } = require('./routes/plugins');
const { registerSimplePluginRoutes } = require('./routes/simplePlugins');
const { registerOctopusRoutes } = require('./routes/octopus');

// Simple Plugin System - Module Exports Style
const pluginsDir = path.join(__dirname, 'plugins');
const pluginsStatePath = path.join(pluginsDir, 'plugins.json');
const npmPackagesPath = path.join(pluginsDir, 'npm-packages.json');
let loadedPlugins = [];
let pluginsState = {};
let installedNpmPackages = {};
const getPackageIcon = createPackageIconResolver();

// Load plugins state from JSON
function loadPluginsState() {
  replaceObjectContents(pluginsState, loadJsonFile(pluginsStatePath, {}));
}

// Save plugins state to JSON
function savePluginsState() {
  saveJsonFile(pluginsStatePath, pluginsState);
}

// Load installed npm packages
function loadNpmPackages() {
  replaceObjectContents(installedNpmPackages, loadJsonFile(npmPackagesPath, {}));
}

// Save installed npm packages
function saveNpmPackages() {
  saveJsonFile(npmPackagesPath, installedNpmPackages);
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

app.use(cors(createCorsOptions()));
app.use(express.json());
app.use(limiter);

// تخزين تاريخ المحادثات لكل جلسة
const sessions = {};

const callAI = createAIService({ groq, pluginManager, selectModel });
const simplePluginRuntime = createSimplePluginRuntime({
  app,
  pluginsDir,
  loadedPlugins,
  pluginsState,
  loadPluginsState,
});
const { executeHook, getEnabledPlugins, loadSimplePlugins } = simplePluginRuntime;

const saveTaggedFiles = createTaggedFileSaver({
  appendTodoUpdate,
  ensureProjectMap,
  executeHook,
  isSensitiveFile,
  writeProjectFile,
});

registerOctopusRoutes(app, {
  aiLimiter,
  callAI,
  executeHook,
  getProjectContextForTask,
  isReportCommand,
  previewBrainController,
  runBrainController,
  saveTaggedFiles,
  sessions,
  systemPrompt: SYSTEM_PROMPT,
  validateProjectBinding,
});
registerCoreRoutes(app, {
  ensureProjectMap,
  getEnabledPlugins,
  getProjectContextForTask,
  loadedPlugins,
  sessions,
  buildRealState,
  validateRealState,
  validateProjectBinding,
});
registerFileRoutes(app, { ensureProjectMap, appendTodoUpdate });
registerSystemRoutes(app);
registerTerminalRoutes(app);
registerWorkspaceRoutes(app, { ensureProjectMap, ensureProjectMapWatcher });

registerGitRoutes(app);

registerPluginManagerRoutes(app, { pluginManager, pluginsDir });
registerSimplePluginRoutes(app, { loadedPlugins, pluginsDir, pluginsState, savePluginsState });
registerPackageRoutes(app, {
  getPackageIcon,
  installedNpmPackages,
  saveNpmPackages,
  rootDir: path.join(__dirname, '..'),
});
registerMarketplaceRoutes(app, { marketplace, pluginManager });

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
