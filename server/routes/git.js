const { execFile } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { readObject, readString } = require('../services/inputValidation');

function resolveExistingDirectory(dirPath, fallback = process.cwd()) {
  const resolved = path.resolve(dirPath || fallback);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error('المسار ليس مجلداً');
  }
  return resolved;
}

async function resolveExistingDirectoryAsync(dirPath, fallback = process.cwd()) {
  const resolved = path.resolve(dirPath || fallback);
  const stat = await fsp.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error('المسار ليس مجلداً');
  }
  return resolved;
}

async function runGit(args, cwd, callback) {
  const workingDir = await resolveExistingDirectoryAsync(cwd);
  execFile('git', args, {
    cwd: workingDir,
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 10,
    windowsHide: true,
  }, callback);
}

function readGitFile(value) {
  const file = readString(value, 'file', { max: 500 });
  if (!file) return '';
  if (path.isAbsolute(file) || file.split(/[\\/]+/).includes('..')) {
    const error = new Error('file غير صالح');
    error.statusCode = 400;
    throw error;
  }
  return file;
}

function registerGitRoutes(app) {
  app.post('/api/git/status', async (req, res) => {
    try {
      const { cwd } = readObject(req.body, 'body');
      await runGit(['status', '--porcelain'], cwd, (error, stdout) => {
        if (error) return res.json({ success: false, error: 'ليس مشروع Git' });
        const files = stdout.trim().split('\n').filter(Boolean).map(line => ({
          status: line.slice(0, 2).trim(),
          file: line.slice(2).trim(),
        }));
        res.json({ success: true, files });
      });
    } catch (e) { res.status(e.statusCode || 500).json({ success: false, error: e.message }); }
  });

  app.post('/api/git/commit', async (req, res) => {
    try {
      const { cwd, message } = readObject(req.body, 'body');
      const commitMessage = readString(message, 'message', { required: true, max: 500 });
      if (!commitMessage) return res.status(400).json({ success: false, error: 'message مطلوب' });

      await runGit(['add', '.'], cwd, (addError, addStdout, addStderr) => {
        if (addError) {
          return res.json({ success: false, output: addStdout || addStderr || addError.message });
        }

        runGit(['commit', '-m', commitMessage], cwd, (commitError, stdout, stderr) => {
          res.json({ success: !commitError, output: stdout || stderr || commitError?.message });
        });
      });
    } catch (e) { res.status(e.statusCode || 500).json({ success: false, error: e.message }); }
  });

  app.post('/api/git/diff', async (req, res) => {
    try {
      const { cwd, file } = readObject(req.body, 'body');
      const args = ['diff'];
      const safeFile = readGitFile(file);
      if (safeFile) args.push('--', safeFile);
      await runGit(args, cwd, (error, stdout, stderr) => {
        if (error && !stdout) return res.json({ success: false, diff: '', error: stderr || error.message });
        res.json({ success: true, diff: stdout });
      });
    } catch (e) { res.status(e.statusCode || 500).json({ success: false, error: e.message }); }
  });
}

module.exports = { registerGitRoutes, resolveExistingDirectory, resolveExistingDirectoryAsync, runGit };
