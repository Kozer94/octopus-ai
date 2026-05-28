// ModelSelector.jsx — اختيار نموذج الذكاء الاصطناعي
// مستخرج من RightPanel.jsx

import { useEffect, useRef, useState } from 'react';
import { AI_MODELS } from '../../services/ModelRegistry';

/**
 * ModelSelector — قائمة منسدلة لاختيار نموذج AI
 *
 * Props:
 *   selectedModel  string   — ID النموذج المحدد
 *   onModelChange  fn(id)   — callback عند تغيير النموذج
 *   t              object   — theme
 */
export function ModelSelector({ selectedModel, onModelChange, t }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  const currentModel = AI_MODELS.find(m => m.id === selectedModel) || AI_MODELS[0];

  // إغلاق القائمة عند الضغط خارجها
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu(v => !v)}
        style={{
          background:   'transparent',
          border:       `0.5px solid ${t.border}`,
          borderRadius: 6,
          color:        t.textMuted,
          cursor:       'pointer',
          fontSize:     11,
          padding:      '3px 8px',
          display:      'flex', alignItems: 'center', gap: 5,
        }}
      >
        <i className="codicon codicon-server" style={{ fontSize: 11 }} />
        {currentModel.label}
        <i className={`codicon codicon-chevron-${showMenu ? 'up' : 'down'}`} style={{ fontSize: 10 }} />
      </button>

      {showMenu && (
        <div style={{
          position:   'absolute',
          bottom:     34, left: 0,
          background: t.bg,
          border:     `0.5px solid ${t.border}`,
          borderRadius: 8,
          padding:    4,
          zIndex:     1000,
          minWidth:   180,
          boxShadow:  '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {AI_MODELS.map(model => (
            <button
              key={model.id}
              onClick={() => { onModelChange(model.id); setShowMenu(false); }}
              style={{
                width:       '100%',
                background:  selectedModel === model.id ? t.accent + '22' : 'transparent',
                border:      'none',
                borderRadius: 5,
                color:       t.text,
                cursor:      'pointer',
                padding:     '6px 10px',
                fontSize:    12,
                textAlign:   'left',
                display:     'flex',
                justifyContent: 'space-between',
                alignItems:  'center',
              }}
            >
              <span style={{ fontWeight: selectedModel === model.id ? 600 : 400 }}>{model.label}</span>
              <span style={{ fontSize: 10, color: t.textMuted }}>{model.provider}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
