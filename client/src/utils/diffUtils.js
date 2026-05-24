export function extractCode(text) {
  const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return match ? match[1] : null;
}

export function buildLineDiff(oldContent, newContent) {
  const oldText = oldContent || '';
  const newText = newContent || '';
  const oldLines = oldText === '' ? [] : oldText.split(/\r?\n/);
  const newLines = newText === '' ? [] : newText.split(/\r?\n/);
  const table = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0));
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      table[i][j] = oldLines[i] === newLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const diff = [];
  let i = 0, j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      diff.push(`- ${oldLines[i++]}`);
    } else {
      diff.push(`+ ${newLines[j++]}`);
    }
  }
  while (i < oldLines.length) diff.push(`- ${oldLines[i++]}`);
  while (j < newLines.length) diff.push(`+ ${newLines[j++]}`);
  return diff;
}

export function cleanChatText(text) {
  return (text || '')
    .replace(/<file path="[^"]+">[\s\S]*?<\/file>/g, '')
    .replace(/<edit path="[^"]+">[\s\S]*?<\/edit>/g, '')
    .replace(/<terminal>[\s\S]*?<\/terminal>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildDiffOperations(oldContent, newContent) {
  const oldText = oldContent || '';
  const newText = newContent || '';
  const oldLines = oldText === '' ? [] : oldText.split(/\r?\n/);
  const newLines = newText === '' ? [] : newText.split(/\r?\n/);
  const table = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0));
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      table[i][j] = oldLines[i] === newLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0, newLine = 1;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'same', newLine });
      i++;
      j++;
      newLine++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: 'remove', newLine });
      i++;
    } else {
      ops.push({ type: 'add', newLine });
      j++;
      newLine++;
    }
  }
  while (i < oldLines.length) {
    ops.push({ type: 'remove', newLine });
    i++;
  }
  while (j < newLines.length) {
    ops.push({ type: 'add', newLine });
    j++;
    newLine++;
  }
  return ops;
}

export function getSavedFileName(file) {
  const readPath = file.relativePath || file.path || '';
  return file.name || readPath.split('/').pop().split('\\').pop();
}
