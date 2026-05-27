// ═══════════════════════════════════════════════════════════
// 🔐 Security Bootstrap Phase
// ═══════════════════════════════════════════════════════════
// This must run BEFORE any telemetry, API calls, or app initialization
// Order:
// 1. Resolve Identity (load token)
// 2. Attach Token (set global auth context)
// 3. Initialize Correlation Context
// 4. THEN start telemetry + API clients
// ═══════════════════════════════════════════════════════════

let authContext = {
  ready: false,
  token: null,
  source: null, // 'localStorage' | 'env' | 'none'
};

function resolveIdentity() {
  // Priority: localStorage > env > none
  const storedToken = localStorage?.getItem('octopusApiToken') || '';
  const envToken = import.meta.env?.VITE_OCTOPUS_API_TOKEN || '';

  if (storedToken) {
    return { token: storedToken, source: 'localStorage' };
  }

  if (envToken) {
    return { token: envToken, source: 'env' };
  }

  return { token: null, source: 'none' };
}

// Dynamic token resolution - reads from localStorage every time
function getDynamicToken() {
  const storedToken = localStorage?.getItem('octopusApiToken') || '';
  const envToken = import.meta.env?.VITE_OCTOPUS_API_TOKEN || '';
  return storedToken || envToken || '';
}

function attachToken(identity) {
  authContext = {
    ready: identity.token !== null,
    token: identity.token,
    source: identity.source,
  };
  
  // Set global for apiClient to use
  globalThis.__OCTOPUS_AUTH_CONTEXT__ = authContext;
  
  return authContext;
}

export async function bootstrapSecurityContext() {
  // Step 1: Resolve Identity
  const identity = resolveIdentity();
  
  // Step 2: Attach Token
  const context = attachToken(identity);
  
  // Step 3: Return context for correlation layer
  return context;
}

export function getAuthContext() {
  return authContext;
}

export { getDynamicToken };

export function setAuthContext(token, source = 'manual') {
  authContext = {
    ready: token !== null,
    token,
    source,
  };
  globalThis.__OCTOPUS_AUTH_CONTEXT__ = authContext;
  
  // Also persist to localStorage if set manually
  if (token && source === 'manual') {
    globalThis.localStorage?.setItem('octopusApiToken', token);
  }
  
  return authContext;
}
