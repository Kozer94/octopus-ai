const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { isSensitiveFile } = require('../services/fileService');

const IGNORED_ITEMS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor', '.next', '.nuxt', '.cache',
  'coverage', '__pycache__', '.vscode', '.idea', 'target', '.output',
]);

function shouldIgnoreProjectItem(name) {
  return IGNORED_ITEMS.has(name);
}

function resolveExistingDirectory(dirPath, fallback = process.cwd()) {
  const resolved = path.resolve(dirPath || fallback);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error('المسار ليس مجلداً');
  }
  return resolved;
}

function registerWorkspaceRoutes(app, { ensureProjectMap, ensureProjectMapWatcher }) {
  let watcher = null;
  let watchClients = [];

  app.get('/api/watch', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write('data: {"connected": true}\n\n');

    watchClients.push(res);
    req.on('close', () => {
      watchClients = watchClients.filter(client => client !== res);
    });
  });

  app.post('/api/watch/start', (req, res) => {
    try {
      const { dirPath } = req.body;
      const fullPath = resolveExistingDirectory(dirPath);
      if (watcher) watcher.close();
      try {
        ensureProjectMap(fullPath);
        ensureProjectMapWatcher(fullPath);
      } catch { }

      watcher = chokidar.watch(fullPath, {
        ignored: /(node_modules|\.git|vendor|\.next|dist)/,
        persistent: true,
        ignoreInitial: true,
      });

      watcher.on('add', filePath => {
        const event = JSON.stringify({ type: 'add', path: filePath, name: path.basename(filePath) });
        watchClients.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch { }
        });
      });

      watcher.on('change', filePath => {
        const event = JSON.stringify({ type: 'change', path: filePath, name: path.basename(filePath) });
        watchClients.forEach(client => {
          try { client.write(`data: ${event}\n\n`); } catch { }
        });
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/watch/stop', (_req, res) => {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    res.json({ success: true });
  });

  app.post('/api/search', async (req, res) => {
    try {
      const { query, dirPath } = req.body;
      if (!query || !dirPath) return res.json({ success: true, results: [] });

      const results = [];
      const rootDir = resolveExistingDirectory(dirPath);
      const normalizedQuery = String(query).toLowerCase();

      function searchDir(dir) {
        if (results.length >= 100) return;
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          if (results.length >= 100) return;
          if (shouldIgnoreProjectItem(item.name) || isSensitiveFile(item.name)) continue;
          const fullPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            searchDir(fullPath);
          } else {
            try {
              const stat = fs.statSync(fullPath);
              if (stat.size > 1024 * 1024) continue;
              const content = fs.readFileSync(fullPath, 'utf8');
              const lines = content.split('\n');
              lines.forEach((line, i) => {
                if (results.length < 100 && line.toLowerCase().includes(normalizedQuery)) {
                  results.push({
                    file: item.name,
                    path: fullPath,
                    line: i + 1,
                    text: line.trim(),
                  });
                }
              });
            } catch { }
          }
        }
      }

      searchDir(rootDir);
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = {
  registerWorkspaceRoutes,
  resolveExistingDirectory,
  shouldIgnoreProjectItem,
};
