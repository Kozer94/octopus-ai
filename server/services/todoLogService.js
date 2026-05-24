const fs = require('fs');
const path = require('path');

const START_MARKER = '<!-- OCTOPUS_AUTO_TODO_START -->';
const END_MARKER = '<!-- OCTOPUS_AUTO_TODO_END -->';

function toRepoRelative(projectRoot, filePath) {
  const root = path.resolve(projectRoot || process.cwd());
  const fullPath = path.resolve(filePath || root);
  const rel = path.relative(root, fullPath).replace(/\\/g, '/');
  return rel || path.basename(fullPath);
}

function shouldSkipTodoLog(projectRoot, filePath) {
  if (process.env.OCTOPUS_AUTO_TODO === '0') return true;
  if (!projectRoot || !filePath) return true;

  const rel = toRepoRelative(projectRoot, filePath).toLowerCase();
  return rel === 'todo.md' || rel.endsWith('/todo.md');
}

function buildTodoEntry({
  action,
  filePath,
  projectRoot,
  source = 'system',
  details = '',
  now = new Date(),
}) {
  const relPath = toRepoRelative(projectRoot, filePath);
  const stamp = now.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  const cleanDetails = String(details || '').replace(/\s+/g, ' ').trim();
  const suffix = cleanDetails ? ` - ${cleanDetails}` : '';

  return `- [${stamp}] ${source}:${action} \`${relPath}\`${suffix}`;
}

function upsertAutoTodoSection(content, entry) {
  const section = [
    START_MARKER,
    '## سجل التحديثات التلقائي',
    '',
    entry,
    END_MARKER,
  ].join('\n');

  if (!content.includes(START_MARKER) || !content.includes(END_MARKER)) {
    const spacer = content.trim() ? '\n\n' : '';
    return `${content.trimEnd()}${spacer}${section}\n`;
  }

  const start = content.indexOf(START_MARKER);
  const end = content.indexOf(END_MARKER, start);
  const before = content.slice(0, start);
  const block = content.slice(start, end);
  const after = content.slice(end);

  if (block.includes(entry)) return content;

  const updatedBlock = `${block.trimEnd()}\n${entry}\n`;
  return `${before}${updatedBlock}${after}`;
}

function appendTodoUpdate(options) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const filePath = options.filePath;
  if (shouldSkipTodoLog(projectRoot, filePath)) {
    return { success: true, skipped: true };
  }

  const todoPath = path.join(projectRoot, 'TODO.md');
  const current = fs.existsSync(todoPath)
    ? fs.readFileSync(todoPath, 'utf8')
    : '# TODO\n';
  const entry = buildTodoEntry({ ...options, projectRoot });
  const next = upsertAutoTodoSection(current, entry);

  if (next !== current) {
    fs.writeFileSync(todoPath, next, 'utf8');
  }

  return { success: true, path: todoPath, entry };
}

module.exports = {
  END_MARKER,
  START_MARKER,
  appendTodoUpdate,
  buildTodoEntry,
  shouldSkipTodoLog,
  upsertAutoTodoSection,
};
