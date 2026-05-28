// TerminalToolbar.jsx — شريط أدوات نافذة الـ Terminal
// مستخرج من TerminalPanel.jsx

const TERMINAL_TABS = [
  { id: 'terminal', label: 'Terminal', icon: 'codicon-terminal' },
  { id: 'chat',     label: 'Chat',     icon: 'codicon-comment-discussion' },
  { id: 'problems', label: 'Problems', icon: 'codicon-warning'  },
  { id: 'output',   label: 'Output',   icon: 'codicon-output'   },
];

/**
 * TerminalToolbar — التبويبات + مؤشر الحالة + أزرار الأدوات
 *
 * Props:
 *   connected     boolean  — حالة اتصال WebSocket
 *   isRunning     boolean  — هل العملية تعمل
 *   onClear       fn       — مسح الـ terminal
 *   onClose       fn       — إغلاق الـ terminal
 *   onInterrupt   fn       — إيقاف العملية (Ctrl+C)
 *   onTabChange   fn(id)   — تغيير التبويب
 *   reconnecting  boolean  — هل يعيد الاتصال
 *   t             object   — theme
 *   terminalTab   string   — التبويب النشط
 *   workflowError object   — خطأ في العمل
 */
export function TerminalToolbar({
  connected,
  isRunning,
  onClear,
  onClose,
  onInterrupt,
  onTabChange,
  reconnecting,
  t,
  terminalTab,
  workflowError,
}) {
  const statusDotColor = workflowError
    ? '#ff7b72'
    : reconnecting
      ? '#f0883e'
      : (connected || isRunning) ? '#7ee787' : t.textMuted;

  const statusLabel = workflowError
    ? 'AI Issue'
    : reconnecting
      ? 'Reconnecting'
      : (connected || isRunning) ? 'Connected' : 'Offline';

  const hasGlow = (connected || isRunning) && !workflowError;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: t.sidebar,
      borderBottom: `0.5px solid ${t.border}`,
      flexShrink: 0,
      padding: '0 4px',
    }}>
      {/* ─── التبويبات ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2 }}>
        {TERMINAL_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: '6px 12px',
              fontSize: 11,
              background:   terminalTab === tab.id ? t.bg : 'transparent',
              border:       'none',
              cursor:       'pointer',
              color:        terminalTab === tab.id ? t.text : t.textMuted,
              borderBottom: terminalTab === tab.id
                ? `2px solid ${t.accent}`
                : '2px solid transparent',
              borderRadius: '4px 4px 0 0',
              display: 'flex', alignItems: 'center', gap: 6,
              fontWeight:   terminalTab === tab.id ? 500 : 400,
              transition:   'all 0.15s ease',
            }}
          >
            <i className={`codicon ${tab.icon}`} style={{ fontSize: 12 }} />
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* ─── مؤشرات الحالة — PTY + Status ───────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px' }}>
        {/* PTY indicator */}
        <StatusPill
          dot={statusDotColor}
          glow={hasGlow}
          label={statusLabel}
          t={t}
        />
      </div>

      {/* ─── أزرار الأدوات ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px' }}>
        <ToolbarButton
          title="Interrupt (Ctrl+C)"
          icon="codicon-debug-stop"
          color="#ff7b72"
          onClick={onInterrupt}
          t={t}
        />
        <ToolbarButton
          title="Clear Terminal"
          icon="codicon-trash"
          onClick={onClear}
          t={t}
        />
        <ToolbarButton
          title="New Terminal"
          icon="codicon-add"
          t={t}
        />
        <ToolbarButton
          title="Close Terminal"
          icon="codicon-close"
          onClick={onClose}
          t={t}
        />
      </div>
    </div>
  );
}

// ─── Status Pill — مؤشر حالة صغير بدقة عالية ─────────────────────────────────

function StatusPill({ dot, glow, label, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        width: 7, height: 7,
        borderRadius: '50%',
        background: dot,
        boxShadow: glow ? `0 0 7px ${dot}` : 'none',
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 10, color: t.textMuted, letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  );
}

// ─── زر أداة مُعاد الاستخدام ─────────────────────────────────────────────────

function ToolbarButton({ color, icon, onClick, t, title }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 28, height: 28,
        background:   'transparent',
        border:       'none',
        color:        color || t.textMuted,
        cursor:       onClick ? 'pointer' : 'default',
        borderRadius: 4,
        display:      'flex', alignItems: 'center', justifyContent: 'center',
        transition:   'background 0.15s ease',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = t.border + '44'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <i className={`codicon ${icon}`} style={{ fontSize: 13 }} />
    </button>
  );
}
