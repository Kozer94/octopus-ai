import { codeTextStyle } from '../utils/bidiText';

export function TerminalApprovalModal({
  command,
  onApprove,
  onReject,
  t,
}) {
  if (!command) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 'min(680px, 100%)', background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, boxShadow: '0 18px 60px rgba(0,0,0,0.55)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="codicon codicon-terminal" style={{ color: '#ffa657', fontSize: 14 }} />
          <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>Terminal approval</span>
        </div>
        <div style={{ padding: 14, background: t.bg }}>
          <pre dir="ltr" style={codeTextStyle({ margin: 0, padding: 12, background: '#0d1117', border: `0.5px solid ${t.border}`, borderRadius: 6, color: '#e6edf3', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'JetBrains Mono, Consolas, monospace' })}>
            {command}
          </pre>
        </div>
        <div style={{ padding: 12, borderTop: `0.5px solid ${t.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={{ background: t.border, border: 'none', borderRadius: 6, color: t.text, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }} onClick={onReject}>
            رفض
          </button>
          <button style={{ background: '#238636', border: 'none', borderRadius: 6, color: '#fff', padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }} onClick={() => onApprove(command)}>
            تشغيل
          </button>
        </div>
      </div>
    </div>
  );
}
