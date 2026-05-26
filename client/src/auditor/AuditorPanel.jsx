
import { useState } from 'react';

const SEVERITY_CONFIG = {
  critical: { icon: '🔴', color: '#ff7b72', bg: '#ff7b7211', label: 'Critical' },
  major:    { icon: '🟠', color: '#f0883e', bg: '#f0883e11', label: 'Major' },
  minor:    { icon: '🟡', color: '#e3b341', bg: '#e3b34111', label: 'Minor' },
  info:     { icon: '🔵', color: '#58a6ff', bg: '#58a6ff11', label: 'Info' },
};

export function AuditorPanel({ auditResults, onRun, t }) {
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const violated = auditResults.filter(r => r.violated);
  const passed = auditResults.filter(r => !r.violated);

  const filtered = filter === 'all'
    ? violated
    : violated.filter(r => r.severity === filter);

  const criticalCount = violated.filter(r => r.severity === 'critical').length;
  const majorCount = violated.filter(r => r.severity === 'major').length;
  const minorCount = violated.filter(r => r.severity === 'minor').length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Audit
        </span>
        <div style={{ flex: 1 }} />
        {violated.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
            background: criticalCount > 0 ? '#ff7b7233' : majorCount > 0 ? '#f0883e33' : '#e3b34133',
            color: criticalCount > 0 ? '#ff7b72' : majorCount > 0 ? '#f0883e' : '#e3b341',
          }}>
            {violated.length} issue{violated.length !== 1 ? 's' : ''}
          </span>
        )}
        <button
          onClick={() => window.open('/dev-hud.html', 'octopus-dev-hud', 'width=980,height=720')}
          style={{ background: 'transparent', border: `0.5px solid ${t.border}`, borderRadius: 4, color: t.textMuted, padding: '3px 8px', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          title="Open Dev HUD"
        >
          <i className="codicon codicon-open-preview" style={{ fontSize: 10 }} /> HUD
        </button>
        <button
          onClick={onRun}
          style={{ background: t.border, border: 'none', borderRadius: 4, color: t.text, padding: '3px 8px', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <i className="codicon codicon-refresh" style={{ fontSize: 10 }} /> Re-scan
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ padding: '4px 8px', display: 'flex', gap: 4, borderBottom: `0.5px solid ${t.border}` }}>
        {[
          { key: 'all', label: 'All', count: violated.length },
          { key: 'critical', label: 'Critical', count: criticalCount },
          { key: 'major', label: 'Major', count: majorCount },
          { key: 'minor', label: 'Minor', count: minorCount },
        ].map(f => (
          <button key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              background: filter === f.key ? t.border : 'transparent',
              border: 'none', borderRadius: 4, padding: '2px 8px',
              fontSize: 10, cursor: 'pointer', color: filter === f.key ? t.text : t.textMuted,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {f.label} {f.count > 0 && <span style={{ opacity: 0.6 }}>({f.count})</span>}
          </button>
        ))}
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {violated.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <p style={{ fontSize: 12, color: t.text, margin: 0 }}>All checks passed</p>
            <p style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>{passed.length} rules checked</p>
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 11, color: t.textMuted, padding: 12 }}>No issues with severity "{filter}"</p>
        ) : (
          filtered.map(result => {
            const config = SEVERITY_CONFIG[result.severity] || SEVERITY_CONFIG.info;
            const isExpanded = expandedId === result.id;
            return (
              <div key={result.id}
                style={{
                  background: config.bg, border: `0.5px solid ${config.color}33`,
                  borderRadius: 6, marginBottom: 6, overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : result.id)}
                  style={{ padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <span style={{ fontSize: 10 }}>{config.icon}</span>
                  <span style={{ fontSize: 11, color: config.color, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {result.id.replace(/_/g, ' ')}
                  </span>
                  <i className={`codicon ${isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} style={{ fontSize: 10, color: t.textMuted }} />
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 10px 10px', borderTop: `0.5px solid ${config.color}22` }}>
                    <p style={{ fontSize: 10, color: t.text, margin: '6px 0 4px', lineHeight: 1.5 }}>
                      {result.message}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 6 }}>
                      <i className="codicon codicon-lightbulb" style={{ fontSize: 10, color: '#e3b341', flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 10, color: t.textMuted, wordBreak: 'break-word', overflow: 'hidden' }}>{result.fix}</span>
                    </div>
                    <span style={{ fontSize: 9, color: t.textMuted, marginTop: 4, display: 'block' }}>
                      {result.category} • {result.description}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Stats */}
      <div style={{ padding: '6px 12px', borderTop: `0.5px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: t.textMuted }}>
          {passed.length} passed • {violated.length} violated
        </span>
        <span style={{ fontSize: 9, color: t.textMuted }}>
          {auditResults.length} total rules
        </span>
      </div>
    </div>
  );
}
