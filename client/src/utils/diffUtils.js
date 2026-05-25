export function extractCode(text) {
  const matches = [...(text || '').matchAll(/```(?:\w+)?\n([\s\S]*?)```/g)];
  if (matches.length === 0) return null;
  return matches.map(m => m[1]).join('\n');
}

function splitLines(content) {
  const text = content || '';
  return text === '' ? [] : text.split(/\r?\n/);
}

function buildLcsTable(oldLines, newLines) {
  const table = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0));
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      table[i][j] = oldLines[i] === newLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

function walkDiff(oldContent, newContent, handlers) {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const table = buildLcsTable(oldLines, newLines);
  let i = 0;
  let j = 0;
  let newLine = 1;

  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      handlers.same?.(oldLines[i], newLine);
      i++;
      j++;
      newLine++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      handlers.remove?.(oldLines[i], newLine);
      i++;
    } else {
      handlers.add?.(newLines[j], newLine);
      j++;
      newLine++;
    }
  }
  while (i < oldLines.length) handlers.remove?.(oldLines[i++], newLine);
  while (j < newLines.length) {
    handlers.add?.(newLines[j++], newLine);
    newLine++;
  }
}

export function buildLineDiff(oldContent, newContent) {
  const diff = [];
  walkDiff(oldContent, newContent, {
    add: line => diff.push(`+ ${line}`),
    remove: line => diff.push(`- ${line}`),
  });
  return diff;
}

export function cleanChatText(text) {
  return (text || '')
    .replace(/<file path="[^"]+">[\s\S]*?<\/file>/g, '')
    .replace(/<edit path="[^"]+">[\s\S]*?<\/edit>/g, '')
    .replace(/<terminal>[\s\S]*?<\/terminal>/g, '')
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;').trimEnd();
      const label = lang ? ` ${lang}` : '';
      return `\n\u258C${label}\n${escaped}\n\u2590\n`;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildDiffOperations(oldContent, newContent) {
  const ops = [];
  walkDiff(oldContent, newContent, {
    add: (_line, newLine) => ops.push({ type: 'add', newLine }),
    remove: (_line, newLine) => ops.push({ type: 'remove', newLine }),
    same: (_line, newLine) => ops.push({ type: 'same', newLine }),
  });
  return ops;
}

export function getSavedFileName(file) {
  const readPath = file.relativePath || file.path || '';
  return file.name || readPath.split('/').pop().split('\\').pop();
}
