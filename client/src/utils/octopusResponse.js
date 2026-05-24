export function getTerminalCommandsFromResponse(data = {}) {
  const commands = [];

  if (Array.isArray(data.terminalCommands)) commands.push(...data.terminalCommands);
  else if (data.terminalCommand) commands.push(data.terminalCommand);

  const terminalMatch = data.result?.match(/<terminal>(.*?)<\/terminal>/s);
  if (terminalMatch) commands.push(terminalMatch[1]);

  return commands;
}

export function hasReviewContent(file) {
  return Object.prototype.hasOwnProperty.call(file, 'oldContent')
    && Object.prototype.hasOwnProperty.call(file, 'newContent');
}

export function splitSavedFiles(savedFiles = []) {
  return {
    filesForReview: savedFiles.filter(hasReviewContent),
    filesToOpen: savedFiles.filter(file => !hasReviewContent(file)),
  };
}

export function getSavedFileReadPath(file) {
  return file.relativePath || file.path;
}

export function getSavedFileDisplayName(file, readPath) {
  return file.name || readPath.split('/').pop().split('\\').pop();
}
