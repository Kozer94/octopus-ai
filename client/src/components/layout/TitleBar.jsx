import { THEMES } from '../../config/uiConfig';

import { useCallback, useEffect, useRef } from 'react';

function WindowControlButton({ action, icon, title, t, danger = false }) {
  const hoverColor = danger ? '#c42b1c' : t.border;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      style={{
        width: 46,
        height: 36,
        border: 'none',
        borderRadius: 0,
        background: 'transparent',
        color: danger ? '#ffb4ab' : t.textMuted,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        WebkitAppRegion: 'no-drag',
      }}
      onClick={e => {
        e.stopPropagation();
        window.octopus?.windowControl?.(action);
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = hoverColor;
        e.currentTarget.style.color = danger ? '#ffffff' : t.text;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = danger ? '#ffb4ab' : t.textMuted;
      }}
    >
      <i className={`codicon ${icon}`} />
    </button>
  );
}

export function TitleBar({
  currentDir,
  doSearch,
  loading,
  menuOpen,
  onOpenFolder,
  onProjectSelect,
  onSearchActivity,
  onThemeSelect,
  projectName,
  projects,
  projectsOpen,
  searchInputRef,
  searchQuery,
  setMenuOpen,
  setProjectsOpen,
  setSearchQuery,
  setThemeOpen,
  t,
  theme,
  themeOpen,
  menuItems,
}) {
  const searchDebounceRef = useRef(null);
  const noDrag = { WebkitAppRegion: 'no-drag' };

  const debouncedSearch = useCallback((value) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      onSearchActivity();
      doSearch(value);
    }, 300);
  }, [doSearch, onSearchActivity]);

  useEffect(() => {
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, []);

  const isGlass = theme === 'glass';

  return (
    <div
      style={{
        display: "flex", alignItems: "center", height: 36,
        background: t.activityBar,
        backdropFilter:       isGlass ? 'blur(22px) saturate(1.7)' : undefined,
        WebkitBackdropFilter: isGlass ? 'blur(22px) saturate(1.7)' : undefined,
        borderBottom: `0.5px solid ${t.border}`,
        boxShadow: isGlass ? 'inset 0 -1px 0 rgba(167,139,250,0.15), 0 2px 16px rgba(0,0,0,0.30)' : undefined,
        flexShrink: 0, padding: "0 0 0 10px", gap: 0,
        position: 'relative', zIndex: 200, WebkitAppRegion: 'drag',
      }}
      onClick={() => { if (menuOpen) setMenuOpen(null); }}
    >
      <span style={{ fontSize: 17, marginRight: 6, lineHeight: 1, ...noDrag }}>🐙</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: t.accent, marginRight: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...noDrag }}>Octopus AI</span>
      <div style={{ width: 1, height: 16, background: t.border, marginRight: 8, flexShrink: 0, ...noDrag }} />

      {menuItems.map(menu => (
        <div key={menu.id} style={{ position: 'relative', ...noDrag }}>
          <button
            type="button"
            style={{ background: menuOpen === menu.id ? t.border : 'transparent', border: 'none', color: menuOpen === menu.id ? t.text : t.textMuted, padding: '3px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 4, height: 24, ...noDrag }}
            onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === menu.id ? null : menu.id); }}
            onMouseEnter={e => { if (menuOpen && menuOpen !== menu.id) { setMenuOpen(menu.id); } e.currentTarget.style.color = t.text; }}
            onMouseLeave={e => { if (menuOpen !== menu.id) e.currentTarget.style.color = t.textMuted; }}
          >
            {menu.label}
          </button>
          {menuOpen === menu.id && (
            <div
              style={{ position: 'absolute', top: '100%', left: 0, marginTop: 2, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '4px 0', zIndex: 999, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
              onClick={e => e.stopPropagation()}
            >
              {menu.items.map((item, i) =>
                item.separator
                  ? <div key={`separator-${menu.id}-${i}`} style={{ height: 1, background: t.border, margin: '4px 8px' }} />
                  : (
                    <div key={`${menu.id}-${item.label}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', cursor: item.disabled ? 'default' : 'pointer', borderRadius: 0, opacity: item.disabled ? 0.45 : 1 }}
                      onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = t.accent + '22'; }}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { if (item.disabled) return; item.action(); setMenuOpen(null); }}
                    >
                      <i className={`codicon ${item.icon}`} style={{ color: t.accent, fontSize: 14, flexShrink: 0, width: 16 }} />
                      <span style={{ fontSize: 12, color: t.text, flex: 1 }}>{item.label}</span>
                      {item.shortcut && <span style={{ fontSize: 10, color: t.textMuted, fontFamily: 'monospace' }}>{item.shortcut}</span>}
                    </div>
                  )
              )}
            </div>
          )}
        </div>
      ))}

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 16px', minWidth: 120 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '3px 10px', width: '100%', maxWidth: 380, cursor: 'text', ...noDrag }}
          onClick={onSearchActivity}
          onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.boxShadow = `0 0 0 1px ${t.accent}44`; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <i className="codicon codicon-search" style={{ color: t.textMuted, fontSize: 13, flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            aria-label="Search files and commands"
            autoComplete="off"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: t.text, fontSize: 12, fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
            placeholder="Search files, commands..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              if (e.target.value) {
                debouncedSearch(e.target.value);
              }
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                onSearchActivity();
                doSearch(searchQuery);
              }
              if (e.key === 'Escape') e.target.blur();
            }}
            onClick={e => e.stopPropagation()}
          />
          <kbd style={{ fontSize: 10, color: t.textMuted, background: t.border + '88', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', flexShrink: 0 }}>Ctrl+P</kbd>
        </div>
      </div>

      <div style={{ width: 1, height: 16, background: t.border, marginRight: 10, flexShrink: 0, ...noDrag }} />

      <div style={{ position: 'relative', ...noDrag }}>
        <span
          style={{ fontSize: 11, color: t.textMuted, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={e => { e.stopPropagation(); setProjectsOpen(open => !open); setMenuOpen(null); }}
          onMouseEnter={e => e.currentTarget.style.background = t.border}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <i className="codicon codicon-folder" style={{ fontSize: 12, color: t.accent }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{projectName}</span>
          <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
        </span>
        {projectsOpen && (
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: 4, zIndex: 300, minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 10, color: t.textMuted, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Projects</p>
            {projects.map((project) => (
              <div key={project.path || project.name}
                onClick={() => { onProjectSelect(project); setProjectsOpen(false); }}
                style={{ padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: project.path === currentDir ? t.accent : t.text, background: project.path === currentDir ? t.accent + '22' : 'transparent', display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = t.border}
                onMouseLeave={e => e.currentTarget.style.background = project.path === currentDir ? t.accent + '22' : 'transparent'}
              >
                <i className="codicon codicon-folder" style={{ color: t.accent, fontSize: 13 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 12, color: project.path === currentDir ? t.accent : t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</p>
                  <p dir="auto" title={project.path} style={{ margin: 0, fontSize: 10, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.path}</p>
                </div>
              </div>
            ))}
            {projects.length === 0 && <p style={{ fontSize: 11, color: t.textMuted, padding: '6px 10px' }}>No recent projects</p>}
            <div style={{ borderTop: `0.5px solid ${t.border}`, marginTop: 4, paddingTop: 4 }}>
              <div onClick={() => { onOpenFolder(); setProjectsOpen(false); }}
                style={{ padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: t.accent, display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = t.border}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <i className="codicon codicon-folder-opened" style={{ fontSize: 13 }} />
                Open New Folder
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 5, alignItems: "center", padding: '0 10px', borderLeft: `0.5px solid ${t.border}`, borderRight: `0.5px solid ${t.border}`, ...noDrag }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: loading ? "#f0883e" : "#3fb950", flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loading ? "Working..." : "Ready"}</span>
      </div>

      <div style={{ position: 'relative', ...noDrag }}>
        <button
          type="button"
          style={{ background: 'transparent', border: 'none', borderRadius: 5, color: t.textMuted, padding: "0 10px", fontSize: 11, cursor: "pointer", display: 'flex', alignItems: 'center', gap: 5, height: 36, ...noDrag }}
          onClick={e => { e.stopPropagation(); setThemeOpen(open => !open); setMenuOpen(null); }}
          onMouseEnter={e => e.currentTarget.style.background = t.border}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.accent }} />
          {t.name}
        </button>
        {themeOpen && (
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: 4, zIndex: 300, minWidth: 130, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            {Object.entries(THEMES).map(([key, themeConfig]) => (
              <div key={key} onClick={() => onThemeSelect(key)}
                style={{ padding: '5px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: key === theme ? t.accent : t.text, background: key === theme ? t.accent + '22' : 'transparent', display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = t.border}
                onMouseLeave={e => e.currentTarget.style.background = key === theme ? t.accent + '22' : 'transparent'}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: themeConfig.accent }} />
                {themeConfig.name}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', marginLeft: 4, ...noDrag }}>
        <WindowControlButton action="minimize" icon="codicon-chrome-minimize" title="Minimize" t={t} />
        <WindowControlButton action="maximize" icon="codicon-chrome-maximize" title="Maximize" t={t} />
        <WindowControlButton action="close" icon="codicon-chrome-close" title="Close" t={t} danger />
      </div>
    </div>
  );
}
