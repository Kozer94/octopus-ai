// RightPanel.jsx — اللوحة اليمنى مع التبديل بين Legs / Timeline / Runtime / ...

import { AuditorPanel }          from '../auditor/AuditorPanel';
import { bidiIsolateStyle, bidiPlainTextStyle } from '../../utils/bidiText';
import { getFileIcon }           from '../../utils/fileIcons';
import { getOpenFileId, isOpenFileActive } from '../../utils/openFileIdentity';
import { RuntimeInspectorPanel } from '../auditor/RuntimeInspectorPanel';
import { TimelinePanel }         from '../auditor/TimelinePanel';

const RIGHT_PANEL_ITEMS = [
  { id: 'legs',      icon: 'codicon-pulse',              title: 'Legs'     },
  { id: 'timeline',  icon: 'codicon-list-ordered',       title: 'Timeline' },
  { id: 'inspector', icon: 'codicon-debug-alt',          title: 'Runtime'  },
  { id: 'context',   icon: 'codicon-list-tree',          title: 'Context'  },
  { id: 'history',   icon: 'codicon-history',            title: 'History'  },
  { id: 'audit',     icon: 'codicon-shield-check',       title: 'Audit'    },
];

function getMessageKey(message) {
  return message.id || `${message.role}:${message.at || ''}:${message.text?.slice(0, 80) || ''}`;
}

export function RightPanel({
  activeFile,
  displayFilePath,
  files,
  legs,
  messages,
  onOpenChat,
  onResizeStart,
  onTimelineClear,
  reset,
  rightPanelOpen,
  rightPanelTab,
  rightPanelWidth,
  runtimeGraph,
  runtimeMetrics,
  runtimeControlPlane,
  runtimeReplay,
  runtimeTasks,
  runtimeTrace,
  runtimeTree,
  runtimeWorkers,
  selectedRuntimeTask,
  selectedTraceId,
  setActiveFile,
  setInput,
  setSelectedRuntimeTask,
  setRightPanelOpen,
  setRightPanelTab,
  t,
  timelineEvents,
  traceSpans,
  auditResults,
  onAuditRun,
  onRuntimeRefresh,
}) {
  const openFiles    = files.filter(f => f.content);
  const userMessages = messages.filter(m => m.role === 'user');

  return (
    <div style={{ display: 'flex', flexShrink: 0 }}>

      {/* ─── شريط الأيقونات الجانبي ──────────────────────────────────── */}
      <div style={{
        width: 40,
        background: t.activityBar,
        borderRight: `0.5px solid ${t.border}`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', paddingTop: 6, gap: 2,
        flexShrink: 0, order: 2,
      }}>
        {RIGHT_PANEL_ITEMS.map(item => (
          <button
            key={item.id}
            title={item.title}
            style={{
              width: 32, height: 32,
              background:   rightPanelTab === item.id ? t.border : 'transparent',
              border:       'none',
              borderRadius: 6,
              cursor:       'pointer',
              display:      'flex', alignItems: 'center', justifyContent: 'center',
              borderLeft:   rightPanelTab === item.id ? `2px solid ${t.accent}` : '2px solid transparent',
              position:     'relative',
            }}
            onClick={() => {
              if (rightPanelTab === item.id) {
                setRightPanelOpen(o => !o);
              } else {
                setRightPanelTab(item.id);
                setRightPanelOpen(true);
              }
            }}
          >
            <i
              className={`codicon ${item.icon}`}
              style={{ color: rightPanelTab === item.id ? t.accent : t.textMuted, fontSize: 16 }}
            />
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <button
          title="Clear Chat"
          style={{ width: 32, height: 32, background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}
          onClick={reset}
        >
          <i className="codicon codicon-clear-all" style={{ color: t.textMuted, fontSize: 16 }} />
        </button>
      </div>

      {/* ─── محتوى اللوحة ────────────────────────────────────────────── */}
      {rightPanelOpen && (
        <div style={{
          width: rightPanelWidth,
          background: t.sidebar,
          borderRight: `0.5px solid ${t.border}`,
          display: 'flex', flexDirection: 'column',
          flexShrink: 0, order: 1, position: 'relative',
        }}>
          {/* مقبض تغيير الحجم */}
          <div
            style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 4 }}
            onMouseDown={onResizeStart}
          />

          {/* رأس اللوحة */}
          <div style={{ padding: '8px 12px', borderBottom: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i
              className={`codicon ${RIGHT_PANEL_ITEMS.find(i => i.id === rightPanelTab)?.icon || 'codicon-comment-discussion'}`}
              style={{ color: t.accent, fontSize: 13 }}
            />
            <span style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              {RIGHT_PANEL_ITEMS.find(i => i.id === rightPanelTab)?.title || 'CHAT'}
            </span>
          </div>

          {/* ─── Legs ─────────────────────────────────────────────────── */}
          {rightPanelTab === 'legs' && (
            <div style={{ flex: 1, padding: 8, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {legs.map(leg => (
                <div key={leg.id} style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '7px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: leg.status === 'done' ? '#3fb950' : leg.status === 'working' ? '#f0883e' : t.textMuted }} />
                    <span style={{ fontSize: 11, color: t.text, fontWeight: 500 }}>{leg.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: t.textMuted }}>{leg.progress}%</span>
                  </div>
                  <p dir="auto" style={bidiPlainTextStyle({ fontSize: 10, color: t.textMuted, margin: '0 0 4px' })}>{leg.task}</p>
                  <div style={{ background: t.border, borderRadius: 3, height: 2 }}>
                    <div style={{ background: leg.status === 'done' ? '#3fb950' : '#f0883e', width: `${leg.progress}%`, height: '100%', borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Timeline ─────────────────────────────────────────────── */}
          {rightPanelTab === 'timeline' && (
            <TimelinePanel events={timelineEvents} onClear={onTimelineClear} t={t} />
          )}

          {/* ─── Runtime Inspector ────────────────────────────────────── */}
          {rightPanelTab === 'inspector' && (
            <RuntimeInspectorPanel
              graph={runtimeGraph}
              metrics={runtimeMetrics}
              controlPlane={runtimeControlPlane}
              onRefresh={onRuntimeRefresh}
              onSelectTask={setSelectedRuntimeTask}
              selectedTask={selectedRuntimeTask}
              tasks={runtimeTasks}
              trace={runtimeTrace}
              traceId={selectedTraceId}
              traceSpans={traceSpans}
              replay={runtimeReplay}
              tree={runtimeTree}
              t={t}
              workers={runtimeWorkers}
            />
          )}

          {/* ─── Context ──────────────────────────────────────────────── */}
          {rightPanelTab === 'context' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              <p style={{ fontSize: 11, color: t.textMuted, marginBottom: 10 }}>Open files in context</p>
              {openFiles.length === 0
                ? <p style={{ fontSize: 11, color: t.textMuted, opacity: 0.5 }}>No open files</p>
                : openFiles.slice(0, 5).map(file => {
                    const { icon, color } = getFileIcon(file.name);
                    return (
                      <div
                        key={file.path || file.name}
                        onClick={() => setActiveFile(getOpenFileId(file))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 8px', borderRadius: 6, marginBottom: 4,
                          background: isOpenFileActive(file, activeFile) ? t.accent + '11' : t.bg,
                          border: `0.5px solid ${t.border}`, cursor: 'pointer',
                        }}
                      >
                        <i className={`codicon ${icon}`} style={{ color, fontSize: 13 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p dir="auto" style={bidiIsolateStyle({ fontSize: 11, color: t.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                            {displayFilePath(file)}
                          </p>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          )}

          {/* ─── Audit ────────────────────────────────────────────────── */}
          {rightPanelTab === 'audit' && (
            <AuditorPanel auditResults={auditResults || []} onRun={onAuditRun} t={t} />
          )}

          {/* ─── History ──────────────────────────────────────────────── */}
          {rightPanelTab === 'history' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {userMessages.length === 0
                ? <p style={{ fontSize: 11, color: t.textMuted, opacity: 0.5 }}>No previous commands</p>
                : userMessages.map(message => (
                  <div
                    key={getMessageKey(message)}
                    onClick={() => { setInput(message.text); onOpenChat?.(); }}
                    style={{ padding: '7px 10px', borderRadius: 6, marginBottom: 4, background: t.bg, border: `0.5px solid ${t.border}`, cursor: 'pointer' }}
                  >
                    <p dir="auto" style={bidiIsolateStyle({ fontSize: 11, color: t.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                      {message.text}
                    </p>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}
