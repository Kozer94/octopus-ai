/**
 * Debug Routes — Octopus AI Observability Layer
 *
 * Opt-in: يجب تفعيله صراحةً — غير متاح افتراضياً في production
 *   DEBUG_ENDPOINTS=true   → يُفعّل جميع الـ endpoints
 *
 * المسارات:
 *   GET /api/debug/traces              — آخر N spans
 *   GET /api/debug/trace/:requestId    — span محدد
 *   GET /api/debug/stats               — إحصائيات الـ telemetry
 *   GET /api/debug/sessions            — قائمة الـ sessions النشطة
 *   GET /api/debug/session/:sessionId  — تفاصيل session محدد
 *
 * الأمان:
 *   - يتطلب SYSTEM_READ capability (موثق في routeCapabilityMap)
 *   - في production بدون DEBUG_ENDPOINTS=true يُعيد 404
 */

'use strict';

const { getSpan, listSpans, getStats } = require('../services/telemetryService');
const logger = require('../services/logger').withContext('debug-routes');

const IS_DEBUG_ENABLED =
  process.env.DEBUG_ENDPOINTS === 'true' || process.env.NODE_ENV !== 'production';

function guardDebug(res) {
  if (!IS_DEBUG_ENABLED) {
    res.status(404).json({ success: false, error: 'Debug endpoints disabled. Set DEBUG_ENDPOINTS=true to enable.' });
    return false;
  }
  return true;
}

function registerDebugRoutes(app, { sessions }) {
  // ── GET /api/debug/traces ────────────────────────────────────
  app.get('/api/debug/traces', (req, res) => {
    if (!guardDebug(res)) return;
    const limit  = Math.min(Number(req.query.limit) || 50, 200);
    const spans  = listSpans(limit);
    res.json({ success: true, count: spans.length, spans });
  });

  // ── GET /api/debug/trace/:requestId ─────────────────────────
  app.get('/api/debug/trace/:requestId', (req, res) => {
    if (!guardDebug(res)) return;
    const span = getSpan(req.params.requestId);
    if (!span) return res.status(404).json({ success: false, error: 'Span not found' });
    res.json({ success: true, span });
  });

  // ── GET /api/debug/stats ─────────────────────────────────────
  app.get('/api/debug/stats', (req, res) => {
    if (!guardDebug(res)) return;
    res.json({ success: true, telemetry: getStats() });
  });

  // ── GET /api/debug/sessions ──────────────────────────────────
  app.get('/api/debug/sessions', (req, res) => {
    if (!guardDebug(res)) return;
    const list = typeof sessions.listSessions === 'function'
      ? sessions.listSessions()
      : [];
    res.json({ success: true, count: list.length, sessions: list });
  });

  // ── GET /api/debug/session/:sessionId ───────────────────────
  app.get('/api/debug/session/:sessionId', (req, res) => {
    if (!guardDebug(res)) return;
    const { sessionId } = req.params;
    const messages = sessions[sessionId];
    if (!messages) return res.status(404).json({ success: false, error: 'Session not found' });
    const meta = typeof sessions.getMeta === 'function' ? sessions.getMeta(sessionId) : null;
    res.json({
      success: true,
      sessionId,
      messageCount: messages.length,
      meta,
      // لا نُعيد محتوى الرسائل لتجنب تسرب البيانات — فقط الـ roles
      messageRoles: messages.map(m => m.role),
    });
  });

  logger.info(`Debug endpoints registered (enabled: ${IS_DEBUG_ENABLED})`);
}

module.exports = { registerDebugRoutes };
