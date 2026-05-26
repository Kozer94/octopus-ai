export function SidebarShell({
  activeActivity,
  children,
  onCreateFile,
  sidebarWidth,
  t,
}) {
  const title = activeActivity === 'explorer'
    ? 'EXPLORER'
    : activeActivity === 'search'
      ? 'SEARCH'
      : activeActivity === 'git'
        ? 'GIT'
        : 'EXTENSIONS';

  return (
    <div className="glass-subtle panel-expand" style={{ width: sidebarWidth, background: t.sidebar, borderLeft: `0.5px solid ${t.border}`, boxShadow: `8px 0 24px rgba(0,0,0,0.14), inset -1px 0 0 ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0, position: 'relative', zIndex: 2 }}>
      <div style={{ padding: "8px 12px", borderBottom: `0.5px solid ${t.border}`, background: 'rgba(255,255,255,0.018)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 500 }}>
          {title}
        </span>
        <button
          style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 14 }}
          onClick={onCreateFile}
        >
          +
        </button>
      </div>
      {children}
    </div>
  );
}
