export function TerminalPanel({
  onClear,
  onClose,
  onCommandChange,
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
        <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '0 8px', fontSize: 14 }} onClick={onClear}>
          <i className="codicon codicon-trash" style={{ fontSize: 14 }} />
        </button>
        <button style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '0 8px', fontSize: 14 }} onClick={onClose}>
          <i className="codicon codicon-close" style={{ fontSize: 14 }} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', background: t.bg, fontFamily: 'JetBrains Mono, Consolas, monospace' }}>
        {terminalTab === 'terminal' && terminalHistory.map((historyItem, i) => (
          <div key={i} style={{ fontSize: 12, color: historyItem.type === 'input' ? t.accent : historyItem.type === 'error' ? '#ff7b72' : historyItem.type === 'system' ? '#7ee787' : t.text, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{historyItem.text}</div>
        ))}
        {terminalTab === 'problems' && <p style={{ fontSize: 12, color: t.textMuted }}>No problems</p>}
        {terminalTab === 'output' && <p style={{ fontSize: 12, color: t.textMuted }}>No output</p>}
        <div ref={terminalBottomRef} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderTop: `0.5px solid ${t.border}`, background: t.bg }}>
        <span style={{ color: t.accent, fontFamily: 'monospace', fontSize: 13 }}>$</span>
        <input
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: t.text, fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 12 }}
          value={terminalInput}
          onChange={e => onCommandChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onRunCommand(terminalInput); }}
          placeholder="Enter command..."
          dir="ltr"
        />
      </div>
    </div>
  );
}
