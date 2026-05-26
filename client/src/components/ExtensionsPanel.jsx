export function ExtensionsPanel({
  extSearchQuery,
  extSearchResults,
  extSearching,
  installExtension,
  isExtensionInstalled,
  onQueryChange,
  onSelectExtension,
  searchExtensions,
  t,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', borderBottom: `0.5px solid ${t.border}` }}>
        <input
          aria-label="Search extensions"
          autoComplete="off"
          style={{ width: '100%', background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '5px 10px', color: t.text, fontSize: 12, outline: 'none' }}
          placeholder="Search extensions..."
          value={extSearchQuery}
          onChange={e => {
            onQueryChange(e.target.value);
            searchExtensions(e.target.value);
          }}
          dir="auto"
        />
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {extSearching && (
          <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>Searching...</p>
        )}
        {!extSearching && extSearchResults.length === 0 && extSearchQuery === '' && (
          <div style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🧩</div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: t.text, margin: '0 0 8px' }}>
              Extensions Marketplace
            </h3>
            <p style={{ fontSize: 11, color: t.textMuted, margin: '0 0 16px', lineHeight: 1.5 }}>
              Search for VS Code extensions to install
            </p>
          </div>
        )}
        {!extSearching && extSearchResults.length === 0 && extSearchQuery !== '' && (
          <p style={{ fontSize: 11, color: t.textMuted, padding: 10 }}>No results found</p>
        )}
        {extSearchResults.map((extension) => (
          <div
            key={extension.id || extension.name || extension.displayName}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: `0.5px solid ${t.border}33`,
            }}
            onClick={() => onSelectExtension(extension)}
            onMouseEnter={e => e.currentTarget.style.background = t.border + '44'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <img
              src={extension.icon || extension.files?.icon}
              alt={extension.name}
              style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'contain' }}
              onError={e => e.target.style.display = 'none'}
            />
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: 12, color: t.text, fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {extension.displayName || extension.name}
              </div>
              <div style={{ fontSize: 10, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {extension.description || extension.shortDescription}
              </div>
            </div>
            {isExtensionInstalled(extension.id) ? (
              <span style={{ fontSize: 10, color: '#3fb950', fontWeight: 500 }}>✓ Installed</span>
            ) : (
              <button
                style={{
                  background: t.accent,
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  padding: '4px 8px',
                  fontSize: 10,
                  cursor: 'pointer',
                }}
                onClick={e => {
                  e.stopPropagation();
                  installExtension(extension);
                }}
              >
                Install
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
