import { useState } from "react";
import { getFileIcon } from '../utils/fileIcons';
import { isOpenFileActive } from '../utils/openFileIdentity';

export function FileTreeNode({ item, level, activeFile, onFileClick, t }) {
  const [open, setOpen] = useState(false);
  const folderColors = {
    app: '#58a6ff', src: '#58a6ff', components: '#79c0ff', config: '#ffa657',
    database: '#ff7b72', routes: '#7ee787', public: '#d2a8ff', resources: '#56d364',
    storage: '#ffa657', tests: '#f778ba', bootstrap: '#ff7b72', lang: '#39d353',
    models: '#79c0ff', controllers: '#58a6ff', views: '#56d364', middleware: '#ffa726',
    providers: '#d2a8ff', mail: '#58a6ff', pages: '#79c0ff', hooks: '#d2a8ff',
    utils: '#ffa657', assets: '#56d364', styles: '#42a5f5', lib: '#ffa657',
  };
  const folderColor = folderColors[item.name.toLowerCase()] || '#e2a14a';

  if (item.type === 'dir') {
    return (
      <div>
        <div
          onClick={() => setOpen(p => !p)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: `3px 8px 3px ${8 + level * 12}px`, cursor: "pointer", userSelect: "none", borderRadius: 4, margin: "1px 4px" }}
          onMouseEnter={e => e.currentTarget.style.background = t.border + '66'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ color: t.textMuted, fontSize: 9, width: 10 }}>{open ? '▾' : '▸'}</span>
          <i className={`codicon ${open ? 'codicon-folder-opened' : 'codicon-folder'}`} style={{ color: folderColor, fontSize: 14, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: open ? t.text : t.textMuted }}>{item.name}</span>
        </div>
        {open && item.children && (
          <div style={{ borderRight: `1px solid ${folderColor}22`, marginRight: 4 }}>
            {item.children.map(child => <FileTreeNode key={child.path} item={child} level={level + 1} activeFile={activeFile} onFileClick={onFileClick} t={t} />)}
          </div>
        )}
      </div>
    );
  }

  const { icon, color } = getFileIcon(item.name);
  const isActive = isOpenFileActive(item, activeFile);
  return (
    <div
      onClick={() => onFileClick(item)}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: `3px 8px 3px ${8 + level * 12}px`, cursor: "pointer", borderRadius: 4, margin: "1px 4px", background: isActive ? t.accent + '22' : 'transparent', borderRight: isActive ? `2px solid ${t.accent}` : '2px solid transparent' }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = t.border + '66' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
    >
      <i className={`codicon ${icon}`} style={{ color, fontSize: 14, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: isActive ? t.text : t.textMuted }}>{item.name}</span>
    </div>
  );
}
