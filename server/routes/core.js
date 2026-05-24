function registerCoreRoutes(app, {
  ensureProjectMap,
  getEnabledPlugins,
  getProjectContextForTask,
  loadedPlugins,
  sessions,
  buildRealState,
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
    });
  });

  app.get('/', (_req, res) => {
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

  app.post('/api/reset', (req, res) => {
    const { sessionId = 'default' } = req.body;
    sessions[sessionId] = [];
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
