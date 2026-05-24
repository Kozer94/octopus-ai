import { ACTIVITY_ITEMS } from '../config/uiConfig';

export function ActivityBar({ activeActivity, onActivityChange, onOpenFolder, t }) {
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
      <button title="Open Folder" style={{ width: 36, height: 36, background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}
        onClick={onOpenFolder}
        onMouseEnter={e => e.currentTarget.style.background = t.border + '66'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <i className="codicon codicon-folder-opened" style={{ color: t.textMuted, fontSize: 18 }} />
      </button>
    </div>
  );
}
