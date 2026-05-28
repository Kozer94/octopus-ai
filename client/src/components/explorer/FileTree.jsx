// FileTree.jsx — شجرة الملفات الافتراضية (Virtual Scroll)
// مستخرجة من ExplorerPanel.jsx

import { useCallback, useMemo, useState } from 'react';
import { bidiIsolateStyle } from '../../utils/bidiText';
import { getFileIcon } from '../../utils/fileIcons';
import { flattenVisibleFileTree, getVirtualWindow } from '../../utils/fileTreeView';
import { getOpenFileId, isOpenFileActive } from '../../utils/openFileIdentity';
import { filesApi } from '../../services/apiClient';
import { ContextMenu } from '../layout/ContextMenu';
import { FileTreeItem } from './FileTreeItem';

const FILE_TREE_ROW_HEIGHT = 24;
const FILE_TREE_OVERSCAN   = 12;
const FILE_TREE_MAX_ROWS   = 5000;

/**
 * FileTree — عرض شجرة الملفات بتقنية Virtual Scroll لأداء عالٍ
 *
 * Props:
 *   activeFile      string          — مسار الملف النشط
 *   currentDir      string          — المجلد الحالي
 *   displayFilePath fn(file)→string
 *   fileTree        array           — شجرة الملفات
 *   files           array           — الملفات المفتوحة (fallback)
 *   onFileClick     fn(item)
 *   onSetActiveFile fn(fileId)
 *   t               object          — theme
 */
export function FileTree({
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
  const [expandedPaths, setExpandedPaths]     = useState(() => new Set());
  const [scrollTop, setScrollTop]             = useState(0);
  const [viewportHeight, setViewportHeight]   = useState(420);
  const [localTree, setLocalTree]             = useState(null);
  const [ctxMenu, setCtxMenu]                 = useState(null); // { x, y, item, isDir }
  const [renamingPath, setRenamingPath]       = useState(null);
  const [renamingName, setRenamingName]       = useState('');

  // إعادة ضبط عند تغيير المجلد
  const [prevDir, setPrevDir] = useState(currentDir);
  if (currentDir !== prevDir) {
    setPrevDir(currentDir);
    setExpandedPaths(new Set());
    setLocalTree(null);
    setCtxMenu(null);
    setRenamingPath(null);
  }

  const displayTree = localTree ?? fileTree;

  const treeRows = useMemo(
    () => flattenVisibleFileTree(displayTree, expandedPaths, { maxRows: FILE_TREE_MAX_ROWS }),
    [expandedPaths, displayTree],
  );

  const window = getVirtualWindow({
    rowCount:       treeRows.length,
    rowHeight:      FILE_TREE_ROW_HEIGHT,
    scrollTop,
    viewportHeight,
    overscan:       FILE_TREE_OVERSCAN,
  });
  const visibleRows = treeRows.slice(window.start, window.end);

  function toggleFolder(path) {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function onTreeScroll(event) {
    setScrollTop(event.currentTarget.scrollTop);
    setViewportHeight(event.currentTarget.clientHeight || 420);
  }

  // ─── تحديث الشجرة محلياً بعد العمليات ─────────────────────────────────────
  async function refreshLocalTree() {
    if (!currentDir) return;
    try {
      const data = await filesApi.list(currentDir);
      if (data.success) setLocalTree(data.items);
    } catch { /* ignore */ }
  }

  // ─── فتح قائمة السياق ──────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e, item, isDir) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, item, isDir });
  }, []);

  // ─── نسخ المسار ────────────────────────────────────────────────────────────
  function copyPath(item) {
    navigator.clipboard?.writeText(item.path).catch(() => {});
  }

  function copyRelativePath(item) {
    const base = (currentDir || '').replace(/\\/g, '/');
    const full = (item.path || '').replace(/\\/g, '/');
    const rel  = full.startsWith(base + '/') ? full.slice(base.length + 1) : full;
    navigator.clipboard?.writeText(rel).catch(() => {});
  }

  // ─── الكشف في المستكشف ─────────────────────────────────────────────────────
  function revealInExplorer(item) {
    filesApi.showInExplorer(item.path).catch(() => {});
  }

  // ─── استخراج المجلد الأب ────────────────────────────────────────────────────
  function getParentDir(itemPath) {
    const normalized = (itemPath || '').replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash > 0 ? normalized.slice(0, lastSlash) : (currentDir || '');
  }

  // ─── ملف جديد في نفس مجلد العنصر ────────────────────────────────────────────
  async function doNewFileInParent(item) {
    const parentDir = getParentDir(item.path);
    const name = globalThis.prompt?.('اسم الملف الجديد:');
    if (!name?.trim()) return;
    try {
      await filesApi.write({ filePath: `${parentDir}/${name.trim()}`, content: '', projectDir: currentDir });
      await refreshLocalTree();
    } catch (err) {
      alert(`فشل إنشاء الملف: ${err.message}`);
    }
  }

  // ─── مجلد جديد في نفس مجلد العنصر ──────────────────────────────────────────
  async function doNewFolderInParent(item) {
    const parentDir = getParentDir(item.path);
    const name = globalThis.prompt?.('اسم المجلد الجديد:');
    if (!name?.trim()) return;
    try {
      await filesApi.mkdir({ dirPath: `${parentDir}/${name.trim()}`, projectDir: currentDir });
      await refreshLocalTree();
    } catch (err) {
      alert(`فشل إنشاء المجلد: ${err.message}`);
    }
  }

  // ─── نسخ الملف (Duplicate) ──────────────────────────────────────────────────
  async function doDuplicate(item) {
    const dotIdx = item.name.lastIndexOf('.');
    const ext  = dotIdx > 0 ? item.name.slice(dotIdx) : '';
    const base = dotIdx > 0 ? item.name.slice(0, dotIdx) : item.name;
    const dir  = getParentDir(item.path);
    const newPath = `${dir}/${base}_copy${ext}`;
    try {
      const data = await filesApi.read({ filePath: item.path, projectDir: currentDir });
      await filesApi.write({ filePath: newPath, content: data.content ?? '', projectDir: currentDir });
      await refreshLocalTree();
    } catch (err) {
      alert(`فشل نسخ الملف: ${err.message}`);
    }
  }

  // ─── فتح في الـ Terminal ─────────────────────────────────────────────────────
  function openInTerminal(item, isDir) {
    const folderPath = isDir ? item.path : getParentDir(item.path);
    onOpenTerminal?.('folder', { cwd: folderPath });
  }

  // ─── طي كل المجلدات ─────────────────────────────────────────────────────────
  function collapseAll() {
    setExpandedPaths(new Set());
  }

  // ─── بدء إعادة التسمية (inline) ────────────────────────────────────────────
  function startRename(item) {
    setRenamingPath(item.path);
    setRenamingName(item.name);
  }

  // ─── تأكيد إعادة التسمية ───────────────────────────────────────────────────
  async function commitRename() {
    if (!renamingPath || !renamingName.trim()) { setRenamingPath(null); return; }
    const oldPath = renamingPath;
    const newName = renamingName.trim();
    setRenamingPath(null);
    if (newName === oldPath.split(/[\\/]/).pop()) return; // لم يتغير الاسم
    try {
      await filesApi.rename({ oldPath, newPath: newName, projectDir: currentDir });
      await refreshLocalTree();
    } catch (err) {
      alert(`فشل إعادة التسمية: ${err.message}`);
    }
  }

  function abortRename() {
    setRenamingPath(null);
    setRenamingName('');
  }

  // ─── حذف ملف/مجلد ──────────────────────────────────────────────────────────
  async function doDelete(item, isDir) {
    const label = isDir ? 'المجلد' : 'الملف';
    if (!globalThis.confirm?.(`هل تريد حذف ${label} "${item.name}"؟`)) return;
    try {
      await filesApi.delete({ filePath: item.path, projectDir: currentDir });
      await refreshLocalTree();
    } catch (err) {
      alert(`فشل الحذف: ${err.message}`);
    }
  }

  // ─── ملف جديد ──────────────────────────────────────────────────────────────
  async function doNewFile(parentItem) {
    const name = globalThis.prompt?.('اسم الملف الجديد:');
    if (!name?.trim()) return;
    const newPath = `${parentItem.path}/${name.trim()}`;
    try {
      await filesApi.write({ filePath: newPath, content: '', projectDir: currentDir });
      setExpandedPaths(prev => new Set([...prev, parentItem.path]));
      await refreshLocalTree();
    } catch (err) {
      alert(`فشل إنشاء الملف: ${err.message}`);
    }
  }

  // ─── مجلد جديد ─────────────────────────────────────────────────────────────
  async function doNewFolder(parentItem) {
    const name = globalThis.prompt?.('اسم المجلد الجديد:');
    if (!name?.trim()) return;
    const newPath = `${parentItem.path}/${name.trim()}`;
    try {
      await filesApi.mkdir({ dirPath: newPath, projectDir: currentDir });
      setExpandedPaths(prev => new Set([...prev, parentItem.path]));
      await refreshLocalTree();
    } catch (err) {
      alert(`فشل إنشاء المجلد: ${err.message}`);
    }
  }

  // ─── بناء عناصر قائمة السياق ────────────────────────────────────────────────
  function buildMenuItems(item, isDir) {
    if (isDir) {
      return [
        { label: 'New File...',    icon: 'codicon-new-file',   action: () => doNewFile(item) },
        { label: 'New Folder...', icon: 'codicon-new-folder',  action: () => doNewFolder(item) },
        { separator: true },
        { label: 'Open in Integrated Terminal', icon: 'codicon-terminal', action: () => openInTerminal(item, true) },
        { separator: true },
        { label: 'Collapse All Folders', icon: 'codicon-collapse-all', action: () => collapseAll() },
        { separator: true },
        { label: 'Copy Path',          icon: 'codicon-copy',              action: () => copyPath(item) },
        { label: 'Copy Relative Path', icon: 'codicon-file-symlink-file', action: () => copyRelativePath(item) },
        { separator: true },
        { label: 'Rename',  icon: 'codicon-edit',  shortcut: 'F2',  action: () => startRename(item) },
        { label: 'Delete',  icon: 'codicon-trash', shortcut: 'Del', danger: true, action: () => doDelete(item, true) },
        { separator: true },
        { label: 'Reveal in Explorer', icon: 'codicon-folder-opened', action: () => revealInExplorer(item) },
      ];
    }
    return [
      { label: 'Open',        icon: 'codicon-go-to-file', action: () => onFileClick(item) },
      { separator: true },
      { label: 'New File...',    icon: 'codicon-new-file',   action: () => doNewFileInParent(item) },
      { label: 'New Folder...', icon: 'codicon-new-folder',  action: () => doNewFolderInParent(item) },
      { separator: true },
      { label: 'Duplicate',   icon: 'codicon-files',      action: () => doDuplicate(item) },
      { separator: true },
      { label: 'Copy Path',          icon: 'codicon-copy',              shortcut: 'Ctrl+Alt+C', action: () => copyPath(item) },
      { label: 'Copy Relative Path', icon: 'codicon-file-symlink-file', action: () => copyRelativePath(item) },
      { separator: true },
      { label: 'Rename',  icon: 'codicon-edit',  shortcut: 'F2',  action: () => startRename(item) },
      { label: 'Delete',  icon: 'codicon-trash', shortcut: 'Del', danger: true, action: () => doDelete(item, false) },
      { separator: true },
      { label: 'Open Containing Folder in Terminal', icon: 'codicon-terminal', action: () => openInTerminal(item, false) },
      { label: 'Reveal in Explorer',                 icon: 'codicon-folder-opened', action: () => revealInExplorer(item) },
    ];
  }

  // ─── عرض الشجرة الافتراضية ───────────────────────────────────────────────
  if (displayTree.length > 0) {
    return (
      <>
        <div onScroll={onTreeScroll} style={{ overflowY: 'auto', flex: 1, paddingTop: 4 }}>
          <div style={{ height: treeRows.length * FILE_TREE_ROW_HEIGHT, position: 'relative' }}>
            <div style={{ transform: `translateY(${window.offsetY}px)` }}>
              {visibleRows.map(row => (
                <FileTreeItem
                  key={row.item.path}
                  activeFile={activeFile}
                  onContextMenu={handleContextMenu}
                  onFileClick={onFileClick}
                  onRenameAbort={abortRename}
                  onRenameChange={setRenamingName}
                  onRenameCommit={commitRename}
                  renamingName={renamingName}
                  renamingPath={renamingPath}
                  row={row}
                  style={{ height: FILE_TREE_ROW_HEIGHT, boxSizing: 'border-box' }}
                  t={t}
                  toggleFolder={toggleFolder}
                />
              ))}
            </div>
          </div>
        </div>

        {ctxMenu && (
          <ContextMenu
            items={buildMenuItems(ctxMenu.item, ctxMenu.isDir)}
            onClose={() => setCtxMenu(null)}
            t={t}
            x={ctxMenu.x}
            y={ctxMenu.y}
          />
        )}
      </>
    );
  }

  // ─── Fallback: قائمة الملفات المفتوحة عندما تكون الشجرة فارغة ─────────────
  return (
    <>
      <div style={{ overflowY: 'auto', flex: 1, paddingTop: 4 }}>
        {files.map(f => {
          const { icon, color } = getFileIcon(f.name);
          const isActive = isOpenFileActive(f, activeFile);
          return (
            <div
              key={getOpenFileId(f)}
              title={displayFilePath(f)}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        6,
                padding:    '4px 12px',
                cursor:     'pointer',
                background: isActive ? t.accent + '22' : 'transparent',
                borderRight: isActive ? `2px solid ${t.accent}` : '2px solid transparent',
              }}
              onClick={() => onSetActiveFile(getOpenFileId(f))}
              onContextMenu={e => { e.preventDefault(); handleContextMenu(e, f, false); }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = t.border + '66'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <i className={`codicon ${icon}`} style={{ color, fontSize: 14 }} />
              <span
                dir="auto"
                style={bidiIsolateStyle({
                  fontSize:    12,
                  color:       isActive ? t.text : t.textMuted,
                  overflow:    'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:  'nowrap',
                })}
              >
                {displayFilePath(f)}
              </span>
            </div>
          );
        })}
      </div>

      {ctxMenu && (
        <ContextMenu
          items={buildMenuItems(ctxMenu.item, ctxMenu.isDir)}
          onClose={() => setCtxMenu(null)}
          t={t}
          x={ctxMenu.x}
          y={ctxMenu.y}
        />
      )}
    </>
  );
}
