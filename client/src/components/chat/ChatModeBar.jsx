// ChatModeBar.jsx — شريط أوضاع الدردشة (Build / Fix / Explain / ...)
// مستخرج من RightPanel.jsx

import { CHAT_MODES } from './chatModes';

/**
 * ChatModeBar — أزرار اختيار وضع الدردشة
 *
 * Props:
 *   chatMode    string  — الوضع النشط
 *   onModeChange fn(id) — callback عند تغيير الوضع
 *   t           object  — theme
 */
export function ChatModeBar({ chatMode, onModeChange, t }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
      {CHAT_MODES.map(mode => (
        <button
          key={mode.id}
          onClick={() => onModeChange(mode.id)}
          title={mode.label}
          style={{
            padding:     '3px 8px',
            borderRadius: 5,
            border:       'none',
            background:   chatMode === mode.id ? t.accent + '22' : 'transparent',
            color:        chatMode === mode.id ? t.accent : t.textMuted,
            cursor:       'pointer',
            fontSize:     11,
            fontWeight:   chatMode === mode.id ? 600 : 400,
          }}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
