import Editor from "@monaco-editor/react";
import { getEditorLanguage } from '../utils/editorLanguage';
import { getFileIcon } from '../utils/fileIcons';

export function EditorWorkspace({
  activeFile,
  currentFile,
  displayFilePath,
  editorRef,
  files,
  installExtension,
  isExtensionInstalled,
  monacoRef,
  selectedExtension,
  setActiveFile,
  setFiles,
  setSelectedExtension,
  t,
  uninstallExtension,
}) {
  return (
    <>
      <div style={{ display: "flex", background: t.sidebar, borderBottom: `0.5px solid ${t.border}`, flexShrink: 0, overflowX: "auto" }}>
        {files.slice(0, 8).map(f => {
          const { icon, color } = getFileIcon(f.name);
          const isActive = f.name === activeFile;
          const fullDisplayPath = displayFilePath(f);

          return (
            <div
              key={f.name}
              title={fullDisplayPath}
              style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer", color: isActive ? t.text : t.textMuted, borderBottom: isActive ? `2px solid ${t.accent}` : `2px solid transparent`, background: isActive ? t.bg : 'transparent', whiteSpace: "nowrap", display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 10 }}
              onClick={() => setActiveFile(f.name)}
            >
              <i className={`codicon ${icon}`} style={{ color, fontSize: 12 }} />
              <span>{fullDisplayPath}</span>
              <span
                style={{ fontSize: 14, color: t.textMuted, marginRight: 2, lineHeight: 1, padding: '0 2px', borderRadius: 3, opacity: isActive ? 1 : 0 }}
                onClick={e => {
                  e.stopPropagation();
                  const remaining = files.filter(file => file.name !== f.name);
                  setFiles(remaining);
                  if (activeFile === f.name && remaining.length > 0) {
                    setActiveFile(remaining[remaining.length - 1].name);
                  } else if (activeFile === f.name) {
                    setActiveFile('');
                  }
                }}
                onMouseEnter={e => { e.currentTarget.style.background = t.border; e.currentTarget.style.opacity = 1; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = isActive ? '1' : '0'; }}
              >
                ×
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "3px 12px", background: t.bg, borderBottom: `0.5px solid ${t.border}`, fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
        <i className="codicon codicon-folder" style={{ fontSize: 12, color: t.textMuted }} />
        <span style={{ color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayFilePath(currentFile)}</span>
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        {selectedExtension ? (
          <div style={{ padding: 40, overflowY: 'auto', height: '100%', position: 'relative' }}>
            <button
              style={{ position: 'absolute', top: 20, right: 20, background: t.border, border: 'none', borderRadius: 6, color: t.text, padding: '8px 12px', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}
              onClick={() => setSelectedExtension(null)}
              title="Close"
            >
              <i className="codicon codicon-close" style={{ fontSize: 16 }} />
            </button>

            <div style={{ maxWidth: 800, margin: '0 auto' }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                <img
                  src={selectedExtension.icon || selectedExtension.files?.icon}
                  alt={selectedExtension.name}
                  style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'contain' }}
                  onError={e => e.target.style.display = 'none'}
                />
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 600, color: t.text, marginBottom: 8 }}>
                    {selectedExtension.displayName || selectedExtension.name}
                  </h1>
                  <div style={{ display: 'flex', gap: 16, fontSize: 14, color: t.textMuted }}>
                    <span>v{selectedExtension.version}</span>
                    <span>👤 {selectedExtension.publisher || selectedExtension.namespace}</span>
                    <span>⬇️ {selectedExtension.downloadCount || selectedExtension.downloads || 0} downloads</span>
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 14, color: t.text, lineHeight: 1.6, marginBottom: 24 }}>
                {selectedExtension.description || selectedExtension.shortDescription}
              </p>

              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                {isExtensionInstalled(selectedExtension.id) ? (
                  <button
                    style={{ background: t.border, border: 'none', borderRadius: 6, color: t.text, padding: '12px 24px', fontSize: 14, cursor: 'pointer' }}
                    onClick={() => uninstallExtension(selectedExtension.id)}
                  >
                    ❌ Uninstall
                  </button>
                ) : (
                  <button
                    style={{ background: t.accent, border: 'none', borderRadius: 6, color: '#fff', padding: '12px 24px', fontSize: 14, cursor: 'pointer' }}
                    onClick={() => installExtension(selectedExtension)}
                  >
                    📥 Install Extension
                  </button>
                )}
              </div>

              {selectedExtension.tags && selectedExtension.tags.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 12 }}>Tags</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {selectedExtension.tags.map((tag, i) => (
                      <span key={i} style={{ background: t.border, padding: '4px 12px', borderRadius: 12, fontSize: 12, color: t.textMuted }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeFile && currentFile ? (
          <Editor
            height="100%"
            language={getEditorLanguage(activeFile)}
            value={currentFile?.content || ""}
            onChange={val => setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, content: val } : f))}
            onMount={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; }}
            theme={t.editorTheme}
            options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, fontFamily: "JetBrains Mono, Consolas, monospace", wordWrap: "on", lineNumbers: "on" }}
          />
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: t.bg,
            gap: 24,
            userSelect: 'none',
          }}>
            <style>{`
              @keyframes float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-10px); }
              }
            `}</style>

            <div style={{ fontSize: 80, animation: 'float 3s ease-in-out infinite' }}>
              🐙
            </div>

            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: t.text, margin: 0, letterSpacing: 0 }}>
                Octopus AI
              </h1>
              <p style={{ fontSize: 13, color: t.textMuted, marginTop: 6 }}>
                AI-powered multi-leg code editor
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {[
                { key: 'Ctrl+O', label: 'Open Folder' },
                { key: 'Ctrl+P', label: 'Quick Search' },
                { key: 'Ctrl+`', label: 'Open Terminal' },
              ].map(item => (
                <div key={item.key} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '6px 16px', borderRadius: 6,
                  background: t.sidebar, border: `0.5px solid ${t.border}`,
                }}>
                  <kbd style={{
                    fontSize: 11, color: t.accent,
                    background: t.bg, border: `0.5px solid ${t.border}`,
                    borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace',
                  }}>
                    {item.key}
                  </kbd>
                  <span style={{ fontSize: 12, color: t.textMuted }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
