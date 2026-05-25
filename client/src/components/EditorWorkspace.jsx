import Editor from "@monaco-editor/react";
import { bidiIsolateStyle, bidiPlainTextStyle } from '../utils/bidiText';
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
  loadingFiles,
  monacoRef,
  selectedExtension,
  setActiveFile,
  setFiles,
  setSelectedExtension,
  t,
  uninstallExtension,
}) {
  const hiddenTabCount = Math.max(0, files.length - 8);

  return (
    <>
      <div style={{ display: "flex", background: t.sidebar, borderBottom: `0.5px solid ${t.border}`, flexShrink: 0, overflowX: "auto" }}>
        {files.map(f => {
          const { icon, color } = getFileIcon(f.name);
          const isActive = f.name === activeFile;
          const fullDisplayPath = displayFilePath(f);

          return (
            <div
              key={f.name}
              title={fullDisplayPath}
              style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer", color: isActive ? t.text : t.textMuted, borderBottom: isActive ? `2px solid ${t.accent}` : `2px solid transparent`, background: isActive ? t.bg : 'transparent', whiteSpace: "nowrap", display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 10, maxWidth: 240, flex: '0 0 auto', position: 'relative' }}
              onClick={() => setActiveFile(f.name)}
            >
              {loadingFiles?.has(f.name) && (
                <span data-respects-reduced-motion style={{ position: 'absolute', left: 6, width: 8, height: 8, borderRadius: '50%', background: t.accent, animation: 'spin 1s linear infinite' }}>
                  <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </span>
              )}
              <i className={`codicon ${icon}`} style={{ color, fontSize: 12 }} />
              <span dir="auto" style={bidiIsolateStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{fullDisplayPath}</span>
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
        {hiddenTabCount > 0 && (
          <span
            title={`${hiddenTabCount} files are accessible by horizontal scrolling`}
            style={{ flex: '0 0 auto', padding: '6px 10px', fontSize: 11, color: t.textMuted, borderBottom: '2px solid transparent' }}
          >
            ... +{hiddenTabCount} more
          </span>
        )}
      </div>

      <div style={{ padding: "3px 12px", background: t.bg, borderBottom: `0.5px solid ${t.border}`, fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
        <i className="codicon codicon-folder" style={{ fontSize: 12, color: t.textMuted }} />
        <span dir="auto" style={bidiIsolateStyle({ color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{displayFilePath(currentFile)}</span>
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
                  <div style={{ display: 'flex', gap: 16, fontSize: 14, color: t.textMuted, flexWrap: 'wrap' }}>
                    <span style={{ flexShrink: 0 }}>v{selectedExtension.version}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👤 {selectedExtension.publisher || selectedExtension.namespace}</span>
                    <span style={{ flexShrink: 0 }}>⬇️ {selectedExtension.downloadCount || selectedExtension.downloads || 0} downloads</span>
                  </div>
                </div>
              </div>

              <p dir="auto" style={bidiPlainTextStyle({ fontSize: 14, color: t.text, lineHeight: 1.6, marginBottom: 24 })}>
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
                    {selectedExtension.tags.map((tag) => (
                      <span key={tag} style={{ background: t.border, padding: '4px 12px', borderRadius: 12, fontSize: 12, color: t.textMuted }}>
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
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontFamily: "JetBrains Mono, Consolas, monospace",
              wordWrap: "on",
              lineNumbers: "on",
              automaticLayout: true,
              contextmenu: true,
              quickSuggestions: true,
              formatOnPaste: true,
              formatOnType: true,
              codeLens: true,
              find: {
                addExtraSpaceOnTop: true,
                autoFindInSelection: 'always',
                seedSearchStringFromSelection: 'always',
              },
            }}
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
              @media (prefers-reduced-motion: reduce) {
                [data-respects-reduced-motion] {
                  animation: none !important;
                  transition: none !important;
                }
              }
            `}</style>

            <div data-respects-reduced-motion style={{ fontSize: 80, animation: 'float 3s ease-in-out infinite', willChange: 'transform' }}>
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
