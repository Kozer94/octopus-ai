import './cleanConsole.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import monaco from './config/monacoWorkers.js'
import { loader } from '@monaco-editor/react'
import './index.css'
import './styles/depth.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import { createSessionId } from './config/uiConfig.js'
import { initCorrelation } from './services/correlationLayer.js'
import { installRuntimeTelemetry } from './services/runtimeTelemetry.js'
import { registerMonacoThemes } from './utils/monacoThemes.js'
import { bootstrapSecurityContext } from './services/securityBootstrap.js'

// إيقاف إشعارات أدوات المطورين الافتراضية لـ React قبل تحميل الواجهة
if (globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__.supportsFiber = true;
}

// ═══════════════════════════════════════════════════════════
// 🔐 Security Bootstrap Phase
// ═══════════════════════════════════════════════════════════
// Order:
// 1. Resolve Identity (load token)
// 2. Attach Token (set global auth context)
// 3. Initialize Correlation Context
// 4. THEN start telemetry + API clients
// ═══════════════════════════════════════════════════════════

loader.config({ monaco })
registerMonacoThemes(monaco)

// Step 1-2: Security Bootstrap
const authContext = await bootstrapSecurityContext();

const _runtimeSessionId = createSessionId();
const _runtimeTraceId   = globalThis.crypto?.randomUUID?.() || _runtimeSessionId;

// Step 3: Initialize Correlation Context
initCorrelation({
  sessionId: _runtimeSessionId,
  traceId: _runtimeTraceId,
  verbose: import.meta.env?.DEV === true,
  authToken: authContext.token || '',
})

// Step 4: Start telemetry (now safe because auth context is ready)
installRuntimeTelemetry({ sessionId: _runtimeSessionId, traceId: _runtimeTraceId })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
