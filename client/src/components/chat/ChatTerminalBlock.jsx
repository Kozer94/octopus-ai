// ChatTerminalBlock.jsx — كتلة terminal مضمنة داخل رسالة الدردشة
// تعرض أمر shell مع زر تشغيل وناتج حي عبر PTY stream

import { useState, useRef, useEffect } from 'react';
import { terminalApi } from '../../services/apiClient';

// ─── تنظيف ANSI escape codes ────────────────────────────────────────────────
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*[mGKHFJABCDsuhl]|${ESC}\\]0;.*?${BEL}|\\r`, 'g');
function stripAnsi(str) {
  return String(str || '').replace(ANSI_RE, '');
}

// ─── كتل الـ CSS animations (تُضاف مرة واحدة) ──────────────────────────────
const TERMINAL_STYLES = `
  @keyframes chatTermSpin  { to { transform: rotate(360deg); } }
  @keyframes chatTermBlink { 0%,100% { opacity:1; } 50% { opacity:0; } }
`;

/**
 * ChatTerminalBlock
 *
 * Props:
 *   command    string  — الأمر المراد تشغيله
 *   currentDir string  — مسار المشروع (cwd)
 *   onOutput   fn      — callback for terminal output
 *   t          object  — theme
 */
export function ChatTerminalBlock({ command, currentDir, onOutput, t }) {
  const [output,   setOutput]   = useState('');
  const [running,  setRunning]  = useState(false);
  const [exitCode, setExitCode] = useState(null); // null = لم يُشغَّل بعد
  const abortRef    = useRef(null);
  const outputRef   = useRef(null);

  // تمرير تلقائي للأسفل عند وصول ناتج جديد
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // إلغاء الطلب عند تفكيك المكوّن
  useEffect(() => () => abortRef.current?.abort(), []);

  // ─── تشغيل الأمر ─────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (running) return;

    setRunning(true);
    setOutput('');
    setExitCode(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await terminalApi.stream({
        command,
        cwd: currentDir || undefined,
        signal: ctrl.signal,
        onMessage: (data) => {
          // يستقبل { output: string } أو { done: true, code: number }
          if (data.output != null) {
            const newOutput = data.output;
            setOutput(prev => prev + stripAnsi(newOutput));
            onOutput?.(newOutput);
          }
          if (data.done) {
            setExitCode(data.code ?? 0);
          }
        },
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setOutput(prev => prev + `\nError: ${err.message}`);
      }
    } finally {
      setRunning(false);
    }
  };

  // ─── ألوان ثابتة للـ terminal (لا تتأثر بالثيم) ─────────────────────────
  const BG_TERM   = '#0d1117';
  const BG_HDR    = '#161b22';
  const CLR_GREEN = '#7ee787';
  const CLR_DIM   = '#8b949e';

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      data-chat-terminal-block
      style={{
        background:   BG_TERM,
        border:       `1px solid ${t.border}`,
        borderRadius: 8,
        overflow:     'hidden',
        margin:       '8px 0',
        fontFamily:   'JetBrains Mono, Consolas, monospace',
      }}
    >
      <style>{TERMINAL_STYLES}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background:   BG_HDR,
        padding:      '7px 12px',
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        borderBottom: `0.5px solid ${t.border}`,
        userSelect:   'none',
      }}>
        {/* macOS window dots */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'block', flexShrink: 0 }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e', display: 'block', flexShrink: 0 }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840', display: 'block', flexShrink: 0 }} />
        </div>

        <span style={{
          fontSize:      10,
          fontWeight:    600,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color:         CLR_DIM,
          fontFamily:    'Inter, system-ui, sans-serif',
        }}>
          Terminal
        </span>

        <div style={{ flex: 1 }} />

        {/* Exit code badge */}
        {exitCode !== null && (
          <span style={{
            fontSize:   10,
            padding:    '2px 7px',
            borderRadius: 10,
            background: exitCode === 0 ? '#1a3320' : '#3d1117',
            color:      exitCode === 0 ? '#3fb950' : '#ff7b72',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 500,
          }}>
            exit {exitCode}
          </span>
        )}

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={running}
          title={running ? 'Running…' : 'Run command in terminal'}
          style={{
            background:  running ? t.border : t.accent,
            border:      'none',
            borderRadius: 5,
            color:       running ? t.textMuted : '#fff',
            padding:     '3px 10px',
            fontSize:    11,
            cursor:      running ? 'not-allowed' : 'pointer',
            fontFamily:  'Inter, system-ui, sans-serif',
            fontWeight:  500,
            display:     'flex',
            alignItems:  'center',
            gap:         4,
            flexShrink:  0,
          }}
        >
          {running
            ? (
              <>
                <span style={{ animation: 'chatTermSpin 1s linear infinite', display: 'inline-block', lineHeight: 1 }}>
                  ⟳
                </span>
                Running…
              </>
            )
            : '▶ Run'
          }
        </button>
      </div>

      {/* ── Command line ───────────────────────────────────────────────────── */}
      <div style={{
        padding:      '9px 14px',
        borderBottom: (output || running) ? `0.5px solid ${t.border}` : 'none',
        background:   BG_TERM,
      }}>
        <span style={{ color: '#3fb950', fontSize: 12, userSelect: 'none' }}>$ </span>
        <span style={{ color: CLR_GREEN, fontSize: 12 }}>{command}</span>
      </div>

      {/* ── Live output ────────────────────────────────────────────────────── */}
      {(output || running) && (
        <div
          ref={outputRef}
          style={{
            padding:    '8px 14px 10px',
            maxHeight:  220,
            overflowY:  'auto',
            fontSize:   11.5,
            lineHeight: 1.55,
            color:      '#e6edf3',
            whiteSpace: 'pre-wrap',
            wordBreak:  'break-all',
            background: BG_TERM,
          }}
        >
          {output}
          {/* Blinking cursor while running */}
          {running && (
            <span style={{
              display:       'inline-block',
              width:         7,
              height:        13,
              background:    t.accent,
              verticalAlign: 'text-bottom',
              animation:     'chatTermBlink 1s step-end infinite',
            }} />
          )}
        </div>
      )}
    </div>
  );
}
