// RuntimePermissionInspector.jsx
// يعرض هوية الجلسة الحالية + الصلاحيات الممنوحة والمحجوبة
// يُستخدم في تبويب Problems وفي لوحة الـ HUD

import { useEffect, useState, useCallback } from 'react';
import { BACKEND } from '../../config/uiConfig';

const CAT_LABELS = {
  terminal:  { label: 'Terminal',   icon: 'codicon-terminal' },
  ai:        { label: 'AI',         icon: 'codicon-sparkle' },
  file:      { label: 'Files',      icon: 'codicon-files' },
  package:   { label: 'Packages',   icon: 'codicon-package' },
  plugin:    { label: 'Plugins',    icon: 'codicon-extensions' },
  git:       { label: 'Git',        icon: 'codicon-source-control' },
  workspace: { label: 'Workspace',  icon: 'codicon-folder' },
  system:    { label: 'System',     icon: 'codicon-server' },
};

const ROLE_COLORS = {
  admin:          '#7ee787',
  developer:      '#58a6ff',
  viewer:         '#d29922',
  plugin:         '#bc8cff',
  local:          '#58a6ff',
  anonymous:      '#ff7b72',
  unknown:        '#9aa4ad',
};

function CapabilityBadge({ cap, granted, t }) {
  const [cat, name] = cap.split(':');
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 8px',
      background: granted ? t.sidebar : 'transparent',
      border: `0.5px solid ${granted ? t.border : 'transparent'}`,
      borderRadius: 5,
      opacity: granted ? 1 : 0.45,
    }}>
      <i
        className={`codicon ${granted ? 'codicon-check' : 'codicon-close'}`}
        style={{ color: granted ? '#7ee787' : '#ff7b72', fontSize: 11, flexShrink: 0 }}
      />
      <span style={{ fontSize: 11, color: granted ? t.text : t.textMuted, fontFamily: 'monospace' }}>
        {cat}:<strong>{name}</strong>
      </span>
    </div>
  );
}

export function RuntimePermissionInspector({ t }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [expandedCat, setExpandedCat] = useState(null);

  const fetchIdentity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('octopusApiToken') || '';
      const headers = token ? { 'X-Octopus-Token': token } : {};
      const res = await fetch(`${BACKEND}/api/runtime/identity`, { headers });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(fetchIdentity, 0);
    return () => clearTimeout(id);
  }, [fetchIdentity]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg }}>
        <i className="codicon codicon-loading codicon-modifier-spin" style={{ color: t.textMuted, fontSize: 18 }} />
        <span style={{ fontSize: 12, color: t.textMuted, marginLeft: 8 }}>Inspecting identity...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, padding: '16px 14px', background: t.bg }}>
        <div style={{ padding: '10px 12px', background: '#3d1117', border: '0.5px solid #da3633', borderRadius: 6 }}>
          <p style={{ fontSize: 12, color: '#ff7b72' }}>⛔ Cannot fetch identity: {error}</p>
          <p style={{ fontSize: 11, color: 'rgba(255,216,216,0.7)', marginTop: 6 }}>
            Server may not be running. Try: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: 3 }}>npm run dev</code>
          </p>
          <button
            onClick={fetchIdentity}
            style={{ marginTop: 8, padding: '5px 10px', fontSize: 11, background: '#21262d', border: '0.5px solid #30363d', color: '#e6edf3', borderRadius: 5, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { identity, capabilities, policies, nodeEnv } = data;
  const roleColor = ROLE_COLORS[identity?.role] || ROLE_COLORS.unknown;
  const grantedByCategory = capabilities?.grantedByCategory || {};
  const deniedByCategory  = capabilities?.deniedByCategory  || {};
  const allCategories = [...new Set([...Object.keys(grantedByCategory), ...Object.keys(deniedByCategory)])].sort();

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 20px', background: t.bg }}>
      {/* ─── Identity Header ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ fontSize: 10, color: t.accent, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Runtime Identity
        </p>
        <button
          title="Refresh"
          onClick={fetchIdentity}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textMuted, padding: 2 }}
        >
          <i className="codicon codicon-refresh" style={{ fontSize: 13 }} />
        </button>
      </div>

      {/* Identity Card */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10, padding: '10px 12px', background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 7, marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <i className="codicon codicon-person" style={{ color: roleColor, fontSize: 14 }} />
            <span style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>{identity?.name || 'Unknown'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, padding: '2px 7px', background: roleColor + '20', color: roleColor, borderRadius: 10, border: `0.5px solid ${roleColor}44` }}>
              {identity?.role?.toUpperCase() || 'UNKNOWN'}
            </span>
            <span style={{ fontSize: 10, padding: '2px 7px', background: t.border + '44', color: t.textMuted, borderRadius: 10 }}>
              {identity?.type}
            </span>
            <span style={{ fontSize: 10, padding: '2px 7px', background: t.border + '44', color: t.textMuted, borderRadius: 10 }}>
              {nodeEnv}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#7ee787' }}>{capabilities?.count?.granted || 0}</span>
          <span style={{ fontSize: 11, color: t.textMuted }}> / {capabilities?.count?.total || 0}</span>
          <p style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>capabilities</p>
        </div>
      </div>

      {/* ─── Capabilities by Category ──────────────────────────── */}
      <p style={{ fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.9px', marginBottom: 10 }}>
        Permissions
      </p>
      <div style={{ display: 'grid', gap: 6 }}>
        {allCategories.map(cat => {
          const catMeta = CAT_LABELS[cat] || { label: cat, icon: 'codicon-symbol-misc' };
          const grantedCaps = grantedByCategory[cat] || [];
          const deniedCaps  = deniedByCategory[cat]  || [];
          const isExpanded  = expandedCat === cat;

          return (
            <div key={cat} style={{ border: `0.5px solid ${t.border}`, borderRadius: 6, overflow: 'hidden' }}>
              {/* Category Header */}
              <button
                onClick={() => setExpandedCat(isExpanded ? null : cat)}
                style={{
                  width: '100%', display: 'grid', gridTemplateColumns: '20px 1fr auto auto',
                  alignItems: 'center', gap: 8, padding: '8px 10px',
                  background: t.sidebar, border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = t.border + '44'; }}
                onMouseLeave={e => { e.currentTarget.style.background = t.sidebar; }}
              >
                <i className={`codicon ${catMeta.icon}`} style={{ color: t.textMuted, fontSize: 13 }} />
                <span style={{ fontSize: 12, color: t.text }}>{catMeta.label}</span>
                <span style={{ fontSize: 11, color: '#7ee787' }}>✓ {grantedCaps.length}</span>
                {deniedCaps.length > 0 && (
                  <span style={{ fontSize: 11, color: '#ff7b72' }}>✗ {deniedCaps.length}</span>
                )}
              </button>

              {/* Expanded Capabilities */}
              {isExpanded && (
                <div style={{ padding: '6px 10px 10px', background: t.bg, borderTop: `0.5px solid ${t.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 4 }}>
                  {grantedCaps.map(cap => <CapabilityBadge key={cap} cap={cap} granted t={t} />)}
                  {deniedCaps.map(cap  => <CapabilityBadge key={cap} cap={cap} granted={false} t={t} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Active Policies ──────────────────────────────────── */}
      {policies && policies.length > 0 && (
        <>
          <p style={{ fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.9px', marginTop: 16, marginBottom: 10 }}>
            Active Policies ({policies.length})
          </p>
          <div style={{ display: 'grid', gap: 4 }}>
            {policies.map(p => (
              <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto', alignItems: 'center', gap: 8, padding: '6px 10px', background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.effect === 'deny' ? '#ff7b72' : '#7ee787', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: t.text, fontFamily: 'monospace' }}>{p.name}</span>
                <span style={{ fontSize: 10, color: t.textMuted }}>p:{p.priority}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
