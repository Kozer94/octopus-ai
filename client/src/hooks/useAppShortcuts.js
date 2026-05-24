import { useEffect } from 'react';

export function useAppShortcuts({ searchInputRef, setSidebarOpen, setTerminalOpen }) {
  useEffect(() => {
    const handler = event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault();
        setSidebarOpen(prev => !prev);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '`') {
        event.preventDefault();
        setTerminalOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchInputRef, setSidebarOpen, setTerminalOpen]);
}
