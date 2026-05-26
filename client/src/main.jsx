import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import './index.css'
import './styles/depth.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registerMonacoThemes } from './utils/monacoThemes.js'

loader.config({ monaco })
registerMonacoThemes(monaco)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
