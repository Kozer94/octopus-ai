const path = require('path');

function registerOctopusRoutes(app, {
  aiLimiter,
  callAI,
  executeHook,
  getProjectContextForTask,
  isReportCommand,
  previewBrainController,
  runBrainController,
  saveTaggedFiles,
  sessions,
  systemPrompt,
  validateProjectBinding,
}) {
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

      fullCommand = await executeHook('beforeSend', fullCommand);

      sessions[sessionId].push({ role: 'user', content: fullCommand });

      if (sessions[sessionId].length > 20) {
        sessions[sessionId] = sessions[sessionId].slice(-20);
      }

      let response = await callAI([
        { role: 'system', content: systemPrompt },
        ...sessions[sessionId]
      ], 100000, command);

      response = await executeHook('afterResponse', response);

      const savedFiles = await saveTaggedFiles(response, binding.projectRoot || projectDir);

      sessions[sessionId].push({ role: 'assistant', content: response });

      res.json({ success: true, result: response, sessionId, savedFiles });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

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

  app.post('/api/octopus/parallel', aiLimiter, async (req, res) => {
    try {
      const {
        command,
        sessionId = 'default',
        activeFile = '',
        activeFileContent = '',
        projectDir = '',
        confirmed = false,
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
          name: path.basename(f.path),
          path: f.absolutePath || path.resolve(projectDir || process.cwd(), f.path),
          relativePath: f.path,
          size: f.size,
          ...(Object.prototype.hasOwnProperty.call(f, 'oldContent') ? { oldContent: f.oldContent } : {}),
          ...(Object.prototype.hasOwnProperty.call(f, 'newContent') ? { newContent: f.newContent } : {}),
          ...(Object.prototype.hasOwnProperty.call(f, 'diff') ? { diff: f.diff } : {}),
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
}

module.exports = { registerOctopusRoutes };
