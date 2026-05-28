// ContextMenu.jsx — قائمة النقر الأيمن القابلة للتحديد الموضع
import { useEffect, useRef } from 'react';

/**
 * ContextMenu — قائمة context menu مُحددة الموضع
 *
 * Props:
 *   items   array  — [{ label, icon, iconColor, shortcut, action, danger, disabled, separator }]
 *   onClose fn     — استدعاء عند إغلاق القائمة
 *   t       object — theme
 *   x       number — left position (px)
 *   y       number — top position (px)
 */
export function ContextMenu({ items, onClose, t, x, y }) {
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const nonSepCount = items.filter(i => !i.separator).length;
  const estimatedH  = nonSepCount * 30 + items.filter(i => i.separator).length * 9 + 8;
  const menuW       = 230;
  const vw          = globalThis.innerWidth  || 800;
  const vh          = globalThis.innerHeight || 600;
  const left        = Math.max(4, Math.min(x, vw - menuW - 10));
  const top         = Math.max(4, Math.min(y, vh - estimatedH - 10));

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position:     'fixed',
        top,
        left,
        zIndex:       10000,
        background:   t.sidebar,
        border:       `1px solid ${t.border}`,
        borderRadius: 6,
        boxShadow:    '0 8px 24px rgba(0,0,0,0.35)',
        minWidth:     menuW,
        padding:      '4px 0',
        userSelect:   'none',
      }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} style={{ height: 1, background: t.border, margin: '3px 0' }} />;
        }
        const textColor = item.danger ? '#E24B4A' : t.text;
        return (
          <div
            key={i}
            role="menuitem"
            onMouseDown={e => {
              e.preventDefault();
              if (!item.disabled) { item.action?.(); onClose(); }
            }}
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        8,
              padding:    '5px 12px 5px 8px',
              cursor:     item.disabled ? 'default' : 'pointer',
              opacity:    item.disabled ? 0.4 : 1,
              fontSize:   12,
              color:      textColor,
            }}
            onMouseEnter={e => {
              if (!item.disabled)
                e.currentTarget.style.background = item.danger
                  ? 'rgba(226,75,74,0.15)'
                  : (t.accent + '22');
            }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {item.icon
              ? <i
                  className={`codicon ${item.icon}`}
                  style={{
                    fontSize:   13,
                    color:      item.danger ? '#E24B4A' : (item.iconColor || t.textMuted),
                    width:      16,
                    textAlign:  'center',
                    flexShrink: 0,
                  }}
                />
              : <span style={{ width: 16, flexShrink: 0 }} />
            }
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.shortcut && (
              <span style={{ color: t.textMuted, fontSize: 11, marginLeft: 8, whiteSpace: 'nowrap' }}>
                {item.shortcut}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
