import { useState, useEffect, useRef } from 'react';
import './LivePreview.css';

// URL extraction patterns for common dev servers
const DEV_SERVER_PATTERNS = [
  { regex: /localhost:(\d+)/, port: 1 },
  { regex: /127\.0\.0\.1:(\d+)/, port: 1 },
  { regex: /http:\/\/localhost:(\d+)/, port: 1 },
  { regex: /http:\/\/127\.0\.0\.1:(\d+)/, port: 1 },
  { regex: /Local:\s*http:\/\/localhost:(\d+)/i, port: 1 },
  { regex: /Network:\s*http:\/\/[\d.]+:(\d+)/i, port: 1 },
  { regex: /ready in (\d+)ms/i, port: null }, // Vite pattern
  { regex: /server running at/i, port: null },
];

// Default ports for common frameworks
const DEFAULT_PORTS = {
  vite: 5173,
  next: 3000,
  react: 3000,
  vue: 5173,
  angular: 4200,
  nuxt: 3000,
  svelte: 5173,
  laravel: 8000,
  rails: 3000,
  django: 8000,
  flask: 5000,
};

function extractDevServerUrl(terminalOutput) {
  if (!terminalOutput || typeof terminalOutput !== 'string') return null;

  for (const pattern of DEV_SERVER_PATTERNS) {
    const match = terminalOutput.match(pattern.regex);
    if (match) {
      if (pattern.port !== null) {
        const port = match[pattern.port];
        return `http://localhost:${port}`;
      }
    }
  }

  // Try to detect framework and use default port
  const lowerOutput = terminalOutput.toLowerCase();
  if (lowerOutput.includes('vite')) return `http://localhost:${DEFAULT_PORTS.vite}`;
  if (lowerOutput.includes('next')) return `http://localhost:${DEFAULT_PORTS.next}`;
  if (lowerOutput.includes('react')) return `http://localhost:${DEFAULT_PORTS.react}`;
  if (lowerOutput.includes('vue')) return `http://localhost:${DEFAULT_PORTS.vue}`;
  if (lowerOutput.includes('angular')) return `http://localhost:${DEFAULT_PORTS.angular}`;
  if (lowerOutput.includes('nuxt')) return `http://localhost:${DEFAULT_PORTS.nuxt}`;
  if (lowerOutput.includes('svelte')) return `http://localhost:${DEFAULT_PORTS.svelte}`;
  if (lowerOutput.includes('laravel')) return `http://localhost:${DEFAULT_PORTS.laravel}`;
  if (lowerOutput.includes('rails')) return `http://localhost:${DEFAULT_PORTS.rails}`;
  if (lowerOutput.includes('django')) return `http://localhost:${DEFAULT_PORTS.django}`;
  if (lowerOutput.includes('flask')) return `http://localhost:${DEFAULT_PORTS.flask}`;

  return null;
}

export function LivePreview({ terminalOutput, isVisible, onClose }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const iframeRef = useRef(null);
  const refreshIntervalRef = useRef(null);

  useEffect(() => {
    if (!isVisible) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }

    const url = extractDevServerUrl(terminalOutput);
    if (url && url !== previewUrl) {
      setPreviewUrl(url);
      setIsLoading(true);
      setError(null);
    }
  }, [terminalOutput, isVisible, previewUrl]);

  useEffect(() => {
    if (!previewUrl || !isVisible) return;

    // Check if the server is ready by attempting to fetch
    const checkServerReady = async () => {
      try {
        const response = await fetch(previewUrl, { mode: 'no-cors' });
        setIsLoading(false);
        setError(null);
      } catch (e) {
        // Server not ready yet, keep loading
        setIsLoading(true);
      }
    };

    checkServerReady();

    // Refresh iframe every 5 seconds when visible
    refreshIntervalRef.current = setInterval(() => {
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src;
      }
    }, 5000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [previewUrl, isVisible]);

  const handleRefresh = () => {
    if (iframeRef.current) {
      setIsLoading(true);
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const handleOpenExternal = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  if (!isVisible) return null;

  return (
    <div className="live-preview-panel">
      <div className="preview-header">
        <h3>🖥️ Live Preview</h3>
        <div className="preview-controls">
          {previewUrl && (
            <>
              <button onClick={handleRefresh} className="preview-btn" title="Refresh">
                🔄
              </button>
              <button onClick={handleOpenExternal} className="preview-btn" title="Open in new tab">
                ↗️
              </button>
            </>
          )}
          <button onClick={onClose} className="preview-btn" title="Close preview">
            ✕
          </button>
        </div>
      </div>
      <div className="preview-content">
        {isLoading && (
          <div className="preview-loading">
            <div className="spinner"></div>
            <p>Waiting for dev server...</p>
            <p className="preview-url">{previewUrl || 'Detecting server URL...'}</p>
          </div>
        )}
        {error && (
          <div className="preview-error">
            <p>⚠️ Preview unavailable</p>
            <p className="error-message">{error}</p>
          </div>
        )}
        {!previewUrl && !isLoading && (
          <div className="preview-placeholder">
            <p>🚀 Start a dev server to see live preview</p>
            <p className="preview-hint">Run: npm run dev, php artisan serve, etc.</p>
          </div>
        )}
        {previewUrl && !isLoading && (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="preview-iframe"
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setError('Failed to load preview');
              setIsLoading(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
