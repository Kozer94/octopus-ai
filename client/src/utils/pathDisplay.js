export function displayFilePath({ file, activeFile = '', currentDir = '', projectName = '' }) {
  if (!file) return activeFile || '';
  const rawPath = file.relativePath || file.path || file.name || '';
  const normalizedCurrentDir = currentDir.replace(/\\/g, '/').replace(/\/$/, '');
  let normalizedPath = rawPath.replace(/\\/g, '/');
  if (normalizedCurrentDir && normalizedPath.startsWith(normalizedCurrentDir + '/')) {
    normalizedPath = normalizedPath.slice(normalizedCurrentDir.length + 1);
  }
  return [projectName, ...normalizedPath.split('/').filter(Boolean)].join(' › ');
}
