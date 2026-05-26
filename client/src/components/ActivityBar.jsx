import { ACTIVITY_ITEMS } from '../config/uiConfig';

function ActivityButton({ icon, title, onClick, t, disabled = false, className = '' }) {
  return (
    <button
      title={title}
      className={`activity-btn ${className}`}
      style={{
        '--activity-indicator': t.accent,
        width: 36,
        height: 36,
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease',
        position: 'relative',
      }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = t.border + '66'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      disabled={disabled}
    >
      <i className={`codicon ${icon}`} style={{ color: t.textMuted, fontSize: 18, transition: 'color 0.15s ease' }} />
    </button>
  );
}

export function ActivityBar({ activeActivity, loading, onActivityChange, onOpenFolder, onScanProject, onTerminalToggle, t }) {
  return (
    <div className="glass-subtle elevation-2" style={{ width: 44, background: t.activityBar, borderLeft: `0.5px solid ${t.border}`, boxShadow: `inset -1px 0 0 ${t.border}, 10px 0 28px rgba(0,0,0,0.18)`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8, gap: 2, flexShrink: 0, position: 'relative', zIndex: 3 }}>
      {ACTIVITY_ITEMS.map(item => {
        const isActive = activeActivity === item.id;
        return (
          <button
            key={item.id}
            title={item.title}
            className={`activity-btn ${isActive ? 'active' : ''}`}
            style={{
              '--activity-indicator': t.accent,
              width: 36,
              height: 36,
              background: isActive ? t.accent + '14' : 'transparent',
              border: isActive ? `0.5px solid ${t.accent}33` : '0.5px solid transparent',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isActive ? `0 0 18px ${t.accent}18, inset 0 0 10px ${t.accent}12` : 'none',
              transition: 'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
              position: 'relative',
            }}
            onClick={() => onActivityChange(item.id)}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = t.border + '66' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
          >
            <span className="activity-glow" />
            <i className={`codicon ${item.icon}`} style={{ color: isActive ? t.accent : t.textMuted, fontSize: 18, transition: 'color 0.15s ease, transform 0.15s ease' }} />
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
        <ActivityButton icon="codicon-terminal" title="Terminal" onClick={onTerminalToggle} t={t} />
        <ActivityButton icon="codicon-search" title="Scan Project" onClick={onScanProject} t={t} disabled={loading} className={loading ? 'runtime-pulse' : ''} />
        <ActivityButton icon="codicon-folder-opened" title="Open Folder" onClick={onOpenFolder} t={t} />
      </div>
    </div>
  );
}
