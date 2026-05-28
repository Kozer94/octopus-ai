// ExplorerPanel.jsx — لوحة مستكشف الملفات
// أصبحت غلافاً رفيعاً يستخدم FileTree + FileTreeItem

import { FileTree } from './FileTree';

/**
 * ExplorerPanel — يعرض شجرة الملفات للمشروع الحالي
 *
 * Props:
 *   activeFile      string
 *   currentDir      string
 *   displayFilePath fn(file)→string
 *   fileTree        array
 *   files           array
 *   onFileClick     fn(item)
 *   onSetActiveFile fn(fileId)
 *   t               object — theme
 */
export function ExplorerPanel({
  activeFile,
  currentDir,
  displayFilePath,
  fileTree,
  files,
  onFileClick,
  onOpenTerminal,
  onSetActiveFile,
  t,
}) {
  return (
    <FileTree
      activeFile={activeFile}
      currentDir={currentDir}
      displayFilePath={displayFilePath}
      fileTree={fileTree}
      files={files}
      onFileClick={onFileClick}
      onOpenTerminal={onOpenTerminal}
      onSetActiveFile={onSetActiveFile}
      t={t}
    />
  );
}
