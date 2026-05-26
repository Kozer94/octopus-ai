
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

const COMMAND_CATEGORIES = [
  {
    id: 'ai',
    label: 'AI Actions',
    icon: 'codicon-hubot',
    items: [
      { id: 'ai.ask', label: 'Ask Octopus', icon: 'codicon-comment-discussion', shortcut: 'Ctrl+Shift+O' },
      { id: 'ai.explain', label: 'Explain Code', icon: 'codicon-lightbulb', shortcut: 'Ctrl+Shift+E' },
      { id: 'ai.refactor', label: 'Refactor', icon: 'codicon-symbol-enum', shortcut: 'Ctrl+Shift+R' },
      { id: 'ai.fix', label: 'Fix Errors', icon: 'codicon-wrench', shortcut: 'Ctrl+Shift+F' },
      { id: 'ai.generate', label: 'Generate Tests', icon: 'codicon-beaker', shortcut: 'Ctrl+Shift+T' },
    ],
  },
  {
    id: 'file',
    label: 'File',
    icon: 'codicon-file',
    items: [
      { id: 'file.open', label: 'Open File', icon: 'codicon-go-to-file', shortcut: 'Ctrl+O' },
      { id: 'file.save', label: 'Save File', icon: 'codicon-save', shortcut: 'Ctrl+S' },
      { id: 'file.saveAll', label: 'Save All', icon: 'codicon-save-all', shortcut: 'Ctrl+Shift+S' },
      { id: 'file.close', label: 'Close File', icon: 'codicon-close', shortcut: 'Ctrl+W' },
      { id: 'file.new', label: 'New Scratch File', icon: 'codicon-new-file', shortcut: 'Ctrl+N' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    icon: 'codicon-layout',
    items: [
      { id: 'view.explorer', label: 'Show Explorer', icon: 'codicon-files', shortcut: 'Ctrl+Shift+E' },
      { id: 'view.search', label: 'Show Search', icon: 'codicon-search', shortcut: 'Ctrl+Shift+F' },
      { id: 'view.git', label: 'Show Git', icon: 'codicon-source-control', shortcut: 'Ctrl+Shift+G' },
      { id: 'view.terminal', label: 'Toggle Terminal', icon: 'codicon-terminal', shortcut: 'Ctrl+`' },
      { id: 'view.runtime', label: 'Runtime Inspector', icon: 'codicon-dashboard', shortcut: 'Ctrl+Shift+D' },
    ],
  },
  {
    id: 'run',
    label: 'Run & Debug',
    icon: 'codicon-debug-alt',
    items: [
      { id: 'run.start', label: 'Start Runtime', icon: 'codicon-play', shortcut: 'F5' },
      { id: 'run.stop', label: 'Stop Runtime', icon: 'codicon-debug-stop', shortcut: 'Shift+F5' },
      { id: 'run.restart', label: 'Restart', icon: 'codicon-refresh', shortcut: 'Ctrl+Shift+F5' },
    ],
  },
];

export function CommandPalette({ isOpen, onClose, onAction, recentFiles = [], t }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const allItems = useMemo(() => COMMAND_CATEGORIES.flatMap(cat =>
    cat.items.map(item => ({ ...item, category: cat.label, categoryId: cat.id }))
  ), []);

  const filteredItems = useMemo(() => {
    if (query) {
      return allItems.filter(item =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.category.toLowerCase().includes(query.toLowerCase())
        );
    }

    return [
      ...recentFiles.slice(0, 3).map(f => ({
        id: `recent:${f.name}`,
        label: f.name,
        icon: 'codicon-clock',
        category: 'Recent Files',
        categoryId: 'recent',
        isRecent: true,
        fileName: f.name,
      })),
      ...allItems.slice(0, 8),
    ];
  }, [allItems, query, recentFiles]);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const executeItem = useCallback((item) => {
    if (item) {
      onAction(item);
      onClose();
    }
  }, [onAction, onClose]);

  const executeSelected = useCallback(() => {
    executeItem(filteredItems[selectedIndex]);
  }, [executeItem, filteredItems, selectedIndex]);

  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        executeSelected();
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredItems.length, executeSelected, onClose]);

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex];
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '18vh',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="command-palette-container glass-heavy"
        style={{
          width: '100%',
          maxWidth: 580,
          maxHeight: '52vh',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div
          className="command-palette-search"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: `0.5px solid ${t.border}`,
            background: 'rgba(22,27,34,0.6)',
          }}
        >
          <i className="codicon codicon-search" style={{ color: t.accent, fontSize: 16, flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: t.text,
              fontSize: 14,
              fontFamily: "'Inter', 'Segoe UI', sans-serif",
            }}
          />
          <kbd style={{
            fontSize: 10,
            color: t.textMuted,
            background: t.border + '88',
            borderRadius: 4,
            padding: '2px 6px',
            fontFamily: 'monospace',
          }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '6px 0',
          }}
        >
          {!query && (
            <div style={{ padding: '6px 16px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="codicon codicon-clock" style={{ fontSize: 11, color: t.textMuted }} />
              <span style={{ fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
                {query ? 'Results' : 'Recent & Suggested'}
              </span>
            </div>
          )}

          {filteredItems.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <i className="codicon codicon-search-stop" style={{ fontSize: 24, color: t.textMuted, display: 'block', marginBottom: 8 }} />
              <p style={{ fontSize: 13, color: t.textMuted }}>No matching commands</p>
            </div>
          )}

          {filteredItems.map((item, index) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                cursor: 'pointer',
                background: index === selectedIndex ? (t.accent + '18') : 'transparent',
                borderLeft: index === selectedIndex ? `2px solid ${t.accent}` : '2px solid transparent',
                transition: 'all 0.1s ease',
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => executeItem(item)}
            >
              <i className={`codicon ${item.icon}`} style={{
                fontSize: 14,
                color: index === selectedIndex ? t.accent : t.textMuted,
                flexShrink: 0,
                width: 18,
                textAlign: 'center',
                transition: 'color 0.1s ease',
              }} />
              <span style={{
                flex: 1,
                fontSize: 13,
                color: index === selectedIndex ? t.text : t.textMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'color 0.1s ease',
              }}>
                {item.label}
              </span>
              <span style={{
                fontSize: 10,
                color: t.textMuted + '88',
                background: t.border + '44',
                borderRadius: 3,
                padding: '1px 6px',
                fontFamily: 'monospace',
              }}>
                {item.category}
              </span>
              {item.shortcut && (
                <kbd style={{
                  fontSize: 10,
                  color: t.textMuted,
                  background: t.border + '66',
                  borderRadius: 3,
                  padding: '1px 5px',
                  fontFamily: 'monospace',
                  flexShrink: 0,
                }}>
                  {item.shortcut}
                </kbd>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 16px',
          borderTop: `0.5px solid ${t.border}`,
          background: 'rgba(13,17,23,0.5)',
          fontSize: 10,
          color: t.textMuted,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={{ background: t.border + '66', borderRadius: 2, padding: '0 4px', fontFamily: 'monospace' }}>↑↓</kbd>
            navigate
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={{ background: t.border + '66', borderRadius: 2, padding: '0 4px', fontFamily: 'monospace' }}>↵</kbd>
            select
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={{ background: t.border + '66', borderRadius: 2, padding: '0 4px', fontFamily: 'monospace' }}>esc</kbd>
            close
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ color: t.accent, fontWeight: 500 }}>🐙 Octopus AI</span>
        </div>
      </div>
    </div>
  );
}
