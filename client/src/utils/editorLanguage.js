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
