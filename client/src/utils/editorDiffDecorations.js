import { buildDiffOperations } from './diffUtils';

export function applyDiffDecorations({ decorationsRef, editor, monaco, file, fade = false }) {
  const model = editor?.getModel?.();
  if (!editor || !monaco || !model) return;

  const lineCount = Math.max(1, model.getLineCount());
  const ops = buildDiffOperations(file.oldContent, file.newContent);
  const decorations = [];
  let block = [];

  const pushBlock = () => {
    if (block.length === 0) return;

    const adds = block.filter(op => op.type === 'add');
    const removes = block.filter(op => op.type === 'remove');
    const classBase = adds.length && removes.length ? 'octopusDiffModified' : adds.length ? 'octopusDiffAdded' : 'octopusDiffRemoved';
    const targetLines = adds.length ? adds.map(op => op.newLine) : [removes[0].newLine];

    for (const line of targetLines) {
      const safeLine = Math.max(1, Math.min(lineCount, line));
      decorations.push({
        range: new monaco.Range(safeLine, 1, safeLine, 1),
        options: {
          isWholeLine: true,
          className: `${classBase}${fade ? ' octopusDiffFade' : ''}`,
          marginClassName: `${classBase}${fade ? ' octopusDiffFade' : ''}`,
        },
      });
    }

    block = [];
  };

  for (const op of ops) {
    if (op.type === 'same') pushBlock();
    else block.push(op);
  }
  pushBlock();

  decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);
}

export function clearDiffDecorations({ decorationsRef, editor }) {
  if (editor) decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
}
