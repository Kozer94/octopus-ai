import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { BACKEND } from '../../config/uiConfig';
import { TerminalChatTab } from '../chat/TerminalChatTab';
import { TerminalToolbar } from './TerminalToolbar';
import { RuntimePermissionInspector } from '../auditor/RuntimePermissionInspector';

// ─── Runtime Diagnostics ─────────────────────────────────────────────────────
const DIAG_CHECKS = [
  { id: 'server',    label: 'AI Server',       url: `${BACKEND}/api/health` },
];

function RuntimeDiagnostics({ ptyConnected, t }) {
  const [checks, setChecks] = useState(() => DIAG_CHECKS.map(c => ({ ...c, status: 'checking' })));

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const results = await Promise.all(
        DIAG_CHECKS.map(async (c) => {
          try {
            const res = await fetch(c.url, { signal: AbortSignal.timeout(3000) });
            return { ...c, status: res.ok ? 'ok' : 'warn', detail: res.ok ? 'Responding' : `HTTP ${res.status}` };
          } catch {
            return { ...c, status: 'err', detail: 'Not reachable' };
          }
        })
      );
      if (!cancelled) setChecks(results);
    }
    run();
    return () => { cancelled = true; };
  }, []);

  const statusColor = { ok: '#7ee787', warn: '#d29922', err: '#ff7b72', checking: '#9aa4ad' };
  const statusIcon  = { ok: 'codicon-check', warn: 'codicon-warning', err: 'codicon-error', checking: 'codicon-loading codicon-modifier-spin' };

  // إضافة حالة PTY من الـ prop
  const allChecks = [
    ...checks,
    { id: 'pty', label: 'PTY Terminal', status: ptyConnected ? 'ok' : 'err', detail: ptyConnected ? 'Connected' : 'Disconnected — check server' },
    { id: 'ws',  label: 'WebSocket',    status: ptyConnected ? 'ok' : 'warn', detail: ptyConnected ? 'Active' : 'Attempting reconnect' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', background: t.bg }}>
      <p style={{ fontSize: 10, color: t.accent, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 14 }}>
        Runtime Diagnostics
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {allChecks.map(c => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', alignItems: 'center', gap: 10, padding: '8px 10px', background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 6 }}>
            <i className={`codicon ${statusIcon[c.status] || 'codicon-circle-outline'}`} style={{ color: statusColor[c.status] || t.textMuted, fontSize: 14 }} />
            <span style={{ fontSize: 12, color: t.text }}>{c.label}</span>
            <span style={{ fontSize: 11, color: statusColor[c.status] || t.textMuted }}>{c.detail || c.status}</span>
          </div>
        ))}
      </div>

      {allChecks.some(c => c.status === 'err') && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: '#3d1117', border: '0.5px solid #da3633', borderRadius: 6 }}>
          <p style={{ fontSize: 12, color: '#ffd8d8', fontWeight: 600, marginBottom: 6 }}>Issues detected</p>
          {allChecks.filter(c => c.status === 'err').map(c => (
            <p key={c.id} style={{ fontSize: 11, color: '#ffa198', marginBottom: 4 }}>
              ⛔ {c.label}: {c.detail}
            </p>
          ))}
          <p style={{ fontSize: 11, color: 'rgba(255,216,216,0.7)', marginTop: 8 }}>
            Try: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: 3 }}>npm run dev</code> to restart all services.
          </p>
        </div>
      )}
    </div>
  );
}

function getTerminalSocketUrl() {
  return `${BACKEND.replace(/^http/, 'ws')}/api/terminal/pty`;
}

function getThemeColors(t) {
  return {
    background: t.bg,
    foreground: t.text,
    cursor: t.accent,
    selectionBackground: `${t.accent}55`,
    black: '#000000',
    red: '#ff7b72',
    green: '#7ee787',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#d0d7de',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#ffffff',
  };
}

// دەستکردنی ANSI escape codes
const ESC = String.fromCharCode(27);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*[mGKHF]`, 'g');
function stripAnsi(str) { return str.replace(ANSI_RE, ''); }

// پاتێرنەکانی هەڵە
const ERROR_PATTERN = /\b(Error:|TypeError:|ReferenceError:|SyntaxError:|ENOENT|ECONNREFUSED|EADDRINUSE|Cannot find module|npm ERR!|FAILED|fatal:|Uncaught|Traceback|error TS\d+:|ModuleNotFoundError)\b/i;

export function TerminalPanel({
  currentDir,
  files,
  input,
  isRunning,
  loading,
  onApproveTerminal,
  onClear,
  onClose,
  onErrorDetected,
  onInterrupt,
  onRejectTerminal,
  onResizeStart,
  onTabChange,
  selectedModel,
  send,
  setInput,
  setSelectedModel,
  t,
  terminalCommand,
  terminalHeight,
  terminalTab,
  workflowError,
}) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const socketRef = useRef(null);
  const currentDirRef = useRef(currentDir);
  const initialThemeRef = useRef(t);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const onErrorDetectedRef = useRef(onErrorDetected);
  const errorBufferRef = useRef('');
  const errorTimerRef = useRef(null);
  const lastReportedErrorRef = useRef('');
  // نوێکردنەوەی ref هەموو جار prop دەگۆڕێت
  useEffect(() => { onErrorDetectedRef.current = onErrorDetected; }, [onErrorDetected]);

  useEffect(() => {
    currentDirRef.current = currentDir;
  }, [currentDir]);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 12,
      scrollback: 5000,
      theme: getThemeColors(initialThemeRef.current),
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    terminal.attachCustomKeyEventHandler((event) => {
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === 'c' && terminal.hasSelection()) {
        navigator.clipboard?.writeText(terminal.getSelection()).catch(() => {});
        terminal.clearSelection();
        return false;
      }

      if ((event.ctrlKey || event.metaKey) && key === 'v') {
        navigator.clipboard?.readText?.()
          .then(text => {
            if (text && socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({ type: 'input', data: text }));
            }
          })
          .catch(() => {});
        return false;
      }

      return true;
    });
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    requestAnimationFrame(() => fitAddon.fit());

    return () => {
      reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // prevent reconnect on cleanup
      socketRef.current?.close();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getThemeColors(t);
    }
  }, [t]);

  useEffect(() => {
    if (terminalTab === 'terminal') {
      requestAnimationFrame(() => fitAddonRef.current?.fit());
    }
  }, [terminalTab]);

  useEffect(() => {
    if (terminalTab !== 'terminal') return;

    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    let cancelled = false;

    const connectWebSocket = () => {
      if (cancelled) return;
      fitAddon.fit();
      const socket = new WebSocket(getTerminalSocketUrl());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        setConnected(true);
        setReconnecting(false);
        reconnectAttemptsRef.current = 0;
        const dimensions = fitAddon.proposeDimensions();
        socket.send(JSON.stringify({
          type: 'start',
          cwd: currentDirRef.current,
          cols: dimensions?.cols || terminal.cols,
          rows: dimensions?.rows || terminal.rows,
        }));
      });

      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'data') {
          terminal.write(message.data);
          // تەشخیصی هەڵە — بافەر + debounce
          const cb = onErrorDetectedRef.current;
          if (cb) {
            const clean = stripAnsi(message.data);
            errorBufferRef.current = (errorBufferRef.current + clean).slice(-2000);
            clearTimeout(errorTimerRef.current);
            errorTimerRef.current = setTimeout(() => {
              const buf = errorBufferRef.current;
              if (ERROR_PATTERN.test(buf) && buf !== lastReportedErrorRef.current) {
                lastReportedErrorRef.current = buf;
                errorBufferRef.current = '';
                cb(buf.slice(-1000));
              }
            }, 1500);
          }
        }
        if (message.type === 'ready') terminal.writeln(`\x1b[32mOctopus PTY ready: ${message.cwd}\x1b[0m`);
        if (message.type === 'exit') {
          terminal.writeln(`\x1b[33mProcess exited with code ${message.exitCode ?? 0}\x1b[0m`);
          setConnected(false);
        }
      });

      socket.addEventListener('close', () => {
        if (cancelled) return;
        setConnected(false);
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          setReconnecting(true);
          reconnectAttemptsRef.current += 1;
          const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          terminal.writeln(`\x1b[33mConnection lost. Reconnecting in ${backoffMs / 1000}s... (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})\x1b[0m`);
          setTimeout(() => {
            connectWebSocket();
          }, backoffMs);
        } else {
          terminal.writeln('\x1b[31mMax reconnection attempts reached. Please close and reopen the terminal.\x1b[0m');
          setReconnecting(false);
        }
      });

      socket.addEventListener('error', (error) => {
        if (cancelled) return;
        setConnected(false);
        console.warn('WebSocket error:', error);
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          setReconnecting(true);
          reconnectAttemptsRef.current += 1;
          const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          terminal.writeln(`\x1b[33mConnection error. Retrying in ${backoffMs / 1000}s... (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})\x1b[0m`);
          setTimeout(() => {
            connectWebSocket();
          }, backoffMs);
        } else {
          terminal.writeln('\x1b[31mMax reconnection attempts reached. Please close and reopen the terminal.\x1b[0m');
          setReconnecting(false);
        }
        terminal.writeln('\x1b[31mPTY connection failed\x1b[0m');
      });
    };

    connectWebSocket();

    const inputDisposable = terminal.onData(data => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelled = true;
      inputDisposable.dispose();
      resizeObserver.disconnect();
      socketRef.current?.close();
      reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
    };
  }, [terminalTab]);

  const clearTerminal = () => {
    terminalRef.current?.clear();
    onClear?.();
  };

  const interruptTerminal = () => {
    socketRef.current?.send(JSON.stringify({ type: 'input', data: '\x03' }));
    onInterrupt?.();
  };

  return (
    <div style={{ height: terminalHeight, borderTop: `0.5px solid ${t.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Resize Handle */}
      <div style={{ height: 3, cursor: 'row-resize', background: 'transparent' }}
        onMouseDown={onResizeStart}
        onMouseEnter={e => e.currentTarget.style.background = t.accent}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      />

      {/* Header / Tabs — مستخرج إلى TerminalToolbar */}
      <TerminalToolbar
        connected={connected}
        isRunning={isRunning}
        onClear={clearTerminal}
        onClose={onClose}
        onInterrupt={interruptTerminal}
        onTabChange={onTabChange}
        reconnecting={reconnecting}
        t={t}
        terminalTab={terminalTab}
        workflowError={workflowError}
      />

      {/* Terminal Content */}
      <div ref={containerRef} style={{ display: terminalTab === 'terminal' ? 'block' : 'none', flex: 1, minHeight: 0, background: t.bg, padding: '8px 10px' }} />

      {terminalTab === 'chat' && (
        <TerminalChatTab
          files={files}
          input={input}
          loading={loading}
          onApproveTerminal={onApproveTerminal}
          onRejectTerminal={onRejectTerminal}
          selectedModel={selectedModel}
          send={send}
          setInput={setInput}
          setSelectedModel={setSelectedModel}
          t={t}
          terminalCommand={terminalCommand}
        />
      )}

      {/* Problems Tab — Runtime Diagnostics + Permission Inspector */}
      {terminalTab === 'problems' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <RuntimeDiagnostics ptyConnected={connected} t={t} />
          <div style={{ width: 1, background: t.border, flexShrink: 0 }} />
          <RuntimePermissionInspector t={t} />
        </div>
      )}

      {/* Output Tab */}
      {terminalTab === 'output' && (
        <div style={{ flex: 1, padding: 16, background: t.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <i className="codicon codicon-info" style={{ color: t.textMuted, fontSize: 16 }} />
            <span style={{ fontSize: 12, color: t.textMuted }}>No output available</span>
          </div>
        </div>
      )}
    </div>
  );
}
