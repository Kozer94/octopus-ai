// ChatMonacoBlock.jsx — كتلة ملف كود مضمنة داخل رسالة الدردشة
// تعرض Monaco editor بوضع القراءة فقط + أزرار Diff و Apply

import { useState } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { getEditorLanguage }  from '../../utils/editorLanguage';
import { filesApi }           from '../../services/apiClient';

// ─── استخراج اسم الملف من المسار ────────────────────────────────────────────
function getFilename(path) {
  return String(path || '').split(/[/\\]/).filter(Boolean).pop() || path;
}

/**
 * ChatMonacoBlock
 *
 * Props:
 *   path       string  — مسار الملف (مثلاً: "src/styles/main.css")
 *   code       string  — محتوى الملف المقترح
 *   currentDir string  — مسار المشروع (projectDir)
 *   t          object  — theme
 */
export function ChatMonacoBlock({ path, code, currentDir, t }) {
  const [mode,         setMode]         = useState('view');  // 'view' | 'diff'
  const [originalCode, setOriginalCode] = useState('');
  const [diffLoading,  setDiffLoading]  = useState(false);
  const [applying,     setApplying]     = useState(false);
  const [applied,      setApplied]      = useState(false);
  const [error,        setError]        = useState('');

  const filename = getFilename(path);
  const language = getEditorLanguage(filename);

  // ─── Diff — يجلب الملف الحالي ويعرض الفرق ──────────────────────────────
  const handleDiff = async () => {
    if (mode === 'diff') {
      setMode('view');
      return;
    }
    setDiffLoading(true);
    try {
      const result = await filesApi.read({ filePath: path, projectDir: currentDir });
      setOriginalCode(result?.content || '');
    } catch {
      // الملف غير موجود بعد — يعرض المحتوى الجديد فقط
      setOriginalCode('');
    } finally {
      setDiffLoading(false);
    }
    setMode('diff');
  };

  // ─── Apply — يكتب الملف على القرص ───────────────────────────────────────
  const handleApply = async () => {
    if (applying || applied) return;
    setApplying(true);
    setError('');
    try {
      await filesApi.write({ filePath: path, content: code, projectDir: currentDir });
      setApplied(true);
      setMode('view'); // العودة لوضع القراءة بعد الحفظ
    } catch (err) {
      setError(err.message || 'Write failed');
    } finally {
      setApplying(false);
    }
  };

  // ─── Monaco editor options مشتركة ───────────────────────────────────────
  const editorOptions = {
    readOnly:             true,
    fontSize:             12,
    minimap:              { enabled: false },
    scrollBeyondLastLine: false,
    fontFamily:           'JetBrains Mono, Consolas, monospace',
    wordWrap:             'on',
    lineNumbers:          'on',
    automaticLayout:      true,
    contextmenu:          false,
    scrollbar:            { vertical: 'auto', horizontal: 'auto' },
    overviewRulerLanes:   0,
    hideCursorInOverviewRuler: true,
    renderLineHighlight:  'none',
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      data-chat-monaco-block
      style={{
        border:       `1px solid ${applied ? '#238636' : t.border}`,
        borderRadius: 8,
        overflow:     'hidden',
        margin:       '8px 0',
        transition:   'border-color 0.3s ease',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background:   t.sidebar,
        padding:      '7px 12px',
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        borderBottom: `0.5px solid ${t.border}`,
        userSelect:   'none',
      }}>
        {/* File icon */}
        <i
          className="codicon codicon-file-code"
          style={{ fontSize: 12, color: t.accent, flexShrink: 0 }}
        />

        {/* Filename (bold) */}
        <span style={{
          fontSize:   11,
          fontWeight: 600,
          color:      t.text,
          flexShrink: 0,
        }}>
          {filename}
        </span>

        {/* Full path (muted, truncated) */}
        <span style={{
          fontSize:     10,
          color:        t.textMuted,
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
          fontFamily:   'JetBrains Mono, Consolas, monospace',
          minWidth:     0,
        }}>
          {path}
        </span>

        <div style={{ flex: 1 }} />

        {/* Error message */}
        {error && (
          <span style={{ fontSize: 10, color: '#ff7b72', flexShrink: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ⚠ {error}
          </span>
        )}

        {/* Applied badge */}
        {applied && (
          <span style={{
            fontSize:  11,
            color:     '#3fb950',
            fontWeight: 600,
            flexShrink: 0,
          }}>
            ✓ Saved
          </span>
        )}

        {/* Diff button */}
        <button
          onClick={handleDiff}
          disabled={diffLoading}
          title={mode === 'diff' ? 'Hide diff' : 'Show diff vs current file'}
          style={{
            background:   mode === 'diff' ? t.accent + '22' : t.border,
            border:       mode === 'diff' ? `1px solid ${t.accent}` : '1px solid transparent',
            borderRadius: 5,
            color:        mode === 'diff' ? t.accent : t.text,
            padding:      '3px 9px',
            fontSize:     11,
            cursor:       diffLoading ? 'wait' : 'pointer',
            fontFamily:   'Inter, system-ui, sans-serif',
            fontWeight:   500,
            flexShrink:   0,
          }}
        >
          {diffLoading ? '…' : '⊕ Diff'}
        </button>

        {/* Apply button */}
        {!applied && (
          <button
            onClick={handleApply}
            disabled={applying}
            title={applying ? 'Saving…' : `Write ${filename} to disk`}
            style={{
              background:   applying ? t.border : '#238636',
              border:       'none',
              borderRadius: 5,
              color:        applying ? t.textMuted : '#fff',
              padding:      '3px 9px',
              fontSize:     11,
              cursor:       applying ? 'not-allowed' : 'pointer',
              fontFamily:   'Inter, system-ui, sans-serif',
              fontWeight:   500,
              flexShrink:   0,
            }}
          >
            {applying ? '…' : '✓ Apply'}
          </button>
        )}
      </div>

      {/* ── Language badge ─────────────────────────────────────────────────── */}
      {mode === 'diff' && (
        <div style={{
          background:   t.bg,
          padding:      '4px 14px',
          fontSize:     10,
          color:        t.textMuted,
          borderBottom: `0.5px solid ${t.border}`,
          display:      'flex',
          gap:          12,
        }}>
          <span style={{ color: '#ff7b72' }}>─ original</span>
          <span style={{ color: '#3fb950' }}>+ proposed</span>
        </div>
      )}

      {/* ── Monaco / DiffEditor ────────────────────────────────────────────── */}
      {mode === 'diff' ? (
        <DiffEditor
          height="220px"
          language={language}
          original={originalCode}
          modified={code}
          theme={t.editorTheme}
          options={{
            ...editorOptions,
            lineNumbers:         'on',
            renderSideBySide:    true,
            enableSplitViewResizing: false,
          }}
        />
      ) : (
        <Editor
          height="200px"
          language={language}
          value={code}
          theme={t.editorTheme}
          options={editorOptions}
        />
      )}
    </div>
  );
}
