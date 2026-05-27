/**
 * 🏛️ Governance Layer — طبقة الحوكمة فوق Security Kernel
 *
 * المشكلة: الأمان بدون حوكمة = بيروقراطية
 *   - كل طلب يمر عبر 4 طبقات فحص
 *   - لكن مَنْ يقرر متى نُرخّص؟ مَنْ يُصادق على الاستثناءات؟
 *
 * الحل: 3 مكونات
 *   1. Token Scopes — تدرج في الصلاحيات (مو admin أو لا شيء)
 *   2. Elevation API — طلب صلاحية مؤقتة مع سبب ومدة
 *   3. Security Dashboard — رؤية + تحكم مركزي
 *
 * البنية:
 *   ┌─────────────────────────────────────────────────┐
 *   │          Governance Layer (هذا الملف)            │
 *   │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
 *   │  │ Token    │ │Elevation │ │ Security         │ │
 *   │  │ Scopes   │ │ Requests │ │ Dashboard        │ │
 *   │  └──────────┘ └──────────┘ └──────────────────┘ │
 *   └──────────────────────┬──────────────────────────┘
 *                          ▼
 *   ┌─────────────────────────────────────────────────┐
 *   │          Security Kernel (موجود)                 │
 *   └─────────────────────────────────────────────────┘
 */

'use strict';

const crypto = require('crypto');
const { CAPABILITIES, ROLES } = require('./securityKernel');

// ═══════════════════════════════════════════════════════════
// 1. TOKEN SCOPES — تدرج في الصلاحيات
// ═══════════════════════════════════════════════════════════
//
// بدل token واحد = admin، كل token له scope محدد:
//
// OCTOPUS_TOKEN_ADMIN=xxx     → وصول كامل
// OCTOPUS_TOKEN_DEV=yyy       → تطوير (terminal, files, ai)
// OCTOPUS_TOKEN_VIEWER=zzz    → قراءة فقط
// OCTOPUS_TOKEN_CI=www        → CI/CD فقط (files:read, git:read)
//
// أو طريقة أدق — scope string:
// OCTOPUS_TOKEN_CUSTOM="terminal:execute,file:read,ai:chat"

/**
 * يحلل scope string إلى Set من الصلاحيات
 * مثال: "terminal:execute,file:read,ai:chat"
 */
function parseScopeString(scopeStr) {
  if (!scopeStr || typeof scopeStr !== 'string') return null;

  const caps = new Set();
  const parts = scopeStr.split(',').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    // لو part = اسم role كامل (admin, developer, viewer, plugin)
    const roleDef = ROLES[part.toLowerCase()];
    if (roleDef) {
      for (const cap of roleDef.capabilities) {
        caps.add(cap);
      }
      continue;
    }
    // لو part = capability محدد
    const capValues = Object.values(CAPABILITIES);
    if (capValues.includes(part)) {
      caps.add(part);
      continue;
    }
    // لو part = wildcard مثل "terminal:*"
    if (part.endsWith(':*')) {
      const prefix = part.slice(0, -1); // "terminal:"
      for (const cap of capValues) {
        if (cap.startsWith(prefix)) caps.add(cap);
      }
      continue;
    }
  }

  return caps.size > 0 ? caps : null;
}

/**
 * يقرأ tokens من البيئة وينشئ identity resolvers
 *
 * يدعم:
 *   - OCTOPUS_TOKEN_ADMIN=xxx     → role: admin
 *   - OCTOPUS_TOKEN_DEV=yyy       → role: developer
 *   - OCTOPUS_TOKEN_VIEWER=zzz    → role: viewer
 *   - OCTOPUS_TOKEN_CI=www        → role: viewer + scope
 *   - OCTOPUS_TOKEN_CUSTOM=aaa    → scope string
 *   - OCTOPUS_CUSTOM_SCOPES=aaa:terminal:execute,file:read
 */
function createScopedTokenResolvers(env = process.env) {
  const resolvers = [];

  // ─── Tokens ذات الأدوار المعرفة مسبقاً ───
  const roleTokens = [
    { envKey: 'OCTOPUS_TOKEN_ADMIN',    role: 'admin' },
    { envKey: 'OCTOPUS_TOKEN_DEV',      role: 'developer' },
    { envKey: 'OCTOPUS_TOKEN_VIEWER',   role: 'viewer' },
    { envKey: 'OCTOPUS_TOKEN_CI',       role: 'viewer' },  // CI يبدأ بـ viewer ويُضاف عليه scope
    { envKey: 'OCTOPUS_TOKEN_PLUGIN',   role: 'plugin' },
  ];

  for (const { envKey, role } of roleTokens) {
    const token = env[envKey];
    if (!token) continue;

    const roleDef = ROLES[role];
    if (!roleDef) continue;

    // CI token يحصل على صلاحيات إضافية من scope
    let capabilities = roleDef.capabilities;
    if (role === 'viewer' && envKey === 'OCTOPUS_TOKEN_CI') {
      const ciScope = env.OCTOPUS_CI_SCOPE;
      const extraCaps = parseScopeString(ciScope);
      if (extraCaps) {
        capabilities = new Set([...roleDef.capabilities, ...extraCaps]);
      }
    }

    resolvers.push(createTokenResolver({
      token,
      identity: {
        type: 'token',
        name: `${role}:${envKey}`,
        role,
        capabilities,
      },
    }));
  }

  // ─── Custom scoped tokens ───
  // OCTOPUS_CUSTOM_SCOPES="token1:terminal:execute,file:read;token2:ai:*"
  const customScopes = env.OCTOPUS_CUSTOM_SCOPES;
  if (customScopes) {
    const entries = customScopes.split(';').map(s => s.trim()).filter(Boolean);
    for (const entry of entries) {
      const [token, scopeStr] = entry.split(':').length >= 2
        ? [entry.split(':')[0], entry.slice(entry.indexOf(':') + 1)]
        : [entry, ''];
      if (!token || !scopeStr) continue;

      const capabilities = parseScopeString(scopeStr);
      if (!capabilities) continue;

      resolvers.push(createTokenResolver({
        token,
        identity: {
          type: 'token',
          name: `custom:${token.slice(0, 8)}...`,
          role: 'custom',
          capabilities,
        },
      }));
    }
  }

  return resolvers;
}

/**
 * ينشئ identity resolver لـ token محدد
 */
function createTokenResolver({ token, identity }) {
  return function scopedTokenResolver(req) {
    const clientToken = req.get?.('X-Octopus-Token')
      || req.get?.('Authorization')?.replace(/^Bearer\s+/i, '')
      || '';

    if (!clientToken || !token) return null;

    // timing-safe comparison
    const left = Buffer.from(String(clientToken));
    const right = Buffer.from(String(token));
    if (left.length !== right.length) return null;
    if (!crypto.timingSafeEqual(left, right)) return null;

    return { ...identity };
  };
}

// ═══════════════════════════════════════════════════════════
// 2. ELEVATION API — طلب صلاحية مؤقتة
// ═══════════════════════════════════════════════════════════
//
// مشكلة: Policy تقول "لا" — لكن أحياناً تحتاج تقول "نعم مؤقتاً"
// مثال: developer يحتاج تثبيت حزمة واحدة في production
//
// الحل: Elevation Request
//   1. المستخدم يطلب صلاحية مؤقتة مع سبب ومدة
//   2. الطلب يُسجّل في Audit Log
//   3. الصلاحية تُمنح مؤقتاً (5-30 دقيقة)
//   4. تنتهي تلقائياً

const ELEVATION_DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 دقائق
const ELEVATION_MAX_TTL_MS = 30 * 60 * 1000;    // 30 دقيقة حد أقصى
const ELEVATION_MAX_ACTIVE = 50;                  // حد أقصى طلبات نشطة

class ElevationStore {
  constructor() {
    this._active = new Map(); // id → { capability, identity, reason, expiresAt }
  }

  /**
   * إنشاء طلب صلاحية مؤقتة
   */
  request({ identity, capability, reason, ttlMs = ELEVATION_DEFAULT_TTL_MS }) {
    // تنظيف المنتهية
    this._cleanup();

    if (this._active.size >= ELEVATION_MAX_ACTIVE) {
      return { granted: false, reason: 'Too many active elevation requests' };
    }

    const clampedTtl = Math.min(Math.max(ttlMs, 60000), ELEVATION_MAX_TTL_MS);
    const id = crypto.randomUUID();
    const expiresAt = Date.now() + clampedTtl;

    this._active.set(id, {
      id,
      capability,
      identity: { type: identity.type, name: identity.name, role: identity.role },
      reason: String(reason || '').slice(0, 500),
      requestedAt: new Date().toISOString(),
      expiresAt,
      ttlMs: clampedTtl,
    });

    return { granted: true, elevationId: id, expiresAt, ttlMs: clampedTtl };
  }

  /**
   * التحقق من وجود صلاحية مؤقتة فعالة
   */
  hasElevation(identity, capability) {
    this._cleanup();
    for (const [, elev] of this._active) {
      if (elev.identity.type === identity.type
        && elev.identity.name === identity.name
        && elev.capability === capability
        && elev.expiresAt > Date.now()) {
        return true;
      }
    }
    return false;
  }

  /**
   * إلغاء طلب صلاحية
   */
  revoke(id) {
    return this._active.delete(id);
  }

  /**
   * إلغاء كل طلبات هوية معينة
   */
  revokeAll(identity) {
    let count = 0;
    for (const [id, elev] of this._active) {
      if (elev.identity.type === identity.type && elev.identity.name === identity.name) {
        this._active.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * قائمة الطلبات النشطة
   */
  listActive() {
    this._cleanup();
    return [...this._active.values()];
  }

  /**
   * إحصائيات
   */
  getStats() {
    this._cleanup();
    return {
      active: this._active.size,
      maxAllowed: ELEVATION_MAX_ACTIVE,
      defaultTtlMs: ELEVATION_DEFAULT_TTL_MS,
      maxTtlMs: ELEVATION_MAX_TTL_MS,
    };
  }

  _cleanup() {
    const now = Date.now();
    for (const [id, elev] of this._active) {
      if (elev.expiresAt <= now) {
        this._active.delete(id);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// 3. SECURITY DASHBOARD — رؤية + تحكم مركزي
// ═══════════════════════════════════════════════════════════
//
// يجمع كل المعلومات الأمنية في مكان واحد:
//   - Audit log stats
//   - Active elevations
//   - Token configurations
//   - Policy coverage
//   - Recent denials

class SecurityDashboard {
  constructor({ securityKernel, elevationStore, routeCapabilityMap }) {
    this._kernel = securityKernel;
    this._elevation = elevationStore;
    this._routeMap = routeCapabilityMap;
  }

  /**
   * لوحة المعلومات الرئيسية
   */
  getOverview() {
    const auditStats = this._kernel?.auditLog?.getStats() || { total: 0, allowed: 0, denied: 0 };
    const elevStats = this._elevation?.getStats() || {};
    const routeCoverage = this._routeMap ? this._routeMap.length : 0;

    // آخر 10 طلبات مرفوضة
    const recentDenials = this._kernel?.auditLog?.getEntries({
      result: 'denied',
      limit: 10,
    }) || [];

    return {
      timestamp: new Date().toISOString(),
      audit: auditStats,
      elevation: elevStats,
      routeCoverage,
      recentDenials: recentDenials.map(d => ({
        time: d.timestamp,
        capability: d.capability,
        identity: d.identity?.name || 'unknown',
        reason: d.metadata?.reason || d.metadata?.policy || 'unknown',
      })),
      kernelStatus: this._kernel ? 'active' : 'unavailable',
    };
  }

  /**
   * تقرير أمني مفصّل
   */
  getDetailedReport() {
    const overview = this.getOverview();

    // توزيع الرفض حسب الصلاحية
    const denialsByCapability = {};
    const allDenials = this._kernel?.auditLog?.getEntries({ result: 'denied', limit: 500 }) || [];
    for (const d of allDenials) {
      const cap = d.capability || 'unknown';
      denialsByCapability[cap] = (denialsByCapability[cap] || 0) + 1;
    }

    // توزيع الرفض حسب الهوية
    const denialsByIdentity = {};
    for (const d of allDenials) {
      const name = d.identity?.name || 'anonymous';
      denialsByIdentity[name] = (denialsByIdentity[name] || 0) + 1;
    }

    return {
      ...overview,
      denialsByCapability,
      denialsByIdentity,
      activeElevations: this._elevation?.listActive() || [],
      routes: this._routeMap || [],
    };
  }
}

// ═══════════════════════════════════════════════════════════
// 4. GOVERNANCE-KERNEL BRIDGE
// ═══════════════════════════════════════════════════════════
//
// يربط الـ Governance Layer بالـ Security Kernel
// يضيف Elevation كـ مصدر إضافي للصلاحيات

function createGovernanceLayer({ securityKernel, env = process.env }) {
  const elevationStore = new ElevationStore();
  const scopedTokenResolvers = createScopedTokenResolvers(env);

  // إضافة scoped token resolvers إلى الـ kernel
  if (securityKernel && securityKernel._identityResolvers) {
    // إضافة قبل الـ local resolver (أولوية أعلى)
    const localIdx = securityKernel._identityResolvers.findIndex(
      r => r.name === 'localResolver'
    );
    if (localIdx >= 0) {
      securityKernel._identityResolvers.splice(localIdx, 0, ...scopedTokenResolvers);
    } else {
      securityKernel._identityResolvers.push(...scopedTokenResolvers);
    }
  }

  // تعديل authorize() لدعم Elevation
  const originalAuthorize = securityKernel.authorize.bind(securityKernel);
  securityKernel.authorize = function governedAuthorize(req, { capability, resource }) {
    // أولاً: الفحص العادي
    const result = originalAuthorize(req, { capability, resource });

    // لو مسموح → لا حاجة لـ elevation
    if (result && result.allowed === true) return result;

    // لو مرفوض → نتحقق من وجود elevation فعّال
    const identity = securityKernel.resolveIdentity(req);
    if (elevationStore.hasElevation(identity, capability)) {
      securityKernel.auditLog.log({
        action: 'authorize',
        identity,
        capability,
        resource,
        result: 'allowed',
        metadata: { reason: 'elevation_granted' },
      });
      return { allowed: true, identity, elevated: true };
    }

    return result;
  };

  // إنشاء Dashboard
  const { listRouteCapabilities } = require('./routeCapabilityMap');
  const dashboard = new SecurityDashboard({
    securityKernel,
    elevationStore,
    routeCapabilityMap: listRouteCapabilities(),
  });

  return {
    dashboard,
    elevationStore,
    scopedTokenResolvers,
  };
}

// ═══════════════════════════════════════════════════════════
// 5. GOVERNANCE ROUTES — API endpoints
// ═══════════════════════════════════════════════════════════

function registerGovernanceRoutes(app, { governanceLayer, securityKernel }) {
  const { dashboard, elevationStore } = governanceLayer;

  // ─── Dashboard: نظرة عامة ───
  app.get('/api/security/dashboard', (req, res) => {
    // فقط admin يقدر يشوف الـ dashboard
    const identity = securityKernel.resolveIdentity(req);
    if (identity.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    res.json({ success: true, dashboard: dashboard.getOverview() });
  });

  // ─── Dashboard: تقرير مفصّل ───
  app.get('/api/security/report', (req, res) => {
    const identity = securityKernel.resolveIdentity(req);
    if (identity.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    res.json({ success: true, report: dashboard.getDetailedReport() });
  });

  // ─── Elevation: طلب صلاحية مؤقتة ───
  app.post('/api/security/elevate', (req, res) => {
    const identity = securityKernel.resolveIdentity(req);
    if (identity.type === 'anonymous') {
      return res.status(401).json({ success: false, error: 'Authentication required for elevation' });
    }

    const { capability, reason, ttlMs } = req.body || {};
    if (!capability) {
      return res.status(400).json({ success: false, error: 'capability is required' });
    }

    // التحقق إن الصلاحية موجودة
    const allCaps = Object.values(CAPABILITIES);
    if (!allCaps.includes(capability)) {
      return res.status(400).json({ success: false, error: `Unknown capability: ${capability}` });
    }

    const result = elevationStore.request({
      identity,
      capability,
      reason,
      ttlMs,
    });

    // تسجيل في Audit Log
    securityKernel.auditLog.log({
      action: 'elevation_request',
      identity,
      capability,
      resource: null,
      result: result.granted ? 'allowed' : 'denied',
      metadata: { reason, elevationId: result.elevationId },
    });

    res.json({ success: result.granted, ...result });
  });

  // ─── Elevation: قائمة الطلبات النشطة ───
  app.get('/api/security/elevations', (req, res) => {
    const identity = securityKernel.resolveIdentity(req);
    if (identity.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    res.json({ success: true, elevations: elevationStore.listActive(), stats: elevationStore.getStats() });
  });

  // ─── Elevation: إلغاء طلب ───
  app.delete('/api/security/elevations/:id', (req, res) => {
    const identity = securityKernel.resolveIdentity(req);
    if (identity.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    const revoked = elevationStore.revoke(req.params.id);
    securityKernel.auditLog.log({
      action: 'elevation_revoke',
      identity,
      capability: null,
      resource: req.params.id,
      result: revoked ? 'allowed' : 'denied',
    });
    res.json({ success: revoked });
  });

  // ─── Capabilities: قائمة كل الصلاحيات المتاحة ───
  app.get('/api/security/capabilities', (req, res) => {
    res.json({ success: true, capabilities: CAPABILITIES, roles: Object.fromEntries(
      Object.entries(ROLES).map(([name, def]) => [name, {
        description: def.description,
        capabilities: [...def.capabilities],
      }])
    )});
  });

  // ─── Audit: آخر الأحداث ───
  app.get('/api/security/audit', (req, res) => {
    const identity = securityKernel.resolveIdentity(req);
    if (identity.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    const { result, capability, limit } = req.query;
    const entries = securityKernel.auditLog.getEntries({
      result: result || undefined,
      capability: capability || undefined,
      limit: Math.min(Number(limit) || 100, 500),
    });
    res.json({ success: true, entries, count: entries.length });
  });
}

module.exports = {
  ELEVATION_DEFAULT_TTL_MS,
  ELEVATION_MAX_TTL_MS,
  ElevationStore,
  SecurityDashboard,
  createGovernanceLayer,
  createScopedTokenResolvers,
  createTokenResolver,
  parseScopeString,
  registerGovernanceRoutes,
};
