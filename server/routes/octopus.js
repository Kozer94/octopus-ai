const path = require('path');
const { withTimeout } = require('../services/asyncControl');
const { CAPABILITIES } = require('../services/securityKernel');
const { buildFullCommand, buildTaggedCommand, budgetSessionMessages, estimateTokens } = require('../services/contextBuilderService');
const { createSpan } = require('../services/telemetryService');
const logger = require('../services/logger').withContext('octopus');

const DEBUG = process.env.DEBUG_AI === 'true';

function registerOctopusRoutes(app, {
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
  systemPrompt,
  validateProjectBinding,
}) {
  function sendQueued(res, job) {
    return res.status(202).json({
      success: true,
      queued: true,
      jobId: job.id,
      job,
    });
  }

  function formatSavedFile(f, projectDir) {
    return {
      name: path.basename(f.path),
      path: f.absolutePath || path.resolve(projectDir || process.cwd(), f.path),
      relativePath: f.path,
      size: f.size,
      ...(Object.prototype.hasOwnProperty.call(f, 'oldContent') ? { oldContent: f.oldContent } : {}),
      ...(Object.prototype.hasOwnProperty.call(f, 'newContent') ? { newContent: f.newContent } : {}),
      ...(Object.prototype.hasOwnProperty.call(f, 'diff') ? { diff: f.diff } : {}),
    };
  }

  function formatParallelResult(result, projectDir, sessionId) {
    return {
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
      savedFiles: result.savedFiles.map(f => formatSavedFile(f, projectDir)),
      rejectedFiles: result.rejectedFiles,
      terminalCommands: result.terminalCommands,
      terminalCommand: result.terminalCommands?.[0] || null,
      timeline: result.timeline,
      sessionId,
    };
  }

  function storeSessionResult(sessionId, command, response) {
    if (!sessions[sessionId]) sessions[sessionId] = [];
    sessions[sessionId].push({ role: 'user', content: command });
    sessions[sessionId].push({ role: 'assistant', content: response });
    if (sessions[sessionId].length > 8) sessions[sessionId] = sessions[sessionId].slice(-8);
  }

  app.get('/api/octopus/jobs/:jobId', aiLimiter, (req, res) => {
    const job = jobQueue.get(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    return res.json({ success: true, job });
  });

  app.get('/api/octopus/jobs', aiLimiter, (req, res) => {
    res.json({
      success: true,
      jobs: jobQueue.list(req.query),
      queue: jobQueue.getState(),
    });
  });

  app.post('/api/octopus/jobs/:jobId/cancel', aiLimiter, (req, res) => {
    const job = jobQueue.cancel(req.params.jobId, req.body?.reason || 'cancelled');
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    return res.json({ success: true, job });
  });

  app.post('/api/octopus', aiLimiter, async (req, res) => {
    // 🔐 Defense-in-depth
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const chatAuth = req.securityKernel.authorize(req, { capability: CAPABILITIES.AI_CHAT });
      if (!chatAuth || chatAuth.allowed !== true) {
        return res.status(403).json({ success: false, error: chatAuth?.reason || 'Forbidden by security policy', code: 'FORBIDDEN_BY_POLICY' });
      }
    }
    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Request body is missing or invalid. Please ensure you are sending JSON data.' });
      }
      const { command, sessionId: rawSessionId = 'default', activeFile = '', activeFileContent = '', projectDir = '', projectContext = '', clientProjectName = '', model = '' } = req.body;
      const sessionId = (typeof rawSessionId === 'string' ? rawSessionId : 'default').slice(0, 128).replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
      const binding = projectDir ? validateProjectBinding(projectDir, clientProjectName) : { ok: true, projectRoot: '' };
      if (!binding.ok) return res.status(400).json({ success: false, error: binding.error });

      if (!command || typeof command !== 'string' || !command.trim()) {
        return res.status(400).json({ success: false, error: 'command must be a non-empty string' });
      }

      if (isReportCommand(command)) {
        return res.status(400).json({
          success: false,
          error: 'طلبات التقرير يجب أن تمر عبر /api/octopus/preview حتى يتم إنشاء report.md فقط بعد التأكيد.',
          requiresPreview: true,
        });
      }

      const job = jobQueue.enqueue('octopus.chat', async () => {
        const span = createSpan({ label: 'octopus.chat', sessionId });
        if (!sessions[sessionId]) sessions[sessionId] = [];

        // ── Context Build ──────────────────────────────────────────
        span.mark('contextBuild');
        const projectMapContext = binding.projectRoot
          ? getProjectContextForTask(binding.projectRoot, command, activeFile, activeFileContent)
          : '';

        let fullCommand = buildFullCommand({ command, projectMapContext, projectContext, activeFile, activeFileContent });
        fullCommand = await executeHook('beforeSend', fullCommand);
        if (typeof fullCommand !== 'string') fullCommand = String(fullCommand);

        const { taggedCommand, lang, hint } = buildTaggedCommand(command, fullCommand);
        const contextTokens = estimateTokens(taggedCommand);
        span.end('contextBuild', { tokens: contextTokens });

        // ── Smart Session: token-budgeted + deduplicated history ───
        const budgetedHistory = budgetSessionMessages(sessions[sessionId] || [], {
          systemPrompt,
          userCommand: taggedCommand,
        });

        const messagesForAI = [
          { role: 'system', content: systemPrompt },
          ...budgetedHistory,
          { role: 'user', content: taggedCommand },
        ];
        if (DEBUG) logger.debug('[AI DEBUG]', { lang, hint, messagesCount: messagesForAI.length, budgetedHistory: budgetedHistory.length, contextTokens });

        // ── AI Call ─────────────────────────────────────────────────
        span.mark('aiCall');
        let response = await callAI(messagesForAI, 8192, command, model);
        span.end('aiCall', { model: model || 'auto' });

        // ── Post-processing ─────────────────────────────────────────
        span.mark('postProcess');
        response = await executeHook('afterResponse', response);
        const savedFiles = await saveTaggedFiles(response, binding.projectRoot || projectDir);
        span.end('postProcess');

        // ── Session Update (FIX: assignment triggering Proxy set) ───
        sessions[sessionId] = [
          ...(sessions[sessionId] || []),
          { role: 'user', content: command },
          { role: 'assistant', content: response },
        ].slice(-16);
        sessions.setMeta(sessionId, { lastModel: model || 'auto', _increment: true });

        span.complete({ model: model || 'auto', savedFiles: savedFiles?.length });
        return { success: true, result: response, sessionId, savedFiles, requestId: span.requestId };
      }, { sessionId });

      return sendQueued(res, job);
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: require('../services/inputValidation').safeErrorMessage(error) });
    }
  });

  // Streaming endpoint for real-time token-by-token response
  app.post('/api/octopus/stream', aiLimiter, async (req, res) => {
    let streamStarted = false;
    let heartbeatId = null;

    const sendEvent = (event, data) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Request body is missing or invalid. Please ensure you are sending JSON data.' });
      }
      const { command, sessionId: rawSessionId = 'default', activeFile = '', activeFileContent = '', projectDir = '', projectContext = '', clientProjectName = '', model = '' } = req.body;
      const sessionId = (typeof rawSessionId === 'string' ? rawSessionId : 'default').slice(0, 128).replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
      const binding = projectDir ? validateProjectBinding(projectDir, clientProjectName) : { ok: true, projectRoot: '' };
      if (!binding.ok) return res.status(400).json({ success: false, error: binding.error });

      if (!command || typeof command !== 'string' || !command.trim()) {
        return res.status(400).json({ success: false, error: 'command must be a non-empty string' });
      }

      if (isReportCommand(command)) {
        return res.status(400).json({
          success: false,
          error: 'طلبات التقرير يجب أن تمر عبر /api/octopus/preview حتى يتم إنشاء report.md فقط بعد التأكيد.',
          requiresPreview: true,
        });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      streamStarted = true;

      // Heartbeat every 15 seconds to prevent inactivity timeout
      heartbeatId = setInterval(() => {
        if (!res.writableEnded) res.write(': heartbeat\n\n');
      }, 15_000);

      if (!sessions[sessionId]) sessions[sessionId] = [];
      const span = createSpan({ label: 'octopus.stream', sessionId });

      // ── Context Build ──────────────────────────────────────────
      span.mark('contextBuild');
      const projectMapContext = binding.projectRoot
        ? getProjectContextForTask(binding.projectRoot, command, activeFile, activeFileContent)
        : '';

      let fullCommand = buildFullCommand({ command, projectMapContext, projectContext, activeFile, activeFileContent });
      fullCommand = await executeHook('beforeSend', fullCommand);
      if (typeof fullCommand !== 'string') fullCommand = String(fullCommand);

      const { taggedCommand } = buildTaggedCommand(command, fullCommand);
      span.end('contextBuild', { tokens: estimateTokens(taggedCommand) });

      // ── Smart Session: token-budgeted + deduplicated history ───
      const budgetedHistory = budgetSessionMessages(sessions[sessionId] || [], {
        systemPrompt,
        userCommand: taggedCommand,
      });

      const messagesForAI = [
        { role: 'system', content: systemPrompt },
        ...budgetedHistory,
        { role: 'user', content: taggedCommand },
      ];

      let fullResponse = '';

      // ── AI Call (streaming) ────────────────────────────────────
      span.mark('aiCall');
      await callAI(messagesForAI, 8192, command, model, (chunk, accumulated) => {
        sendEvent('chunk', { chunk, accumulated });
        fullResponse = accumulated;
      });
      span.end('aiCall', { model: model || 'auto' });

      const processedResponse = await executeHook('afterResponse', fullResponse);
      const savedFiles = await saveTaggedFiles(processedResponse, binding.projectRoot || projectDir);

      // ── Session Update (FIX: assignment triggering Proxy set) ───
      sessions[sessionId] = [
        ...(sessions[sessionId] || []),
        { role: 'user', content: command },
        { role: 'assistant', content: processedResponse },
      ].slice(-16);
      sessions.setMeta(sessionId, { lastModel: model || 'auto', _increment: true });

      span.complete({ model: model || 'auto', savedFiles: savedFiles?.length });

      if (heartbeatId) clearInterval(heartbeatId);
      sendEvent('complete', { success: true, result: processedResponse, sessionId, savedFiles, requestId: span.requestId });
      res.end();
    } catch (error) {
      if (heartbeatId) clearInterval(heartbeatId);
      if (!streamStarted) {
        return res.status(500).json({ success: false, error: error.message });
      }
      sendEvent('error', { success: false, error: error.message, message: error.message });
      res.end();
    }
  });

  const PREVIEW_TIMEOUT_MS  = 90_000;        // 90s — 3 AI calls × max 30s each
  const PARALLEL_TIMEOUT_MS = 5 * 60_000;    // 5 min — up to 8 legs in parallel

  function withRouteTimeout(promise, ms, label) {
    return withTimeout(
      () => promise,
      ms,
      label,
      () => Object.assign(new Error(`${label}: انتهت المهلة (${ms / 1000}s)`), { statusCode: 504 }),
    );
  }

  app.post('/api/octopus/preview', aiLimiter, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Request body is missing or invalid. Please ensure you are sending JSON data.' });
      }
      const {
        command,
        projectDir = '',
        activeFile = '',
        activeFileContent = '',
        model = '',
      } = req.body;
      if (!command) return res.status(400).json({ success: false, error: 'command is required' });

      const job = jobQueue.enqueue('octopus.preview', async () => {
        const preview = await withRouteTimeout(
          previewBrainController({ command, projectDir, activeFile, activeFileContent, callAI, modelOverride: model }),
          PREVIEW_TIMEOUT_MS,
          'Preview',
        );

        return {
          success: true,
          mode: preview.mode,
          plan: preview.plan,
          eng1Result: preview.eng1Result,
          eng2Result: preview.eng2Result,
          frameworks: preview.snapshot?.frameworks,
          preview: `## Brain Decision\n${preview.plan.decision}\n\n## Rejected\n${preview.plan.rejected || 'None'}\n\n## Tasks\n${
            preview.plan.tasks?.filter(t => t.active).map(t => `- Leg ${t.leg}: ${t.task}`).join('\n') || ''
          }`,
        };
      });

      return sendQueued(res, job);
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: require('../services/inputValidation').safeErrorMessage(error) });
    }
  });

  app.post('/api/octopus/parallel', aiLimiter, async (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Request body is missing or invalid. Please ensure you are sending JSON data.' });
      }
      const {
        command,
        projectDir = '',
        activeFile = '',
        activeFileContent = '',
        confirmed = false,
        sessionId = 'default',
        model = '',
        plan: clientPlan = null,
      } = req.body;

      if (!confirmed) {
        return res.status(400).json({
          success: false,
          error: 'Plan must be confirmed first. Use /api/octopus/preview then send confirmed: true',
          requiresConfirmation: true,
        });
      }

      const onUpdate = (entry) => {
        const label = entry.legId === 0 ? '🧠 Brain' : `🦾 Leg ${entry.legId}`;
        logger.debug(`${label}: ${entry.status}${entry.task ? ' — ' + entry.task : ''}`);
      };

      const job = jobQueue.enqueue('octopus.parallel', async () => {
        const result = await withRouteTimeout(
          runBrainController({ command, projectDir, activeFile, activeFileContent, callAI, onUpdate, modelOverride: model, plan: clientPlan }),
          PARALLEL_TIMEOUT_MS,
          'Parallel execution',
        );
        storeSessionResult(sessionId, command, result.finalResult);
        return formatParallelResult(result, projectDir, sessionId);
      });

      return sendQueued(res, job);
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: require('../services/inputValidation').safeErrorMessage(error) });
    }
  });

  app.post('/api/octopus/parallel/stream', aiLimiter, async (req, res) => {
    let streamStarted = false;
    let heartbeatId = null;

    const sendEvent = (event, data) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Request body is missing or invalid. Please ensure you are sending JSON data.' });
      }
      const {
        command,
        sessionId = 'default',
        activeFile = '',
        activeFileContent = '',
        projectDir = '',
        confirmed = false,
        model = '',
        plan: clientPlan = null,
      } = req.body;

      if (!confirmed) {
        return res.status(400).json({
          success: false,
          error: 'Plan must be confirmed first. Use /api/octopus/preview then send confirmed: true',
          requiresConfirmation: true,
        });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      streamStarted = true;

      // Heartbeat كل 15 ثانية لمنع inactivity timeout عند بطء providers
      heartbeatId = setInterval(() => {
        if (!res.writableEnded) res.write(': heartbeat\n\n');
      }, 15_000);

      const onUpdate = (entry) => {
        sendEvent('leg_update', entry);
        const label = entry.legId === 0 ? '🧠 Brain' : `🦾 Leg ${entry.legId}`;
        logger.debug(`${label}: ${entry.status}${entry.task ? ' — ' + entry.task : ''}`);
      };

      const result = await withRouteTimeout(
        runBrainController({ command, projectDir, activeFile, activeFileContent, callAI, onUpdate, modelOverride: model, plan: clientPlan }),
        PARALLEL_TIMEOUT_MS,
        'Parallel execution',
      );
      if (heartbeatId) clearInterval(heartbeatId);

      storeSessionResult(sessionId, command, result.finalResult);
      sendEvent('complete', formatParallelResult(result, projectDir, sessionId));
      res.end();
    } catch (error) {
      if (heartbeatId) clearInterval(heartbeatId);
      if (!streamStarted) {
        return res.status(500).json({ success: false, error: error.message });
      }
      sendEvent('error', { success: false, error: error.message, message: error.message });
      res.end();
    }
  });
}

module.exports = { registerOctopusRoutes };
