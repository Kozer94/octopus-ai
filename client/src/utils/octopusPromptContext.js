const REPORT_REQUEST_PATTERN = /فحص|تقرير|تقريري|حلل|تحليل|وثق|توثيق|ملخص|ملخّص|report|analyze|analysis|documentation|markdown|\bmd\b/i;

export function buildOpenFilesContext(files = []) {
  return files
    .filter(file => file.content)
    .slice(0, 5)
    .map(file => `### ${file.name}:\n\`\`\`\n${file.content?.slice(0, 500)}\n\`\`\``)
    .join('\n\n');
}

export function isComplexOctopusTask(text = '') {
  return text.length > 20 || REPORT_REQUEST_PATTERN.test(text);
}
