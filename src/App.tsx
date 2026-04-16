import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// ── CRITICAL: Suppress Supabase tab-lock unhandled rejections ──────────────
//
// @supabase/gotrue-js (v2.62+) uses an internal TabLockImpl that broadcasts
// auth-lock messages between browser tabs via BroadcastChannel. Under certain
// conditions (single tab, race on page load, older browser fallback) the lock
// is released before a listener is registered, throwing:
//   "No Listener: tabs:outgoing.message.ready"
//
// In React 18 concurrent mode this Uncaught (in promise) Error can propagate
// through React's scheduler and prevent the root from mounting → blank page.
//
// This handler intercepts it BEFORE React sees it and suppresses it safely.
// The app continues to work — Supabase auth still functions; the tab-sync
// feature (syncing login across multiple tabs) simply won't be active.
//
window.addEventListener("unhandledrejection", (event) => {
  const msg = event?.reason?.message ?? "";
  if (
    msg.includes("No Listener: tabs:") ||
    msg.includes("tabs:outgoing.message.ready") ||
    msg.includes("TabsLock")
  ) {
    event.preventDefault(); // ← stops it from reaching React
    if (import.meta.env.DEV) {
      console.warn("[Awaz] Suppressed Supabase tab-lock error:", msg);
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
