export function GitPanel({
  commitMsg,
  gitFiles,
  gitLoading,
  onCommit,
  onCommitMsgChange,
  onRefresh,
  t,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', borderBottom: `0.5px solid ${t.border}` }}>
        <button
          style={{ width: '100%', background: t.accent, border: 'none', borderRadius: 6, color: '#fff', padding: '5px 10px', fontSize: 12, cursor: 'pointer', marginBottom: 6 }}
          onClick={onRefresh}
        >
          <i className="codicon codicon-refresh" style={{ fontSize: 12 }} /> Refresh
        </button>
        <input
          style={{ width: '100%', background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '5px 10px', color: t.text, fontSize: 12, outline: 'none', marginBottom: 6 }}
          placeholder="Commit message..."
          value={commitMsg}
          onChange={e => onCommitMsgChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onCommit(); }}
          dir="auto"
        />
        <button
          style={{ width: '100%', background: gitFiles.length > 0 ? '#238636' : t.border, border: 'none', borderRadius: 6, color: '#fff', padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}
          onClick={onCommit}
          disabled={gitFiles.length === 0}
        >
          <i className="codicon codicon-check" style={{ fontSize: 12 }} /> Commit ({gitFiles.length})
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {gitLoading && <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>Loading...</p>}
        {gitFiles.length === 0 && !gitLoading && <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>No changes</p>}
        {gitFiles.map((file) => (
          <div key={`${file.status}:${file.file}`}
            style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = t.border + '44'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: file.status === 'M' ? '#f0883e' : file.status === 'A' ? '#3fb950' : file.status === 'D' ? '#ff7b72' : t.accent, minWidth: 16 }}>
              {file.status}
            </span>
            <span style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.file}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
