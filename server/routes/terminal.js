const {
  runCommand,
  spawnCommand,
  terminateProcess,
} = require('../services/terminalService');

function registerTerminalRoutes(app) {
  let runningProcess = null;
  let terminalProcess = null;

  app.post('/api/terminal', async (req, res) => {
    try {
      const { command, cwd } = req.body;
      const result = await runCommand(command, cwd);
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/terminal/stream', async (req, res) => {
    try {
      const { command, cwd } = req.body;
      if (terminalProcess) {
        terminateProcess(terminalProcess);
        terminalProcess = null;
      }

      const proc = spawnCommand(command, cwd);
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
        try {
          res.write(`data: ${JSON.stringify({ done: true, code: code ?? 0 })}\n\n`);
          res.end();
        } catch { }
      });

      proc.on('error', (err) => {
        finished = true;
        if (terminalProcess === proc) terminalProcess = null;
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
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/terminal/interrupt', async (_req, res) => {
    try {
      if (terminalProcess) {
        terminateProcess(terminalProcess);
        terminalProcess = null;
        res.json({ success: true, output: 'Interrupted terminal command' });
      } else {
        res.json({ success: true, output: 'No terminal command is running' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/run', async (req, res) => {
    try {
      const { command, cwd } = req.body;

      if (runningProcess) {
        terminateProcess(runningProcess);
        runningProcess = null;
      }

      runningProcess = spawnCommand(command, cwd);

      let output = '';
      runningProcess.stdout.on('data', d => { output += d.toString(); });
      runningProcess.stderr.on('data', d => { output += d.toString(); });
      runningProcess.on('exit', () => { runningProcess = null; });

      setTimeout(() => {
        res.json({ success: true, output: output || '✅ العملية شغّالة في الخلفية', pid: runningProcess?.pid });
      }, 5000);

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/stop', async (_req, res) => {
    try {
      if (runningProcess) {
        terminateProcess(runningProcess);
        runningProcess = null;
        res.json({ success: true, output: '⏹ تم الإيقاف' });
      } else {
        res.json({ success: true, output: 'لا توجد عملية شغّالة' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerTerminalRoutes };
