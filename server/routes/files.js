const path = require('path');
const {
  deleteProjectFile,
  listProjectFiles,
  readProjectFile,
  renameProjectFile,
  writeProjectFile,
} = require('../services/fileService');

function registerFileRoutes(app, { ensureProjectMap, appendTodoUpdate }) {
  app.post('/api/files/write', async (req, res) => {
    try {
      const { filePath, content, projectDir, clientProjectName = '' } = req.body;
      if (!filePath) return res.status(400).json({ success: false, error: 'filePath مطلوب' });

      const { fullPath, projectRoot } = writeProjectFile({
        projectDir,
        clientProjectName,
        filePath,
        content,
        protectCore: false,
      });
      appendTodoUpdate({
        projectRoot,
        filePath: fullPath,
        action: 'write',
        source: 'editor',
        details: `saved ${String(content ?? '').length} chars`,
      });
      try { ensureProjectMap(projectRoot, { force: true }); } catch { }
      res.json({ success: true, path: fullPath });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/files/read', async (req, res) => {
    try {
      const { filePath, projectDir, clientProjectName = '' } = req.body;
      if (!filePath) return res.status(400).json({ success: false, error: 'filePath مطلوب' });

      const { content } = readProjectFile({ projectDir, clientProjectName, filePath });
      res.json({ success: true, content });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/files/list', async (req, res) => {
    try {
      const { dirPath } = req.body;
      const { rootDir, name, items } = listProjectFiles(dirPath);
      try { ensureProjectMap(rootDir); } catch { }
      res.json({
        success: true,
        rootDir,
        name,
        items,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/files/delete', async (req, res) => {
    try {
      const { filePath, projectDir, clientProjectName = '' } = req.body;
      if (!filePath) return res.status(400).json({ success: false, error: 'filePath مطلوب' });

      const { projectRoot, fullPath } = deleteProjectFile({ projectDir, clientProjectName, filePath });
      appendTodoUpdate({
        projectRoot,
        filePath: fullPath,
        action: 'delete',
        source: 'editor',
      });
      try { ensureProjectMap(projectRoot, { force: true }); } catch { }
      res.json({ success: true });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/files/rename', async (req, res) => {
    try {
      const { oldPath, newPath, projectDir, clientProjectName = '' } = req.body;
      if (!oldPath || !newPath) return res.status(400).json({ success: false, error: 'oldPath و newPath مطلوبان' });

      const { projectRoot, oldPath: renamedOldPath, newPath: renamedNewPath } = renameProjectFile({
        projectDir,
        clientProjectName,
        oldPath,
        newName: newPath,
      });
      appendTodoUpdate({
        projectRoot,
        filePath: renamedNewPath,
        action: 'rename',
        source: 'editor',
        details: `from ${path.relative(projectRoot, renamedOldPath).replace(/\\/g, '/')}`,
      });
      try { ensureProjectMap(projectRoot, { force: true }); } catch { }
      res.json({ success: true });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerFileRoutes };
