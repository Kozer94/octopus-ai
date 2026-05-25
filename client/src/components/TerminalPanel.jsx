import { useRef, useState } from 'react';
import { splitTerminalLinks } from '../utils/terminalLinks';

export function TerminalPanel({
  isRunning,
  onClear,
  onClose,
  onCommandChange,
  onInterrupt,
  onRunCommand,
  onResizeStart,
  onTabChange,
  t,
  terminalBottomRef,
  terminalHeight,
  terminalHistory,
  terminalInput,
  terminalTab,
}) {
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const inputRef = useRef(null);

  const renderTerminalText = (text) => splitTerminalLinks(text).map((part, index) => {
    if (part.type !== 'link') return part.value;

    return (
      <a
        key={`${part.value}-${index}`}
        href={part.value}
        target="_blank"
        rel="noreferrer"
        style={{ color: t.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}
      >
        {part.value}
      </a>
    );
  });

  const getSelectedText = () => {
    const input = inputRef.current;
    if (document.activeElement === input && input.selectionStart !== input.selectionEnd) {
      return terminalInput.slice(input.selectionStart, input.selectionEnd);
    }

    return window.getSelection?.().toString() || '';
  };

  const copyText = async (text) => {
    if (!text) return;
    await navigator.clipboard?.writeText(text);
  };

  const copyAll = () => copyText(terminalHistory.map(item => item.text).join('\n'));

  const pasteClipboard = async () => {
    const text = await navigator.clipboard?.readText?.();
    if (!text) return;
    const input = inputRef.current;
    const start = input?.selectionStart ?? terminalInput.length;
    const end = input?.selectionEnd ?? terminalInput.length;
    const nextInput = `${terminalInput.slice(0, start)}${text}${terminalInput.slice(end)}`;
    onCommandChange(nextInput);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const runCurrentCommand = () => {
    const command = terminalInput.trim();
    if (!command) return;
    setCommandHistory(prev => [command, ...prev.filter(item => item !== command)].slice(0, 50));
    setHistoryIndex(null);
    onRunCommand(terminalInput);
  };

  const recallCommand = (direction) => {
    if (!commandHistory.length) return;
    if (direction === 'down' && historyIndex === 0) {
      setHistoryIndex(null);
      onCommandChange('');
      return;
    }

    const nextIndex = historyIndex === null
      ? (direction === 'up' ? 0 : null)
      : Math.max(0, Math.min(commandHistory.length - 1, historyIndex + (direction === 'up' ? 1 : -1)));

    if (nextIndex === null) return;
    setHistoryIndex(nextIndex);
    onCommandChange(commandHistory[nextIndex]);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      runCurrentCommand();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      recallCommand('up');
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      recallCommand('down');
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      onClear();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && isRunning && !getSelectedText()) {
      event.preventDefault();
      onInterrupt?.();
    }
  };

  const showContextMenu = (event) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, selectedText: getSelectedText() });
  };

  const runContextAction = async (command) => {
    setContextMenu(null);
    if (command === 'copySelection') await copyText(contextMenu?.selectedText || getSelectedText());
    if (command === 'copyAll') await copyAll();
    if (command === 'paste') await pasteClipboard();
    if (command === 'interrupt') await onInterrupt?.();
    if (command === 'clear') onClear();
  };

  return (
    <div style={{ height: terminalHeight, borderTop: `0.5px solid ${t.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative' }} onClick={() => setContextMenu(null)}>
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
        {isRunning && (
          <button title="Interrupt (Ctrl+C)" style={{ background: 'transparent', border: 'none', color: '#ff7b72', cursor: 'pointer', padding: '0 8px', fontSize: 14 }} onClick={onInterrupt}>
            <i className="codicon codicon-debug-stop" style={{ fontSize: 14 }} />
          </button>
        )}
        <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '0 8px', fontSize: 14 }} onClick={onClear}>
          <i className="codicon codicon-trash" style={{ fontSize: 14 }} />
        </button>
        <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '0 8px', fontSize: 14 }} onClick={onClose}>
          <i className="codicon codicon-close" style={{ fontSize: 14 }} />
        </button>
      </div>
      <div onContextMenu={showContextMenu} style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', background: t.bg, fontFamily: 'JetBrains Mono, Consolas, monospace', userSelect: 'text' }}>
        {terminalTab === 'terminal' && terminalHistory.map((historyItem, i) => (
          <div key={i} style={{ fontSize: 12, color: historyItem.type === 'input' ? t.accent : historyItem.type === 'error' ? '#ff7b72' : historyItem.type === 'system' ? '#7ee787' : t.text, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{renderTerminalText(historyItem.text)}</div>
        ))}
        {terminalTab === 'problems' && <p style={{ fontSize: 12, color: t.textMuted }}>No problems</p>}
        {terminalTab === 'output' && <p style={{ fontSize: 12, color: t.textMuted }}>No output</p>}
        <div ref={terminalBottomRef} />
      </div>
      <div onContextMenu={showContextMenu} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderTop: `0.5px solid ${t.border}`, background: t.bg }}>
        <span style={{ color: t.accent, fontFamily: 'monospace', fontSize: 13 }}>$</span>
        <input
          ref={inputRef}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: t.text, fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 12 }}
          value={terminalInput}
          onChange={e => onCommandChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command..."
          dir="ltr"
        />
      </div>
      {contextMenu && (
        <div
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000, minWidth: 180, padding: 4, background: t.panel, border: `0.5px solid ${t.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.28)' }}
          onClick={event => event.stopPropagation()}
        >
          {[
            { label: 'Copy Selection', icon: 'codicon-copy', command: 'copySelection', disabled: !contextMenu.selectedText },
            { label: 'Copy All', icon: 'codicon-copy', command: 'copyAll', disabled: terminalHistory.length === 0 },
            { label: 'Paste', icon: 'codicon-clippy', command: 'paste' },
            { separator: true },
            { label: 'Interrupt', icon: 'codicon-debug-stop', command: 'interrupt', disabled: !isRunning },
            { label: 'Clear', icon: 'codicon-trash', command: 'clear' },
          ].map((item, index) => item.separator ? (
            <div key={index} style={{ height: 1, background: t.border, margin: '4px 6px' }} />
          ) : (
            <button
              key={item.label}
              disabled={item.disabled}
              onClick={() => runContextAction(item.command)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 9px', background: 'transparent', border: 'none', color: item.disabled ? t.textMuted : t.text, cursor: item.disabled ? 'default' : 'pointer', opacity: item.disabled ? 0.45 : 1, textAlign: 'left', fontSize: 12 }}
            >
              <i className={`codicon ${item.icon}`} style={{ color: item.disabled ? t.textMuted : t.accent, fontSize: 13, width: 14 }} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
