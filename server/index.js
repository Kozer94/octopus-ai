require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
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
const { createEventBus } = require('./services/eventBusService');
const { createEnvReader } = require('./services/envService');
const { createJobQueue } = require('./services/jobQueueService');
const { createApiRateLimiters } = require('./services/rateLimitService');
const { createTaskRuntime } = require('./services/taskRuntimeService');
const { createWorkerAdapter } = require('./services/workerAdapterService');
const { createWorkerRegistry } = require('./services/workerRegistryService');
const {
  isSensitiveFile,
  writeProjectFile,
} = require('./services/fileService');
const { createCorsOptions } = require('./services/httpSecurity');
const { loadJsonFile, replaceObjectContents, saveJsonFile } = require('./services/jsonStoreService');
const { createPackageIconResolver } = require('./services/packageIconService');
const { registerPtyTerminalServer } = require('./services/ptyTerminalService');
const { createSimplePluginRuntime } = require('./services/simplePluginRuntimeService');
const { appendTodoUpdate } = require('./services/todoLogService');
const { createAuthMiddleware } = require('./services/authService');
const { createRequestGuard } = require('./services/inputValidation');
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
const { registerEventRoutes } = require('./routes/events');
const { registerRuntimeRoutes } = require('./routes/runtime');
const { registerScanRoutes } = require('./routes/scan');
const { registerHudRoutes } = require('./routes/hud');
const { initHudWS, hudLog, hudPluginUpdate } = require('./hud-ws');

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
const env = createEnvReader();
const PORT = env.get('PORT', '3001');
const groq = new Groq({ apiKey: env.get('GROQ_API_KEY') });

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exitCode = 1;
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exitCode = 1;
});

const { aiLimiter, config: rateLimitConfig, limiter, mutationLimiter, terminalLimiter } = createApiRateLimiters(env);

app.use(cors(createCorsOptions()));
app.use(express.json());
app.use(limiter);
app.use('/api', createAuthMiddleware());
app.use('/api', createRequestGuard());
app.use('/api', mutationLimiter);

// تخزين تاريخ المحادثات لكل جلسة (TTL=30min, max=500)
const { createSessionStore } = require('./services/sessionStore');
const sessions = createSessionStore();
const eventBus = createEventBus({
  eventLogPath: path.join(__dirname, 'state', 'runtime', 'events', 'events.ndjson'),
});
const jobQueue = createJobQueue({
  concurrency: Number(env.get('OCTOPUS_JOB_CONCURRENCY', '2')) || 2,
  eventBus,
  maxPending: Number(env.get('OCTOPUS_JOB_MAX_PENDING', '100')) || 100,
});
const workerRegistry = createWorkerRegistry();
const taskRuntime = createTaskRuntime({
  eventBus,
  stateDir: path.join(__dirname, 'state', 'runtime'),
  workerRegistry,
  workerAdapter: createWorkerAdapter({
    mode: 'child_process',
    workerRegistry,
    workerDir: path.join(__dirname, 'runtime', 'workers'),
    hostPath: path.join(__dirname, 'runtime', 'workerHost.js'),
  }),
});

const callAI = createAIService({ env, groq, pluginManager, selectModel });
const simplePluginRuntime = createSimplePluginRuntime({
  app,
  pluginsDir,
  loadedPlugins,
  pluginsState,
  loadPluginsState,
  onPluginFailed: (file, error) => {
    hudLog('err', `Plugin failed: ${file} - ${error.message}`);
    hudPluginUpdate(file, 'error', error.message);
  },
  onPluginLoaded: plugin => {
    hudLog('plug', `Plugin loaded: ${plugin.name} v${plugin.version || '1.0.0'}`);
    hudPluginUpdate(plugin.id || plugin.name, 'ok');
  },
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
  jobQueue,
  previewBrainController,
  runBrainController,
  saveTaggedFiles,
  sessions,
  systemPrompt: SYSTEM_PROMPT,
  validateProjectBinding,
});
registerCoreRoutes(app, {
  eventBus,
  ensureProjectMap,
  getEnabledPlugins,
  getProjectContextForTask,
  loadedPlugins,
  sessions,
  buildRealState,
  validateRealState,
  validateProjectBinding,
  rateLimitConfig,
});
registerFileRoutes(app, { ensureProjectMap, appendTodoUpdate, eventBus });
registerSystemRoutes(app);
registerTerminalRoutes(app, { eventBus, terminalLimiter });
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
registerEventRoutes(app, { eventBus });
registerRuntimeRoutes(app, { eventBus, taskRuntime });
registerScanRoutes(app);
registerHudRoutes(app, { callAI, rootDir: path.join(__dirname, '..') });

const server = app.listen(PORT, () => {
  console.log(`🐙 أخطبوط شغّال على http://localhost:${PORT}`);
  initHudWS();
  hudLog('ok', `Server started on http://localhost:${PORT}`);
  eventBus.publish('server.started', { port: Number(PORT) }, { category: 'system', source: 'server' });
  
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

registerPtyTerminalServer(server);

server.on('error', (err) => {
  console.error('❌ Server listen error:', err);
  process.exitCode = 1;
});
