import { getSavedFileName } from '../utils/diffUtils';

export function DiffApprovalModal({
  currentDiffFile,
  currentDiffLines,
  onAccept,
  onReject,
  t,
}) {
  if (!currentDiffFile) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 'min(760px, 100%)', maxHeight: '80vh', background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, boxShadow: '0 18px 60px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="codicon codicon-diff" style={{ color: t.accent, fontSize: 14 }} />
          <span style={{ fontSize: 13, color: t.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getSavedFileName(currentDiffFile)}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', background: t.bg, padding: 12, fontFamily: 'JetBrains Mono, Consolas, monospace' }}>
          {currentDiffLines.length === 0 ? (
            <div style={{ fontSize: 12, color: t.textMuted }}>No changed lines</div>
          ) : currentDiffLines.map((line, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: line.startsWith('-') ? '#ff7b72' : line.startsWith('+') ? '#7ee787' : t.text }}>
              {line}
            </div>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: `0.5px solid ${t.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={{ background: t.border, border: 'none', borderRadius: 6, color: t.text, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }} onClick={onReject}>
            رفض
          </button>
          <button style={{ background: '#238636', border: 'none', borderRadius: 6, color: '#fff', padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }} onClick={() => onAccept(currentDiffFile)}>
            قبول
          </button>
        </div>
      </div>
    </div>
  );
}
