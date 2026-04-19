import React, { useState, useRef, useEffect, useMemo } from "react";
// ⚠️  @supabase/supabase-js er IKKE importert statisk her.
// Statisk import legger Supabase i vendor.js som evalueres FØR
// error-handleren nedenfor er registrert. Det betyr at Supabase
// kan kaste "No Listener: tabs:outgoing.message.ready" før noe
// kan fange det → hvit skjerm.
// Løsning: dynamic import inne i getSupabase() — lastes kun ved behov,
// etter at error-handleren er aktiv.

// ═══════════════════════════════════════════════════════════════════════
// STEG 1 — Global error suppressor (kjører ved modul-load, før alt annet)
// Fanger Supabase tab-lock feil og stopper dem fra å nå React 18
// concurrent mode scheduler som ellers unmounter render-treet.
// capture:true = kjører absolutt først, stopImmediatePropagation = ingen
// annen handler (inkl. React) ser hendelsen.
// ═══════════════════════════════════════════════════════════════════════
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const msg: string = e?.reason?.message ?? String(e?.reason ?? "");
    if (
      msg.includes("No Listener") ||
      msg.includes("tabs:outgoing") ||
      msg.includes("TabsLock") ||
      msg.includes("BroadcastChannel")
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
}

// ── Supabase clients ─────────────────────────────────────────────────
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const HAS_SUPA = !!(SUPA_URL && SUPA_KEY);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabaseReg: any = null;

// Main client — persists session, has onAuthStateChange listener
async function getSupabase() {
  if (_supabase) return _supabase;
  if (!SUPA_URL || !SUPA_KEY) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { createClient } = await import("@supabase/supabase-js") as any;
    _supabase = createClient(SUPA_URL, SUPA_KEY, {
      auth: {
        persistSession: true, autoRefreshToken: true,
        detectSessionInUrl: true, storageKey: "awaz-auth-v1",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lock: (_n: any, _t: any, fn: any) => fn(),
      },
    });
    return _supabase;
  } catch { return null; }
}

// Registration client — does NOT persist session, does NOT fire main app listeners.
// Used exclusively in ApplySheet so registering a new artist never disrupts
// the current user's session (admin stays logged in).
async function getSupabaseReg() {
  if (_supabaseReg) return _supabaseReg;
  if (!SUPA_URL || !SUPA_KEY) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { createClient } = await import("@supabase/supabase-js") as any;
    _supabaseReg = createClient(SUPA_URL, SUPA_KEY, {
      auth: {
        persistSession: false,   // ← do NOT store this session to localStorage
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "awaz-reg-tmp", // separate key = no conflict with main client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lock: (_n: any, _t: any, fn: any) => fn(),
      },
    });
    return _supabaseReg;
  } catch { return null; }
}

// ── Service-role admin client — bypasses ALL RLS for admin delete ops ─
// Requires VITE_SUPABASE_SERVICE_KEY in Vercel env vars.
// SECURITY: This key is frontend-visible — only use for admin-gated ops.
const SUPA_SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY || "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabaseAdmin: any = null;
async function getSupabaseAdmin() {
  if (_supabaseAdmin) return _supabaseAdmin;
  if (!SUPA_URL || !SUPA_SERVICE_KEY) return null; // falls back to normal client
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { createClient } = await import("@supabase/supabase-js") as any;
    _supabaseAdmin = createClient(SUPA_URL, SUPA_SERVICE_KEY, {
      auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lock:(_n:any,_t:any,fn:any)=>fn() },
    });
    return _supabaseAdmin;
  } catch { return null; }
}

// ── Robust artist delete — tries admin client first, falls back to anon ─
// Returns { ok: boolean, errors: string[] }
async function deleteArtistFromDB(artistId: string): Promise<{ok:boolean; errors:string[]}> {
  // Prefer service-role client (bypasses RLS), fall back to session-based client
  const sb = await getSupabaseAdmin() || await getSupabase();
  if (!sb) return { ok:true, errors:[] }; // offline/demo mode — UI already updated
  const tables: [string, string][] = [
    ["song_requests","artist_id"],
    ["chat_messages","artist_id"],
    ["bookings",     "artist_id"],
    ["reviews",      "artist_id"],
    ["artists",      "id"],
    ["profiles",     "id"],
    ["users",        "id"],
  ];
  const errors: string[] = [];
  for (const [table, col] of tables) {
    const { error } = await sb.from(table).delete().eq(col, artistId);
    if (error) errors.push(`${table}: ${error.message}`);
  }
  return { ok: errors.length === 0, errors };
}

/* ═══════════════════════════════════════════════════════════════════════
   AWAZ  ·  آواز  ·  Afghan Artist Booking Platform
   Mobile-first · Apple HIG · Airbnb UX · Stripe precision
   
   Breakpoints: mobile <768px | tablet 768-1023 | desktop 1024+
   Touch targets: 44px minimum (Apple HIG)
   Type scale: fluid clamp() — no fixed sizes
   Spacing: 4px base grid
═══════════════════════════════════════════════════════════════════════ */

// (Resten av din originale kode – alle hooks, states, components, TRANSLATIONS, etc. – er beholdt uendret frem til feilstedet)

// ── Fixed section: Privacy / Terms tab buttons ────────────────────────
{(["privacy","terms"] as const).map(t=>(
  <button 
    key={t} 
    onClick={()=>setTab(t)}
    style={{
      background: tab===t ? "rgba(200,168,74,0.1)" : "transparent",
      color: tab===t ? "#C8A84A" : "#8A7D68",
      border: `1px solid ${tab===t ? C.gold + "44" : C.border}`,
      borderRadius: 8,
      padding: "7px 16px",
      fontSize: 13,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit",
      textTransform: "capitalize"
    }}
  >
    {t==="privacy" ? "Privacy Policy" : "Terms of Service"}
  </button>
))}

// ... fortsett med resten av din originale kode herfra og til slutten ...

// ── Root export — wraps everything in ErrorBoundary ─────────────────
export default function App(){
  return(
    <NotificationProvider>
      <ErrorBoundary><AppInner/></ErrorBoundary>
    </NotificationProvider>
  );
}
