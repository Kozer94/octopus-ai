// ChatInput.jsx — صندوق إدخال الدردشة (mode bar + textarea + model + send)
// مستخرج من RightPanel.jsx

import { ChatModeBar } from './ChatModeBar';
import { CHAT_MODES } from './chatModes';
import { ModelSelector } from './ModelSelector';

/**
 * ChatInput — منطقة الإدخال الكاملة للدردشة
 *
 * Props:
 *   chatMode      string   — الوضع النشط
 *   input         string   — نص الإدخال الحالي
 *   loading       boolean  — هل AI يعمل
 *   onModeChange  fn(id)   — تغيير وضع الدردشة
 *   onModelChange fn(id)   — تغيير النموذج
 *   onSend        fn()     — إرسال الرسالة
 *   selectedModel string   — النموذج المحدد
 *   setInput      fn(val)  — تحديث نص الإدخال
 *   t             object   — theme
 */
export function ChatInput({
  chatMode,
  input,
  loading,
  onModeChange,
  onModelChange,
  onSend,
  selectedModel,
  setInput,
  t,
}) {
  const activeMode = CHAT_MODES.find(m => m.id === chatMode) || CHAT_MODES[0];

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div style={{
      padding:     '8px 10px',
      borderTop:   `0.5px solid ${t.border}`,
      background:  t.bg,
    }}>
      {/* شريط الأوضاع */}
      <ChatModeBar chatMode={chatMode} onModeChange={onModeChange} t={t} />

      {/* صندوق الإدخال */}
      <div style={{
        background:   t.sidebar,
        border:       `0.5px solid ${t.border}`,
        borderRadius: 10,
        padding:      '8px 10px',
        display:      'flex',
        flexDirection: 'column',
        gap:          8,
      }}>
        <textarea
          dir="auto"
          aria-label="Command input"
          style={{
            background:  'transparent',
            color:       t.text,
            border:      'none',
            outline:     'none',
            fontSize:    13,
            resize:      'none',
            fontFamily:  "'Inter', 'Segoe UI', sans-serif",
            lineHeight:  1.5,
            width:       '100%',
          }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`${activeMode.label}...`}
          rows={2}
        />

        {/* Footer: نموذج + زر الإرسال */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <ModelSelector selectedModel={selectedModel} onModelChange={onModelChange} t={t} />

          <button
            onClick={onSend}
            disabled={loading}
            style={{
              background:   loading ? t.border : t.accent,
              border:       'none',
              borderRadius: 6,
              color:        '#fff',
              width:        30, height: 30,
              cursor:       loading ? 'default' : 'pointer',
              display:      'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <i
              className={`codicon ${loading ? 'codicon-loading' : 'codicon-send'}`}
              style={{ fontSize: 14 }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
