const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { validateProjectBinding } = require('../validatorLayer');

function resolveExistingDirectory(dirPath, fallback = process.cwd()) {
  const resolved = path.resolve(dirPath || fallback);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error('المسار ليس مجلداً');
  }
  return resolved;
}

function registerSystemRoutes(app) {
  app.post('/api/files/show-in-explorer', async (req, res) => {
    try {
      const { filePath, projectDir, clientProjectName = '' } = req.body;
      if (!filePath) return res.status(400).json({ success: false, error: 'filePath مطلوب' });

      const binding = projectDir ? validateProjectBinding(projectDir, clientProjectName) : { ok: true, projectRoot: '' };
      if (!binding.ok) return res.status(400).json({ success: false, error: binding.error });

      const fullPath = resolveExistingDirectory(filePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ success: false, error: 'الملف غير موجود' });

      if (process.platform === 'win32') {
        exec(`explorer /select,"${fullPath}"`);
      } else if (process.platform === 'darwin') {
        exec(`open -R "${fullPath}"`);
      } else {
        exec(`xdg-open "${path.dirname(fullPath)}"`);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerSystemRoutes };
