const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function resolveExistingDirectory(dirPath, fallback = process.cwd()) {
  const resolved = path.resolve(dirPath || fallback);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error('المسار ليس مجلداً');
  }
  return resolved;
}

function runGit(args, cwd, callback) {
  execFile('git', args, {
    cwd: resolveExistingDirectory(cwd),
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 10,
    windowsHide: true,
  }, callback);
}

function registerGitRoutes(app) {
  app.post('/api/git/status', async (req, res) => {
    try {
      const { cwd } = req.body;
      runGit(['status', '--porcelain'], cwd, (error, stdout) => {
        if (error) return res.json({ success: false, error: 'ليس مشروع Git' });
        const files = stdout.trim().split('\n').filter(Boolean).map(line => ({
          status: line.slice(0, 2).trim(),
          file: line.slice(2).trim(),
        }));
        res.json({ success: true, files });
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/api/git/commit', async (req, res) => {
    try {
      const { cwd, message } = req.body;
      const commitMessage = String(message || '').trim();
      if (!commitMessage) return res.status(400).json({ success: false, error: 'message مطلوب' });

      runGit(['add', '.'], cwd, (addError, addStdout, addStderr) => {
        if (addError) {
          return res.json({ success: false, output: addStdout || addStderr || addError.message });
        }

        runGit(['commit', '-m', commitMessage], cwd, (commitError, stdout, stderr) => {
          res.json({ success: !commitError, output: stdout || stderr || commitError?.message });
        });
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/api/git/diff', async (req, res) => {
    try {
      const { cwd, file } = req.body;
      const args = ['diff'];
      if (file) args.push('--', String(file));
      runGit(args, cwd, (error, stdout, stderr) => {
        if (error && !stdout) return res.json({ success: false, diff: '', error: stderr || error.message });
        res.json({ success: true, diff: stdout });
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
}

module.exports = { registerGitRoutes, runGit };
