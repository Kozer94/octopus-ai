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
  const currentDiffFile = pendingDiffFiles[0];
  const currentDiffLines = currentDiffFile
    ? (currentDiffFile.diff || buildLineDiff(currentDiffFile.oldContent, currentDiffFile.newContent)).filter(line => line.startsWith('-') || line.startsWith('+'))
    : [];

  function applyAcceptedDiffDecorations(file, fade = false) {
    applyDiffDecorations({
      decorationsRef: diffDecorationsRef,
      editor: editorRef.current,
      file,
      fade,
      monaco: monacoRef.current,
    });
  }

  function showAcceptedDiffDecorations(file) {
    setTimeout(() => {
      applyAcceptedDiffDecorations(file);
      setTimeout(() => {
        applyAcceptedDiffDecorations(file, true);
        setTimeout(() => {
          clearDiffDecorations({ decorationsRef: diffDecorationsRef, editor: editorRef.current });
        }, 900);
      }, 5000);
    }, 120);
  }

  async function acceptDiffFile(file) {
    const readPath = file.relativePath || file.path;
    const fileName = getSavedFileName(file);
    await filesApi.write({ filePath: readPath, content: file.newContent, projectDir: currentDir });
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
