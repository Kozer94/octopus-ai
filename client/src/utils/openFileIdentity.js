export function getOpenFileId(file) {
  if (!file) return '';
  return file.path || file.name || '';
}

export function isOpenFileActive(file, activeFile) {
  return Boolean(activeFile) && getOpenFileId(file) === activeFile;
}
