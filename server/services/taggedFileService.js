const path = require('path');
const { isProtectedFile } = require('./protectedFiles');

function createTaggedFileSaver({
  appendTodoUpdate,
  ensureProjectMap,
  executeHook,
  isSensitiveFile,
  writeProjectFile,
}) {
  return async function saveTaggedFiles(response, projectDir = '', allowedFiles = null) {
    const fileMatches = response.matchAll(/<file path="([^"]+)">([\s\S]*?)<\/file>/g);
    const savedFiles = [];
    const rootDir = projectDir ? path.resolve(projectDir) : process.cwd();

    for (const match of fileMatches) {
      const filePath = match[1];
      const fileContent = match[2].trim();

      if (filePath.toLowerCase() === 'terminal') continue;

      if (isProtectedFile(filePath)) {
        console.warn(`🛡️ ملف محمي، تم تجاهله: ${filePath}`);
        continue;
      }

      if (isSensitiveFile(filePath)) {
        console.warn(`🔒 ملف حساس، تم تجاهله: ${filePath}`);
        continue;
      }

      if (allowedFiles && !allowedFiles.some(a =>
        filePath === a || filePath.endsWith('/' + a) || path.basename(filePath) === a
      )) {
        console.warn(`🚫 وضع التقرير: تجاهل ${filePath} (مسموح فقط: ${allowedFiles.join(', ')})`);
        continue;
      }

      try {
        const { fullPath } = writeProjectFile({
          projectDir: rootDir,
          filePath,
          content: fileContent,
          protectCore: true,
        });
        savedFiles.push({ path: fullPath, name: path.basename(fullPath), expectedLength: fileContent.length });
        console.log(`🐙 حفظ: ${fullPath}`);
        appendTodoUpdate({
          projectRoot: rootDir,
          filePath: fullPath,
          action: 'write',
          source: 'ai',
          details: `generated ${fileContent.length} chars`,
        });

        await executeHook('onFileSave', { filePath: fullPath, content: fileContent, projectDir: rootDir });
      } catch (e) {
        console.error(`خطأ في حفظ ${filePath}:`, e.message);
      }
    }

    if (savedFiles.length > 0) {
      try { ensureProjectMap(rootDir, { force: true }); } catch { }
    }

    return savedFiles;
  };
}

module.exports = { createTaggedFileSaver };
