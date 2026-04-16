import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// ── STEG 1: Fang Supabase tab-lock feil FØR alt annet ─────────────────────
//
// capture:true → handler kjører FØR alle andre, inkludert React sin interne
// unhandledrejection-lytter i concurrent mode.
// stopImmediatePropagation() stopper React fra å se hendelsen overhodet.
//
window.addEventListener(
  'unhandledrejection',
  (event) => {
    const msg = event?.reason?.message ?? String(event?.reason ?? '')
    if (
      msg.includes('No Listener') ||
      msg.includes('tabs:outgoing') ||
      msg.includes('TabsLock') ||
      msg.includes('BroadcastChannel')
    ) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  },
  true // ← capture phase — kjører ABSOLUTT FØRST
)

// ── STEG 2: Mount React ────────────────────────────────────────────────────
// React.StrictMode er fjernet — det kjører effects dobbelt i dev og
// forverrer Supabase tab-lock race conditions.
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
