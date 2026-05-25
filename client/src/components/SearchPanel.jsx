import { bidiIsolateStyle, codeTextStyle } from '../utils/bidiText';
import { getFileIcon } from '../utils/fileIcons';

export function SearchPanel({
  onFileClick,
  onQueryChange,
  onSearch,
  searchQuery,
  searchResults,
  searching,
  t,
}) {
  const groupedResults = searchResults.reduce((acc, result) => {
    if (!acc[result.file]) acc[result.file] = { path: result.path, lines: [] };
    acc[result.file].lines.push(result);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', borderBottom: `0.5px solid ${t.border}` }}>
        <input
          style={{ width: '100%', background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '5px 10px', color: t.text, fontSize: 12, outline: 'none' }}
          placeholder="Search in files..."
          value={searchQuery}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSearch(searchQuery); }}
          dir="auto"
        />
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {searching && <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>Searching...</p>}
        {searchResults.length === 0 && !searching && searchQuery && (
          <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>No results found</p>
        )}
        {Object.entries(groupedResults).map(([file, data]) => (
          <div key={file} style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: t.border + '33', position: 'sticky', top: 0 }}>
              {(() => {
                const { icon, color } = getFileIcon(file);
                return <i className={`codicon ${icon}`} style={{ color, fontSize: 12 }} />;
              })()}
              <span dir="auto" style={bidiIsolateStyle({ fontSize: 11, color: t.accent, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{file}</span>
              <span style={{ fontSize: 10, color: t.textMuted, marginRight: 'auto' }}>{data.lines.length} result{data.lines.length !== 1 ? 's' : ''}</span>
            </div>
            {data.lines.map((result) => (
              <div key={`${result.path}:${result.line}:${result.text}`}
                style={{ padding: '4px 10px 4px 20px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start' }}
                onClick={() => onFileClick({ name: result.file, path: result.path, type: 'file' })}
                onMouseEnter={e => e.currentTarget.style.background = t.accent + '11'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 10, color: t.textMuted, fontFamily: 'monospace', minWidth: 28, textAlign: 'left', flexShrink: 0 }}>{result.line}</span>
                <span dir="auto" style={codeTextStyle({ fontSize: 11, color: t.textMuted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{result.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
