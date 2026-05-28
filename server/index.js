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
const { createExtensionHostService } = require('./services/extensionHostService');
const { createShimPolyfillService } = require('./services/shimPolyfillService');
const { appendTodoUpdate } = require('./services/todoLogService');
const { createAuthMiddleware } = require('./services/authService');
const { createRequestGuard } = require('./services/inputValidation');
const { createSecurityKernel, CAPABILITIES, ROLES, PolicyRule } = require('./services/securityKernel');
const { createErrorSelfHealService } = require('./services/errorSelfHealService');
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
const { registerHudAiFixRoutes } = require('./routes/hudAiFix');
const { registerHudApplyPatchRoutes } = require('./routes/hudApplyPatch');
const { registerShimRoutes } = require('./routes/shim');
const { registerDebugRoutes } = require('./routes/debug');
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
  if (err?.code === 'EPERM' && err?.syscall === 'watch') {
    console.warn(`⚠️ Ignored filesystem watch permission error: ${err.message}`);
    return;
  }
  console.error('❌ Uncaught Exception:', err);
  process.exitCode = 1;
});

const {
  aiLimiter,
  config: rateLimitConfig,
  eventsBurstGuard,
  limiter,
  mutationLimiter,
  terminalLimiter,
} = createApiRateLimiters(env);

app.use(cors(createCorsOptions()));
app.use(express.json());
app.use(limiter);

// Debug logging for request body issues
app.use('/api', (req, res, next) => {
  if (req.method === 'POST' && !req.body) {
    console.warn(`⚠️ Missing req.body for ${req.method} ${req.path}`);
    console.warn(`Headers:`, req.headers['content-type']);
  }
  next();
});

app.use('/api', createAuthMiddleware());
app.use('/api', createRequestGuard());
app.use(eventsBurstGuard);
app.use('/api', mutationLimiter);

// ═══════════════════════════════════════════════════════════
// 🔐 Security Kernel — نظام الأمان المركزي
// ═══════════════════════════════════════════════════════════
// ─── Governance Layer — الحوكمة والمرونة المُحكمة ───
const { createScopedTokenResolvers, ElevationStore } = require('./services/governanceLayer');
const elevationStore = new ElevationStore();

const securityKernel = createSecurityKernel({
  // ─── Identity Resolvers — تدرج في الصلاحيات ───
  identityResolvers: [
    // 🔑 Scoped tokens (أولوية — من OCTOPUS_TOKEN_DEV, OCTOPUS_TOKEN_VIEWER, etc.)
    ...createScopedTokenResolvers(process.env),
    // 🔑 Legacy admin token (OCTOPUS_API_TOKEN)
    (req) => {
      const token = String(req.get?.('X-Octopus-Token') || req.get?.('Authorization')?.replace(/^Bearer\s+/i, '') || '').trim();
      const configuredToken = String(env.get('OCTOPUS_API_TOKEN', '')).trim();
      if (configuredToken && token && token === configuredToken) {
        return { type: 'token', name: 'legacy-admin', role: 'admin', capabilities: ROLES.admin.capabilities };
      }
      return null;
    },
    // 🛠️ Local dev identity — يعطي developer role لطلبات localhost في وضع التطوير
    // يُفعَّل فقط عندما لا يوجد token مُعرَّف في السيرفر
    (req) => {
      if (process.env.NODE_ENV === 'production') return null;
      // لو مرّ من authMiddleware كـ local dev (لا يوجد token مُعرَّف)
      if (!req._localDevAuth) return null;
      return {
        type: 'local',
        name: 'local-developer',
        role: 'developer',
        capabilities: ROLES.developer.capabilities,
      };
    },
  ],

  // ─── Policy Rules — قواعد السياسة المركزية ───
  policies: [
    // 🔴 قاعدة 1: منع أي وصول من مصدر غير محلي بدون token
    new PolicyRule({
      name: 'deny-remote-without-token',
      priority: 100,
      condition: ({ identity, req }) => {
        const remoteAddress = req.ip || req.socket?.remoteAddress || '';
        const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(String(remoteAddress));
        return !isLocal && identity.type === 'anonymous';
      },
      effect: 'deny',
    }),
    // 🔴 قاعدة 2: منع تثبيت حزم في وضع الإنتاج بدون صلاحية admin
    new PolicyRule({
      name: 'deny-package-install-non-admin-production',
      priority: 90,
      condition: ({ identity, capability }) => {
        if (capability !== CAPABILITIES.PACKAGE_INSTALL) return false;
        if (process.env.NODE_ENV !== 'production') return false;
        if (identity.role === 'admin') return false;
        if (elevationStore.hasElevation(identity, capability)) return false;
        return true;
      },
      effect: 'deny',
    }),
    // 🟡 قاعدة 3: منع عمليات terminal الخطيرة حتى مع الصلاحية
    new PolicyRule({
      name: 'deny-dangerous-terminal-commands',
      priority: 80,
      condition: ({ capability, req, identity }) => {
        if (capability !== CAPABILITIES.TERMINAL_EXECUTE) return false;
        if (identity.role === 'admin') return false;
        if (elevationStore.hasElevation(identity, capability)) return false;
        const cmd = req.body?.command || '';
        return /\b(rm\s+-rf|format|shutdown|reboot|del\s+\/f)\b/i.test(cmd);
      },
      effect: 'deny',
    }),
    // 🟡 قاعدة 4: منع كتابة ملفات النظام
    new PolicyRule({
      name: 'deny-system-file-write',
      priority: 70,
      condition: ({ capability, resource, identity }) => {
        if (capability !== CAPABILITIES.FILE_WRITE || !resource) return false;
        if (identity.role === 'admin') return false;
        if (elevationStore.hasElevation(identity, capability)) return false;
        const normalized = String(resource).replace(/\\/g, '/').toLowerCase();
        const systemPaths = ['server/services/authservice', 'server/services/securitykernel',
          'server/services/httpssecurity', 'server/services/terminalservice',
          'server/services/pluginsandbox', 'server/services/protectedfiles',
          'server/services/governancelayer', 'server/services/routecapabilitymap',
          'server/index.js', 'server/validatorlayer', 'server/truthlayer'];
        return systemPaths.some(p => normalized.includes(p));
      },
      effect: 'deny',
    }),
  ],
});

// ─── Resource Guards — حماية الموارد ───
const { isProtectedFile, isSensitiveProtectedFile } = require('./services/protectedFiles');
const { FORBIDDEN_PATH_PATTERNS } = require('./validatorLayer');

// حماية كتابة الملفات — منع الكتابة على ملفات النظام والملفات الحساسة
securityKernel.registerResourceGuard(CAPABILITIES.FILE_WRITE, (filePath, identity) => {
  if (identity.role === 'admin') return { allowed: true }; // admin يتجاوز حماية الملفات
  if (isProtectedFile(filePath) || isSensitiveProtectedFile(filePath)) {
    return { allowed: false, reason: `File is protected: ${path.basename(filePath)}` };
  }
  return { allowed: true };
});

// حماية تثبيت الحزم — منع الحزم ذات الأسماء المشبوهة
securityKernel.registerResourceGuard(CAPABILITIES.PACKAGE_INSTALL, (packageName, identity) => {
  if (identity.role === 'admin') return { allowed: true };
  const suspicious = /^(octopus-security|octopus-auth|octopus-admin|octopus-system)/i;
  if (suspicious.test(packageName)) {
    return { allowed: false, reason: `Package name "${packageName}" is suspicious` };
  }
  return { allowed: true };
});

// حماية Terminal — منع الأوامر خارج مجلد المشروع
securityKernel.registerResourceGuard(CAPABILITIES.TERMINAL_EXECUTE, (cwd, identity) => {
  if (identity.role === 'admin') return { allowed: true };
  const resolved = path.resolve(String(cwd || process.cwd()));
  const isForbidden = FORBIDDEN_PATH_PATTERNS?.some(pattern => pattern.test(resolved));
  if (isForbidden) {
    return { allowed: false, reason: 'Working directory is in a forbidden system path' };
  }
  return { allowed: true };
});

// 🔐 Security Kernel middleware — يضاف بعد المصادقة وقبل الـ routes
app.use('/api', (req, res, next) => {
  req.securityKernel = securityKernel;
  req.capabilities = CAPABILITIES;
  next();
});

// 🔐 Route-Capability Guard — فحص صلاحيات مركزي تلقائي
const { createCapabilityGuard, listRouteCapabilities, PUBLIC_ROUTE_PREFIXES } = require('./services/routeCapabilityMap');
app.use('/api', createCapabilityGuard(securityKernel));

// 🔒 Enforcement Layer — يحجب أي route غير مسجل في كل البيئات (fail-closed)
const ENFORCEMENT_SKIP_PATHS = new Set([
  '/api/health',
  '/api/rate-limits',
  '/',
]);

app.use('/api', (req, res, next) => {
  // req.path strips the mount prefix — reconstruct full path
  const reqPath = (req.baseUrl || '') + req.path;

  // مسارات ثابتة مستثناة (health, rate-limits)
  if (ENFORCEMENT_SKIP_PATHS.has(reqPath)) {
    req._capabilityChecked = true;
    return next();
  }

  // مسارات public (events) — مستثناة من فحص الـ capability
  if (PUBLIC_ROUTE_PREFIXES.some(p => reqPath === p || reqPath.startsWith(p + '/'))) {
    req._capabilityChecked = true;
    return next();
  }

  // ✅ مسجّل عبر Capability Guard أو فحص يدوي داخل الـ route
  if (req._capabilityChecked) {
    return next();
  }

  // 🚫 HARD BLOCK — route غير مسجل في الخريطة: مرفوض في كل البيئات
  console.error(`❌ [SecurityKernel] BLOCKED unregistered route: ${req.method} ${reqPath}`);
  return res.status(403).json({
    success: false,
    error: `Route "${req.method} ${reqPath}" is not registered in the security capability map`,
    code: 'ROUTE_NOT_REGISTERED',
  });
});

// ═══════════════════════════════════════════════════════════
// 🏛️ Governance Routes — واجهة الحوكمة
// ═══════════════════════════════════════════════════════════
const { SecurityDashboard: GovDashboard, registerGovernanceRoutes: registerGovRoutes } = require('./services/governanceLayer');

const governanceDashboard = new GovDashboard({
  securityKernel,
  elevationStore,
  routeCapabilityMap: listRouteCapabilities(),
});

// تمرير governance objects للـ routes
registerGovRoutes(app, {
  governanceLayer: {
    dashboard: governanceDashboard,
    elevationStore,
  },
  securityKernel,
});

// Level 3 — Trace ID propagation: يربط كل server event بالـ client request الأصلي
app.use('/api', (req, _res, next) => {
  req.traceId = req.headers['x-trace-id'] || null;
  next();
});

// تخزين تاريخ المحادثات لكل جلسة (TTL=30min, max=500)
const { createSessionStore } = require('./services/sessionStore');
const sessions = createSessionStore();
const eventBus = createEventBus({
  eventLogPath: path.join(__dirname, 'state', 'runtime', 'events', 'events.ndjson'),
});
require('./services/providerHealthService').setEventBus(eventBus);
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

// Initialize error self-heal service
const errorSelfHealService = createErrorSelfHealService({
  eventBus,
  callAI,
  systemPrompt: SYSTEM_PROMPT,
});

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
const extensionHost = createExtensionHostService({
  installedNpmPackages,
  saveNpmPackages,
  rootDir: path.join(__dirname, '..'),
});
const shimPolyfills = createShimPolyfillService();

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
  extensionHost,
  getPackageIcon,
  installedNpmPackages,
  saveNpmPackages,
  rootDir: path.join(__dirname, '..'),
});
registerMarketplaceRoutes(app, { marketplace, pluginManager });
registerEventRoutes(app, { eventBus });
registerRuntimeRoutes(app, { eventBus, taskRuntime });
registerScanRoutes(app);
registerHudAiFixRoutes(app, { callAI });
registerHudApplyPatchRoutes(app, { rootDir: path.join(__dirname, '..') });
registerShimRoutes(app, { shimPolyfills });
registerDebugRoutes(app, { sessions });

async function validateOpenRouterOnStartup(envReader) {
  const { updateHealth, recordSuccess, recordFailure } = require('./services/providerHealthService');
  const apiKey = envReader.get('OPENROUTER_API_KEY', '');
  const modelId = envReader.get('OPENROUTER_MODEL', 'deepseek/deepseek-chat-v3-0324');

  updateHealth({ model: modelId });

  if (!apiKey) {
    console.warn('⚠️ [OpenRouter] No OPENROUTER_API_KEY — OpenRouter provider will be skipped');
    updateHealth({ status: 'offline', available: false, lastError: 'no API key' });
    hudLog('warn', 'OpenRouter: no API key configured');
    return;
  }

  // Phase 1 — model availability check
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const data = await res.json();
      const ids = (data.data || []).map(m => m.id);
      if (!ids.includes(modelId)) {
        console.warn(`⚠️ [OpenRouter] Model "${modelId}" not found — check OPENROUTER_MODEL`);
        hudLog('warn', `OpenRouter: model "${modelId}" not found in available list`);
        updateHealth({ status: 'degraded', lastError: `model not found: ${modelId}` });
        return;
      }
    }
  } catch (err) {
    console.warn(`⚠️ [OpenRouter] Models check failed: ${err.message}`);
  }

  // Phase 2 — warmup completion (lightweight ping)
  try {
    const t0 = Date.now();
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'Say "pong" only.' }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (data.error) throw new Error(typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : data.error);
    const latency = Date.now() - t0;
    console.log(`✅ [OpenRouter] Warmup OK — model: ${modelId}, latency: ${latency}ms`);
    hudLog('ok', `OpenRouter ready — model: ${modelId} (${latency}ms)`);
    recordSuccess('OpenRouter', latency, modelId);
  } catch (err) {
    console.warn(`⚠️ [OpenRouter] Warmup failed: ${err.message}`);
    hudLog('warn', `OpenRouter warmup failed: ${err.message}`);
    recordFailure('OpenRouter', err);
  }
}

const server = app.listen(PORT, () => {
  console.log(`🐙 أخطبوط شغّال على http://localhost:${PORT}`);
  const registeredRoutes = listRouteCapabilities();
  console.log(`🔐 [SecurityKernel] Capability map: ${registeredRoutes.length} routes registered (fail-closed enforcement active)`);
  initHudWS();
  hudLog('ok', `Server started on http://localhost:${PORT}`);
  validateOpenRouterOnStartup(env);
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
