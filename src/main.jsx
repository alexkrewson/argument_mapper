import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import CrashScreen from './components/CrashScreen.jsx'
import { ErrorBoundary, initMonitoring } from './utils/monitoring.js'

// Before render, so an error thrown during the first paint is still captured.
initMonitoring()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fallback={CrashScreen}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
