import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import CrashScreen from './components/CrashScreen.jsx'
import { ErrorBoundary, initMonitoring } from './utils/monitoring.js'
import { initNativeOAuth } from './utils/oauth.js'

// Before render, so an error thrown during the first paint is still captured.
initMonitoring()
// Before render too: a cold start from the sign-in redirect carries the code
// in the launch URL, and it should be redeemed before the UI asks who you are.
initNativeOAuth()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fallback={CrashScreen}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
