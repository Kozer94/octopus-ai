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
    <div style={{ width: sidebarWidth, background: t.sidebar, borderLeft: `0.5px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "8px 12px", borderBottom: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
