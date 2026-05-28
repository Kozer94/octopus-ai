// FileTreeItem.jsx — عنصر واحد في شجرة الملفات (مجلد أو ملف)
// مستخرج من ExplorerPanel.jsx

import { useEffect, useRef } from 'react';
import { bidiIsolateStyle } from '../../utils/bidiText';
import { getFileIcon } from '../../utils/fileIcons';
import { getOpenFileId } from '../../utils/openFileIdentity';
import { getFolderColor } from './folderColors';

/** حقل تعديل اسم مضمّن — يظهر عند إعادة التسمية */
function RenameInput({ value, onCommit, onAbort, onChange, t }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter')  { e.preventDefault(); onCommit(); }
        if (e.key === 'Escape') { e.preventDefault(); onAbort();  }
        e.stopPropagation();
      }}
      onClick={e => e.stopPropagation()}
      onBlur={onAbort}
      style={{
        flex:        1,
        background:  t.bg,
        border:      `1px solid ${t.accent}`,
        borderRadius: 3,
        color:       t.text,
        fontSize:    12,
        padding:     '1px 4px',
        outline:     'none',
        minWidth:    0,
      }}
    />
  );
}

/** عنصر مجلد */
function FolderItem({ item, isOpen, level, style, t, toggleFolder, onContextMenu, renamingPath, renamingName, onRenameChange, onRenameCommit, onRenameAbort }) {
  const paddingLeft = 8 + level * 12;
  const folderColor = getFolderColor(item.name);
  const isRenaming  = item.path === renamingPath;

  return (
    <div
      onClick={() => !isRenaming && toggleFolder(item.path)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e, item, true); }}
      style={{
        ...style,
        display:    'flex',
        alignItems: 'center',
        gap:        5,
        padding:    `3px 8px 3px ${paddingLeft}px`,
        cursor:     'pointer',
        userSelect: 'none',
        borderRadius: 4,
        margin:     '1px 4px',
      }}
      onMouseEnter={e => { if (!isRenaming) e.currentTarget.style.background = t.border + '66'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ color: t.textMuted, fontSize: 9, width: 10 }}>{isOpen ? '▾' : '▸'}</span>
      <i
        className={`codicon ${isOpen ? 'codicon-folder-opened' : 'codicon-folder'}`}
        style={{ color: folderColor, fontSize: 14, flexShrink: 0 }}
      />
      {isRenaming
        ? <RenameInput
            value={renamingName}
            onChange={onRenameChange}
            onCommit={onRenameCommit}
            onAbort={onRenameAbort}
            t={t}
          />
        : <span
            dir="auto"
            title={item.name}
            style={bidiIsolateStyle({
              fontSize:    12,
              color:       isOpen ? t.text : t.textMuted,
              overflow:    'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:  'nowrap',
            })}
          >
            {item.name}
          </span>
      }
    </div>
  );
}

/** عنصر ملف */
function FileItem({ activeFile, item, level, onFileClick, style, t, onContextMenu, renamingPath, renamingName, onRenameChange, onRenameCommit, onRenameAbort }) {
  const isActive   = getOpenFileId(item) === activeFile;
  const paddingLeft = 8 + level * 12;
  const { icon, color } = getFileIcon(item.name);
  const isRenaming = item.path === renamingPath;

  return (
    <div
      onClick={() => !isRenaming && onFileClick(item)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e, item, false); }}
      style={{
        ...style,
        display:    'flex',
        alignItems: 'center',
        gap:        6,
        padding:    `3px 8px 3px ${paddingLeft}px`,
        cursor:     'pointer',
        borderRadius: 4,
        margin:     '1px 4px',
        background:   isActive ? t.accent + '22' : 'transparent',
        borderRight:  isActive ? `2px solid ${t.accent}` : '2px solid transparent',
      }}
      onMouseEnter={e => { if (!isActive && !isRenaming) e.currentTarget.style.background = t.border + '66'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? t.accent + '22' : 'transparent'; }}
    >
      <i className={`codicon ${icon}`} style={{ color, fontSize: 14, flexShrink: 0 }} />
      {isRenaming
        ? <RenameInput
            value={renamingName}
            onChange={onRenameChange}
            onCommit={onRenameCommit}
            onAbort={onRenameAbort}
            t={t}
          />
        : <span
            dir="auto"
            title={item.name}
            style={bidiIsolateStyle({
              fontSize:    12,
              color:       isActive ? t.text : t.textMuted,
              overflow:    'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:  'nowrap',
            })}
          >
            {item.name}
          </span>
      }
    </div>
  );
}

/**
 * FileTreeItem — يعرض صف واحد في شجرة الملفات (مجلد أو ملف)
 * Props:
 *   row              { item, level, isDir, isOpen }
 *   activeFile       string
 *   onContextMenu    fn(e, item, isDir)
 *   onFileClick      fn(item)
 *   onRenameAbort    fn()
 *   onRenameChange   fn(newName)
 *   onRenameCommit   fn()
 *   renamingName     string
 *   renamingPath     string|null
 *   style            object
 *   t                theme object
 *   toggleFolder     fn(path)
 */
export function FileTreeItem({ activeFile, onContextMenu, onFileClick, onRenameAbort, onRenameChange, onRenameCommit, renamingName, renamingPath, row, style, t, toggleFolder }) {
  const { item, level, isDir, isOpen } = row;

  if (isDir) {
    return (
      <FolderItem
        item={item}
        isOpen={isOpen}
        level={level}
        onContextMenu={onContextMenu}
        onRenameAbort={onRenameAbort}
        onRenameChange={onRenameChange}
        onRenameCommit={onRenameCommit}
        renamingName={renamingName}
        renamingPath={renamingPath}
        style={style}
        t={t}
        toggleFolder={toggleFolder}
      />
    );
  }

  return (
    <FileItem
      activeFile={activeFile}
      item={item}
      level={level}
      onContextMenu={onContextMenu}
      onFileClick={onFileClick}
      onRenameAbort={onRenameAbort}
      onRenameChange={onRenameChange}
      onRenameCommit={onRenameCommit}
      renamingName={renamingName}
      renamingPath={renamingPath}
      style={style}
      t={t}
    />
  );
}
