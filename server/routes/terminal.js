const {
  runCommand,
  spawnCommand,
  terminateProcess,
} = require('../services/terminalService');
const { readObject, readString, safeErrorMessage } = require('../services/inputValidation');
const { CAPABILITIES } = require('../services/securityKernel');

function registerTerminalRoutes(app, { eventBus, terminalLimiter } = {}) {
  const mw = terminalLimiter || ((_, __, next) => next());
  let runningProcess = null;
  let terminalProcess = null;

  app.post('/api/terminal', mw, async (req, res) => {
    // 🔐 Defense-in-depth: فحص إضافي (الـ Capability Guard المركزي يفحص أولاً)
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const auth = req.securityKernel.authorize(req, {
        capability: CAPABILITIES.TERMINAL_EXECUTE,
        resource: req.body?.cwd || req.body?.projectRoot,
      });
      if (!auth || auth.allowed !== true) {
        return res.status(403).json({ success: false, error: auth?.reason || 'Forbidden by security policy', code: 'FORBIDDEN_BY_POLICY' });
      }
    }
    try {
      const body = readObject(req.body, 'body');
      const command = readString(body.command, 'command', { required: true, max: 500 });
      const cwd = readString(body.cwd, 'cwd', { max: 1000 });
      const projectRoot = readString(body.projectRoot, 'projectRoot', { max: 1000 });
      eventBus?.publish('terminal.command.started', { command, cwd }, { category: 'terminal', source: 'terminalService' });
      const result = await runCommand(command, cwd, projectRoot || process.cwd());
      eventBus?.publish('terminal.command.finished', {
        command,
        cwd,
        success: result.success,
      }, { category: 'terminal', source: 'terminalService' });
      res.json(result);
    } catch (error) {
      eventBus?.publish('terminal.command.failed', { error: error.message }, { category: 'terminal', severity: 'error', source: 'terminalService' });
      res.status(error.statusCode || 500).json({ success: false, error: safeErrorMessage(error) });
    }
  });

  app.post('/api/terminal/stream', mw, async (req, res) => {
    // 🔐 Defense-in-depth
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const streamAuth = req.securityKernel.authorize(req, {
        capability: CAPABILITIES.TERMINAL_STREAM,
        resource: req.body?.cwd || req.body?.projectRoot,
      });
      if (!streamAuth || streamAuth.allowed !== true) {
        return res.status(403).json({ success: false, error: streamAuth?.reason || 'Forbidden by security policy', code: 'FORBIDDEN_BY_POLICY' });
      }
    }
    try {
      const body = readObject(req.body, 'body');
      const command = readString(body.command, 'command', { required: true, max: 500 });
      const cwd = readString(body.cwd, 'cwd', { max: 1000 });
      const projectRoot = readString(body.projectRoot, 'projectRoot', { max: 1000 });
      eventBus?.publish('terminal.stream.started', { command, cwd }, { category: 'terminal', source: 'terminalService' });
      if (terminalProcess) {
        terminateProcess(terminalProcess);
        terminalProcess = null;
      }

      const proc = spawnCommand(command, cwd, projectRoot || process.cwd());
      terminalProcess = proc;
      let finished = false;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      req.setTimeout(0);
      res.setTimeout(0);

      proc.stdout.on('data', d => {
        try { res.write(`data: ${JSON.stringify({ output: d.toString() })}\n\n`); } catch { }
      });

      proc.stderr.on('data', d => {
        try { res.write(`data: ${JSON.stringify({ output: d.toString() })}\n\n`); } catch { }
      });

      proc.on('close', (code) => {
        finished = true;
        if (terminalProcess === proc) terminalProcess = null;
        eventBus?.publish('terminal.stream.finished', { command, cwd, code: code ?? 0 }, { category: 'terminal', source: 'terminalService' });
        try {
          res.write(`data: ${JSON.stringify({ done: true, code: code ?? 0 })}\n\n`);
          res.end();
        } catch { }
      });

      proc.on('error', (err) => {
        finished = true;
        if (terminalProcess === proc) terminalProcess = null;
        eventBus?.publish('terminal.stream.failed', { command, cwd, error: err.message }, { category: 'terminal', severity: 'error', source: 'terminalService' });
        try {
          res.write(`data: ${JSON.stringify({ output: err.message, done: true, code: 1 })}\n\n`);
          res.end();
        } catch { }
      });

      req.on('close', () => {
        if (!finished) {
          terminateProcess(proc);
          if (terminalProcess === proc) terminalProcess = null;
        }
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: safeErrorMessage(error) });
    }
  });

  app.post('/api/terminal/interrupt', async (req, res) => {
    // 🔐 Defense-in-depth
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const intAuth = req.securityKernel.authorize(req, { capability: CAPABILITIES.TERMINAL_INTERRUPT });
      if (!intAuth || intAuth.allowed !== true) {
        return res.status(403).json({ success: false, error: intAuth?.reason || 'Forbidden by security policy', code: 'FORBIDDEN_BY_POLICY' });
      }
    }
    try {
      if (terminalProcess) {
        terminateProcess(terminalProcess);
        terminalProcess = null;
        eventBus?.publish('terminal.stream.interrupted', {}, { category: 'terminal', severity: 'warning', source: 'terminalService' });
        res.json({ success: true, output: 'Interrupted terminal command' });
      } else {
        res.json({ success: true, output: 'No terminal command is running' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
  });

  app.post('/api/run', mw, async (req, res) => {
    // 🔐 Defense-in-depth
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const runAuth = req.securityKernel.authorize(req, {
        capability: CAPABILITIES.TERMINAL_EXECUTE,
        resource: req.body?.cwd || req.body?.projectRoot,
      });
      if (!runAuth || runAuth.allowed !== true) {
        return res.status(403).json({ success: false, error: runAuth?.reason || 'Forbidden by security policy', code: 'FORBIDDEN_BY_POLICY' });
      }
    }
    try {
      const body = readObject(req.body, 'body');
      const command = readString(body.command, 'command', { required: true, max: 500 });
      const cwd = readString(body.cwd, 'cwd', { max: 1000 });
      const projectRoot = readString(body.projectRoot, 'projectRoot', { max: 1000 });
      eventBus?.publish('process.run.started', { command, cwd }, { category: 'process', source: 'terminalService' });

      if (runningProcess) {
        terminateProcess(runningProcess);
        runningProcess = null;
      }

      runningProcess = spawnCommand(command, cwd, projectRoot || process.cwd());

      let output = '';
      runningProcess.stdout.on('data', d => { output += d.toString(); });
      runningProcess.stderr.on('data', d => { output += d.toString(); });
      runningProcess.on('exit', (code) => {
        eventBus?.publish('process.run.exited', { command, cwd, code: code ?? 0 }, { category: 'process', source: 'terminalService' });
        runningProcess = null;
      });

      setTimeout(() => {
        res.json({ success: true, output: output || '✅ العملية شغّالة في الخلفية', pid: runningProcess?.pid });
      }, 5000);

    } catch (error) {
      res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
  });

  app.post('/api/stop', async (req, res) => {
    // 🔐 Defense-in-depth
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const stopAuth = req.securityKernel.authorize(req, { capability: CAPABILITIES.TERMINAL_INTERRUPT });
      if (!stopAuth || stopAuth.allowed !== true) {
        return res.status(403).json({ success: false, error: stopAuth?.reason || 'Forbidden by security policy', code: 'FORBIDDEN_BY_POLICY' });
      }
    }
    try {
      if (runningProcess) {
        terminateProcess(runningProcess);
        runningProcess = null;
        eventBus?.publish('process.run.stopped', {}, { category: 'process', severity: 'warning', source: 'terminalService' });
        res.json({ success: true, output: '⏹ تم الإيقاف' });
      } else {
        res.json({ success: true, output: 'لا توجد عملية شغّالة' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
  });
}

module.exports = { registerTerminalRoutes };
