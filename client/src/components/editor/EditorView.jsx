// EditorView.jsx — محرر الكود النشط (Monaco / ملف ثنائي / تفاصيل الإضافة)
// مستخرج من EditorWorkspace.jsx — يظهر عندما يكون هناك ملف أو إضافة محددة

import Editor from '@monaco-editor/react';
import { bidiIsolateStyle, bidiPlainTextStyle } from '../../utils/bidiText';
import { getEditorLanguage, isBinaryEditorFile } from '../../utils/editorLanguage';
import { isOpenFileActive } from '../../utils/openFileIdentity';

const RUNTIME_ANSI_PATTERN = new RegExp(String.raw`\[[0-9;]*m`, 'g');

function stripRuntimeAnsi(value = '') {
  return String(value).replace(RUNTIME_ANSI_PATTERN, '').trim();
}

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

// ─── عرض تفاصيل الإضافة ─────────────────────────────────────────────────────

function ExtensionDetailView({
  activateExtension,
  deactivateExtension,
  installExtension,
  isExtensionInstalled,
  onSuggestExtensionShim,
  selectedExtension,
  setSelectedExtension,
  t,
  uninstallExtension,
}) {
  const runtimeFailureSignal = getRuntimeFailureSignal(selectedExtension?.runtimeStatus);

  return (
    <div style={{ padding: 40, overflowY: 'auto', height: '100%', position: 'relative' }}>
      <button
        style={{
          position: 'absolute', top: 20, right: 20,
          background: t.border, border: 'none', borderRadius: 6,
          color: t.text, padding: '8px 12px',
          fontSize: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36,
        }}
        onClick={() => setSelectedExtension(null)}
        title="Close"
      >
        <i className="codicon codicon-close" style={{ fontSize: 16 }} />
      </button>

      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <img
            src={selectedExtension.icon || selectedExtension.files?.icon}
            alt={selectedExtension.name}
            style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: t.text, marginBottom: 8 }}>
              {selectedExtension.displayName || selectedExtension.name}
            </h1>
            <div style={{ display: 'flex', gap: 16, fontSize: 14, color: t.textMuted, flexWrap: 'wrap' }}>
              <span style={{ flexShrink: 0 }}>v{selectedExtension.version}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                👤 {selectedExtension.publisher || selectedExtension.namespace}
              </span>
              <span style={{ flexShrink: 0 }}>
                ⬇️ {selectedExtension.downloadCount || selectedExtension.downloads || 0} downloads
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <p dir="auto" style={bidiPlainTextStyle({ fontSize: 14, color: t.text, lineHeight: 1.6, marginBottom: 24 })}>
          {selectedExtension.description || selectedExtension.shortDescription}
        </p>

        {/* Action buttons */}
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

        {/* Install notice */}
        {isExtensionInstalled(selectedExtension.id) && (
          <div style={{ border: `0.5px solid ${t.border}`, borderRadius: 6, padding: 10, marginBottom: 20, color: t.textMuted, fontSize: 12, lineHeight: 1.5 }}>
            <strong style={{ color: t.text }}>Installed locally.</strong> VSIX is downloaded and registered in Octopus.
            Activation can use the fast experimental shim or the optional VS Code test-electron base when enabled on the server.
          </div>
        )}

        {/* Runtime status */}
        {selectedExtension.runtimeStatus && (
          <div style={{
            border: `0.5px solid ${selectedExtension.runtimeStatus.state === 'failed' ? '#f85149' : t.border}`,
            borderRadius: 6, padding: 10, marginBottom: 20, color: t.textMuted, fontSize: 12, lineHeight: 1.5,
          }}>
            <strong style={{ color: t.text }}>Runtime:</strong>{' '}
            <span style={{ color: selectedExtension.runtimeStatus.state === 'failed' ? '#ff7b72' : t.textMuted }}>
              {selectedExtension.runtimeStatus.state || selectedExtension.activationStatus}
            </span>
            {selectedExtension.runtimeStatus.engine && <span> • {selectedExtension.runtimeStatus.engine}</span>}
            {selectedExtension.runtimeStatus.commands?.length > 0 && (
              <span> • {selectedExtension.runtimeStatus.commands.length} command(s) registered</span>
            )}
            {runtimeFailureSignal && (
              <div dir="auto" style={{ color: '#ff7b72', marginTop: 6 }}>{runtimeFailureSignal}</div>
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

        {/* Capabilities */}
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

        {/* Tags */}
        {selectedExtension.tags?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: t.text, marginBottom: 12 }}>Tags</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {selectedExtension.tags.map(tag => (
                <span key={tag} style={{ background: t.border, padding: '4px 12px', borderRadius: 12, fontSize: 12, color: t.textMuted }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── عرض الملف الثنائي ───────────────────────────────────────────────────────

function BinaryFileView({ currentFile, displayFilePath, t }) {
  return (
    <div style={{
      height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: t.bg, color: t.textMuted, padding: 24,
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
  );
}

// ─── المحرر الرئيسي ─────────────────────────────────────────────────────────

function MonacoEditorView({ activeFile, currentFile, editorRef, monacoRef, setFiles, t }) {
  return (
    <Editor
      height="100%"
      language={getEditorLanguage(activeFile)}
      value={currentFile?.content || ''}
      onChange={val =>
        setFiles(prev =>
          prev.map(f => isOpenFileActive(f, activeFile) ? { ...f, content: val } : f),
        )
      }
      onMount={(editor, monaco) => {
        editorRef.current  = editor;
        monacoRef.current  = monaco;
      }}
      theme={t.editorTheme}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: 'JetBrains Mono, Consolas, monospace',
        wordWrap: 'on',
        lineNumbers: 'on',
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
  );
}

// ─── Export رئيسي ────────────────────────────────────────────────────────────

/**
 * EditorView — يعرض المحتوى النشط (إضافة | ملف ثنائي | محرر Monaco)
 *
 * Props:
 *   activeFile           string
 *   activateExtension    fn
 *   currentFile          object
 *   deactivateExtension  fn
 *   displayFilePath      fn(file)→string
 *   editorRef            ref
 *   installExtension     fn
 *   isExtensionInstalled fn
 *   monacoRef            ref
 *   onSuggestExtensionShim fn
 *   selectedExtension    object | null
 *   setFiles             fn
 *   setSelectedExtension fn
 *   t                    object — theme
 *   uninstallExtension   fn
 */
export function EditorView({
  activeFile,
  activateExtension,
  currentFile,
  deactivateExtension,
  displayFilePath,
  editorRef,
  installExtension,
  isExtensionInstalled,
  monacoRef,
  onSuggestExtensionShim,
  selectedExtension,
  setFiles,
  setSelectedExtension,
  t,
  uninstallExtension,
}) {
  if (selectedExtension) {
    return (
      <ExtensionDetailView
        activateExtension={activateExtension}
        deactivateExtension={deactivateExtension}
        installExtension={installExtension}
        isExtensionInstalled={isExtensionInstalled}
        onSuggestExtensionShim={onSuggestExtensionShim}
        selectedExtension={selectedExtension}
        setSelectedExtension={setSelectedExtension}
        t={t}
        uninstallExtension={uninstallExtension}
      />
    );
  }

  if (isBinaryEditorFile(activeFile)) {
    return <BinaryFileView currentFile={currentFile} displayFilePath={displayFilePath} t={t} />;
  }

  return (
    <MonacoEditorView
      activeFile={activeFile}
      currentFile={currentFile}
      editorRef={editorRef}
      monacoRef={monacoRef}
      setFiles={setFiles}
      t={t}
    />
  );
}
