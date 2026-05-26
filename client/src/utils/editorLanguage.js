const BINARY_FILE_EXTENSIONS = [
  '.db',
  '.sqlite',
  '.sqlite3',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.7z',
  '.exe',
  '.dll',
  '.wasm',
  '.ttf',
  '.woff',
  '.woff2',
];

export function isBinaryEditorFile(fileName = '') {
  const normalized = String(fileName || '').toLowerCase();
  return BINARY_FILE_EXTENSIONS.some(extension => normalized.endsWith(extension));
}

export function getEditorLanguage(fileName = '') {
  if (fileName.endsWith(".jsx") || fileName.endsWith(".js")) return "javascript";
  if (fileName.endsWith(".ts") || fileName.endsWith(".tsx")) return "typescript";
  if (fileName.endsWith(".css")) return "css";
  if (fileName.endsWith(".html")) return "html";
  if (fileName.endsWith(".php")) return "php";
  if (fileName.endsWith(".py")) return "python";
  if (fileName.endsWith(".json")) return "json";
  return "plaintext";
}
