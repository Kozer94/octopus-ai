import { ACTIVITY_ITEMS } from '../config/uiConfig';

function ActivityButton({ icon, title, onClick, t, disabled = false }) {
  return (
    <button
      title={title}
      style={{ width: 36, height: 36, background: 'transparent', border: 'none', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = t.border + '66'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      disabled={disabled}
    >
      <i className={`codicon ${icon}`} style={{ color: t.textMuted, fontSize: 18 }} />
    </button>
  );
}

export function ActivityBar({ activeActivity, loading, onActivityChange, onOpenFolder, onScanProject, onTerminalToggle, t }) {
  return (
    <div style={{ width: 44, background: t.activityBar, borderLeft: `0.5px solid ${t.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8, gap: 2, flexShrink: 0 }}>
      {ACTIVITY_ITEMS.map(item => (
        <button key={item.id} title={item.title}
          style={{ width: 36, height: 36, background: activeActivity === item.id ? t.border : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: activeActivity === item.id ? `2px solid ${t.accent}` : '2px solid transparent' }}
          onClick={() => onActivityChange(item.id)}
          onMouseEnter={e => { if (activeActivity !== item.id) e.currentTarget.style.background = t.border + '66' }}
          onMouseLeave={e => { if (activeActivity !== item.id) e.currentTarget.style.background = 'transparent' }}
        >
          <i className={`codicon ${item.icon}`} style={{ color: activeActivity === item.id ? t.accent : t.textMuted, fontSize: 18 }} />
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
        <ActivityButton icon="codicon-terminal" title="Terminal" onClick={onTerminalToggle} t={t} />
        <ActivityButton icon="codicon-search" title="Scan Project" onClick={onScanProject} t={t} disabled={loading} />
        <ActivityButton icon="codicon-folder-opened" title="Open Folder" onClick={onOpenFolder} t={t} />
      </div>
    </div>
  );
}
