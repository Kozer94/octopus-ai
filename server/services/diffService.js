function splitLines(content) {
  const text = content || '';
  return text === '' ? [] : text.split(/\r?\n/);
}

function buildLcsTable(oldLines, newLines) {
  const table = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0));
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      table[i][j] = oldLines[i] === newLines[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
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

function buildLineDiff(oldContent, newContent) {
  const diff = [];
  walkDiff(oldContent, newContent, {
    add: line => diff.push(`+ ${line}`),
    remove: line => diff.push(`- ${line}`),
  });
  return diff;
}

module.exports = {
  buildLineDiff,
  buildLcsTable,
  splitLines,
  walkDiff,
};
