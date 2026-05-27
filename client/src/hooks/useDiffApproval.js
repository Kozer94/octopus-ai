import { useEffect, useMemo, useRef } from 'react';
import { filesApi } from '../services/apiClient';
import { buildLineDiff, getSavedFileName } from '../utils/diffUtils';
import { applyDiffDecorations, clearDiffDecorations } from '../utils/editorDiffDecorations';
import { upsertAcceptedDiffFile } from '../utils/openFilesState';

export function useDiffApproval({
  currentDir,
  diffDecorationsRef,
  editorRef,
  monacoRef,
  pendingDiffFiles,
  refreshFileTree,
  setActiveFile,
  setFiles,
  setPendingDiffFiles,
}) {
  const decorationTimersRef = useRef([]);

  // Clear all pending decoration timers on unmount
  useEffect(() => {
    return () => {
      decorationTimersRef.current.forEach(id => clearTimeout(id));
      decorationTimersRef.current = [];
    };
  }, []);

  const currentDiffFile = pendingDiffFiles[0];

  // Memoize — buildLineDiff is O(n²) LCS, must not run on every render
  const currentDiffLines = useMemo(() => {
    if (!currentDiffFile) return [];
    return (currentDiffFile.diff || buildLineDiff(currentDiffFile.oldContent, currentDiffFile.newContent))
      .filter(line => line.startsWith('-') || line.startsWith('+'));
  }, [currentDiffFile]);

  function applyAcceptedDiffDecorations(editor, monaco, fade = false, file) {
    applyDiffDecorations({
      decorationsRef: diffDecorationsRef,
      editor,
      file,
      fade,
      monaco,
    });
  }

  function showAcceptedDiffDecorations(file) {
    // Capture editor/monaco refs at call time — they may change during the 5s animation
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    const t1 = setTimeout(() => {
      applyAcceptedDiffDecorations(editor, monaco, false, file);

      const t2 = setTimeout(() => {
        applyAcceptedDiffDecorations(editor, monaco, true, file);

        const t3 = setTimeout(() => {
          clearDiffDecorations({ decorationsRef: diffDecorationsRef, editor });
        }, 900);
        decorationTimersRef.current.push(t3);
      }, 5000);
      decorationTimersRef.current.push(t2);
    }, 120);
    decorationTimersRef.current.push(t1);
  }

  async function acceptDiffFile(file) {
    const readPath = file.relativePath || file.path;
    const fileName = getSavedFileName(file);
    try {
      await filesApi.write({ filePath: readPath, content: file.newContent, projectDir: currentDir });
    } catch (err) {
      console.error('[useDiffApproval] write failed:', err);
      return;
    }
    setFiles(prev => upsertAcceptedDiffFile(prev, file, fileName));
    setActiveFile(fileName);
    setPendingDiffFiles(prev => prev.slice(1));
    refreshFileTree();
    showAcceptedDiffDecorations(file);
  }

  function rejectDiffFile() {
    setPendingDiffFiles(prev => prev.slice(1));
  }

  return {
    acceptDiffFile,
    currentDiffFile,
    currentDiffLines,
    rejectDiffFile,
  };
}
