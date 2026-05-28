/**
 * 🔐 Route-Capability Map — الجدول المركزي لربط المسارات بالصلاحيات
 *
 * بدل تكرار كود الفحص في كل route، هذا الجدول يربط كل مسار
 * بالصلاحية المطلوبة. middleware واحد يفحص كل شيء تلقائياً.
 *
 * الفوائد:
 *   - مبرمج يضيف route جديد → لازم يضيفه هنا (وإلا Enforcement Layer يرفضه)
 *   - كود الفحص في مكان واحد
 *   - تغيير المنطق = تعديل ملف واحد
 *   - الجدول نفسه يصير توثيق للأمان
 *
 * الاستخدام:
 *   const { createCapabilityGuard } = require('./routeCapabilityMap');
 *   app.use('/api', createCapabilityGuard(securityKernel));
 */

'use strict';

const CAPABILITIES = require('./securityKernel').CAPABILITIES;

// ═══════════════════════════════════════════════════════════
// ROUTE-CAPABILITY MAP — الجدول المركزي
// ═══════════════════════════════════════════════════════════
//
// كل entry: [method, pathPattern, capability, resourceExtractor?]
//
// method: 'GET' | 'POST' | 'PUT' | 'DELETE' | '*' (أي method)
// pathPattern: string أو RegExp
// capability: من CAPABILITIES
// resourceExtractor: (req) => string|null — لاستخراج المورد من الطلب

// ═══════════════════════════════════════════════════════════
// PUBLIC PATHS — لا تحتاج capability check (تحقق عبر authMiddleware فقط)
// ملاحظة: /api/health و /api/rate-limits مُضافتان في ENFORCEMENT_SKIP_PATHS داخل index.js
// ═══════════════════════════════════════════════════════════
const PUBLIC_ROUTE_PREFIXES = Object.freeze([
  '/api/events',  // كل events endpoints عامة (streaming + batch)
]);

const ROUTE_CAPABILITY_MAP = [
  // ─── Terminal ───
  ['POST', '/api/terminal',            CAPABILITIES.TERMINAL_EXECUTE,   (req) => req.body?.cwd || req.body?.projectRoot],
  ['POST', '/api/terminal/stream',     CAPABILITIES.TERMINAL_STREAM,    (req) => req.body?.cwd || req.body?.projectRoot],
  ['POST', '/api/terminal/interrupt',  CAPABILITIES.TERMINAL_INTERRUPT],
  ['POST', '/api/run',                 CAPABILITIES.TERMINAL_EXECUTE,   (req) => req.body?.cwd || req.body?.projectRoot],
  ['POST', '/api/stop',                CAPABILITIES.TERMINAL_INTERRUPT],

  // ─── AI / Octopus ───
  ['POST', '/api/octopus',                         CAPABILITIES.AI_CHAT],
  ['POST', '/api/octopus/stream',                  CAPABILITIES.AI_STREAM],
  ['POST', '/api/octopus/preview',                 CAPABILITIES.AI_PREVIEW],
  ['POST', '/api/octopus/parallel',                CAPABILITIES.AI_STREAM],
  ['POST', '/api/octopus/parallel/stream',         CAPABILITIES.AI_STREAM],
  ['GET',  '/api/octopus/jobs',                    CAPABILITIES.AI_CHAT],
  ['GET',  /^\/api\/octopus\/jobs\//,              CAPABILITIES.AI_CHAT],
  ['POST', /^\/api\/octopus\/jobs\/[^/]+\/cancel$/, CAPABILITIES.AI_CHAT],
  ['POST', /^\/api\/octopus\/jobs\//,              CAPABILITIES.AI_CHAT],

  // ─── Files ───
  ['POST', '/api/files/write',            CAPABILITIES.FILE_WRITE,   (req) => req.body?.filePath],
  ['POST', '/api/files/read',             CAPABILITIES.FILE_READ,    (req) => req.body?.filePath],
  ['POST', '/api/files/list',             CAPABILITIES.FILE_READ,    (req) => req.body?.dirPath],
  ['POST', '/api/files/delete',           CAPABILITIES.FILE_DELETE,  (req) => req.body?.filePath],
  ['POST', '/api/files/rename',           CAPABILITIES.FILE_WRITE,   (req) => req.body?.oldPath],
  ['POST', '/api/files/mkdir',            CAPABILITIES.FILE_WRITE,   (req) => req.body?.dirPath],
  ['POST', '/api/files/show-in-explorer', CAPABILITIES.FILE_READ,    (req) => req.body?.filePath],

  // ─── Packages (VSX + NPM) ───
  ['GET',    '/api/npm-packages',                    CAPABILITIES.PACKAGE_SEARCH],
  ['POST',   '/api/npm-packages/install',            CAPABILITIES.PACKAGE_INSTALL,   (req) => req.body?.packageName],
  ['POST',   /^\/api\/npm-packages\/.+\/enable$/,    CAPABILITIES.PACKAGE_INSTALL,   (req) => req.params?.name],
  ['DELETE', /^\/api\/npm-packages\//,               CAPABILITIES.PACKAGE_UNINSTALL, (req) => req.params?.name],
  ['GET',    '/api/npm-search',                      CAPABILITIES.PACKAGE_SEARCH],
  ['GET',    '/api/vsx-search',                      CAPABILITIES.PACKAGE_SEARCH],
  ['GET',    /^\/api\/vsx-extension\//,              CAPABILITIES.PACKAGE_SEARCH],
  ['GET',    '/api/extensions/list',                 CAPABILITIES.PACKAGE_SEARCH],
  ['POST',   '/api/extensions/install',              CAPABILITIES.PACKAGE_INSTALL,   (req) => req.body?.identifier],
  ['POST',   '/api/extensions/install-local-vsix',   CAPABILITIES.PACKAGE_INSTALL],
  ['POST',   '/api/extensions/uninstall',            CAPABILITIES.PACKAGE_UNINSTALL],
  ['POST',   '/api/extensions/activate',             CAPABILITIES.PLUGIN_EXECUTE],
  ['POST',   '/api/extensions/deactivate',           CAPABILITIES.PLUGIN_EXECUTE],
  ['GET',    /^\/api\/extensions\/status\//,         CAPABILITIES.PACKAGE_SEARCH],

  // ─── Marketplace ───
  ['GET',    /^\/api\/marketplace\//,                CAPABILITIES.PACKAGE_SEARCH],
  ['POST',   /^\/api\/marketplace\/install\//,       CAPABILITIES.PACKAGE_INSTALL,   (req) => req.params?.id],
  ['POST',   /^\/api\/marketplace\/uninstall\//,     CAPABILITIES.PACKAGE_UNINSTALL, (req) => req.params?.id],

  // ─── Plugins (Class-based) ───
  ['GET',    '/api/plugins',                         CAPABILITIES.PLUGIN_EXECUTE],
  ['GET',    /^\/api\/plugins\/(?!stats)/,           CAPABILITIES.PLUGIN_EXECUTE],
  ['POST',   /^\/api\/plugins\/.+\/enable/,          CAPABILITIES.PLUGIN_MANAGE],
  ['POST',   /^\/api\/plugins\/.+\/disable/,         CAPABILITIES.PLUGIN_MANAGE],
  ['GET',    '/api/plugins/stats',                   CAPABILITIES.SYSTEM_READ],
  ['POST',   '/api/plugins/reload',                  CAPABILITIES.PLUGIN_MANAGE],

  // ─── Simple Plugins ───
  ['GET',    '/api/simple-plugins',                  CAPABILITIES.PLUGIN_EXECUTE],
  ['POST',   '/api/simple-plugins/install',          CAPABILITIES.PLUGIN_MANAGE],
  ['POST',   /^\/api\/simple-plugins\/.+\/enable$/,  CAPABILITIES.PLUGIN_MANAGE],
  ['POST',   /^\/api\/simple-plugins\/.+\/disable$/, CAPABILITIES.PLUGIN_MANAGE],
  ['DELETE', /^\/api\/simple-plugins\//,             CAPABILITIES.PLUGIN_MANAGE],

  // ─── Git ───
  ['POST', '/api/git/status', CAPABILITIES.GIT_READ],
  ['POST', '/api/git/commit', CAPABILITIES.GIT_WRITE],
  ['POST', '/api/git/diff',   CAPABILITIES.GIT_READ],

  // ─── Workspace ───
  ['GET',  '/api/watch',        CAPABILITIES.WORKSPACE_READ],
  ['POST', '/api/watch/start',  CAPABILITIES.WORKSPACE_WRITE, (req) => req.body?.dirPath],
  ['POST', '/api/watch/stop',   CAPABILITIES.WORKSPACE_WRITE],
  ['POST', '/api/search',       CAPABILITIES.WORKSPACE_READ,  (req) => req.body?.dirPath],

  // ─── Runtime ───
  ['GET',  /^\/api\/runtime\//, CAPABILITIES.SYSTEM_RUNTIME],
  ['POST', /^\/api\/runtime\//, CAPABILITIES.SYSTEM_RUNTIME],

  // ─── Core ───
  ['POST', '/api/project-map', CAPABILITIES.FILE_READ],
  ['POST', '/api/reset',       CAPABILITIES.AI_CHAT],
  ['GET',  '/api/truth/state', CAPABILITIES.SYSTEM_READ],

  // ─── Shim ───
  ['POST', '/api/shim/repair', CAPABILITIES.PLUGIN_EXECUTE],

  // ─── Scan ───
  ['POST', /^\/api\/scan/, CAPABILITIES.FILE_SCAN],

  // ─── HUD ───
  ['POST', /^\/api\/hud\//, CAPABILITIES.AI_CHAT],

  // ─── Security / Governance ───
  ['GET',    '/api/security/dashboard',              CAPABILITIES.SYSTEM_READ],
  ['GET',    '/api/security/report',                 CAPABILITIES.SYSTEM_READ],
  ['GET',    '/api/security/elevations',             CAPABILITIES.SYSTEM_READ],
  ['GET',    '/api/security/capabilities',           CAPABILITIES.SYSTEM_READ],
  ['GET',    '/api/security/audit',                  CAPABILITIES.SYSTEM_READ],
  ['POST',   '/api/security/elevate',                CAPABILITIES.SYSTEM_CONFIG],
  ['DELETE', /^\/api\/security\/elevations\//,       CAPABILITIES.SYSTEM_CONFIG],

  // ─── Debug / Observability (opt-in via DEBUG_ENDPOINTS env) ───
  ['GET', '/api/debug/traces',              CAPABILITIES.SYSTEM_READ],
  ['GET', /^\/api\/debug\/trace\//,         CAPABILITIES.SYSTEM_READ],
  ['GET', '/api/debug/stats',               CAPABILITIES.SYSTEM_READ],
  ['GET', /^\/api\/debug\/session\//,       CAPABILITIES.SYSTEM_READ],
  ['GET', '/api/debug/sessions',            CAPABILITIES.SYSTEM_READ],
];

// ═══════════════════════════════════════════════════════════
// CAPABILITY GUARD MIDDLEWARE
// ═══════════════════════════════════════════════════════════

/**
 * ينشئ middleware يفحص الصلاحيات تلقائياً بناءً على الجدول المركزي
 *
 * المنطق:
 *   1. يبحث عن تطابق في الجدول (method + path)
 *   2. لو وجد → يفحص الصلاحية عبر Security Kernel
 *   3. لو لم يجد → يمر (الـ Enforcement Layer يعالج الحالة لاحقاً)
 */
function createCapabilityGuard(securityKernel) {
  if (!securityKernel || typeof securityKernel.authorize !== 'function') {
    throw new Error('[RouteCapabilityMap] securityKernel with authorize() is required');
  }

  return function capabilityGuard(req, res, next) {
    const method = req.method.toUpperCase();
    // req.path strips the mount prefix (/api) when used inside app.use('/api', ...)
    // req.baseUrl holds the stripped prefix — combine both to get the full path
    const reqPath = (req.baseUrl || '') + (req.path || '');

    // البحث عن تطابق في الجدول
    let matched = null;
    for (const [mapMethod, pathPattern, capability, resourceExtractor] of ROUTE_CAPABILITY_MAP) {
      // فحص method
      if (mapMethod !== '*' && mapMethod !== method) continue;

      // فحص path
      if (typeof pathPattern === 'string') {
        if (reqPath === pathPattern || reqPath.startsWith(pathPattern + '/')) {
          matched = { capability, resourceExtractor };
          break;
        }
      } else if (pathPattern instanceof RegExp) {
        if (pathPattern.test(reqPath)) {
          matched = { capability, resourceExtractor };
          break;
        }
      }
    }

    // لو لا يوجد تطابق → نترك الطلب يمر (الـ Enforcement Layer يعالجه)
    if (!matched) {
      return next();
    }

    // 🔒 فحص الصلاحية عبر Security Kernel (fail-closed)
    const resource = matched.resourceExtractor ? matched.resourceExtractor(req) : null;
    const result = securityKernel.authorize(req, { capability: matched.capability, resource });

    if (!result || result.allowed !== true) {
      return res.status(403).json({
        success: false,
        error: result?.reason || 'Access denied by security policy',
        code: 'FORBIDDEN_BY_POLICY',
      });
    }

    // ✅ مسموح — نضيف علامة للـ Enforcement Layer
    req._capabilityChecked = true;
    req.securityIdentity = result.identity;
    req.authorizedCapability = matched.capability;
    next();
  };
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

/**
 * يرجع قائمة بكل المسارات المسجلة — مفيد للـ debugging والتوثيق
 */
function listRouteCapabilities() {
  return ROUTE_CAPABILITY_MAP.map(([method, pathPattern, capability]) => ({
    method,
    path: typeof pathPattern === 'string' ? pathPattern : pathPattern.toString(),
    capability,
  }));
}

/**
 * يتحقق إن كل route في التطبيق مسجل في الجدول
 * يُستخدم عند التشغيل للتحقق من التغطية
 */
function findUncoveredRoutes(appRoutes = []) {
  const covered = new Set(
    ROUTE_CAPABILITY_MAP
      .filter(([method]) => method !== '*')
      .map(([method, pathPattern]) => {
        const path = typeof pathPattern === 'string' ? pathPattern : pathPattern.source;
        return `${method} ${path}`;
      })
  );
  return appRoutes.filter(route => !covered.has(route));
}

/**
 * assertNoUncheckedRoutes — فحص عند التشغيل
 *
 * يقارن قائمة routes المُعطاة مع الخريطة المركزية.
 * إذا وجد route غير مسجل → يطبع تحذيراً ويرجع false.
 * يُستخدم في index.js عند بدء التشغيل.
 *
 * @param {Array<{method: string, path: string}>} appRoutes — قائمة routes المُستخرجة من Express
 * @param {boolean} strict — إذا true يرمي Error بدل warning فقط
 */
function assertNoUncheckedRoutes(appRoutes = [], { strict = false } = {}) {
  const skipPaths = new Set(['/api/health', '/api/rate-limits', '/']);
  const violations = [];

  for (const { method, path } of appRoutes) {
    const m = (method || '').toUpperCase();
    const p = String(path || '');

    // مسارات عامة مستثناة
    if (skipPaths.has(p)) continue;
    if (PUBLIC_ROUTE_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'))) continue;

    // فحص وجود تطابق في الخريطة
    const matched = ROUTE_CAPABILITY_MAP.some(([mapMethod, pattern]) => {
      if (mapMethod !== '*' && mapMethod !== m) return false;
      if (typeof pattern === 'string') return p === pattern || p.startsWith(pattern + '/');
      if (pattern instanceof RegExp) return pattern.test(p);
      return false;
    });

    if (!matched) violations.push(`${m} ${p}`);
  }

  if (violations.length > 0) {
    const msg = `[SecurityKernel] ${violations.length} unchecked route(s) not in ROUTE_CAPABILITY_MAP:\n` +
      violations.map(v => `  ❌ ${v}`).join('\n');
    if (strict) throw new Error(msg);
    console.error(msg);
    return false;
  }

  console.log(`[SecurityKernel] ✅ All ${appRoutes.length} routes covered by capability map`);
  return true;
}

module.exports = {
  PUBLIC_ROUTE_PREFIXES,
  ROUTE_CAPABILITY_MAP,
  assertNoUncheckedRoutes,
  createCapabilityGuard,
  findUncoveredRoutes,
  listRouteCapabilities,
};
