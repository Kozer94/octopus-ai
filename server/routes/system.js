const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { validateProjectBinding } = require('../validatorLayer');
const { readObject, readString } = require('../services/inputValidation');

function resolveExistingPath(targetPath, fallback = process.cwd()) {
  const resolved = path.resolve(targetPath || fallback);
  if (!fs.existsSync(resolved)) return '';
  return resolved;
}

function assertInsideProject(targetPath, projectRoot) {
  if (!projectRoot) return true;
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(targetPath);
  const relative = path.relative(root, resolved);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function openInFileManager(fullPath) {
  if (process.platform === 'win32') {
    spawn('explorer.exe', ['/select,', fullPath], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (process.platform === 'darwin') {
    spawn('open', ['-R', fullPath], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [path.dirname(fullPath)], { detached: true, stdio: 'ignore' }).unref();
}

function registerSystemRoutes(app) {
  app.post('/api/files/show-in-explorer', async (req, res) => {
    try {
      const body = readObject(req.body, 'body');
      const filePath = readString(body.filePath, 'filePath', { required: true, max: 1000 });
      const projectDir = readString(body.projectDir, 'projectDir', { max: 1000 });
      const clientProjectName = readString(body.clientProjectName, 'clientProjectName', { max: 200 });

      const binding = projectDir ? validateProjectBinding(projectDir, clientProjectName) : { ok: true, projectRoot: '' };
      if (!binding.ok) return res.status(400).json({ success: false, error: binding.error });

      const candidatePath = path.isAbsolute(filePath) || !binding.projectRoot
        ? filePath
        : path.join(binding.projectRoot, filePath);
      if (!assertInsideProject(candidatePath, binding.projectRoot)) {
        return res.status(403).json({ success: false, error: 'المسار خارج المشروع' });
      }

      const fullPath = resolveExistingPath(candidatePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ success: false, error: 'الملف غير موجود' });

      openInFileManager(fullPath);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerSystemRoutes };
