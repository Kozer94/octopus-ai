import { FileTreeNode } from './FileTreeNode';
import { getFileIcon } from '../utils/fileIcons';

export function ExplorerPanel({
  activeFile,
  displayFilePath,
  files,
  fileTree,
  onFileClick,
  onSetActiveFile,
  t,
}) {
  return (
    <div style={{ overflowY: "auto", flex: 1, paddingTop: 4 }}>
      {fileTree.length > 0
        ? fileTree.map(item => <FileTreeNode key={item.path} item={item} level={0} activeFile={activeFile} onFileClick={onFileClick} t={t} />)
        : files.map(f => (
          <div key={f.name}
            title={displayFilePath(f)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", cursor: "pointer", background: f.name === activeFile ? t.accent + '22' : 'transparent', borderRight: f.name === activeFile ? `2px solid ${t.accent}` : '2px solid transparent' }}
            onClick={() => onSetActiveFile(f.name)}
            onMouseEnter={e => { if (f.name !== activeFile) e.currentTarget.style.background = t.border + '66' }}
            onMouseLeave={e => { if (f.name !== activeFile) e.currentTarget.style.background = 'transparent' }}
          >
            {(() => {
              const { icon, color } = getFileIcon(f.name);
              return <i className={`codicon ${icon}`} style={{ color, fontSize: 14 }} />;
            })()}
            <span style={{ fontSize: 12, color: f.name === activeFile ? t.text : t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayFilePath(f)}</span>
          </div>
        ))
      }
    </div>
  );
}
