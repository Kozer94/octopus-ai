import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { BACKEND } from '../config/uiConfig';

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

export function TerminalPanel({
  currentDir,
  isRunning,
  onClear,
  onClose,
  onInterrupt,
  onResizeStart,
  onTabChange,
  t,
  terminalHeight,
  terminalTab,
}) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

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
      theme: getThemeColors(t),
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    requestAnimationFrame(() => fitAddon.fit());

    return () => {
      socketRef.current?.close();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      socketRef.current = null;
    };
  }, [t]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getThemeColors(t);
    }
  }, [t]);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    fitAddon.fit();
    const socket = new WebSocket(getTerminalSocketUrl());
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      setConnected(true);
      const dimensions = fitAddon.proposeDimensions();
      socket.send(JSON.stringify({
        type: 'start',
        cwd: currentDir,
        cols: dimensions?.cols || terminal.cols,
        rows: dimensions?.rows || terminal.rows,
      }));
    });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'data') terminal.write(message.data);
      if (message.type === 'ready') terminal.writeln(`\x1b[32mOctopus PTY ready: ${message.cwd}\x1b[0m`);
      if (message.type === 'exit') {
        terminal.writeln(`\x1b[33mProcess exited with code ${message.exitCode ?? 0}\x1b[0m`);
        setConnected(false);
      }
    });

    socket.addEventListener('close', () => setConnected(false));
    socket.addEventListener('error', () => {
      setConnected(false);
      terminal.writeln('\x1b[31mPTY connection failed\x1b[0m');
    });

    const inputDisposable = terminal.onData(data => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      inputDisposable.dispose();
      resizeObserver.disconnect();
      socket.close();
    };
  }, [currentDir]);

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
      <div style={{ height: 3, cursor: 'row-resize', background: 'transparent' }}
        onMouseDown={onResizeStart}
        onMouseEnter={e => e.currentTarget.style.background = t.accent}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      />
      <div style={{ display: 'flex', alignItems: 'center', background: t.sidebar, borderBottom: `0.5px solid ${t.border}`, flexShrink: 0 }}>
        {['terminal', 'problems', 'output'].map(tab => (
          <button key={tab} onClick={() => onTabChange(tab)}
            style={{ padding: '5px 14px', fontSize: 11, background: 'transparent', border: 'none', cursor: 'pointer', color: terminalTab === tab ? t.text : t.textMuted, borderBottom: terminalTab === tab ? `1px solid ${t.accent}` : '1px solid transparent', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {tab === 'terminal' ? 'TERMINAL' : tab === 'problems' ? 'PROBLEMS' : 'OUTPUT'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: connected || isRunning ? '#7ee787' : t.textMuted, padding: '0 8px' }}>
          {connected || isRunning ? 'PTY' : 'Offline'}
        </span>
        <button title="Interrupt (Ctrl+C)" style={{ background: 'transparent', border: 'none', color: '#ff7b72', cursor: 'pointer', padding: '0 8px', fontSize: 14 }} onClick={interruptTerminal}>
          <i className="codicon codicon-debug-stop" style={{ fontSize: 14 }} />
        </button>
        <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '0 8px', fontSize: 14 }} onClick={clearTerminal}>
          <i className="codicon codicon-trash" style={{ fontSize: 14 }} />
        </button>
        <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '0 8px', fontSize: 14 }} onClick={onClose}>
          <i className="codicon codicon-close" style={{ fontSize: 14 }} />
        </button>
      </div>
      <div ref={containerRef} style={{ display: terminalTab === 'terminal' ? 'block' : 'none', flex: 1, minHeight: 0, background: t.bg, padding: '6px 8px' }} />
      {terminalTab === 'problems' && <p style={{ flex: 1, margin: 0, padding: 12, fontSize: 12, color: t.textMuted, background: t.bg }}>No problems</p>}
      {terminalTab === 'output' && <p style={{ flex: 1, margin: 0, padding: 12, fontSize: 12, color: t.textMuted, background: t.bg }}>No output</p>}
    </div>
  );
}
