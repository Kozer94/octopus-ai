/**
 * 🔐 Security Kernel — محرك الأمان المركزي
 *
 * هذا هو "نظام الدخول المركزي" للشركة.
 * بدل كل خدمة تدافع عن نفسها، كل الطلبات تمر من هنا.
 *
 * البنية:
 *   ┌─────────────────────────────────────────┐
 *   │           Request (from client)          │
 *   └──────────────────┬──────────────────────┘
 *                      ▼
 *   ┌─────────────────────────────────────────┐
 *   │     SecurityKernel.authorize()          │
 *   │  ┌───────────┐ ┌──────────┐ ┌────────┐ │
 *   │  │ Identity  │→│ Policy   │→│Capabil-│ │
 *   │  │ (who?)    │ │ (allowed?)│ │ity    │ │
 *   │  └───────────┘ └──────────┘ └────────┘ │
 *   └──────────────────┬──────────────────────┘
 *                      ▼
 *   ┌─────────────────────────────────────────┐
 *   │          Service (terminal/files/ai)     │
 *   └─────────────────────────────────────────┘
 *
 * المفاهيم:
 *   - Identity: من أنت؟ (token, session, source)
 *   - Policy: ما المسموح؟ (قواعد مركزية)
 *   - Capability: ماذا يمكنك أن تفعل؟ (صلاحيات دقيقة)
 *   - Audit: سجل كل شيء
 */

'use strict';

const path = require('path');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════
// 1. CAPABILITY SYSTEM — الصلاحيات الدقيقة
// ═══════════════════════════════════════════════════════════

/**
 * كل صلاحية هي "قدرة على فعل شيء محدد"
 * مثل بطاقة دخول: "هذه البطاقة تسمح لك بدخول غرفة X فقط"
 */
const CAPABILITIES = Object.freeze({
  // ─── Terminal ───
  TERMINAL_EXECUTE:    'terminal:execute',      // تنفيذ أوامر
  TERMINAL_STREAM:     'terminal:stream',       // بث مخرجات
  TERMINAL_INTERRUPT:  'terminal:interrupt',    // إيقاف عملية

  // ─── AI ───
  AI_CHAT:             'ai:chat',               // محادثة AI
  AI_STREAM:           'ai:stream',             // بث استجابة AI
  AI_PREVIEW:          'ai:preview',            // معاينة قبل التنفيذ

  // ─── Files ───
  FILE_READ:           'file:read',             // قراءة ملف
  FILE_WRITE:          'file:write',            // كتابة ملف
  FILE_DELETE:         'file:delete',           // حذف ملف
  FILE_SCAN:           'file:scan',             // فحص مشروع

  // ─── Packages ───
  PACKAGE_INSTALL:     'package:install',       // تثبيت حزمة
  PACKAGE_UNINSTALL:   'package:uninstall',     // إزالة حزمة
  PACKAGE_SEARCH:      'package:search',        // بحث عن حزمة

  // ─── Plugins ───
  PLUGIN_MANAGE:       'plugin:manage',         // إدارة إضافات
  PLUGIN_EXECUTE:      'plugin:execute',        // تنفيذ إضافة

  // ─── System ───
  SYSTEM_READ:         'system:read',           // قراءة حالة النظام
  SYSTEM_CONFIG:       'system:config',         // تعديل إعدادات
  SYSTEM_RUNTIME:      'system:runtime',        // إدارة runtime

  // ─── Git ───
  GIT_READ:            'git:read',              // قراءة حالة git
  GIT_WRITE:           'git:write',             // عمليات git كتابية

  // ─── Workspace ───
  WORKSPACE_READ:      'workspace:read',        // قراءة مساحة عمل
  WORKSPACE_WRITE:     'workspace:write',       // تعديل مساحة عمل
});

// ═══════════════════════════════════════════════════════════
// 2. ROLES — أدوار المستخدمين (مجموعات صلاحيات)
// ═══════════════════════════════════════════════════════════

/**
 * بدل إعطاء صلاحيات واحدة واحدة، نعطي "دور"
 * كل دور يحتوي مجموعة صلاحيات محددة
 */
const ROLES = Object.freeze({
  admin: {
    name: 'admin',
    description: 'وصول كامل — للمطور الرئيسي فقط',
    capabilities: new Set(Object.values(CAPABILITIES)),
  },
  developer: {
    name: 'developer',
    description: 'وصول تطويري — بدون صلاحيات نظام خطيرة',
    capabilities: new Set([
      CAPABILITIES.TERMINAL_EXECUTE,
      CAPABILITIES.TERMINAL_STREAM,
      CAPABILITIES.TERMINAL_INTERRUPT,
      CAPABILITIES.AI_CHAT,
      CAPABILITIES.AI_STREAM,
      CAPABILITIES.AI_PREVIEW,
      CAPABILITIES.FILE_READ,
      CAPABILITIES.FILE_WRITE,
      CAPABILITIES.FILE_SCAN,
      CAPABILITIES.PACKAGE_INSTALL,
      CAPABILITIES.PACKAGE_UNINSTALL,
      CAPABILITIES.PACKAGE_SEARCH,
      CAPABILITIES.PLUGIN_EXECUTE,
      CAPABILITIES.GIT_READ,
      CAPABILITIES.GIT_WRITE,
      CAPABILITIES.WORKSPACE_READ,
      CAPABILITIES.WORKSPACE_WRITE,
      CAPABILITIES.SYSTEM_READ,
    ]),
  },
  viewer: {
    name: 'viewer',
    description: 'قراءة فقط — بدون تعديل',
    capabilities: new Set([
      CAPABILITIES.AI_CHAT,
      CAPABILITIES.FILE_READ,
      CAPABILITIES.FILE_SCAN,
      CAPABILITIES.PACKAGE_SEARCH,
      CAPABILITIES.GIT_READ,
      CAPABILITIES.WORKSPACE_READ,
      CAPABILITIES.SYSTEM_READ,
    ]),
  },
  plugin: {
    name: 'plugin',
    description: 'صلاحيات محدودة للإضافات',
    capabilities: new Set([
      CAPABILITIES.FILE_READ,
      CAPABILITIES.FILE_WRITE,
      CAPABILITIES.AI_CHAT,
      CAPABILITIES.PLUGIN_EXECUTE,
    ]),
  },
});

// ═══════════════════════════════════════════════════════════
// 3. POLICY RULES — قواعد السياسة المركزية
// ═══════════════════════════════════════════════════════════

/**
 * كل قاعدة هي: "إذا كان الشرط X، فالنتيجة Y"
 * القواعد تُقيّم بالترتيب — أول تطابق يفوز
 */
class PolicyRule {
  constructor({ name, condition, effect, priority = 0 }) {
    this.name = name;
    this.condition = condition;  // دالة تُرجع true/false
    this.effect = effect;        // 'allow' أو 'deny'
    this.priority = priority;    // أولوية أعلى = تُقيّم أولاً
  }
}

// ═══════════════════════════════════════════════════════════
// 4. AUDIT LOG — سجل المراجعة الأمني
// ═══════════════════════════════════════════════════════════

class AuditLog {
  constructor(maxEntries = 5000) {
    this._entries = [];
    this._maxEntries = maxEntries;
  }

  log({ action, identity, capability, resource, result, metadata = {} }) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      identity: identity ? { type: identity.type, name: identity.name } : null,
      capability,
      resource: resource ? String(resource).slice(0, 200) : null,
      result, // 'allowed' | 'denied' | 'error'
      metadata,
    };
    this._entries.push(entry);
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(-this._maxEntries);
    }
    return entry;
  }

  getEntries({ since, result, capability, limit = 100 } = {}) {
    let filtered = this._entries;
    if (since) filtered = filtered.filter(e => new Date(e.timestamp) >= since);
    if (result) filtered = filtered.filter(e => e.result === result);
    if (capability) filtered = filtered.filter(e => e.capability === capability);
    return filtered.slice(-limit);
  }

  getStats() {
    const denied = this._entries.filter(e => e.result === 'denied').length;
    const allowed = this._entries.filter(e => e.result === 'allowed').length;
    return { total: this._entries.length, allowed, denied };
  }
}

// ═══════════════════════════════════════════════════════════
// 5. SECURITY KERNEL — النواة الأمنية المركزية
// ═══════════════════════════════════════════════════════════

class SecurityKernel {
  constructor(options = {}) {
    this.auditLog = new AuditLog(options.maxAuditEntries);
    this._policies = [];
    this._identityResolvers = [];
    this._resourceGuards = new Map();
    this._initialized = false;
  }

  // ─── التهيئة ───

  init({ policies = [], identityResolvers = [] } = {}) {
    this._policies = policies.sort((a, b) => b.priority - a.priority);
    this._identityResolvers = identityResolvers;
    this._initialized = true;
    return this;
  }

  // ─── إدارة الهوية ───

  /**
   * تحديد هوية الطلب — "من أنت؟"
   * يجرب كل الـ resolvers بالترتيب حتى يجد تطابق
   */
  resolveIdentity(req) {
    for (const resolver of this._identityResolvers) {
      const identity = resolver(req);
      if (identity) return identity;
    }
    // افتراضي: غير مصدّق
    return { type: 'anonymous', name: 'anonymous', role: 'viewer', capabilities: ROLES.viewer.capabilities };
  }

  // ─── التفويض المركزي ───

  /**
   * السؤال الأساسي: "هل يُسمح بهذا الطلب؟"
   *
   * الخطوات:
   *   1. تحديد الهوية (من أنت؟)
   *   2. فحص القواعد (هل القواعد تسمح؟)
   *   3. فحص الصلاحيات (هل عندك القدرة؟)
   *   4. فحص المورد (هل المورد نفسه مسموح؟)
   *   5. تسجيل في سجل المراجعة
   */
  authorize(req, { capability, resource = null }) {
    // الخطوة 1: تحديد الهوية
    const identity = this.resolveIdentity(req);

    // الخطوة 2: فحص قواعد السياسة (deny-first)
    for (const policy of this._policies) {
      const context = { identity, capability, resource, req };
      try {
        if (policy.condition(context)) {
          if (policy.effect === 'deny') {
            this.auditLog.log({
              action: 'authorize',
              identity,
              capability,
              resource,
              result: 'denied',
              metadata: { policy: policy.name, reason: 'policy_deny' },
            });
            return {
              allowed: false,
              reason: `Policy "${policy.name}" denied this action`,
              identity,
            };
          }
          // policy.effect === 'allow' — نتابع الفحص
          break;
        }
      } catch {
        // خطأ في تقييم القاعدة — نرفض للأمان
        this.auditLog.log({
          action: 'authorize',
          identity,
          capability,
          resource,
          result: 'error',
          metadata: { policy: policy.name, reason: 'evaluation_error' },
        });
        return {
          allowed: false,
          reason: `Policy "${policy.name}" evaluation error`,
          identity,
        };
      }
    }

    // الخطوة 3: فحص الصلاحيات
    const roleCapabilities = identity.capabilities || ROLES[identity.role]?.capabilities || new Set();
    if (!roleCapabilities.has(capability)) {
      this.auditLog.log({
        action: 'authorize',
        identity,
        capability,
        resource,
        result: 'denied',
        metadata: { reason: 'missing_capability' },
      });
      return {
        allowed: false,
        reason: `Role "${identity.role}" lacks capability "${capability}"`,
        identity,
      };
    }

    // الخطوة 4: فحص المورد (إذا كان هناك حارس خاص)
    if (resource && this._resourceGuards.has(capability)) {
      const guard = this._resourceGuards.get(capability);
      const guardResult = guard(resource, identity);
      if (!guardResult.allowed) {
        this.auditLog.log({
          action: 'authorize',
          identity,
          capability,
          resource,
          result: 'denied',
          metadata: { reason: 'resource_guard', detail: guardResult.reason },
        });
        return {
          allowed: false,
          reason: guardResult.reason,
          identity,
        };
      }
    }

    // ✅ مسموح
    this.auditLog.log({
      action: 'authorize',
      identity,
      capability,
      resource,
      result: 'allowed',
    });
    return { allowed: true, identity };
  }

  // ─── حماية الموارد ───

  /**
   * تسجيل حارس لمورد معين
   * مثال: حماية ملفات النظام من الكتابة
   */
  registerResourceGuard(capability, guardFn) {
    this._resourceGuards.set(capability, guardFn);
    return this;
  }

  // ─── Express Middleware ───

  /**
   * يُنشئ middleware يفحص الصلاحية قبل تنفيذ الطلب
   * الاستخدام: app.post('/api/terminal', kernel.requireCapability(CAPABILITIES.TERMINAL_EXECUTE), handler)
   */
  requireCapability(capability, { resourceExtractor = null } = {}) {
    return (req, res, next) => {
      // 🔒 Fail-closed: لو Kernel غير متاح = مرفوض
      if (!this || !this.authorize) {
        console.error('[SecurityKernel] CRITICAL: kernel or authorize() unavailable — denying by default');
        return res.status(503).json({
          success: false,
          error: 'Security kernel unavailable — request denied',
          code: 'KERNEL_UNAVAILABLE',
        });
      }

      const resource = resourceExtractor ? resourceExtractor(req) : null;
      const result = this.authorize(req, { capability, resource });

      // 🔒 Fail-closed: أي نتيجة غير allowed صريحة = مرفوض
      if (!result || result.allowed !== true) {
        return res.status(403).json({
          success: false,
          error: result?.reason || 'Access denied by security policy',
          code: 'FORBIDDEN_BY_POLICY',
        });
      }

      // نضيف الهوية والصلاحية على الطلب للخدمات اللاحقة
      req.securityIdentity = result.identity;
      req.authorizedCapability = capability;
      req._capabilityChecked = true;  // 🔒 علامة للـ enforcement layer
      next();
    };
  }
}

// ═══════════════════════════════════════════════════════════
// 6. DEFAULT POLICIES — القواعد الافتراضية
// ═══════════════════════════════════════════════════════════

function createDefaultPolicies({ protectedPaths, sensitivePatterns, forbiddenPathPatterns } = {}) {
  return [
    // ─── Deny: كتابة ملفات محمية ───
    new PolicyRule({
      name: 'deny-protected-files-write',
      priority: 100,
      condition: ({ capability, resource }) => {
        if (capability !== CAPABILITIES.FILE_WRITE || !resource) return false;
        const normalized = String(resource).replace(/\\/g, '/').toLowerCase();
        if (protectedPaths && protectedPaths.some(p => normalized.endsWith(p.replace(/\\/g, '/').toLowerCase()))) return true;
        if (sensitivePatterns && sensitivePatterns.some(p => normalized.endsWith(p.toLowerCase()))) return true;
        return false;
      },
      effect: 'deny',
    }),

    // ─── Deny: أوامر تدميرية ───
    new PolicyRule({
      name: 'deny-destructive-terminal',
      priority: 100,
      condition: ({ capability, resource }) => {
        if (capability !== CAPABILITIES.TERMINAL_EXECUTE || !resource) return false;
        const destructive = [/\brm\s+-rf\b/i, /\bformat\b/i, /\bshutdown\b/i, /\breboot\b/i];
        return destructive.some(p => p.test(String(resource)));
      },
      effect: 'deny',
    }),

    // ─── Deny: مسارات نظام ممنوعة ───
    new PolicyRule({
      name: 'deny-system-paths',
      priority: 90,
      condition: ({ capability, resource }) => {
        if (!resource) return false;
        const needsPathCheck = [
          CAPABILITIES.FILE_READ, CAPABILITIES.FILE_WRITE, CAPABILITIES.FILE_DELETE,
          CAPABILITIES.TERMINAL_EXECUTE, CAPABILITIES.PACKAGE_INSTALL,
        ].includes(capability);
        if (!needsPathCheck) return false;
        if (!forbiddenPathPatterns) return false;
        return forbiddenPathPatterns.some(p => p.test(String(resource)));
      },
      effect: 'deny',
    }),

    // ─── Deny: anonymous لا يعدّل ───
    new PolicyRule({
      name: 'deny-anonymous-mutations',
      priority: 80,
      condition: ({ identity, capability }) => {
        if (identity.type === 'anonymous') {
          const mutationCaps = [
            CAPABILITIES.FILE_WRITE, CAPABILITIES.FILE_DELETE,
            CAPABILITIES.TERMINAL_EXECUTE, CAPABILITIES.PACKAGE_INSTALL,
            CAPABILITIES.PACKAGE_UNINSTALL, CAPABILITIES.PLUGIN_MANAGE,
            CAPABILITIES.SYSTEM_CONFIG, CAPABILITIES.GIT_WRITE, CAPABILITIES.WORKSPACE_WRITE,
          ];
          return mutationCaps.includes(capability);
        }
        return false;
      },
      effect: 'deny',
    }),

    // ─── Allow: المصادق عليه يمر ───
    new PolicyRule({
      name: 'allow-authenticated',
      priority: 0,
      condition: ({ identity }) => identity.type !== 'anonymous',
      effect: 'allow',
    }),
  ];
}

// ═══════════════════════════════════════════════════════════
// 7. IDENTITY RESOLVERS — محددات الهوية
// ═══════════════════════════════════════════════════════════

/**
 * تحديد الهوية بناءً على Token
 */
function createTokenIdentityResolver({ token, role = 'developer' }) {
  return function tokenResolver(req) {
    const clientToken = req.get?.('X-Octopus-Token')
      || req.get?.('Authorization')?.replace(/^Bearer\s+/i, '')
      || '';

    if (!clientToken || !token) return null;

    // timing-safe comparison
    const left = Buffer.from(String(clientToken));
    const right = Buffer.from(String(token));
    if (left.length !== right.length) return null;
    if (!crypto.timingSafeEqual(left, right)) return null;

    const roleDef = ROLES[role] || ROLES.developer;
    return {
      type: 'token',
      name: `token:${role}`,
      role,
      capabilities: roleDef.capabilities,
    };
  };
}

/**
 * تحديد الهوية بناءً على المصدر المحلي
 */
function createLocalIdentityResolver({ role = 'admin' } = {}) {
  const localAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);
  return function localResolver(req) {
    const remoteAddress = req.ip || req.socket?.remoteAddress || '';
    if (!localAddresses.has(String(remoteAddress))) return null;

    const roleDef = ROLES[role] || ROLES.admin;
    return {
      type: 'local',
      name: `local:${remoteAddress}`,
      role,
      capabilities: roleDef.capabilities,
    };
  };
}

// ═══════════════════════════════════════════════════════════
// 8. FACTORY — إنشاء Kernel جاهز
// ═══════════════════════════════════════════════════════════

function createSecurityKernel(options = {}) {
  const {
    apiToken = process.env.OCTOPUS_API_TOKEN,
    localRole = process.env.OCTOPUS_LOCAL_ROLE || 'admin',
    tokenRole = process.env.OCTOPUS_TOKEN_ROLE || 'developer',
    protectedPaths = [],
    sensitivePatterns = [],
    forbiddenPathPatterns = [],
    maxAuditEntries = 5000,
  } = options;

  const kernel = new SecurityKernel({ maxAuditEntries });

  // محددات الهوية
  const identityResolvers = [];
  if (apiToken) {
    identityResolvers.push(createTokenIdentityResolver({ token: apiToken, role: tokenRole }));
  }
  identityResolvers.push(createLocalIdentityResolver({ role: localRole }));

  // القواعد الافتراضية
  const policies = createDefaultPolicies({
    protectedPaths,
    sensitivePatterns,
    forbiddenPathPatterns,
  });

  kernel.init({ policies, identityResolvers });
  return kernel;
}

module.exports = {
  CAPABILITIES,
  ROLES,
  AuditLog,
  PolicyRule,
  SecurityKernel,
  createDefaultPolicies,
  createLocalIdentityResolver,
  createSecurityKernel,
  createTokenIdentityResolver,
};
