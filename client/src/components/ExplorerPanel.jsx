import { useMemo, useState } from 'react';
import { bidiIsolateStyle } from '../utils/bidiText';
import { getFileIcon } from '../utils/fileIcons';
import { flattenVisibleFileTree, getVirtualWindow } from '../utils/fileTreeView';
import { getOpenFileId, isOpenFileActive } from '../utils/openFileIdentity';

const FILE_TREE_ROW_HEIGHT = 24;
const FILE_TREE_OVERSCAN = 12;
const FILE_TREE_MAX_ROWS = 5000;

function getFolderColor(name) {
  const folderColors = {
    app: '#58a6ff', src: '#58a6ff', components: '#79c0ff', config: '#ffa657',
    database: '#ff7b72', routes: '#7ee787', public: '#d2a8ff', resources: '#56d364',
    storage: '#ffa657', tests: '#f778ba', bootstrap: '#ff7b72', lang: '#39d353',
    models: '#79c0ff', controllers: '#58a6ff', views: '#56d364', middleware: '#ffa726',
    providers: '#d2a8ff', mail: '#58a6ff', pages: '#79c0ff', hooks: '#d2a8ff',
    utils: '#ffa657', assets: '#56d364', styles: '#42a5f5', lib: '#ffa657',
  };
  return folderColors[String(name || '').toLowerCase()] || '#e2a14a';
}

function FileTreeRow({ activeFile, onFileClick, row, style, t, toggleFolder }) {
  const { item, level, isDir, isOpen } = row;
  const isActive = !isDir && getOpenFileId(item) === activeFile;
  const paddingLeft = 8 + level * 12;

  if (isDir) {
    const folderColor = getFolderColor(item.name);
    return (
      <div
        onClick={() => toggleFolder(item.path)}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: `3px 8px 3px ${paddingLeft}px`,
          cursor: 'pointer',
          userSelect: 'none',
          borderRadius: 4,
          margin: '1px 4px',
        }}
        onMouseEnter={e => e.currentTarget.style.background = t.border + '66'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ color: t.textMuted, fontSize: 9, width: 10 }}>{isOpen ? '▾' : '▸'}</span>
        <i className={`codicon ${isOpen ? 'codicon-folder-opened' : 'codicon-folder'}`} style={{ color: folderColor, fontSize: 14, flexShrink: 0 }} />
        <span dir="auto" title={item.name} style={bidiIsolateStyle({ fontSize: 12, color: isOpen ? t.text : t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{item.name}</span>
      </div>
    );
  }

  const { icon, color } = getFileIcon(item.name);
  return (
    <div
      onClick={() => onFileClick(item)}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: `3px 8px 3px ${paddingLeft}px`,
        cursor: 'pointer',
        borderRadius: 4,
        margin: '1px 4px',
        background: isActive ? t.accent + '22' : 'transparent',
        borderRight: isActive ? `2px solid ${t.accent}` : '2px solid transparent',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = t.border + '66'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <i className={`codicon ${icon}`} style={{ color, fontSize: 14, flexShrink: 0 }} />
      <span dir="auto" title={item.name} style={bidiIsolateStyle({ fontSize: 12, color: isActive ? t.text : t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{item.name}</span>
    </div>
  );
}

export function ExplorerPanel({
  activeFile,
  displayFilePath,
  files,
  fileTree,
  onFileClick,
  onSetActiveFile,
  t,
  currentDir,
}) {
  const [expandedPaths, setExpandedPaths] = useState(() => new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(420);

  const [prevDirRef, setPrevDirRef] = useState(currentDir);
  if (currentDir !== prevDirRef) {
    setPrevDirRef(currentDir);
    setExpandedPaths(new Set());
  }

  const treeRows = useMemo(
    () => flattenVisibleFileTree(fileTree, expandedPaths, { maxRows: FILE_TREE_MAX_ROWS }),
    [expandedPaths, fileTree],
  );
  const window = getVirtualWindow({
    rowCount: treeRows.length,
    rowHeight: FILE_TREE_ROW_HEIGHT,
    scrollTop,
    viewportHeight,
    overscan: FILE_TREE_OVERSCAN,
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

  return (
    <div onScroll={onTreeScroll} style={{ overflowY: "auto", flex: 1, paddingTop: 4 }}>
      {fileTree.length > 0
        ? (
          <div style={{ height: treeRows.length * FILE_TREE_ROW_HEIGHT, position: 'relative' }}>
            <div style={{ transform: `translateY(${window.offsetY}px)` }}>
              {visibleRows.map(row => (
                <FileTreeRow
                  key={row.item.path}
                  activeFile={activeFile}
                  onFileClick={onFileClick}
                  row={row}
                  style={{ height: FILE_TREE_ROW_HEIGHT, boxSizing: 'border-box' }}
                  t={t}
                  toggleFolder={toggleFolder}
                />
              ))}
            </div>
          </div>
        )
        : files.map(f => (
          <div key={getOpenFileId(f)}
            title={displayFilePath(f)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", cursor: "pointer", background: isOpenFileActive(f, activeFile) ? t.accent + '22' : 'transparent', borderRight: isOpenFileActive(f, activeFile) ? `2px solid ${t.accent}` : '2px solid transparent' }}
            onClick={() => onSetActiveFile(getOpenFileId(f))}
            onMouseEnter={e => { if (!isOpenFileActive(f, activeFile)) e.currentTarget.style.background = t.border + '66' }}
            onMouseLeave={e => { if (!isOpenFileActive(f, activeFile)) e.currentTarget.style.background = 'transparent' }}
          >
            {(() => {
              const { icon, color } = getFileIcon(f.name);
              return <i className={`codicon ${icon}`} style={{ color, fontSize: 14 }} />;
            })()}
            <span dir="auto" style={bidiIsolateStyle({ fontSize: 12, color: isOpenFileActive(f, activeFile) ? t.text : t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{displayFilePath(f)}</span>
          </div>
        ))
      }
    </div>
  );
}
