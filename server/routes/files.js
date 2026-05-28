const path = require('path');
const {
  deleteProjectFileAsync,
  listProjectFilesAsync,
  mkdirProjectAsync,
  readProjectFileAsync,
  renameProjectFileAsync,
  writeProjectFileAsync,
} = require('../services/fileService');
const { readObject, readString } = require('../services/inputValidation');
const { CAPABILITIES } = require('../services/securityKernel');

function registerFileRoutes(app, { ensureProjectMap, appendTodoUpdate, eventBus }) {
  app.post('/api/files/write', async (req, res) => {
    // 🔐 Defense-in-depth
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const auth = req.securityKernel.authorize(req, { capability: CAPABILITIES.FILE_WRITE, resource: req.body?.filePath });
      if (!auth || auth.allowed !== true) return res.status(403).json({ success: false, error: auth?.reason || 'Forbidden', code: 'FORBIDDEN_BY_POLICY' });
    }
    try {
      const body = readObject(req.body, 'body');
      const filePath = readString(body.filePath, 'filePath', { required: true, max: 1000 });
      const content = body.content === undefined || body.content === null ? '' : String(body.content);
      const projectDir = readString(body.projectDir, 'projectDir', { max: 1000 });
      const clientProjectName = readString(body.clientProjectName, 'clientProjectName', { max: 200 });

      const { fullPath, projectRoot } = await writeProjectFileAsync({
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
      eventBus.publish('file.written', {
        filePath,
        size: String(content ?? '').length,
      }, { category: 'file', source: 'fileService' });
      try { ensureProjectMap(projectRoot, { force: true }); } catch { }
      res.json({ success: true, path: fullPath });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/files/read', async (req, res) => {
    // 🔐 Defense-in-depth
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const rAuth = req.securityKernel.authorize(req, { capability: CAPABILITIES.FILE_READ, resource: req.body?.filePath });
      if (!rAuth || rAuth.allowed !== true) return res.status(403).json({ success: false, error: rAuth?.reason || 'Forbidden', code: 'FORBIDDEN_BY_POLICY' });
    }
    try {
      const body = readObject(req.body, 'body');
      const filePath = readString(body.filePath, 'filePath', { required: true, max: 1000 });
      const projectDir = readString(body.projectDir, 'projectDir', { max: 1000 });
      const clientProjectName = readString(body.clientProjectName, 'clientProjectName', { max: 200 });

      const { content, size } = await readProjectFileAsync({ projectDir, clientProjectName, filePath });
      res.json({ success: true, content, meta: { size } });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/files/list', async (req, res) => {
    // 🔐 Defense-in-depth
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const lAuth = req.securityKernel.authorize(req, { capability: CAPABILITIES.FILE_READ, resource: req.body?.dirPath });
      if (!lAuth || lAuth.allowed !== true) return res.status(403).json({ success: false, error: lAuth?.reason || 'Forbidden', code: 'FORBIDDEN_BY_POLICY' });
    }
    try {
      const body = readObject(req.body, 'body');
      const dirPath = readString(body.dirPath, 'dirPath', { max: 1000 });
      const projectDir = readString(body.projectDir, 'projectDir', { max: 1000 });
      const allowedRoot = projectDir ? path.resolve(projectDir) : null;
      const { rootDir, name, items, meta } = await listProjectFilesAsync(dirPath, allowedRoot, {
        maxItems: Math.min(Number(body.limit) || 1000, 2000),
        maxDepth: Math.min(Number(body.depth) || 8, 12),
      });
      try { ensureProjectMap(rootDir); } catch { }
      res.json({
        success: true,
        rootDir,
        name,
        items,
        meta,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/files/delete', async (req, res) => {
    // 🔐 Defense-in-depth
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const dAuth = req.securityKernel.authorize(req, { capability: CAPABILITIES.FILE_DELETE, resource: req.body?.filePath });
      if (!dAuth || dAuth.allowed !== true) return res.status(403).json({ success: false, error: dAuth?.reason || 'Forbidden', code: 'FORBIDDEN_BY_POLICY' });
    }
    try {
      const body = readObject(req.body, 'body');
      const filePath = readString(body.filePath, 'filePath', { required: true, max: 1000 });
      const projectDir = readString(body.projectDir, 'projectDir', { max: 1000 });
      const clientProjectName = readString(body.clientProjectName, 'clientProjectName', { max: 200 });

      const { projectRoot, fullPath } = await deleteProjectFileAsync({ projectDir, clientProjectName, filePath });
      appendTodoUpdate({
        projectRoot,
        filePath: fullPath,
        action: 'delete',
        source: 'editor',
      });
      eventBus.publish('file.deleted', { filePath }, { category: 'file', source: 'fileService' });
      try { ensureProjectMap(projectRoot, { force: true }); } catch { }
      res.json({ success: true });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/files/rename', async (req, res) => {
    // 🔐 Defense-in-depth
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const rnAuth = req.securityKernel.authorize(req, { capability: CAPABILITIES.FILE_WRITE, resource: req.body?.oldPath });
      if (!rnAuth || rnAuth.allowed !== true) return res.status(403).json({ success: false, error: rnAuth?.reason || 'Forbidden', code: 'FORBIDDEN_BY_POLICY' });
    }
    try {
      const body = readObject(req.body, 'body');
      const oldPath = readString(body.oldPath, 'oldPath', { required: true, max: 1000 });
      const newPath = readString(body.newPath, 'newPath', { required: true, max: 1000 });
      const projectDir = readString(body.projectDir, 'projectDir', { max: 1000 });
      const clientProjectName = readString(body.clientProjectName, 'clientProjectName', { max: 200 });

      const { projectRoot, oldPath: renamedOldPath, newPath: renamedNewPath } = await renameProjectFileAsync({
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
      eventBus.publish('file.renamed', {
        oldPath,
        newPath,
      }, { category: 'file', source: 'fileService' });
      try { ensureProjectMap(projectRoot, { force: true }); } catch { }
      res.json({ success: true });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });
  app.post('/api/files/mkdir', async (req, res) => {
    if (req.securityKernel && typeof req.securityKernel.authorize === 'function') {
      const auth = req.securityKernel.authorize(req, { capability: CAPABILITIES.FILE_WRITE, resource: req.body?.dirPath });
      if (!auth || auth.allowed !== true) return res.status(403).json({ success: false, error: auth?.reason || 'Forbidden', code: 'FORBIDDEN_BY_POLICY' });
    }
    try {
      const body = readObject(req.body, 'body');
      const dirPath = readString(body.dirPath, 'dirPath', { required: true, max: 1000 });
      const projectDir = readString(body.projectDir, 'projectDir', { max: 1000 });
      const clientProjectName = readString(body.clientProjectName, 'clientProjectName', { max: 200 });

      const { projectRoot } = await mkdirProjectAsync({ projectDir, clientProjectName, dirPath });
      eventBus.publish('file.mkdir', { dirPath }, { category: 'file', source: 'fileService' });
      try { ensureProjectMap(projectRoot, { force: true }); } catch { }
      res.json({ success: true });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerFileRoutes };
