import { useMemo, useState } from 'react';
import {
  EVENT_CATEGORY_COLORS,
  EVENT_SEVERITY_COLORS,
  formatDuration,
  formatEventTime,
  getEventDurationMs,
  getEventFilePath,
} from '../../utils/eventTimeline';

const CATEGORY_OPTIONS = ['all', 'system', 'session', 'task', 'file', 'terminal', 'process', 'octopus', 'workflow', 'validation'];
const SEVERITY_OPTIONS = ['all', 'critical', 'error', 'warning', 'info', 'debug'];

function SelectFilter({ label, value, onChange, options, t }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 9, color: t.textMuted, textTransform: 'uppercase' }}>{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        style={{ height: 24, background: t.bg, color: t.text, border: `0.5px solid ${t.border}`, borderRadius: 6, fontSize: 11, outline: 'none' }}
      >
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function TimelinePanel({ events, onClear, t }) {
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const filteredEvents = useMemo(() => events.filter(event => {
    if (category !== 'all' && event.category !== category) return false;
    if (severity !== 'all' && event.severity !== severity) return false;
    return true;
  }), [category, events, severity]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: 10, borderBottom: `0.5px solid ${t.border}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <SelectFilter label="Category" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} t={t} />
        <SelectFilter label="Severity" value={severity} onChange={setSeverity} options={SEVERITY_OPTIONS} t={t} />
        <button
          title="Clear timeline"
          onClick={onClear}
          style={{ width: 26, height: 24, border: `0.5px solid ${t.border}`, borderRadius: 6, background: t.bg, color: t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <i className="codicon codicon-clear-all" style={{ fontSize: 13 }} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {filteredEvents.length === 0 ? (
          <p style={{ fontSize: 11, color: t.textMuted, opacity: 0.7 }}>No timeline events</p>
        ) : filteredEvents.map(event => {
          const isExpanded = expandedId === event.id;
          const categoryColor = EVENT_CATEGORY_COLORS[event.category] || t.textMuted;
          const severityColor = EVENT_SEVERITY_COLORS[event.severity] || t.textMuted;
          const filePath = getEventFilePath(event);
          const duration = formatDuration(getEventDurationMs(event, events));

          return (
            <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 8, marginBottom: 8 }}>
              <span style={{ color: t.textMuted, fontSize: 10, paddingTop: 7, fontVariantNumeric: 'tabular-nums' }}>
                {formatEventTime(event.timestamp)}
              </span>
              <button
                onClick={() => setExpandedId(isExpanded ? null : event.id)}
                style={{ textAlign: 'left', width: '100%', background: t.bg, color: t.text, border: `0.5px solid ${t.border}`, borderLeft: `3px solid ${categoryColor}`, borderRadius: 6, padding: '7px 9px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: severityColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.type}
                  </span>
                  {duration && <span style={{ marginLeft: 'auto', color: t.textMuted, fontSize: 10, flexShrink: 0 }}>{duration}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, color: t.textMuted, fontSize: 10, minWidth: 0 }}>
                  <span style={{ color: categoryColor, flexShrink: 0 }}>{event.category}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.source}</span>
                  {event.sessionId && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{event.sessionId}</span>}
                </div>
                {filePath && (
                  <div style={{ marginTop: 5, color: t.textMuted, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <i className="codicon codicon-file" style={{ fontSize: 11, marginRight: 4 }} />
                    {filePath}
                  </div>
                )}
                {isExpanded && (
                  <pre style={{ marginTop: 7, padding: 7, borderRadius: 6, background: t.sidebar, border: `0.5px solid ${t.border}`, color: t.textMuted, fontSize: 10, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflow: 'auto' }}>
                    {JSON.stringify({ payload: event.payload, metadata: event.metadata, taskId: event.taskId, traceId: event.traceId }, null, 2)}
                  </pre>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
