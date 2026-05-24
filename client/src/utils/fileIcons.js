export function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const lowerName = name.toLowerCase();
  const specialFiles = {
    'artisan': { icon: 'codicon-tools', color: '#ff6b6b' },
    '.htaccess': { icon: 'codicon-shield', color: '#c9d1d9' },
    '.gitignore': { icon: 'codicon-source-control', color: '#f05032' },
    '.gitattributes': { icon: 'codicon-source-control', color: '#f05032' },
    '.npmrc': { icon: 'codicon-package', color: '#cb3837' },
    '.editorconfig': { icon: 'codicon-settings-gear', color: '#ffa657' },
    'dockerfile': { icon: 'codicon-server', color: '#0db7ed' },
    'makefile': { icon: 'codicon-tools', color: '#6e7681' },
    'procfile': { icon: 'codicon-play', color: '#7ee787' },
  };
  const iconMap = {
    js: { icon: 'codicon-symbol-method', color: '#f7df1e' },
    jsx: { icon: 'codicon-symbol-method', color: '#61dafb' },
    ts: { icon: 'codicon-symbol-method', color: '#3178c6' },
    tsx: { icon: 'codicon-symbol-method', color: '#61dafb' },
    php: { icon: 'codicon-symbol-class', color: '#8892be' },
    css: { icon: 'codicon-symbol-color', color: '#42a5f5' },
    html: { icon: 'codicon-code', color: '#e44d26' },
    json: { icon: 'codicon-json', color: '#ffa657' },
    md: { icon: 'codicon-markdown', color: '#7ee787' },
    py: { icon: 'codicon-symbol-class', color: '#3572a5' },
    sh: { icon: 'codicon-terminal', color: '#4caf50' },
    sql: { icon: 'codicon-database', color: '#e38d44' },
    svg: { icon: 'codicon-file-media', color: '#ff9800' },
    lock: { icon: 'codicon-lock', color: '#6e7681' },
    yaml: { icon: 'codicon-settings', color: '#cb171e' },
    yml: { icon: 'codicon-settings', color: '#cb171e' },
    txt: { icon: 'codicon-file-text', color: '#c9d1d9' },
    env: { icon: 'codicon-settings-gear', color: '#ecd53f' },
    xml: { icon: 'codicon-code', color: '#f48fb1' },
    toml: { icon: 'codicon-settings', color: '#ffa657' },
    ini: { icon: 'codicon-settings', color: '#ffa657' },
    cache: { icon: 'codicon-database', color: '#6e7681' },
    log: { icon: 'codicon-output', color: '#6e7681' },
  };
  if (specialFiles[lowerName]) return specialFiles[lowerName];
  if (lowerName.startsWith('.env')) return { icon: 'codicon-settings-gear', color: '#ecd53f' };
  if (iconMap[ext]) return iconMap[ext];
  return { icon: 'codicon-file', color: '#8b949e' };
}
