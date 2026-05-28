function registerCoreRoutes(app, {
  eventBus,
  ensureProjectMap,
  getEnabledPlugins,
  getProjectContextForTask,
  loadedPlugins,
  sessions,
  buildRealState,
  rateLimitConfig = {},
  validateRealState,
  validateProjectBinding,
}) {
  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      status: 'ok',
      service: 'octopus-ai',
      uptime: process.uptime(),
      plugins: {
        simple: loadedPlugins.length,
        enabledSimple: getEnabledPlugins().length,
      },
      events: {
        recent: eventBus.getRecent({ limit: 1 }).length,
      },
    });
  });

  // ─── Runtime Permission Inspector ────────────────────────────────────────────
  // يُرجع هوية الطلب الحالية + صلاحياته + سبب الرفض للـ capabilities المحجوبة
  // مُفيد لـ debugging + UI diagnostics
  app.get('/api/runtime/identity', (req, res) => {
    const kernel = req.securityKernel;
    if (!kernel || typeof kernel.inspect !== 'function') {
      return res.json({
        success: true,
        identity: { type: 'unknown', name: 'unknown', role: 'unknown' },
        capabilities: { granted: [], denied: [], count: { granted: 0, denied: 0, total: 0 } },
        message: 'Security kernel not available',
      });
    }

    try {
      const inspection = kernel.inspect(req);
      res.json({ success: true, ...inspection });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── Why Denied — سبب رفض صلاحية محددة ──────────────────────────────────────
  app.get('/api/runtime/why-denied', (req, res) => {
    const kernel = req.securityKernel;
    const capability = String(req.query.capability || '').trim();

    if (!capability) {
      return res.status(400).json({ success: false, error: 'capability query param required' });
    }
    if (!kernel || typeof kernel.whyDenied !== 'function') {
      return res.json({ success: true, capability, allowed: false, reasons: [{ layer: 'system', rule: 'Security kernel unavailable' }] });
    }

    try {
      const result = kernel.whyDenied(req, capability);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/', (_req, res) => {
    res.json({ message: '🐙 أخطبوط يعمل!' });
  });

  app.get('/api/rate-limits', (_req, res) => {
    res.json({ success: true, limits: rateLimitConfig });
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

  app.post('/api/reset', (req, res) => {
    const { sessionId = 'default' } = req.body;
    sessions[sessionId] = [];
    eventBus.publish('session.reset', { sessionId }, { category: 'session', sessionId, source: 'coreRoutes' });
    res.json({ success: true, message: 'تم مسح المحادثة' });
  });

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
}

module.exports = { registerCoreRoutes };
