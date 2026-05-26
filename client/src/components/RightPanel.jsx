import { useState } from 'react';
import { AuditorPanel } from '../auditor/AuditorPanel';
import { cleanChatText } from '../utils/diffUtils';
import { bidiIsolateStyle, bidiPlainTextStyle } from '../utils/bidiText';
import { getFileIcon } from '../utils/fileIcons';
import { getPromptEconomyProfile } from '../utils/octopusPromptContext';
import { getOpenFileId, isOpenFileActive } from '../utils/openFileIdentity';
import { RuntimeInspectorPanel } from './RuntimeInspectorPanel';
import { TimelinePanel } from './TimelinePanel';

const RIGHT_PANEL_ITEMS = [
  { id: 'chat',    icon: 'codicon-comment-discussion', title: 'Chat' },
  { id: 'legs',    icon: 'codicon-pulse',              title: 'Legs' },
  { id: 'timeline', icon: 'codicon-list-ordered',      title: 'Timeline' },
  { id: 'inspector', icon: 'codicon-debug-alt',         title: 'Runtime' },
  { id: 'context', icon: 'codicon-list-tree',          title: 'Context' },
  { id: 'history', icon: 'codicon-history',            title: 'History' },
  { id: 'audit',   icon: 'codicon-shield-check',       title: 'Audit' },
];

const CHAT_MODES = [
  { id: 'build', label: 'Build', icon: 'codicon-tools', placeholder: 'Describe what you want to build...' },
  { id: 'fix', label: 'Fix', icon: 'codicon-bug', placeholder: 'Paste the error or describe what is broken...' },
  { id: 'explain', label: 'Explain', icon: 'codicon-book', placeholder: 'Ask Octopus to explain code, files, or behavior...' },
  { id: 'refactor', label: 'Refactor', icon: 'codicon-symbol-method', placeholder: 'Describe the refactor you want...' },
  { id: 'test', label: 'Test', icon: 'codicon-beaker', placeholder: 'Ask for tests, checks, or verification...' },
  { id: 'inquiry', label: 'Inquiry', icon: 'codicon-comment-unresolved', placeholder: 'Bring an idea, dilemma, or design question for Socratic inquiry...' },
];

function getChatMessageMeta(message) {
  if (message.role !== 'octopus') {
    return { icon: 'codicon-account', label: 'Command', color: '#7f9aa3' };
  }

  const text = String(message.text || '').toLowerCase();
  if (text.includes('error') || text.includes('failed') || text.includes('خطأ')) return { icon: 'codicon-error', label: 'Error', color: '#ff7b72' };
  if (/<terminal>|```(?:bash|sh|powershell|shell)|\b(npm|node|php|composer|git)\s+/i.test(text)) return { icon: 'codicon-terminal', label: 'Terminal', color: '#f0883e' };
  if (text.includes('plan') || text.includes('approve') || text.includes('خطة')) return { icon: 'codicon-checklist', label: 'Plan', color: '#58a6ff' };
  if (text.includes('saved') || text.includes('modified') || text.includes('file') || text.includes('diff')) return { icon: 'codicon-file-code', label: 'Change', color: '#3fb950' };
  if (text.includes('?')) return { icon: 'codicon-question', label: 'Question', color: '#d2a8ff' };
  return { icon: 'codicon-sparkle', label: 'Reply', color: '#2aa198' };
}

function composeChatCommand(text, mode) {
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (mode === 'inquiry') {
    return `[Mode: Inquiry]
Act as a senior software engineer and philosophical Socratic partner.
Ask clarifying questions when the request is ambiguous.
Challenge assumptions respectfully.
Separate technical facts from product/design judgment.
Do not rush to implementation unless I clearly ask you to execute.
Help me think through tradeoffs, meaning, user impact, and engineering constraints.

My idea/question:
${trimmed}`;
  }

  if (mode === 'fix') return `[Mode: Fix]\nDiagnose the issue first, then propose the smallest safe fix.\n\n${trimmed}`;
  if (mode === 'explain') return `[Mode: Explain]\nExplain clearly, with engineering judgment and examples when useful.\n\n${trimmed}`;
  if (mode === 'refactor') return `[Mode: Refactor]\nPreserve behavior, reduce complexity, and explain the tradeoffs.\n\n${trimmed}`;
  if (mode === 'test') return `[Mode: Test]\nFocus on verification, edge cases, and regression risk.\n\n${trimmed}`;
  return trimmed;
}

function getPanelIcon(tab) {
  if (tab === 'chat') return 'codicon-comment-discussion';
  if (tab === 'legs') return 'codicon-pulse';
  if (tab === 'timeline') return 'codicon-list-ordered';
  if (tab === 'inspector') return 'codicon-debug-alt';
  if (tab === 'context') return 'codicon-list-tree';
  if (tab === 'audit') return 'codicon-shield-check';
  return 'codicon-history';
}

function getPanelTitle(tab) {
  if (tab === 'chat') return 'CHAT';
  if (tab === 'legs') return 'EIGHT LEGS';
  if (tab === 'timeline') return 'LIVE TIMELINE';
  if (tab === 'inspector') return 'RUNTIME';
  if (tab === 'context') return 'CONTEXT';
  if (tab === 'audit') return 'AUDIT';
  return 'HISTORY';
}

function getMessageKey(message) {
  return message.id || `${message.role}:${message.at || ''}:${message.text?.slice(0, 80) || ''}`;
}

export function RightPanel({
  activeFile,
  awaitingConfirm,
  bottomRef,
  cancelPlan,
  currentDir,
  displayFilePath,
  executeApprovedPlan,
  files,
  input,
  legs,
  loading,
  messages,
  onResizeStart,
  onTimelineClear,
  projectName,
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
  send,
  selectedRuntimeTask,
  setActiveFile,
  setInput,
  setSelectedRuntimeTask,
  setRightPanelOpen,
  setRightPanelTab,
  t,
  timelineEvents,
  auditResults,
  onAuditRun,
  onRuntimeRefresh,
}) {
  const [chatMode, setChatMode] = useState('build');
  const legColor = (status) => status === "done" ? "#3fb950" : status === "working" ? "#f0883e" : t.textMuted;
  const openFiles = files.filter(file => file.content);
  const userMessages = messages.filter(message => message.role === 'user');
  const activeMode = CHAT_MODES.find(mode => mode.id === chatMode) || CHAT_MODES[0];
  const economyProfile = getPromptEconomyProfile(input);
  const economyColor = economyProfile.id === 'local'
    ? '#3fb950'
    : economyProfile.id === 'light'
      ? t.accent
      : economyProfile.id === 'project'
        ? '#f0883e'
        : t.textMuted;
  const sendChatMessage = () => {
    const command = composeChatCommand(input, chatMode);
    if (command) send(command);
  };
  const handleChatKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendChatMessage();
    }
  };

  return (
    <div style={{ display: "flex", flexShrink: 0 }}>
      <div style={{ width: 40, background: t.activityBar, borderRight: `0.5px solid ${t.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 6, gap: 2, flexShrink: 0, order: 2 }}>
        {RIGHT_PANEL_ITEMS.map(item => (
          <button key={item.id} title={item.title}
            style={{ width: 32, height: 32, background: rightPanelTab === item.id ? t.border : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: rightPanelTab === item.id ? `2px solid ${t.accent}` : '2px solid transparent', position: 'relative' }}
            onClick={() => {
              if (rightPanelTab === item.id) setRightPanelOpen(open => !open);
              else { setRightPanelTab(item.id); setRightPanelOpen(true); }
            }}
            onMouseEnter={e => { if (rightPanelTab !== item.id) e.currentTarget.style.background = t.border + '66' }}
            onMouseLeave={e => { if (rightPanelTab !== item.id) e.currentTarget.style.background = 'transparent' }}
          >
            <i className={`codicon ${item.icon}`} style={{ color: rightPanelTab === item.id ? t.accent : t.textMuted, fontSize: 16 }} />
            {item.id === 'chat' && loading && (
              <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: '#f0883e' }} />
            )}
            {item.id === 'legs' && legs.some(leg => leg.status === 'working') && (
              <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: '#f0883e' }} />
            )}
            {item.id === 'timeline' && timelineEvents.length > 0 && (
              <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: '#58a6ff' }} />
            )}
            {item.id === 'inspector' && runtimeTasks.length > 0 && (
              <div style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: '#f778ba' }} />
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button title="Open Dev HUD"
          style={{ width: 32, height: 32, background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => window.open('/dev-hud.html', 'octopus-dev-hud', 'width=980,height=720')}
          onMouseEnter={e => e.currentTarget.style.background = t.border + '66'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <i className="codicon codicon-open-preview" style={{ color: t.textMuted, fontSize: 16 }} />
        </button>
        <button title="Clear Chat"
          style={{ width: 32, height: 32, background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}
          onClick={reset}
          onMouseEnter={e => e.currentTarget.style.background = t.border + '66'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <i className="codicon codicon-clear-all" style={{ color: t.textMuted, fontSize: 16 }} />
        </button>
      </div>

      {rightPanelOpen && <div style={{ width: rightPanelWidth, background: t.sidebar, borderRight: `0.5px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0, order: 1, position: 'relative' }}>
        <div
          style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', background: 'transparent', zIndex: 4 }}
          onMouseDown={onResizeStart}
          onMouseEnter={e => e.currentTarget.style.background = t.accent}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title="Resize panel"
        />
        <div style={{ padding: "8px 12px", borderBottom: `0.5px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className={`codicon ${getPanelIcon(rightPanelTab)}`} style={{ color: t.accent, fontSize: 13 }} />
          <span style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            {getPanelTitle(rightPanelTab)}
          </span>
        </div>

        {rightPanelTab === 'legs' && (
          <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 5, overflowY: "auto" }}>
            {legs.map(leg => (
              <div key={leg.id} style={{ background: t.bg, border: `0.5px solid ${leg.status === "done" ? "#238636" : leg.status === "working" ? "#9e6a03" : t.border}`, borderRadius: 6, padding: "7px 10px", opacity: leg.status === "idle" ? 0.4 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: legColor(leg.status), flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: legColor(leg.status), fontWeight: 500 }}>{leg.name}</span>
                  <span style={{ marginRight: 'auto', fontSize: 10, color: t.textMuted }}>{leg.progress}%</span>
                </div>
                <p dir="auto" style={bidiPlainTextStyle({ fontSize: 10, color: t.textMuted, margin: "0 0 4px" })}>{leg.task}</p>
                <div style={{ background: t.border, borderRadius: 3, height: 2 }}>
                  <div style={{ background: leg.status === "done" ? "#3fb950" : "#f0883e", width: `${leg.progress}%`, height: "100%", borderRadius: 3, transition: "width 0.2s ease" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {rightPanelTab === 'timeline' && (
          <TimelinePanel events={timelineEvents} onClear={onTimelineClear} t={t} />
        )}

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
            replay={runtimeReplay}
            tree={runtimeTree}
            t={t}
            workers={runtimeWorkers}
          />
        )}

        {rightPanelTab === 'chat' && (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              {messages.map((message) => {
                const meta = getChatMessageMeta(message);
                const displayText = message.role === 'octopus' ? cleanChatText(message.text) : message.text;
                return (
                <div key={getMessageKey(message)} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: message.role === 'octopus' ? meta.color + '22' : t.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                      {message.role === 'octopus' ? '🐙' : <i className="codicon codicon-account" style={{ fontSize: 11 }} />}
                    </div>
                    <span style={{ fontSize: 10, color: message.role === "octopus" ? t.accent : t.textMuted, fontWeight: 500 }}>
                      {message.role === "octopus" ? "Octopus" : "You"}
                    </span>
                    <span style={{ marginLeft: 4, border: `0.5px solid ${meta.color}55`, color: meta.color, background: meta.color + '12', borderRadius: 999, padding: '1px 6px', fontSize: 9, fontWeight: 650 }}>
                      <i className={`codicon ${meta.icon}`} style={{ fontSize: 9, marginRight: 4 }} />
                      {meta.label}
                    </span>
                  </div>
                  <div style={{ marginRight: 23, background: message.role === 'octopus' ? t.bg : t.accent + '11', borderRadius: '0 8px 8px 8px', padding: '6px 10px', border: `0.5px solid ${message.role === 'octopus' ? meta.color + '44' : t.border}`, overflow: 'hidden', minWidth: 0 }}>
                    <p dir="auto" style={bidiPlainTextStyle({ fontSize: 11, color: t.text, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" })}>
                      {displayText}
                    </p>
                    {message.role === 'octopus' && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                        <button
                          onClick={() => navigator.clipboard?.writeText(displayText)}
                          style={{ background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 5, color: t.textMuted, cursor: 'pointer', fontSize: 10, padding: '3px 7px' }}
                        >
                          <i className="codicon codicon-copy" style={{ fontSize: 10, marginRight: 4 }} /> Copy
                        </button>
                        <button
                          onClick={() => setInput(`Explain this response in simpler terms:\n\n${displayText.slice(0, 700)}`)}
                          style={{ background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 5, color: t.textMuted, cursor: 'pointer', fontSize: 10, padding: '3px 7px' }}
                        >
                          <i className="codicon codicon-lightbulb" style={{ fontSize: 10, marginRight: 4 }} /> Explain
                        </button>
                        <button
                          onClick={() => window.open('/dev-hud.html', 'octopus-dev-hud', 'width=980,height=720')}
                          style={{ background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 5, color: t.textMuted, cursor: 'pointer', fontSize: 10, padding: '3px 7px' }}
                        >
                          <i className="codicon codicon-open-preview" style={{ fontSize: 10, marginRight: 4 }} /> HUD
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )})}
              {awaitingConfirm && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, paddingRight: 23 }}>
                  <button style={{ background: '#238636', border: 'none', borderRadius: 6, color: '#fff', padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }} onClick={executeApprovedPlan}>
                    ✅ Approve — Execute
                  </button>
                  <button style={{ background: t.border, border: 'none', borderRadius: 6, color: t.text, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }} onClick={cancelPlan}>
                    ❌ Cancel
                  </button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div style={{ padding: "8px 10px", borderTop: `0.5px solid ${t.border}`, background: t.bg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7, overflowX: 'auto' }}>
                {CHAT_MODES.map(mode => (
                  <button
                    key={mode.id}
                    title={mode.label}
                    onClick={() => setChatMode(mode.id)}
                    style={{
                      width: 26,
                      height: 24,
                      borderRadius: 5,
                      border: `0.5px solid ${chatMode === mode.id ? economyColor : t.border}`,
                      background: chatMode === mode.id ? economyColor + '18' : 'transparent',
                      color: chatMode === mode.id ? economyColor : t.textMuted,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <i className={`codicon ${mode.icon}`} style={{ fontSize: 12 }} />
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: economyColor, fontSize: 10, whiteSpace: 'nowrap' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: economyColor, boxShadow: `0 0 8px ${economyColor}` }} />
                  {economyProfile.label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, background: t.sidebar, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '6px 8px' }}>
                <textarea
                  aria-label="Command input"
                  style={{ flex: 1, background: 'transparent', color: t.text, border: 'none', outline: 'none', fontSize: 12, resize: 'none', fontFamily: "'Inter', 'Segoe UI', sans-serif", lineHeight: 1.5 }}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder={activeMode.placeholder}
                  rows={2}
                  dir="auto"
                />
                <button
                  style={{ background: loading ? t.border : t.accent, border: 'none', borderRadius: 6, color: '#fff', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  onClick={sendChatMessage} disabled={loading}
                >
                  <i className={`codicon ${loading ? 'codicon-loading' : 'codicon-send'}`} style={{ fontSize: 14 }} />
                </button>
              </div>
            </div>
          </>
        )}

        {rightPanelTab === 'context' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            <p style={{ fontSize: 11, color: t.textMuted, marginBottom: 10 }}>Open files in context</p>
            {openFiles.length === 0
              ? <p style={{ fontSize: 11, color: t.textMuted, opacity: 0.5 }}>No open files</p>
              : openFiles.slice(0, 5).map((file) => {
                  const { icon, color } = getFileIcon(file.name);
                  return (
                    <div key={file.path || file.name} title={displayFilePath(file)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, marginBottom: 4, background: isOpenFileActive(file, activeFile) ? t.accent + '11' : t.bg, border: `0.5px solid ${t.border}`, cursor: 'pointer' }}
                      onClick={() => setActiveFile(getOpenFileId(file))}>
                      <i className={`codicon ${icon}`} style={{ color, fontSize: 13 }} />
                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <p dir="auto" style={bidiIsolateStyle({ fontSize: 11, color: t.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{displayFilePath(file)}</p>
                        <p style={{ fontSize: 10, color: t.textMuted, margin: 0 }}>{file.content?.split('\n').length || 0} lines</p>
                      </div>
                      {isOpenFileActive(file, activeFile) && <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent, flexShrink: 0 }} />}
                    </div>
                  );
                })
            }
            {openFiles.length > 5 && (
              <p style={{ fontSize: 10, color: t.textMuted, marginTop: 6 }}>+ {openFiles.length - 5} more files</p>
            )}
            <div style={{ marginTop: 16, padding: '10px 12px', background: t.bg, borderRadius: 8, border: `0.5px solid ${t.border}` }}>
              <p style={{ fontSize: 10, color: t.textMuted, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Project</p>
              <p style={{ fontSize: 12, color: t.text, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="codicon codicon-folder" style={{ color: t.accent, fontSize: 13 }} />
                {projectName}
              </p>
              {currentDir && <p dir="auto" style={bidiIsolateStyle({ fontSize: 10, color: t.textMuted, margin: '4px 0 0', wordBreak: 'break-all' })}>{currentDir}</p>}
            </div>
          </div>
        )}

        {rightPanelTab === 'audit' && (
          <AuditorPanel auditResults={auditResults || []} onRun={onAuditRun} t={t} />
        )}

        {rightPanelTab === 'history' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            <p style={{ fontSize: 11, color: t.textMuted, marginBottom: 10 }}>Command history</p>
            {userMessages.length === 0
              ? <p style={{ fontSize: 11, color: t.textMuted, opacity: 0.5 }}>No previous commands</p>
              : userMessages.map((message) => (
                <div key={getMessageKey(message)} style={{ padding: '7px 10px', borderRadius: 6, marginBottom: 4, background: t.bg, border: `0.5px solid ${t.border}`, cursor: 'pointer' }}
                  onClick={() => { setInput(message.text); setRightPanelTab('chat'); }}
                  onMouseEnter={e => e.currentTarget.style.background = t.border + '44'}
                  onMouseLeave={e => e.currentTarget.style.background = t.bg}
                >
                  <p dir="auto" style={bidiIsolateStyle({ fontSize: 11, color: t.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{message.text}</p>
                </div>
              ))
            }
          </div>
        )}
      </div>}
    </div>
  );
}
