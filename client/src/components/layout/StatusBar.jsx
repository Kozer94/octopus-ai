import { bidiIsolateStyle, codeTextStyle } from '../../utils/bidiText';

export function StatusBar({
  currentFile,
  displayFilePath,
  isRunning,
  onRunToggle,
  onThemeClick,
  runProcess,
  t,
  theme,
  children,
}) {
  const isGlass = theme === 'glass';

  return (
    <div style={{
      height: 22,
      background: t.statusBar,
      backdropFilter:       isGlass ? 'blur(20px) saturate(1.6)' : undefined,
      WebkitBackdropFilter: isGlass ? 'blur(20px) saturate(1.6)' : undefined,
      boxShadow: isGlass ? 'inset 0 1px 0 rgba(167,139,250,0.18), 0 -2px 20px rgba(0,0,0,0.25)' : undefined,
      display: 'flex', alignItems: 'center',
      padding: '0 12px', gap: 16, flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <i className="codicon codicon-source-control" style={{ fontSize: 12 }} /> main
      </span>
      <button
        onClick={onRunToggle}
        className={isRunning ? 'runtime-pulse' : ''}
        style={{
          background: isRunning ? '#da3633' : '#2ea043',
          border: 'none', borderRadius: 4, cursor: 'pointer',
          color: '#fff', padding: '1px 8px', fontSize: 11,
          display: 'flex', alignItems: 'center', gap: 4,
          transition: 'background 0.2s ease',
        }}
      >
        <i className={`codicon ${isRunning ? 'codicon-stop-circle' : 'codicon-play'}`} style={{ fontSize: 12 }} />
        {isRunning ? 'Stop' : 'Run'}
      </button>
      {runProcess && (
        <span dir="ltr" style={codeTextStyle({ fontSize: 11, color: 'rgba(255,255,255,0.72)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
          {runProcess}
        </span>
      )}
      {children}
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🐙 Octopus AI</span>
      <div style={{ flex: 1 }} />
      <span dir="auto" style={bidiIsolateStyle({ fontSize: 12, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 })}>
        {displayFilePath(currentFile)} • {currentFile?.content?.split('\n').length || 0} lines
      </span>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>UTF-8</span>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={onThemeClick}>
        {t.name}
      </span>
    </div>
  );
}
