import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import CrashScreen from './components/CrashScreen.jsx'
import SharedView from './components/SharedView.jsx'
import { ErrorBoundary, initMonitoring } from './utils/monitoring.js'
import { initNativeOAuth } from './utils/oauth.js'
import { initStaleChunkReload } from './utils/staleChunk.js'
import { viewTokenFromLocation } from './utils/share.js'

// Before render, so an error thrown during the first paint is still captured.
initMonitoring()
// A tab left open across a deploy reloads itself instead of breaking.
initStaleChunkReload()
// Before render too: a cold start from the sign-in redirect carries the code
// in the launch URL, and it should be redeemed before the UI asks who you are.
initNativeOAuth()

// A view-only link renders the viewer INSTEAD of the app: no sign-in, no
// auto-save, nothing that could write to the shared debate.
const viewToken = viewTokenFromLocation()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fallback={CrashScreen}>
      {viewToken ? <SharedView token={viewToken} /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
