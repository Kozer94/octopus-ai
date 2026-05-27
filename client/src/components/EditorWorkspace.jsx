import Editor from "@monaco-editor/react";
import { bidiIsolateStyle, bidiPlainTextStyle } from '../utils/bidiText';
import { getEditorLanguage, isBinaryEditorFile } from '../utils/editorLanguage';
import { getFileIcon } from '../utils/fileIcons';
import { getOpenFileId, isOpenFileActive } from '../utils/openFileIdentity';

const FALLBACK_NODES = [
  { name: 'workspace', icon: 'codicon-root-folder', color: '#58a6ff', x: 50, y: 28 },
  { name: 'source', icon: 'codicon-symbol-namespace', color: '#3fb950', x: 25, y: 48 },
  { name: 'runtime', icon: 'codicon-terminal', color: '#f0883e', x: 73, y: 48 },
  { name: 'tests', icon: 'codicon-beaker', color: '#d29922', x: 37, y: 72 },
  { name: 'context', icon: 'codicon-comment-discussion', color: '#f778ba', x: 63, y: 72 },
];

const NODE_POSITIONS = [
  [50, 22],
  [28, 36],
  [72, 36],
  [22, 61],
  [78, 61],
  [50, 78],
  [36, 55],
  [64, 55],
];

function SpatialHome({ currentDir, displayFilePath, files, projectName, setActiveFile, t }) {
  const sourceFiles = files.slice(0, 8);
  const nodes = sourceFiles.length > 0
    ? sourceFiles.map((file, index) => {
        const { icon, color } = getFileIcon(file.name);
        const [x, y] = NODE_POSITIONS[index % NODE_POSITIONS.length];
        return { name: displayFilePath(file), fileName: getOpenFileId(file), icon, color, x, y };
      })
    : FALLBACK_NODES;

  const focusFiles = files.slice(0, 5);

  return (
    <div style={{
      height: '100%',
      minHeight: 0,
      display: 'grid',
      gridTemplateRows: '1fr auto',
      background: t.bg,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <style>{`
        @keyframes octopusPulse {
          0%, 100% { transform: scale(1); opacity: 0.72; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        @keyframes orbitSweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-spatial-motion] {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(190px, 260px) minmax(280px, 1fr) minmax(180px, 240px)',
        gap: 18,
        padding: '28px 32px 18px',
        minHeight: 0,
      }}>
        <section style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18, minWidth: 0 }}>
          <div>
            <p style={{ fontSize: 10, color: t.accent, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>
              Spatial Workspace
            </p>
            <h1 style={{ fontSize: 26, lineHeight: 1.1, color: t.text, margin: 0, letterSpacing: 0 }}>
              {projectName || 'Octopus AI'}
            </h1>
            <p dir="auto" style={bidiIsolateStyle({ fontSize: 12, color: t.textMuted, marginTop: 8, lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
              {currentDir || 'Open a folder to let the workspace map itself.'}
            </p>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {[
              ['Open files', files.length],
              ['Visible nodes', nodes.length],
              ['Context lanes', Math.max(1, Math.min(8, files.length || 3))],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', borderBottom: `0.5px solid ${t.border}`, paddingBottom: 7 }}>
                <span style={{ fontSize: 11, color: t.textMuted }}>{label}</span>
                <span style={{ fontSize: 12, color: t.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{
          position: 'relative',
          minHeight: 360,
          borderTop: `0.5px solid ${t.border}`,
          borderBottom: `0.5px solid ${t.border}`,
          overflow: 'hidden',
        }}>
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.62 }}>
            {nodes.map((node, index) => {
              const next = nodes[(index + 1) % nodes.length];
              return (
                <line
                  key={`${node.name}:${next.name}`}
                  x1={node.x}
                  y1={node.y}
                  x2={next.x}
                  y2={next.y}
                  stroke={t.border}
                  strokeWidth="0.25"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            <line x1="50" y1="50" x2="50" y2="22" stroke={t.accent} strokeOpacity="0.5" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
            <line x1="50" y1="50" x2="28" y2="36" stroke={t.accent} strokeOpacity="0.32" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
            <line x1="50" y1="50" x2="72" y2="36" stroke={t.accent} strokeOpacity="0.32" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
          </svg>

          <div data-spatial-motion data-respects-reduced-motion style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 176,
            height: 176,
            marginLeft: -88,
            marginTop: -88,
            borderRadius: '50%',
            border: `0.5px solid ${t.accent}66`,
            animation: 'orbitSweep 18s linear infinite',
            willChange: 'transform',
          }} />

          <div style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 112,
            height: 112,
            borderRadius: '50%',
            border: `1px solid ${t.border}`,
            background: t.sidebar,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 0 12px ${t.bg}99`,
          }}>
            <div data-spatial-motion data-respects-reduced-motion style={{ fontSize: 54, animation: 'octopusPulse 4s ease-in-out infinite', willChange: 'transform' }}>
              🐙
            </div>
          </div>

          {nodes.map(node => (
            <button
              key={node.name}
              title={node.name}
              style={{
                position: 'absolute',
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                maxWidth: 168,
                height: 30,
                border: `0.5px solid ${t.border}`,
                borderRadius: 16,
                background: t.sidebar,
                color: t.text,
                padding: '0 10px',
                cursor: node.fileName ? 'pointer' : 'default',
                boxShadow: `0 0 0 4px ${t.bg}66`,
              }}
              onClick={() => node.fileName && setActiveFile(node.fileName)}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = node.color;
                e.currentTarget.style.background = t.border;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = t.border;
                e.currentTarget.style.background = t.sidebar;
              }}
            >
              <i className={`codicon ${node.icon}`} style={{ color: node.color, fontSize: 13, flexShrink: 0 }} />
              <span dir="auto" style={bidiIsolateStyle({ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                {node.name}
              </span>
            </button>
          ))}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, minWidth: 0 }}>
          <p style={{ fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
            Focus Ring
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {focusFiles.length > 0 ? focusFiles.map((file, index) => {
              const { icon, color } = getFileIcon(file.name);
              return (
                <button
                  key={getOpenFileId(file)}
                  title={displayFilePath(file)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '22px 1fr auto',
                    alignItems: 'center',
                    gap: 8,
                    background: t.sidebar,
                    border: `0.5px solid ${t.border}`,
                    borderRadius: 6,
                    padding: '7px 8px',
                    cursor: 'pointer',
                    minWidth: 0,
                  }}
                  onClick={() => setActiveFile(getOpenFileId(file))}
                >
                  <i className={`codicon ${icon}`} style={{ color, fontSize: 13 }} />
                  <span dir="auto" style={bidiIsolateStyle({ fontSize: 11, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                    {displayFilePath(file)}
                  </span>
                  <span style={{ fontSize: 10, color: t.textMuted }}>{index + 1}</span>
                </button>
              );
            }) : (
              <div style={{ border: `0.5px dashed ${t.border}`, borderRadius: 6, padding: 12 }}>
                <p style={{ fontSize: 12, color: t.text, marginBottom: 5 }}>No files in orbit</p>
                <p style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>Use the left rail to open a folder, scan the project, or bring up the terminal.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(140px, 1fr))',
        gap: 1,
        borderTop: `0.5px solid ${t.border}`,
        background: t.border,
      }}>
        {[
          { label: 'Build', icon: 'codicon-tools', text: 'editor first' },
          { label: 'Explore', icon: 'codicon-type-hierarchy-sub', text: 'map first' },
          { label: 'Debug', icon: 'codicon-debug-alt', text: 'signals first' },
        ].map(item => (
          <div key={item.label} style={{ background: t.bg, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <i className={`codicon ${item.icon}`} style={{ color: t.accent, fontSize: 14 }} />
            <span style={{ fontSize: 12, color: t.text, fontWeight: 600 }}>{item.label}</span>
            <span style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const RUNTIME_ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001b\[[0-9;]*m`, 'g');

function getRuntimeFailureSignal(runtimeStatus = {}) {
  if (runtimeStatus.error) return stripRuntimeAnsi(runtimeStatus.error);
  const logs = Array.isArray(runtimeStatus.logs) ? runtimeStatus.logs : [];
  const failureLog = [...logs].reverse().find(log => {
    const message = stripRuntimeAnsi(log?.message);
    return log?.level === 'err'
      || /activationFailed|ACTIVATE FAILED|TypeError|ReferenceError|is not a function|Cannot /.test(message);
  });
  return failureLog ? stripRuntimeAnsi(failureLog.message) : '';
}

function stripRuntimeAnsi(value = '') {
  return String(value).replace(RUNTIME_ANSI_ESCAPE_PATTERN, '').trim();
}

export function EditorWorkspace({
  activeFile,
  currentFile,
  currentDir,
  displayFilePath,
  editorRef,
  files,
  activateExtension,
  deactivateExtension,
  onSuggestExtensionShim,
  installExtension,
  isExtensionInstalled,
  loadingFiles,
  monacoRef,
  projectName,
  selectedExtension,
  setActiveFile,
  setFiles,
  setSelectedExtension,
  t,
  uninstallExtension,
}) {
  const hiddenTabCount = Math.max(0, files.length - 8);
  const isBinaryFile = isBinaryEditorFile(activeFile);
  const runtimeFailureSignal = getRuntimeFailureSignal(selectedExtension?.runtimeStatus);

  return (
    <>
      <div style={{ display: "flex", background: t.sidebar, borderBottom: `0.5px solid ${t.border}`, flexShrink: 0, overflowX: "auto" }}>
        {files.map(f => {
          const { icon, color } = getFileIcon(f.name);
          const fileId = getOpenFileId(f);
          const isActive = isOpenFileActive(f, activeFile);
          const fullDisplayPath = displayFilePath(f);

          return (
            <div
              key={fileId}
              title={fullDisplayPath}
              style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer", color: isActive ? t.text : t.textMuted, borderBottom: isActive ? `2px solid ${t.accent}` : `2px solid transparent`, background: isActive ? t.bg : 'transparent', whiteSpace: "nowrap", display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 10, maxWidth: 240, flex: '0 0 auto', position: 'relative', overflow: 'hidden' }}
              onClick={() => setActiveFile(fileId)}
            >
              {loadingFiles?.has(fileId) && (
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
                  const remaining = files.filter(file => getOpenFileId(file) !== fileId);
                  setFiles(remaining);
                  if (activeFile === fileId && remaining.length > 0) {
                    setActiveFile(getOpenFileId(remaining[remaining.length - 1]));
                  } else if (activeFile === fileId) {
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

      {currentFile && (
        <div style={{ padding: "3px 12px", background: t.bg, borderBottom: `0.5px solid ${t.border}`, fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="codicon codicon-folder" style={{ fontSize: 12, color: t.textMuted }} />
          <span dir="auto" style={bidiIsolateStyle({ color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{displayFilePath(currentFile)}</span>
        </div>
      )}

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
                  <>
                    <button
                    style={{ background: t.border, border: 'none', borderRadius: 6, color: t.text, padding: '12px 24px', fontSize: 14, cursor: 'pointer' }}
                    onClick={() => uninstallExtension(selectedExtension.id)}
                  >
                    ❌ Remove local VSIX
                  </button>
                    {selectedExtension.runtimeStatus?.state === 'active' ? (
                      <button
                        style={{ background: t.border, border: 'none', borderRadius: 6, color: t.text, padding: '12px 18px', fontSize: 14, cursor: 'pointer' }}
                        onClick={() => deactivateExtension(selectedExtension.id)}
                      >
                        ⏹ Stop host
                      </button>
                    ) : (
                      <button
                        style={{ background: t.accent, border: 'none', borderRadius: 6, color: '#fff', padding: '12px 18px', fontSize: 14, cursor: 'pointer' }}
                        onClick={() => activateExtension(selectedExtension.id)}
                      >
                        ▶ Activate shim
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    style={{ background: t.accent, border: 'none', borderRadius: 6, color: '#fff', padding: '12px 24px', fontSize: 14, cursor: 'pointer' }}
                    onClick={() => installExtension(selectedExtension)}
                  >
                    📥 Install VSIX locally
                  </button>
                )}
              </div>

              {isExtensionInstalled(selectedExtension.id) && (
                <div style={{ border: `0.5px solid ${t.border}`, borderRadius: 6, padding: 10, marginBottom: 20, color: t.textMuted, fontSize: 12, lineHeight: 1.5 }}>
                  <strong style={{ color: t.text }}>Installed locally.</strong> VSIX is downloaded and registered in Octopus. Activation can use the fast experimental shim or the optional VS Code test-electron base when enabled on the server.
                </div>
              )}

              {selectedExtension.runtimeStatus && (
                <div style={{ border: `0.5px solid ${selectedExtension.runtimeStatus.state === 'failed' ? '#f85149' : t.border}`, borderRadius: 6, padding: 10, marginBottom: 20, color: t.textMuted, fontSize: 12, lineHeight: 1.5 }}>
                  <strong style={{ color: t.text }}>Runtime:</strong> <span style={{ color: selectedExtension.runtimeStatus.state === 'failed' ? '#ff7b72' : t.textMuted }}>{selectedExtension.runtimeStatus.state || selectedExtension.activationStatus}</span>
                  {selectedExtension.runtimeStatus.engine && (
                    <span> • {selectedExtension.runtimeStatus.engine}</span>
                  )}
                  {selectedExtension.runtimeStatus.commands?.length > 0 && (
                    <span> • {selectedExtension.runtimeStatus.commands.length} command(s) registered</span>
                  )}
                  {runtimeFailureSignal && (
                    <div dir="auto" style={{ color: '#ff7b72', marginTop: 6 }}>
                      {runtimeFailureSignal}
                    </div>
                  )}
                  {selectedExtension.runtimeStatus.state === 'failed' && (
                    <button
                      style={{ display: 'block', marginTop: 10, background: t.accent, border: 'none', borderRadius: 5, color: '#fff', padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}
                      onClick={() => onSuggestExtensionShim?.(selectedExtension)}
                    >
                      Ask Octopus to draft shim
                    </button>
                  )}
                </div>
              )}

              {selectedExtension.capabilities?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 12 }}>Detected VSIX capabilities</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {selectedExtension.capabilities.map(capability => (
                      <span key={capability.type} style={{ background: t.border, padding: '4px 10px', borderRadius: 12, fontSize: 12, color: t.textMuted }}>
                        {capability.type}: {capability.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

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
        ) : activeFile && currentFile && isBinaryFile ? (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: t.bg,
            color: t.textMuted,
            padding: 24,
          }}>
            <div style={{
              width: 'min(420px, 90%)',
              border: `0.5px solid ${t.border}`,
              borderRadius: 8,
              background: t.sidebar,
              padding: 18,
              textAlign: 'center',
              boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
            }}>
              <i className="codicon codicon-database" style={{ color: t.accent, fontSize: 28, marginBottom: 10 }} />
              <p dir="auto" style={bidiIsolateStyle({ color: t.text, fontSize: 13, marginBottom: 6 })}>
                {displayFilePath(currentFile)}
              </p>
              <p style={{ fontSize: 12, lineHeight: 1.6 }}>
                This file is binary, so it cannot be opened safely in the code editor.
              </p>
            </div>
          </div>
        ) : activeFile && currentFile ? (
          <Editor
            height="100%"
            language={getEditorLanguage(activeFile)}
            value={currentFile?.content || ""}
            onChange={val => setFiles(prev => prev.map(f => isOpenFileActive(f, activeFile) ? { ...f, content: val } : f))}
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
          <SpatialHome
            currentDir={currentDir}
            displayFilePath={displayFilePath}
            files={files}
            projectName={projectName}
            setActiveFile={setActiveFile}
            t={t}
          />
        )}
      </div>
    </>
  );
}
