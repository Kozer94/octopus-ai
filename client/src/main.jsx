import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import './index.css'
import './styles/depth.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { createSessionId } from './config/uiConfig.js'
import { initCorrelation } from './services/correlationLayer.js'
import { installRuntimeTelemetry } from './services/runtimeTelemetry.js'
import { registerMonacoThemes } from './utils/monacoThemes.js'

loader.config({ monaco })
registerMonacoThemes(monaco)
const _runtimeSessionId = createSessionId();
const _runtimeTraceId   = globalThis.crypto?.randomUUID?.() || _runtimeSessionId;
installRuntimeTelemetry({ sessionId: _runtimeSessionId, traceId: _runtimeTraceId })
initCorrelation({
  sessionId: _runtimeSessionId,
  traceId: _runtimeTraceId,
  verbose: import.meta.env?.DEV === true,
  authToken: globalThis.localStorage?.getItem('octopusApiToken') || import.meta.env?.VITE_OCTOPUS_API_TOKEN || '',
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
