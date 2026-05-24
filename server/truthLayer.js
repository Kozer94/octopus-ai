/**
 * 🔍 Truth Layer
 * المصدر الوحيد للحقيقة عن حالة المشروع
 * يقرأ من disk فقط — لا تخمين لا افتراض
 */

const fs   = require('fs');
const path = require('path');
const { ensureProjectMap, summarizeProjectMap, selectContextFiles } = require('./projectMapEngine');

const MAX_FILE_SIZE  = 20 * 1024;   // 20KB per file max
const MAX_TOTAL_CHARS = 10000;       // ~2500 tokens — safe for all free-tier providers

function normRoot(projectDir) {
  return path.resolve(projectDir || process.cwd());
}

function safeRead(fullPath) {
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile() || stat.size > MAX_FILE_SIZE) return null;
    return fs.readFileSync(fullPath, 'utf8');
  } catch { return null; }
}

function isInsideRoot(fullPath, rootDir) {
  const rel = path.relative(rootDir, fullPath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// ─── snapshot كامل عن المشروع ─────────────────────────────────
function getProjectSnapshot(projectDir) {
  const rootDir = normRoot(projectDir);
  const projectMap = ensureProjectMap(rootDir);
  return {
    rootDir,
    summary: summarizeProjectMap(projectMap),
    frameworks: projectMap?.frameworks || [],
    importantFiles: projectMap?.importantFiles || [],
    routes: projectMap?.routes || [],
    configFiles: projectMap?.configFiles || [],
    filePaths: projectMap?.filePaths || [],
    stats: projectMap?.stats || {},
  };
}

// ─── قراءة ملفات السياق المرتبطة بمهمة معينة ─────────────────
function getTaskContext(projectDir, taskText, activeFile = '', activeFileContent = '') {
  const rootDir = normRoot(projectDir);
  const projectMap = ensureProjectMap(rootDir);
  if (!projectMap) return activeFileContent || '';

  const selected = selectContextFiles(taskText, projectMap, activeFile);
  const parts = [];
  let used = 0;

  // الملف المفتوح أولاً
  if (activeFileContent && activeFile) {
    const block = `### ${activeFile} (مفتوح)\n\`\`\`\n${activeFileContent.slice(0, 2000)}\n\`\`\``;
    parts.push(block);
    used += block.length;
  }

  for (const relPath of selected) {
    if (used >= MAX_TOTAL_CHARS) break;
    if (relPath === activeFile) continue;
    const fullPath = path.resolve(rootDir, relPath);
    if (!isInsideRoot(fullPath, rootDir)) continue;
    const content = safeRead(fullPath);
    if (!content) continue;
    const block = `### ${relPath}\n\`\`\`\n${content}\n\`\`\``;
    if (used + block.length > MAX_TOTAL_CHARS) break;
    parts.push(block);
    used += block.length;
  }

  return parts.join('\n\n');
}

// ─── قراءة ملف واحد بالاسم ───────────────────────────────────
function readFile(projectDir, relPath) {
  const rootDir = normRoot(projectDir);
  const fullPath = path.resolve(rootDir, relPath);
  if (!isInsideRoot(fullPath, rootDir)) return null;
  return safeRead(fullPath);
}

// ─── كتابة ملف (يُستخدم من validatorLayer فقط) ───────────────
function writeFile(projectDir, relPath, content) {
  const rootDir = normRoot(projectDir);
  const fullPath = path.resolve(rootDir, relPath);
  if (!isInsideRoot(fullPath, rootDir)) throw new Error(`مسار ممنوع: ${relPath}`);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

module.exports = { getProjectSnapshot, getTaskContext, readFile, writeFile };