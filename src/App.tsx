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
// ⚠️  KJØR I SUPABASE SQL EDITOR (én gang) — oppretter booking_requests-tabellen:
// CREATE TABLE IF NOT EXISTS public.booking_requests (
//   id TEXT PRIMARY KEY,
//   artist_id TEXT NOT NULL,
//   customer_name TEXT,
//   customer_email TEXT,
//   event_date TEXT,
//   event_type TEXT,
//   event_location_city TEXT,
//   event_location_country TEXT,
//   event_location_country_code TEXT,
//   guest_count INT,
//   booking_type TEXT,
//   customer_budget_range TEXT,
//   notes TEXT,
//   status TEXT DEFAULT 'request_received',
//   artist_offer NUMERIC,
//   counter_round INT DEFAULT 0,
//   decline_reason TEXT,
//   expires_at TIMESTAMPTZ,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
// ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Anyone can insert" ON public.booking_requests FOR INSERT WITH CHECK (true);
// CREATE POLICY "Artist reads own" ON public.booking_requests FOR SELECT USING (true);
// CREATE POLICY "Artist updates own" ON public.booking_requests FOR UPDATE USING (true);
// ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_requests;
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

// ── Module-level flag: prevents onAuthStateChange from clearing the
// admin session when ApplySheet signs out the newly created artist.
// Set to true just before signOut(), reset after event fires.

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

// ── Responsive hook ───────────────────────────────────────────────────
function useViewport() {
  const [vp, setVp] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1200,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);
  return {
    ...vp,
    isMobile:  vp.w < 768,
    isTablet:  vp.w >= 768 && vp.w < 1024,
    isDesktop: vp.w >= 1024,
  };
}

// ── Awaz Color System v2 — World-class ──────────────────────────────
//
// Philosophy: Dieter Rams × Afghan luxury
// "One accent. Two surfaces. One neutral range. Two semantic."
//
// Every color chosen by three criteria:
//   1. WCAG AAA contrast on its intended background
//   2. Emotional resonance (warmth, trust, premium)
//   3. Works under sunlight (mobile) AND dim room (desktop/dark)
//
// Gold is the ONLY accent. It never competes. It only confirms.
// ────────────────────────────────────────────────────────────────────

const DARK = {
  // ── Surfaces (warm-toned, never cool/clinical) ──
  bg:      '#0B0907',   // Warm black — candlelit room, not void
  surface: '#131009',   // Lifted surface — just enough separation
  card:    '#1A1610',   // Card — 3 stops above bg, no more
  cardH:   '#211E15',   // Card hover
  border:  '#2A241A',   // Border — warm, barely there
  borderM: '#38301E',   // Medium border — active states

  // ── Brand accent — 18K gold, never jewelry-bright ──
  gold:    '#B8934A',   // 18K — desaturated from 24K, reads as genuine luxury
  goldLt:  '#D4AD68',   // Hover/highlight state of gold
  goldS:   'rgba(184,147,74,0.07)',  // Ghost — background tints only

  // ── Semantic — never decorative ──
  ruby:    '#8B3030',   // Error/danger — muted, not alarming
  rubyLt:  '#A63838',
  rubyS:   'rgba(139,48,48,0.08)',
  lapis:   '#2A5080',   // Info — used only for informational states
  lapisS:  'rgba(42,80,128,0.07)',
  emerald: '#2A6048',   // Success/verified — quiet confidence
  emeraldS:'rgba(42,96,72,0.07)',
  saffron: '#A86820',   // Warning — amber, never orange
  lavender:'#5A4A8A',
  stripe:  '#5854D6',

  // ── Typography — warm cream range ──
  text:    '#EDE4CE',   // 11.4:1 AAA — primary, warm parchment
  textD:   '#C4B898',   // 7.8:1 AAA — secondary
  muted:   '#7A6E5E',   // 4.6:1 AA+ — hints, captions
  faint:   '#3D3529',   // Decorative — dividers, disabled

  // ── Social cards ──
  spotifyCard:'#090F0A', youtubeCard:'#0F0808',
  instagramCard:'#0D070B', tiktokCard:'#070910',
  spotify:'#1DB954', instagram:'#E1306C',
};

const LIGHT = {
  // ── Surfaces — warm parchment, never clinical white ──
  bg:      '#FAF8F2',   // Warm off-white — aged paper, never stark
  surface: '#F2EDE2',   // Lifted surface
  card:    '#FFFFFF',   // Card — pure white for max contrast
  cardH:   '#FAF7EE',
  border:  '#E4DAC8',   // Warm border
  borderM: '#CFC3AE',

  // ── Brand accent — richer gold for light backgrounds ──
  gold:    '#8B6914',   // Darker for light — same perceived luminance
  goldLt:  '#A67C20',
  goldS:   'rgba(139,105,20,0.07)',

  // ── Semantic ──
  ruby:    '#8B2020',
  rubyLt:  '#A82828',
  rubyS:   'rgba(139,32,32,0.06)',
  lapis:   '#1A3F7C',
  lapisS:  'rgba(26,63,124,0.06)',
  emerald: '#145E3C',
  emeraldS:'rgba(20,94,60,0.06)',
  saffron: '#8B5200',
  lavender:'#5B3F9A',
  stripe:  '#4B44CC',

  // ── Typography — warm dark range ──
  text:    '#1C160D',   // 16.8:1 AAA
  textD:   '#3B2F1E',   // 12.4:1 AAA
  muted:   '#6B5C45',   // 6.1:1 AA+
  faint:   '#A89880',

  spotifyCard:'#F0FAF5', youtubeCard:'#FFF5F5',
  instagramCard:'#FFF0F5', tiktokCard:'#F0FAFC',
  spotify:'#1DB954', instagram:'#E1306C',
};

// Module-level theme ref — updated on toggle, re-read on each render
let _theme = (() => { try { return localStorage.getItem('awaz-theme')||'light'; } catch { return 'light'; } })();
// Proxy: returns live value from whichever theme is active
const C = new Proxy({}, { get:(_,k) => (_theme==='dark'?DARK:LIGHT)[k] });

// ── Spacing tokens (4px grid) — reference only ───────────────────────
// const S = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 7:28, 8:32, 10:40, 12:48, 16:64 };

const YEAR = new Date().getFullYear();

// ── Fluid typography — WCAG AAA, mobile-first ─────────────────────────
// Old scale was xs=10px (unreadable), sm=12px (too small for body).
// New scale: minimum body text 15px, never below 13px anywhere.
const T = {
  xs:   "clamp(12px, 3vw,   13px)",   // captions, labels   (was 10–11px)
  sm:   "clamp(13px, 3.3vw, 14px)",   // secondary body     (was 12–13px)
  base: "clamp(15px, 3.8vw, 16px)",   // primary body       (was 14–15px)
  md:   "clamp(16px, 4vw,   17px)",   // emphasis / UI      (was 15–16px)
  lg:   "clamp(18px, 4.5vw, 20px)",   // section subheads   (was 17–19px)
  xl:   "clamp(22px, 5.5vw, 26px)",   // card heads         (was 20–24px)
  "2xl":"clamp(27px, 6.5vw, 34px)",   // page section heads (was 24–32px)
  "3xl":"clamp(34px, 8vw,   48px)",   // page titles        (was 30–44px)
  "4xl":"clamp(42px, 10vw,  68px)",   // hero heads         (was 38–64px)
  "5xl":"clamp(52px, 12vw,  92px)",   // display            (was 48–88px)
};

// ── i18n Translation System ───────────────────────────────────────────
// EN · NO · DE · FR · دری (da) · پښتو (ps)
// RTL: Dari and Pashto — dir="rtl" applied to root element automatically.
const TRANSLATIONS = {
  en: {
    browseArtists:"Browse Artists", howItWorks:"How It Works", pricing:"Pricing",
    applyAsArtist:"Apply as Artist", signIn:"Sign In", signOut:"Sign Out",
    heroEyebrow:"Book Afghan Artists Directly",
    heroLine1:"Book Afghan", heroLine2:"Artists", heroLine2em:"Directly",
    heroBody:"Discover and book verified Afghan artists — ghazal, rubab, folk, and fusion — for your wedding, Eid, cultural event or private gathering.",
    searchPlaceholder:"Artist, genre, or city…", searchBtn:"Search",
    trustVerified:"Verified artists", trustStripe:"Stripe payments",
    trustChat:"Direct chat", trustDeposits:"Artist-set deposits", trustCulture:"Afghan culture",
    featuredTitle:"Featured Artists", featuredSub:"Verified · ready to book", seeAll:"See all →",
    aiTitle:"AI Artist Matching", aiFindBtn:"Find My Artist", aiEvent:"Event Type", aiStyle:"Music Style",
    openDates:"open", topBadge:"★ Top", depositLabel:"deposit",
    available:"Available", booked:"Booked", blocked:"Blocked",
    selectDate:"Select a Date", continueWith:"Continue with", selectDateFirst:"Select a date first",
    bookNow:"Book Now", completeBooking:"Complete Your Booking",
    yourName:"Your Name", email:"Email", phone:"Phone",
    eventType:"Event Type", eventPlaceholder:"Wedding, Eid…",
    notes:"Notes (optional)", notesPlaceholder:"Special requests…",
    dateLabel:"Date", depositAmount:"Deposit", balanceCash:"Cash after concert",
    payViaStripe:"Pay €{n} via Stripe →", stripeNote:"🔒 Stripe · SSL · PCI compliant",
    depositConfirmed:"Deposit Confirmed!", continueToChat:"Continue to Chat →",
    balanceCashNote:"Balance paid cash to artist after concert",
    signInToAwaz:"Sign in to Awaz", welcomeBack:"Welcome back",
    password:"Password", forgotPassword:"Forgot password?",
    newHere:"New here?", createAccountLink:"Create account",
    createAccount:"Create account", alreadyHaveAccount:"Already have an account?",
    enterEmailPass:"Enter email and password.",
    wrongCredentials:"Wrong credentials. {n} attempts left.",
    tooManyAttempts:"Too many attempts. Wait 5 min.",
    resetPassword:"Reset Password", sendResetLink:"Send reset link",
    enterYourEmail:"Enter your email and we will send you a reset link.",
    emailSent:"Email sent!", checkInbox:"Check your inbox at",
    forResetLink:"for a link to reset your password.",
    backToSignIn:"Back to sign in", demoAccounts:"Demo accounts — testing only",
    demoNote:"These are removed when you connect Supabase Auth.",
    fullName:"Full name", atLeast8:"At least 8 characters",
    validEmailRequired:"Valid email required.", passwordMin8:"Password must be at least 8 characters.",
    passwordsDontMatch:"Passwords don't match.", nameRequired:"Enter your name.",
    portalHome:"Home", portalCalendar:"Calendar", portalBookings:"Bookings",
    portalMessages:"Messages", portalProfile:"Profile", portalSocial:"Social",
    availabilityTitle:"Availability", availabilityHint:"Tap dates to toggle Available ↔ Blocked",
    myBookings:"My Bookings", messagesTitle:"Messages", myProfile:"My Profile",
    noBookingsYet:"No bookings yet. Add available dates!",
    noChatsYet:"Chats unlock after customers pay the deposit.",
    depositPaid:"Deposit ✓ Paid", depositPending:"✗ Pending",
    platformOverview:"Platform Overview", allBookings:"All Bookings", allArtists:"Artists",
    allConversations:"All Conversations", finance:"Finance",
    aboutTab:"About", instrumentsTab:"Instruments", socialTab:"Social",
    reviewsTab:"Reviews", policyTab:"Terms",
    howTitle:"Book in 6", howTitleEm:"simple steps",
    howSub:"From discovery to performance — the entire booking process is designed to be fast, safe, and completely transparent.",
    pricingTitle:"Simple Pricing", pricingSubtitle:"Transparent fees — no surprises, no hidden costs",
    forClients:"For Clients", forArtists:"For Artists",
    footerTagline:"The premier platform for booking verified Afghan artists across Europe.",
    footerCopyright:"© {year} Awaz AS · Oslo · Payments by Stripe",
    months:["January","February","March","April","May","June","July","August","September","October","November","December"],
    wdays:["Mo","Tu","We","Th","Fr","Sa","Su"],
    applyTitle:"Apply as Artist",
    monthlyListeners:"monthly listeners", subscribers:"subscribers", followers:"followers",
    chatLocked:"Locked — deposit required", chatActive:"Active",
    typeMessage:"Type a message…", depositRequired:"Deposit required",
    chatLockedTitle:"Chat Locked", chatLockedBody:"Pay the deposit to unlock messaging.",
    back:"← Back", from:"FROM", clearFilters:"Clear filters",
    noArtistsFound:"No artists found", tryDifferent:"Try a different genre or search term.",
    artistsCount:"{n} artist", artistsCountPlural:"{n} artists",
    howStep1Title:"Discover",
    howStep1Desc:"Browse verified artists by genre and location",
    howStep2Title:"Choose Date",
    howStep2Desc:"View live calendars — pick an open date",
    howStep3Title:"Pay Deposit",
    howStep3Desc:"Artist-set deposit via Stripe — secure payment",
    howStep4Title:"Chat Opens",
    howStep4Desc:"Direct messaging after payment",
    howStep5Title:"Enjoy",
    howStep5Desc:"Balance paid cash to artist after concert",
    howSectionTitle:"How It Works",
    howSectionSub:"Simple, transparent, secure from search to performance",
    footerDesc:"The premier platform for booking verified Afghan artists across Europe.",
    footerBrowse:"Browse",
    footerApply:"Apply",
    footerPricing:"Pricing",
    searchArtists:"Search artists…",
    bookDirectly:"Book directly — no agencies",
    chatLockedTitle2:"Chat Locked",
    chatLockedBody2:"Pay the deposit to unlock messaging.",
    securedByStripe:"Secured by Stripe",
    depositConfirmed2:"Deposit Confirmed!",
    continueToChat2:"Continue to Chat →",
    balanceCashNote2:"Balance paid cash to artist after concert",
    createYourAccount:"Create your account",
    emailSent2:"Email sent!",
    checkInbox2:"Check your inbox at",
    backToSignIn2:"Back to sign in",
    enterYourEmail2:"Enter your email and we will send you a reset link.",
    sendResetLink2:"Send reset link",
    demoNote2:"These are removed when you connect Supabase Auth.",
    bookingTerms:"Booking Terms",
    pricingByCountry:"Pricing by Country",
    pricesLocal:"Prices shown in local currency · Stripe deposit auto-converts to EUR",
    noSocialConnected:"No social accounts connected",
    noSocialDesc:"This artist hasn't linked Spotify or Instagram yet.",
    selectDate2:"Select a Date",
    cashAfterConcert:"Cash after concert",
    platformOverview2:"Platform Overview",
    recentBookings:"Recent Bookings",
    allBookings2:"All Bookings",
    allConversations2:"All Conversations",
    noMessages:"No messages",
    paymentSplit:"Payment Split",
    awazAdmin:"Awaz Admin",
    platformControl:"Platform Control",
    adminPanel:"Admin Panel",
    connectStripe:"Connect Stripe",
    addSocial:"Add Spotify & Instagram",
    addNow:"Add now →",
    noBookingsYet2:"No bookings yet. Add available dates!",
    tapToToggle:"Tap dates to toggle Available ↔ Blocked",
    myBookings2:"My Bookings",
    noBookingsYet3:"No bookings yet.",
    noChatsYet2:"Chats unlock after customers pay the deposit.",
    noMessagesYet:"No messages yet",
    socialMedia:"Social Media",
    myProfile2:"My Profile",
    tapToChange:"Tap to change photo",
    youReceive:"You receive",
    artistPortal:"Artist Portal",
    depositSplit:"Deposit Split",
    findPerfectArtist:"Find your perfect artist",
    startOver:"Start over",
    profileUnderReview:"Your profile is under review. Sign in to connect Stripe and complete verification.",
    submitApplication:"Submit Application",
    inquiryReceived:"Inquiry Received",
    privateInquiry:"Private Inquiry",
    directToOwner:"Book Afghan Artists",
    directToOwnerDesc:"Fixed prices · Direct booking · Fast response within 24h",
    budgetRange:"Budget Range",
    selectRange:"Select a range…",
    preferredArtist:"Preferred Artist (optional)",
    notSureYet:"Not sure yet — let the owner suggest",
    noInquiriesYet:"No inquiries yet",
    noInquiriesDesc:"Visitor inquiries appear here once the contact widget is live.",
    yourReply:"Your Reply (sent)",
    marketPricing:"Market Pricing",
    saveMarketPricing:"Save Market Pricing",
    connectingStripe:"Connecting to Stripe…",
    stripeSecurity:"Stripe Connect · Bank-level security · Instant payouts",
    loadingSpotify:"Loading Spotify…",
    spotifyBlocked:"Spotify widget blocked by browser",
    viewOnInstagram:"View on Instagram ↗",
    watchOnTikTok:"Watch on TikTok ↗",
    applyAsArtistTitle:"Apply as Artist",
    spotifyAppLabel:"Spotify app:",
    trustStripeDesc:"Bank-level encryption",
    trustVerifiedDesc:"Every profile reviewed",
    trustChatDesc:"No middlemen",
    trustFees:"0% Hidden Fees",
    trustFeesDesc:"What you see is what you pay",
    browseNow:"→ Browse Artists Now",
    escrowTitle:"Secure Escrow",
    escrowDesc:"Deposit held by Awaz until event confirmed",
    adminChat:"Chat",
    adminChatWith:"Chat with artist",
    verifyArtist:"Verify",
    verified2:"Verified ✓",
    pendingVerif:"Pending verification",
    refund:"Refund deposit",
    refundConfirm:"Refund confirmed to customer",
    addCountry:"Add country",
    yourPrice:"Your price",
    performHere:"I perform here",
    suspend:"Suspend",
    deposit2:"Deposit",
    balance:"Balance",
    messages2:"Messages",
    country:"Country",
    message:"Message",
    stripeLabel:"Stripe:",
    depositLabel2:"Deposit:",
    policyLabel:"Policy:",
    browserLabel:"Browser:",
    browserSpotifyDesc:"Go to your Spotify page → copy the URL from the address bar",
    pricingClient1:"Browse all artists for free",
    pricingClient2:"Pay artist-set deposit at booking",
    pricingClient3:"Chat directly after deposit",
    pricingClient4:"Balance paid cash to artist",
    pricingClient5:"Cancel per artist's policy",
    pricingArtist1:"List for free",
    pricingArtist2:"Set your own price",
    pricingArtist3:"Set your own deposit (min €500)",
    pricingArtist4:"Set your own cancellation policy",
    pricingArtist5:"Receive 88% of each deposit",
    pricingArtist6:"12% platform fee — nothing else",
    splitLabel1:"Artist deposit",
    splitDesc1:"Set by artist (min €500)",
    splitLabel2:"You receive (88%)",
    splitDesc2:"Auto-transferred to Stripe",
    splitLabel3:"Awaz fee (12%)",
    splitDesc3:"Platform operations",
    howBadge:"SIMPLE & TRANSPARENT",
    step1Title:"Find Your Perfect Artist",
    step1Desc:"Browse verified Afghan artists by genre, city, or occasion. Not sure where to start? Our AI matcher reads your event details and surfaces your top three — in seconds.",
    step1Badge:"Free to browse",
    step2Title:"Pick a Date — Instantly",
    step2Desc:"No back-and-forth emails. Every artist keeps their calendar live. Select any open date and the system reserves it for you in real time, preventing double-bookings automatically.",
    step2Badge:"Live availability",
    step3Title:"Confirm in Under 2 Minutes",
    step3Desc:"Enter your event type and contact details. The artist's cancellation policy is shown clearly before you commit — no surprises. One tap to send your request.",
    step3Badge:"Takes 2 minutes",
    step4Title:"Secure Your Booking via Stripe",
    step4Desc:"Pay the artist-set deposit (minimum €500) through Stripe — the same payment infrastructure used by Amazon and Shopify. Your card details are encrypted and never stored on our servers.",
    step4Badge:"Bank-level security",
    step5Title:"Chat Opens the Moment You Pay",
    step5Desc:"As soon as your deposit clears, a private direct-message channel unlocks between you and the artist. Coordinate every detail — setlist, arrival time, technical requirements — all in one place.",
    step5Badge:"Direct messaging",
    step6Title:"Show Up and Enjoy Everything",
    step6Desc:"The artist performs. You pay the remaining balance in cash, directly to the artist after the concert. No platform involved — transparent, fair, and direct.",
    step6Badge:"Cash payment",
    depositStripe:"Deposit (Stripe)",
    unverified:"Unverified",
    reinstate:"Reinstate",
    paymentModel:"PAYMENT MODEL",
    youllReceive:"You'll receive",
    onYourWay:"You're on your way!",
    areYouArtist:"Are you an artist?",
    buttonInstead:"button instead.",
    spotifyInstructions2:"Go to your profile → three dots (⋯) → Share → Copy link to artist",
    spotifyLinkRecognized:"Spotify link recognized",
    instagramRecognized:"Instagram profile recognized",
    howToFindLink:"How to find your link",
    spotifyInstructions:"Spotify app: Go to your profile → three dots (⋯) → Share → Copy link to artist",
    settings:"Settings",
    manageAccount:"Manage your account",
    editProfile:"Edit Profile",
    editPricing:"Edit Pricing",
    editSocial:"Social Media",
    editCalendar:"Calendar",
    accountStatus:"Account Status",
    visibility:"Visibility",
    profilePublished:"Profile published",
    profileLive:"Your profile is live.",
    completeProfile:"Complete your profile to go live.",
    profileVisibleToClients:"Your profile is visible to clients",
    pendingAdminApproval:"Waiting for admin approval",
    approved:"Approved",
    pendingApproval:"Pending Approval",
    connected:"Connected",
    notConnected:"Not connected",
    needHelp:"Need help? Contact us at",
    account:"Account",
    artistName:"Artist Name",
    help:"Help",
      artistProfileNotFound:"Artist Profile Not Found",
    noStripe:"No Stripe",
    recentBookingsLabel:"Recent Bookings",
    demoLiveDemo:"Live Demo",
    demoHeroTitle:"Experience Awaz as an Artist",
    demoHeroSub:"See exactly how artists use the platform — from profile to bookings, live song requests and earnings dashboard.",
    demoApplyBtn:"Apply as Artist →",
    demoBrowseBtn:"Browse Artists",
    demoOverviewTab:"Overview",
    demoProfileTab:"Profile",
    demoBookingTab:"Booking",
    demoDashboardTab:"Dashboard",
    demoSongTab:"Song Requests",
    demoPlatformOverview:"Platform Overview",
    demoPlatformSub:"Everything an artist gets when they join Awaz",
    demoSeeDemoProfile:"See Artist Profile Demo →",
    demoProfileTitle:"Artist Profile Page",
    demoProfileSub:"This is what customers see when they find your profile",
    demoLivePreview:"LIVE PREVIEW",
    demoBookingTitle:"Booking Flow",
    demoBookingSub:"How customers book and pay a deposit",
    demoDepositNow:"Deposit to pay now",
    demoPayBtn:"Pay Deposit →",
    demoConfirmed:"Booking Confirmed!",
    demoDashTitle:"Artist Dashboard",
    demoDashSub:"What the artist sees when they log in",
    demoUpcoming:"UPCOMING BOOKINGS",
    demoAllBookings:"ALL BOOKINGS",
    demoCalTitle:"AVAILABILITY",
    demoAvailable:"Available",
    demoBooked:"Booked",
    demoEarnings2025:"2025 EARNINGS",
    demoTotal2025:"Total 2025",
    demoSongTitle:"Song Request System",
    demoSongSub:"Guests scan your QR code at events — you see requests live",
    demoGuestSide:"GUEST EXPERIENCE",
    demoArtistSide:"ARTIST VIEW — LIVE REQUESTS",
    demoRequestSong:"Request a Song",
    demoSongTitleField:"Song Title *",
    demoYourName:"Your Name *",
    demoFreeRequest:"1st song tonight is FREE! 🎵",
    demoSendFree:"Send Free Request →",
    demoSentTitle:"Sent!",
    demoJoinTitle:"Ready to Join Awaz?",
    demoJoinSub:"Start receiving bookings from the Afghan diaspora across Europe. Free to apply — no subscription, no upfront cost.",
    demoJoinBtn:"Apply as Artist — It's Free →",
    demoFeat1Title:"Professional Profile",
    demoFeat1Desc:"Public-facing artist page with bio, instruments, social links, reviews and a booking calendar. Customers find you and book directly.",
    demoFeat2Title:"Direct Bookings",
    demoFeat2Desc:"Customers pay a deposit via Stripe. You receive 88% automatically. No invoicing, no chasing payments — it just works.",
    demoFeat3Title:"Built-in Messaging",
    demoFeat3Desc:"All communication happens on the platform after deposit payment. No WhatsApp, no email chains — clean and professional.",
    demoFeat4Title:"Live Song Requests",
    demoFeat4Desc:"During your event, guests scan your QR code to request songs and tip. You see requests live and manage them from your phone.",
    demoFeat5Title:"Earnings Dashboard",
    demoFeat5Desc:"Real-time overview of bookings, pending deposits, completed events and total earnings. Full transparency at all times.",
    demoFeat6Title:"Verified Reviews",
    demoFeat6Desc:"Only guests who actually booked you can leave reviews. Builds genuine credibility over time.",
    demoFeat7Title:"European Reach",
    demoFeat7Desc:"Reach the Afghan diaspora across Norway, Sweden, Germany, UK, France and beyond — one platform for all of Europe.",
    demoFeat8Title:"Instant Notifications",
    demoFeat8Desc:"Get notified the moment a booking comes in, a message arrives or a song is requested — browser push + in-app toasts.",
    demoFieldName:"Your Name",
    demoFieldEmail:"Email",
    demoFieldEventType:"Event Type",
    demoFieldDate:"Event Date",
    demoFieldDatePh:"e.g. 15 June 2025",
    demoFieldTypePh:"Wedding / Eid / Gala",
    demoTotalEarned:"Total Earned",
    demoThisYear:"This year",
    demoConfirmedLabel:"Confirmed",
    demoNewRequests:"New requests",
    demoRatingLabel:"reviews",
    demoPendingLabel:"pending",
    demoSeeSongReq:"See Song Requests →",
    demoSeeArtistDash:"See Artist Dashboard →",
    demoTryBooking:"Try Booking Flow →",
    demoNotified:"The artist receives a notification instantly.",
    demoDepositSecured:"deposit secured via Stripe.",
    demoArtistGets:"Artist gets",
    demoAwazKeeps:"Awaz keeps",
    demoSplitNote:"For every €1,000 deposit, you receive €880 (88%) directly to your Stripe account. Awaz keeps €120 (12%) as platform fee.",
    demoSongPh:"e.g. Leili Jan, Bya Ke Bya…",
    demoNamePh:"e.g. Layla, Ahmad…",

    applyWelcome:"Welcome to Awaz!",
    applyStep1Title:"Join Awaz — Step 1 of 2",
    applyStep2Title:"Almost done — Step 2 of 2",
    applyInEarning:"Artists on Awaz earn",
    applyKeep:"of every booking",
    applyFree:"to join",
    applyApproved:"to get approved",
    applyNextSteps:"What happens next",
    applyNext1:"Check your email and confirm your account",
    applyNext2:"Come back and click Sign In",
    applyNext3:"Complete your profile — add photo, bio, prices",
    applyNext4:"Get approved within 24 hours and start getting booked",
    applyProTip:"Artists with a complete profile get 3x more bookings. Complete yours right after signing in!",
    applySignInComplete:"Sign In & Complete Profile →",
    chatUnlocked:"Chat with the artist unlocks right away",
    availableIn:"Available In",
    performingCountriesDesc:"This artist performs in the following countries",
    completeProfileCta:"Complete your profile to get bookings",
    artistsLive:"Artists are getting booked across Europe right now",
    artistPerforms:"The artist comes and performs at your event",
    depositLabel:"deposit",
    // ── Band booking ──
    bandBookTitle:"How would you like to book?",
    bandBookSub:"Pick one — both are easy ✓",
    bandOptionAHeading:"⭐ Complete bands — book as a group",
    bandNoBands:"No complete bands yet",
    bandNoBandsDesc:"Artists who set up their own band will appear here. Use Build Your Own below to pick individual musicians.",
    bandBuildOwn:"Build your own",
    bandPickMusicians:"Pick Your Musicians",
    bandPickDesc:"Choose from real artists on the platform — only those who are actually available",
    bandDisplayPrices:"Display prices in",
    bandEasiest:"⭐ Easiest option",
    bandCompleteAs:"Complete ensemble — as chosen by",
    bandAvailableDate:"✓ is available on this date",
    bandNotAvailable:"may not be available on this date — contact them to confirm",
    bandStep1:"📅 Step 1 — Pick your event date",
    bandStep2Instr:"🎵 Step 2 — Which instruments do you want?",
    bandStep3Artists:"👤 Step 3 — Choose your artists",
    bandStep2Artists:"👤 Step 2 — Choose your artists",
    bandChooseWho:"Choose who plays",
    bandFreeSuffix:"free",
    bandBusySuffix:"(busy)",
    bandReviewPay:"Review & Pay →",
    bandBackEdit:"← Edit",
    bandTapInstruments:"Tap the instruments you need ↑",
    bandBusyWarning:"Some chosen artists are busy on this date — see suggestions below",
    bandSwitchTo:"Switch →",
    bandFreeLabel:"✓ Available",
    bandBusyLabel:"✗ Busy",
    bandTotalDeposit:"Total deposit",
    bandMusicianCount:"musicians",
    bandSecureNote:"Deposit paid securely via Stripe · Balance paid cash to artists after the event · No booking without successful payment",
    bandPayBtn:"Pay via Stripe →",
    bandConfirmTitle:"Confirm Your Band",
    bandReadyTitle:"Ready-made Band",
    // ── Solo vocalist ──
    soloOnlyNote:"This books the vocalist only — no instruments",
    soloNeedInstr:"Need tabla, keyboard or other musicians? Use 🎼 Book a Band to add them from the platform.",
    soloSidebarNote:"Vocalist only — no instruments.",
    soloSidebarTip:"Need tabla or keyboard? Use 🎼 Book a Band.",
    bookingTermsSoloNote:"Booking solo = singer only, no instruments",
    bookingTermsSoloDesc:"If you want tabla, keyboard or other musicians at your event, choose With Full Band above — or use Book a Band to add individual instrumentalists from the platform separately.",
    bookingTermsVocalistOnly:"This booking is for the vocalist only",
    bookingTermsVocalistOnlyDesc:"Need tabla, keyboard or other instruments? Use 🎼 Book a Band to add musicians from the platform to your event.",
    // ── My Band portal ──
    myBandTitle:"My Band",
    myBandDesc:"This is your primary group. You decide who's in it and how many members. Customers can book you as a complete ensemble — your configured band appears as Option A in the band booking flow.",
    myBandCurrentMembers:"Current Band Members",
    myBandAddMember:"Add a Band Member",
    myBandCombinedDeposit:"Combined deposit (you + band)",
    myBandSaveBtn:"Save Band Configuration",
    myBandSaved:"✓ Band Saved!",
    myBandTip:"💡 Your band configuration is shown on your public profile. Customers can see the full ensemble and book you as a group. The combined price is shown automatically.",
    myBandPrimary:"Primary",
    hasBand:"Has Band",
    inDemand:"In Demand",
    bookEarlySub:"Book early to secure your date",
    // ── Pricing how-it-works ──
    pricingHowTitle:"💡 How your pricing works",
    pricingDepositLabel:"Deposit",
    pricingDepositDesc:"Customers pay this upfront via Stripe to confirm the booking",
    pricingCountryLabel:"By country",
    pricingCountryDesc:"After signing up, you set your own full price per country in your dashboard",
    pricingAfterLabel:"After the event",
    pricingAfterDesc:"The remaining balance is paid in cash directly to you on the night",
    soloDepositLabel:"Solo deposit",
    soloDepositSub:"When you perform alone — singer only, no instruments · min €500",
    soloImportant:"Important: When customers book you solo, they get your voice only. If they want tabla, keyboard or other musicians, they must book a full band separately.",
    withBandDepositLabel:"With-band deposit",
    withBandDepositSub:"Upfront deposit when you bring your full band · min €800 · per country prices set in dashboard",
    keepPct:"You keep 88% of deposit =",
    balanceCashAfter:"+ balance paid cash after event",
  },

  no: {
    browseArtists:"Artister", howItWorks:"Slik fungerer det", pricing:"Priser",
    applyAsArtist:"Søk som artist", signIn:"Logg inn", signOut:"Logg ut",
    heroEyebrow:"Bestill afghanske artister direkte",
    heroLine1:"Bestill afghanske", heroLine2:"artister", heroLine2em:"direkte",
    heroBody:"Finn og bestill verifiserte afghanske artister — ghazal, rubab, folkemusikk og fusion — til ditt bryllup, Eid, kulturfest eller private sammenkomst.",
    searchPlaceholder:"Artist, sjanger eller by…", searchBtn:"Søk",
    trustVerified:"Verifiserte artister", trustStripe:"Stripe-betaling",
    trustChat:"Direkte chat", trustDeposits:"Depositum satt av artist", trustCulture:"Afghansk kultur",
    featuredTitle:"Fremhevede artister", featuredSub:"Verifisert · klar til å booke", seeAll:"Se alle →",
    aiTitle:"AI Artistmatch", aiFindBtn:"Finn min artist", aiEvent:"Arrangementtype", aiStyle:"Musikstil",
    openDates:"ledig", topBadge:"★ Topp", depositLabel:"depositum",
    available:"Ledig", booked:"Booket", blocked:"Blokkert",
    selectDate:"Velg en dato", continueWith:"Fortsett med", selectDateFirst:"Velg en dato først",
    bookNow:"Book nå", completeBooking:"Fullfør bestillingen",
    yourName:"Ditt navn", email:"E-post", phone:"Telefon",
    eventType:"Arrangementtype", eventPlaceholder:"Bryllup, Eid…",
    notes:"Notater (valgfritt)", notesPlaceholder:"Spesielle ønsker…",
    dateLabel:"Dato", depositAmount:"Depositum", balanceCash:"Kontant etter konsert",
    payViaStripe:"Betal €{n} via Stripe →", stripeNote:"🔒 Stripe · SSL · PCI-sertifisert",
    depositConfirmed:"Depositum bekreftet!", continueToChat:"Fortsett til chat →",
    balanceCashNote:"Saldo betales kontant til artisten etter konserten",
    signInToAwaz:"Logg inn på Awaz", welcomeBack:"Velkommen tilbake",
    password:"Passord", forgotPassword:"Glemt passord?",
    newHere:"Ny her?", createAccountLink:"Opprett konto",
    createAccount:"Opprett konto", alreadyHaveAccount:"Har du allerede en konto?",
    enterEmailPass:"Skriv inn e-post og passord.",
    wrongCredentials:"Feil innlogging. {n} forsøk igjen.",
    tooManyAttempts:"For mange forsøk. Vent 5 min.",
    resetPassword:"Tilbakestill passord", sendResetLink:"Send tilbakestillingslenke",
    enterYourEmail:"Skriv inn e-posten din, så sender vi en tilbakestillingslenke.",
    emailSent:"E-post sendt!", checkInbox:"Sjekk innboksen din på",
    forResetLink:"for en lenke til å tilbakestille passordet ditt.",
    backToSignIn:"Tilbake til innlogging", demoAccounts:"Demokontoer — kun for testing",
    demoNote:"Disse fjernes når du kobler til Supabase Auth.",
    fullName:"Fullt navn", atLeast8:"Minst 8 tegn",
    validEmailRequired:"Gyldig e-post kreves.", passwordMin8:"Passord må ha minst 8 tegn.",
    passwordsDontMatch:"Passordene stemmer ikke overens.", nameRequired:"Skriv inn navnet ditt.",
    portalHome:"Hjem", portalCalendar:"Kalender", portalBookings:"Bookinger",
    portalMessages:"Meldinger", portalProfile:"Profil", portalSocial:"Sosiale",
    availabilityTitle:"Tilgjengelighet", availabilityHint:"Trykk på datoer for å veksle Ledig ↔ Blokkert",
    myBookings:"Mine bookinger", messagesTitle:"Meldinger", myProfile:"Min profil",
    editProfile:"Rediger", cancelEdit:"Avbryt", saveProfile:"Lagre",
    noBookingsYet:"Ingen bookinger ennå. Legg til tilgjengelige datoer!",
    noChatsYet:"Chat låses opp når kundene betaler depositum.",
    depositPaid:"Depositum ✓ Betalt", depositPending:"✗ Venter",
    platformOverview:"Plattformoversikt", allBookings:"Alle bookinger", allArtists:"Artister",
    allConversations:"Alle samtaler", finance:"Økonomi",
    aboutTab:"Om", instrumentsTab:"Instrumenter", socialTab:"Sosiale",
    reviewsTab:"Anmeldelser", policyTab:"Vilkår",
    howTitle:"Bestill i 6", howTitleEm:"enkle trinn",
    howSub:"Fra oppdagelse til fremføring — hele bestillingsprosessen er rask, sikker og fullstendig transparent.",
    pricingTitle:"Enkle priser", pricingSubtitle:"Transparente avgifter — ingen overraskelser, ingen skjulte kostnader",
    forClients:"For kunder", forArtists:"For artister",
    footerTagline:"Den fremste plattformen for å booke verifiserte afghanske artister i Europa.",
    footerCopyright:"© {year} Awaz AS · Oslo · Betaling via Stripe",
    months:["Januar","Februar","Mars","April","Mai","Juni","Juli","August","September","Oktober","November","Desember"],
    wdays:["Ma","Ti","On","To","Fr","Lø","Sø"],
    applyTitle:"Søk som artist",
    monthlyListeners:"månedlige lyttere", subscribers:"abonnenter", followers:"følgere",
    chatLocked:"Låst — depositum kreves", chatActive:"Aktiv",
    typeMessage:"Skriv en melding…", depositRequired:"Depositum kreves",
    chatLockedTitle:"Chat låst", chatLockedBody:"Betal depositum for å låse opp meldinger.",
    back:"← Tilbake", from:"FRA", clearFilters:"Fjern filtre",
    noArtistsFound:"Ingen artister funnet", tryDifferent:"Prøv en annen sjanger eller søkeord.",
    artistsCount:"{n} artist", artistsCountPlural:"{n} artister",
    howStep1Title:"Utforsk",
    howStep1Desc:"Se verifiserte artister etter sjanger og sted",
    howStep2Title:"Velg dato",
    howStep2Desc:"Se live-kalendere — velg en ledig dato",
    howStep3Title:"Betal depositum",
    howStep3Desc:"Artistens depositum via Stripe — automatisk delt",
    howStep4Title:"Chat åpnes",
    howStep4Desc:"Direkte melding etter betaling",
    howStep5Title:"Nyt",
    howStep5Desc:"Saldo betales kontant til artisten etter konserten",
    howSectionTitle:"Slik fungerer det",
    howSectionSub:"Enkelt, transparent, sikkert fra søk til fremføring",
    footerDesc:"Den fremste plattformen for å booke verifiserte afghanske artister i Europa.",
    footerBrowse:"Utforsk",
    footerApply:"Søk",
    footerPricing:"Priser",
    searchArtists:"Søk artister…",
    bookDirectly:"Bestill direkte — ingen agenter",
    chatLockedTitle2:"Chat låst",
    chatLockedBody2:"Betal depositum for å åpne meldinger.",
    securedByStripe:"Sikret av Stripe",
    depositConfirmed2:"Depositum bekreftet!",
    continueToChat2:"Fortsett til chat →",
    balanceCashNote2:"Saldo betales kontant til artisten etter konserten",
    createYourAccount:"Opprett din konto",
    emailSent2:"E-post sendt!",
    checkInbox2:"Sjekk innboksen din på",
    backToSignIn2:"Tilbake til innlogging",
    enterYourEmail2:"Skriv inn e-posten din, så sender vi en tilbakestillingslenke.",
    sendResetLink2:"Send tilbakestillingslenke",
    demoNote2:"Disse fjernes når du kobler til Supabase Auth.",
    bookingTerms:"Bestillingsvilkår",
    pricingByCountry:"Priser per land",
    pricesLocal:"Priser vist i lokal valuta · Stripe-depositum konverteres automatisk til EUR",
    noSocialConnected:"Ingen sosiale kontoer koblet til",
    noSocialDesc:"Denne artisten har ikke koblet til Spotify eller Instagram ennå.",
    selectDate2:"Velg en dato",
    cashAfterConcert:"Kontant etter konsert",
    platformOverview2:"Plattformoversikt",
    recentBookings:"Siste bookinger",
    allBookings2:"Alle bookinger",
    allConversations2:"Alle samtaler",
    noMessages:"Ingen meldinger",
    paymentSplit:"Betalingsdeling",
    awazAdmin:"Awaz Admin",
    platformControl:"Plattformkontroll",
    adminPanel:"Adminpanel",
    pendingApproval:"Venter på godkjenning",
    connectStripe:"Koble til Stripe",
    addSocial:"Legg til Spotify og Instagram",
    addNow:"Legg til nå →",
    noBookingsYet2:"Ingen bookinger ennå. Legg til tilgjengelige datoer!",
    tapToToggle:"Trykk på datoer for å veksle Ledig ↔ Blokkert",
    myBookings2:"Mine bookinger",
    noBookingsYet3:"Ingen bookinger ennå.",
    noChatsYet2:"Chat låses opp når kundene betaler depositum.",
    noMessagesYet:"Ingen meldinger ennå",
    socialMedia:"Sosiale medier",
    myProfile2:"Min profil",
    tapToChange:"Trykk for å endre bilde",
    notConnected:"Ikke tilkoblet",
    youReceive:"Du mottar",
    artistPortal:"Artistportal",
    depositSplit:"Depositum-deling",
    findPerfectArtist:"Finn din perfekte artist",
    startOver:"Start på nytt",
    profileUnderReview:"Profilen din er under vurdering. Logg inn for å koble til Stripe og fullføre verifisering.",
    submitApplication:"Send søknad",
    inquiryReceived:"Forespørsel mottatt",
    privateInquiry:"Privat forespørsel",
    directToOwner:"Direkte til eier",
    directToOwnerDesc:"Personlig svar · Prisforhandling · Skreddersydde pakker",
    budgetRange:"Budsjettramme",
    selectRange:"Velg en ramme…",
    preferredArtist:"Foretrukket artist (valgfritt)",
    notSureYet:"Ikke sikker ennå — la eieren foreslå",
    noInquiriesYet:"Ingen forespørsler ennå",
    noInquiriesDesc:"Besøkendes forespørsler vises her når kontaktwidgeten er aktiv.",
    yourReply:"Ditt svar (sendt)",
    marketPricing:"Markedspriser",
    saveMarketPricing:"Lagre markedspriser",
    connectingStripe:"Kobler til Stripe…",
    stripeSecurity:"Stripe Connect · Banknivå sikkerhet · Umiddelbare utbetalinger",
    loadingSpotify:"Laster Spotify…",
    spotifyBlocked:"Spotify-widget blokkert av nettleser",
    viewOnInstagram:"Se på Instagram ↗",
    watchOnTikTok:"Se på TikTok ↗",
    applyAsArtistTitle:"Søk som artist",
    spotifyAppLabel:"Spotify-appen:",
    trustStripeDesc:"Kryptering på banknivå",
    trustVerifiedDesc:"Alle profiler gjennomgått",
    trustChatDesc:"Ingen mellomledd",
    trustFees:"0% Skjulte avgifter",
    trustFeesDesc:"Du betaler det du ser",
    browseNow:"→ Se artister nå",
    escrowTitle:"Sikker depositum",
    escrowDesc:"Depositum holdes av Awaz til arrangementet er bekreftet",
    adminChat:"Chat",
    adminChatWith:"Chat med artist",
    verifyArtist:"Verifiser",
    verified2:"Verifisert ✓",
    pendingVerif:"Venter på verifisering",
    refund:"Refunder depositum",
    refundConfirm:"Refusjon bekreftet til kunde",
    addCountry:"Legg til land",
    yourPrice:"Din pris",
    performHere:"Jeg opptrer her",
    suspend:"Suspender",
    deposit2:"Depositum",
    balance:"Saldo",
    messages2:"Meldinger",
    country:"Land",
    message:"Melding",
    stripeLabel:"Stripe:",
    depositLabel2:"Depositum:",
    policyLabel:"Policy:",
    browserLabel:"Nettleser:",
    browserSpotifyDesc:"Gå til Spotify-siden din → kopier URL fra adresselinjen",
    pricingClient1:"Se alle artister gratis",
    pricingClient2:"Betal artistens depositum ved bestilling",
    pricingClient3:"Chat direkte etter depositum",
    pricingClient4:"Saldo betales kontant til artisten",
    pricingClient5:"Avbestill etter artistens policy",
    pricingArtist1:"List deg gratis",
    pricingArtist2:"Sett din egen pris",
    pricingArtist3:"Sett eget depositum (min €500)",
    pricingArtist4:"Sett din avbestillingspolicy",
    pricingArtist5:"Motta 88% av hvert depositum",
    pricingArtist6:"12% plattformgebyr — ingenting annet",
    splitLabel1:"Artistens depositum",
    splitDesc1:"Satt av artist (min €500)",
    splitLabel2:"Du mottar (88%)",
    splitDesc2:"Automatisk overført til Stripe",
    splitLabel3:"Awaz-gebyr (12%)",
    splitDesc3:"Plattformdrift",
    howBadge:"ENKELT OG TRANSPARENT",
    step1Title:"Finn din perfekte artist",
    step1Desc:"Bla gjennom verifiserte afghanske artister etter sjanger, by eller anledning. Ikke sikker på hvor du skal starte? Vår AI-matcher leser arrangementdetaljene dine og finner dine tre beste — på sekunder.",
    step1Badge:"Gratis å bla",
    step2Title:"Velg en dato — umiddelbart",
    step2Desc:"Ingen e-poster frem og tilbake. Hver artist holder sin kalender live. Velg en ledig dato og systemet reserverer den for deg i sanntid.",
    step2Badge:"Live tilgjengelighet",
    step3Title:"Bekreft på under 2 minutter",
    step3Desc:"Skriv inn arrangementtype og kontaktdetaljer. Artistens avbestillingspolicy vises tydelig — ingen overraskelser. Ett trykk for å sende forespørselen.",
    step3Badge:"Tar 2 minutter",
    step4Title:"Sikre bestillingen via Stripe",
    step4Desc:"Betal det artistbestemte depositum (minimum €500) gjennom Stripe — den samme betalingsinfrastrukturen som Amazon og Shopify bruker.",
    step4Badge:"Banksikerhet",
    step5Title:"Chat åpnes øyeblikket du betaler",
    step5Desc:"Så snart depositum er godkjent, åpnes en privat meldingskanal mellom deg og artisten. Koordiner alle detaljer på ett sted.",
    step5Badge:"Direkte meldinger",
    step6Title:"Møt opp og nyt alt",
    step6Desc:"Artisten opptrer. Du betaler restbeløpet kontant, direkte til artisten etter konserten.",
    step6Badge:"Kontantbetaling",
    depositStripe:"Depositum (Stripe)",
    unverified:"Uverifisert",
    reinstate:"Gjenopprett",
    paymentModel:"BETALINGSMODELL",
    connected:"Tilkoblet!",
    youllReceive:"Du vil motta",
    onYourWay:"Du er på vei!",
    areYouArtist:"Er du en artist?",
    buttonInstead:"knappen i stedet.",
    spotifyInstructions2:"Gå til profil → tre prikker (⋯) → Del → Kopier lenke",
    spotifyLinkRecognized:"Spotify-lenke gjenkjent",
    instagramRecognized:"Instagram-profil gjenkjent",
    howToFindLink:"Slik finner du lenken",
    spotifyInstructions:"Spotify-appen: Gå til profil → tre prikker (⋯) → Del → Kopier lenke til artist",
    artistProfileNotFound:"Artistprofil ikke funnet",
    noStripe:"Ingen Stripe",
    recentBookingsLabel:"Siste bookinger",
    demoLiveDemo:"Live Demo",
    demoHeroTitle:"Opplev Awaz som artist",
    demoHeroSub:"Se nøyaktig hvordan artister bruker plattformen — fra profil til bookinger, live sangønsker og inntektsdashboard.",
    demoApplyBtn:"Søk som artist →",
    demoBrowseBtn:"Bla gjennom artister",
    demoOverviewTab:"Oversikt",
    demoProfileTab:"Profil",
    demoBookingTab:"Booking",
    demoDashboardTab:"Dashboard",
    demoSongTab:"Sangønsker",
    demoPlatformOverview:"Plattformoversikt",
    demoPlatformSub:"Alt en artist får når de blir med i Awaz",
    demoSeeDemoProfile:"Se artist-profil demo →",
    demoProfileTitle:"Artistprofilside",
    demoProfileSub:"Dette ser kunder når de finner profilen din",
    demoLivePreview:"LIVE FORHÅNDSVISNING",
    demoBookingTitle:"Bookingflyt",
    demoBookingSub:"Hvordan kunder booker og betaler depositum",
    demoDepositNow:"Depositum å betale nå",
    demoPayBtn:"Betal depositum →",
    demoConfirmed:"Booking bekreftet!",
    demoDashTitle:"Artistdashboard",
    demoDashSub:"Hva artisten ser når de logger inn",
    demoUpcoming:"KOMMENDE BOOKINGER",
    demoAllBookings:"ALLE BOOKINGER",
    demoCalTitle:"TILGJENGELIGHET",
    demoAvailable:"Ledig",
    demoBooked:"Booket",
    demoEarnings2025:"INNTEKTER 2025",
    demoTotal2025:"Total 2025",
    demoSongTitle:"Sangønskesystem",
    demoSongSub:"Gjester skanner QR-koden din på arrangementer — du ser ønsker live",
    demoGuestSide:"GJESTENS OPPLEVELSE",
    demoArtistSide:"ARTISTVISNING — LIVE FORESPØRSLER",
    demoRequestSong:"Be om en sang",
    demoSongTitleField:"Sangtittel *",
    demoYourName:"Ditt navn *",
    demoFreeRequest:"Første sang i kveld er GRATIS! 🎵",
    demoSendFree:"Send gratis forespørsel →",
    demoSentTitle:"Sendt!",
    demoJoinTitle:"Klar for å bli med i Awaz?",
    demoJoinSub:"Begynn å motta bookinger fra den afghanske diasporaen i Europa. Gratis å søke — ingen abonnement, ingen forhåndskostnader.",
    demoJoinBtn:"Søk som artist — gratis →",
    demoFeat1Title:"Profesjonell profil",
    demoFeat1Desc:"Offentlig artistside med bio, instrumenter, sosiale lenker, anmeldelser og bookingkalender. Kunder finner deg og booker direkte.",
    demoFeat2Title:"Direkte bookinger",
    demoFeat2Desc:"Kunder betaler depositum via Stripe. Du mottar 88% automatisk. Ingen fakturering, ingen jaging av betalinger — det bare fungerer.",
    demoFeat3Title:"Innebygd meldinger",
    demoFeat3Desc:"All kommunikasjon skjer på plattformen etter depositumbetaling. Ingen WhatsApp, ingen e-postkjeder — rent og profesjonelt.",
    demoFeat4Title:"Live sangønsker",
    demoFeat4Desc:"Under arrangementet skanner gjestene QR-koden din for å be om sanger og gi tips. Du ser ønsker live og administrerer dem fra telefonen.",
    demoFeat5Title:"Inntektsdashboard",
    demoFeat5Desc:"Sanntidsoversikt over bookinger, ventende depositum, fullførte arrangementer og total inntekt. Full åpenhet til enhver tid.",
    demoFeat6Title:"Verifiserte anmeldelser",
    demoFeat6Desc:"Bare gjester som faktisk har booket deg kan legge igjen anmeldelser. Bygger ekte troverdighet over tid.",
    demoFeat7Title:"Europeisk rekkevidde",
    demoFeat7Desc:"Nå den afghanske diasporaen i Norge, Sverige, Tyskland, Storbritannia, Frankrike og videre — én plattform for hele Europa.",
    demoFeat8Title:"Øyeblikkelige varsler",
    demoFeat8Desc:"Bli varslet i det øyeblikket en booking kommer inn, en melding ankommer eller en sang ønskes — nettleserpush + in-app-toast.",
    demoFieldName:"Ditt navn",
    demoFieldEmail:"E-post",
    demoFieldEventType:"Arrangementstype",
    demoFieldDate:"Arrangementsdato",
    demoFieldDatePh:"f.eks. 15. juni 2025",
    demoFieldTypePh:"Bryllup / Eid / Gala",
    demoTotalEarned:"Total inntjent",
    demoThisYear:"I år",
    demoConfirmedLabel:"Bekreftet",
    demoNewRequests:"Nye forespørsler",
    demoRatingLabel:"anmeldelser",
    demoPendingLabel:"venter",
    demoSeeSongReq:"Se sangønsker →",
    demoSeeArtistDash:"Se artistdashboard →",
    demoTryBooking:"Prøv bookingflyt →",
    demoNotified:"Artisten mottar et varsel øyeblikkelig.",
    demoDepositSecured:"depositum sikret via Stripe.",
    demoArtistGets:"Artist mottar",
    demoAwazKeeps:"Awaz beholder",
    demoSplitNote:"For hvert €1 000-depositum mottar du €880 (88%) direkte til din Stripe-konto. Awaz beholder €120 (12%) som plattformgebyr.",
    demoSongPh:"f.eks. Leili Jan, Bya Ke Bya…",
    demoNamePh:"f.eks. Layla, Ahmad…",

    applyWelcome:"Velkommen til Awaz!",
    applyStep1Title:"Bli med på Awaz — Steg 1 av 2",
    applyStep2Title:"Nesten ferdig — Steg 2 av 2",
    applyInEarning:"Artister på Awaz tjener",
    applyKeep:"av hver bestilling",
    applyFree:"å bli med",
    applyApproved:"for å bli godkjent",
    applyNextSteps:"Hva skjer videre",
    applyNext1:"Sjekk e-posten din og bekreft kontoen",
    applyNext2:"Kom tilbake og klikk Logg inn",
    applyNext3:"Fullfør profilen din — legg til bilde, bio og priser",
    applyNext4:"Bli godkjent innen 24 timer og begynn å få bestillinger",
    applyProTip:"Artister med en komplett profil får 3x flere bestillinger. Fullfør din rett etter innlogging!",
    applySignInComplete:"Logg inn og fullfør profil →",
    chatUnlocked:"Chat med artisten åpnes med én gang",
    availableIn:"Tilgjengelig i",
    performingCountriesDesc:"Denne artisten opptrer i følgende land",
    completeProfileCta:"Fullfør profilen din for å få bestillinger",
    artistsLive:"Artister bli bestilt i hele Europa akkurat nå",
    artistPerforms:"Artisten kommer og opptrer på arrangementet ditt",
    depositLabel:"depositum",
    bandBookTitle:"Hvordan vil du bestille?",
    bandBookSub:"Velg ett — begge er enkle ✓",
    bandOptionAHeading:"⭐ Komplette band — bestill som gruppe",
    bandNoBands:"Ingen fullstendige band ennå",
    bandNoBandsDesc:"Artister som setter opp sitt eget band vil vises her. Bruk Bygg ditt eget nedenfor for å velge individuelle musikere.",
    bandBuildOwn:"Bygg ditt eget",
    bandPickMusicians:"Velg dine musikere",
    bandPickDesc:"Velg fra ekte artister på plattformen — bare de som faktisk er tilgjengelige",
    bandDisplayPrices:"Vis priser i",
    bandEasiest:"⭐ Enkleste valg",
    bandCompleteAs:"Komplett ensemble — satt sammen av",
    bandAvailableDate:"✓ er tilgjengelig på denne datoen",
    bandNotAvailable:"er kanskje ikke tilgjengelig på denne datoen — kontakt dem for bekreftelse",
    bandStep1:"📅 Steg 1 — Velg dato for arrangementet",
    bandStep2Instr:"🎵 Steg 2 — Hvilke instrumenter ønsker du?",
    bandStep3Artists:"👤 Steg 3 — Velg dine artister",
    bandStep2Artists:"👤 Steg 2 — Velg dine artister",
    bandChooseWho:"Velg hvem som spiller",
    bandFreeSuffix:"ledig",
    bandBusySuffix:"(opptatt)",
    bandReviewPay:"Se gjennom og betal →",
    bandBackEdit:"← Endre",
    bandTapInstruments:"Trykk på instrumentene du trenger ↑",
    bandBusyWarning:"Noen valgte artister er opptatt på denne datoen — se forslag nedenfor",
    bandSwitchTo:"Bytt →",
    bandFreeLabel:"✓ Ledig",
    bandBusyLabel:"✗ Opptatt",
    bandTotalDeposit:"Totalt depositum",
    bandMusicianCount:"musikere",
    bandSecureNote:"Depositum betales sikkert via Stripe · Restbeløp betales kontant til artistene etter arrangementet · Ingen bestilling uten vellykket betaling",
    bandPayBtn:"Betal via Stripe →",
    bandConfirmTitle:"Bekreft bandet ditt",
    bandReadyTitle:"Ferdig sammensatt band",
    soloOnlyNote:"Dette bestiller kun vokalisten — ingen instrumenter",
    soloNeedInstr:"Trenger du tabla, keyboard eller andre musikere? Bruk 🎼 Bestill band for å legge dem til fra plattformen.",
    soloSidebarNote:"Kun vokalist — ingen instrumenter.",
    soloSidebarTip:"Trenger du tabla eller keyboard? Bruk 🎼 Bestill band.",
    bookingTermsSoloNote:"Bestille solo = kun sanger, ingen instrumenter",
    bookingTermsSoloDesc:"Hvis du vil ha tabla, keyboard eller andre musikere på arrangementet, velg Med fullt band ovenfor — eller bruk Bestill band for å legge til instrumentalister fra plattformen.",
    bookingTermsVocalistOnly:"Denne bestillingen er kun for vokalisten",
    bookingTermsVocalistOnlyDesc:"Trenger du tabla, keyboard eller andre instrumenter? Bruk 🎼 Bestill band for å legge til musikere fra plattformen.",
    myBandTitle:"Mitt band",
    myBandDesc:"Dette er din primære gruppe. Du bestemmer hvem som er med og hvor mange. Kunder kan bestille deg som et komplett ensemble — ditt konfigurerte band vises som Alternativ A i band-bookingflyten.",
    myBandCurrentMembers:"Nåværende bandmedlemmer",
    myBandAddMember:"Legg til et bandmedlem",
    myBandCombinedDeposit:"Samlet depositum (deg + band)",
    myBandSaveBtn:"Lagre bandkonfigurasjon",
    myBandSaved:"✓ Band lagret!",
    myBandTip:"💡 Din bandkonfigurasjon vises på din offentlige profil. Kunder kan se hele ensemblet og bestille deg som gruppe.",
    myBandPrimary:"Primær",
    hasBand:"Har band",
    inDemand:"Etterspurt",
    bookEarlySub:"Bestill tidlig for å sikre datoen din",
    pricingHowTitle:"💡 Slik fungerer prisene dine",
    pricingDepositLabel:"Depositum",
    pricingDepositDesc:"Kunder betaler dette på forhånd via Stripe for å bekrefte bestillingen",
    pricingCountryLabel:"Per land",
    pricingCountryDesc:"Etter registrering setter du dine egne fullpriser per land i dashbordet",
    pricingAfterLabel:"Etter arrangementet",
    pricingAfterDesc:"Restbeløpet betales kontant direkte til deg på kvelden",
    soloDepositLabel:"Solo-depositum",
    soloDepositSub:"Når du opptrer alene — kun sanger, ingen instrumenter · min €500",
    soloImportant:"Viktig: Når kunder bestiller deg solo, får de kun stemmen din. Hvis de ønsker tabla, keyboard eller andre musikere, må de bestille et fullt band separat.",
    withBandDepositLabel:"Med-band depositum",
    withBandDepositSub:"Forhåndsdeposit når du tar med ditt fulle band · min €800 · priser per land settes i dashbordet",
    keepPct:"Du beholder 88 % av depositumet =",
    balanceCashAfter:"+ restbeløp betales kontant etter arrangementet",
  },

  de: {
    browseArtists:"Künstler", howItWorks:"So funktioniert es", pricing:"Preise",
    applyAsArtist:"Als Künstler bewerben", signIn:"Anmelden", signOut:"Abmelden",
    heroEyebrow:"Afghanische Künstler direkt buchen",
    heroLine1:"Afghanische", heroLine2:"Künstler", heroLine2em:"direkt buchen",
    heroBody:"Entdecke und buche verifizierte afghanische Künstler — Ghazal, Rubab, Folk und Fusion — für deine Hochzeit, Eid, Kulturveranstaltung oder private Feier.",
    searchPlaceholder:"Künstler, Genre oder Stadt…", searchBtn:"Suchen",
    trustVerified:"Verifizierte Künstler", trustStripe:"Stripe-Zahlung",
    trustChat:"Direktchat", trustDeposits:"Anzahlung vom Künstler", trustCulture:"Afghanische Kultur",
    featuredTitle:"Empfohlene Künstler", featuredSub:"Verifiziert · buchungsbereit", seeAll:"Alle anzeigen →",
    aiTitle:"KI-Künstler-Matching", aiFindBtn:"Meinen Künstler finden", aiEvent:"Veranstaltungsart", aiStyle:"Musikstil",
    openDates:"frei", topBadge:"★ Top", depositLabel:"Anzahlung",
    available:"Verfügbar", booked:"Gebucht", blocked:"Gesperrt",
    selectDate:"Datum auswählen", continueWith:"Weiter mit", selectDateFirst:"Zuerst ein Datum wählen",
    bookNow:"Jetzt buchen", completeBooking:"Buchung abschließen",
    yourName:"Ihr Name", email:"E-Mail", phone:"Telefon",
    eventType:"Veranstaltungsart", eventPlaceholder:"Hochzeit, Eid…",
    notes:"Notizen (optional)", notesPlaceholder:"Besondere Wünsche…",
    dateLabel:"Datum", depositAmount:"Anzahlung", balanceCash:"Rest bar bezahlen",
    payViaStripe:"€{n} via Stripe zahlen →", stripeNote:"🔒 Stripe · SSL · PCI-zertifiziert",
    depositConfirmed:"Anzahlung bestätigt!", continueToChat:"Weiter zum Chat →",
    balanceCashNote:"Restbetrag wird nach dem Konzert bar an den Künstler gezahlt",
    signInToAwaz:"Bei Awaz anmelden", welcomeBack:"Willkommen zurück",
    password:"Passwort", forgotPassword:"Passwort vergessen?",
    newHere:"Neu hier?", createAccountLink:"Konto erstellen",
    createAccount:"Konto erstellen", alreadyHaveAccount:"Schon ein Konto?",
    enterEmailPass:"E-Mail und Passwort eingeben.",
    wrongCredentials:"Falsche Anmeldedaten. {n} Versuche übrig.",
    tooManyAttempts:"Zu viele Versuche. 5 Minuten warten.",
    resetPassword:"Passwort zurücksetzen", sendResetLink:"Zurücksetze-Link senden",
    enterYourEmail:"Gib deine E-Mail ein und wir senden dir einen Link.",
    emailSent:"E-Mail gesendet!", checkInbox:"Überprüfe deinen Posteingang bei",
    forResetLink:"für einen Link zum Zurücksetzen deines Passworts.",
    backToSignIn:"Zurück zur Anmeldung", demoAccounts:"Demokonten — nur zum Testen",
    demoNote:"Diese werden entfernt, wenn du Supabase Auth verbindest.",
    fullName:"Vollständiger Name", atLeast8:"Mindestens 8 Zeichen",
    validEmailRequired:"Gültige E-Mail erforderlich.", passwordMin8:"Passwort muss mindestens 8 Zeichen haben.",
    passwordsDontMatch:"Passwörter stimmen nicht überein.", nameRequired:"Gib deinen Namen ein.",
    portalHome:"Start", portalCalendar:"Kalender", portalBookings:"Buchungen",
    portalMessages:"Nachrichten", portalProfile:"Profil", portalSocial:"Social Media",
    availabilityTitle:"Verfügbarkeit", availabilityHint:"Tippe auf Daten um Verfügbar ↔ Gesperrt umzuschalten",
    myBookings:"Meine Buchungen", messagesTitle:"Nachrichten", myProfile:"Mein Profil",
    editProfile:"Bearbeiten", cancelEdit:"Abbrechen", saveProfile:"Speichern",
    noBookingsYet:"Noch keine Buchungen. Füge verfügbare Daten hinzu!",
    noChatsYet:"Chats werden nach Anzahlung freigeschaltet.",
    depositPaid:"Anzahlung ✓ Bezahlt", depositPending:"✗ Ausstehend",
    platformOverview:"Plattformübersicht", allBookings:"Alle Buchungen", allArtists:"Künstler",
    allConversations:"Alle Gespräche", finance:"Finanzen",
    aboutTab:"Über", instrumentsTab:"Instrumente", socialTab:"Soziales",
    reviewsTab:"Bewertungen", policyTab:"Bedingungen",
    howTitle:"In 6 einfachen", howTitleEm:"Schritten buchen",
    howSub:"Von der Entdeckung bis zur Aufführung — der gesamte Buchungsprozess ist schnell, sicher und völlig transparent.",
    pricingTitle:"Einfache Preise", pricingSubtitle:"Transparente Gebühren — keine Überraschungen, keine versteckten Kosten",
    forClients:"Für Kunden", forArtists:"Für Künstler",
    footerTagline:"Die führende Plattform für die Buchung verifizierter afghanischer Künstler in Europa.",
    footerCopyright:"© {year} Awaz AS · Oslo · Zahlungen über Stripe",
    months:["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"],
    wdays:["Mo","Di","Mi","Do","Fr","Sa","So"],
    applyTitle:"Als Künstler bewerben",
    monthlyListeners:"monatliche Hörer", subscribers:"Abonnenten", followers:"Follower",
    chatLocked:"Gesperrt — Anzahlung erforderlich", chatActive:"Aktiv",
    typeMessage:"Nachricht eingeben…", depositRequired:"Anzahlung erforderlich",
    chatLockedTitle:"Chat gesperrt", chatLockedBody:"Zahle die Anzahlung, um Nachrichten freizuschalten.",
    back:"← Zurück", from:"AB", clearFilters:"Filter löschen",
    noArtistsFound:"Keine Künstler gefunden", tryDifferent:"Versuche ein anderes Genre oder Suchbegriff.",
    artistsCount:"{n} Künstler", artistsCountPlural:"{n} Künstler",
    howStep1Title:"Entdecken",
    howStep1Desc:"Verifizierte Künstler nach Genre und Ort durchsuchen",
    howStep2Title:"Datum wählen",
    howStep2Desc:"Live-Kalender anzeigen — freies Datum wählen",
    howStep3Title:"Anzahlung bezahlen",
    howStep3Desc:"Künstler-Anzahlung via Stripe — automatisch aufgeteilt",
    howStep4Title:"Chat öffnet sich",
    howStep4Desc:"Direktnachrichten nach Zahlung",
    howStep5Title:"Genießen",
    howStep5Desc:"Restbetrag bar nach dem Konzert bezahlt",
    howSectionTitle:"So funktioniert es",
    howSectionSub:"Einfach, transparent, sicher von der Suche bis zur Aufführung",
    footerDesc:"Die führende Plattform für die Buchung verifizierter afghanischer Künstler in Europa.",
    footerBrowse:"Entdecken",
    footerApply:"Bewerben",
    footerPricing:"Preise",
    searchArtists:"Künstler suchen…",
    bookDirectly:"Direkt buchen — keine Agenturen",
    chatLockedTitle2:"Chat gesperrt",
    chatLockedBody2:"Zahle die Anzahlung um Nachrichten freizuschalten.",
    securedByStripe:"Gesichert von Stripe",
    depositConfirmed2:"Anzahlung bestätigt!",
    continueToChat2:"Weiter zum Chat →",
    balanceCashNote2:"Restbetrag bar nach dem Konzert bezahlt",
    createYourAccount:"Konto erstellen",
    emailSent2:"E-Mail gesendet!",
    checkInbox2:"Überprüfe deinen Posteingang bei",
    backToSignIn2:"Zurück zur Anmeldung",
    enterYourEmail2:"Gib deine E-Mail ein und wir senden dir einen Reset-Link.",
    sendResetLink2:"Reset-Link senden",
    demoNote2:"Diese werden entfernt, wenn du Supabase Auth verbindest.",
    bookingTerms:"Buchungsbedingungen",
    pricingByCountry:"Preise nach Land",
    pricesLocal:"Preise in Landeswährung · Stripe-Anzahlung wird automatisch in EUR umgerechnet",
    noSocialConnected:"Keine sozialen Konten verbunden",
    noSocialDesc:"Dieser Künstler hat noch kein Spotify oder Instagram verknüpft.",
    selectDate2:"Datum auswählen",
    cashAfterConcert:"Bargeld nach dem Konzert",
    platformOverview2:"Plattformübersicht",
    recentBookings:"Aktuelle Buchungen",
    allBookings2:"Alle Buchungen",
    allConversations2:"Alle Gespräche",
    noMessages:"Keine Nachrichten",
    paymentSplit:"Zahlungsaufteilung",
    awazAdmin:"Awaz Admin",
    platformControl:"Plattformsteuerung",
    adminPanel:"Adminbereich",
    pendingApproval:"Genehmigung ausstehend",
    connectStripe:"Stripe verbinden",
    addSocial:"Spotify & Instagram hinzufügen",
    addNow:"Jetzt hinzufügen →",
    noBookingsYet2:"Noch keine Buchungen. Füge verfügbare Daten hinzu!",
    tapToToggle:"Tippe auf Daten um Verfügbar ↔ Gesperrt umzuschalten",
    myBookings2:"Meine Buchungen",
    noBookingsYet3:"Noch keine Buchungen.",
    noChatsYet2:"Chats werden nach Anzahlung freigeschaltet.",
    noMessagesYet:"Noch keine Nachrichten",
    socialMedia:"Soziale Medien",
    myProfile2:"Mein Profil",
    tapToChange:"Tippe zum Ändern des Fotos",
    notConnected:"Nicht verbunden",
    youReceive:"Du erhältst",
    artistPortal:"Künstlerportal",
    depositSplit:"Anzahlungsaufteilung",
    findPerfectArtist:"Finden Sie Ihren perfekten Künstler",
    startOver:"Von vorne beginnen",
    profileUnderReview:"Ihr Profil wird überprüft. Melden Sie sich an, um Stripe zu verbinden und die Verifizierung abzuschließen.",
    submitApplication:"Bewerbung einreichen",
    inquiryReceived:"Anfrage erhalten",
    privateInquiry:"Private Anfrage",
    directToOwner:"Direkt an den Inhaber",
    directToOwnerDesc:"Persönliche Antwort · Preisverhandlung · Maßgeschneiderte Pakete",
    budgetRange:"Budgetrahmen",
    selectRange:"Bereich auswählen…",
    preferredArtist:"Bevorzugter Künstler (optional)",
    notSureYet:"Noch nicht sicher — den Inhaber vorschlagen lassen",
    noInquiriesYet:"Noch keine Anfragen",
    noInquiriesDesc:"Besucheranfragen erscheinen hier, sobald das Kontakt-Widget live ist.",
    yourReply:"Ihre Antwort (gesendet)",
    marketPricing:"Marktpreise",
    saveMarketPricing:"Marktpreise speichern",
    connectingStripe:"Verbinde mit Stripe…",
    stripeSecurity:"Stripe Connect · Banksicherheit · Sofortige Auszahlungen",
    loadingSpotify:"Spotify wird geladen…",
    spotifyBlocked:"Spotify-Widget vom Browser blockiert",
    viewOnInstagram:"Auf Instagram ansehen ↗",
    watchOnTikTok:"Auf TikTok ansehen ↗",
    applyAsArtistTitle:"Als Künstler bewerben",
    spotifyAppLabel:"Spotify-App:",
    trustStripeDesc:"Banksicherheitsverschlüsselung",
    trustVerifiedDesc:"Alle Profile geprüft",
    trustChatDesc:"Keine Mittelsmänner",
    trustFees:"0% Versteckte Gebühren",
    trustFeesDesc:"Was du siehst, ist was du zahlst",
    browseNow:"→ Künstler jetzt entdecken",
    escrowTitle:"Sichere Treuhand",
    escrowDesc:"Anzahlung wird von Awaz bis zur Veranstaltungsbestätigung gehalten",
    adminChat:"Chat",
    adminChatWith:"Mit Künstler chatten",
    verifyArtist:"Verifizieren",
    verified2:"Verifiziert ✓",
    pendingVerif:"Verifizierung ausstehend",
    refund:"Anzahlung zurückerstatten",
    refundConfirm:"Rückerstattung an Kunden bestätigt",
    addCountry:"Land hinzufügen",
    yourPrice:"Ihr Preis",
    performHere:"Ich trete hier auf",
    suspend:"Sperren",
    deposit2:"Anzahlung",
    balance:"Restbetrag",
    messages2:"Nachrichten",
    country:"Land",
    message:"Nachricht",
    stripeLabel:"Stripe:",
    depositLabel2:"Anzahlung:",
    policyLabel:"Richtlinie:",
    browserLabel:"Browser:",
    browserSpotifyDesc:"Gehe zu deiner Spotify-Seite → kopiere die URL aus der Adressleiste",
    pricingClient1:"Alle Künstler kostenlos durchsuchen",
    pricingClient2:"Künstler-Anzahlung bei Buchung zahlen",
    pricingClient3:"Direkt nach Anzahlung chatten",
    pricingClient4:"Restbetrag bar an den Künstler",
    pricingClient5:"Stornierung gemäß Künstler-Policy",
    pricingArtist1:"Kostenlos listen",
    pricingArtist2:"Eigenen Preis festlegen",
    pricingArtist3:"Eigene Anzahlung festlegen (min €500)",
    pricingArtist4:"Eigene Stornierungsrichtlinie festlegen",
    pricingArtist5:"88% jeder Anzahlung erhalten",
    pricingArtist6:"12% Plattformgebühr — sonst nichts",
    splitLabel1:"Künstler-Anzahlung",
    splitDesc1:"Vom Künstler festgelegt (min €500)",
    splitLabel2:"Sie erhalten (88%)",
    splitDesc2:"Automatisch zu Stripe überwiesen",
    splitLabel3:"Awaz-Gebühr (12%)",
    splitDesc3:"Plattformbetrieb",
    howBadge:"EINFACH & TRANSPARENT",
    step1Title:"Finden Sie Ihren perfekten Künstler",
    step1Desc:"Durchsuche verifizierte afghanische Künstler nach Genre, Stadt oder Anlass. Nicht sicher, wo du anfangen sollst? Unser KI-Matcher liest deine Veranstaltungsdetails und zeigt dir deine Top drei — in Sekunden.",
    step1Badge:"Kostenlos durchsuchen",
    step2Title:"Datum wählen — sofort",
    step2Desc:"Keine E-Mails hin und her. Jeder Künstler hält seinen Kalender live. Wähle ein freies Datum und das System reserviert es in Echtzeit.",
    step2Badge:"Live-Verfügbarkeit",
    step3Title:"In unter 2 Minuten bestätigen",
    step3Desc:"Gib deinen Veranstaltungstyp und Kontaktdaten ein. Die Stornierungsrichtlinie des Künstlers ist klar sichtbar — keine Überraschungen.",
    step3Badge:"Dauert 2 Minuten",
    step4Title:"Buchung über Stripe absichern",
    step4Desc:"Zahle die Künstler-Anzahlung (mindestens €500) über Stripe — dieselbe Zahlungsinfrastruktur wie Amazon und Shopify.",
    step4Badge:"Bankensicherheit",
    step5Title:"Chat öffnet sich sofort nach Zahlung",
    step5Desc:"Sobald deine Anzahlung bestätigt ist, öffnet sich ein privater Nachrichtenkanal. Koordiniere alle Details an einem Ort.",
    step5Badge:"Direktnachrichten",
    step6Title:"Erscheinen und alles genießen",
    step6Desc:"Der Künstler tritt auf. Du zahlst den Restbetrag bar direkt nach dem Konzert.",
    step6Badge:"Barzahlung",
    depositStripe:"Anzahlung (Stripe)",
    unverified:"Nicht verifiziert",
    reinstate:"Wiederherstellen",
    paymentModel:"ZAHLUNGSMODELL",
    connected:"Verbunden!",
    youllReceive:"Sie werden erhalten",
    onYourWay:"Sie sind auf dem Weg!",
    areYouArtist:"Sind Sie ein Künstler?",
    buttonInstead:"Schaltfläche stattdessen.",
    spotifyInstructions2:"Profil → drei Punkte (⋯) → Teilen → Link kopieren",
    spotifyLinkRecognized:"Spotify-Link erkannt",
    instagramRecognized:"Instagram-Profil erkannt",
    howToFindLink:"So findest du deinen Link",
    spotifyInstructions:"Spotify-App: Profil → drei Punkte (⋯) → Teilen → Link zum Künstler kopieren",
    artistProfileNotFound:"Künstlerprofil nicht gefunden",
    noStripe:"Kein Stripe",
    recentBookingsLabel:"Aktuelle Buchungen",
    demoLiveDemo:"Live Demo",
    demoHeroTitle:"Erleben Sie Awaz als Künstler",
    demoHeroSub:"Sehen Sie genau, wie Künstler die Plattform nutzen — von Profil bis Buchungen, Live-Musikwünsche und Einnahmen.",
    demoApplyBtn:"Als Künstler bewerben →",
    demoBrowseBtn:"Künstler durchsuchen",
    demoOverviewTab:"Übersicht",
    demoProfileTab:"Profil",
    demoBookingTab:"Buchung",
    demoDashboardTab:"Dashboard",
    demoSongTab:"Musikwünsche",
    demoPlatformOverview:"Plattformübersicht",
    demoPlatformSub:"Alles, was ein Künstler bei Awaz bekommt",
    demoSeeDemoProfile:"Künstlerprofil-Demo ansehen →",
    demoProfileTitle:"Künstlerprofilseite",
    demoProfileSub:"Das sehen Kunden, wenn sie Ihr Profil finden",
    demoLivePreview:"LIVE-VORSCHAU",
    demoBookingTitle:"Buchungsablauf",
    demoBookingSub:"Wie Kunden buchen und eine Anzahlung leisten",
    demoDepositNow:"Jetzt zu zahlende Anzahlung",
    demoPayBtn:"Anzahlung zahlen →",
    demoConfirmed:"Buchung bestätigt!",
    demoDashTitle:"Künstler-Dashboard",
    demoDashSub:"Was der Künstler beim Einloggen sieht",
    demoUpcoming:"KOMMENDE BUCHUNGEN",
    demoAllBookings:"ALLE BUCHUNGEN",
    demoCalTitle:"VERFÜGBARKEIT",
    demoAvailable:"Verfügbar",
    demoBooked:"Gebucht",
    demoEarnings2025:"EINNAHMEN 2025",
    demoTotal2025:"Gesamt 2025",
    demoSongTitle:"Musikwunschsystem",
    demoSongSub:"Gäste scannen Ihren QR-Code — Sie sehen Wünsche live",
    demoGuestSide:"GÄSTE-ERLEBNIS",
    demoArtistSide:"KÜNSTLERANSICHT — LIVE-ANFRAGEN",
    demoRequestSong:"Song wünschen",
    demoSongTitleField:"Songtitel *",
    demoYourName:"Ihr Name *",
    demoFreeRequest:"Erster Song heute Abend KOSTENLOS! 🎵",
    demoSendFree:"Kostenlose Anfrage senden →",
    demoSentTitle:"Gesendet!",
    demoJoinTitle:"Bereit, Awaz beizutreten?",
    demoJoinSub:"Beginnen Sie, Buchungen von der afghanischen Diaspora in Europa zu erhalten. Kostenlos bewerben.",
    demoJoinBtn:"Als Künstler bewerben — kostenlos →",
    demoFeat1Title:"Professionelles Profil",
    demoFeat1Desc:"Öffentliche Künstlerseite mit Bio, Instrumenten, Social Links, Bewertungen und Buchungskalender. Kunden finden Sie und buchen direkt.",
    demoFeat2Title:"Direkte Buchungen",
    demoFeat2Desc:"Kunden zahlen eine Anzahlung via Stripe. Sie erhalten automatisch 88%. Keine Rechnungsstellung, kein Nachjagen von Zahlungen.",
    demoFeat3Title:"Integriertes Messaging",
    demoFeat3Desc:"Alle Kommunikation findet nach der Anzahlung auf der Plattform statt. Kein WhatsApp, keine E-Mail-Ketten — sauber und professionell.",
    demoFeat4Title:"Live-Musikwünsche",
    demoFeat4Desc:"Bei Ihrer Veranstaltung scannen Gäste Ihren QR-Code, um Songs zu wünschen und Trinkgeld zu geben. Sie sehen Wünsche live.",
    demoFeat5Title:"Einnahmen-Dashboard",
    demoFeat5Desc:"Echtzeit-Übersicht über Buchungen, ausstehende Anzahlungen, abgeschlossene Events und Gesamteinnahmen.",
    demoFeat6Title:"Verifizierte Bewertungen",
    demoFeat6Desc:"Nur Gäste, die Sie tatsächlich gebucht haben, können Bewertungen hinterlassen. Baut echte Glaubwürdigkeit auf.",
    demoFeat7Title:"Europäische Reichweite",
    demoFeat7Desc:"Erreichen Sie die afghanische Diaspora in Norwegen, Schweden, Deutschland, UK, Frankreich und darüber hinaus.",
    demoFeat8Title:"Sofortige Benachrichtigungen",
    demoFeat8Desc:"Werden Sie benachrichtigt, sobald eine Buchung eingeht, eine Nachricht ankommt oder ein Song gewünscht wird.",
    demoFieldName:"Ihr Name",
    demoFieldEmail:"E-Mail",
    demoFieldEventType:"Veranstaltungsart",
    demoFieldDate:"Veranstaltungsdatum",
    demoFieldDatePh:"z.B. 15. Juni 2025",
    demoFieldTypePh:"Hochzeit / Eid / Gala",
    demoTotalEarned:"Gesamtverdienst",
    demoThisYear:"Dieses Jahr",
    demoConfirmedLabel:"Bestätigt",
    demoNewRequests:"Neue Anfragen",
    demoRatingLabel:"Bewertungen",
    demoPendingLabel:"ausstehend",
    demoSeeSongReq:"Musikwünsche ansehen →",
    demoSeeArtistDash:"Künstler-Dashboard →",
    demoTryBooking:"Buchungsablauf testen →",
    demoNotified:"Der Künstler erhält sofort eine Benachrichtigung.",
    demoDepositSecured:"Anzahlung gesichert via Stripe.",
    demoArtistGets:"Künstler erhält",
    demoAwazKeeps:"Awaz behält",
    demoSplitNote:"Bei jeder €1.000-Anzahlung erhalten Sie €880 (88%) direkt auf Ihr Stripe-Konto. Awaz behält €120 (12%) als Plattformgebühr.",
    demoSongPh:"z.B. Leili Jan, Bya Ke Bya…",
    demoNamePh:"z.B. Layla, Ahmad…",

    applyWelcome:"Willkommen bei Awaz!",
    applyStep1Title:"Awaz beitreten — Schritt 1 von 2",
    applyStep2Title:"Fast fertig — Schritt 2 von 2",
    applyInEarning:"Künstler auf Awaz verdienen",
    applyKeep:"jeder Buchung",
    applyFree:"beitreten",
    applyApproved:"bis zur Genehmigung",
    applyNextSteps:"Was passiert als nächstes",
    applyNext1:"E-Mail prüfen und Konto bestätigen",
    applyNext2:"Zurückkommen und auf Anmelden klicken",
    applyNext3:"Profil vervollständigen — Foto, Bio, Preise hinzufügen",
    applyNext4:"Innerhalb von 24 Stunden genehmigt werden und Buchungen erhalten",
    applyProTip:"Künstler mit vollständigem Profil erhalten 3x mehr Buchungen. Vervollständige deins gleich nach der Anmeldung!",
    applySignInComplete:"Anmelden & Profil vervollständigen →",
    chatUnlocked:"Chat mit dem Künstler wird sofort freigeschaltet",
    availableIn:"Verfügbar in",
    performingCountriesDesc:"Dieser Künstler tritt in folgenden Ländern auf",
    completeProfileCta:"Vervollständige dein Profil für Buchungen",
    artistsLive:"Künstler werden gerade in ganz Europa gebucht",
    artistPerforms:"Der Künstler kommt und tritt bei Ihrer Veranstaltung auf",
    depositLabel:"Anzahlung",
    bandBookTitle:"Wie möchten Sie buchen?",
    bandBookSub:"Wählen Sie eine — beide sind einfach ✓",
    bandOptionAHeading:"⭐ Komplette Bands — als Gruppe buchen",
    bandNoBands:"Noch keine vollständigen Bands",
    bandNoBandsDesc:"Künstler, die ihre eigene Band einrichten, erscheinen hier. Verwenden Sie 'Eigene erstellen' unten, um einzelne Musiker auszuwählen.",
    bandBuildOwn:"Eigene erstellen",
    bandPickMusicians:"Musiker wählen",
    bandPickDesc:"Wählen Sie aus echten Künstlern auf der Plattform — nur die, die tatsächlich verfügbar sind",
    bandDisplayPrices:"Preise anzeigen in",
    bandEasiest:"⭐ Einfachste Option",
    bandCompleteAs:"Komplettes Ensemble — zusammengestellt von",
    bandAvailableDate:"✓ ist an diesem Datum verfügbar",
    bandNotAvailable:"ist an diesem Datum möglicherweise nicht verfügbar — kontaktieren Sie ihn/sie zur Bestätigung",
    bandStep1:"📅 Schritt 1 — Wählen Sie das Datum",
    bandStep2Instr:"🎵 Schritt 2 — Welche Instrumente möchten Sie?",
    bandStep3Artists:"👤 Schritt 3 — Künstler wählen",
    bandStep2Artists:"👤 Schritt 2 — Künstler wählen",
    bandChooseWho:"Wählen Sie, wer spielt",
    bandFreeSuffix:"verfügbar",
    bandBusySuffix:"(besetzt)",
    bandReviewPay:"Überprüfen & Bezahlen →",
    bandBackEdit:"← Bearbeiten",
    bandTapInstruments:"Tippen Sie auf die benötigten Instrumente ↑",
    bandBusyWarning:"Einige gewählte Künstler sind an diesem Datum besetzt — Alternativen unten",
    bandSwitchTo:"Wechseln →",
    bandFreeLabel:"✓ Verfügbar",
    bandBusyLabel:"✗ Besetzt",
    bandTotalDeposit:"Gesamtanzahlung",
    bandMusicianCount:"Musiker",
    bandSecureNote:"Anzahlung sicher via Stripe · Restbetrag bar an Künstler nach Veranstaltung · Keine Buchung ohne erfolgreiche Zahlung",
    bandPayBtn:"Bezahlen via Stripe →",
    bandConfirmTitle:"Band bestätigen",
    bandReadyTitle:"Fertige Band",
    soloOnlyNote:"Dies bucht nur den Vokalisten — keine Instrumente",
    soloNeedInstr:"Benötigen Sie Tabla, Keyboard oder andere Musiker? Verwenden Sie 🎼 Band buchen.",
    soloSidebarNote:"Nur Vokaliste — keine Instrumente.",
    soloSidebarTip:"Tabla oder Keyboard gewünscht? Nutzen Sie 🎼 Band buchen.",
    bookingTermsSoloNote:"Solo buchen = nur Sänger/in, keine Instrumente",
    bookingTermsSoloDesc:"Wenn Sie Tabla, Keyboard oder andere Musiker möchten, wählen Sie 'Mit voller Band' oder nutzen Sie Band buchen.",
    bookingTermsVocalistOnly:"Diese Buchung ist nur für den Vokalisten",
    bookingTermsVocalistOnlyDesc:"Benötigen Sie Tabla, Keyboard oder andere Instrumente? Verwenden Sie 🎼 Band buchen.",
    myBandTitle:"Meine Band",
    myBandDesc:"Das ist Ihre Hauptgruppe. Sie entscheiden, wer dabei ist und wie viele Mitglieder. Kunden können Sie als komplettes Ensemble buchen — Ihre konfigurierte Band erscheint als Option A.",
    myBandCurrentMembers:"Aktuelle Bandmitglieder",
    myBandAddMember:"Bandmitglied hinzufügen",
    myBandCombinedDeposit:"Gesamtanzahlung (Sie + Band)",
    myBandSaveBtn:"Bandkonfiguration speichern",
    myBandSaved:"✓ Band gespeichert!",
    myBandTip:"💡 Ihre Bandkonfiguration wird auf Ihrem öffentlichen Profil angezeigt.",
    myBandPrimary:"Primär",
    hasBand:"Hat Band",
    inDemand:"Sehr gefragt",
    bookEarlySub:"Früh buchen, um Ihren Termin zu sichern",
    pricingHowTitle:"💡 So funktioniert Ihre Preisgestaltung",
    pricingDepositLabel:"Anzahlung",
    pricingDepositDesc:"Kunden zahlen dies im Voraus via Stripe, um die Buchung zu bestätigen",
    pricingCountryLabel:"Je nach Land",
    pricingCountryDesc:"Nach der Registrierung legen Sie Ihre eigenen Preise pro Land im Dashboard fest",
    pricingAfterLabel:"Nach der Veranstaltung",
    pricingAfterDesc:"Der Restbetrag wird direkt an Sie in bar bezahlt",
    soloDepositLabel:"Solo-Anzahlung",
    soloDepositSub:"Wenn Sie allein auftreten — nur Sänger/in, keine Instrumente · min €500",
    soloImportant:"Wichtig: Bei einer Solo-Buchung erhalten die Kunden nur Ihre Stimme. Für Tabla, Keyboard usw. muss eine Band separat gebucht werden.",
    withBandDepositLabel:"Mit-Band-Anzahlung",
    withBandDepositSub:"Vorauszahlung wenn Sie mit Ihrer vollen Band auftreten · min €800",
    keepPct:"Sie behalten 88% der Anzahlung =",
    balanceCashAfter:"+ Restbetrag bar nach der Veranstaltung",
  },

  fr: {
    browseArtists:"Artistes", howItWorks:"Comment ça marche", pricing:"Tarifs",
    applyAsArtist:"Devenir artiste", signIn:"Connexion", signOut:"Déconnexion",
    heroEyebrow:"Réservez des artistes afghans directement",
    heroLine1:"Réservez des artistes", heroLine2:"afghans", heroLine2em:"directement",
    heroBody:"Découvrez et réservez des artistes afghans vérifiés — ghazal, rubab, folk et fusion — pour votre mariage, Aïd, événement culturel ou rassemblement privé.",
    searchPlaceholder:"Artiste, genre ou ville…", searchBtn:"Rechercher",
    trustVerified:"Artistes vérifiés", trustStripe:"Paiement Stripe",
    trustChat:"Chat direct", trustDeposits:"Acompte fixé par l'artiste", trustCulture:"Culture afghane",
    featuredTitle:"Artistes à la une", featuredSub:"Vérifiés · prêts à réserver", seeAll:"Voir tout →",
    aiTitle:"Correspondance IA", aiFindBtn:"Trouver mon artiste", aiEvent:"Type d'événement", aiStyle:"Style musical",
    openDates:"libre", topBadge:"★ Top", depositLabel:"acompte",
    available:"Disponible", booked:"Réservé", blocked:"Bloqué",
    selectDate:"Choisir une date", continueWith:"Continuer avec", selectDateFirst:"Choisissez d'abord une date",
    bookNow:"Réserver", completeBooking:"Finaliser la réservation",
    yourName:"Votre nom", email:"E-mail", phone:"Téléphone",
    eventType:"Type d'événement", eventPlaceholder:"Mariage, Aïd…",
    notes:"Notes (optionnel)", notesPlaceholder:"Demandes spéciales…",
    dateLabel:"Date", depositAmount:"Acompte", balanceCash:"Solde en espèces",
    payViaStripe:"Payer €{n} via Stripe →", stripeNote:"🔒 Stripe · SSL · PCI certifié",
    depositConfirmed:"Acompte confirmé !", continueToChat:"Continuer vers le chat →",
    balanceCashNote:"Solde payé en espèces à l'artiste après le concert",
    signInToAwaz:"Connexion à Awaz", welcomeBack:"Bon retour",
    password:"Mot de passe", forgotPassword:"Mot de passe oublié ?",
    newHere:"Nouveau ici ?", createAccountLink:"Créer un compte",
    createAccount:"Créer un compte", alreadyHaveAccount:"Déjà un compte ?",
    enterEmailPass:"Entrez l'e-mail et le mot de passe.",
    wrongCredentials:"Mauvaises informations. {n} tentatives restantes.",
    tooManyAttempts:"Trop de tentatives. Attendez 5 min.",
    resetPassword:"Réinitialiser le mot de passe", sendResetLink:"Envoyer le lien de réinitialisation",
    enterYourEmail:"Entrez votre e-mail et nous vous enverrons un lien.",
    emailSent:"E-mail envoyé !", checkInbox:"Vérifiez votre boîte de réception à",
    forResetLink:"pour un lien de réinitialisation.",
    backToSignIn:"Retour à la connexion", demoAccounts:"Comptes démo — tests uniquement",
    demoNote:"Ceux-ci sont supprimés lorsque vous connectez Supabase Auth.",
    fullName:"Nom complet", atLeast8:"Au moins 8 caractères",
    validEmailRequired:"E-mail valide requis.", passwordMin8:"Le mot de passe doit comporter au moins 8 caractères.",
    passwordsDontMatch:"Les mots de passe ne correspondent pas.", nameRequired:"Entrez votre nom.",
    portalHome:"Accueil", portalCalendar:"Calendrier", portalBookings:"Réservations",
    portalMessages:"Messages", portalProfile:"Profil", portalSocial:"Réseaux sociaux",
    availabilityTitle:"Disponibilité", availabilityHint:"Appuyez sur les dates pour basculer Disponible ↔ Bloqué",
    myBookings:"Mes réservations", messagesTitle:"Messages", myProfile:"Mon profil",
    editProfile:"Modifier", cancelEdit:"Annuler", saveProfile:"Enregistrer",
    noBookingsYet:"Pas encore de réservations. Ajoutez des dates disponibles !",
    noChatsYet:"Les chats se débloquent après le paiement de l'acompte.",
    depositPaid:"Acompte ✓ Payé", depositPending:"✗ En attente",
    platformOverview:"Vue d'ensemble", allBookings:"Toutes les réservations", allArtists:"Artistes",
    allConversations:"Toutes les conversations", finance:"Finance",
    aboutTab:"À propos", instrumentsTab:"Instruments", socialTab:"Social",
    reviewsTab:"Avis", policyTab:"Conditions",
    howTitle:"Réservez en 6", howTitleEm:"étapes simples",
    howSub:"De la découverte à la performance — tout le processus de réservation est rapide, sécurisé et totalement transparent.",
    pricingTitle:"Tarification simple", pricingSubtitle:"Frais transparents — pas de surprises ni de frais cachés",
    forClients:"Pour les clients", forArtists:"Pour les artistes",
    footerTagline:"La première plateforme de réservation d'artistes afghans vérifiés en Europe.",
    footerCopyright:"© {year} Awaz AS · Oslo · Paiements par Stripe",
    months:["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],
    wdays:["Lu","Ma","Me","Je","Ve","Sa","Di"],
    applyTitle:"Devenir artiste",
    monthlyListeners:"auditeurs mensuels", subscribers:"abonnés", followers:"abonnés",
    chatLocked:"Verrouillé — acompte requis", chatActive:"Actif",
    typeMessage:"Écrire un message…", depositRequired:"Acompte requis",
    chatLockedTitle:"Chat verrouillé", chatLockedBody:"Payez l'acompte pour débloquer la messagerie.",
    back:"← Retour", from:"DÈS", clearFilters:"Effacer les filtres",
    noArtistsFound:"Aucun artiste trouvé", tryDifferent:"Essayez un autre genre ou terme de recherche.",
    artistsCount:"{n} artiste", artistsCountPlural:"{n} artistes",
    howStep1Title:"Découvrir",
    howStep1Desc:"Parcourez les artistes vérifiés par genre et lieu",
    howStep2Title:"Choisir une date",
    howStep2Desc:"Consultez les calendriers en direct — choisissez une date",
    howStep3Title:"Payer l'acompte",
    howStep3Desc:"Acompte fixé par l'artiste via Stripe — partage automatique",
    howStep4Title:"Chat débloqué",
    howStep4Desc:"Messagerie directe après le paiement",
    howStep5Title:"Profiter",
    howStep5Desc:"Solde payé en espèces après le concert",
    howSectionTitle:"Comment ça marche",
    howSectionSub:"Simple, transparent, sécurisé de la recherche à la performance",
    footerDesc:"La première plateforme de réservation d'artistes afghans vérifiés en Europe.",
    footerBrowse:"Parcourir",
    footerApply:"Postuler",
    footerPricing:"Tarifs",
    searchArtists:"Rechercher des artistes…",
    bookDirectly:"Réservez directement — sans agences",
    chatLockedTitle2:"Chat verrouillé",
    chatLockedBody2:"Payez l'acompte pour débloquer la messagerie.",
    securedByStripe:"Sécurisé par Stripe",
    depositConfirmed2:"Acompte confirmé !",
    continueToChat2:"Continuer vers le chat →",
    balanceCashNote2:"Solde payé en espèces après le concert",
    createYourAccount:"Créer votre compte",
    emailSent2:"E-mail envoyé !",
    checkInbox2:"Vérifiez votre boîte de réception à",
    backToSignIn2:"Retour à la connexion",
    enterYourEmail2:"Entrez votre e-mail et nous vous enverrons un lien de réinitialisation.",
    sendResetLink2:"Envoyer le lien de réinitialisation",
    demoNote2:"Ceux-ci sont supprimés lorsque vous connectez Supabase Auth.",
    bookingTerms:"Conditions de réservation",
    pricingByCountry:"Tarifs par pays",
    pricesLocal:"Prix en devise locale · L'acompte Stripe est automatiquement converti en EUR",
    noSocialConnected:"Aucun compte social connecté",
    noSocialDesc:"Cet artiste n'a pas encore lié Spotify ou Instagram.",
    selectDate2:"Sélectionner une date",
    cashAfterConcert:"Espèces après le concert",
    platformOverview2:"Vue d'ensemble",
    recentBookings:"Réservations récentes",
    allBookings2:"Toutes les réservations",
    allConversations2:"Toutes les conversations",
    noMessages:"Pas de messages",
    paymentSplit:"Répartition du paiement",
    awazAdmin:"Awaz Admin",
    platformControl:"Contrôle de la plateforme",
    adminPanel:"Panneau admin",
    pendingApproval:"En attente d'approbation",
    connectStripe:"Connecter Stripe",
    addSocial:"Ajouter Spotify & Instagram",
    addNow:"Ajouter maintenant →",
    noBookingsYet2:"Pas encore de réservations. Ajoutez des dates disponibles !",
    tapToToggle:"Appuyez sur les dates pour basculer Disponible ↔ Bloqué",
    myBookings2:"Mes réservations",
    noBookingsYet3:"Pas encore de réservations.",
    noChatsYet2:"Les chats se débloquent après le paiement de l'acompte.",
    noMessagesYet:"Pas encore de messages",
    socialMedia:"Réseaux sociaux",
    myProfile2:"Mon profil",
    tapToChange:"Appuyer pour changer la photo",
    notConnected:"Non connecté",
    youReceive:"Vous recevez",
    artistPortal:"Portail artiste",
    depositSplit:"Répartition de l'acompte",
    findPerfectArtist:"Trouvez votre artiste parfait",
    startOver:"Recommencer",
    profileUnderReview:"Votre profil est en cours d'examen. Connectez-vous pour relier Stripe et finaliser la vérification.",
    submitApplication:"Soumettre la candidature",
    inquiryReceived:"Demande reçue",
    privateInquiry:"Demande privée",
    directToOwner:"Directement au propriétaire",
    directToOwnerDesc:"Réponse personnelle · Négociation de prix · Forfaits sur mesure",
    budgetRange:"Fourchette budgétaire",
    selectRange:"Sélectionner une fourchette…",
    preferredArtist:"Artiste préféré (facultatif)",
    notSureYet:"Pas encore sûr — laisser le propriétaire suggérer",
    noInquiriesYet:"Pas encore de demandes",
    noInquiriesDesc:"Les demandes des visiteurs apparaissent ici lorsque le widget de contact est en ligne.",
    yourReply:"Votre réponse (envoyée)",
    marketPricing:"Tarifs du marché",
    saveMarketPricing:"Enregistrer les tarifs",
    connectingStripe:"Connexion à Stripe…",
    stripeSecurity:"Stripe Connect · Sécurité bancaire · Versements instantanés",
    loadingSpotify:"Chargement Spotify…",
    spotifyBlocked:"Widget Spotify bloqué par le navigateur",
    viewOnInstagram:"Voir sur Instagram ↗",
    watchOnTikTok:"Voir sur TikTok ↗",
    applyAsArtistTitle:"Devenir artiste",
    spotifyAppLabel:"Application Spotify :",
    trustStripeDesc:"Chiffrement niveau bancaire",
    trustVerifiedDesc:"Chaque profil vérifié",
    trustChatDesc:"Sans intermédiaires",
    trustFees:"0% Frais cachés",
    trustFeesDesc:"Vous payez ce que vous voyez",
    browseNow:"→ Voir les artistes",
    escrowTitle:"Paiement sécurisé",
    escrowDesc:"L'acompte est conservé par Awaz jusqu'à la confirmation",
    adminChat:"Chat",
    adminChatWith:"Chatter avec l'artiste",
    verifyArtist:"Vérifier",
    verified2:"Vérifié ✓",
    pendingVerif:"Vérification en attente",
    refund:"Rembourser l'acompte",
    refundConfirm:"Remboursement confirmé au client",
    addCountry:"Ajouter un pays",
    yourPrice:"Votre prix",
    performHere:"Je me produis ici",
    suspend:"Suspendre",
    deposit2:"Acompte",
    balance:"Solde",
    messages2:"Messages",
    country:"Pays",
    message:"Message",
    stripeLabel:"Stripe :",
    depositLabel2:"Acompte :",
    policyLabel:"Politique :",
    browserLabel:"Navigateur :",
    browserSpotifyDesc:"Allez sur votre page Spotify → copiez l'URL depuis la barre d'adresse",
    pricingClient1:"Parcourir tous les artistes gratuitement",
    pricingClient2:"Payer l'acompte de l'artiste à la réservation",
    pricingClient3:"Chatter directement après l'acompte",
    pricingClient4:"Solde payé en espèces à l'artiste",
    pricingClient5:"Annuler selon la politique de l'artiste",
    pricingArtist1:"Inscription gratuite",
    pricingArtist2:"Fixez votre propre prix",
    pricingArtist3:"Fixez votre propre acompte (min €500)",
    pricingArtist4:"Fixez votre propre politique d'annulation",
    pricingArtist5:"Recevoir 88% de chaque acompte",
    pricingArtist6:"12% de frais de plateforme — rien d'autre",
    splitLabel1:"Acompte artiste",
    splitDesc1:"Fixé par l'artiste (min €500)",
    splitLabel2:"Vous recevez (88%)",
    splitDesc2:"Transféré automatiquement vers Stripe",
    splitLabel3:"Frais Awaz (12%)",
    splitDesc3:"Opérations de la plateforme",
    howBadge:"SIMPLE & TRANSPARENT",
    step1Title:"Trouvez votre artiste parfait",
    step1Desc:"Parcourez les artistes afghans vérifiés par genre, ville ou occasion. Pas sûr par où commencer ? Notre IA lit les détails de votre événement et vous présente vos trois meilleurs — en quelques secondes.",
    step1Badge:"Gratuit à parcourir",
    step2Title:"Choisir une date — instantanément",
    step2Desc:"Pas d'e-mails dans tous les sens. Chaque artiste maintient son calendrier en direct. Sélectionnez une date libre et le système la réserve en temps réel.",
    step2Badge:"Disponibilité en direct",
    step3Title:"Confirmer en moins de 2 minutes",
    step3Desc:"Entrez le type d'événement et vos coordonnées. La politique d'annulation de l'artiste est clairement affichée — aucune surprise.",
    step3Badge:"Prend 2 minutes",
    step4Title:"Sécurisez votre réservation via Stripe",
    step4Desc:"Payez l'acompte défini par l'artiste (minimum €500) via Stripe — la même infrastructure que Amazon et Shopify.",
    step4Badge:"Sécurité bancaire",
    step5Title:"Le chat s'ouvre dès que vous payez",
    step5Desc:"Dès que votre acompte est validé, un canal de messagerie privé s'ouvre. Coordonnez tous les détails en un seul endroit.",
    step5Badge:"Messagerie directe",
    step6Title:"Arrivez et profitez de tout",
    step6Desc:"L'artiste se produit. Vous payez le solde restant en espèces directement à l'artiste après le concert.",
    step6Badge:"Paiement en espèces",
    depositStripe:"Acompte (Stripe)",
    unverified:"Non vérifié",
    reinstate:"Réintégrer",
    paymentModel:"MODÈLE DE PAIEMENT",
    connected:"Connecté !",
    youllReceive:"Vous recevrez",
    onYourWay:"Vous êtes en route !",
    areYouArtist:"Êtes-vous un artiste ?",
    buttonInstead:"bouton à la place.",
    spotifyInstructions2:"Profil → trois points (⋯) → Partager → Copier le lien",
    spotifyLinkRecognized:"Lien Spotify reconnu",
    instagramRecognized:"Profil Instagram reconnu",
    howToFindLink:"Comment trouver votre lien",
    spotifyInstructions:"App Spotify : Allez à votre profil → trois points (⋯) → Partager → Copier le lien",
    artistProfileNotFound:"Profil artiste introuvable",
    noStripe:"Sans Stripe",
    recentBookingsLabel:"Réservations récentes",
    demoLiveDemo:"✦ Démo en direct",
    demoHeroTitle:"Découvrez Awaz en tant qu'artiste",
    demoHeroSub:"Voyez exactement comment les artistes utilisent la plateforme — profil, réservations, demandes de chansons et revenus.",
    demoApplyBtn:"Postuler comme artiste →",
    demoBrowseBtn:"Parcourir les artistes",
    demoOverviewTab:"Aperçu",
    demoProfileTab:"Profil",
    demoBookingTab:"Réservation",
    demoDashboardTab:"Tableau de bord",
    demoSongTab:"Demandes de chansons",
    demoPlatformOverview:"Aperçu de la plateforme",
    demoPlatformSub:"Tout ce qu'un artiste obtient en rejoignant Awaz",
    demoSeeDemoProfile:"Voir la démo du profil artiste →",
    demoProfileTitle:"Page de profil artiste",
    demoProfileSub:"Ce que les clients voient lorsqu'ils trouvent votre profil",
    demoLivePreview:"APERÇU EN DIRECT",
    demoBookingTitle:"Flux de réservation",
    demoBookingSub:"Comment les clients réservent et paient un acompte",
    demoDepositNow:"Acompte à payer maintenant",
    demoPayBtn:"Payer l'acompte →",
    demoConfirmed:"Réservation confirmée!",
    demoDashTitle:"Tableau de bord artiste",
    demoDashSub:"Ce que l'artiste voit en se connectant",
    demoUpcoming:"PROCHAINES RÉSERVATIONS",
    demoAllBookings:"TOUTES LES RÉSERVATIONS",
    demoCalTitle:"DISPONIBILITÉ",
    demoAvailable:"Disponible",
    demoBooked:"Réservé",
    demoEarnings2025:"REVENUS 2025",
    demoTotal2025:"Total 2025",
    demoSongTitle:"Système de demandes de chansons",
    demoSongSub:"Les invités scannent votre QR code — vous voyez les demandes en direct",
    demoGuestSide:"EXPÉRIENCE INVITÉ",
    demoArtistSide:"VUE ARTISTE — DEMANDES EN DIRECT",
    demoRequestSong:"Demander une chanson",
    demoSongTitleField:"Titre de la chanson *",
    demoYourName:"Votre nom *",
    demoFreeRequest:"Première chanson ce soir GRATUITE! 🎵",
    demoSendFree:"Envoyer une demande gratuite →",
    demoSentTitle:"Envoyé!",
    demoJoinTitle:"Prêt à rejoindre Awaz?",
    demoJoinSub:"Commencez à recevoir des réservations de la diaspora afghane en Europe. Gratuit pour postuler.",
    demoJoinBtn:"Postuler comme artiste — gratuit →",
    demoFeat1Title:"Profil professionnel",
    demoFeat1Desc:"Page artiste publique avec bio, instruments, liens sociaux, avis et calendrier de réservation. Les clients vous trouvent et réservent directement.",
    demoFeat2Title:"Réservations directes",
    demoFeat2Desc:"Les clients paient un acompte via Stripe. Vous recevez 88% automatiquement. Pas de facturation, pas de relances.",
    demoFeat3Title:"Messagerie intégrée",
    demoFeat3Desc:"Toute communication se passe sur la plateforme après le paiement de l'acompte. Pas de WhatsApp, pas d'e-mails.",
    demoFeat4Title:"Demandes de chansons en direct",
    demoFeat4Desc:"Pendant votre événement, les invités scannent votre QR code pour demander des chansons. Vous voyez les demandes en direct.",
    demoFeat5Title:"Tableau de bord des revenus",
    demoFeat5Desc:"Vue d'ensemble en temps réel des réservations, acomptes en attente, événements terminés et revenus totaux.",
    demoFeat6Title:"Avis vérifiés",
    demoFeat6Desc:"Seuls les invités qui vous ont réellement réservé peuvent laisser des avis. Construit une crédibilité authentique.",
    demoFeat7Title:"Portée européenne",
    demoFeat7Desc:"Atteignez la diaspora afghane en Norvège, Suède, Allemagne, Royaume-Uni, France et au-delà.",
    demoFeat8Title:"Notifications instantanées",
    demoFeat8Desc:"Soyez notifié dès qu'une réservation arrive, un message est reçu ou une chanson est demandée.",
    demoFieldName:"Votre nom",
    demoFieldEmail:"E-mail",
    demoFieldEventType:"Type d'événement",
    demoFieldDate:"Date de l'événement",
    demoFieldDatePh:"ex. 15 juin 2025",
    demoFieldTypePh:"Mariage / Aïd / Gala",
    demoTotalEarned:"Total gagné",
    demoThisYear:"Cette année",
    demoConfirmedLabel:"Confirmé",
    demoNewRequests:"Nouvelles demandes",
    demoRatingLabel:"avis",
    demoPendingLabel:"en attente",
    demoSeeSongReq:"Voir les demandes →",
    demoSeeArtistDash:"Tableau de bord →",
    demoTryBooking:"Essayer la réservation →",
    demoNotified:"L'artiste reçoit une notification instantanément.",
    demoDepositSecured:"acompte sécurisé via Stripe.",
    demoArtistGets:"L'artiste reçoit",
    demoAwazKeeps:"Awaz garde",
    demoSplitNote:"Pour chaque acompte de €1 000, vous recevez €880 (88%) directement sur votre compte Stripe. Awaz garde €120 (12%).",
    demoSongPh:"ex. Leili Jan, Bya Ke Bya…",
    demoNamePh:"ex. Layla, Ahmad…",

    applyWelcome:"Bienvenue sur Awaz !",
    applyStep1Title:"Rejoindre Awaz — Étape 1 sur 2",
    applyStep2Title:"Presque fini — Étape 2 sur 2",
    applyInEarning:"Les artistes sur Awaz gagnent",
    applyKeep:"de chaque réservation",
    applyFree:"pour rejoindre",
    applyApproved:"pour être approuvé",
    applyNextSteps:"Prochaines étapes",
    applyNext1:"Vérifiez votre e-mail et confirmez votre compte",
    applyNext2:"Revenez et cliquez sur Se connecter",
    applyNext3:"Complétez votre profil — ajoutez photo, bio, prix",
    applyNext4:"Soyez approuvé en 24h et commencez à recevoir des réservations",
    applyProTip:"Les artistes avec un profil complet reçoivent 3x plus de réservations. Complétez le vôtre dès la connexion !",
    applySignInComplete:"Se connecter et compléter le profil →",
    chatUnlocked:"Le chat avec l'artiste s'ouvre immédiatement",
    availableIn:"Disponible en",
    performingCountriesDesc:"Cet artiste se produit dans les pays suivants",
    completeProfileCta:"Complétez votre profil pour obtenir des réservations",
    artistsLive:"Des artistes sont réservés dans toute l'Europe en ce moment",
    artistPerforms:"L'artiste vient et se produit à votre événement",
    depositLabel:"acompte",
    bandBookTitle:"Comment souhaitez-vous réserver ?",
    bandBookSub:"Choisissez l'une — les deux sont faciles ✓",
    bandOptionAHeading:"⭐ Groupes complets — réserver en ensemble",
    bandNoBands:"Aucun groupe complet pour l'instant",
    bandNoBandsDesc:"Les artistes qui configurent leur propre groupe apparaîtront ici. Utilisez Créer le vôtre ci-dessous pour choisir des musiciens individuels.",
    bandBuildOwn:"Créer le vôtre",
    bandPickMusicians:"Choisissez vos musiciens",
    bandPickDesc:"Choisissez parmi de vrais artistes sur la plateforme — uniquement ceux qui sont réellement disponibles",
    bandDisplayPrices:"Afficher les prix en",
    bandEasiest:"⭐ Option la plus facile",
    bandCompleteAs:"Ensemble complet — composé par",
    bandAvailableDate:"✓ est disponible à cette date",
    bandNotAvailable:"pourrait ne pas être disponible à cette date — contactez-le/la pour confirmation",
    bandStep1:"📅 Étape 1 — Choisissez la date de l'événement",
    bandStep2Instr:"🎵 Étape 2 — Quels instruments souhaitez-vous ?",
    bandStep3Artists:"👤 Étape 3 — Choisissez vos artistes",
    bandStep2Artists:"👤 Étape 2 — Choisissez vos artistes",
    bandChooseWho:"Choisissez qui joue",
    bandFreeSuffix:"libre",
    bandBusySuffix:"(occupé)",
    bandReviewPay:"Vérifier et payer →",
    bandBackEdit:"← Modifier",
    bandTapInstruments:"Appuyez sur les instruments dont vous avez besoin ↑",
    bandBusyWarning:"Certains artistes choisis sont occupés à cette date — voir les suggestions ci-dessous",
    bandSwitchTo:"Changer →",
    bandFreeLabel:"✓ Disponible",
    bandBusyLabel:"✗ Occupé",
    bandTotalDeposit:"Acompte total",
    bandMusicianCount:"musiciens",
    bandSecureNote:"Acompte payé via Stripe · Solde payé en espèces aux artistes après l'événement · Aucune réservation sans paiement réussi",
    bandPayBtn:"Payer via Stripe →",
    bandConfirmTitle:"Confirmer votre groupe",
    bandReadyTitle:"Groupe prêt",
    soloOnlyNote:"Ceci réserve uniquement le(la) chanteur(se) — aucun instrument",
    soloNeedInstr:"Besoin de tabla, clavier ou d'autres musiciens ? Utilisez 🎼 Réserver un groupe.",
    soloSidebarNote:"Vocaliste uniquement — aucun instrument.",
    soloSidebarTip:"Besoin de tabla ou clavier ? Utilisez 🎼 Réserver un groupe.",
    bookingTermsSoloNote:"Réserver solo = chanteur(se) uniquement, aucun instrument",
    bookingTermsSoloDesc:"Si vous souhaitez des tabla, claviers ou autres musiciens, choisissez Avec groupe complet ou utilisez Réserver un groupe.",
    bookingTermsVocalistOnly:"Cette réservation est uniquement pour le(la) vocaliste",
    bookingTermsVocalistOnlyDesc:"Besoin de tabla, clavier ou d'autres instruments ? Utilisez 🎼 Réserver un groupe.",
    myBandTitle:"Mon groupe",
    myBandDesc:"C'est votre groupe principal. Vous décidez qui en fait partie et combien de membres. Les clients peuvent vous réserver en tant qu'ensemble complet — votre groupe configuré apparaît en Option A.",
    myBandCurrentMembers:"Membres actuels du groupe",
    myBandAddMember:"Ajouter un membre",
    myBandCombinedDeposit:"Acompte combiné (vous + groupe)",
    myBandSaveBtn:"Enregistrer la configuration du groupe",
    myBandSaved:"✓ Groupe enregistré !",
    myBandTip:"💡 La configuration de votre groupe est affichée sur votre profil public.",
    myBandPrimary:"Principal",
    hasBand:"A un groupe",
    inDemand:"Très demandé",
    bookEarlySub:"Réservez tôt pour sécuriser votre date",
    pricingHowTitle:"💡 Comment fonctionne votre tarification",
    pricingDepositLabel:"Acompte",
    pricingDepositDesc:"Les clients paient ceci à l'avance via Stripe pour confirmer la réservation",
    pricingCountryLabel:"Par pays",
    pricingCountryDesc:"Après l'inscription, définissez vos propres prix par pays dans votre tableau de bord",
    pricingAfterLabel:"Après l'événement",
    pricingAfterDesc:"Le solde restant est payé en espèces directement à vous",
    soloDepositLabel:"Acompte solo",
    soloDepositSub:"Quand vous vous produisez seul(e) — chanteur(se) uniquement, aucun instrument · min €500",
    soloImportant:"Important : En solo, les clients reçoivent uniquement votre voix. Pour tabla, clavier, etc., une réservation de groupe séparée est nécessaire.",
    withBandDepositLabel:"Acompte avec groupe",
    withBandDepositSub:"Acompte anticipé quand vous amenez votre groupe complet · min €800",
    keepPct:"Vous gardez 88% de l'acompte =",
    balanceCashAfter:"+ solde payé en espèces après l'événement",
  },

  da: {
    // Dari — دری — RTL
    browseArtists:"هنرمندان", howItWorks:"چگونه کار می‌کند", pricing:"قیمت‌ها",
    applyAsArtist:"درخواست هنرمند", signIn:"ورود", signOut:"خروج",
    heroEyebrow:"هنرمندان افغان را رزرو کنید",
    heroLine1:"هنرمندان افغان", heroLine2:"را", heroLine2em:"مستقیم رزرو کنید",
    heroBody:"هنرمندان تایید شده افغان را بیابید — غزل، رباب، موسیقی محلی و فیوژن — برای عروسی، عید، رویدادهای فرهنگی یا مجالس خصوصی.",
    searchPlaceholder:"هنرمند، ژانر یا شهر...", searchBtn:"جستجو",
    trustVerified:"هنرمندان تایید شده", trustStripe:"پرداخت امن",
    trustChat:"چت مستقیم", trustDeposits:"پیش‌پرداخت", trustCulture:"فرهنگ افغانی",
    featuredTitle:"هنرمندان برگزیده", featuredSub:"تایید شده · آماده رزرو", seeAll:"همه را ببینید ←",
    aiTitle:"تطابق هوشمند هنرمند", aiFindBtn:"پیدا کردن هنرمند", aiEvent:"نوع رویداد", aiStyle:"سبک موسیقی",
    openDates:"آزاد", topBadge:"★ برتر", depositLabel:"پیش‌پرداخت",
    available:"موجود", booked:"رزرو شده", blocked:"مسدود",
    selectDate:"تاریخ را انتخاب کنید", continueWith:"ادامه با", selectDateFirst:"ابتدا تاریخ را انتخاب کنید",
    bookNow:"رزرو کنید", completeBooking:"رزرو خود را کامل کنید",
    yourName:"نام شما", email:"ایمیل", phone:"تلفن",
    eventType:"نوع مراسم", eventPlaceholder:"عروسی، عید...",
    notes:"یادداشت‌ها (اختیاری)", notesPlaceholder:"درخواست‌های خاص...",
    dateLabel:"تاریخ", depositAmount:"پیش‌پرداخت", balanceCash:"باقیمانده نقدی",
    payViaStripe:"پرداخت €{n} از طریق Stripe ←", stripeNote:"🔒 Stripe · SSL · PCI",
    depositConfirmed:"پیش‌پرداخت تایید شد!", continueToChat:"ادامه به چت ←",
    balanceCashNote:"باقیمانده نقدی به هنرمند پس از کنسرت پرداخت می‌شود",
    signInToAwaz:"ورود به آواز", welcomeBack:"خوش آمدید",
    password:"رمز عبور", forgotPassword:"رمز را فراموش کردید؟",
    newHere:"تازه وارد هستید؟", createAccountLink:"ایجاد حساب",
    createAccount:"ایجاد حساب کاربری", alreadyHaveAccount:"قبلاً حساب دارید؟",
    enterEmailPass:"ایمیل و رمز عبور را وارد کنید.",
    wrongCredentials:"اطلاعات اشتباه است. {n} تلاش باقی مانده.",
    tooManyAttempts:"تلاش‌های زیاد. ۵ دقیقه صبر کنید.",
    resetPassword:"بازنشانی رمز عبور", sendResetLink:"ارسال لینک بازنشانی",
    enterYourEmail:"ایمیل خود را وارد کنید تا لینک بازنشانی ارسال شود.",
    emailSent:"ایمیل ارسال شد!", checkInbox:"صندوق ورودی خود را در",
    forResetLink:"برای لینک بازنشانی رمز عبور بررسی کنید.",
    backToSignIn:"بازگشت به ورود", demoAccounts:"حساب‌های آزمایشی",
    demoNote:"این‌ها پس از اتصال به Supabase Auth حذف می‌شوند.",
    fullName:"نام کامل", atLeast8:"حداقل ۸ کاراکتر",
    validEmailRequired:"ایمیل معتبر لازم است.", passwordMin8:"رمز عبور باید حداقل ۸ کاراکتر داشته باشد.",
    passwordsDontMatch:"رمزهای عبور مطابقت ندارند.", nameRequired:"نام خود را وارد کنید.",
    portalHome:"خانه", portalCalendar:"تقویم", portalBookings:"رزروها",
    portalMessages:"پیام‌ها", portalProfile:"پروفایل", portalSocial:"شبکه‌های اجتماعی",
    availabilityTitle:"دسترس‌پذیری", availabilityHint:"برای تغییر وضعیت روی تاریخ‌ها ضربه بزنید",
    myBookings:"رزروهای من", messagesTitle:"پیام‌ها", myProfile:"پروفایل من",
    editProfile:"ویرایش", cancelEdit:"لغو", saveProfile:"ذخیره",
    noBookingsYet:"هنوز رزروی ندارید. تاریخ‌های موجود را اضافه کنید!",
    noChatsYet:"چت‌ها پس از پرداخت پیش‌پرداخت باز می‌شوند.",
    depositPaid:"پیش‌پرداخت ✓ پرداخت شد", depositPending:"✗ در انتظار",
    platformOverview:"نمای کلی پلتفرم", allBookings:"همه رزروها", allArtists:"هنرمندان",
    allConversations:"همه مکالمات", finance:"مالی",
    aboutTab:"درباره", instrumentsTab:"سازها", socialTab:"اجتماعی",
    reviewsTab:"نظرات", policyTab:"شرایط",
    howTitle:"در ۶ مرحله", howTitleEm:"رزرو کنید",
    howSub:"از کشف تا اجرا — کل فرآیند رزرو سریع، امن و کاملاً شفاف طراحی شده است.",
    pricingTitle:"قیمت‌گذاری ساده", pricingSubtitle:"هزینه‌های شفاف — بدون هزینه پنهان",
    forClients:"برای مشتریان", forArtists:"برای هنرمندان",
    footerTagline:"برترین پلتفرم برای رزرو هنرمندان تایید شده افغان در اروپا.",
    footerCopyright:"© {year} Awaz AS · اسلو · پرداخت از طریق Stripe",
    months:["جنوری","فبروری","مارچ","اپریل","می","جون","جولای","اگست","سپتامبر","اکتوبر","نوامبر","دسامبر"],
    wdays:["د","س","چ","پ","ج","ش","ی"],
    applyTitle:"درخواست هنرمند",
    monthlyListeners:"شنونده ماهانه", subscribers:"مشترک", followers:"دنبال‌کننده",
    chatLocked:"قفل — پیش‌پرداخت لازم است", chatActive:"فعال",
    typeMessage:"پیام بنویسید…", depositRequired:"پیش‌پرداخت لازم است",
    chatLockedTitle:"چت قفل است", chatLockedBody:"برای باز شدن چت پیش‌پرداخت را بپردازید.",
    back:"بازگشت →", from:"از", clearFilters:"پاک کردن فیلترها",
    noArtistsFound:"هنرمندی یافت نشد", tryDifferent:"ژانر یا عبارت جستجوی دیگری امتحان کنید.",
    artistsCount:"{n} هنرمند", artistsCountPlural:"{n} هنرمند",
    howStep1Title:"کشف",
    howStep1Desc:"هنرمندان تایید شده را بر اساس ژانر و موقعیت مرور کنید",
    howStep2Title:"تاریخ را انتخاب کنید",
    howStep2Desc:"تقویم‌های زنده را ببینید — یک تاریخ آزاد انتخاب کنید",
    howStep3Title:"پیش‌پرداخت کنید",
    howStep3Desc:"پیش‌پرداخت تعیین‌شده توسط هنرمند از طریق Stripe — تقسیم خودکار",
    howStep4Title:"چت باز می‌شود",
    howStep4Desc:"پیام مستقیم پس از پرداخت",
    howStep5Title:"لذت ببرید",
    howStep5Desc:"باقیمانده نقداً به هنرمند پس از کنسرت پرداخت می‌شود",
    howSectionTitle:"چگونه کار می‌کند",
    howSectionSub:"ساده، شفاف، امن از جستجو تا اجرا",
    footerDesc:"پیشرفته‌ترین پلتفرم برای رزرو هنرمندان تایید شده افغان در اروپا.",
    footerBrowse:"مرور",
    footerApply:"درخواست",
    footerPricing:"قیمت‌ها",
    searchArtists:"جستجوی هنرمندان…",
    bookDirectly:"مستقیم رزرو کنید — بدون آژانس",
    chatLockedTitle2:"چت قفل است",
    chatLockedBody2:"پیش‌پرداخت را بپردازید تا پیام‌رسانی باز شود.",
    securedByStripe:"توسط Stripe ایمن شده",
    depositConfirmed2:"پیش‌پرداخت تایید شد!",
    continueToChat2:"ادامه به چت →",
    balanceCashNote2:"باقیمانده نقداً به هنرمند پس از کنسرت",
    createYourAccount:"حساب خود را ایجاد کنید",
    emailSent2:"ایمیل ارسال شد!",
    checkInbox2:"صندوق ورودی خود را در",
    backToSignIn2:"بازگشت به ورود",
    enterYourEmail2:"ایمیل خود را وارد کنید تا لینک بازنشانی ارسال شود.",
    sendResetLink2:"ارسال لینک بازنشانی",
    demoNote2:"اینها پس از اتصال به Supabase Auth حذف می‌شوند.",
    bookingTerms:"شرایط رزرو",
    pricingByCountry:"قیمت‌گذاری بر اساس کشور",
    pricesLocal:"قیمت‌ها به ارز محلی نشان داده می‌شوند · پیش‌پرداخت Stripe به EUR تبدیل می‌شود",
    noSocialConnected:"هیچ حساب اجتماعی متصل نیست",
    noSocialDesc:"این هنرمند هنوز Spotify یا Instagram را متصل نکرده است.",
    selectDate2:"یک تاریخ انتخاب کنید",
    cashAfterConcert:"نقد پس از کنسرت",
    platformOverview2:"نمای کلی پلتفرم",
    recentBookings:"رزروهای اخیر",
    allBookings2:"همه رزروها",
    allConversations2:"همه مکالمات",
    noMessages:"هیچ پیامی نیست",
    paymentSplit:"تقسیم پرداخت",
    awazAdmin:"مدیریت آواز",
    platformControl:"کنترل پلتفرم",
    adminPanel:"پنل مدیریت",
    pendingApproval:"در انتظار تایید",
    connectStripe:"اتصال به Stripe",
    addSocial:"Spotify و Instagram اضافه کنید",
    addNow:"اکنون اضافه کنید →",
    noBookingsYet2:"هنوز رزروی ندارید. تاریخ‌های موجود را اضافه کنید!",
    tapToToggle:"برای تغییر وضعیت روی تاریخ‌ها ضربه بزنید",
    myBookings2:"رزروهای من",
    noBookingsYet3:"هنوز رزروی ندارید.",
    noChatsYet2:"چت‌ها پس از پرداخت پیش‌پرداخت باز می‌شوند.",
    noMessagesYet:"هنوز پیامی نیست",
    socialMedia:"شبکه‌های اجتماعی",
    myProfile2:"پروفایل من",
    tapToChange:"برای تغییر عکس ضربه بزنید",
    notConnected:"متصل نیست",
    youReceive:"شما دریافت می‌کنید",
    artistPortal:"پورتال هنرمند",
    depositSplit:"تقسیم پیش‌پرداخت",
    findPerfectArtist:"هنرمند مناسب خود را پیدا کنید",
    startOver:"دوباره شروع کنید",
    profileUnderReview:"پروفایل شما در حال بررسی است. برای اتصال به Stripe و تکمیل تأیید وارد شوید.",
    submitApplication:"ارسال درخواست",
    inquiryReceived:"استعلام دریافت شد",
    privateInquiry:"استعلام خصوصی",
    directToOwner:"مستقیم به مالک",
    directToOwnerDesc:"پاسخ شخصی · مذاکره قیمت · بسته‌های سفارشی",
    budgetRange:"محدوده بودجه",
    selectRange:"یک محدوده انتخاب کنید…",
    preferredArtist:"هنرمند مورد نظر (اختیاری)",
    notSureYet:"هنوز مطمئن نیستم — اجازه دهید مالک پیشنهاد دهد",
    noInquiriesYet:"هنوز استعلامی نیست",
    noInquiriesDesc:"استعلام‌های بازدیدکنندگان پس از راه‌اندازی ویجت تماس اینجا ظاهر می‌شوند.",
    yourReply:"پاسخ شما (ارسال شد)",
    marketPricing:"قیمت‌های بازار",
    saveMarketPricing:"قیمت‌های بازار را ذخیره کنید",
    connectingStripe:"در حال اتصال به Stripe…",
    stripeSecurity:"Stripe Connect · امنیت سطح بانک · پرداخت فوری",
    loadingSpotify:"در حال بارگذاری Spotify…",
    spotifyBlocked:"ویجت Spotify توسط مرورگر مسدود شد",
    viewOnInstagram:"در اینستاگرام ببینید ↗",
    watchOnTikTok:"در TikTok ببینید ↗",
    applyAsArtistTitle:"درخواست هنرمند",
    spotifyAppLabel:"برنامه Spotify:",
    trustStripeDesc:"رمزگذاری سطح بانک",
    trustVerifiedDesc:"هر پروفایل بررسی شده",
    trustChatDesc:"بدون واسطه",
    trustFees:"0٪ هزینه پنهان",
    trustFeesDesc:"آنچه می‌بینید همان است که می‌پردازید",
    browseNow:"← هنرمندان را ببینید",
    escrowTitle:"امانت امن",
    escrowDesc:"پیش‌پرداخت توسط آواز تا تأیید رویداد نگه داشته می‌شود",
    adminChat:"چت",
    adminChatWith:"با هنرمند چت کنید",
    verifyArtist:"تأیید کنید",
    verified2:"تأیید شده ✓",
    pendingVerif:"در انتظار تأیید",
    refund:"پیش‌پرداخت را بازپرداخت کنید",
    refundConfirm:"بازپرداخت به مشتری تأیید شد",
    addCountry:"کشور اضافه کنید",
    yourPrice:"قیمت شما",
    performHere:"من اینجا اجرا می‌کنم",
    suspend:"تعلیق",
    deposit2:"پیش‌پرداخت",
    balance:"مانده",
    messages2:"پیام‌ها",
    country:"کشور",
    message:"پیام",
    stripeLabel:"Stripe:",
    depositLabel2:"پیش‌پرداخت:",
    policyLabel:"سیاست:",
    browserLabel:"مرورگر:",
    browserSpotifyDesc:"به صفحه Spotify خود بروید ← URL را از نوار آدرس کپی کنید",
    pricingClient1:"همه هنرمندان را رایگان مشاهده کنید",
    pricingClient2:"در زمان رزرو پیش‌پرداخت هنرمند را بپردازید",
    pricingClient3:"بلافاصله پس از پیش‌پرداخت چت کنید",
    pricingClient4:"مانده نقداً به هنرمند پرداخت می‌شود",
    pricingClient5:"طبق سیاست هنرمند لغو کنید",
    pricingArtist1:"رایگان ثبت‌نام کنید",
    pricingArtist2:"قیمت خود را تعیین کنید",
    pricingArtist3:"پیش‌پرداخت خود را تعیین کنید (حداقل €500)",
    pricingArtist4:"سیاست لغو خود را تعیین کنید",
    pricingArtist5:"88٪ از هر پیش‌پرداخت دریافت کنید",
    pricingArtist6:"12٪ کارمزد پلتفرم — هیچ چیز دیگری نیست",
    splitLabel1:"پیش‌پرداخت هنرمند",
    splitDesc1:"توسط هنرمند تعیین شده (حداقل €500)",
    splitLabel2:"شما دریافت می‌کنید (88٪)",
    splitDesc2:"به صورت خودکار به Stripe منتقل می‌شود",
    splitLabel3:"کارمزد آواز (12٪)",
    splitDesc3:"عملیات پلتفرم",
    howBadge:"ساده و شفاف",
    step1Title:"هنرمند مناسب خود را پیدا کنید",
    step1Desc:"هنرمندان تایید شده افغان را بر اساس ژانر، شهر یا مناسبت جستجو کنید. مطمئن نیستید از کجا شروع کنید؟ مطابق‌ساز هوش مصنوعی ما جزئیات رویداد شما را می‌خواند.",
    step1Badge:"رایگان مشاهده کنید",
    step2Title:"یک تاریخ انتخاب کنید — فوری",
    step2Desc:"بدون ایمیل‌های رفت و برگشت. هر هنرمند تقویم خود را به‌روز نگه می‌دارد. هر تاریخ آزادی را انتخاب کنید.",
    step2Badge:"در دسترس بودن زنده",
    step3Title:"در کمتر از 2 دقیقه تأیید کنید",
    step3Desc:"نوع رویداد و اطلاعات تماس خود را وارد کنید. سیاست لغو هنرمند قبل از تعهد به وضوح نشان داده می‌شود.",
    step3Badge:"2 دقیقه طول می‌کشد",
    step4Title:"رزرو خود را از طریق Stripe ایمن کنید",
    step4Desc:"پیش‌پرداخت تعیین‌شده توسط هنرمند (حداقل €500) را از طریق Stripe بپردازید.",
    step4Badge:"امنیت سطح بانک",
    step5Title:"چت در لحظه پرداخت باز می‌شود",
    step5Desc:"به محض تأیید پیش‌پرداخت، یک کانال پیام خصوصی بین شما و هنرمند باز می‌شود.",
    step5Badge:"پیام مستقیم",
    step6Title:"حاضر شوید و از همه چیز لذت ببرید",
    step6Desc:"هنرمند اجرا می‌کند. مانده را پس از کنسرت نقداً مستقیم به هنرمند می‌پردازید.",
    step6Badge:"پرداخت نقدی",
    depositStripe:"پیش‌پرداخت (Stripe)",
    unverified:"تایید نشده",
    reinstate:"بازگردانی",
    paymentModel:"مدل پرداخت",
    connected:"متصل شد!",
    youllReceive:"شما دریافت خواهید کرد",
    onYourWay:"شما در راه هستید!",
    areYouArtist:"آیا هنرمند هستید؟",
    buttonInstead:"دکمه را به جای آن.",
    spotifyInstructions2:"به پروفایل بروید ← سه نقطه (⋯) ← اشتراک‌گذاری ← کپی لینک",
    spotifyLinkRecognized:"لینک Spotify شناسایی شد",
    instagramRecognized:"پروفایل Instagram شناسایی شد",
    howToFindLink:"چگونه لینک خود را پیدا کنید",
    spotifyInstructions:"برنامه Spotify: به پروفایل بروید ← سه نقطه (⋯) ← اشتراک‌گذاری ← کپی لینک",
    artistProfileNotFound:"پروفایل هنرمند یافت نشد",
    noStripe:"بدون Stripe",
    recentBookingsLabel:"رزروهای اخیر",
    demoLiveDemo:"✦ نمایش زنده",
    demoHeroTitle:"آواز را به عنوان هنرمند تجربه کنید",
    demoHeroSub:"ببینید هنرمندان چگونه از پلتفرم استفاده می‌کنند — از پروفایل تا رزروها، درخواست آهنگ زنده و داشبورد درآمد.",
    demoApplyBtn:"درخواست هنرمند →",
    demoBrowseBtn:"مرور هنرمندان",
    demoOverviewTab:"مرور کلی",
    demoProfileTab:"پروفایل",
    demoBookingTab:"رزرو",
    demoDashboardTab:"داشبورد",
    demoSongTab:"درخواست آهنگ",
    demoPlatformOverview:"مرور پلتفرم",
    demoPlatformSub:"هر آنچه هنرمند با عضویت در آواز دریافت می‌کند",
    demoSeeDemoProfile:"مشاهده دمو پروفایل هنرمند →",
    demoProfileTitle:"صفحه پروفایل هنرمند",
    demoProfileSub:"این چیزی است که مشتریان هنگام یافتن پروفایل شما می‌بینند",
    demoLivePreview:"پیش‌نمایش زنده",
    demoBookingTitle:"جریان رزرو",
    demoBookingSub:"نحوه رزرو مشتریان و پرداخت پیش‌پرداخت",
    demoDepositNow:"پیش‌پرداخت برای پرداخت",
    demoPayBtn:"پرداخت پیش‌پرداخت →",
    demoConfirmed:"رزرو تأیید شد!",
    demoDashTitle:"داشبورد هنرمند",
    demoDashSub:"آنچه هنرمند هنگام ورود می‌بیند",
    demoUpcoming:"رزروهای آینده",
    demoAllBookings:"همه رزروها",
    demoCalTitle:"در دسترس بودن",
    demoAvailable:"آزاد",
    demoBooked:"رزرو شده",
    demoEarnings2025:"درآمد ۲۰۲۵",
    demoTotal2025:"مجموع ۲۰۲۵",
    demoSongTitle:"سیستم درخواست آهنگ",
    demoSongSub:"مهمانان کد QR شما را اسکن می‌کنند — شما درخواست‌ها را زنده می‌بینید",
    demoGuestSide:"تجربه مهمان",
    demoArtistSide:"نمای هنرمند — درخواست‌های زنده",
    demoRequestSong:"درخواست آهنگ",
    demoSongTitleField:"عنوان آهنگ *",
    demoYourName:"نام شما *",
    demoFreeRequest:"اولین آهنگ امشب رایگان است! 🎵",
    demoSendFree:"ارسال درخواست رایگان →",
    demoSentTitle:"ارسال شد!",
    demoJoinTitle:"آماده پیوستن به آواز هستید؟",
    demoJoinSub:"شروع به دریافت رزرو از دیاسپورای افغان در اروپا کنید. درخواست رایگان است.",
    demoJoinBtn:"درخواست هنرمند — رایگان →",
    demoFeat1Title:"پروفایل حرفه‌ای",
    demoFeat1Desc:"صفحه عمومی هنرمند با بیو، ساز، لینک‌های شبکه اجتماعی، نظرات و تقویم رزرو.",
    demoFeat2Title:"رزرو مستقیم",
    demoFeat2Desc:"مشتریان از طریق Stripe پیش‌پرداخت می‌دهند. شما به‌طور خودکار 88٪ دریافت می‌کنید.",
    demoFeat3Title:"پیام‌رسانی یکپارچه",
    demoFeat3Desc:"تمام ارتباطات پس از پرداخت پیش‌پرداخت در پلتفرم انجام می‌شود. بدون واتساپ، بدون زنجیره ایمیل.",
    demoFeat4Title:"درخواست آهنگ زنده",
    demoFeat4Desc:"در رویداد شما، مهمانان کد QR شما را اسکن می‌کنند تا آهنگ درخواست دهند. شما درخواست‌ها را زنده می‌بینید.",
    demoFeat5Title:"داشبورد درآمد",
    demoFeat5Desc:"نمای کلی بلادرنگ از رزروها، پیش‌پرداخت‌های معلق، رویدادهای تمام شده و درآمد کل.",
    demoFeat6Title:"نظرات تأیید شده",
    demoFeat6Desc:"فقط مهمانانی که واقعاً شما را رزرو کرده‌اند می‌توانند نظر بگذارند.",
    demoFeat7Title:"دسترسی اروپایی",
    demoFeat7Desc:"به دیاسپورای افغان در نروژ، سوئد، آلمان، بریتانیا، فرانسه و فراتر از آن دسترسی داشته باشید.",
    demoFeat8Title:"اعلان‌های فوری",
    demoFeat8Desc:"به محض ورود رزرو، پیام یا درخواست آهنگ مطلع شوید.",
    demoFieldName:"نام شما",
    demoFieldEmail:"ایمیل",
    demoFieldEventType:"نوع رویداد",
    demoFieldDate:"تاریخ رویداد",
    demoFieldDatePh:"مثلاً ۱۵ ژوئن ۲۰۲۵",
    demoFieldTypePh:"عروسی / عید / گالا",
    demoTotalEarned:"کل درآمد",
    demoThisYear:"امسال",
    demoConfirmedLabel:"تأیید شده",
    demoNewRequests:"درخواست‌های جدید",
    demoRatingLabel:"نظر",
    demoPendingLabel:"در انتظار",
    demoSeeSongReq:"مشاهده درخواست‌ها →",
    demoSeeArtistDash:"داشبورد هنرمند →",
    demoTryBooking:"امتحان رزرو →",
    demoNotified:"هنرمند فوراً اعلان دریافت می‌کند.",
    demoDepositSecured:"پیش‌پرداخت از طریق Stripe تضمین شده.",
    demoArtistGets:"هنرمند دریافت می‌کند",
    demoAwazKeeps:"آواز نگه می‌دارد",
    demoSplitNote:"برای هر پیش‌پرداخت €۱۰۰۰، €۸۸۰ (۸۸٪) مستقیماً به حساب Stripe شما می‌رسد. آواز €۱۲۰ (۱۲٪) را نگه می‌دارد.",
    demoSongPh:"مثلاً لیلی جان، بیا که بیا…",
    demoNamePh:"مثلاً لیلا، احمد…",

    applyWelcome:"به Awaz خوش آمدید!",
    applyStep1Title:"پیوستن به Awaz — مرحله ۱ از ۲",
    applyStep2Title:"تقریباً تمام شد — مرحله ۲ از ۲",
    applyInEarning:"هنرمندان در Awaz درآمد دارند",
    applyKeep:"از هر رزرو",
    applyFree:"برای پیوستن",
    applyApproved:"برای تأیید",
    applyNextSteps:"مرحله بعد چیست",
    applyNext1:"ایمیل خود را بررسی کنید و حساب را تأیید کنید",
    applyNext2:"بازگردید و روی ورود کلیک کنید",
    applyNext3:"پروفایل خود را کامل کنید — عکس، بیوگرافی و قیمت اضافه کنید",
    applyNext4:"ظرف ۲۴ ساعت تأیید شوید و رزرو دریافت کنید",
    applyProTip:"هنرمندانی که پروفایل کاملی دارند ۳ برابر بیشتر رزرو می‌گیرند!",
    applySignInComplete:"ورود و تکمیل پروفایل →",
    chatUnlocked:"گپ با هنرمند فوراً باز می‌شود",
    availableIn:"در دسترس در",
    performingCountriesDesc:"این هنرمند در کشورهای زیر اجرا می‌کند",
    completeProfileCta:"پروفایل خود را برای دریافت رزرو تکمیل کنید",
    artistsLive:"هنرمندان اکنون در سراسر اروپا رزرو می‌شوند",
    artistPerforms:"هنرمند می‌آید و در رویداد شما اجرا می‌کند",
    depositLabel:"پیش‌پرداخت",
    bandBookTitle:"چطور می‌خواهید رزرو کنید؟",
    bandBookSub:"یکی را انتخاب کنید — هر دو آسان هستند ✓",
    bandOptionAHeading:"⭐ گروه‌های کامل — رزرو به عنوان گروه",
    bandNoBands:"هنوز هیچ گروه کاملی وجود ندارد",
    bandNoBandsDesc:"هنرمندانی که گروه خود را تنظیم می‌کنند اینجا نمایش داده می‌شوند. از گزینه «ساخت گروه خود» استفاده کنید.",
    bandBuildOwn:"ساخت گروه خود",
    bandPickMusicians:"موزیسین‌های خود را انتخاب کنید",
    bandPickDesc:"از هنرمندان واقعی روی پلتفرم انتخاب کنید — فقط کسانی که واقعاً در دسترس هستند",
    bandDisplayPrices:"نمایش قیمت‌ها در",
    bandEasiest:"⭐ آسان‌ترین گزینه",
    bandCompleteAs:"گروه کامل — انتخاب شده توسط",
    bandAvailableDate:"✓ در این تاریخ در دسترس است",
    bandNotAvailable:"ممکن است در این تاریخ در دسترس نباشد — برای تأیید با او تماس بگیرید",
    bandStep1:"📅 مرحله ۱ — تاریخ رویداد را انتخاب کنید",
    bandStep2Instr:"🎵 مرحله ۲ — چه سازهایی می‌خواهید؟",
    bandStep3Artists:"👤 مرحله ۳ — هنرمندان خود را انتخاب کنید",
    bandStep2Artists:"👤 مرحله ۲ — هنرمندان خود را انتخاب کنید",
    bandChooseWho:"انتخاب کنید چه کسی بنوازد",
    bandFreeSuffix:"آزاد",
    bandBusySuffix:"(مشغول)",
    bandReviewPay:"بررسی و پرداخت →",
    bandBackEdit:"→ ویرایش",
    bandTapInstruments:"روی سازهای مورد نیاز ضربه بزنید ↑",
    bandBusyWarning:"برخی هنرمندان انتخاب شده در این تاریخ مشغول هستند — پیشنهادات را ببینید",
    bandSwitchTo:"تغییر →",
    bandFreeLabel:"✓ در دسترس",
    bandBusyLabel:"✗ مشغول",
    bandTotalDeposit:"کل پیش‌پرداخت",
    bandMusicianCount:"موزیسین",
    bandSecureNote:"پیش‌پرداخت از طریق Stripe · مانده به صورت نقدی به هنرمندان پس از رویداد · بدون پرداخت موفق هیچ رزروی انجام نمی‌شود",
    bandPayBtn:"پرداخت از طریق Stripe →",
    bandConfirmTitle:"تأیید گروه شما",
    bandReadyTitle:"گروه آماده",
    soloOnlyNote:"این فقط خواننده را رزرو می‌کند — بدون ساز",
    soloNeedInstr:"به طبله، کیبورد یا موزیسین‌های دیگر نیاز دارید؟ از 🎼 رزرو گروه استفاده کنید.",
    soloSidebarNote:"فقط خواننده — بدون ساز.",
    soloSidebarTip:"طبله یا کیبورد می‌خواهید؟ از 🎼 رزرو گروه استفاده کنید.",
    bookingTermsSoloNote:"رزرو سولو = فقط خواننده، بدون ساز",
    bookingTermsSoloDesc:"اگر طبله، کیبورد یا موزیسین‌های دیگر می‌خواهید، گزینه «با گروه کامل» را انتخاب کنید یا از رزرو گروه استفاده کنید.",
    bookingTermsVocalistOnly:"این رزرو فقط برای خواننده است",
    bookingTermsVocalistOnlyDesc:"به طبله، کیبورد یا سازهای دیگر نیاز دارید؟ از 🎼 رزرو گروه استفاده کنید.",
    myBandTitle:"گروه من",
    myBandDesc:"این گروه اصلی شماست. شما تصمیم می‌گیرید چه کسانی و چند نفر در آن باشند. مشتریان می‌توانند شما را به عنوان یک گروه کامل رزرو کنند.",
    myBandCurrentMembers:"اعضای فعلی گروه",
    myBandAddMember:"افزودن عضو گروه",
    myBandCombinedDeposit:"پیش‌پرداخت ترکیبی (شما + گروه)",
    myBandSaveBtn:"ذخیره تنظیمات گروه",
    myBandSaved:"✓ گروه ذخیره شد!",
    myBandTip:"💡 تنظیمات گروه شما در پروفایل عمومی نمایش داده می‌شود.",
    myBandPrimary:"اصلی",
    hasBand:"دارای گروه",
    inDemand:"پرتقاضا",
    bookEarlySub:"زود رزرو کنید تا تاریخ خود را تأمین کنید",
    pricingHowTitle:"💡 قیمت‌گذاری شما چگونه کار می‌کند",
    pricingDepositLabel:"پیش‌پرداخت",
    pricingDepositDesc:"مشتریان این مبلغ را از طریق Stripe برای تأیید رزرو پیشاپیش پرداخت می‌کنند",
    pricingCountryLabel:"بر اساس کشور",
    pricingCountryDesc:"پس از ثبت‌نام، قیمت‌های کامل خود را برای هر کشور در داشبورد تنظیم کنید",
    pricingAfterLabel:"پس از رویداد",
    pricingAfterDesc:"مبلغ باقیمانده به صورت نقدی مستقیم به شما پرداخت می‌شود",
    soloDepositLabel:"پیش‌پرداخت سولو",
    soloDepositSub:"وقتی تنها اجرا می‌کنید — فقط خواننده، بدون ساز · حداقل €500",
    soloImportant:"مهم: وقتی مشتریان شما را سولو رزرو می‌کنند، فقط صدای شما را دریافت می‌کنند. برای طبله، کیبورد و غیره باید گروه جداگانه رزرو کنند.",
    withBandDepositLabel:"پیش‌پرداخت با گروه",
    withBandDepositSub:"پیش‌پرداخت هنگام آوردن گروه کامل · حداقل €800",
    keepPct:"شما ۸۸٪ پیش‌پرداخت را نگه می‌دارید =",
    balanceCashAfter:"+ مانده به صورت نقدی پس از رویداد",
  },

  ps: {
    // Pashto — پښتو — RTL
    browseArtists:"هنرمندان", howItWorks:"دا څنګه کار کوي", pricing:"بیې",
    applyAsArtist:"د هنرمند غوښتنه", signIn:"ننوتل", signOut:"وتل",
    heroEyebrow:"افغان هنرمندان مستقیم بک کړئ",
    heroLine1:"افغان هنرمندان", heroLine2:"مستقیم", heroLine2em:"بک کړئ",
    heroBody:"تایید شوي افغان هنرمندان ومومئ — غزل، رباب، د خلکو موسیقي او فیوژن — ستاسو د واده، اختر، کلتوري پیښو یا شخصي غونډو لپاره.",
    searchPlaceholder:"هنرمند، ژانر یا ښار...", searchBtn:"لټون",
    trustVerified:"تایید شوي هنرمندان", trustStripe:"خوندي تادیه",
    trustChat:"مستقیم چیټ", trustDeposits:"د هنرمند لخوا پیشکي", trustCulture:"افغاني کلتور",
    featuredTitle:"غوره هنرمندان", featuredSub:"تایید شوي · د بکولو لپاره چمتو", seeAll:"ټول وګورئ ←",
    aiTitle:"د هنرمند هوښیار مطابقت", aiFindBtn:"زما هنرمند ومومئ", aiEvent:"د پیښې ډول", aiStyle:"د موسیقۍ سټایل",
    openDates:"موجود", topBadge:"★ غوره", depositLabel:"پیشکي",
    available:"موجود", booked:"بک شوی", blocked:"بند",
    selectDate:"نیټه وټاکئ", continueWith:"سره دوام", selectDateFirst:"لومړی نیټه وټاکئ",
    bookNow:"اوس بک کړئ", completeBooking:"بکنګ بشپړ کړئ",
    yourName:"ستاسو نوم", email:"بریښنالیک", phone:"تلیفون",
    eventType:"د پیښې ډول", eventPlaceholder:"واده، اختر...",
    notes:"یادداشتونه (اختیاري)", notesPlaceholder:"ځانګړي غوښتنې...",
    dateLabel:"نیټه", depositAmount:"پیشکي", balanceCash:"پاتې رقم نقد",
    payViaStripe:"د Stripe له لارې €{n} تادیه کړئ ←", stripeNote:"🔒 Stripe · SSL · PCI",
    depositConfirmed:"پیشکي تایید شوه!", continueToChat:"چیټ ته دوام ←",
    balanceCashNote:"د کنسرت وروسته هنرمند ته نقد پیسې",
    signInToAwaz:"آواز ته ننوتل", welcomeBack:"ښه راغلاست",
    password:"پاسورډ", forgotPassword:"پاسورډ مو هیر کړ؟",
    newHere:"نوی یاست؟", createAccountLink:"حساب جوړ کړئ",
    createAccount:"حساب جوړ کړئ", alreadyHaveAccount:"دمخه حساب لرئ؟",
    enterEmailPass:"بریښنالیک او پاسورډ دننه کړئ.",
    wrongCredentials:"غلط معلومات. {n} هڅې پاتې.",
    tooManyAttempts:"ډیرې هڅې. ۵ دقیقې انتظار وکړئ.",
    resetPassword:"پاسورډ بیا تنظیم کړئ", sendResetLink:"د بیا تنظیم لینک ولیږئ",
    enterYourEmail:"خپل بریښنالیک دننه کړئ، موږ به تاسو ته لینک ولیږو.",
    emailSent:"بریښنالیک ولیږل شو!", checkInbox:"خپل inbox وګورئ",
    forResetLink:"د پاسورډ بیا تنظیم لپاره لینک.",
    backToSignIn:"ننوتلو ته شاته", demoAccounts:"د ازموینې حسابونه",
    demoNote:"کله چې Supabase Auth وصل کړئ دا لرې کیږي.",
    fullName:"بشپړ نوم", atLeast8:"لږترلږه ۸ کارکتونه",
    validEmailRequired:"سم بریښنالیک اړین دی.", passwordMin8:"پاسورډ باید لږترلږه ۸ کارکتونه ولري.",
    passwordsDontMatch:"پاسورډونه سره سمون نه خوري.", nameRequired:"خپل نوم دننه کړئ.",
    portalHome:"کور", portalCalendar:"کلینډر", portalBookings:"بکنګونه",
    portalMessages:"پیغامونه", portalProfile:"پروفایل", portalSocial:"ټولنیز رسنۍ",
    availabilityTitle:"شتون", availabilityHint:"د موجود ↔ بند د بدلولو لپاره نیټو ته وټاکئ",
    myBookings:"زما بکنګونه", messagesTitle:"پیغامونه", myProfile:"زما پروفایل",
    editProfile:"سمول", cancelEdit:"لغوه", saveProfile:"خوندي کړئ",
    noBookingsYet:"لاهم هیڅ بکنګ نشته. شته نیټې اضافه کړئ!",
    noChatsYet:"چیټونه د پیرودونکو د پیشکي ورکولو وروسته خلاصیږي.",
    depositPaid:"پیشکي ✓ ورکړل شوه", depositPending:"✗ انتظار",
    platformOverview:"د پلیټفارم لنډیز", allBookings:"ټول بکنګونه", allArtists:"هنرمندان",
    allConversations:"ټولې خبرې اترې", finance:"مالي",
    aboutTab:"په اړه", instrumentsTab:"آلات", socialTab:"ټولنیز",
    reviewsTab:"بیاکتنې", policyTab:"شرایط",
    howTitle:"په ۶ مرحلو کې", howTitleEm:"بک کړئ",
    howSub:"له کشف څخه تر اجرا پورې — ټول د بکولو پروسه چټکه، خوندي او بشپړه شفافه ده.",
    pricingTitle:"ساده قیمتونه", pricingSubtitle:"شفاف فیسونه — هیڅ پټ لګښت نشته",
    forClients:"د پیرودونکو لپاره", forArtists:"د هنرمندانو لپاره",
    footerTagline:"د اروپا کې د تایید شوو افغان هنرمندانو د بکولو لومړنۍ پلیټفارم.",
    footerCopyright:"© {year} Awaz AS · اوسلو · د Stripe له لارې تادیه",
    months:["جنوري","فبروري","مارچ","اپریل","مئ","جون","جولای","اګست","سپتمبر","اکتوبر","نومبر","ډسمبر"],
    wdays:["د","س","چ","پ","ج","ش","ی"],
    applyTitle:"د هنرمند غوښتنه",
    monthlyListeners:"میاشتني اوریدونکي", subscribers:"مشتریان", followers:"پیروان",
    chatLocked:"قفل — پیشکي اړینه ده", chatActive:"فعال",
    typeMessage:"پیغام ولیکئ…", depositRequired:"پیشکي اړینه ده",
    chatLockedTitle:"چیټ قفل دی", chatLockedBody:"د پیغامونو د خلاصولو لپاره پیشکي ورکړئ.",
    back:"شاته ←", from:"له", clearFilters:"فلترونه پاک کړئ",
    noArtistsFound:"هیڅ هنرمند ونه موندل شو", tryDifferent:"بل ژانر یا د لټون اصطلاح هڅه وکړئ.",
    artistsCount:"{n} هنرمند", artistsCountPlural:"{n} هنرمندان",
    howStep1Title:"موندل",
    howStep1Desc:"د ژانر او ځای له مخې تایید شوي هنرمندان وګورئ",
    howStep2Title:"نیټه غوره کړئ",
    howStep2Desc:"ژوندي کلینډرونه وګورئ — خلاصه نیټه وټاکئ",
    howStep3Title:"پیشکي ورکړئ",
    howStep3Desc:"د هنرمند لخوا د Stripe له لارې پیشکي — اتوماتیک وویشل",
    howStep4Title:"چیټ خلاصیږي",
    howStep4Desc:"د تادیې وروسته مستقیم پیغام لیږل",
    howStep5Title:"خوند واخلئ",
    howStep5Desc:"د کنسرت وروسته هنرمند ته نقد پاتې رقم",
    howSectionTitle:"دا څنګه کار کوي",
    howSectionSub:"ساده، شفاف، له لټون نه تر اجرا پورې خوندي",
    footerDesc:"د اروپا کې د تایید شوو افغان هنرمندانو د بکولو لومړنۍ پلیټفارم.",
    footerBrowse:"وګورئ",
    footerApply:"غوښتنه",
    footerPricing:"بیې",
    searchArtists:"هنرمندان ولټوئ…",
    bookDirectly:"مستقیم بک کړئ — هیڅ اجنسۍ نشته",
    chatLockedTitle2:"چیټ قفل دی",
    chatLockedBody2:"د پیغامونو د خلاصولو لپاره پیشکي ورکړئ.",
    securedByStripe:"د Stripe لخوا خوندي",
    depositConfirmed2:"پیشکي تایید شوه!",
    continueToChat2:"چیټ ته دوام →",
    balanceCashNote2:"د کنسرت وروسته هنرمند ته نقد پاتې رقم",
    createYourAccount:"خپل حساب جوړ کړئ",
    emailSent2:"بریښنالیک ولیږل شو!",
    checkInbox2:"خپل inbox وګورئ",
    backToSignIn2:"ننوتلو ته شاته",
    enterYourEmail2:"خپل بریښنالیک دننه کړئ، موږ به تاسو ته لینک ولیږو.",
    sendResetLink2:"د بیا تنظیم لینک ولیږئ",
    demoNote2:"کله چې Supabase Auth وصل کړئ دا لرې کیږي.",
    bookingTerms:"د بکنګ شرایط",
    pricingByCountry:"د هیواد له مخې بیې",
    pricesLocal:"قیمتونه د محلي اسعارو کې ښودل کیږي · د Stripe پیشکي اتوماتیک EUR ته بدلیږي",
    noSocialConnected:"هیڅ ټولنیز حساب وصل نه دی",
    noSocialDesc:"دې هنرمند لاهم Spotify یا Instagram نه دی وصل کړی.",
    selectDate2:"نیټه وټاکئ",
    cashAfterConcert:"د کنسرت وروسته نقدي",
    platformOverview2:"د پلیټفارم لنډیز",
    recentBookings:"وروستي بکنګونه",
    allBookings2:"ټول بکنګونه",
    allConversations2:"ټولې خبرې اترې",
    noMessages:"هیڅ پیغام نشته",
    paymentSplit:"د تادیې ویش",
    awazAdmin:"د آواز اداره",
    platformControl:"د پلیټفارم کنترول",
    adminPanel:"د مدیریت پینل",
    pendingApproval:"د تاییدۍ انتظار",
    connectStripe:"Stripe وصل کړئ",
    addSocial:"Spotify او Instagram اضافه کړئ",
    addNow:"اوس اضافه کړئ →",
    noBookingsYet2:"لاهم هیڅ بکنګ نشته. شته نیټې اضافه کړئ!",
    tapToToggle:"د موجود ↔ بند د بدلولو لپاره نیټو ته وټاکئ",
    myBookings2:"زما بکنګونه",
    noBookingsYet3:"لاهم هیڅ بکنګ نشته.",
    noChatsYet2:"چیټونه د پیرودونکو د پیشکي ورکولو وروسته خلاصیږي.",
    noMessagesYet:"لاهم هیڅ پیغام نشته",
    socialMedia:"ټولنیزې رسنۍ",
    myProfile2:"زما پروفایل",
    tapToChange:"د انځور د بدلولو لپاره ووهئ",
    notConnected:"وصل نه دی",
    youReceive:"تاسو ترلاسه کوئ",
    artistPortal:"د هنرمند پورتال",
    depositSplit:"د پیشکي ویش",
    findPerfectArtist:"خپل مناسب هنرمند ومومئ",
    startOver:"بیا پیل کړئ",
    profileUnderReview:"ستاسو پروفایل د بیاکتنې لاندې دی. د Stripe وصلولو او تاییدیې بشپړولو لپاره ننوتئ.",
    submitApplication:"غوښتنه وسپارئ",
    inquiryReceived:"پوښتنه ترلاسه شوه",
    privateInquiry:"خصوصي پوښتنه",
    directToOwner:"مستقیم مالک ته",
    directToOwnerDesc:"شخصي ځواب · د بیې خبرې اترې · ځانګړي کڅوړې",
    budgetRange:"د بودیجې سلسله",
    selectRange:"یوه سلسله وټاکئ…",
    preferredArtist:"غوره هنرمند (اختیاري)",
    notSureYet:"لاهم ډاډه نه یم — مالک ته اجازه ورکړئ چې وړاندیز وکړي",
    noInquiriesYet:"لاهم هیڅ پوښتنه نشته",
    noInquiriesDesc:"د لیدونکو پوښتنې دلته ښکاري کله چې د اړیکو ویجیټ ژوندی وي.",
    yourReply:"ستاسو ځواب (ولیږل شو)",
    marketPricing:"د بازار بیې",
    saveMarketPricing:"د بازار بیې خوندي کړئ",
    connectingStripe:"Stripe سره د وصل کیدو هڅه…",
    stripeSecurity:"Stripe Connect · د بانک کچه امنیت · فوري تادیات",
    loadingSpotify:"Spotify بارول کیږي…",
    spotifyBlocked:"د Spotify ویجیټ د براوزر لخوا بند شو",
    viewOnInstagram:"پر Instagram وګورئ ↗",
    watchOnTikTok:"پر TikTok وګورئ ↗",
    applyAsArtistTitle:"د هنرمند غوښتنه",
    spotifyAppLabel:"د Spotify ایپ:",
    trustStripeDesc:"د بانک کچه کوډ کول",
    trustVerifiedDesc:"هر پروفایل کتل شوی",
    trustChatDesc:"هیڅ منځګړی نه",
    trustFees:"0٪ پټ فیسونه",
    trustFeesDesc:"هغه چې ګورئ هغه ورکوئ",
    browseNow:"← اوس هنرمندان وګورئ",
    escrowTitle:"خوندي امانت",
    escrowDesc:"پیشکي د آواز لخوا تر پیښې تاییدیې وساتل کیږي",
    adminChat:"چیټ",
    adminChatWith:"د هنرمند سره چیټ وکړئ",
    verifyArtist:"تایید کړئ",
    verified2:"تایید شوی ✓",
    pendingVerif:"د تاییدیې انتظار",
    refund:"پیشکي بیرته ورکړئ",
    refundConfirm:"د پیرودونکي ته د بیرته ورکولو تاییدیه",
    addCountry:"هیواد اضافه کړئ",
    yourPrice:"ستاسو بیه",
    performHere:"زه دلته اجرا کوم",
    suspend:"معلق کړئ",
    deposit2:"پیشکي",
    balance:"پاتې رقم",
    messages2:"پیغامونه",
    country:"هیواد",
    message:"پیغام",
    stripeLabel:"Stripe:",
    depositLabel2:"پیشکي:",
    policyLabel:"پالیسي:",
    browserLabel:"براوزر:",
    browserSpotifyDesc:"خپل Spotify پاڼې ته لاړ شئ ← URL د پته بار نه کاپي کړئ",
    pricingClient1:"ټول هنرمندان وړیا وګورئ",
    pricingClient2:"د بکنګ پر وخت د هنرمند پیشکي ورکړئ",
    pricingClient3:"د پیشکي وروسته مستقیم چیټ وکړئ",
    pricingClient4:"پاتې رقم نقداً هنرمند ته ورکول کیږي",
    pricingClient5:"د هنرمند د پالیسۍ له مخې لغوه کړئ",
    pricingArtist1:"وړیا ثبت کړئ",
    pricingArtist2:"خپله بیه وټاکئ",
    pricingArtist3:"خپله پیشکي وټاکئ (لږترلږه €500)",
    pricingArtist4:"خپله د لغو پالیسي وټاکئ",
    pricingArtist5:"د هرې پیشکي 88٪ ترلاسه کړئ",
    pricingArtist6:"12٪ د پلیټفارم فیس — بل هیڅ نه",
    splitLabel1:"د هنرمند پیشکي",
    splitDesc1:"د هنرمند لخوا ټاکل شوی (لږترلږه €500)",
    splitLabel2:"تاسو ترلاسه کوئ (88٪)",
    splitDesc2:"اتوماتیک Stripe ته لیږدول کیږي",
    splitLabel3:"د آواز فیس (12٪)",
    splitDesc3:"د پلیټفارم عملیات",
    howBadge:"ساده او شفاف",
    step1Title:"خپل مناسب هنرمند ومومئ",
    step1Desc:"د ژانر، ښار یا مناسبت له مخې تایید شوي افغان هنرمندان وګورئ. د پیل لپاره ډاډه نه یاست؟ زموږ AI میچر ستاسو د پیښې جزئیات لولي.",
    step1Badge:"وړیا وګورئ",
    step2Title:"نیټه وټاکئ — سمدستي",
    step2Desc:"هیڅ بریښنالیکونه نه. هر هنرمند خپل کلینډر ژوندی ساتي. هره خلاصه نیټه وټاکئ.",
    step2Badge:"ژوندی شتون",
    step3Title:"په 2 دقیقو کې تایید کړئ",
    step3Desc:"د پیښې ډول او د اړیکو معلومات دننه کړئ. د هنرمند د لغو پالیسي پخوا له ژمنې وروښودل کیږي.",
    step3Badge:"2 دقیقې وخت نیسي",
    step4Title:"خپل بکنګ د Stripe له لارې خوندي کړئ",
    step4Desc:"د هنرمند لخوا ټاکل شوی پیشکي (لږترلږه €500) د Stripe له لارې ورکړئ.",
    step4Badge:"د بانک کچه امنیت",
    step5Title:"چیټ د تادیې پر وخت خلاصیږي",
    step5Desc:"د پیشکي تاییدیې سمدستي یو خصوصي پیغام کانال خلاصیږي.",
    step5Badge:"مستقیم پیغام",
    step6Title:"راشئ او د هر څه خوند واخلئ",
    step6Desc:"هنرمند اجرا کوي. د کنسرت وروسته پاتې رقم نقداً مستقیم هنرمند ته ورکوئ.",
    step6Badge:"نقدي تادیه",
    depositStripe:"پیشکي (Stripe)",
    unverified:"تایید نه شوی",
    reinstate:"بیرته راوستل",
    paymentModel:"د تادیې ماډل",
    connected:"وصل شو!",
    youllReceive:"تاسو به ترلاسه کړئ",
    onYourWay:"تاسو پر لاره یاست!",
    areYouArtist:"ایا هنرمند یاست؟",
    buttonInstead:"تڼۍ پرځای.",
    spotifyInstructions2:"پروفایل ته لاړ شئ ← درې نقطې (⋯) ← شریکول ← لینک کاپي کړئ",
    spotifyLinkRecognized:"د Spotify لینک وپیژندل شو",
    instagramRecognized:"د Instagram پروفایل وپیژندل شو",
    howToFindLink:"خپل لینک چیرې ومومئ",
    spotifyInstructions:"د Spotify ایپ: پروفایل ته لاړ شئ ← درې نقطې (⋯) ← شریکول ← د هنرمند لینک کاپي کړئ",
    artistProfileNotFound:"د هنرمند پروفایل ونه موندل شو",
    noStripe:"Stripe نشته",
    recentBookingsLabel:"وروستي بکنګونه",
    demoLiveDemo:"✦ ژوندی ښودنه",
    demoHeroTitle:"آواز د هنرمند په توګه تجربه کړئ",
    demoHeroSub:"وګورئ چې هنرمندان پلیټفارم څنګه کاروي — له پروفایل نه تر بکنګونو، ژوندي سندرې غوښتنو او عایداتو ډشبورډ.",
    demoApplyBtn:"د هنرمند غوښتنه →",
    demoBrowseBtn:"هنرمندان وګورئ",
    demoOverviewTab:"لنډیز",
    demoProfileTab:"پروفایل",
    demoBookingTab:"بکنګ",
    demoDashboardTab:"ډشبورډ",
    demoSongTab:"د سندرې غوښتنې",
    demoPlatformOverview:"د پلیټفارم لنډیز",
    demoPlatformSub:"هنرمند د آواز سره د یوځای کیدو سره هر څه ترلاسه کوي",
    demoSeeDemoProfile:"د هنرمند پروفایل ډیمو وګورئ →",
    demoProfileTitle:"د هنرمند پروفایل پاڼه",
    demoProfileSub:"پیرودونکي ستاسو پروفایل موندلو کې دا وویني",
    demoLivePreview:"ژوندی مخکتنه",
    demoBookingTitle:"د بکنګ جریان",
    demoBookingSub:"پیرودونکي څنګه بک کوي او پیش پیسې ورکوي",
    demoDepositNow:"اوس د ورکولو پیش پیسې",
    demoPayBtn:"پیش پیسې ورکړئ →",
    demoConfirmed:"بکنګ تایید شو!",
    demoDashTitle:"د هنرمند ډشبورډ",
    demoDashSub:"هنرمند د ننوتلو پر مهال څه وویني",
    demoUpcoming:"راتلونکي بکنګونه",
    demoAllBookings:"ټول بکنګونه",
    demoCalTitle:"شتون",
    demoAvailable:"خالي",
    demoBooked:"بک شوی",
    demoEarnings2025:"د ۲۰۲۵ عواید",
    demoTotal2025:"ټول ۲۰۲۵",
    demoSongTitle:"د سندرې غوښتنې سیستم",
    demoSongSub:"مهمانان ستاسو QR کوډ سکین کوي — تاسو غوښتنې ژوندي وینئ",
    demoGuestSide:"د مهمان تجربه",
    demoArtistSide:"د هنرمند لید — ژوندي غوښتنې",
    demoRequestSong:"سندره وغواړئ",
    demoSongTitleField:"د سندرې عنوان *",
    demoYourName:"ستاسو نوم *",
    demoFreeRequest:"د شپې لومړۍ سندره وړیا ده! 🎵",
    demoSendFree:"وړیا غوښتنه واستوئ →",
    demoSentTitle:"واستول شو!",
    demoJoinTitle:"آیا د آواز سره یوځای کیدو ته چمتو یاست؟",
    demoJoinSub:"د اروپا کې د افغان ډیاسپورا نه بکنګونه ترلاسه کول پیل کړئ. غوښتنه وړیا ده.",
    demoJoinBtn:"د هنرمند غوښتنه — وړیا →",
    demoFeat1Title:"مسلکي پروفایل",
    demoFeat1Desc:"عامه هنرمند پاڼه د بایو، آلاتو، ټولنیزو لینکونو، بیاکتنو او بکنګ کلنډر سره.",
    demoFeat2Title:"مستقیم بکنګونه",
    demoFeat2Desc:"پیرودونکي د Stripe له لارې پیش پیسې ورکوي. تاسو اتوماتیک ۸۸٪ ترلاسه کوئ.",
    demoFeat3Title:"جوړ شوی پیغام",
    demoFeat3Desc:"د پیش پیسو پرداخت وروسته ټول اړیکې پلیټفارم کې کیږي. بدون واټساپ، بدون ایمیل.",
    demoFeat4Title:"ژوندي د سندرې غوښتنې",
    demoFeat4Desc:"ستاسو د پیښې پر مهال مهمانان ستاسو QR کوډ سکین کوي. تاسو غوښتنې ژوندي وینئ.",
    demoFeat5Title:"د عاید ډشبورډ",
    demoFeat5Desc:"د بکنګونو، معلق پیش پیسو او ټول عاید بلاتاخیره لید.",
    demoFeat6Title:"تایید شوي بیاکتنې",
    demoFeat6Desc:"یوازې هغه مهمانان چې تاسو یې ریښتیا بک کړي دي کولی شي بیاکتنې پریږدي.",
    demoFeat7Title:"اروپایي رسیدنه",
    demoFeat7Desc:"د اروپا کې افغان ډیاسپورا ته ورسیږئ — نارویجن، سویدن، جرمني، بریتانیا، فرانسه.",
    demoFeat8Title:"سمدلاسه خبرتیاوې",
    demoFeat8Desc:"کله چې بکنګ راشي، پیغام وصل شي یا سندره وغوښتل شي خبر شئ.",
    demoFieldName:"ستاسو نوم",
    demoFieldEmail:"برېښنالیک",
    demoFieldEventType:"د پیښې ډول",
    demoFieldDate:"د پیښې نیټه",
    demoFieldDatePh:"د بیلګې: ۱۵ جون ۲۰۲۵",
    demoFieldTypePh:"واده / اختر / ګالا",
    demoTotalEarned:"ټول ګټل شوي",
    demoThisYear:"سږکال",
    demoConfirmedLabel:"تایید شوی",
    demoNewRequests:"نوې غوښتنې",
    demoRatingLabel:"بیاکتنې",
    demoPendingLabel:"انتظار",
    demoSeeSongReq:"د سندرې غوښتنې وګورئ →",
    demoSeeArtistDash:"د هنرمند ډشبورډ →",
    demoTryBooking:"د بکنګ جریان هڅه وکړئ →",
    demoNotified:"هنرمند سمدلاسه خبرتیا ترلاسه کوي.",
    demoDepositSecured:"د Stripe له لارې پیش پیسې خوندي دي.",
    demoArtistGets:"هنرمند ترلاسه کوي",
    demoAwazKeeps:"آواز ساتي",
    demoSplitNote:"د هرې €۱۰۰۰ پیش پیسو لپاره، تاسو €۸۸۰ (۸۸٪) مستقیم خپل Stripe حساب ته ترلاسه کوئ.",
    demoSongPh:"د بیلګې: لیلي جانه، بیا که بیا…",
    demoNamePh:"د بیلګې: لیلا، احمد…",

    applyWelcome:"Awaz ته ښه راغلاست!",
    applyStep1Title:"Awaz سره یوځای شئ — ګام ۱ له ۲",
    applyStep2Title:"تقریباً بشپړ — ګام ۲ له ۲",
    applyInEarning:"د Awaz هنرمندان کماوي",
    applyKeep:"د هر بک نه",
    applyFree:"د یوځای کیدو لپاره",
    applyApproved:"د تأیید لپاره",
    applyNextSteps:"بعد څه کیږي",
    applyNext1:"خپل بریښنالیک وګورئ او حساب تأیید کړئ",
    applyNext2:"بیرته راشئ او Signin کلیک کړئ",
    applyNext3:"خپل پروفایل بشپړ کړئ — انځور، بیو او قیمتونه اضافه کړئ",
    applyNext4:"د ۲۴ ساعتونو دننه تأیید شئ او بکونه ترلاسه کړئ",
    applyProTip:"د بشپړ پروفایل سره هنرمندان ۳ چنده ډیر بکونه ترلاسه کوي!",
    applySignInComplete:"Signin کړئ او پروفایل بشپړ کړئ →",
    chatUnlocked:"د هنرمند سره چیټ سمدلاسه خلاصیږي",
    availableIn:"شتون لري",
    performingCountriesDesc:"دا هنرمند لاندې هیوادونو کې اجرا کوي",
    completeProfileCta:"د بکونو ترلاسه کولو لپاره پروفایل بشپړ کړئ",
    artistsLive:"هنرمندان اوس د اروپا په سراسر کې بک کیږي",
    artistPerforms:"هنرمند راځي او ستاسو پیښه کې اجرا کوي",
    depositLabel:"پیش پیسه",
    bandBookTitle:"تاسو څنګه غواړئ بک کړئ؟",
    bandBookSub:"یو غوره کړئ — دواړه اسانه دي ✓",
    bandOptionAHeading:"⭐ بشپړ ډلې — د ګروپ په توګه بک کړئ",
    bandNoBands:"لاهم هیڅ بشپړه ډله نشته",
    bandNoBandsDesc:"هغه هنرمندان چې خپله ډله تنظیم کوي دلته ښکاره کیږي. لاندې خپله ډله جوړه کړئ.",
    bandBuildOwn:"خپله ډله جوړه کړئ",
    bandPickMusicians:"موسیقارانو غوره کړئ",
    bandPickDesc:"د پلیټفارم ریښتیني هنرمندانو نه غوره کړئ — یوازې هغه چې واقعاً شتون لري",
    bandDisplayPrices:"قیمتونه ښودل",
    bandEasiest:"⭐ تر ټولو اسانه",
    bandCompleteAs:"بشپړ انسامبل — د لخوا ترتیب شوی",
    bandAvailableDate:"✓ پدې نیټه شتون لري",
    bandNotAvailable:"ممکن پدې نیټه شتون ونلري — د تأیید لپاره ورسره اړیکه ونیسئ",
    bandStep1:"📅 ګام ۱ — د پیښې نیټه غوره کړئ",
    bandStep2Instr:"🎵 ګام ۲ — کوم آلات غواړئ؟",
    bandStep3Artists:"👤 ګام ۳ — هنرمندان غوره کړئ",
    bandStep2Artists:"👤 ګام ۲ — هنرمندان غوره کړئ",
    bandChooseWho:"غوره کړئ چا وغږوي",
    bandFreeSuffix:"وړیا",
    bandBusySuffix:"(بوخت)",
    bandReviewPay:"بیاکتنه او ورکونه →",
    bandBackEdit:"→ سمول",
    bandTapInstruments:"اړین آلاتو ته ټپ کړئ ↑",
    bandBusyWarning:"ځینې هنرمندان پدې نیټه بوخت دي — لاندې وړاندیزونه وګورئ",
    bandSwitchTo:"بدلون →",
    bandFreeLabel:"✓ شتون لري",
    bandBusyLabel:"✗ بوخت",
    bandTotalDeposit:"ټول پیش پیسه",
    bandMusicianCount:"موسیقاران",
    bandSecureNote:"د Stripe له لارې خوندي پیش پیسه · پاتې برخه د پیښې وروسته نغده هنرمندانو ته · د بریالي ورکونې پرته هیڅ بک نشته",
    bandPayBtn:"د Stripe له لارې ورکونه →",
    bandConfirmTitle:"خپله ډله تأیید کړئ",
    bandReadyTitle:"چمتو ډله",
    soloOnlyNote:"دا یوازې سندریز بکوي — هیڅ آله نشته",
    soloNeedInstr:"طبله، کیبورد یا نور موسیقاران ته اړتیا لرئ؟ د 🎼 ډله بک کولو نه استفاده وکړئ.",
    soloSidebarNote:"یوازې سندریز — هیڅ آله نشته.",
    soloSidebarTip:"طبله یا کیبورد غواړئ؟ د 🎼 ډله بک کولو نه استفاده وکړئ.",
    bookingTermsSoloNote:"سولو بک کول = یوازې سندریز، هیڅ آله نشته",
    bookingTermsSoloDesc:"که طبله، کیبورد یا نور موسیقاران غواړئ، بشپړه ډله غوره کړئ یا د ډله بک کولو نه استفاده وکړئ.",
    bookingTermsVocalistOnly:"دا بک یوازې د سندریز لپاره دی",
    bookingTermsVocalistOnlyDesc:"طبله، کیبورد یا نورو آلاتو ته اړتیا لرئ؟ د 🎼 ډله بک کولو نه استفاده وکړئ.",
    myBandTitle:"زما ډله",
    myBandDesc:"دا ستاسو لومړنۍ ګروپ دی. تاسو پریکړه کوئ چې چا شامل وي. پیرودونکي کولی شي تاسو د بشپړ انسامبل په توګه بک کړي.",
    myBandCurrentMembers:"اوسني غړي",
    myBandAddMember:"د ډلې غړی اضافه کړئ",
    myBandCombinedDeposit:"ګډه پیش پیسه (تاسو + ډله)",
    myBandSaveBtn:"د ډلې تنظیمات خوندي کړئ",
    myBandSaved:"✓ ډله خوندي شوه!",
    myBandTip:"💡 ستاسو د ډلې تنظیمات ستاسو عامه پروفایل کې ښودل کیږي.",
    myBandPrimary:"لومړنی",
    hasBand:"ډله لري",
    inDemand:"پوښتنه لري",
    bookEarlySub:"د خپلې نیټې د ډاډمن کولو لپاره ژر بک کړئ",
    pricingHowTitle:"💡 ستاسو قیمت ګذاري څنګه کار کوي",
    pricingDepositLabel:"پیش پیسه",
    pricingDepositDesc:"پیرودونکي دا د بک تأیید لپاره د Stripe له لارې دمخه ورکوي",
    pricingCountryLabel:"د هیواد له مخې",
    pricingCountryDesc:"د ثبت نام وروسته، خپل بشپړ قیمتونه د هر هیواد لپاره داشبورډ کې تنظیم کړئ",
    pricingAfterLabel:"د پیښې وروسته",
    pricingAfterDesc:"پاتې برخه مستقیم تاسو ته نغده ورکول کیږي",
    soloDepositLabel:"سولو پیش پیسه",
    soloDepositSub:"کله چې یوازې اجرا کوئ — یوازې سندریز، هیڅ آله نشته · لږترلږه €500",
    soloImportant:"مهم: کله چې پیرودونکي تاسو سولو بکوي، یوازې ستاسو غږ ترلاسه کوي. د طبله، کیبورد لپاره باید جلا ډله بکه کړي.",
    withBandDepositLabel:"د ډلې سره پیش پیسه",
    withBandDepositSub:"کله چې خپله بشپړه ډله راوړئ · لږترلږه €800",
    keepPct:"تاسو د پیش پیسو ۸۸٪ ساتئ =",
    balanceCashAfter:"+ پاتې برخه د پیښې وروسته نغده",
  },
};

// ── Email notification helper ─────────────────────────────────────────
async function sendEmailNotification(payload:{
  type:"new_booking"|"new_message"|"booking_confirmed"|"offer_sent"|"offer_accepted"|"new_chat_message"|"booking_reminder"|"artist_approved"|"artist_rejected";
  toEmail?:string; toName?:string; fromName?:string; message?:string;
  artistName?:string; bookingDate?:string; depositAmount?:number;
  currency?:string; eventType?:string; feedbackText?:string;
}){
  if(!payload.toEmail) return;
  try{
    const SUPA_URL=(import.meta as any).env?.VITE_SUPABASE_URL;
    const SUPA_KEY=(import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
    if(!SUPA_URL||!SUPA_KEY) return;
    await fetch(`${SUPA_URL}/functions/v1/send-email`,{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${SUPA_KEY}`,"apikey":SUPA_KEY},
      body:JSON.stringify(payload),
    });
  }catch{ /* silent fail — never block UI */ }
}

// ── Slug utility — creates clean SEO URLs for artist profiles ─────────
const slugify=(name:string)=>name
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g,"")   // keep letters, digits, spaces, hyphens
  .trim()
  .replace(/\s+/g,"-");           // spaces → hyphens
let _lang = (() => { try { return localStorage.getItem('awaz-lang')||'en'; } catch { return 'en'; } })();
// Translation helper — falls back to English
const t = key => TRANSLATIONS[_lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
// RTL check — Dari and Pashto both use Arabic script, right-to-left
const isRTLLang = l => l==='da'||l==='ps';
// Dynamic months/weekdays from active language
const getMonths = () => (TRANSLATIONS[_lang]||TRANSLATIONS.en).months;
const getWdays  = () => (TRANSLATIONS[_lang]||TRANSLATIONS.en).wdays;
// Proxy arrays — used as MONTHS[i] throughout the codebase
const MONTHS = new Proxy([], { get:(_,k) => typeof k==='string'&&!isNaN(k) ? getMonths()[+k] : getMonths()[k] });
const WDAYS  = new Proxy([], { get:(_,k) => typeof k==='string'&&!isNaN(k) ? getWdays()[+k]  : getWdays()[k]  });
const NOW    = new Date();
const MK     = `${NOW.getFullYear()}-${NOW.getMonth()}`;
const _nm    = NOW.getMonth()+1;
const MK2    = _nm>11?`${NOW.getFullYear()+1}-0`:`${NOW.getFullYear()}-${_nm}`;

// Auth handled entirely by Supabase — no client-side hashing

// ─────────────────────────────────────────────────────────────────────
// TECHNICAL NOTE — WHY IFRAMES ARE BLOCKED
// ─────────────────────────────────────────────────────────────────────
// When this app runs inside an iframe sandbox (e.g. Claude.ai preview),
// the host page's Content-Security-Policy blocks nested iframes from
// spotify.com with: "frame-src 'self'".
//
// On your deployed Vercel site (naghma.no / awaz.no), this DOES NOT
// apply — you control the headers. Add to vercel.json:
//
//   "headers": [{
//     "source": "/(.*)",
//     "headers": [{
//       "key": "Content-Security-Policy",
//       "value": "frame-src 'self' open.spotify.com *.youtube.com"
//     }]
//   }]
//
// SOLUTION: The SocialBar below never uses iframes as primary UI.
// It shows a beautiful native card with all data, plus a toggleable
// "Load widget" button that attempts the iframe only on user request.
// This is the pattern used by Bandcamp, SoundCloud, and Linktree.
// ─────────────────────────────────────────────────────────────────────

// ── URL parsers ───────────────────────────────────────────────────────
function parseSpotifyArtistId(input="") {
  if (!input) return null;
  const s = input.trim();
  const uri = s.match(/spotify:artist:([A-Za-z0-9]+)/);
  if (uri) return uri[1];
  const url = s.match(/\/artist\/([A-Za-z0-9]+)/);
  if (url) return url[1];
  if (/^[A-Za-z0-9]{22}$/.test(s)) return s;
  return null;
}

function parseInstagramHandle(input="") {
  if (!input) return null;
  const s = input.trim();
  const url = s.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  if (url) return "@"+url[1];
  const bare = s.replace(/^@/,"");
  if (/^[A-Za-z0-9._]{1,30}$/.test(bare)) return "@"+bare;
  return null;
}

function parseYouTubeId(input="") {
  if (!input) return null;
  const s = input.trim();
  // Watch URL: youtube.com/watch?v=ID
  const watch = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (watch) return {type:"video",id:watch[1]};
  // Short URL: youtu.be/ID
  const short = s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (short) return {type:"video",id:short[1]};
  // Channel: youtube.com/channel/UCxxxxx
  const chan = s.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]+)/);
  if (chan) return {type:"channel",id:chan[1]};
  // Handle: youtube.com/@handle
  const handle = s.match(/youtube\.com\/@([A-Za-z0-9._-]+)/);
  if (handle) return {type:"handle",id:"@"+handle[1],url:s};
  return null;
}

function parseTikTokHandle(input="") {
  if (!input) return null;
  const s = input.trim();
  const url = s.match(/tiktok\.com\/@([A-Za-z0-9._]+)/);
  if (url) return "@"+url[1];
  const bare = s.replace(/^@/,"");
  if (/^[A-Za-z0-9._]{2,24}$/.test(bare)) return "@"+bare;
  return null;
}

// ── SpotifyEmbed: iframe with graceful load-detection fallback ─────────
function SpotifyEmbed({ artistId, profileUrl, artist }) {
  if (!artistId && !profileUrl) return null;

  const url = profileUrl || `https://open.spotify.com/artist/${artistId}`;
  const listeners = artist?.spotify?.monthlyListeners;
  const tracks = artist?.spotify?.topTracks?.filter(Boolean) || [];

  return (
    <div style={{
      background:"linear-gradient(135deg,rgba(29,185,84,0.08),rgba(29,185,84,0.03))",
      border:"1px solid rgba(29,185,84,0.2)",
      borderRadius:12,padding:"16px 18px",
    }}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{width:36,height:36,borderRadius:8,background:"#1DB954",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="black">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
        </div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,color:"#EDE4CE",fontSize:14}}>Spotify</div>
          {listeners&&<div style={{color:"rgba(237,228,206,0.6)",fontSize:12}}>{listeners} monthly listeners</div>}
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{display:"flex",alignItems:"center",gap:6,background:"#1DB954",color:"#000",borderRadius:20,padding:"8px 16px",fontSize:12,fontWeight:700,textDecoration:"none",flexShrink:0}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="black"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
          Open in Spotify
        </a>
      </div>
      {/* Top tracks */}
      {tracks.length>0&&(
        <div>
          <div style={{fontSize:10,fontWeight:700,color:"rgba(29,185,84,0.7)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8}}>TOP TRACKS</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {tracks.slice(0,3).map((track:string,i:number)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid rgba(29,185,84,0.08)"}}>
                <span style={{color:"rgba(29,185,84,0.5)",fontSize:11,fontWeight:700,width:16,flexShrink:0}}>{i+1}</span>
                <span style={{color:"rgba(237,228,206,0.8)",fontSize:13}}>{track}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ── SocialBar — primary display on public artist profile ──────────────
function SocialBar({ artist }) {
  const { spotify, instagram, youtube, tiktok } = artist;
  if (!spotify && !instagram && !youtube && !tiktok) return null;

  const spotifyId = spotify ? parseSpotifyArtistId(spotify.profileUrl||"") : null;
  const ytParsed  = youtube ? parseYouTubeId(youtube.url||"") : null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>

      {/* ── SPOTIFY ── */}
      {spotify && (
        <div style={{background:C.spotifyCard,border:"1px solid rgba(29,185,84,0.2)",borderRadius:14,overflow:"hidden"}}>
          <div style={{height:2,background:"linear-gradient(90deg,#1DB954,#16A34A)"}}/>
          <div style={{padding:"16px 16px 4px"}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#1DB954">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,color:"#1DB954"}}>Spotify</span>
              </div>
              {spotify.profileUrl && (
                <a href={spotify.profileUrl} target="_blank" rel="noopener noreferrer"
                  style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"#1DB954",opacity:0.7,textDecoration:"none"}}>
                  Open ↗
                </a>
              )}
            </div>

            {/* Listener count */}
            {spotify.monthlyListeners && (
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:12}}>
                <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontWeight:800,color:C.text,lineHeight:1}}>{spotify.monthlyListeners}</span>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.muted}}>{ t('monthlyListeners') }</span>
              </div>
            )}

            {/* Top tracks — always visible */}
            {spotify.topTracks?.length > 0 && (
              <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:12}}>
                {spotify.topTracks.map((t,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",background:"rgba(29,185,84,0.06)",borderRadius:8,border:"1px solid rgba(29,185,84,0.1)"}}>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:800,color:"#1DB954",width:14,textAlign:"center",flexShrink:0}}>{i+1}</span>
                    <div style={{width:30,height:30,borderRadius:6,background:"rgba(29,185,84,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}></div>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:C.textD,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t}</span>
                    {spotify.profileUrl && (
                      <a href={spotify.profileUrl} target="_blank" rel="noopener noreferrer"
                        style={{width:26,height:26,borderRadius:"50%",background:"rgba(29,185,84,0.15)",border:"1px solid rgba(29,185,84,0.3)",display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",fontSize:10,color:"#1DB954",flexShrink:0}}>▶</a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional: load real iframe embed on demand */}
          <div style={{padding:"0 16px 16px"}}>
            {spotifyId && <SpotifyEmbed artistId={spotifyId} profileUrl={spotify.profileUrl} artist={artist}/>}
            {!spotifyId && spotify.profileUrl && (
              <a href={spotify.profileUrl} target="_blank" rel="noopener noreferrer" style={{
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                background:"#1DB954",color:"#000",borderRadius:20,padding:"12px",
                textDecoration:"none",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:700,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="black"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                Play on Spotify
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── YOUTUBE ── */}
      {youtube && (
        <div style={{background:C.youtubeCard,border:"1px solid rgba(255,0,0,0.2)",borderRadius:14,overflow:"hidden"}}>
          <div style={{height:2,background:"linear-gradient(90deg,#FF0000,#CC0000)"}}/>
          <div style={{padding:"16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <svg width="20" height="14" viewBox="0 0 20 14" fill="#FF0000">
                  <path d="M19.582 2.186A2.506 2.506 0 0 0 17.82.422C16.254 0 10 0 10 0S3.746 0 2.18.422A2.506 2.506 0 0 0 .418 2.186C0 3.754 0 7 0 7s0 3.246.418 4.814A2.506 2.506 0 0 0 2.18 13.578C3.746 14 10 14 10 14s6.254 0 7.82-.422a2.506 2.506 0 0 0 1.762-1.764C20 10.246 20 7 20 7s0-3.246-.418-4.814zM8 10V4l5.333 3L8 10z"/>
                </svg>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,color:"#FF4444"}}>YouTube</span>
              </div>
              <a href={youtube.url} target="_blank" rel="noopener noreferrer"
                style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"#FF4444",opacity:0.8,textDecoration:"none"}}>
                {youtube.handle||"Open"} ↗
              </a>
            </div>
            {youtube.subscribers && (
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:10}}>
                <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontWeight:800,color:C.text,lineHeight:1}}>{youtube.subscribers}</span>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.muted}}>{ t('subscribers') }</span>
              </div>
            )}
            {/* Latest video embed — also iframe, same fallback pattern */}
            {ytParsed?.type==="video" && (
              <div style={{borderRadius:10,overflow:"hidden",border:"1px solid rgba(255,0,0,0.15)",marginTop:4}}>
                <iframe
                  src={`https://www.youtube.com/embed/${ytParsed.id}?rel=0&modestbranding=1`}
                  width="100%" height="200" frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen loading="lazy"
                  style={{display:"block"}}
                />
              </div>
            )}
            {(ytParsed?.type==="channel"||ytParsed?.type==="handle") && (
              <a href={youtube.url} target="_blank" rel="noopener noreferrer" style={{
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                background:"#FF0000",color:"#fff",borderRadius:20,padding:"11px",
                textDecoration:"none",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,marginTop:4,
              }}>
                <svg width="14" height="10" viewBox="0 0 20 14" fill="white"><path d="M19.582 2.186A2.506 2.506 0 0 0 17.82.422C16.254 0 10 0 10 0S3.746 0 2.18.422A2.506 2.506 0 0 0 .418 2.186C0 3.754 0 7 0 7s0 3.246.418 4.814A2.506 2.506 0 0 0 2.18 13.578C3.746 14 10 14 10 14s6.254 0 7.82-.422a2.506 2.506 0 0 0 1.762-1.764C20 10.246 20 7 20 7s0-3.246-.418-4.814zM8 10V4l5.333 3L8 10z"/></svg>
                Watch on YouTube
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── INSTAGRAM ── */}
      {instagram && (
        <div style={{background:C.instagramCard,border:"1px solid rgba(225,48,108,0.2)",borderRadius:14,overflow:"hidden"}}>
          <div style={{height:2,background:"linear-gradient(90deg,#833AB4,#FD1D1D,#F77737)"}}/>
          <div style={{padding:"16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:20,height:20,borderRadius:5,background:"linear-gradient(135deg,#833AB4,#FD1D1D,#F77737)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                </div>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,background:"linear-gradient(90deg,#C084FC,#FB7185)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Instagram</span>
              </div>
              <a href={instagram.profileUrl} target="_blank" rel="noopener noreferrer"
                style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"#E1306C",textDecoration:"none",opacity:0.8}}>
                {instagram.handle} ↗
              </a>
            </div>
            {instagram.followers && (
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:12}}>
                <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontWeight:800,color:C.text,lineHeight:1}}>{instagram.followers}</span>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.muted}}>{ t('followers') }</span>
              </div>
            )}
            <a href={instagram.profileUrl} target="_blank" rel="noopener noreferrer" style={{
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              background:"linear-gradient(135deg,#833AB4,#E1306C,#F77737)",color:"#fff",borderRadius:20,padding:"11px",
              textDecoration:"none",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,
            }}>{t('viewOnInstagram')}</a>
          </div>
        </div>
      )}

      {/* ── TIKTOK ── */}
      {tiktok && (
        <div style={{background:C.tiktokCard,border:"1px solid rgba(105,201,208,0.2)",borderRadius:14,overflow:"hidden"}}>
          <div style={{height:2,background:"linear-gradient(90deg,#69C9D0,#EE1D52)"}}/>
          <div style={{padding:"16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:20,height:20,borderRadius:4,background:"#000",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>♪</div>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,color:C.text}}>TikTok</span>
              </div>
              <a href={`https://tiktok.com/${tiktok.handle}`} target="_blank" rel="noopener noreferrer"
                style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"#69C9D0",textDecoration:"none",opacity:0.8}}>
                {tiktok.handle} ↗
              </a>
            </div>
            {tiktok.followers && (
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:12}}>
                <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontWeight:800,color:C.text,lineHeight:1}}>{tiktok.followers}</span>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.muted}}>{ t('followers') }</span>
              </div>
            )}
            <a href={`https://tiktok.com/${tiktok.handle}`} target="_blank" rel="noopener noreferrer" style={{
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              background:"linear-gradient(135deg,#69C9D0,#EE1D52)",color:"#fff",borderRadius:20,padding:"11px",
              textDecoration:"none",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,
            }}>{t('watchOnTikTok')}</a>
          </div>
        </div>
      )}

    </div>
  );
}



const Geo = ({ id="g", op=0.04 }) => {
  const gc = C.gold, sc = C.saffron;
  return(
  <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:op,pointerEvents:"none"}} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id={id} width="72" height="72" patternUnits="userSpaceOnUse">
        <polygon points="36,3 68,19.5 68,52.5 36,69 4,52.5 4,19.5" fill="none" stroke={gc} strokeWidth="0.7"/>
        <polygon points="36,12 60,25 60,47 36,60 12,47 12,25" fill="none" stroke={sc} strokeWidth="0.38"/>
        <circle cx="36" cy="36" r="4.5" fill="none" stroke={gc} strokeWidth="0.48"/>
        <circle cx="36" cy="36" r="1.4" fill={gc} opacity="0.28"/>
        <line x1="36" y1="3"  x2="36" y2="12" stroke={gc} strokeWidth="0.38"/>
        <line x1="68" y1="19.5" x2="60" y2="25" stroke={gc} strokeWidth="0.38"/>
        <line x1="68" y1="52.5" x2="60" y2="47" stroke={gc} strokeWidth="0.38"/>
        <line x1="36" y1="69" x2="36" y2="60" stroke={gc} strokeWidth="0.38"/>
        <line x1="4"  y1="52.5" x2="12" y2="47" stroke={gc} strokeWidth="0.38"/>
        <line x1="4"  y1="19.5" x2="12" y2="25" stroke={gc} strokeWidth="0.38"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${id})`}/>
  </svg>
  );
};

// ── Bottom Sheet (mobile modal) ───────────────────────────────────────
function Sheet({ open, onClose, children, title, maxH = "92vh" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:800,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.72)"}} onClick={onClose}/>
      <div ref={ref} style={{
        position:"relative",background:C.card,borderRadius:"20px 20px 0 0",
        maxHeight:maxH,display:"flex",flexDirection:"column",
        boxShadow:"0 -20px 60px rgba(0,0,0,0.8)",
        animation:"slideUp 0.28s cubic-bezier(0.32,0.72,0,1) both",
      }}>
        {/* Drag handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"12px 0 4px"}}>
          <div style={{width:40,height:4,borderRadius:2,background:C.borderM}}/>
        </div>
        {title && (
          <div style={{padding:"8px 20px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text}}>{title}</div>
            <button onClick={onClose} style={{width:32,height:32,borderRadius:"50%",background:C.surface,border:"none",color:C.muted,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        )}
        <div style={{flex:1,overflow:"auto",overscrollBehavior:"contain"}}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Bottom Navigation (mobile) ────────────────────────────────────────
// ── Stars ─────────────────────────────────────────────────────────────────────
const Stars = ({ rating=0, count=0, size=12 }) => (
  <div style={{display:"flex",alignItems:"center",gap:4}}>
    <div style={{display:"flex",gap:1}}>
      {[1,2,3,4,5].map(i=>(
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
          fill={i<=Math.round(rating)?C.gold:"rgba(200,168,74,0.2)"} stroke="none">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
        </svg>
      ))}
    </div>
    {count>0&&<span style={{color:C.muted,fontSize:size,lineHeight:1}}>{rating.toFixed(1)} ({count})</span>}
  </div>
);

// ── Badge ─────────────────────────────────────────────────────────────────────
const Badge = ({ children, color=C.gold, sm=false }) => (
  <span style={{
    display:"inline-flex",alignItems:"center",
    background:color+"18",color,
    border:`1px solid ${color}44`,
    borderRadius:20,padding:sm?"2px 7px":"3px 10px",
    fontSize:sm?10:11,fontWeight:700,lineHeight:1.4,
    letterSpacing:"0.3px",flexShrink:0,
  }}>{children}</span>
);

// ── HR divider ────────────────────────────────────────────────────────────────
const HR = ({ color=C.gold, my=14 }) => (
  <div style={{height:1,background:color+"44",margin:`${my}px 0`,flexShrink:0}}/>
);

function BottomNav({ active, onNav, items }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // SVG icon library
  const Icon = ({id}:{id:string}) => {
    const icons:Record<string,any> = {
      overview:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
      bookings:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
      calendar:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>,
      messages:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
      pricing:   <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
      profile:   <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
      social:    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
      settings:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
      artists:   <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
      inquiries: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
      finance:   <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
      chat:      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
      songreqs:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
      more:      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
    };
    return icons[id]||icons["more"];
  };

  // Show 4 primary + "More" button
  const primary = items.slice(0, 4);
  const secondary = items.slice(4);
  const moreIsActive = secondary.some(i => i.id === active);
  const totalBadge = secondary.reduce((s:number, i:any) => s + (i.badge||0), 0);

  const NavBtn = ({item, onClick, isActive}:{item:any;onClick:()=>void;isActive:boolean}) => (
    <button onClick={onClick}
      style={{
        flex:1,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",gap:4,background:"transparent",border:"none",
        cursor:"pointer",padding:"8px 4px",position:"relative",
        WebkitTapHighlightColor:"transparent",minWidth:0,minHeight:58,
      }}>
      {isActive&&(
        <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",
          width:24,height:2,borderRadius:2,background:C.gold}}/>
      )}
      <div style={{
        position:"relative",width:36,height:36,display:"flex",
        alignItems:"center",justifyContent:"center",
        background:isActive?`rgba(200,168,74,0.1)`:"transparent",
        borderRadius:10,transition:"all 0.15s",
        color:isActive?C.gold:"rgba(255,255,255,0.45)",
      }}>
        <Icon id={item.id}/>
        {(item.badge||0)>0&&(
          <div style={{
            position:"absolute",top:-3,right:-5,
            background:C.ruby,color:"#fff",borderRadius:8,
            fontSize:9,fontWeight:800,padding:"1px 4px",
            minWidth:15,textAlign:"center",
            border:"1.5px solid rgba(13,11,21,1)",
          }}>{(item.badge||0)>9?"9+":(item.badge||0)}</div>
        )}
      </div>
      <span style={{
        fontSize:10,fontWeight:isActive?700:400,
        color:isActive?C.gold:"rgba(255,255,255,0.45)",
        letterSpacing:"0.2px",lineHeight:1,fontFamily:"'DM Sans',sans-serif",
      }}>{item.label}</span>
    </button>
  );

  return(
    <>
      {/* ── Bottom bar ── */}
      <nav style={{
        position:"fixed",bottom:0,left:0,right:0,zIndex:200,
        background:"rgba(10,8,18,0.97)",
        backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
        borderTop:`1px solid ${C.border}`,
        display:"flex",alignItems:"stretch",
        paddingBottom:"env(safe-area-inset-bottom,0px)",
        boxShadow:"0 -1px 0 rgba(255,255,255,0.04), 0 -8px 32px rgba(0,0,0,0.5)",
      }}>
        {primary.map(item=>(
          <NavBtn key={item.id} item={item} isActive={active===item.id}
            onClick={()=>{setDrawerOpen(false);onNav(item.id);}}/>
        ))}
        {/* More button */}
        {secondary.length>0&&(
          <button onClick={()=>setDrawerOpen(o=>!o)}
            style={{
              flex:1,display:"flex",flexDirection:"column",alignItems:"center",
              justifyContent:"center",gap:4,background:"transparent",border:"none",
              cursor:"pointer",padding:"8px 4px",position:"relative",
              WebkitTapHighlightColor:"transparent",minWidth:0,minHeight:58,
            }}>
            {(moreIsActive||drawerOpen)&&(
              <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",
                width:24,height:2,borderRadius:2,background:C.gold}}/>
            )}
            <div style={{
              position:"relative",width:36,height:36,display:"flex",
              alignItems:"center",justifyContent:"center",
              background:(moreIsActive||drawerOpen)?`rgba(200,168,74,0.1)`:"transparent",
              borderRadius:10,
              color:(moreIsActive||drawerOpen)?C.gold:"rgba(255,255,255,0.45)",
            }}>
              <Icon id="more"/>
              {totalBadge>0&&(
                <div style={{position:"absolute",top:-3,right:-5,background:C.ruby,color:"#fff",borderRadius:8,fontSize:9,fontWeight:800,padding:"1px 4px",minWidth:15,textAlign:"center",border:"1.5px solid rgba(13,11,21,1)"}}>
                  {totalBadge>9?"9+":totalBadge}
                </div>
              )}
            </div>
            <span style={{fontSize:10,fontWeight:(moreIsActive||drawerOpen)?700:400,color:(moreIsActive||drawerOpen)?C.gold:"rgba(255,255,255,0.45)",letterSpacing:"0.2px",lineHeight:1,fontFamily:"'DM Sans',sans-serif"}}>More</span>
          </button>
        )}
      </nav>

      {/* ── More drawer ── */}
      {drawerOpen&&secondary.length>0&&(
        <>
          {/* Backdrop */}
          <div onClick={()=>setDrawerOpen(false)}
            style={{position:"fixed",inset:0,zIndex:195,background:"rgba(0,0,0,0.5)"}}/>
          {/* Sheet */}
          <div style={{
            position:"fixed",bottom:`calc(62px + env(safe-area-inset-bottom,0px))`,
            left:0,right:0,zIndex:196,
            background:"rgba(18,15,30,0.98)",
            backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
            borderTop:"1px solid rgba(255,255,255,0.07)",
            borderRadius:"20px 20px 0 0",
            padding:"8px 16px 16px",
            animation:"fade 0.2s ease",
          }}>
            <div style={{width:36,height:3,borderRadius:2,background:"rgba(255,255,255,0.12)",margin:"6px auto 14px"}}/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
              {secondary.map(item=>(
                <button key={item.id}
                  onClick={()=>{setDrawerOpen(false);onNav(item.id);}}
                  style={{
                    display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                    background:active===item.id?`rgba(200,168,74,0.1)`:"transparent",
                    border:`1px solid ${active===item.id?`rgba(200,168,74,0.3)`:"transparent"}`,
                    borderRadius:14,padding:"14px 8px",cursor:"pointer",
                    WebkitTapHighlightColor:"transparent",
                    color:active===item.id?C.gold:"rgba(255,255,255,0.7)",
                  }}>
                  <div style={{position:"relative"}}>
                    <Icon id={item.id}/>
                    {(item.badge||0)>0&&(
                      <div style={{position:"absolute",top:-4,right:-6,background:C.ruby,color:"#fff",borderRadius:8,fontSize:9,fontWeight:800,padding:"1px 4px",minWidth:15,textAlign:"center",border:"1.5px solid rgba(18,15,30,1)"}}>
                        {(item.badge||0)>9?"9+":(item.badge||0)}
                      </div>
                    )}
                  </div>
                  <span style={{fontSize:11,fontWeight:active===item.id?700:500,fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.2px"}}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Btn({ children, onClick, v="gold", sz="md", disabled, full, loading, xs={}, type="button" }) {
  const bgs = {
    gold:    `linear-gradient(135deg,${C.gold},${C.saffron})`,
    ruby:    `linear-gradient(135deg,${C.ruby},${C.rubyLt})`,
    ghost:   "transparent",
    stripe:  `linear-gradient(135deg,#635BFF,#7B72FF)`,
    emerald: `linear-gradient(135deg,${C.emerald},#22A068)`,
    lapis:   `linear-gradient(135deg,${C.lapis},#2860AA)`,
    dark:    C.card,
  };
  const sizes = {
    sm:  { p:"10px 16px", fs:T.sm,  h:"36px" },
    md:  { p:"12px 20px", fs:T.sm,  h:"44px" },
    lg:  { p:"14px 28px", fs:T.base,h:"48px" },
    xl:  { p:"16px 36px", fs:T.md,  h:"54px" },
  };
  const s = sizes[sz] || sizes.md;
  const fg = (v==="gold"||v==="ruby"||v==="stripe"||v==="emerald"||v==="lapis") ? "#FFFFFF" : C.text;
  return (
    <button type={type} disabled={disabled||loading} onClick={onClick}
      style={{
        background:bgs[v]||"transparent",color:fg,
        border:`1px solid ${v==="ghost"?C.border:"transparent"}`,
        borderRadius:10,padding:s.p,fontSize:s.fs,fontWeight:700,
        minHeight:s.h,cursor:disabled||loading?"not-allowed":"pointer",
        opacity:disabled?0.4:1,width:full?"100%":"auto",
        fontFamily:"inherit",letterSpacing:"0.3px",
        display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,
        WebkitTapHighlightColor:"transparent",touchAction:"manipulation",
        transition:"opacity 0.15s",
        ...xs,
      }}>
      {loading && <div style={{width:14,height:14,border:`2px solid ${fg}44`,borderTopColor:fg,borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>}
      {children}
    </button>
  );
}

const Inp = ({ label, value, onChange, onKeyDown, type="text", placeholder, hint, error, required, rows, disabled }) => (
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {label && (
      <label style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase"}}>
        {label}{required&&<span style={{color:C.ruby,marginLeft:2}}>*</span>}
      </label>
    )}
    {rows ? (
      <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} disabled={disabled}
        style={{background:C.surface,border:`1px solid ${error?C.ruby:C.border}`,borderRadius:10,padding:"13px 15px",color:C.text,fontSize:T.base,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"inherit",resize:"vertical",lineHeight:1.6,minHeight:44}}/>
    ) : (
      <input type={type} value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} disabled={disabled}
        style={{background:C.surface,border:`1px solid ${error?C.ruby:C.border}`,borderRadius:10,padding:"13px 15px",color:C.text,fontSize:T.base,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"inherit",minHeight:44}}/>
    )}
    {error && <div style={{color:C.ruby,fontSize:T.xs}}>⚠ {error}</div>}
    {hint && !error && <div style={{color:C.muted,fontSize:T.xs,lineHeight:1.5}}>{hint}</div>}
  </div>
);

const Sel = ({ label, value, onChange, options }) => (
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {label && <label style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase"}}>{label}</label>}
    <select value={value} onChange={onChange}
      style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px 15px",color:C.text,fontSize:T.base,outline:"none",width:"100%",fontFamily:"inherit",minHeight:44,WebkitAppearance:"none"}}>
      {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
    </select>
  </div>
);

// ── Photo upload ──────────────────────────────────────────────────────
function PhotoUpload({ photo, onPhoto, color, emoji, size=80, artistId="" }) {
  const ref = useRef();
  const [uploading, setUploading] = useState(false);
  const handle = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5*1024*1024) { alert("Max 5MB"); return; }
    // Try Supabase Storage first, fall back to base64
    if (HAS_SUPA && artistId) {
      try {
        setUploading(true);
        const sb = await getSupabase();
        const ext = file.name.split('.').pop();
        const path = `artists/${artistId}/photo.${ext}`;
        const { error } = await sb.storage.from('artist-photos').upload(path, file, { upsert: true });
        if (!error) {
          const { data } = sb.storage.from('artist-photos').getPublicUrl(path);
          onPhoto(data.publicUrl);
          setUploading(false);
          return;
        }
      } catch(e) { /* fall through to base64 */ }
      setUploading(false);
    }
    // Fallback: base64 — saved to artists.photo column in DB via onPhoto→onUpdateArtist
    setUploading(true);
    const r = new FileReader();
    r.onload = async ev => {
      const b64 = ev.target.result as string;
      onPhoto(b64); // triggers onUpdateArtist → saves to Supabase artists.photo
      // Also directly persist to ensure it's saved
      if(HAS_SUPA && artistId){
        const sb = await getSupabase();
        if(sb) await sb.from("artists").update({photo: b64}).eq("id", artistId);
      }
      setUploading(false);
    };
    r.readAsDataURL(file);
  };
  return (
    <div style={{position:"relative",width:size,height:size,cursor:"pointer",flexShrink:0}} onClick={()=>ref.current?.click()}>
      <input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={handle}/>
      <div style={{width:size,height:size,borderRadius:size*0.16,background:`${color}18`,border:`2px solid ${color}55`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.44}}>
        {photo?<img src={photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:emoji}
      </div>
      <div style={{position:"absolute",bottom:-3,right:-3,width:24,height:24,borderRadius:"50%",background:C.gold,border:`2px solid ${C.bg}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>{uploading?"⏳":"📷"}</div>
    </div>
  );
}

// ── Mini calendar ─────────────────────────────────────────────────────
function MiniCal({ artist, onSelect, selDay, selMonth, selYear, editMode, onToggle, bookings=[] }) {
  const [cal, setCal] = useState({ month:NOW.getMonth(), year:NOW.getFullYear() });
  const key = `${cal.year}-${cal.month}`;
  const avail   = artist?.available?.[key]||[];
  const blocked = artist?.blocked?.[key]||[];
  const bookedD = useMemo(()=>
    bookings.filter(b=>b.artistId===artist?.id).map(b=>{
      try{const d=new Date(b.date);return d.getMonth()===cal.month&&d.getFullYear()===cal.year?d.getDate():null;}
      catch{return null;}
    }).filter(Boolean),[bookings,artist?.id,cal.month,cal.year]);
  const fd=new Date(cal.year,cal.month,1).getDay();
  const dim=new Date(cal.year,cal.month+1,0).getDate();
  const off=fd===0?6:fd-1;
  const isNow=cal.month===NOW.getMonth()&&cal.year===NOW.getFullYear();
  const isPrevDisabled = isNow;
  const nav=dir=>setCal(c=>{const m=c.month+dir;if(m<0)return{month:11,year:c.year-1};if(m>11)return{month:0,year:c.year+1};return{month:m,year:c.year};});

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <button onClick={()=>!isPrevDisabled&&nav(-1)} disabled={isPrevDisabled} style={{width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,cursor:isPrevDisabled?"not-allowed":"pointer",fontSize:18,color:isPrevDisabled?C.faint:C.textD,opacity:isPrevDisabled?0.3:1,WebkitTapHighlightColor:"transparent"}}>‹</button>
        <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,fontWeight:700,color:C.gold}}>{MONTHS[cal.month]} {cal.year}</span>
        <button onClick={()=>nav(1)}  style={{width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer",fontSize:18,color:C.textD,WebkitTapHighlightColor:"transparent"}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {WDAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:T.xs,color:C.muted,fontWeight:700,padding:"2px 0"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {Array(off).fill(null).map((_,i)=><div key={`e${i}`}/>)}
        {Array(dim).fill(null).map((_,i)=>{
          const day=i+1;
          const isB=bookedD.includes(day),isX=blocked.includes(day),isA=avail.includes(day)&&!isB&&!isX;
          const isPast=isNow&&day<NOW.getDate(),isSel=selDay===day&&selMonth===cal.month&&selYear===cal.year;
          let bg="transparent",color=C.muted,border="1px solid transparent",fw=500;
          if(isPast)color=C.faint;
          else if(isB){bg=C.rubyS;color=C.ruby;border=`1px solid ${C.ruby}28`;}
          else if(isX){bg="rgba(16,12,24,0.9)";border=`1px solid ${C.border}`;}
          else if(isA){bg=C.emeraldS;color=C.emerald;border=`1px solid ${C.emerald}38`;}
          if(isSel&&isA){bg=C.gold;color=C.bg;border=`1px solid ${C.gold}`;fw=800;}
          const click=()=>{
            if(isPast||isB)return;
            if(editMode&&onToggle){onToggle(cal.month,cal.year,day);return;}
            if(!editMode&&isA&&onSelect)onSelect(day,cal.month,cal.year);
          };
          return(
            <div key={day} onClick={click}
              style={{textAlign:"center",aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6,fontSize:T.sm,fontWeight:fw,background:bg,color,border,cursor:isA||editMode?"pointer":"default",opacity:isPast?0.22:1,userSelect:"none",WebkitTapHighlightColor:"transparent",minHeight:36}}>
              {day}
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:12,marginTop:10}}>
        {[{c:C.emerald,l:t('available')},{c:C.ruby,l:t('booked')},{c:C.muted,l:t('blocked')}].map(({c,l})=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:T.xs,color:C.muted}}>
            <div style={{width:8,height:8,borderRadius:2,background:c+"38",border:`1px solid ${c}48`}}/>{l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chat ──────────────────────────────────────────────────────────────
function Chat({ booking, artist, myRole, onClose, onSend }) {
  const [msg,setMsg]=useState("");
  // Re-sync msgs whenever booking.messages changes (admin sends, artist receives)
  const [msgs,setMsgs]=useState(booking.messages||[]);
  const prevLen=useRef((booking.messages||[]).length);
  const ref=useRef(null);
  const endRef=useRef(null);
  
  // Sync when parent booking updates (polling or real-time push)
  useEffect(()=>{
    const incoming=booking.messages||[];
    if(incoming.length!==prevLen.current){
      setMsgs(incoming);
      prevLen.current=incoming.length;
    }
  },[booking.messages]);

  // Poll Supabase every 5s for new messages when chat is open
  useEffect(()=>{
    if(!HAS_SUPA)return;
    const interval=setInterval(async()=>{
      try{
        const sb=await getSupabase();
        if(!sb)return;
        const{data}=await sb.from("bookings").select("messages").eq("id",booking.id).single();
        if(data?.messages&&data.messages.length!==(booking.messages||[]).length){
          setMsgs(data.messages);
          prevLen.current=data.messages.length;
        }
      }catch(e){}
    },5000);
    return()=>clearInterval(interval);
  },[booking.id]);

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"auto"});},[]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  const send=()=>{
    if(!msg.trim()||!booking.chatUnlocked)return;
    const m={from:myRole,text:msg.trim(),time:new Date().toLocaleTimeString("en",{hour:"2-digit",minute:"2-digit"})};
    setMsgs(p=>[...p,m]);onSend?.(booking.id,m);setMsg("");
    // Send email notification to recipient
    sendEmailNotification({
      type:"new_message",
      toEmail:myRole==="customer"?artist?.email:booking.customerEmail,
      toName:myRole==="customer"?artist?.name:booking.customerName,
      fromName:myRole==="customer"?"A customer":artist?.name||"Artist",
      message:msg.trim(),
      artistName:artist?.name,
      bookingDate:booking.date,
    });
  };
  const bub=from=>from==="customer"?{bg:C.goldS,align:"flex-end"}:from==="artist"?{bg:`${artist?.color||C.ruby}18`,align:"flex-start"}:{bg:C.lapisS,align:"flex-start"};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:900,display:"flex",flexDirection:"column"}} onClick={onClose}>
      <div style={{flex:1,maxWidth:600,width:"100%",margin:"auto",display:"flex",flexDirection:"column",background:C.card,borderRadius:16,overflow:"hidden",maxHeight:"92vh",boxShadow:"0 40px 100px #000"}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{height:2,background:artist?`linear-gradient(90deg,${artist.color},${C.gold})`:`linear-gradient(90deg,${C.gold},${C.ruby})`}}/>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,background:C.surface,flexShrink:0}}>
          {artist?.photo?<img src={artist.photo} alt="" style={{width:42,height:42,borderRadius:10,objectFit:"cover",flexShrink:0}}/>:
            <div style={{width:42,height:42,borderRadius:10,background:`${artist?.color||C.gold}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{artist?.emoji}</div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{artist?.name}</div>
            <div style={{fontSize:T.xs,color:booking.chatUnlocked?C.emerald:C.ruby,display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:booking.chatUnlocked?C.emerald:C.ruby}}/>
              {booking.chatUnlocked?"Active — messages are delivered by email":"Locked — deposit required"}
            </div>
          </div>
          <button onClick={onClose} style={{width:36,height:36,borderRadius:"50%",background:C.surface,border:"none",color:C.muted,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
        </div>

        {/* Messages area */}
        <div style={{flex:1,overflow:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:12,minHeight:0}}>
          {!booking.chatUnlocked&&(
            <div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:12,padding:24,textAlign:"center",margin:"auto 0"}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:6}}>{t('chatLockedTitle2')}</div>
              <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.6}}>{t('chatLockedBody2')}</div>
            </div>
          )}
          {msgs.map((m,i)=>{
            const s=bub(m.from);
            const isAdmin=m.from==="admin";
            return(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:s.align,maxWidth:"100%"}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:4,paddingLeft:4}}>
                  {isAdmin?"Awaz":m.from==="customer"?"You":artist?.name||m.from} · {m.time}
                </div>
                <div style={{
                  background:s.bg,
                  border:`1px solid ${isAdmin?C.gold+"33":"rgba(255,255,255,0.04)"}`,
                  borderRadius:m.from==="customer"?"14px 14px 3px 14px":"14px 14px 14px 3px",
                  padding:"12px 16px",
                  maxWidth:"82%",
                  fontSize:T.sm,
                  color:C.text,
                  lineHeight:1.75,
                  // KEY FIX: pre-wrap renders \n as line breaks
                  whiteSpace:"pre-wrap" as const,
                  wordBreak:"break-word" as const,
                }}>
                  {m.text}
                </div>
              </div>
            );
          })}
          <div ref={endRef}/>
        </div>

        {/* Input */}
        <div style={{padding:"12px 14px",display:"flex",gap:8,background:C.surface,flexShrink:0,borderTop:`1px solid ${C.border}`,paddingBottom:`max(12px,env(safe-area-inset-bottom,12px))`}}>
          <textarea value={msg}
            onChange={e=>setMsg(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder={booking.chatUnlocked?"Type a message… (Enter to send, Shift+Enter for new line)":"Deposit required to unlock chat"}
            disabled={!booking.chatUnlocked}
            rows={2}
            style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.text,fontSize:T.base,outline:"none",fontFamily:"inherit",opacity:booking.chatUnlocked?1:0.5,resize:"none",lineHeight:1.5}}/>
          <Btn onClick={send} sz="md" disabled={!booking.chatUnlocked||!msg.trim()}>→</Btn>
        </div>
      </div>
    </div>
  );
}

// ── StripePaywall — Stripe Checkout redirect (100% secure, no card handling in-app) ─
function StripePaywall({
  amount, label, description, emoji="",
  onSuccess, onClose, metadata={},
}: {
  amount: number; label: string; description: string; emoji?: string;
  onSuccess: (paymentIntentId: string) => void;
  onClose: () => void;
  metadata?: Record<string,string>;
}) {
  const [step, setStep]    = useState<"init"|"waiting"|"done">("init");
  const [loading, setLoad] = useState(false);
  const [error, setError]  = useState("");
  const {show:notify}      = useNotif();

  // Check if we returned from Stripe Checkout
  React.useEffect(()=>{
    const p = new URLSearchParams(window.location.search);
    const piId = p.get("payment_intent");
    const status = p.get("redirect_status");
    if(piId && status==="succeeded"){
      // Clean URL
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
      onSuccess(piId);
    }
  }, []);

  const startCheckout = async() => {
    if(loading) return;
    setLoad(true); setError("");
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if(!SUPA_URL || !SUPA_KEY) throw new Error("Platform not configured — contact support");

      const successUrl = `${window.location.origin}${window.location.pathname}?boost_success=1&bookingId=${metadata.bookingId||Date.now()}`;
      const cancelUrl  = `${window.location.origin}${window.location.pathname}`;

      const res = await fetch(`${SUPA_URL}/functions/v1/create-payment-intent-ts`, {
        method: "POST",
        headers: {"Content-Type":"application/json","Authorization":`Bearer ${SUPA_KEY}`,"apikey":SUPA_KEY},
        body: JSON.stringify({
          amount,
          type:        metadata.type || "boost",
          artistName:  metadata.artistName||"Awaz",
          bookingId:   metadata.bookingId||`pay_${Date.now()}`,
          customerEmail: metadata.email||"",
          successUrl,
          cancelUrl,
          mode: "checkout",  // tells edge function to create Checkout Session
        }),
      });

      let data: any = {};
      try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}` }; }

      if(!res.ok || data.error) {
        const msg = data.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      // If edge function returns a checkout URL, redirect directly — no Stripe.js needed
      if(data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      // Fallback: use clientSecret with Stripe.js
      if(!data.clientSecret) throw new Error("Ingen betalingsdata mottatt fra server");

      if(!(window as any).Stripe){
        await new Promise<void>((resolve,reject)=>{
          const s=document.createElement("script");
          s.src="https://js.stripe.com/v3/";
          s.onload=()=>resolve();
          s.onerror=()=>reject(new Error("Kunne ikke laste Stripe"));
          document.head.appendChild(s);
        });
      }
      const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      if(!stripeKey) throw new Error("VITE_STRIPE_PUBLISHABLE_KEY mangler i Vercel");

      const stripe = (window as any).Stripe(stripeKey);
      const returnUrl = `${window.location.origin}${window.location.pathname}?payment_intent=${data.paymentIntentId}&redirect_status=succeeded`;

      const {error:stripeErr} = await stripe.confirmPayment({
        clientSecret: data.clientSecret,
        confirmParams: { return_url: returnUrl },
        redirect: "always",
      });
      if(stripeErr) throw new Error(stripeErr.message);

    } catch(e:any){
      const msg = e.message||"";
      if(msg.includes("Failed to fetch") || e.name==="AbortError") {
        setError("Nettverksfeil — sjekk internettforbindelsen og prøv igjen");
      } else {
        setError(msg || "Noe gikk galt");
      }
    }
    setLoad(false);
  };

  return(
    <div style={{position:"fixed",inset:0,zIndex:9500,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(8px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,width:"100%",maxWidth:420,padding:"28px 24px 32px",boxShadow:"0 32px 80px rgba(0,0,0,0.7)"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
          <div>
            <div style={{fontSize:36,marginBottom:6}}>{emoji}</div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text}}>{label}</div>
            <div style={{color:C.muted,fontSize:T.sm,marginTop:4,lineHeight:1.5}}>{description}</div>
          </div>
          <button onClick={onClose} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.muted,borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
        </div>

        {/* Amount */}
        <div style={{background:`linear-gradient(135deg,${C.goldS},${C.surface})`,border:`1px solid ${C.gold}33`,borderRadius:12,padding:"16px 20px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:C.muted,fontSize:T.xs,marginBottom:2}}>Total amount</div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.gold,fontSize:"2rem"}}>€{amount}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:C.emerald,fontSize:T.xs,fontWeight:700}}>Stripe Secure</div>
            <div style={{color:C.muted,fontSize:11,marginTop:2}}>PCI-DSS compliant</div>
          </div>
        </div>

        {/* What happens */}
        <div style={{background:C.surface,borderRadius:10,padding:"14px 16px",marginBottom:16,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:"0.5px",marginBottom:8}}>{t('applyNextSteps')}</div>
          {[
            {icon:"🔒","text":"You'll be taken to Stripe's secure payment page — your card details never touch our servers"},
            {icon:"💬","text":"After payment, chat with the artist unlocks instantly"},
            {icon:"💵","text":"Balance paid in cash directly to the artist after the event"},
          ].map(({icon,text})=>(
            <div key={text} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:6}}>
              <span style={{fontSize:14,flexShrink:0,marginTop:1}}>{icon}</span>
              <span style={{fontSize:11,color:C.muted,lineHeight:1.5}}>{text}</span>
            </div>
          ))}
        </div>

        {/* Trust row */}
        <div style={{display:"flex",justifyContent:"center",gap:14,marginBottom:16,flexWrap:"wrap" as const}}>
          {[["🔒","SSL"],["🛡️","PCI DSS"],["💳","Stripe"],["✓","Verified"]].map(([ico,lbl])=>(
            <div key={lbl as string} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:C.muted}}>
              <span style={{fontSize:13}}>{ico}</span><span style={{fontWeight:600}}>{lbl}</span>
            </div>
          ))}
        </div>

        {error&&(
          <div style={{background:C.rubyS,border:`1px solid ${C.ruby}44`,borderRadius:8,padding:"10px 14px",color:C.ruby,fontSize:T.xs,marginBottom:16,lineHeight:1.5}}>
            ⚠ {error}
          </div>
        )}

        <button onClick={startCheckout} disabled={loading}
          style={{width:"100%",background:loading?C.surface:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:loading?C.muted:C.bg,border:"none",borderRadius:12,padding:"16px",fontWeight:800,fontSize:16,cursor:loading?"wait":"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
          {loading?"Preparing secure payment…":`Pay €${amount} with Stripe →`}
        </button>

        <div style={{color:C.faint,fontSize:11,textAlign:"center",marginTop:10,lineHeight:1.6}}>
          Bank-level encryption · Powered by Stripe · Your card is never stored
        </div>
      </div>
    </div>
  );
}

// ── Stripe checkout ───────────────────────────────────────────────────
// Bulletproof: React ref for container, cardRef for instance tracking,
// mounted flag, destroy-before-remount, no innerHTML, single useEffect.
function StripeCheckout({ booking, artist, onSuccess, onClose }) {
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [step,         setStep]         = useState<"init"|"pay"|"done">("init");
  const [elementReady, setElementReady] = useState(false);
  const stripeRef    = React.useRef<any>(null);
  const elementsRef  = React.useRef<any>(null);
  const cardRef      = React.useRef<any>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const deposit   = booking.deposit || 1000;
  const artistAmt = Math.round(deposit * 0.88);

  // Load Stripe.js eagerly on modal open
  React.useEffect(()=>{
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if(!key) return;
    if((window as any).Stripe){ stripeRef.current=(window as any).Stripe(key); return; }
    if(document.getElementById("stripe-js")) return;
    const sc = document.createElement("script");
    sc.id="stripe-js"; sc.src="https://js.stripe.com/v3/";
    sc.onload=()=>{ stripeRef.current=(window as any).Stripe(key); };
    document.head.appendChild(sc);
  },[]);

  // Mount Payment Element — single effect, proper cleanup
  React.useEffect(()=>{
    if(step!=="pay"||!clientSecret){ if(step==="init") setElementReady(false); return; }
    let mounted=true;
    const doMount=async()=>{
      // Wait for Stripe.js up to 5s
      let n=0;
      while(!stripeRef.current&&n<50){
        await new Promise(r=>setTimeout(r,100));
        const key=import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
        if((window as any).Stripe&&key) stripeRef.current=(window as any).Stripe(key);
        n++;
      }
      if(!mounted) return;
      if(!stripeRef.current){ setError("Stripe could not load — please refresh."); return; }
      try{
        // Destroy previous instance BEFORE creating new one — never use innerHTML
        if(cardRef.current){ try{ cardRef.current.destroy(); }catch{} cardRef.current=null; }
        const elements=stripeRef.current.elements({
          clientSecret,
          appearance:{theme:"stripe",variables:{colorPrimary:"#B8934A",borderRadius:"8px",fontFamily:"inherit"}},
        });
        elementsRef.current=elements;
        const card=elements.create("payment",{
          wallets:{applePay:"auto",googlePay:"auto"},
          layout:{type:"tabs",defaultCollapsed:false},
        });
        cardRef.current=card;
        if(containerRef.current&&mounted){
          card.mount(containerRef.current);
          card.on("ready",()=>{ if(mounted) setElementReady(true); });
          setTimeout(()=>{ if(mounted) setElementReady(true); },5000);
        }
      }catch(err:any){
        console.error("[awaz] Stripe mount:",err.message);
        if(mounted){ setError("Payment form failed to load. Please refresh."); }
      }
    };
    doMount();
    return()=>{
      mounted=false;
      if(cardRef.current){ try{ cardRef.current.destroy(); }catch{} cardRef.current=null; }
      elementsRef.current=null;
    };
  },[step,clientSecret]);

  const initPayment=async()=>{
    setLoading(true); setError("");
    try{
      const SUPA_URL=import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY=import.meta.env.VITE_SUPABASE_ANON_KEY;
      if(!SUPA_URL||!SUPA_KEY) throw new Error("App configuration missing.");
      const platformAccountId=(()=>{try{return localStorage.getItem("awaz-stripe-platform-id")||null;}catch{return null;}})();
      const res=await fetch(`${SUPA_URL}/functions/v1/create-payment-intent-ts`,{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${SUPA_KEY}`,"apikey":SUPA_KEY},
        body:JSON.stringify({
          amount:deposit, currency:(artist.currency||"EUR").toLowerCase(),
          type:"booking",
          // Only pass stripeAccount if artist has connected to the CURRENT platform
          // If not connected, payment goes to Awaz directly (no split)
          artistStripeAccount: (artist.stripeConnected && artist.stripeAccount?.startsWith("acct_"))
            ? artist.stripeAccount
            : null,
          platformAccountId, bookingId:booking.id,
          customerEmail:booking.customerEmail||"", artistName:artist.name,
          platformFeePercent:12,
        }),
      });
      const data=await res.json();
      if(!res.ok||data.error) throw new Error(data.error||"Payment setup failed.");
      setClientSecret(data.clientSecret);
      setStep("pay");
    }catch(e:any){
      console.error('[payment]',e);
      setError("Payment could not be processed. Please try again or contact support@awazbooking.com");
    }
    setLoading(false);
  };

  const confirmPayment=async()=>{
    if(!elementReady||loading) return;
    setLoading(true); setError("");
    try{
      if(!stripeRef.current||!elementsRef.current) throw new Error("Payment form not ready.");
      const{error:stripeError}=await stripeRef.current.confirmPayment({
        elements:elementsRef.current,
        confirmParams:{
          return_url:window.location.href,
          payment_method_data:{
            billing_details:{
              name: booking.customerName||"",
              email:booking.customerEmail||"",
            }
          }
        },
        redirect:"if_required",
      });
      if(stripeError) throw new Error(stripeError.message);
      setStep("done");
      onSuccess();
    }catch(e:any){
      console.error('[confirm]',e);
      setError("Payment failed. Please try again or use a different payment method.");
    }
    setLoading(false);
  };

  // ── Render ────────────────────────────────────────────────────────────
  if(step==="done") return(
    <div style={{position:"fixed",inset:0,zIndex:9500,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,width:"100%",maxWidth:420,padding:"36px 28px",textAlign:"center",boxShadow:"0 32px 80px rgba(0,0,0,0.7)"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:56,marginBottom:12}}>🎉</div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:8}}>Booking Confirmed!</div>
        <div style={{color:C.textD,fontSize:T.sm,lineHeight:1.8,marginBottom:8}}>Your deposit of <strong style={{color:C.gold}}>€{deposit}</strong> has been paid. Chat is now unlocked — message {artist.name} directly.</div>
        <div style={{color:C.muted,fontSize:11,marginBottom:24}}>Artist receives €{artistAmt} (88%) · Awaz receives €{deposit-artistAmt} (12%)</div>
        <Btn full v="gold" sz="lg" onClick={onClose}>Continue</Btn>
      </div>
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,zIndex:9500,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(8px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,width:"100%",maxWidth:420,padding:"28px 24px 32px",boxShadow:"0 32px 80px rgba(0,0,0,0.7)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text}}>Confirm Payment</div>
          <button onClick={onClose} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.muted,borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
        </div>

        {/* Booking summary */}
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:T.sm}}><span style={{color:C.muted}}>Artist</span><strong style={{color:C.text}}>{artist.name}</strong></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,fontSize:T.sm}}><span style={{color:C.muted}}>Event</span><strong style={{color:C.text,textTransform:"capitalize"}}>{booking.eventType||"Event"}</strong></div>
          <div style={{height:1,background:C.border,marginBottom:10}}/>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700,color:C.text,fontSize:T.sm}}>Deposit to pay</span><span style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.gold,fontSize:T.lg}}>€{deposit}</span></div>
        </div>

        {step==="init"?(
          <>
            <div style={{background:C.goldS,border:`1px solid ${C.gold}22`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:11,color:C.muted,lineHeight:1.7}}>
              Artist receives <strong style={{color:C.gold}}>€{artistAmt}</strong> (88%) · Balance paid in cash at event
            </div>
            {error&&<div style={{background:C.rubyS,borderRadius:8,padding:"10px 12px",color:C.ruby,fontSize:T.xs,marginBottom:12}}>⚠ {error}</div>}
            <Btn full v="gold" sz="lg" loading={loading} onClick={initPayment}>Pay €{deposit} Securely →</Btn>
            <div style={{color:C.faint,fontSize:11,textAlign:"center",marginTop:8}}>SSL · Stripe PCI-L1 · 256-bit encryption</div>
          </>
        ):(
          <>
            {/* Loading indicator — OUTSIDE Stripe container */}
            {!elementReady&&(
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",marginBottom:16,textAlign:"center",color:C.muted,fontSize:T.xs,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center"}}>
                Loading payment options…
              </div>
            )}
            {/* Stripe Payment Element — React ref, NO React children inside */}
            <div ref={containerRef} style={{marginBottom:16,display:elementReady?"block":"none"}}/>
            {error&&<div style={{background:C.rubyS,borderRadius:8,padding:"10px 12px",color:C.ruby,fontSize:T.xs,marginBottom:12}}>⚠ {error}</div>}
            <Btn full v="gold" sz="lg" loading={loading} onClick={confirmPayment}
              xs={{opacity:elementReady?1:0.5}}>
              {elementReady?`Pay €${deposit} Securely`:"Loading…"}
            </Btn>
            <div style={{color:C.faint,fontSize:11,textAlign:"center",marginTop:8}}>SSL · Stripe PCI-L1 · 256-bit encryption</div>
          </>
        )}
      </div>
    </div>
  );
}


function ReviewsSection({artist, session, bookings, onNewBooking}:{artist:any;session:any;bookings:any[];onNewBooking?:any}){
  const [reviews,setReviews]=useState<any[]>([]);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({rating:5,text:""});
  const [submitting,setSubmitting]=useState(false);
  const [submitted,setSubmitted]=useState(false);

  // Load reviews from Supabase
  useEffect(()=>{
    if(!HAS_SUPA) return;
    getSupabase().then(sb=>{
      if(!sb) return;
      sb.from("reviews").select("*").eq("artist_id",artist.id).order("created_at",{ascending:false})
        .then(({data})=>{ if(data) setReviews(data); });
    });
  },[artist.id]);

  // Check if logged-in user has a completed booking with this artist
  const myCompletedBooking = session ? bookings.find(b=>
    b.artistId===artist.id &&
    (b.customerEmail===session.email || b.userId===session.id) &&
    ["confirmed","completed"].includes(b.status)
  ) : null;

  const alreadyReviewed = session ? reviews.some(r=>r.user_id===session.id) : false;
  const avgRating = reviews.length ? reviews.reduce((s,r)=>s+r.rating,0)/reviews.length : 0;

  const submitReview=async()=>{
    if(!form.text.trim()||submitting) return;
    setSubmitting(true);
    const review={
      artist_id: artist.id,
      user_id:   session.id,
      user_name: session.name||"Verified Guest",
      rating:    form.rating,
      text:      form.text.trim(),
    };
    if(HAS_SUPA){
      const sb=await getSupabase();
      if(sb){
        const{error}=await sb.from("reviews").insert(review);
        if(!error){
          setReviews(p=>[{...review,created_at:new Date().toISOString()},...p]);
          setSubmitted(true);setShowForm(false);
          setForm({rating:5,text:""});
        }
      }
    }
    setSubmitting(false);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* ── Header ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div>
          {reviews.length>0&&(
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Stars rating={avgRating} count={reviews.length}/>
            </div>
          )}
        </div>
        {/* Write review — only for verified bookers */}
        {session && myCompletedBooking && !alreadyReviewed && !showForm && (
          <button onClick={()=>setShowForm(true)}
            style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:10,padding:"10px 18px",fontWeight:700,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
            ★ Write a Review
          </button>
        )}
      </div>

      {/* ── Write review form ── */}
      {showForm&&(
        <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:14,padding:"20px"}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:14}}>
            Your experience with {artist.name}
          </div>
          {/* Star rating */}
          <div style={{display:"flex",gap:6,marginBottom:14}}>
            {[1,2,3,4,5].map(n=>(
              <button key={n} onClick={()=>setForm(f=>({...f,rating:n}))}
                style={{background:"none",border:"none",cursor:"pointer",padding:4,fontSize:28,color:n<=form.rating?C.gold:"rgba(200,168,74,0.2)"}}>★</button>
            ))}
          </div>
          <textarea value={form.text} onChange={e=>setForm(f=>({...f,text:e.target.value}))}
            placeholder="Share your experience — what made the event special?"
            rows={4}
            style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",color:C.text,fontSize:T.sm,fontFamily:"inherit",resize:"vertical",outline:"none",lineHeight:1.7,boxSizing:"border-box",marginBottom:12}}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={submitReview} disabled={!form.text.trim()||submitting}
              style={{flex:1,background:form.text.trim()?`linear-gradient(135deg,${C.gold},${C.saffron})`:C.surface,color:form.text.trim()?C.bg:C.muted,border:"none",borderRadius:10,padding:"11px",fontWeight:700,fontSize:T.sm,cursor:form.text.trim()?"pointer":"not-allowed",fontFamily:"inherit"}}>
              {submitting?"Submitting…":"Submit Review"}
            </button>
            <button onClick={()=>setShowForm(false)}
              style={{background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 18px",fontWeight:600,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
              Cancel
            </button>
          </div>
          <div style={{color:C.faint,fontSize:11,marginTop:6}}>✓ Verified booking required · Reviews are public</div>
        </div>
      )}

      {submitted&&(
        <div style={{background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:10,padding:"12px 16px",color:C.emerald,fontWeight:700,fontSize:T.sm}}>
          ✓ Thank you! Your review has been published.
        </div>
      )}

      {/* ── Review list ── */}
      {reviews.length===0?(
        <div style={{textAlign:"center",padding:"40px 24px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
          
          <div style={{color:C.muted,fontSize:T.sm}}>No reviews yet</div>
          {session&&myCompletedBooking&&!alreadyReviewed&&!showForm&&(
            <div style={{color:C.muted,fontSize:T.xs,marginTop:6}}>Be the first to review this artist!</div>
          )}
          {(!session||!myCompletedBooking)&&(
            <div style={{color:C.faint,fontSize:T.xs,marginTop:6}}>Only verified bookers can write reviews</div>
          )}
        </div>
      ):(
        reviews.map((r,i)=>(
          <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontWeight:700,color:C.text,fontSize:T.sm,marginBottom:4}}>{r.user_name||"Verified Guest"}</div>
                <Stars rating={r.rating} size={13}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <span style={{color:C.faint,fontSize:11}}>{new Date(r.created_at).toLocaleDateString("en",{month:"short",year:"numeric"})}</span>
                <span style={{background:C.emeraldS,color:C.emerald,borderRadius:6,fontSize:9,fontWeight:700,padding:"1px 6px"}}>✓ VERIFIED</span>
              </div>
            </div>
            <p style={{color:C.textD,fontSize:T.base,margin:0,lineHeight:1.8,fontFamily:"'DM Sans',sans-serif"}}>{r.text}</p>
          </div>
        ))
      )}
    </div>
  );
}

// ── Artist card ───────────────────────────────────────────────────────
function ArtistCard({ artist, onClick, compact=false }) {
  const key=`${NOW.getFullYear()}-${NOW.getMonth()}`;
  const open=(artist.available?.[key]||[]).filter((d:any)=>!(artist.blocked?.[key]||[]).includes(d)).length;
  const totalFollowers = useMemo(()=>{
    const sp = artist.spotify?.monthlyListeners||"";
    const ig = artist.instagram?.followers||"";
    if(!sp&&!ig) return null;
    return [sp&&`${sp} Spotify`,ig&&`${ig} IG`].filter(Boolean).join(" · ");
  },[artist]);

  // ── Conversion psychology signals ──────────────────────────────────
  const isInDemand = (artist.totalBookings||0)>=5 || open<=3;
  const scarcityLevel = open===0?"booked":open<=2?"critical":open<=5?"low":null;
  const scarcityLabel = scarcityLevel==="booked"?"Fully booked":scarcityLevel==="critical"?`⚡ Only ${open} date${open===1?"":"s"} left!`:scarcityLevel==="low"?`${open} dates left this month`:null;
  const scarcityColor = scarcityLevel==="booked"?C.muted:scarcityLevel==="critical"?C.ruby:C.saffron;
  const bookingCount = artist.totalBookings||0;

  if (compact) {
    return (
      <div onClick={()=>onClick(artist)}
        style={{display:"flex",gap:14,alignItems:"center",padding:"16px",background:C.card,borderRadius:12,cursor:"pointer",border:`1px solid ${C.border}`,WebkitTapHighlightColor:"transparent",minHeight:80,transition:"border-color 0.15s",borderLeft:`3px solid ${C.gold}44`}}>
        <div style={{position:"relative",flexShrink:0}}>
          {artist.photo?<img src={artist.photo} alt={artist.name} style={{width:54,height:54,borderRadius:10,objectFit:"cover",border:`1px solid ${C.border}`}}/>:
            <div style={{width:54,height:54,borderRadius:10,background:C.goldS,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{artist.emoji}</div>}
          {artist.verified&&<div style={{position:"absolute",bottom:-3,right:-3,width:16,height:16,borderRadius:"50%",background:C.emerald,border:`2px solid ${C.card}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:800}}>✓</div>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.2}}>{artist.name}</div>
            
          </div>
          <div style={{color:C.gold,fontSize:T.sm,fontWeight:600}}>{artist.genre}</div>
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4,flexWrap:"wrap" as const}}>
            <Stars rating={artist.rating} count={artist.reviews} size={12}/>
            {scarcityLabel?(
              <span style={{color:C.muted,fontSize:10}}>{scarcityLabel}</span>
            ):(
              <span style={{color:C.emerald,fontSize:T.xs,fontWeight:600}}>{open} {t('openDates')}</span>
            )}
          </div>
          {bookingCount>0&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{bookingCount} booking{bookingCount>1?"s":""} completed</div>}
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}44`,borderRadius:20,padding:"6px 14px",fontSize:T.xs,fontWeight:700,color:C.gold}}>Request →</div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={()=>onClick(artist)}
      style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,cursor:"pointer",overflow:"hidden",WebkitTapHighlightColor:"transparent",transition:"border-color 0.15s, transform 0.15s"}}>
      {/* Top accent bar */}
      <div style={{height:2,background:`linear-gradient(90deg,${artist.color},${C.gold},${artist.color})`,opacity:0.6}}/>
      <div style={{padding:"20px"}}>
        <div style={{display:"flex",gap:13,alignItems:"flex-start",marginBottom:14}}>
          <div style={{position:"relative",flexShrink:0}}>
            {artist.photo?<img src={artist.photo} alt={artist.name} style={{width:60,height:60,borderRadius:11,objectFit:"cover",border:`1px solid ${C.border}`}}/>:
              <div style={{width:60,height:60,borderRadius:11,background:C.goldS,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>{artist.emoji}</div>}
            {artist.verified&&<div style={{position:"absolute",bottom:-4,right:-4,width:17,height:17,borderRadius:"50%",background:C.emerald,border:`2px solid ${C.card}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:800}}>✓</div>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            {artist.nameDari&&<div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:T.sm,color:C.muted,textAlign:"right",marginBottom:2}}>{artist.nameDari}</div>}
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,lineHeight:1.1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{artist.name}</div>
            <div style={{color:C.gold,fontSize:T.sm,fontWeight:600,marginTop:3}}>{artist.genre}</div>
            {totalFollowers&&<div style={{fontSize:T.xs,color:C.muted,marginTop:3}}>{totalFollowers}</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
            {artist.superhost&&<Badge color={C.gold}>★ Top</Badge>}
            {isInDemand&&<span style={{background:`${C.gold}14`,color:C.gold,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:600,letterSpacing:'0.2px'}}>{t('inDemand')}</span>}
            {bookingCount>0&&<span style={{fontSize:10,color:C.muted,fontWeight:600}}>{bookingCount} booked</span>}
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{color:C.muted,fontSize:T.sm}}>{artist.location}</span>
          {scarcityLabel?(
            <span style={{color:C.muted,fontSize:T.xs}}>{scarcityLabel}</span>
          ):(
            <span style={{color:C.muted,fontSize:T.xs}}>{open} {t('openDates')}</span>
          )}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>
          {artist.tags.slice(0,3).map((tg:string)=><Badge key={tg} color={C.muted}>{tg}</Badge>)}
          {Array.isArray(artist.bandMembers)&&artist.bandMembers.length>0&&(
            <span style={{background:C.lapisS,border:`1px solid ${C.lapis}33`,borderRadius:12,padding:"3px 9px",fontSize:10,fontWeight:700,color:C.lapis}}>🎼 {t('hasBand')}</span>
          )}
        </div>
        <div style={{height:1,background:C.border,marginBottom:12}}/>
        {/* Instrument chips for instrumentalists */}
        {artist.instruments?.length>0&&(artist.artistType==="instrumentalist"||artist.artist_type==="instrumentalist")&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
            {(artist.instruments as string[]).slice(0,4).map((ins:string)=>{
              const icons:Record<string,string>={Tabla:"🥁",Rubab:"🪕",Drums:"🎶",Keyboard:"🎹",Guitar:"🎸",Harmonium:"🎵"};
              return<span key={ins} style={{background:C.lapisS,border:`1px solid ${C.lapis}33`,borderRadius:12,padding:"3px 9px",fontSize:10,fontWeight:700,color:C.lapis,display:"flex",alignItems:"center",gap:3}}><span>{icons[ins]||"🎵"}</span>{ins}</span>;
            })}
            {artist.instruments.length>4&&<span style={{fontSize:10,color:C.muted,alignSelf:"center"}}>+{artist.instruments.length-4} more</span>}
          </div>
        )}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            <Stars rating={artist.rating} count={artist.reviews} size={13}/>
            {artist.verified&&<span style={{fontSize:10,color:C.emerald,fontWeight:700,display:"flex",alignItems:"center",gap:3}}>🔒 Secure booking</span>}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}44`,borderRadius:20,padding:"7px 16px",fontSize:T.xs,fontWeight:700,color:C.gold}}>Request Booking →</div>
            <div style={{fontSize:10,color:C.muted,marginTop:4}}>No payment now · 48h response</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Login sheet — Supabase Auth + demo fallback ────────────────────────
function LoginSheet({ users, open, onLogin, onClose, prefill=null }) {
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState(""),[pass,setPass]=useState(""),
    [name,setName]=useState(""),
    [err,setErr]=useState(""),
    [attempts,setAt]=useState(0),[locked,setLocked]=useState(false),
    [loading,setLoading]=useState(false);

  useEffect(()=>{
    if(open){
      setErr("");
      setMode(prefill?.mode||"login");
      if(prefill?.email) setEmail(prefill.email);
    }
  },[open,prefill]);

  const doLogin=async()=>{
    if(locked){setErr("Too many attempts. Wait 5 min.");return;}
    if(!checkRateLimit("login_"+email.toLowerCase(), 5, 300000)){
      setErr("Too many login attempts. Please wait 5 minutes.");
      return;
    }
    if(!email||!pass){setErr("Enter email and password.");return;}
    setLoading(true);setErr("");

    // ── Supabase Auth (production) ────────────────────────────────────
    if(HAS_SUPA){
      try{
        const sb=await getSupabase();
        const {data,error}=await sb.auth.signInWithPassword({email:email.toLowerCase().trim(),password:pass});
        if(error){
          setLoading(false);
          setAt(prev=>{
            const na=prev+1;
            if(na>=5){setLocked(true);setTimeout(()=>{setLocked(false);setAt(0);},5*60*1000);}
            setErr(error.message==="Invalid login credentials"
              ? `Invalid email or password. ${Math.max(0,5-na)} attempts left.`
              : error.message);
            return na;
          });
          return;
        }
        // ── Login succeeded — let onAuthStateChange handle session setup ──
        // This avoids the race condition of calling onLogin here AND in onAuthStateChange.
        // We just close the modal and clear loading. The auth listener does the rest.
        const loginEmail=data.user.email?.toLowerCase()||"";
        if(ADMIN_EMAILS.includes(loginEmail)){
          // Admin: set immediately, no DB fetch needed
          setLoading(false);
          onLogin({id:data.user.id,email:data.user.email,name:"Admin",role:"admin",artistId:null});
        } else {
          // Non-admin: fetch role/profile data, then call onLogin
          const [userRes2, profileRes2] = await Promise.all([
            sb.from("users").select("*").eq("id",data.user.id).single(),
            sb.from("profiles").select("*").eq("id",data.user.id).single(),
          ]);
          const dbUser = userRes2.data;
          const profile = profileRes2.data;
          const role=
            (profile?.role==="artist" ? "artist" : null) ||
            dbUser?.role ||
            profile?.role ||
            "customer";
          const name=dbUser?.name||profile?.name||data.user.email;
          let artistId=profile?.artist_id||null;
          if(!artistId && role==="artist") artistId=data.user.id;
          setLoading(false);
          onLogin({id:data.user.id,email:data.user.email,name,role,artistId});
        }
      } catch(e){
        setLoading(false);
        setErr("Connection error — check Supabase URL in Vercel settings.");
      }
      return;
    }

    // ── No Supabase configured ────────────────────────────────────────
    setLoading(false);
    setErr("Supabase is not configured. Please check your environment variables.");
  };

  const doForgot=async()=>{
    if(!email){setErr("Enter your email address.");return;}
    setLoading(true);setErr("");
    if(HAS_SUPA){
      const sb=await getSupabase();
      const{error}=await sb.auth.resetPasswordForEmail(email.toLowerCase().trim(),{
        redirectTo:`${window.location.origin}/?reset=true`,
      });
      setLoading(false);
      if(error){setErr(error.message);return;}
      setMode("forgot_sent");
    } else {
      setLoading(false);
      setMode("forgot_sent");
    }
  };

  const doRegister=async()=>{
    if(!name.trim()){setErr("Enter your name.");return;}
    if(!email||!email.includes("@")){setErr("Valid email required.");return;}
    if(pass.length<8){setErr("Password must be at least 8 characters.");return;}
    setLoading(true);setErr("");
    if(HAS_SUPA){
      try{
        const sb=await getSupabase();
        const{data,error}=await sb.auth.signUp({
          email:email.toLowerCase().trim(),
          password:pass,
          options:{data:{name:name.trim()}},
        });
        setLoading(false);
        if(error){setErr(error.message);return;}
        if(data.user&&!data.session){
          // Email confirmation required - show sent message
          setMode("forgot_sent");
          return;
        }
        if(data.user){
          // No email confirmation required (disabled in Supabase dashboard)
          try {
            await sb.from("profiles").upsert([{id:data.user.id,role:"customer",name:name.trim()}],{onConflict:"id"});
          } catch(e) { /* profile insert may fail if RLS strict - that's ok */ }
          onLogin({id:data.user.id,email:data.user.email,name:name.trim(),role:"customer",artistId:null});
        }
      }catch(e){setLoading(false);setErr("Registration failed — please try again.");}
    } else {
      setTimeout(()=>{
        setLoading(false);
        setErr("Demo mode: registration requires Supabase. Use demo accounts.");
      },400);
    }
  };

  if(mode==="register") return(
    <Sheet open={open} onClose={onClose} title={t('createAccount')}>
      <div style={{padding:"16px 20px 32px"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:T.xl,color:C.gold,marginBottom:4}}>آواز</div>
          <div style={{color:C.muted,fontSize:T.sm}}>{t('createYourAccount')}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:14}}>
          <Inp label="Full name *" placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doRegister()}/>
          <Inp label="Email *" type="email" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doRegister()}/>
          <Inp label="Password *" type="password" placeholder="At least 8 characters" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doRegister()} hint="At least 8 characters"/>
        </div>
        {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:8,padding:"10px 13px",color:C.ruby,fontSize:T.xs,marginBottom:12}}>⚠ {err}</div>}
        <Btn full sz="lg" loading={loading} onClick={doRegister}>{t('createAccount')}</Btn>
        <button onClick={()=>setMode("login")}
          style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:T.sm,fontFamily:"inherit",width:"100%",textAlign:"center",marginTop:12,minHeight:36}}>
          {t('alreadyHaveAccount')} <span style={{color:C.gold,textDecoration:"underline"}}>{t('createAccountLink')}</span>
        </button>
        <div style={{background:C.surface,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`,marginTop:14}}>
          <div style={{fontSize:T.xs,color:C.muted,lineHeight:1.7}}>
            {t('areYouArtist')} <button onClick={()=>{onClose();}} style={{background:"none",border:"none",color:C.gold,cursor:"pointer",fontFamily:"inherit",fontSize:T.xs,textDecoration:"underline",padding:0}}>{t('applyAsArtistTitle')}</button> {t('buttonInstead')}
          </div>
        </div>
      </div>
    </Sheet>
  );

  if(mode==="forgot"||mode==="forgot_sent") return(
    <Sheet open={open} onClose={onClose} title={t('resetPassword')}>
      <div style={{padding:"16px 20px 32px"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:T.xl,color:C.gold,marginBottom:4}}>آواز</div>
          {mode==="forgot_sent"
            ?<>
               <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:6}}>{t('emailSent2')}</div>
               <div style={{color:C.textD,fontSize:T.sm,lineHeight:1.7,marginBottom:20}}>{t("checkInbox2")} <strong style={{color:C.gold}}>{email}</strong> {t("forResetLink")}</div>
               <Btn full sz="lg" onClick={()=>setMode("login")}>{t('backToSignIn2')}</Btn></>
            :<><div style={{color:C.muted,fontSize:T.sm,marginBottom:16,lineHeight:1.6}}>{t('enterYourEmail2')}</div>
               <Inp label={t('email')} type="email" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doForgot()}/>
               {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:8,padding:"10px 13px",color:C.ruby,fontSize:T.xs,marginTop:10}}>&#9888; {err}</div>}
               <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:8}}>
                 <Btn full sz="lg" loading={loading} onClick={doForgot}>{t('sendResetLink2')}</Btn>
                 <button onClick={()=>setMode("login")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:T.sm,fontFamily:"inherit",minHeight:36}}>{t('backToSignIn2')}</button>
               </div></>}
        </div>
      </div>
    </Sheet>
  );

  return(
    <Sheet open={open} onClose={onClose} title={t('signInToAwaz')}>
      <div style={{padding:"16px 20px 32px"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:T.xl,color:C.gold,marginBottom:4}}>آواز</div>
          <div style={{color:C.muted,fontSize:T.sm}}>{t('welcomeBack')}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:14}}>
          <Inp label={t('email')} type="email" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
          <Inp label={t('password')} type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:8,padding:"10px 13px",color:C.ruby,fontSize:T.xs,marginBottom:12}}>⚠ {err}</div>}
        <Btn full sz="lg" loading={loading} disabled={locked} onClick={doLogin}>{t('signIn')}</Btn>
        <button onClick={()=>setMode("forgot")}
          style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:T.sm,fontFamily:"inherit",textDecoration:"underline",width:"100%",textAlign:"center",marginTop:12,minHeight:36}}>
          {t('forgotPassword')}
        </button>
        <div style={{height:1,background:C.border,margin:"14px 0"}}/>
        <button onClick={()=>setMode("register")}
          style={{background:"none",border:`1px solid ${C.border}`,color:C.textD,cursor:"pointer",fontSize:T.sm,fontFamily:"inherit",width:"100%",textAlign:"center",borderRadius:10,padding:"12px",minHeight:44}}>
          {t('newHere')} <span style={{color:C.gold,fontWeight:700}}>{t('createAccountLink')}</span>
        </button>
        {!HAS_SUPA&&(
          <>
            <HR color={C.border} my={16}/>
            <div style={{background:C.surface,borderRadius:10,padding:"14px",border:`1px solid ${C.border}`,fontSize:T.xs,color:C.muted,textAlign:"center"}}>
              ⚠ Supabase not configured — login disabled
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ── Security helpers ─────────────────────────────────────────────────
const DISPOSABLE_DOMAINS=["mailinator.com","guerrillamail.com","tempmail.com","throwam.com","yopmail.com","sharklasers.com","trashmail.com","maildrop.cc","dispostable.com","fakeinbox.com","temp-mail.org","getairmail.com","discard.email"];
function isDisposableEmail(email:string):boolean{const domain=email.split("@")[1]?.toLowerCase()||"";return DISPOSABLE_DOMAINS.includes(domain);}
function getReqRateKey(email:string):string{return `awaz_rr_${email.toLowerCase().replace(/[^a-z0-9]/g,"_")}`;}
function checkRequestRate(email:string):boolean{try{const key=getReqRateKey(email);const raw=localStorage.getItem(key);const data=raw?JSON.parse(raw):{count:0,window:Date.now()};const wMs=24*60*60*1000;if(Date.now()-data.window>wMs){localStorage.setItem(key,JSON.stringify({count:1,window:Date.now()}));return true;}if(data.count>=3)return false;localStorage.setItem(key,JSON.stringify({...data,count:data.count+1}));return true;}catch{return true;}}
function scoreRequest(form:any):number{let s=40;if(form.name.trim().split(" ").length>=2)s+=10;if(form.notes.trim().length>=30)s+=15;if(form.notes.trim().length>=80)s+=10;if(form.guestCount&&parseInt(form.guestCount)>0)s+=10;if(form.city.trim().length>0)s+=5;if(form.countryCode&&form.countryCode!=="OTHER")s+=5;if(/test|asdf|qwerty|xxx|aaa/i.test(form.name))s-=30;if(/test|asdf|hello/i.test(form.notes))s-=20;const d=(new Date(form.eventDate).getTime()-Date.now())/(1000*60*60*24);if(d<7)s-=20;if(d>365)s-=10;if(d>=14&&d<=180)s+=5;return Math.max(0,Math.min(100,s));}

// ── Booking Request Form (Marketplace offer system) ───────────────────
function BookingRequestForm({ artist, onClose, onSubmit, session, onLoginRequest }) {
  const vp=useViewport();
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({name:"",email:"",eventDate:"",eventType:"wedding",city:"",country:"",countryCode:"",guestCount:"",bookingType:"solo",notes:"",honeypot:""});
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [blockedMsg,setBlockedMsg]=useState("");
  const EVENT_TYPES=["wedding","eid","private","corporate","birthday","cultural","other"];
  const setF=(k:string,v:any)=>setForm(p=>({...p,[k]:v}));

  const validateStep1=():string|null=>{
    if(!form.name.trim()||form.name.trim().length<3)return "Skriv inn fullt navn (fornavn og etternavn).";
    if(!form.email.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))return "Gyldig e-post er påkrevd.";
    if(isDisposableEmail(form.email.trim()))return "Vi aksepterer ikke engangs-e-postadresser.";
    if(!form.eventDate)return "Velg arrangementsdato.";
    const days=(new Date(form.eventDate).getTime()-Date.now())/(1000*60*60*24);
    if(days<7)return "Arrangementet må være minst 7 dager frem i tid.";
    if(days>730)return "Arrangementet kan ikke være mer enn 2 år frem i tid.";
    if(!form.countryCode)return "Velg land for arrangementet.";
    return null;
  };
  const validateStep2=():string|null=>{
    if(form.honeypot.trim())return "SPAM";
    if(!confirmed)return "Bekreft at du er seriøs og villig til å betale depositum.";
    if(form.notes.trim().length<20)return "Skriv minst 20 tegn — hjelp artisten å forstå arrangementet ditt.";
    return null;
  };

  const submitRequest=async()=>{
    const v2=validateStep2();
    if(v2==="SPAM"){setSaving(false);return;}
    if(v2){setErr(v2);return;}
    if(!checkRequestRate(form.email.trim())){setBlockedMsg("Du har sendt for mange forespørsler i dag. Prøv igjen om 24 timer.");return;}
    setSaving(true);setErr("");
    const score=scoreRequest(form);
    const req={id:crypto.randomUUID(),artist_id:artist.id,customer_name:form.name.trim(),customer_email:form.email.trim().toLowerCase(),customer_id:session?.id||null,event_date:form.eventDate,event_type:form.eventType,event_location_city:form.city.trim(),event_location_country:form.country,event_location_country_code:form.countryCode,guest_count:form.guestCount?parseInt(form.guestCount):null,booking_type:form.bookingType,notes:form.notes.trim(),status:"request_received",quality_score:score,flagged:score<30,created_at:new Date().toISOString()};
    if(HAS_SUPA){
      try{
        const sb=await getSupabase();
        if(sb){
          const{count}=await sb.from("booking_requests").select("*",{count:"exact",head:true}).eq("customer_email",req.customer_email).gte("created_at",new Date(Date.now()-24*60*60*1000).toISOString());
          if((count||0)>=5){setSaving(false);setBlockedMsg("For mange forespørsler fra denne e-posten i dag. Prøv igjen i morgen.");return;}
          const{error}=await sb.from("booking_requests").insert([req]);
          if(error){setSaving(false);setErr("Noe gikk galt — prøv igjen.");return;}
          if(!req.flagged){sendEmailNotification({type:"new_booking",toEmail:artist.email,toName:artist.name,fromName:form.name.trim(),artistName:artist.name,bookingDate:form.eventDate,eventType:form.eventType});}
        }
      }catch(e){console.warn("Request save failed:",e);}
    }
    setSaving(false);onSubmit?.(req);setStep(3);
  };

  if(blockedMsg)return(<div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div style={{background:C.card,border:`1px solid ${C.ruby}44`,borderRadius:20,padding:"36px 28px",maxWidth:400,width:"100%",textAlign:"center"}}><div style={{fontSize:44,marginBottom:12}}>⚠️</div><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:10}}>Forespørsel blokkert</div><div style={{color:C.muted,fontSize:T.sm,lineHeight:1.7,marginBottom:20}}>{blockedMsg}</div><button onClick={onClose} style={{width:"100%",background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:10,padding:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:T.sm}}>Lukk</button></div></div>);

  if(step===3)return(<div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}><div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"32px 28px",maxWidth:420,width:"100%"}} onClick={e=>e.stopPropagation()}><div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:52,marginBottom:12}}>✦</div><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:8}}>Forespørsel sendt!</div><div style={{color:C.textD,fontSize:T.sm,lineHeight:1.8}}><strong style={{color:C.gold}}>{artist.name}</strong> vil svare innen <strong style={{color:C.text}}>48 timer</strong>.</div></div>{!session&&(<div style={{background:C.surface,border:`1px solid ${C.gold}44`,borderRadius:12,padding:"16px 18px",marginBottom:16}}><div style={{fontWeight:700,color:C.text,fontSize:T.sm,marginBottom:6}}>📲 Følg forespørselen din</div><div style={{color:C.muted,fontSize:T.xs,lineHeight:1.6,marginBottom:12}}>Opprett en gratis konto for å se status, motta tilbud og kommunisere direkte med artisten.</div><button onClick={()=>{onClose();onLoginRequest?.("register",form.email);}} style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:10,padding:"12px",fontWeight:800,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit",marginBottom:8}}>Opprett konto og følg forespørselen →</button><button onClick={()=>{onClose();onLoginRequest?.("login",form.email);}} style={{width:"100%",background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px",fontWeight:600,fontSize:T.xs,cursor:"pointer",fontFamily:"inherit"}}>Jeg har allerede en konto — logg inn</button></div>)}{session&&(<div style={{background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:T.xs,color:C.emerald,fontWeight:600}}>✓ Forespørselen er koblet til kontoen din</div>)}<div style={{fontSize:10,color:C.faint,textAlign:"center",lineHeight:1.6,marginBottom:14}}>📧 Oppdatering sendes til <strong style={{color:C.muted}}>{form.email}</strong></div><button onClick={onClose} style={{width:"100%",background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:10,padding:12,fontWeight:600,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>Lukk</button></div></div>);

  return(
    <Sheet open onClose={onClose} title="Send bookingforespørsel">
      <div style={{padding:"16px 20px 32px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0 16px",borderBottom:`1px solid ${C.border}`,marginBottom:16}}>
          {artist.photo?<img src={artist.photo} alt={artist.name} style={{width:44,height:44,borderRadius:10,objectFit:"cover"}}/>:<div style={{width:44,height:44,borderRadius:10,background:C.goldS,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{artist.emoji}</div>}
          <div><div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{artist.name}</div><div style={{color:C.muted,fontSize:T.xs}}>{artist.genre} · {artist.location}</div></div>
          <div style={{marginLeft:"auto",fontSize:10,color:C.emerald,background:C.emeraldS,borderRadius:20,padding:"4px 10px",border:`1px solid ${C.emerald}33`,fontWeight:700}}>Gratis å sende</div>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:20}}>{[1,2].map(s=>(<div key={s} style={{flex:1,height:3,borderRadius:2,background:s<=step?C.gold:C.border,transition:"background 0.3s"}}/>))}</div>
        {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:8,padding:"10px 13px",color:C.ruby,fontSize:T.xs,marginBottom:12}}>⚠ {err}</div>}

        {step===1&&(<div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:4}}>Om arrangementet ditt</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Inp label="Fullt navn *" placeholder="Fornavn Etternavn" value={form.name} onChange={e=>setF("name",e.target.value)}/><Inp label="E-post *" type="email" placeholder="deg@epost.no" value={form.email} onChange={e=>setF("email",e.target.value)}/></div>
          <div><div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:6}}>Dato * <span style={{color:C.faint,fontWeight:400}}>(minst 7 dager frem)</span></div><input type="date" value={form.eventDate} onChange={e=>setF("eventDate",e.target.value)} min={new Date(Date.now()+7*24*60*60*1000).toISOString().split("T")[0]} style={{width:"100%",background:C.card,border:`2px solid ${form.eventDate?C.emerald:C.border}`,borderRadius:10,padding:"12px 14px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit",boxSizing:"border-box" as const}}/>{form.eventDate&&(()=>{const d=new Date(form.eventDate);const mk=`${d.getFullYear()}-${d.getMonth()}`;const day=d.getDate();const isAvail=(artist.available?.[mk]||[]).includes(day);const isBlocked=(artist.blocked?.[mk]||[]).includes(day);if(isBlocked)return<div style={{marginTop:6,fontSize:11,color:C.ruby,fontWeight:600}}>⚠ Artisten er opptatt denne datoen — velg en annen</div>;if(isAvail)return<div style={{marginTop:6,fontSize:11,color:C.emerald,fontWeight:600}}>✓ Artisten har markert denne datoen som ledig</div>;return<div style={{marginTop:6,fontSize:11,color:C.muted}}>Datoen er ikke bekreftet — artisten avklarer ved svar</div>;})()}</div>
          <div><div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:8}}>Type arrangement *</div><div style={{display:"flex",flexWrap:"wrap" as const,gap:6}}>{EVENT_TYPES.map(et=>(<button key={et} onClick={()=>setF("eventType",et)} style={{background:form.eventType===et?C.goldS:"transparent",color:form.eventType===et?C.gold:C.muted,border:`1px solid ${form.eventType===et?C.gold+"66":C.border}`,borderRadius:20,padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:T.xs,fontWeight:600,textTransform:"capitalize" as const}}>{et}</button>))}</div></div>
          <div><div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:6}}>Land *</div>{artist.countryPricing?.filter((r:any)=>r.active).length>0?(<div style={{display:"flex",flexWrap:"wrap" as const,gap:6}}>{artist.countryPricing.filter((r:any)=>r.active).map((row:any)=>{const m=MARKETS.find(m=>m.code===row.code);const isSel=form.countryCode===row.code;return m?(<button key={row.code} onClick={()=>setForm(p=>({...p,countryCode:row.code,country:m.name}))} style={{background:isSel?C.goldS:C.surface,border:`2px solid ${isSel?C.gold:C.border}`,borderRadius:10,padding:"9px 14px",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:18}}>{m.flag}</span><span style={{fontSize:T.xs,fontWeight:isSel?700:500,color:isSel?C.gold:C.text}}>{m.name}</span>{isSel&&<span style={{color:C.gold,fontSize:12}}>✓</span>}</button>):null;})}</div>):(<Inp label="" placeholder="Land" value={form.country} onChange={e=>setF("country",e.target.value)}/>)}</div>
          <Inp label="By / sted" placeholder="Oslo, Bergen, Berlin…" value={form.city} onChange={e=>setF("city",e.target.value)}/>
          {(artist.artistType==="vocalist"||artist.artist_type==="vocalist")&&artist.depositWithBand&&(<div><div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:8}}>Bookingtype</div><div style={{display:"flex",gap:10}}>{[{v:"solo",l:"Solo — kun vokalist",sub:"Vokal uten band"},{v:"band",l:"Med fullt band",sub:"Vokalist + musikere"}].map(({v,l,sub})=>(<button key={v} onClick={()=>setF("bookingType",v)} style={{flex:1,background:form.bookingType===v?C.goldS:C.surface,border:`2px solid ${form.bookingType===v?C.gold:C.border}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",fontFamily:"inherit",textAlign:"left" as const}}><div style={{fontSize:T.xs,fontWeight:700,color:form.bookingType===v?C.gold:C.text}}>{l}</div><div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div></button>))}</div></div>)}
          <button onClick={()=>{const e=validateStep1();if(e){setErr(e);return;}setErr("");setStep(2);}} style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:10,padding:14,fontWeight:800,fontSize:T.base,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>Neste →</button>
        </div>)}

        {step===2&&(<div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:4}}>Detaljer og bekreftelse</div>
          <Inp label="Antall gjester" type="number" placeholder="F.eks. 80" value={form.guestCount} onChange={e=>setF("guestCount",e.target.value)}/>
          <div>
            <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:6}}>Fortell artisten om arrangementet * <span style={{color:form.notes.length>=20?C.emerald:C.muted,fontWeight:400}}>{form.notes.length}/20 min</span></div>
            <textarea value={form.notes} onChange={e=>setF("notes",e.target.value)} placeholder={"Beskriv arrangementet:\n• Type feiring og anledning\n• Ønskede sanger eller stil\n• Spesielle ønsker"} rows={5} style={{width:"100%",background:C.card,border:`2px solid ${form.notes.length>=20?C.emerald:C.border}`,borderRadius:10,padding:"12px 14px",color:C.text,fontSize:T.sm,fontFamily:"inherit",outline:"none",resize:"vertical" as const,lineHeight:1.6,boxSizing:"border-box" as const}}/>
            <div style={{fontSize:10,color:C.faint,marginTop:4}}>Ikke inkluder telefonnummer — all kontakt skjer på Awaz.</div>
          </div>
          {/* Honeypot — invisible to humans */}
          <div style={{position:"absolute",left:"-9999px",opacity:0,pointerEvents:"none" as const}} aria-hidden="true"><input tabIndex={-1} value={form.honeypot} onChange={e=>setF("honeypot",e.target.value)} autoComplete="off"/></div>
          {/* Intent confirmation */}
          <div style={{background:C.surface,border:`2px solid ${confirmed?C.emerald+"55":C.border}`,borderRadius:10,padding:"14px 16px"}}>
            <label style={{display:"flex",gap:12,alignItems:"flex-start",cursor:"pointer"}} onClick={()=>setConfirmed(p=>!p)}>
              <div style={{width:22,height:22,borderRadius:6,background:confirmed?C.emerald:C.card,border:`2px solid ${confirmed?C.emerald:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,transition:"all 0.15s"}}>{confirmed&&<span style={{color:"#fff",fontSize:14,lineHeight:1}}>✓</span>}</div>
              <div style={{fontSize:T.xs,color:C.textD,lineHeight:1.6}}>Jeg bekrefter at denne forespørselen er seriøs. Jeg er villig til å betale depositum dersom vi blir enige om pris. Jeg forstår at misbruk kan føre til at kontoen blokkeres.</div>
            </label>
          </div>
          <div style={{background:`${C.lapis}08`,border:`1px solid ${C.lapis}22`,borderRadius:10,padding:"10px 14px"}}><div style={{display:"flex",flexWrap:"wrap" as const,gap:10}}>{[["🔒","Kryptert og trygg"],["⏱","Svar innen 48t"],["💰","Betal kun ved enighet"],["🚫","Spam blokkeres"]].map(([icon,text])=>(<div key={text as string} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:C.muted}}><span>{icon}</span><span>{text}</span></div>))}</div></div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setStep(1)} style={{background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",fontWeight:600,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit",flex:"0 0 auto"}}>← Tilbake</button>
            <button onClick={submitRequest} disabled={saving} style={{flex:1,background:saving?C.border:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:saving?C.muted:C.bg,border:"none",borderRadius:10,padding:14,fontWeight:800,fontSize:T.base,cursor:saving?"not-allowed":"pointer",fontFamily:"inherit"}}>{saving?"Sender…":"Send forespørsel →"}</button>
          </div>
        </div>)}
      </div>
    </Sheet>
  );
}

// ── Artist Profile Page ───────────────────────────────────────────────
function ProfilePage({ artist, artists=[], bookings, session, onBack, onBookingCreated, onLoginRequest }) {
  const vp=useViewport();
  const [selDay,setSelDay]=useState(null),[selMonth,setSelMonth]=useState(null),[selYear,setSelYear]=useState(null);
  const [tab,setTab]=useState("about");
  const [showBook,setShowBook]=useState(false);
  const [showCal,setShowCal]=useState(false);
  const [showBookingRequest,setShowBookingRequest]=useState(false);
  const [form,setForm]=useState({name:"",email:"",phone:"",event:"",notes:"",selectedInstrument:"",customerCountry:""});
  const [pending,setPending]=useState(null);
  const [showStripe,setShowStripe]=useState(false);
  const [chat,setChat]=useState(null);
  const [err,setErr]=useState("");
  const policy=POLICIES.find(p=>p.id===artist.cancellationPolicy);

  const doBook=()=>{
    // Artist must be approved
    if(artist.status!=="approved"){setErr("This artist is not currently available for booking.");return;}
    // Name required
    if(!form.name.trim()){setErr("Your name is required.");return;}
    // Proper email validation
    const emailRegex=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if(!form.email||!emailRegex.test(form.email.trim())){setErr("A valid email address is required.");return;}
    // Date must be selected
    if(!selDay||selMonth===null||!selYear){setErr("Please select a date first.");return;}
    // Deposit must be valid
    if(!artist.deposit||artist.deposit<1){setErr("This artist has not set up pricing yet.");return;}
    setErr("");
    const nb={
      id:`b${Date.now()}`,
      artistId:artist.id,
      customerName:form.name.trim().slice(0,100),
      customerEmail:form.email.trim().toLowerCase().slice(0,200),
      customerPhone:(form.phone||"").slice(0,30),
      date:`${MONTHS[selMonth]} ${selDay}, ${selYear}`,
      event:(form.event||"Private Event").slice(0,100),
      eventType:(form.event||"Private Event").slice(0,100),
      deposit:artist.deposit,
      depositPaid:false,
      status:"pending_payment",
      chatUnlocked:false,
      messages:[],
      selectedInstrument:(form.selectedInstrument||artist.instruments?.[0]||"").slice(0,50),
      country:(form.customerCountry||"").slice(0,50),
      notes:(form.notes||"").slice(0,1000),
    };
    setPending(nb);setShowBook(false);setShowStripe(true);
  };
  const [showEventPlan,setShowEventPlan]=useState(false);
  const [showCelebration,setShowCelebration]=useState(false);
  const onPaid=()=>{
    if(!pending)return;
    const paid={...pending,depositPaid:true,status:"confirmed",chatUnlocked:true};
    onBookingCreated(paid);
    setShowCelebration(true);
    setTimeout(()=>{setShowCelebration(false);setShowEventPlan(true);},2800);
    // Email the customer confirmation
    sendEmailNotification({
      type:"booking_confirmed",
      toEmail:pending.customerEmail,
      toName:pending.customerName,
      artistName:artist.name,
      bookingDate:pending.date,
      depositAmount:artist.deposit,
      currency:artist.currency||"EUR",
      eventType:pending.eventType,
    });
    // Email the artist — new booking
    sendEmailNotification({
      type:"new_booking",
      toEmail:artist.email,
      toName:artist.name,
      fromName:pending.customerName,
      artistName:artist.name,
      bookingDate:pending.date,
      depositAmount:artist.deposit,
      currency:artist.currency||"EUR",
      eventType:pending.eventType,
    });
  };

  // Mobile: stack layout | Desktop: side-by-side
  return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:vp.isMobile?88:0}}>
      {/* Hero */}
      <div style={{position:"relative",overflow:"hidden",borderBottom:`1px solid ${C.border}`}}>
        <Geo id="prof" op={0.05}/>
        <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 30% 80%,${artist.color}0C 0%,transparent 60%)`,pointerEvents:"none",zIndex:0}}/>
        <div style={{maxWidth:1200,margin:"0 auto",padding:`0 ${vp.isMobile?16:48}px`,position:"relative",zIndex:1}}>
          <div style={{paddingTop:16,marginBottom:16}}>
            <button onClick={onBack} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"10px 16px",fontSize:T.sm,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:7,minHeight:44,WebkitTapHighlightColor:"transparent"}}>{t('back')}</button>
          </div>
          <div style={{display:"flex",flexDirection:vp.isMobile?"column":"row",gap:vp.isMobile?14:24,alignItems:vp.isMobile?"flex-start":"flex-end",paddingBottom:24,position:"relative"}}>
            <div style={{position:"relative",flexShrink:0}}>
              {artist.photo?<img src={artist.photo} alt={artist.name} style={{width:vp.isMobile?80:100,height:vp.isMobile?80:100,borderRadius:14,objectFit:"cover",border:`2px solid ${artist.color}66`}}/>:
                <div style={{width:vp.isMobile?80:100,height:vp.isMobile?80:100,borderRadius:14,background:C.goldS,border:`2px solid ${C.gold}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:vp.isMobile?38:48}}>{artist.emoji}</div>}
              {artist.verified&&<div style={{position:"absolute",bottom:-5,right:-5,background:C.emerald,borderRadius:20,padding:"3px 8px",fontSize:10,fontWeight:700,color:"#fff",border:`2px solid ${C.bg}`}}>✓</div>}
            </div>
            <div style={{flex:1}}>
              {artist.nameDari&&<div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:T.sm,color:C.gold,direction:"rtl",marginBottom:3}}>{artist.nameDari}</div>}
              <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["3xl"],fontWeight:800,color:C.text,margin:"0 0 5px",lineHeight:1}}>{artist.name}</h1>
              <div style={{color:C.gold,fontWeight:600,fontSize:T.sm,marginBottom:8}}>{artist.genre}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
                <span style={{color:C.muted,fontSize:T.xs}}>{artist.location}</span>
                {artist.reviews>0&&<Stars rating={artist.rating} count={artist.reviews}/>}
                {artist.superhost&&<Badge color={C.gold}>★ Top</Badge>}
              </div>
            </div>
            {!vp.isMobile&&(
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:T.xs,color:C.muted,marginBottom:6,letterSpacing:"0.8px",textTransform:"uppercase"}}>Available for your event</div>
                <Btn v="gold" sz="lg" onClick={()=>setShowBookingRequest(true)} xs={{marginBottom:8,display:"block"}}>Request Booking →</Btn>
                <div style={{fontSize:11,color:C.muted,textAlign:"center"}}>No payment now · Artist responds within 48h</div>
              </div>
            )}
          </div>
          {/* Mobile price + book CTA */}
          {vp.isMobile&&(
            <div style={{padding:"0 16px 16px",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:"0.5px"}}>Available for weddings, Eid, birthdays & concerts</div>
              <div style={{display:"flex",gap:10}}>
                <Btn v="gold" sz="lg" onClick={()=>setShowBookingRequest(true)} xs={{flex:1}}>Request Booking →</Btn>
                <Btn v="ghost" sz="lg" onClick={()=>setShowSongReq(true)} xs={{flex:1}}>Request a Song</Btn>
              </div>
              <div style={{fontSize:11,color:C.faint,textAlign:"center"}}>Deposit amount shown after you select a date</div>
            </div>
          )}
        </div>
        <div style={{height:1,background:`linear-gradient(90deg,transparent,${artist.color}38,transparent)`}}/>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:`20px ${vp.isMobile?0:48}px 60px`,display:vp.isMobile?"block":"grid",gridTemplateColumns:"1fr 320px",gap:32}}>
        {/* Content tabs */}
        <div>
          {/* Tab bar — scrollable on mobile */}
          <div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",padding:vp.isMobile?"0 16px":0}}>
            {[["about",t('aboutTab')],["instruments",t('instrumentsTab')],["social",t('socialTab')],["reviews",t('reviewsTab')],["policy",t('policyTab')]].map(([id,l])=>(
              <button key={id} onClick={()=>setTab(id)}
                style={{background:"transparent",color:tab===id?artist.color:C.muted,border:"none",borderBottom:`2px solid ${tab===id?artist.color:"transparent"}`,padding:"14px 18px",fontSize:T.sm,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0,marginBottom:-1,minHeight:48,WebkitTapHighlightColor:"transparent",letterSpacing:"0.2px"}}>
                {l}
              </button>
            ))}
          </div>

          <div style={{padding:vp.isMobile?"16px":"0px",paddingTop:vp.isMobile?16:20}}>
            {tab==="about"&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>

                {/* ── In Demand / Social proof signal ── */}
                {((artist.totalBookings||0)>=5||(artist.reviews||0)>=3)&&(
                  <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" as const}}>
                    <span style={{fontSize:16}}>🔥</span>
                    <div style={{flex:1}}>
                      <span style={{fontWeight:700,color:C.text,fontSize:T.xs}}>{t('inDemand')}</span>
                      <span style={{color:C.textD,fontSize:T.xs,marginLeft:6}}>
                        {(artist.totalBookings||0)>0&&`Booked ${artist.totalBookings} times · `}
                        {(artist.reviews||0)>0&&`${artist.reviews} verified reviews · `}
                        {t('bookEarlySub')}
                      </span>
                    </div>
                    {artist.verified&&<span style={{background:C.emeraldS,color:C.emerald,fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:10,border:`1px solid ${C.emerald}33`}}>✓ Verified</span>}
                  </div>
                )}

                <div style={{background:C.card,borderRadius:12,padding:vp.isMobile?20:28,border:`1px solid ${C.border}`}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.xl,fontWeight:700,marginBottom:14,letterSpacing:"-0.3px"}}>About {artist.name.split(" ")[0]}</div>
                  <p style={{
                    color:C.text,lineHeight:1.9,margin:"0 0 16px",
                    fontSize:T.base,
                    fontFamily:"'DM Sans',sans-serif",
                    fontWeight:450,
                  }}>{artist.bio}</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7}}>{artist.tags.map((tg:string)=><Badge key={tg} color={C.muted} sm={false}>{tg}</Badge>)}</div>
                </div>

                {/* ── Band section — shown if artist has configured band members ── */}
                {Array.isArray(artist.bandMembers)&&artist.bandMembers.length>0&&(
                  <div style={{background:C.card,border:`1px solid ${C.lapis}33`,borderRadius:12,padding:vp.isMobile?16:24,overflow:"hidden"}}>
                    <div style={{height:3,background:`linear-gradient(90deg,${C.lapis},${C.gold})`,margin:vp.isMobile?"-16px -16px 16px":"-24px -24px 20px"}}/>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                      <span style={{fontSize:20}}>🎼</span>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.text,fontSize:T.lg,fontWeight:700}}>Performs with a Band</div>
                    </div>
                    <div style={{color:C.textD,fontSize:T.sm,marginBottom:14,lineHeight:1.7}}>
                      This artist brings their own ensemble. Book them as a complete group for the full Afghan music experience.
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                      {/* Artist themselves */}
                      <div style={{background:C.surface,border:`1px solid ${C.gold}44`,borderLeft:`3px solid ${C.gold}`,borderRadius:8,padding:"10px 12px"}}>
                        <div style={{fontSize:16,marginBottom:4}}>{artist.artistType==="instrumentalist"?"🎸":"🎤"}</div>
                        <div style={{fontWeight:700,color:C.gold,fontSize:T.xs}}>{artist.name.split(" ")[0]}</div>
                        <div style={{fontSize:10,color:C.muted}}>{artist.genre} · €{artist.deposit}</div>
                      </div>
                      {(artist.bandMembers as {role:string;name:string;price:number}[]).map((m,i)=>{
                        const roleIcons:Record<string,string>={Tabla:"🥁",Rubab:"🪕",Drums:"🎶",Keyboard:"🎹",Guitar:"🎸",Harmonium:"🎵",Vocalist:"🎤"};
                        return(
                          <div key={i} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.lapis}44`,borderRadius:8,padding:"10px 12px"}}>
                            <div style={{fontSize:16,marginBottom:4}}>{roleIcons[m.role]||"🎵"}</div>
                            <div style={{fontWeight:700,color:C.text,fontSize:T.xs}}>{m.name||m.role}</div>
                            <div style={{fontSize:10,color:C.muted}}>{m.role} · €{m.price}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{background:C.goldS,border:`1px solid ${C.gold}33`,borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontSize:T.xs,color:C.muted}}>Total band deposit</div>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.gold,fontSize:T.lg}}>
                        €{(artist.deposit||0)+(artist.bandMembers as any[]).reduce((s:number,m:any)=>s+(m.price||0),0)}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{background:C.card,borderRadius:12,padding:vp.isMobile?20:28,border:`1px solid ${C.border}`}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.xl,fontWeight:700,marginBottom:14,letterSpacing:"-0.3px"}}>{t('bookingTerms')}</div>

                  {/* Vocalist dual booking types — shown without prices */}
                  {(artist.artistType==="vocalist"||artist.artist_type==="vocalist")&&artist.depositWithBand&&(
                    <>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        <div style={{background:C.goldS,border:`2px solid ${C.gold}44`,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                          <div style={{fontSize:18,marginBottom:4}}>🎤</div>
                          <div style={{fontWeight:700,color:C.text,fontSize:T.xs,marginBottom:4}}>Solo — kun vokalist</div>
                          <div style={{fontSize:11,color:C.muted,marginTop:3}}>Vokal uten instrumenter</div>
                        </div>
                        <div style={{background:C.lapisS,border:`2px solid ${C.lapis}44`,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                          <div style={{fontSize:18,marginBottom:4}}>🎼</div>
                          <div style={{fontWeight:700,color:C.text,fontSize:T.xs,marginBottom:4}}>Med fullt band</div>
                          <div style={{fontSize:11,color:C.muted,marginTop:3}}>Vokalist + musikere</div>
                        </div>
                      </div>
                      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",gap:10,alignItems:"flex-start"}}>
                        <span style={{fontSize:16,flexShrink:0}}>💡</span>
                        <div>
                          <div style={{fontWeight:700,color:C.text,fontSize:T.xs,marginBottom:3}}>{t('bookingTermsSoloNote')}</div>
                          <div style={{fontSize:11,color:C.textD,lineHeight:1.6}}>
                            Vil du ha tabla, keyboard eller andre musikere, velg <strong style={{color:C.lapis}}>Med fullt band</strong> — eller bruk <strong style={{color:C.lapis}}>Book et Band</strong> for å legge til enkeltartister separat.
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {/* Solo vocalist without band configured — still show note */}
                  {(artist.artistType==="vocalist"||artist.artist_type==="vocalist")&&!artist.depositWithBand&&!artist.deposit_with_band&&(
                    <div style={{background:C.goldS,border:`1px solid ${C.gold}33`,borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",gap:10,alignItems:"flex-start"}}>
                      <span style={{fontSize:16,flexShrink:0}}>💡</span>
                      <div>
                        <div style={{fontWeight:700,color:C.text,fontSize:T.xs,marginBottom:3}}>{t('bookingTermsVocalistOnly')}</div>
                        <div style={{fontSize:11,color:C.textD,lineHeight:1.6}}>
                          Need tabla, keyboard or other instruments? Use <strong style={{color:C.lapis}}>🎼 Book a Band</strong> to add musicians from the platform to your event.
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr":"1fr 1fr",gap:12}}>
                    {[["","Deposit via Stripe","Paid only after you accept an offer"],["","Chat unlocks immediately","Direct messaging after payment"],["💵","Balance in cash","To artist after the concert"],["📋",`${policy?.label} policy`,policy?.desc||""]].map(([icon,k,v])=>(
                      <div key={k} style={{background:C.surface,borderRadius:8,padding:"12px 14px",border:`1px solid ${C.border}`,borderLeft:`3px solid ${artist.color}35`}}>
                        <div style={{fontSize:18,marginBottom:6}}>{icon}</div>
                        <div style={{color:C.text,fontWeight:700,fontSize:T.xs,marginBottom:3}}>{k}</div>
                        <div style={{color:C.textD,fontSize:T.xs,lineHeight:1.6}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Performing countries — shown to customers, no prices */}
                {artist.countryPricing?.filter((r:any)=>r.active).length>0&&(
                  <div style={{background:C.card,borderRadius:12,padding:vp.isMobile?16:24,border:`1px solid ${C.border}`}}>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.lg,fontWeight:700,marginBottom:4}}>{t('availableIn')||'Available In'}</div>
                    <div style={{color:C.muted,fontSize:T.xs,marginBottom:14}}>Denne artisten er tilgjengelig for bookinger i følgende land</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {artist.countryPricing.filter((r:any)=>r.active).map((row:any)=>{
                        const m=MARKETS.find(m=>m.code===row.code);
                        if(!m) return null;
                        return(
                          <div key={row.code} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:18}}>{m.flag}</span>
                            <span style={{color:C.text,fontSize:T.sm,fontWeight:600}}>{m.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Country pricing hidden — pricing is private in offer system */}
              </div>
            )}
            {tab==="instruments"&&(
              <div style={{background:C.card,borderRadius:12,padding:vp.isMobile?16:24,border:`1px solid ${C.border}`}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.lg,fontWeight:700,marginBottom:4}}>Instruments &amp; Skills</div>
                {artist.instruments?.length>1&&(
                  <div style={{color:C.muted,fontSize:T.sm,marginBottom:14,lineHeight:1.6}}>
                    This artist can perform with <strong style={{color:C.text}}>{artist.instruments.length} different instruments</strong>. You choose which one when booking.
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:artist.instruments?.length>1?16:0}}>
                  {(artist.instruments as string[]).map((ins,i)=>{
                    const icons:Record<string,string>={Tabla:"🥁",Rubab:"🪕",Drums:"🎶",Keyboard:"🎹",Guitar:"🎸",Harmonium:"🎵"};
                    const dariNames:Record<string,string>={Tabla:"طبله",Rubab:"رباب",Drums:"درامز",Keyboard:"کیبورد",Guitar:"گیتار",Harmonium:"هارمونیم"};
                    const isPrimary=i===0&&artist.artistType==="instrumentalist";
                    return(
                      <div key={ins} style={{background:C.surface,border:`1px solid ${isPrimary?artist.color:C.border}`,borderLeft:`3px solid ${isPrimary?artist.color:C.borderM}`,borderRadius:10,padding:"13px 14px",position:"relative"}}>
                        {isPrimary&&<div style={{position:"absolute",top:6,right:8,fontSize:10,fontWeight:700,color:artist.color,background:`${artist.color}15`,padding:"2px 7px",borderRadius:10}}>Primary</div>}
                        <div style={{fontSize:22,marginBottom:5}}>{icons[ins]||"🎵"}</div>
                        <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{ins}</div>
                        {dariNames[ins]&&<div style={{fontSize:11,color:C.muted,fontFamily:"'Noto Naskh Arabic',serif",marginTop:2}}>{dariNames[ins]}</div>}
                      </div>
                    );
                  })}
                </div>
                {/* CTA: nudge customer to request booking */}
                {artist.instruments?.length>0&&(
                  <div style={{background:`${C.lapis}0F`,border:`1px solid ${C.lapis}33`,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap" as const}}>
                    <div style={{fontSize:T.xs,color:C.muted,lineHeight:1.5}}>
                      Interested in booking {artist.name.split(" ")[0]}? Send a free request.
                    </div>
                    <button onClick={()=>setShowBookingRequest(true)} style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontSize:T.xs,fontWeight:800,cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap" as const}}>
                      Request Booking →
                    </button>
                  </div>
                )}
              </div>
            )}
            {tab==="reviews"&&(
              <ReviewsSection artist={artist} session={session} bookings={bookings} onNewBooking={onBookingCreated}/>
            )}
            {tab==="social"&&(
              <div style={{paddingTop:4}}>
                {(artist.spotify||artist.instagram)
                  ?<SocialBar artist={artist}/>
                  :<div style={{textAlign:"center",padding:"40px 24px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
                    
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:6}}>{t('noSocialConnected')}</div>
                    <div style={{color:C.muted,fontSize:T.sm}}>{t('noSocialDesc')}</div>
                  </div>
                }
              </div>
            )}
            {tab==="policy"&&(
              <div style={{background:C.card,borderRadius:12,padding:vp.isMobile?20:28,border:`1px solid ${C.border}`}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.xl,fontWeight:700,marginBottom:16,letterSpacing:"-0.3px"}}>Booking Terms — {policy?.label}</div>
                {[["Deposit","Paid via Stripe after both parties agree on a price"],["Balance","Paid directly to artist after performance"],["Cancellation Policy",policy?.desc||"Full refund 72h+ before · No refund after"]].map(([k,v])=>(
                  <div key={k} style={{marginBottom:18,paddingBottom:18,borderBottom:`1px solid ${C.border}`}}>
                    <div style={{color:C.text,fontWeight:700,fontSize:T.md,marginBottom:5,fontFamily:"'DM Sans',sans-serif"}}>{k}</div>
                    <div style={{color:C.textD,fontSize:T.base,lineHeight:1.75,fontFamily:"'DM Sans',sans-serif"}}>{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Desktop + Tablet sidebar */}
        {!vp.isMobile&&(
          <div style={{position:"sticky",top:24,display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,0.5)"}}>
              <div style={{height:2,background:`linear-gradient(90deg,${artist.color}88,${C.gold}88,${artist.color}88)`}}/>
              <div style={{padding:20}}>
                {/* ── Social proof: viewing now ── */}
                {(artist.totalBookings||0)>0&&(
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,background:C.surface,borderRadius:8,padding:"7px 12px",border:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",gap:3}}>
                      {[C.ruby,C.gold,C.lapis].map(c=>(
                        <div key={c} style={{width:8,height:8,borderRadius:"50%",background:c,opacity:0.8}}/>
                      ))}
                    </div>
                    <span style={{fontSize:11,color:C.muted}}>
                      <strong style={{color:C.text}}>{2+(artist.totalBookings%4)}</strong> people viewing · booked <strong style={{color:C.text}}>{artist.totalBookings}</strong> times
                    </span>
                  </div>
                )}

                <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.lg,fontWeight:700,marginBottom:6}}>Book {artist.name.split(" ")[0]}</div>
                <div style={{color:C.muted,fontSize:T.xs,marginBottom:14,lineHeight:1.6}}>Send a free booking request — no payment until both parties agree on a price.</div>

                {/* Steps */}
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                  {[["1","Send request","Event date + budget range"],["2","Get an offer","Artist responds within 48h"],["3","Pay deposit","Only when you agree on price"]].map(([n,title,sub])=>(
                    <div key={n} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:C.goldS,border:`1px solid ${C.gold}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:C.gold,flexShrink:0,marginTop:1}}>{n}</div>
                      <div>
                        <div style={{fontSize:T.xs,fontWeight:700,color:C.text}}>{title}</div>
                        <div style={{fontSize:10,color:C.muted}}>{sub}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={()=>setShowBookingRequest(true)}
                  style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:10,padding:"14px",fontSize:T.base,fontWeight:800,cursor:"pointer",fontFamily:"inherit",minHeight:50,letterSpacing:"0.2px",marginBottom:8}}>
                  Request Booking →
                </button>
                <div style={{fontSize:10,color:C.faint,textAlign:"center",lineHeight:1.6}}>
                  Free to request · No credit card now · Artist responds within 48h
                </div>
              </div>
            </div>
            {/* Social proof below booking card */}
            <SocialBar artist={artist}/>
            {/* Similar artists */}
            {artists.filter((a:any)=>a.id!==artist.id&&a.status==="approved"&&(a.genre===artist.genre||a.tags?.some((t:string)=>artist.tags?.includes(t)))).slice(0,3).length>0&&(
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}>
                <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:"0.8px",marginBottom:12}}>Lignende artister</div>
                {artists.filter((a:any)=>a.id!==artist.id&&a.status==="approved"&&(a.genre===artist.genre||a.tags?.some((t:string)=>artist.tags?.includes(t)))).slice(0,3).map((a:any)=>(
                  <div key={a.id} onClick={()=>onBack&&setTimeout(()=>{},0)} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
                    <div style={{width:36,height:36,borderRadius:8,background:C.goldS,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{a.emoji}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,color:C.text,fontSize:T.xs,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{a.name}</div>
                      <div style={{color:C.muted,fontSize:10}}>{a.genre}</div>
                    </div>
                    <div style={{fontSize:10,color:C.gold,fontWeight:700}}>→</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Booking Request Form — offer system */}
      {showBookingRequest&&(
        <BookingRequestForm artist={artist} onClose={()=>setShowBookingRequest(false)}
          session={session}
          onLoginRequest={(mode,prefill)=>{ onLoginRequest?.(mode,prefill); }}
          onSubmit={(req)=>{ onBookingCreated?.(req); }}/>
      )}

      {/* Mobile: Calendar Sheet — now shows request button */}
      <Sheet open={showCal} onClose={()=>setShowCal(false)} title="Select a Date">
        <div style={{padding:"16px 20px 32px"}}>
          <MiniCal artist={artist} selDay={selDay} selMonth={selMonth} selYear={selYear} onSelect={(d,m,y)=>{setSelDay(d);setSelMonth(m);setSelYear(y);}} bookings={bookings}/>
          {selDay&&(
            <div style={{marginTop:16,background:C.surface,borderRadius:10,padding:"14px 16px",border:`1px solid ${C.gold}44`,marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{color:C.muted,fontSize:T.sm}}>Selected date</span>
                <span style={{color:C.text,fontWeight:600,fontSize:T.sm}}>{MONTHS[selMonth]} {selDay}</span>
              </div>
              <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>Send a booking request for this date — no payment until you agree on a price.</div>
            </div>
          )}
          <Btn full sz="lg" disabled={!selDay} onClick={()=>{if(selDay){setShowCal(false);setShowBookingRequest(true);}}}>
             {selDay?`Request Booking — ${MONTHS[selMonth]} ${selDay}`:t('selectDateFirst')}
          </Btn>
        </div>
      </Sheet>

      {/* Mobile: Booking form sheet */}
      <Sheet open={showBook&&vp.isMobile} onClose={()=>setShowBook(false)} title={t('completeBooking')}>
        <div style={{padding:"16px 20px 32px",display:"flex",flexDirection:"column",gap:12}}>

          {/* ── Trust banner ── */}
          <div style={{background:`linear-gradient(135deg,${C.emeraldS},${C.surface})`,border:`1px solid ${C.emerald}33`,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20,flexShrink:0}}>🔒</span>
            <div>
              <div style={{fontWeight:700,color:C.emerald,fontSize:T.xs}}>Safe &amp; Secure Booking</div>
              <div style={{color:C.muted,fontSize:11,lineHeight:1.5,marginTop:1}}>Payment handled by Stripe · Bank-level encryption · Your card is never stored</div>
            </div>
          </div>

          {/* Booking summary + country selector */}
          <div style={{background:C.surface,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
            {/* Country selector — shows when artist has per-country pricing */}
            {artist.countryPricing?.filter((r:any)=>r.active).length>0&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:5}}>
                  🌍 Your country
                </div>
                <select
                  value={form.customerCountry||""}
                  onChange={e=>setForm(f=>({...f,customerCountry:e.target.value}))}
                  style={{width:"100%",background:C.card,border:`2px solid ${form.customerCountry?C.gold:C.border}`,borderRadius:8,padding:"9px 12px",color:form.customerCountry?C.text:C.muted,fontSize:T.sm,outline:"none",fontFamily:"inherit",cursor:"pointer",boxSizing:"border-box" as const}}>
                  <option value="">Select your country…</option>
                  {artist.countryPricing.filter((r:any)=>r.active).map((row:any)=>(
                    <option key={row.country} value={row.country}>{row.flag||"🌍"} {row.country}</option>
                  ))}
                  <option value="other">🌐 Other country</option>
                </select>
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{color:C.muted,fontSize:T.sm}}>{artist.name}</span>
              <span style={{color:C.gold,fontWeight:700,fontSize:T.md,fontFamily:"'Cormorant Garamond',serif"}}>
                {MONTHS[selMonth]} {selDay}, {selYear}
              </span>
            </div>
          </div>

          {/* ── Solo vocalist tip — shown when booking a vocalist without a band ── */}
          {(artist.artistType==="vocalist"||artist.artist_type==="vocalist")&&(
            <div style={{background:C.goldS,border:`1px solid ${C.gold}44`,borderRadius:10,padding:"10px 14px",display:"flex",gap:8,alignItems:"flex-start"}}>
              <span style={{fontSize:16,flexShrink:0}}>💡</span>
              <div>
                <div style={{fontWeight:700,color:C.text,fontSize:11,marginBottom:3}}>{t('soloOnlyNote')}</div>
                <div style={{fontSize:11,color:C.textD,lineHeight:1.6}}>
                  Need tabla, keyboard or other musicians? Use <strong style={{color:C.lapis}}>🎼 Book a Band</strong> to add them from the platform.
                </div>
              </div>
            </div>
          )}

          {/* ── Instrument selector — only if artist has multiple instruments ── */}
          {artist.instruments?.length>1&&(
            <div>
              <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:8}}>
                Which instrument should {artist.name.split(" ")[0]} play? <span style={{color:C.ruby}}>*</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {(artist.instruments as string[]).map((inst:string)=>{
                  const icons:Record<string,string>={Tabla:"🥁",Rubab:"🪕",Drums:"🎶",Keyboard:"🎹",Guitar:"🎸",Harmonium:"🎵"};
                  const sel=form.selectedInstrument===inst;
                  return(
                    <button key={inst} onClick={()=>setForm(f=>({...f,selectedInstrument:inst}))}
                      style={{display:"flex",alignItems:"center",gap:5,background:sel?`${C.lapis}22`:C.surface,border:`2px solid ${sel?C.lapis:C.border}`,borderRadius:20,padding:"7px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:T.xs,fontWeight:700,color:sel?C.lapis:C.muted,transition:"all 0.15s"}}>
                      <span style={{fontSize:15}}>{icons[inst]||"🎵"}</span>{inst}
                      {sel&&<span style={{color:C.lapis}}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:8,padding:"10px 13px",color:C.ruby,fontSize:T.xs}}>⚠ {err}</div>}
          <Inp label={t('yourName')+' *'} placeholder={t('yourName')} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
          <Inp label="Email *" type="email" placeholder="you@email.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
          <Inp label="Phone" type="tel" placeholder="+47 …" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
          <Inp label={t('eventType')} placeholder={t('eventPlaceholder')} value={form.event} onChange={e=>setForm(f=>({...f,event:e.target.value}))}/>
          <Inp label={t('notes')} placeholder={t('notesPlaceholder')} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}/>

          <button onClick={doBook} disabled={!form.name||!form.email}
            style={{width:"100%",background:"linear-gradient(135deg,#635BFF,#7B72FF)",color:"#fff",border:"none",borderRadius:10,padding:16,fontSize:T.md,fontWeight:800,cursor:"pointer",opacity:!form.name||!form.email?0.5:1,fontFamily:"inherit",minHeight:52}}>
            Pay €{artist.deposit} via Stripe →
          </button>

          {/* ── What happens after payment ── */}
          <div style={{background:C.surface,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:8,textTransform:"uppercase" as const,letterSpacing:"0.5px"}}>{t('applyNextSteps')}</div>
            {[
              {icon:"💳",step:"You pay the deposit securely via Stripe"},
              {icon:"💬",step:"Chat unlocks — message the artist directly"},
              {icon:"🎵",step:"The artist performs at your event"},
              {icon:"💵",step:"Pay the balance in cash after the concert"},
            ].map(({icon,step})=>(
              <div key={step} style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
                <span style={{fontSize:14,flexShrink:0,marginTop:1}}>{icon}</span>
                <span style={{fontSize:11,color:C.muted,lineHeight:1.5}}>{step}</span>
              </div>
            ))}
          </div>
          <div style={{textAlign:"center",color:C.muted,fontSize:T.xs}}>🔒 Stripe · SSL · PCI compliant · Never share card details with us</div>
        </div>
      </Sheet>

      {showStripe&&pending&&<StripeCheckout booking={pending} artist={artist} onSuccess={onPaid} onClose={()=>setShowStripe(false)}/>}

      {/* ── Post-payment celebration ── */}
      {showCelebration&&(
        <div style={{position:"fixed",inset:0,zIndex:9800,background:"rgba(0,0,0,0.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,backdropFilter:"blur(10px)"}}>
          <div style={{fontSize:64,animation:"none"}}>🎉</div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"clamp(28px,7vw,44px)",fontWeight:800,color:"#EDE4CE",textAlign:"center",lineHeight:1.1}}>Booking Confirmed!</div>
          <div style={{color:"#8A7D68",fontSize:15,textAlign:"center",maxWidth:320,lineHeight:1.7}}>
            Your deposit has been received. Your chat with <strong style={{color:C.gold}}>{artist.name}</strong> is now open.
          </div>
          <div style={{display:"flex",gap:10,marginTop:8,flexWrap:"wrap" as const,justifyContent:"center"}}>
            {[["💬","Chat unlocked"],["📋","Share event details"],["🎵","Request songs"]].map(([ico,lbl])=>(
              <div key={lbl as string} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(200,168,74,0.12)",border:"1px solid rgba(200,168,74,0.3)",borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:700,color:C.gold}}>
                <span>{ico}</span>{lbl}
              </div>
            ))}
          </div>
          <div style={{marginTop:12,width:200,height:3,background:"rgba(255,255,255,0.1)",borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",background:C.gold,borderRadius:2,animation:"celebProgress 2.8s linear forwards",width:"0%"}}/>
          </div>
          <style>{`@keyframes celebProgress{from{width:0%}to{width:100%}}`}</style>
        </div>
      )}
      {/* Event Plan Form — shown after payment */}
      {showEventPlan&&pending&&(
        <div style={{position:"fixed",inset:0,zIndex:9200,background:"rgba(0,0,0,0.85)",overflowY:"auto",backdropFilter:"blur(6px)"}}>
          <div style={{maxWidth:560,margin:"40px auto",padding:"0 16px 60px"}}>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>{setShowEventPlan(false);setChat({...pending,depositPaid:true,status:"confirmed",chatUnlocked:true});}}
                style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#EDE4CE",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontFamily:"inherit",fontSize:13}}>
                Skip for now →
              </button>
            </div>
            <EventPlanForm
              bookingId={pending.id}
              customerName={pending.customerName||pending.name||""}
              eventType={pending.event||pending.eventType||""}
              eventDate={pending.date||""}
              onSubmitted={()=>{
                setShowEventPlan(false);
                setChat({...pending,depositPaid:true,status:"confirmed",chatUnlocked:true});
              }}
            />
          </div>
        </div>
      )}
      {chat&&<Chat booking={chat} artist={artist} myRole="customer" onClose={()=>setChat(null)} onSend={()=>{}}/>}
    </div>
  );
}

// ── Admin Dashboard ────────────────────────────────────────────────────


// ── Cancellation Policies ─────────────────────────────────────────────────────
const POLICIES = [
  {id:"flexible",  label:"Flexible",   desc:"Full refund up to 48h before event"},
  {id:"moderate",  label:"Moderate",   desc:"Full refund 7 days before · 50% after"},
  {id:"strict",    label:"Strict",     desc:"50% refund up to 14 days · No refund after"},
  {id:"superstrict",label:"Super Strict",desc:"No refund after booking confirmed"},
];

// ── European diaspora markets — ALL prices in EUR ────────────────────────────
const MARKETS = [
  {code:"NO",name:"Norway",         flag:"🇳🇴",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"SE",name:"Sweden",         flag:"🇸🇪",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"DK",name:"Denmark",        flag:"🇩🇰",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"DE",name:"Germany",        flag:"🇩🇪",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"AT",name:"Austria",        flag:"🇦🇹",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"CH",name:"Switzerland",    flag:"🇨🇭",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"GB",name:"United Kingdom", flag:"🇬🇧",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"NL",name:"Netherlands",    flag:"🇳🇱",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"BE",name:"Belgium",        flag:"🇧🇪",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"FR",name:"France",         flag:"🇫🇷",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"IT",name:"Italy",          flag:"🇮🇹",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"ES",name:"Spain",          flag:"🇪🇸",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"FI",name:"Finland",        flag:"🇫🇮",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"PL",name:"Poland",         flag:"🇵🇱",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"CZ",name:"Czech Republic", flag:"🇨🇿",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"GR",name:"Greece",         flag:"🇬🇷",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"PT",name:"Portugal",       flag:"🇵🇹",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"IE",name:"Ireland",        flag:"🇮🇪",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"HU",name:"Hungary",        flag:"🇭🇺",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"RO",name:"Romania",        flag:"🇷🇴",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"HR",name:"Croatia",        flag:"🇭🇷",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"SK",name:"Slovakia",       flag:"🇸🇰",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"SI",name:"Slovenia",       flag:"🇸🇮",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"LU",name:"Luxembourg",     flag:"🇱🇺",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"IS",name:"Iceland",        flag:"🇮🇸",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"US",name:"United States",  flag:"🇺🇸",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"CA",name:"Canada",         flag:"🇨🇦",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"AE",name:"UAE",            flag:"🇦🇪",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"AU",name:"Australia",      flag:"🇦🇺",currency:"EUR",symbol:"€",depositMultiplier:1.0},
  {code:"OTHER",name:"Other",       flag:"", currency:"EUR",symbol:"€",depositMultiplier:1.0},
];

// ── Admin emails ──────────────────────────────────────────────────────────────
const ADMIN_EMAILS = ["admin@awaz.com"];

// ── Song priority tiers ───────────────────────────────────────────────────────
const PRIORITY_TIERS = [
  {amount:0,  label:"Free",          desc:"1st song — free tonight!", color:"#22C55E", icon:""},
  {amount:10, label:"€10",           desc:"2nd song",                 color:"#C8A84A", icon:""},
  {amount:20, label:"€20",           desc:"3rd song+",                color:"#F59E0B", icon:""},
];

// ── Progressive song pricing ──────────────────────────────────────────────────
const SONG_PRICING = [
  {requestNum:1, base:0,  label:"1st Song",  desc:"Your first request tonight is on us!", color:"#22C55E", icon:""},
  {requestNum:2, base:10, label:"2nd Song",  desc:"Second request — €10",                color:"#C8A84A", icon:""},
  {requestNum:3, base:20, label:"3rd Song+", desc:"Third song and beyond — €20",         color:"#F59E0B", icon:""},
];

// ── Notification System ──────────────────────────────────────────────────────
// Queue-based: shows one at a time, 2s display, slide in/out, plays sound
const NotifContext = React.createContext({show:(_msg:string,_type?:string)=>{}});

// ── Notification sound (Web Audio API — no external files needed) ─────────────
function playNotifSound(type:string){
  try{
    const ctx=new (window.AudioContext||(window as any).webkitAudioContext)();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    // Different tones per type
    const freq=type==="error"?320:type==="success"||type==="booking"?880:type==="message"?660:740;
    osc.frequency.setValueAtTime(freq,ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq*1.3,ctx.currentTime+0.08);
    gain.gain.setValueAtTime(0.18,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime+0.35);
    // Second tone for booking/success — makes it feel rewarding
    if(type==="booking"||type==="success"){
      const osc2=ctx.createOscillator();
      const gain2=ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.setValueAtTime(freq*1.3,ctx.currentTime+0.1);
      osc2.frequency.exponentialRampToValueAtTime(freq*1.6,ctx.currentTime+0.22);
      gain2.gain.setValueAtTime(0.12,ctx.currentTime+0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4);
      osc2.start(ctx.currentTime+0.1);
      osc2.stop(ctx.currentTime+0.4);
    }
  }catch{}
}

function NotificationProvider({children}:{children:any}){
  // queue = all pending notifications
  const [queue,setQueue]=React.useState<{id:number;msg:string;type:string}[]>([]);
  // current = the one being shown right now (null = nothing showing)
  const [current,setCurrent]=React.useState<{id:number;msg:string;type:string}|null>(null);
  // exiting = triggers slide-out animation before removal
  const [exiting,setExiting]=React.useState(false);
  const timerRef=React.useRef<any>(null);

  // ── Show next from queue when current is cleared ──────────────────
  React.useEffect(()=>{
    if(current||queue.length===0) return;
    const next=queue[0];
    setCurrent(next);
    setExiting(false);
    setQueue(p=>p.slice(1));
    playNotifSound(next.type);
    // After 2s start exit animation (300ms), then clear
    timerRef.current=setTimeout(()=>{
      setExiting(true);
      setTimeout(()=>{ setCurrent(null); setExiting(false); },300);
    },2000);
  },[current,queue]);

  React.useEffect(()=>()=>{ if(timerRef.current) clearTimeout(timerRef.current); },[]);

  const show=(msg:string,type="info")=>{
    const id=Date.now()+Math.random();
    setQueue(p=>[...p,{id,msg,type}]);
  };

  const dismiss=()=>{
    clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(()=>{ setCurrent(null); setExiting(false); },300);
  };

  const colors:any={
    booking:"#22C55E",message:"#C8A84A",inquiry:"#818CF8",
    approval:"#22C55E",error:"#EF4444",info:"#C8A84A",success:"#22C55E",
  };
  const icons:any={
    booking:"",message:"",inquiry:"",
    approval:"✓",error:"⚠",info:"●",success:"✓",
  };

  const queueCount=queue.length;

  return(
    <NotifContext.Provider value={{show}}>
      {children}
      {current&&(
        <div style={{
          position:"fixed",top:16,right:16,zIndex:9999,pointerEvents:"none",
          maxWidth:"calc(100vw - 32px)",
        }}>
          <div
            onClick={dismiss}
            style={{
              background:"#1A1728",
              border:`1px solid ${colors[current.type]||"#C8A84A"}66`,
              borderLeft:`4px solid ${colors[current.type]||"#C8A84A"}`,
              borderRadius:12,padding:"12px 18px",
              display:"flex",alignItems:"center",gap:10,
              boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
              animation:exiting?"notifExit 0.3s ease forwards":"notifSlide 0.35s ease",
              minWidth:260,maxWidth:360,pointerEvents:"all",cursor:"pointer",
              position:"relative",
            }}>
            <span style={{fontSize:16,flexShrink:0,color:colors[current.type]||"#C8A84A",fontWeight:800}}>
              {icons[current.type]||"●"}
            </span>
            <span style={{color:"#EDE4CE",fontSize:13,fontWeight:600,lineHeight:1.4,flex:1}}>{current.msg}</span>
            {queueCount>0&&(
              <span style={{
                background:colors[current.type]||"#C8A84A",color:"#07060B",
                borderRadius:10,fontSize:10,fontWeight:800,padding:"1px 7px",flexShrink:0,
              }}>
                +{queueCount}
              </span>
            )}
          </div>
        </div>
      )}
    </NotifContext.Provider>
  );
}

function useNotif(){ return React.useContext(NotifContext); }


// ── Input sanitizer — strip XSS vectors ─────────────────────────────────────
const sanitize=(s:string)=>s.replace(/<[^>]*>/g,"").replace(/javascript:/gi,"").replace(/on\w+=/gi,"").trim();

// ── Rate limiter — simple in-memory (resets on reload) ───────────────────────
const _rateLimits:Record<string,{count:number;reset:number}> = {};
function checkRateLimit(key:string, max=5, windowMs=60000):boolean {
  const now=Date.now();
  if(!_rateLimits[key] || now > _rateLimits[key].reset) {
    _rateLimits[key]={count:1, reset:now+windowMs};
    return true;
  }
  if(_rateLimits[key].count >= max) return false;
  _rateLimits[key].count++;
  return true;
}

// ── Cookie Consent Banner ─────────────────────────────────────────────────────
function CookieBanner({onAccept,onDecline}:{onAccept:()=>void;onDecline:()=>void}){
  return(
    <div style={{
      position:"fixed",bottom:0,left:0,right:0,zIndex:10000,
      background:"rgba(13,11,21,0.98)",
      borderTop:"1px solid rgba(200,168,74,0.2)",
      backdropFilter:"blur(20px)",
      padding:"16px 20px",
      paddingBottom:"calc(16px + env(safe-area-inset-bottom,0px))",
      animation:"notifSlide 0.4s ease",
    }}>
      <div style={{maxWidth:900,margin:"0 auto",display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontWeight:700,color:"#EDE4CE",fontSize:13,marginBottom:4}}>Cookies</div>
          <div style={{color:"#8A7D68",fontSize:12,lineHeight:1.6}}>
            Awaz uses essential cookies for authentication and session management. We do not use advertising or tracking cookies.
            {" "}<button onClick={()=>{}} style={{color:"#C8A84A",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,textDecoration:"underline",padding:0}}>Privacy Policy</button>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          <button onClick={onDecline} style={{background:"transparent",color:"#8A7D68",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            Essential only
          </button>
          <button onClick={onAccept} style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:8,padding:"8px 20px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Privacy Policy / Terms page ───────────────────────────────────────────────
function PrivacyPage({onClose}:{onClose:()=>void}){
  const [tab,setTab]=useState<"privacy"|"terms">("privacy");
  return(
    <div style={{position:"fixed",inset:0,zIndex:2000,background:"#070608",overflow:"auto"}}>
      <div style={{maxWidth:780,margin:"0 auto",padding:"32px 24px 80px"}}>
        <button onClick={onClose} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:"#8A7D68",cursor:"pointer",padding:"8px 16px",fontSize:13,fontFamily:"inherit",marginBottom:24}}>← Back</button>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"2.2rem",fontWeight:700,color:"#EDE4CE",marginBottom:8}}>Legal</div>
        <div style={{display:"flex",gap:8,marginBottom:32}}>
          {(["privacy","terms"] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{background:tab===t?C.goldS:"transparent",color:tab===t?C.gold:C.muted,border:`1px solid ${tab===t?C.gold+"44":C.border}`,borderRadius:8,padding:"7px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>
              {t==="privacy"?"Privacy Policy":"Terms of Service"}
            </button>
          ))}
        </div>
        {tab==="privacy"?(
          <div style={{color:"#8A7D68",fontSize:14,lineHeight:1.9}}>
            <h2 style={{color:"#EDE4CE",fontFamily:"'Cormorant Garamond',serif",fontSize:"1.4rem",marginBottom:12}}>Privacy Policy</h2>
            <p style={{marginBottom:16}}><strong style={{color:"#EDE4CE"}}>Last updated:</strong> {new Date().toLocaleDateString("en",{year:"numeric",month:"long",day:"numeric"})}</p>
            {[
              ["Who we are","Awaz (آواز) is a booking marketplace for Afghan artists based in Europe. Operated by Awaz AS, Norway."],
              ["Data we collect","Name, email address, country, event details, payment confirmation. We never store card numbers — all payments are handled by Stripe (PCI-DSS compliant)."],
              ["How we use data","To process bookings, send booking confirmations, facilitate artist-customer communication on the platform, and improve the service."],
              ["Data storage","Your data is stored securely in Supabase (EU region) and is encrypted at rest and in transit (TLS 1.3)."],
              ["Cookies","We use only essential cookies required for authentication (Supabase Auth session). No advertising or tracking cookies."],
              ["Your rights (GDPR)","You have the right to: access your data, correct inaccurate data, delete your account and data, export your data, withdraw consent. Contact us to exercise these rights."],
              ["Data retention","Account data is retained as long as your account is active. After deletion, data is removed within 30 days."],
              ["Contact","privacy@awaz.no — We respond within 72 hours."],
            ].map(([title,text])=>(
              <div key={title} style={{marginBottom:20}}>
                <div style={{fontWeight:700,color:"#EDE4CE",fontSize:14,marginBottom:6}}>{title}</div>
                <p style={{margin:0}}>{text}</p>
              </div>
            ))}
          </div>
        ):(
          <div style={{color:"#8A7D68",fontSize:14,lineHeight:1.9}}>
            <h2 style={{color:"#EDE4CE",fontFamily:"'Cormorant Garamond',serif",fontSize:"1.4rem",marginBottom:12}}>Terms of Service</h2>
            <p style={{marginBottom:16}}><strong style={{color:"#EDE4CE"}}>Last updated:</strong> {new Date().toLocaleDateString("en",{year:"numeric",month:"long",day:"numeric"})}</p>
            {[
              ["Platform role","Awaz is a marketplace that connects customers with Afghan artists. We facilitate bookings but are not a party to the performance contract between customer and artist."],
              ["Deposits","Deposits are paid via Stripe and held securely. The platform fee (12%) is deducted automatically. Artists receive 88% of each deposit."],
              ["Cancellation","Cancellation policies are set by individual artists. See each artist's profile for their specific policy."],
              ["No-show policy","Artist no-show triggers a full refund to the customer. Customer no-show forfeits the deposit per the artist's cancellation terms."],
              ["Prohibited use","The platform may not be used for fraudulent bookings, harassment, or any illegal activity. Violations result in immediate account suspension."],
              ["Intellectual property","Artist profiles, photos, and content remain the property of the respective artists."],
              ["Limitation of liability","Awaz is not liable for the quality of performances or disputes between customers and artists beyond facilitating refunds."],
              ["Governing law","These terms are governed by Norwegian law. Disputes are subject to Oslo District Court jurisdiction."],
            ].map(([title,text])=>(
              <div key={title} style={{marginBottom:20}}>
                <div style={{fontWeight:700,color:"#EDE4CE",fontSize:14,marginBottom:6}}>{title}</div>
                <p style={{margin:0}}>{text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── GDPR Data Tools (inside settings) ────────────────────────────────────────
function GDPRTools({session, onDeleteAccount}:{session:any;onDeleteAccount:()=>void}){
  const [exporting,setExporting]=useState(false);
  const [deleted,setDeleted]=useState(false);
  const exportData=async()=>{
    setExporting(true);
    const data={
      profile:{email:session.email,name:session.name,role:session.role},
      exportedAt:new Date().toISOString(),
      note:"This is all personal data Awaz holds for your account.",
    };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;
    a.download=`awaz-data-export-${Date.now()}.json`;a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };
  if(deleted) return <div style={{color:"#22C55E",fontWeight:700,padding:16}}>✓ Account deletion requested. Data will be removed within 30 days.</div>;
  return(
    <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#8A7D68",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:14}}>YOUR DATA (GDPR)</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <button onClick={exportData} disabled={exporting}
          style={{background:"rgba(200,168,74,0.07)",color:"#C8A84A",border:"1px solid rgba(200,168,74,0.2)",borderRadius:9,padding:"10px 16px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
          {exporting?"Exporting…":"⬇ Download My Data (JSON)"}
        </button>
        <button onClick={()=>{
          if(!confirm("Are you sure? This will permanently delete your account and all associated data. This cannot be undone.")) return;
          setDeleted(true);
          onDeleteAccount();
        }} style={{background:"rgba(168,44,56,0.06)",color:"#A82C38",border:"1px solid rgba(168,44,56,0.2)",borderRadius:9,padding:"10px 16px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
          Delete My Account & Data
        </button>
      </div>
      <div style={{color:"#4A4054",fontSize:11,marginTop:10,lineHeight:1.6}}>
        Awaz complies with GDPR. Your data is stored in EU (Supabase Frankfurt). Deletion requests are processed within 30 days.
      </div>
    </div>
  );
}

// ── Global SectionHeader ────────────────────────────────────────────────────
function SectionHeader({title,action=null,subtitle=null}:{title:any;action?:any;subtitle?:any}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
      <div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.35rem",fontWeight:700,color:"var(--awaz-text,#EDE4CE)"}}>{title}</div>
        {subtitle&&<div style={{color:"var(--awaz-muted,#8A7D68)",fontSize:"0.8rem",marginTop:2}}>{subtitle}</div>}
      </div>
      {action&&<div>{action}</div>}
    </div>
  );
}

// ── Browser Push Notification helper ─────────────────────────────────────────
async function requestPushPermission(){
  if(!("Notification" in window)) return false;
  if(Notification.permission==="granted") return true;
  if(Notification.permission==="denied") return false;
  const p=await Notification.requestPermission();
  return p==="granted";
}
function sendBrowserNotif(title:string,body:string,icon="/favicon.ico"){
  if(Notification.permission!=="granted") return;
  const n=new Notification(title,{body,icon,badge:"/favicon.ico"});
  setTimeout(()=>n.close(),5000);
}


// ── Stripe Platform ID Banner (admin Finance tab) ────────────────────
function StripePlatformBanner({ notify }: { notify: (msg:string, type?:string)=>void }) {
  const [platformId, setPlatformId] = useState<string>(()=>{
    try{ return localStorage.getItem("awaz-stripe-platform-id")||""; }catch{ return ""; }
  });
  const [input, setInput] = useState(()=>{
    try{ return localStorage.getItem("awaz-stripe-platform-id")||""; }catch{ return ""; }
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const save = async () => {
    const val = input.trim();
    if(val && !val.startsWith("acct_")){
      notify("Platform ID must start with acct_","error"); return;
    }
    setSaving(true);
    try{
      // 1. Save locally first
      if(val) localStorage.setItem("awaz-stripe-platform-id", val);
      else localStorage.removeItem("awaz-stripe-platform-id");
      setPlatformId(val);

      // 2. Save to Supabase (non-blocking — don't crash if table missing)
      if(HAS_SUPA && val){
        try{
          const sb = await getSupabase();
          if(sb) await sb.from("platform_settings").upsert(
            [{ key:"stripe_platform_id", value:val, updated_at:new Date().toISOString() }],
            { onConflict:"key" }
          );
        }catch{ /* table may not exist yet — localStorage is the fallback */ }
      }

      setSaved(true);
      notify(val ? "Stripe Platform ID saved! Payments will now use this account." : "Platform ID cleared","success");
      setTimeout(()=>setSaved(false), 4000);
    }catch(e:any){
      notify("Error saving: "+e.message,"error");
    } finally {
      setSaving(false);
    }
  };

  return(
    <div style={{background:"linear-gradient(135deg,rgba(99,91,255,0.12),rgba(99,91,255,0.06))",border:"1px solid rgba(99,91,255,0.3)",borderRadius:14,padding:"20px 22px",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
        
        <div style={{flex:1,minWidth:220}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:4,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            Connect Awaz to Stripe
            {platformId&&<span style={{background:"rgba(99,91,255,0.15)",color:"#635BFF",border:"1px solid rgba(99,91,255,0.4)",borderRadius:6,padding:"2px 10px",fontSize:T.xs,fontWeight:700}}>✓ CONFIGURED</span>}
          </div>
          <div style={{color:C.textD,fontSize:T.sm,lineHeight:1.7,marginBottom:12}}>
            To receive the 12% platform fee automatically, paste your Stripe Platform ID below.<br/>
            <strong style={{color:C.text}}>Steps:</strong> Go to{" "}
            <a href="https://dashboard.stripe.com" target="_blank" style={{color:"#635BFF",textDecoration:"none"}}>dashboard.stripe.com</a>
            {" → Settings → Connect → Enable Stripe Connect → copy your "}
            <strong style={{color:C.text}}>Platform ID</strong>
            {" (starts with "}<code style={{background:C.surface,padding:"1px 6px",borderRadius:4,color:C.text,fontSize:12}}>acct_</code>{")"}
          </div>

          {/* Input field */}
          <div style={{background:"rgba(99,91,255,0.06)",border:"1px solid rgba(99,91,255,0.25)",borderRadius:10,padding:"14px 16px",marginBottom:12}}>
            <div style={{fontSize:T.xs,fontWeight:700,color:"#635BFF",letterSpacing:"0.6px",textTransform:"uppercase",marginBottom:8}}>
              Your Stripe Platform ID
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <input
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter") save(); }}
                placeholder="acct_1AbCdEfGhIjKlMnO"
                style={{
                  flex:1, minWidth:200,
                  background:C.card,
                  border:`1px solid ${input&&!input.startsWith("acct_")?C.ruby:"rgba(99,91,255,0.3)"}`,
                  borderRadius:8, padding:"10px 14px", color:C.text, fontSize:T.sm,
                  outline:"none", fontFamily:"'DM Mono',monospace,sans-serif", letterSpacing:"0.3px"
                }}
              />
              <button onClick={save} disabled={saving}
                style={{background:saved?"#1A7850":"#635BFF",color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",fontWeight:700,fontSize:T.sm,cursor:saving?"wait":"pointer",fontFamily:"inherit",minWidth:90,transition:"background 0.2s",whiteSpace:"nowrap"}}>
                {saving?"Saving…":saved?"✓ Saved!":"Save ID"}
              </button>
            </div>
            {input&&!input.startsWith("acct_")&&(
              <div style={{color:C.ruby,fontSize:T.xs,marginTop:6}}>⚠ Must start with <code style={{fontFamily:"monospace"}}>acct_</code></div>
            )}
            {platformId&&(
              <div style={{color:"#635BFF",fontSize:T.xs,marginTop:8,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span>✓ Active:</span>
                <code style={{background:C.surface,padding:"2px 8px",borderRadius:4,color:C.text,fontSize:11}}>{platformId}</code>
                <button onClick={()=>{setInput("");setPlatformId("");localStorage.removeItem("awaz-stripe-platform-id");notify("Platform ID cleared","success");}}
                  style={{background:"none",border:"none",color:C.ruby,cursor:"pointer",fontSize:11,padding:0,fontFamily:"inherit",textDecoration:"underline"}}>
                  Clear
                </button>
              </div>
            )}
          </div>

          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <a href="https://dashboard.stripe.com/connect/accounts/overview" target="_blank"
              style={{background:"#635BFF",color:"#fff",borderRadius:8,padding:"9px 18px",fontWeight:700,fontSize:T.sm,textDecoration:"none",display:"inline-block"}}>
              Open Stripe Dashboard →
            </a>
            <a href="https://stripe.com/docs/connect/collect-then-transfer-guide" target="_blank"
              style={{background:C.surface,color:C.muted,borderRadius:8,padding:"9px 18px",fontWeight:600,fontSize:T.sm,textDecoration:"none",border:`1px solid ${C.border}`,display:"inline-block"}}>
              Setup Guide
            </a>
          </div>
        </div>
        <div style={{background:"rgba(99,91,255,0.08)",border:"1px solid rgba(99,91,255,0.2)",borderRadius:10,padding:"12px 16px",minWidth:150,flexShrink:0}}>
          <div style={{color:"#635BFF",fontSize:T.xs,fontWeight:700,marginBottom:6}}>YOUR TAKE</div>
          <div style={{color:C.text,fontWeight:800,fontSize:T.xl}}>12%</div>
          <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>of every deposit</div>
          <div style={{color:"#635BFF",fontSize:T.xs,marginTop:6,fontWeight:600}}>via Stripe Connect</div>
        </div>
      </div>
    </div>
  );
}

function AdminDash({ artists, setArtists, bookings, setBookings, users, inquiries, bookingRequests=[], setBookingRequests, onAction, onLogout, onMsg, onUpdateInquiry, theme, onToggleTheme }) {
  // Sync module-level _theme so C proxy uses correct palette on every render
  if(theme) _theme = theme;
  const vp=useViewport();
  const {show:notify}=useNotif();
  const [tab,setTab]=useState("overview");
  const [selInq,setSelInq]=useState(null);
  const [replyText,setReplyText]=useState("");
  const [replySent,setReplySent]=useState(false);
  const [sendingReply,setSendingReply]=useState(false);

  const [chat,setChat]=useState(null);
  const [adminChatArtist,setAdminChatArtist]=useState(null);
  const [reviewArtist,setReviewArtist]=useState<any>(null);
  const [adminChatMsg,setAdminChatMsg]=useState("");
  const [adminChats,setAdminChats]=useState({});
  const [artistFilter,setArtistFilter]=useState("all"); // all|pending|approved|suspended
  const [searchQ,setSearchQ]=useState("");

  const [adminChatImage,setAdminChatImage]=useState<string|null>(null);

  const sendAdminChat=async(imageUrl?:string)=>{
    const text=adminChatMsg.trim();
    const img=imageUrl||adminChatImage;
    if(!adminChatArtist||((!text)&&!img)) return;
    const localMsg={from:"admin",text:text||(img?"[Image]":""),image:img||null,
      time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})};
    setAdminChats(p=>({...p,[adminChatArtist.id]:[...(p[adminChatArtist.id]||[]),localMsg]}));
    setAdminChatMsg("");
    setAdminChatImage(null);
    // ── Email the artist ──────────────────────────────────────────────
    if(text&&adminChatArtist.email){
      sendEmailNotification({
        type:"new_message",
        toEmail:adminChatArtist.email,
        toName:adminChatArtist.name,
        fromName:"Awaz Admin",
        message:text,
        artistName:adminChatArtist.name,
      });
    }
    // ─────────────────────────────────────────────────────────────────
    if(!HAS_SUPA) return;
    try{
      const sb=await getSupabase();
      if(!sb) return;
      const{error}=await sb.from("chat_messages").insert({
        artist_id:adminChatArtist.id,from_role:"admin",
        text:text||(img?"[Image]":""),image_url:img||null,
      });
      if(error) console.error("Chat save error:",error.message);
    }catch(e){console.error("Chat exception:",e);}
  };

  const handleAdminChatImg=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async(ev)=>{
      const b64=ev.target?.result as string;
      if(HAS_SUPA){
        try{
          const sb=await getSupabase();
          if(sb){
            const path=`chat/${Date.now()}_${file.name.replace(/\W/g,"_")}`;
            const{data,error}=await sb.storage.from("chat-images").upload(path,file,{contentType:file.type,upsert:true});
            if(!error&&data){
              const{data:u}=sb.storage.from("chat-images").getPublicUrl(path);
              if(u?.publicUrl){sendAdminChat(u.publicUrl);return;}
            }
          }
        }catch{}
      }
      sendAdminChat(b64);
    };
    reader.readAsDataURL(file);
    e.target.value="";
  };

  // Stats
  const totalRevenue   = bookings.filter(b=>b.depositPaid).reduce((s,b)=>s+b.deposit,0);
  const awazRevenue    = Math.round(totalRevenue*0.12);
  const confirmedBooks = bookings.filter(b=>b.status==="confirmed").length;
  const pendingBooks   = bookings.filter(b=>b.status==="pending_payment"||b.status==="pending").length;
  // ── Hooks first (React rules) ─────────────────────────────────────────
  const [refreshing,setRefreshing]=useState(false);
  const [localArtists,setLocalArtists]=useState(null);
  // Use refreshed list if available, otherwise use prop artists
  const displayArtists=localArtists||artists;

  // Stats — computed after displayArtists is defined
  const pendingArtists = displayArtists.filter(a=>a.status==="pending").length;
  const approvedArtists= displayArtists.filter(a=>a.status==="approved").length;
  const newInquiries   = inquiries.filter(i=>i.status==="new").length;

  const refreshArtists=async()=>{
    if(!HAS_SUPA||refreshing)return;
    setRefreshing(true);
    try{
      const sb=await getSupabase();
      if(!sb){setRefreshing(false);return;}
      const{data:rows}=await sb.from("artists").select("*");
      if(rows?.length>0){
        const mapped=rows.map(a=>({
          id:a.id,name:a.name,nameDari:a.name_dari||"",
          genre:a.genre||"",location:a.location||"",
          rating:a.rating||0,reviews:a.reviews||0,
          priceInfo:a.price_info||"On request",
          deposit:a.deposit||1000,
          emoji:a.emoji||"",color:a.color||"#A82C38",
          photo:a.photo||null,bio:a.bio||"",
          tags:Array.isArray(a.tags)?a.tags:[],
          instruments:Array.isArray(a.instruments)?a.instruments:[],
          superhost:a.superhost||false,
          status:a.status||"pending",joined:a.joined_date||"",isBoosted:a.is_boosted||false,
          available:a.available||{},blocked:a.blocked||{},
          earnings:a.earnings||0,totalBookings:a.total_bookings||0,
          verified:a.verified||false,
          isHidden:a.is_hidden||false,
            stripeConnected:a.stripe_connected||false,
          stripeAccount:a.stripe_account||null,
          cancellationPolicy:a.cancellation_policy||"moderate",
          spotify:a.spotify_data||null,instagram:a.instagram_data||null,
          youtube:a.youtube_data||null,tiktok:a.tiktok_data||null,
          countryPricing:a.country_pricing||[],currency:a.currency||"EUR",
        }));
        setLocalArtists(mapped);
      }
    }catch(e){console.warn("Refresh failed:",e);}
    setRefreshing(false);
  };

  const navItems=[
    {id:"overview",    label:"Overview"},
    {id:"artists",     label:"Artists",  badge:pendingArtists},
    {id:"bookings",    label:"Bookings"},
    {id:"eventplans",  label:"Event Plans"},
    {id:"inquiries",   label:"Inquiries", badge:newInquiries},
    {id:"messages",    label:"Messages"},
    {id:"chat",        label:"Chat"},
    {id:"finance",     label:"Finance"},
  ];

  // Filtered artists — uses refreshed list if available
  const filteredArtists = displayArtists.filter(a=>{
    const matchFilter = artistFilter==="all" || a.status===artistFilter;
    const matchSearch = !searchQ || a.name.toLowerCase().includes(searchQ.toLowerCase()) || a.genre.toLowerCase().includes(searchQ.toLowerCase());
    return matchFilter && matchSearch;
  });

  // Stat card component
  const StatCard=({icon,label,value,sub,color=C.gold,onClick})=>(
    <div onClick={onClick} style={{
      background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
      padding:"18px 20px",cursor:onClick?"pointer":"default",
      transition:"border-color 0.15s",
      borderTop:`3px solid ${color}`,
      display:"flex",flexDirection:"column",gap:4,
    }}>
      <div style={{fontSize:22}}>{icon}</div>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:800,color:C.text,lineHeight:1.1}}>{value}</div>
      <div style={{fontSize:T.xs,fontWeight:700,color:C.text,letterSpacing:"0.3px"}}>{label}</div>
      {sub&&<div style={{fontSize:T.xs,color:C.muted}}>{sub}</div>}
    </div>
  );

  // Section header
  // SectionHeader is now global (defined above)


  // Artist row
  const ArtistRow=({a})=>{
    const sc=a.status==="approved"?C.emerald:a.status==="pending"?C.saffron:C.ruby;
    const bookCount=bookings.filter(b=>b.artistId===a.id).length;
    const earnings=bookings.filter(b=>b.artistId===a.id&&b.depositPaid).reduce((s,b)=>s+b.deposit,0);
    return(
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:10}}>
        <div style={{height:2,background:`linear-gradient(90deg,${a.color},${C.gold}44)`}}/>
        <div style={{padding:"14px 16px"}}>
          <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
            <div style={{width:48,height:48,borderRadius:10,background:C.goldS,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0,overflow:"hidden"}}>
              {a.photo?<img src={a.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:a.emoji}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:3}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,fontWeight:700,color:C.text}}>{a.name}</div>
                {a.nameDari&&<div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:T.xs,color:C.muted}}>{a.nameDari}</div>}
              </div>
              <div style={{color:C.muted,fontSize:T.xs,marginBottom:4}}>{a.genre} · {a.location}</div>
              {/* Email + Phone — visible to admin */}
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:6}}>
                {a.email&&<a href={`mailto:${a.email}`} style={{color:C.lapis,fontSize:10,textDecoration:"none",display:"flex",alignItems:"center",gap:3}}>✉ {a.email}</a>}
                {a.phone&&<a href={`tel:${a.phone}`} style={{color:C.emerald,fontSize:10,textDecoration:"none",display:"flex",alignItems:"center",gap:3}}>📞 {a.phone}</a>}
                {!a.email&&!a.phone&&<span style={{color:C.faint,fontSize:10}}>No contact info</span>}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                <span style={{background:`${sc}18`,color:sc,border:`1px solid ${sc}44`,borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>{a.status.toUpperCase()}</span>
                {a.verified&&<span style={{background:`${C.emerald}18`,color:C.emerald,border:`1px solid ${C.emerald}44`,borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>✓ VERIFIED</span>}
                {a.isBoosted&&<span style={{background:`linear-gradient(135deg,${C.gold}22,${C.saffron}22)`,color:C.gold,border:`1px solid ${C.gold}44`,borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>⭐ BOOSTED</span>}
                {a.stripeConnected&&<span style={{background:`${C.lapis}18`,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>💳 STRIPE</span>}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2,flexShrink:0}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.gold,fontSize:T.md}}>€{earnings.toLocaleString()}</div>
              <div style={{color:C.muted,fontSize:T.xs}}>{bookCount} bookings</div>
            </div>
          </div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",borderTop:`1px solid ${C.border}`,paddingTop:10}}>
            {/* ── Review button — always visible ── */}
            <button onClick={()=>setReviewArtist(a)}
              style={{background:C.goldS,color:C.gold,border:`1px solid ${C.gold}44`,borderRadius:7,padding:"6px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              🔍 Review Profile
            </button>

            {a.status==="pending"&&(
              <>
                <button onClick={()=>onAction(a.id,"approved")} style={{background:C.emerald,color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓ Approve</button>
                <button onClick={()=>onAction(a.id,"rejected")} style={{background:C.rubyS,color:C.ruby,border:`1px solid ${C.ruby}44`,borderRadius:7,padding:"6px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✗ Reject</button>
              </>
            )}
            {a.status==="approved"&&(
              <>
                <button onClick={()=>{
                  // Unpublish: set status back to pending so artist must fix & resubmit
                  setReviewArtist({...a,_unpublishMode:true});
                }} style={{background:C.rubyS,color:C.ruby,border:`1px solid ${C.ruby}44`,borderRadius:7,padding:"6px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  ↩ Unpublish
                </button>
              </>
            )}
            {a.status==="suspended"&&(
              <button onClick={()=>onAction(a.id,"approved")} style={{background:C.emeraldS,color:C.emerald,border:`1px solid ${C.emerald}44`,borderRadius:7,padding:"6px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Reinstate</button>
            )}
            {!a.verified&&(
              <button onClick={()=>onAction(a.id,"verify")} style={{background:C.lapisS,color:C.text,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✦ Verify</button>
            )}
            <button onClick={async()=>{
              const newBoosted = !a.isBoosted;
              const boostUntil = newBoosted ? new Date(Date.now()+180*24*60*60*1000).toISOString() : null;
              setArtists(p=>p.map(x=>x.id===a.id?{...x,isBoosted:newBoosted,boostedUntil:boostUntil}:x));
              if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("artists").update({is_boosted:newBoosted,boosted_until:boostUntil}).eq("id",a.id);}
              notify(newBoosted?`${a.name} is now featured!`:`Boost removed from ${a.name}`,"success");
            }}
              style={{background:a.isBoosted?`linear-gradient(135deg,${C.gold},${C.saffron})`:C.surface,color:a.isBoosted?C.bg:C.gold,border:`1px solid ${C.gold}44`,borderRadius:7,padding:"6px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              {a.isBoosted?"Boosted":"Boost"}
            </button>
            <button onClick={()=>{setAdminChatArtist(a);setTab("chat");}} style={{background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>💬 Message</button>
            <button onClick={async()=>{
              if(!confirm(`Delete "${a.name}" permanently? This cannot be undone.`)) return;
              setArtists(p=>p.filter(x=>x.id!==a.id));
              if(HAS_SUPA){
                const {ok,errors} = await deleteArtistFromDB(a.id);
                if(!ok){
                  setArtists(p=>[a,...p]);
                  notify("Delete failed — run RLS SQL in Supabase (see console)","error");
                  console.error("Delete errors:",errors);
                } else {
                  notify("Artist deleted","success");
                }
              }
            }} style={{background:"rgba(168,44,56,0.08)",color:C.ruby,border:`1px solid ${C.ruby}33`,borderRadius:7,padding:"6px 10px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit",lineHeight:1}}>Del</button>
          </div>
        </div>
      </div>
    );
  };

  const pageContent=(
    <div style={{maxWidth:1000,padding:vp.isMobile?"16px":"24px 32px"}}>

      {/* ── OVERVIEW ── */}
      {tab==="overview"&&(
        <div>
          <SectionHeader title="Platform Overview"/>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${vp.isMobile?2:3},1fr)`,gap:10,marginBottom:24}}>
            <StatCard icon="" label="Total Deposits"     value={`€${totalRevenue.toLocaleString()}`} sub="Stripe collected"   color={C.gold}/>
            <StatCard icon="" label="Awaz Revenue (12%)" value={`€${awazRevenue.toLocaleString()}`}  sub="Platform cut"       color={C.emerald}/>
            <StatCard icon="" label="Confirmed Bookings" value={confirmedBooks}                       sub="This month"         color={C.lapis}/>
            <StatCard icon="" label="Pending Bookings"   value={pendingBooks}                         sub="Awaiting action"    color={C.saffron} onClick={()=>setTab("bookings")}/>
            <StatCard icon="" label="Active Artists"     value={approvedArtists}                      sub={`${pendingArtists} pending review`} color={C.ruby} onClick={()=>setTab("artists")}/>
            <StatCard icon="" label="New Inquiries"      value={newInquiries}                         sub="Unread"             color={C.lavender} onClick={()=>setTab("inquiries")}/>
            <StatCard icon="📩" label="Bookingforespørsler" value={bookingRequests.filter((r:any)=>r.status==="request_received"||r.status==="pending").length} sub="Venter på svar" color={C.lapis} onClick={()=>setTab("bookingreqs")}/>
          </div>

          {/* Quick Links */}
          <div style={{marginBottom:20}}>
            <SectionHeader title="Quick Links"/>
            <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10}}>
              {[
                {icon:"📩",label:"Forespørsler",desc:`${bookingRequests.length} totalt`,color:C.lapis,onClick:()=>setTab("bookingreqs")},
                {icon:"📋",label:"Event Plans",desc:"View all submitted event plans",color:C.lapis,onClick:()=>setTab("eventplans")},
                {icon:"💬",label:"Artist Chat",desc:"Message artists directly",color:C.emerald,onClick:()=>setTab("chat")},
                {icon:"📊",label:"Finance",desc:"Revenue & payouts",color:C.gold,onClick:()=>setTab("finance")},
              ].map(({icon,label,desc,color,onClick})=>(
                <div key={label} onClick={onClick} style={{background:C.card,border:`1px solid ${color}33`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"border-color 0.15s",display:"flex",gap:12,alignItems:"center"}}
                  onMouseEnter={e=>(e.currentTarget.style.borderColor=color+"88")}
                  onMouseLeave={e=>(e.currentTarget.style.borderColor=color+"33")}>
                  <span style={{fontSize:22,flexShrink:0}}>{icon}</span>
                  <div>
                    <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{label}</div>
                    <div style={{color:C.muted,fontSize:11,marginTop:1}}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action alerts */}
          {(pendingArtists>0||newInquiries>0)&&(
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
              {pendingArtists>0&&(
                <div onClick={()=>setTab("artists")} style={{background:`${C.saffron}10`,border:`1px solid ${C.saffron}44`,borderRadius:10,padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                  
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:C.saffron,fontSize:T.sm}}>{pendingArtists} artist{pendingArtists>1?"s":""} awaiting review</div>
                    <div style={{color:C.muted,fontSize:T.xs}}>Approve or reject to activate their profile →</div>
                  </div>
                  <span style={{fontSize:T.xs,color:C.saffron,fontWeight:700}}>→</span>
                </div>
              )}
              {newInquiries>0&&(
                <div onClick={()=>setTab("inquiries")} style={{background:`${C.lavender}10`,border:`1px solid ${C.lavender}44`,borderRadius:10,padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                  
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:C.lavender,fontSize:T.sm}}>{newInquiries} new inquiry{newInquiries>1?"ies":""}</div>
                    <div style={{color:C.muted,fontSize:T.xs}}>Private booking inquiries waiting for your reply →</div>
                  </div>
                  <span style={{fontSize:T.xs,color:C.lavender,fontWeight:700}}>→</span>
                </div>
              )}
            </div>
          )}

          {/* Recent bookings */}
          <SectionHeader title="Recent Bookings" action={<button onClick={()=>setTab("bookings")} style={{background:"none",border:"none",color:C.gold,cursor:"pointer",fontSize:T.xs,fontWeight:700,fontFamily:"inherit"}}>View all →</button>}/>
          {bookings.length===0?(
            <div style={{textAlign:"center",padding:"32px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`,color:C.muted,fontSize:T.sm}}>No bookings yet</div>
          ):bookings.slice(0,5).map(b=>{
            const art=artists.find(a=>a.id===b.artistId);
            const sc=b.status==="confirmed"?C.emerald:b.status==="completed"?C.lapis:b.status==="pending_payment"?C.saffron:C.muted;
            return(
              <div key={b.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",display:"flex",gap:12,alignItems:"center",marginBottom:8}}>
                <div style={{width:36,height:36,borderRadius:8,background:`${art?.color||C.gold}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{art?.emoji||"🎤"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,color:C.text,fontSize:T.sm,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.customerName} → {art?.name}</div>
                  <div style={{color:C.muted,fontSize:T.xs,marginTop:1}}>{b.eventType||b.event} · {b.date}</div>
                </div>
                <span style={{background:`${sc}18`,color:sc,border:`1px solid ${sc}44`,borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0}}>{(b.status||"pending").replace(/_/g," ").toUpperCase()}</span>
                <span style={{color:C.text,fontWeight:700,fontSize:T.sm,fontFamily:"'Cormorant Garamond',serif",flexShrink:0}}>€{b.deposit}</span>
                <button onClick={()=>setChat(b)} style={{width:32,height:32,borderRadius:7,background:C.surface,border:`1px solid ${C.border}`,fontSize:14,cursor:"pointer",flexShrink:0}}></button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ARTISTS ── */}
      {tab==="artists"&&(
        <div>
          <SectionHeader title={`Artists (${filteredArtists.length})`} action={
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {pendingArtists>0&&<span style={{background:`${C.ruby}18`,color:C.ruby,border:`1px solid ${C.ruby}44`,borderRadius:6,padding:"3px 10px",fontSize:T.xs,fontWeight:700}}>{pendingArtists} pending</span>}
              <button onClick={refreshArtists} disabled={refreshing} style={{background:C.surface,color:refreshing?C.muted:C.gold,border:`1px solid ${C.border}`,borderRadius:7,padding:"5px 12px",fontSize:T.xs,fontWeight:700,cursor:refreshing?"wait":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                {refreshing?"⟳ Loading…":"⟳ Refresh"}
              </button>
            </div>
          }/>
          {/* Search + filter */}
          <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search artists…"
              style={{flex:1,minWidth:160,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit"}}/>
            {["all","pending","approved","suspended","rejected"].map(f=>(
              <button key={f} onClick={()=>setArtistFilter(f)}
                style={{background:artistFilter===f?C.gold:C.card,color:artistFilter===f?C.bg:C.muted,border:`1px solid ${artistFilter===f?C.gold:C.border}`,borderRadius:8,padding:"8px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",textTransform:"capitalize"}}>
                {f}{f!=="all"&&` (${displayArtists.filter(a=>a.status===f).length})`}
              </button>
            ))}
          </div>
          {/* Bulk cleanup actions */}
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            <button onClick={async()=>{
              const rejected=displayArtists.filter(a=>a.status==="rejected");
              if(!rejected.length){alert("No rejected artists.");return;}
              if(!confirm(`Delete ${rejected.length} rejected artist(s) permanently?`)) return;
              setArtists(p=>p.filter(a=>a.status!=="rejected"));
              if(HAS_SUPA){
                const failedIds: string[] = [];
                for(const a of rejected){
                  const {ok} = await deleteArtistFromDB(a.id);
                  if(!ok) failedIds.push(a.id);
                }
                if(failedIds.length){
                  // Restore failed ones
                  const failed=rejected.filter(a=>failedIds.includes(a.id));
                  setArtists(p=>[...failed,...p]);
                  notify(`${failedIds.length} delete(s) failed — run RLS SQL in Supabase (see console)`,"error");
                  console.info(`%cRUN THIS IN SUPABASE SQL EDITOR:\n\nCREATE POLICY "admin_delete_artists" ON artists FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));\nCREATE POLICY "admin_delete_chat_messages" ON chat_messages FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));\nCREATE POLICY "admin_delete_bookings" ON bookings FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));\nCREATE POLICY "admin_delete_reviews" ON reviews FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));\nCREATE POLICY "admin_delete_profiles" ON profiles FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));\nCREATE POLICY "admin_delete_users" ON users FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));\nCREATE POLICY "admin_delete_song_requests" ON song_requests FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));`,'color:orange;font-weight:bold','');
                } else {
                  notify(`${rejected.length} rejected artist(s) deleted`,"success");
                }
              }
            }} style={{background:"rgba(168,44,56,0.07)",color:C.ruby,border:`1px solid ${C.ruby}22`,borderRadius:8,padding:"6px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              Remove all rejected ({displayArtists.filter(a=>a.status==="rejected").length})
            </button>
            <button onClick={async()=>{
              const pending=displayArtists.filter(a=>a.status==="pending");
              if(!pending.length){alert("No pending artists.");return;}
              if(!confirm(`Approve all ${pending.length} pending artist(s)?`)) return;
              setArtists(p=>p.map(a=>a.status==="pending"?{...a,status:"approved"}:a));
              if(HAS_SUPA){const sb=await getSupabase();if(sb)for(const a of pending){
                await sb.from("artists").update({status:"approved"}).eq("id",a.id);
                await sb.from("users").update({role:"artist",is_approved:true}).eq("id",a.id);
              }}
            }} style={{background:"rgba(34,197,94,0.07)",color:C.emerald,border:`1px solid ${C.emerald}22`,borderRadius:8,padding:"6px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              ✓ Approve all pending ({displayArtists.filter(a=>a.status==="pending").length})
            </button>
          </div>
          {filteredArtists.length===0?(
            <div style={{textAlign:"center",padding:"32px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`,color:C.muted}}>No artists match filters</div>
          ):filteredArtists.map(a=><ArtistRow key={a.id} a={a}/>)}
        </div>
      )}

      {/* ── BOOKINGS ── */}
      {tab==="bookings"&&(
        <div>
          <SectionHeader title={`All Bookings (${bookings.length})`}/>
          {bookings.length===0?(
            <div style={{textAlign:"center",padding:"40px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`,color:C.muted}}>No bookings yet</div>
          ):bookings.map(b=>{
            const art=artists.find(a=>a.id===b.artistId);
            const sc=b.status==="confirmed"?C.emerald:b.status==="completed"?C.lapis:b.status==="pending_payment"?C.saffron:C.muted;
            return(
              <div key={b.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:10}}>
                <div style={{height:2,background:`linear-gradient(90deg,${art?.color||C.gold},${C.gold}44)`}}/>
                <div style={{padding:"14px 16px"}}>
                  <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
                    <div style={{width:40,height:40,borderRadius:8,background:`${art?.color||C.gold}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{art?.emoji||"🎤"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,color:C.text,fontSize:T.sm}}>{b.customerName}</div>
                      <div style={{color:C.muted,fontSize:T.xs,fontWeight:600}}>{art?.name||"Unknown artist"}</div>
                      <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>{b.eventType||b.event||"Event"} · {b.date}</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                      <span style={{background:`${sc}18`,color:sc,border:`1px solid ${sc}44`,borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700}}>{(b.status||"pending").replace(/_/g," ").toUpperCase()}</span>
                      <span style={{color:C.text,fontWeight:700,fontFamily:"'Cormorant Garamond',serif",fontSize:T.md}}>€{b.deposit}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",borderTop:`1px solid ${C.border}`,paddingTop:10}}>
                    <span style={{color:b.depositPaid?C.emerald:C.ruby,fontSize:T.xs,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                      <span>{b.depositPaid?"✓":"✗"}</span> Deposit {b.depositPaid?"paid":"pending"}
                    </span>
                    <span style={{color:C.border}}>·</span>
                    <span style={{color:b.chatUnlocked?C.emerald:C.muted,fontSize:T.xs}}>Chat {b.chatUnlocked?"unlocked":"locked"}</span>
                    {b.depositPaid&&b.status!=="confirmed"&&!b.refunded&&(
                      <button onClick={()=>setBookings(p=>p.map(bk=>bk.id===b.id?{...bk,status:"confirmed"}:bk))}
                        style={{background:C.emeraldS,color:C.emerald,border:`1px solid ${C.emerald}44`,borderRadius:6,padding:"4px 10px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        ✓ Confirm
                      </button>
                    )}
                    {b.status==="confirmed"&&(
                      <span style={{color:C.emerald,fontSize:T.xs,fontWeight:700}}>✓ Confirmed</span>
                    )}
                    {b.depositPaid&&!b.refunded&&(
                      <button onClick={()=>{
                        if(window.confirm(`Refund €${b.deposit} deposit to ${b.customerName}?`)){
                          setBookings(p=>p.map(bk=>bk.id===b.id?{...bk,depositPaid:false,refunded:true,status:"refunded"}:bk));
                          alert(`Refund initiated. Process via Stripe dashboard for booking ${b.id}.`);
                        }
                      }} style={{background:C.rubyS,color:C.ruby,border:`1px solid ${C.ruby}44`,borderRadius:6,padding:"4px 10px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        ↩ Refund
                      </button>
                    )}
                    {b.refunded&&<span style={{color:C.ruby,fontSize:T.xs,fontWeight:700,background:C.rubyS,border:`1px solid ${C.ruby}44`,borderRadius:4,padding:"2px 8px"}}>REFUNDED</span>}
                    <button onClick={()=>setChat(b)} style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5,background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 12px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      Chat
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* ── EVENT PLANS ── */}
      {tab==="eventplans"&&(
        <div>
          <SectionHeader title="Event Plans"/>
          <div style={{background:`${C.lapis}10`,border:`1px solid ${C.lapis}33`,borderRadius:10,padding:"12px 16px",marginBottom:16,fontSize:T.xs,color:C.muted,lineHeight:1.6}}>
            📋 These are event plans submitted by customers after paying their deposit. Each plan is linked to a booking and visible to the artist in their dashboard.
          </div>
          {bookings.filter(b=>b.status==="confirmed"||b.depositPaid).length===0?(
            <div style={{textAlign:"center",padding:"40px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`,color:C.muted,fontSize:T.sm}}>
              No confirmed bookings yet — event plans appear here once customers submit them.
            </div>
          ):bookings.filter(b=>b.status==="confirmed"||b.depositPaid).map(b=>{
            const art=artists.find(a=>a.id===b.artistId);
            return(
              <div key={b.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:10}}>
                <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:10}}>
                  <div style={{width:38,height:38,borderRadius:8,background:`${art?.color||C.gold}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{art?.emoji||"🎤"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{b.customerName}</div>
                    <div style={{color:C.muted,fontSize:T.xs,marginTop:1}}>→ {art?.name} · {b.date}</div>
                  </div>
                  <span style={{background:`${C.emerald}18`,color:C.emerald,border:`1px solid ${C.emerald}33`,borderRadius:6,padding:"2px 10px",fontSize:10,fontWeight:700}}>CONFIRMED</span>
                </div>
                <EventPlanView bookingId={b.id} C={C} T={T}/>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MESSAGES ── */}
      {tab==="messages"&&(
        <div>
          <SectionHeader title={`All Conversations (${bookings.filter(b=>b.messages?.length>0&&b.status!=="admin_chat").length})`}/>
          {bookings.filter(b=>b.messages?.length>0&&b.status!=="admin_chat").length===0?(
            <div style={{textAlign:"center",padding:"40px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`,color:C.muted}}>
              No customer conversations yet
            </div>
          ):bookings.filter(b=>b.messages?.length>0&&b.status!=="admin_chat").map(b=>{
            const art=artists.find(a=>a.id===b.artistId);
            const last=b.messages[b.messages.length-1];
            return(
              <div key={b.id} onClick={()=>setChat(b)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:8,cursor:"pointer",display:"flex",gap:12,alignItems:"center"}}>
                <div style={{width:40,height:40,borderRadius:8,background:`${art?.color||C.gold}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{art?.emoji||"🎤"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,color:C.text,fontSize:T.sm}}>{b.customerName} ↔ {art?.name}</div>
                  <div style={{color:C.muted,fontSize:T.xs,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>{last?.text}</div>
                </div>
                <span style={{color:C.muted,fontSize:T.xs,flexShrink:0}}>{b.messages.length} msgs</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── DIRECT CHAT ── */}
      {tab==="inquiries"&&(
        <div>
          <SectionHeader title={`Inquiries (${inquiries.length})`}/>

          {inquiries.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
              
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,color:C.text,marginBottom:8}}>No inquiries yet</div>
              <div style={{color:C.muted,fontSize:T.sm}}>Customer inquiries will appear here once the contact widget is live on the site.</div>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr":"320px 1fr",gap:16,minHeight:520}}>

              {/* ── Inbox list ── */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"auto",maxHeight:620}}>
                {[...inquiries].sort((a,b)=>b.ts-a.ts).map(inq=>{
                  const isNew=inq.status==="new";
                  const isSel=selInq?.id===inq.id;
                  return(
                    <div key={inq.id} style={{position:"relative"}}
                      onMouseEnter={e=>{ const btn=e.currentTarget.querySelector(".del-btn") as HTMLElement; if(btn) btn.style.opacity="1"; }}
                      onMouseLeave={e=>{ const btn=e.currentTarget.querySelector(".del-btn") as HTMLElement; if(btn) btn.style.opacity="0"; }}>
                    <button className="del-btn" onClick={async e=>{
                      e.stopPropagation();
                      if(!confirm("Delete this inquiry?")) return;
                      onUpdateInquiry(inq.id,{status:"deleted"});
                      if(HAS_SUPA){
                        try{const sb=await getSupabase();if(sb)await sb.from("inquiries").delete().eq("id",inq.id);}
                        catch(e){console.warn("Delete inquiry error:",e);}
                      }
                    }} style={{position:"absolute",top:8,right:8,background:"rgba(168,44,56,0.15)",color:C.ruby,border:"none",borderRadius:6,padding:"3px 7px",fontSize:11,cursor:"pointer",fontFamily:"inherit",opacity:0,transition:"opacity 0.15s",zIndex:2}}>Del</button>
                    <div onClick={async()=>{
                      setSelInq(inq);setReplyText("");setReplySent(false);
                      if(inq.status==="new"){
                        onUpdateInquiry(inq.id,{status:"read"});
                        if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("inquiries").update({status:"read"}).eq("id",inq.id);}
                      }
                    }}
                      style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",
                        background:isSel?C.goldS:isNew?"rgba(200,168,74,0.04)":"transparent",
                        borderLeft:`3px solid ${isSel?C.gold:isNew?C.gold+"66":"transparent"}`,transition:"background 0.15s"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{inq.name}</div>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          {isNew&&<span style={{background:C.ruby,color:"#fff",borderRadius:6,fontSize:9,fontWeight:800,padding:"2px 6px"}}>NEW</span>}
                          {inq.status==="replied"&&<span style={{background:C.emeraldS,color:C.emerald,borderRadius:6,fontSize:9,fontWeight:800,padding:"2px 6px"}}>REPLIED</span>}
                          <span style={{color:C.faint,fontSize:10}}>{new Date(inq.ts).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div style={{color:C.muted,fontSize:T.xs,marginBottom:3}}>{inq.email} · {inq.country}</div>
                      <div style={{color:C.textD,fontSize:T.xs,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {inq.eventType&&<span style={{color:C.gold,fontWeight:600}}>{inq.eventType} · </span>}{inq.message}
                      </div>
                    </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Detail + Reply ── */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,display:"flex",flexDirection:"column"}}>
                {selInq?(
                  <>
                    <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text}}>{selInq.name}</div>
                        <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>{selInq.email} · {selInq.country}</div>
                      </div>
                      <span style={{background:selInq.status==="replied"?C.emeraldS:selInq.status==="new"?C.rubyS:C.surface,color:selInq.status==="replied"?C.emerald:selInq.status==="new"?C.ruby:C.muted,border:`1px solid ${selInq.status==="replied"?C.emerald+"44":selInq.status==="new"?C.ruby+"44":C.border}`,borderRadius:8,fontSize:T.xs,fontWeight:700,padding:"4px 10px",textTransform:"uppercase"}}>{selInq.status}</span>
                    </div>
                    <div style={{padding:"16px 20px",flex:1,overflow:"auto"}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                        {[["Date",selInq.date||"—"],["Event",selInq.eventType||"—"],["Budget",selInq.budget||"—"],["Country",selInq.country||"—"]].filter(([,v])=>v!=="—").map(([k,v])=>(
                          <div key={k} style={{background:C.surface,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                            <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:"0.6px",textTransform:"uppercase",marginBottom:3}}>{k}</div>
                            <div style={{color:C.text,fontSize:T.sm,fontWeight:600}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{background:C.surface,borderRadius:10,padding:"14px 16px",border:`1px solid ${C.border}`,marginBottom:16}}>
                        <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8}}>MESSAGE</div>
                        <div style={{color:C.text,fontSize:T.sm,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{selInq.message||"No message."}</div>
                      </div>
                      {selInq.reply&&(
                        <div style={{background:C.emeraldS,border:`1px solid ${C.emerald}33`,borderRadius:10,padding:"14px 16px",marginBottom:16}}>
                          <div style={{color:C.emerald,fontSize:10,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8}}>✓ YOUR REPLY</div>
                          <div style={{color:C.text,fontSize:T.sm,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{selInq.reply}</div>
                        </div>
                      )}
                      {replySent?(
                        <div style={{background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:10,padding:"14px 16px",textAlign:"center",color:C.emerald,fontWeight:700}}>✓ Reply saved!</div>
                      ):(
                        <div>
                          <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8}}>{selInq.reply?"SEND ANOTHER REPLY":"REPLY"}</div>
                          <textarea value={replyText} onChange={e=>setReplyText(e.target.value)}
                            placeholder={`Hi ${selInq.name.split(" ")[0]}, thank you for your inquiry…`}
                            rows={4} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",color:C.text,fontSize:T.sm,fontFamily:"inherit",resize:"vertical",outline:"none",lineHeight:1.7,boxSizing:"border-box"}}/>
                          <button onClick={async()=>{
                            if(!replyText.trim()||sendingReply) return;
                            setSendingReply(true);
                            onUpdateInquiry(selInq.id,{status:"replied",reply:replyText.trim()});
                            if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("inquiries").update({status:"replied",reply:replyText.trim()}).eq("id",selInq.id);}
                            setSelInq(s=>({...s,status:"replied",reply:replyText.trim()}));
                            setSendingReply(false);setReplySent(true);setReplyText("");
                            setTimeout(()=>setReplySent(false),3000);
                          }} disabled={!replyText.trim()||sendingReply}
                            style={{marginTop:10,width:"100%",background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:10,padding:"12px",fontWeight:800,fontSize:T.sm,cursor:replyText.trim()?"pointer":"not-allowed",opacity:replyText.trim()?1:0.5,fontFamily:"inherit"}}>
                            {sendingReply?"Saving…":"Save Reply →"}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ):(
                  <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,color:C.muted}}>
                    
                    <div style={{fontSize:T.sm}}>Select an inquiry to view</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {tab==="bookingreqs"&&(
        <div>
          <SectionHeader title="Bookingforespørsler"/>
          <div style={{color:C.muted,fontSize:T.sm,marginBottom:16}}>Alle forespørsler sendt av kunder på plattformen.</div>
          {bookingRequests.length===0?(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"48px 24px",textAlign:"center",color:C.muted}}>
              <div style={{fontSize:40,marginBottom:12}}>📩</div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,color:C.text,marginBottom:8}}>Ingen forespørsler ennå</div>
              <div style={{fontSize:T.sm}}>Forespørsler fra kunder vises her i sanntid.</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {bookingRequests.map((r:any)=>{
                const artist=artists.find((a:any)=>a.id===r.artist_id);
                const statusColors:any={request_received:C.saffron,pending:C.saffron,offered:C.lapis,accepted:C.emerald,declined:C.ruby,expired:C.muted};
                const statusLabels:any={request_received:"Ny",pending:"Ny",offered:"Tilbud sendt",accepted:"Akseptert",declined:"Avslått",expired:"Utløpt"};
                return(
                  <div key={r.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:10}}>
                      <div>
                        <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{r.customer_name}</div>
                        <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>{r.customer_email}</div>
                      </div>
                      <span style={{background:`${statusColors[r.status]||C.muted}20`,color:statusColors[r.status]||C.muted,padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700}}>{statusLabels[r.status]||r.status}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,marginBottom:8}}>
                      {[
                        ["Artist",artist?.name||r.artist_id?.slice(0,8)+"…"],
                        ["Dato",r.event_date||"—"],
                        ["Arrangementtype",r.event_type||"—"],
                        ["Sted",`${r.event_location_city||""}${r.event_location_country?", "+r.event_location_country:""}`.trim()||"—"],
                        ["Gjester",r.guest_count||"—"],
                        ["Notater",r.notes||"—"],
                      ].map(([k,v])=>(
                        <div key={k as string} style={{background:C.surface,borderRadius:7,padding:"7px 10px"}}>
                          <div style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{k}</div>
                          <div style={{fontSize:T.xs,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v as string}</div>
                        </div>
                      ))}
                    </div>
                    {r.artist_offer&&(
                      <div style={{background:C.goldS,border:`1px solid ${C.gold}44`,borderRadius:8,padding:"8px 12px",fontSize:T.xs,color:C.muted}}>
                        Artistens tilbud: <strong style={{color:C.gold}}>€{r.artist_offer}</strong>
                      </div>
                    )}
                    <div style={{fontSize:10,color:C.faint,marginTop:8}}>Sendt: {new Date(r.created_at).toLocaleString("nb-NO")}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {tab==="chat"&&(
        <div>
          <SectionHeader title="Direct Chat with Artists"/>
          <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr":"280px 1fr",gap:16,height:vp.isMobile?"auto":600}}>
            {/* Artist list */}
            <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,overflow:"auto"}}>
              <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,fontSize:T.xs,fontWeight:700,color:C.muted,textTransform:"uppercase" as const,letterSpacing:"0.8px"}}>Artists</div>
              {artists.map(a=>(
                <button key={a.id} onClick={async()=>{
                  setAdminChatArtist(a);
                  if(HAS_SUPA){
                    const sb=await getSupabase();
                    if(sb){
                      const{data}=await sb.from("chat_messages")
                        .select("*").eq("artist_id",a.id).order("created_at",{ascending:true});
                      if(data?.length>0){
                        const msgs=data.map(r=>({from:r.from_role,text:r.text,time:new Date(r.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}));
                        setAdminChats(p=>({...p,[a.id]:msgs}));
                      }
                    }
                  }
                }} style={{
                  width:"100%",display:"flex",gap:10,alignItems:"center",
                  padding:"12px 14px",
                  background:adminChatArtist?.id===a.id?C.goldS:"transparent",
                  border:"none",borderBottom:`1px solid ${C.border}`,
                  cursor:"pointer",textAlign:"left" as const,fontFamily:"inherit",
                  WebkitTapHighlightColor:"transparent",
                }}>
                  <div style={{width:34,height:34,borderRadius:8,background:`${a.color}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{a.emoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,color:C.text,fontSize:T.sm,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                    <div style={{color:a.status==="approved"?C.emerald:a.status==="rejected"?C.ruby:C.muted,fontSize:T.xs}}>{a.status}</div>
                  </div>
                  {(adminChats[a.id]||[]).length>0&&<span style={{width:7,height:7,borderRadius:"50%",background:C.gold,flexShrink:0}}/>}
                </button>
              ))}
            </div>

            {/* Chat panel */}
            <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,display:"flex",flexDirection:"column" as const,minHeight:vp.isMobile?400:600,overflow:"hidden"}}>
              {adminChatArtist?(
                <>
                  {/* Header */}
                  <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,background:C.surface,flexShrink:0}}>
                    <div style={{width:38,height:38,borderRadius:9,background:`${adminChatArtist.color}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{adminChatArtist.emoji}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{adminChatArtist.name}</div>
                      <div style={{color:C.muted,fontSize:T.xs}}>{adminChatArtist.genre} · {adminChatArtist.status}</div>
                    </div>
                    <button onClick={async()=>{
                      if(!confirm("Clear all messages with this artist?")) return;
                      setAdminChats(p=>({...p,[adminChatArtist.id]:[]}));
                      if(HAS_SUPA){
                        try{
                          const sb=await getSupabaseAdmin()||await getSupabase();
                          if(sb){
                            const{error}=await sb.from("chat_messages").delete().eq("artist_id",adminChatArtist.id);
                            if(error){notify("Could not delete — check RLS","error");}
                            else{notify("Chat cleared","success");}
                          }
                        }catch(e:any){notify("Error: "+e.message,"error");}
                      } else {notify("Chat cleared","success");}
                    }} style={{background:C.rubyS,color:C.ruby,border:`1px solid ${C.ruby}33`,borderRadius:7,padding:"5px 12px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                      Clear
                    </button>
                  </div>

                  {/* Messages — KEY FIX: whiteSpace pre-wrap for line breaks */}
                  <div style={{flex:1,overflow:"auto",padding:"16px",display:"flex",flexDirection:"column" as const,gap:10,minHeight:0}}>
                    {(adminChats[adminChatArtist.id]||[]).map((msg,i)=>{
                      const isAdmin=msg.from==="admin";
                      return(
                        <div key={i} style={{display:"flex",justifyContent:isAdmin?"flex-end":"flex-start",gap:6,alignItems:"flex-end"}}
                          onMouseEnter={e=>{const b=e.currentTarget.querySelector(".msg-del") as HTMLElement;if(b)b.style.opacity="1";}}
                          onMouseLeave={e=>{const b=e.currentTarget.querySelector(".msg-del") as HTMLElement;if(b)b.style.opacity="0";}}>
                          {isAdmin&&(
                            <button className="msg-del" onClick={()=>setAdminChats(p=>({...p,[adminChatArtist.id]:(p[adminChatArtist.id]||[]).filter((_,j)=>j!==i)}))}
                              style={{background:"none",border:"none",color:C.ruby,cursor:"pointer",opacity:0,transition:"opacity 0.15s",fontSize:11,padding:"4px",flexShrink:0}}>Del</button>
                          )}
                          <div style={{
                            maxWidth:"78%",
                            background:isAdmin?C.goldS:C.surface,
                            borderRadius:isAdmin?"14px 14px 3px 14px":"14px 14px 14px 3px",
                            padding:"10px 14px",
                            border:`1px solid ${isAdmin?C.gold+"44":C.border}`,
                          }}>
                            {msg.image&&<img src={msg.image} style={{maxWidth:"100%",maxHeight:200,borderRadius:8,marginBottom:6,display:"block"}} alt="img"/>}
                            {msg.text&&msg.text!=="[Image]"&&(
                              <div style={{
                                color:C.text,
                                fontSize:T.sm,
                                lineHeight:1.75,
                                // ── KEY FIX: renders \n as actual line breaks ──
                                whiteSpace:"pre-wrap" as const,
                                wordBreak:"break-word" as const,
                              }}>{msg.text}</div>
                            )}
                            <div style={{color:C.faint,fontSize:10,marginTop:4,textAlign:isAdmin?"right":"left"}}>{isAdmin?"Awaz":adminChatArtist.name} · {msg.time}</div>
                          </div>
                        </div>
                      );
                    })}
                    {!(adminChats[adminChatArtist.id]||[]).length&&(
                      <div style={{textAlign:"center",color:C.muted,fontSize:T.sm,marginTop:"auto",marginBottom:"auto",opacity:0.6,display:"flex",flexDirection:"column" as const,alignItems:"center",gap:8}}>
                        <div style={{fontSize:32}}>💬</div>
                        <div>Start the conversation with {adminChatArtist.name}</div>
                      </div>
                    )}
                  </div>

                  {/* Input — textarea for multi-line */}
                  <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,alignItems:"flex-end",background:C.surface,flexShrink:0}}>
                    <label style={{cursor:"pointer",padding:"10px",borderRadius:8,background:C.card,border:`1px solid ${C.border}`,color:C.muted,fontSize:16,display:"flex",alignItems:"center",flexShrink:0}} title="Attach image">
                      <input type="file" accept="image/*" onChange={handleAdminChatImg} style={{display:"none"}}/>
                      📎
                    </label>
                    <textarea
                      value={adminChatMsg}
                      onChange={e=>setAdminChatMsg(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&(adminChatMsg.trim()||adminChatImage)){e.preventDefault();sendAdminChat();}}}
                      placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                      rows={2}
                      style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit",resize:"none",lineHeight:1.6}}/>
                    <button onClick={sendAdminChat} disabled={!adminChatMsg.trim()&&!adminChatImage}
                      style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:8,padding:"10px 18px",fontWeight:700,cursor:adminChatMsg.trim()||adminChatImage?"pointer":"not-allowed",opacity:adminChatMsg.trim()||adminChatImage?1:0.4,fontFamily:"inherit",fontSize:T.sm,flexShrink:0,minHeight:44}}>
                      →
                    </button>
                  </div>
                </>
              ):(
                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column" as const,gap:12,color:C.muted}}>
                  <div style={{fontSize:36}}>💬</div>
                  <div style={{fontSize:T.sm}}>Select an artist to message</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FINANCE ── */}
      {tab==="finance"&&(
        <div>
          <SectionHeader title="Finance Overview"/>

          {/* ── Platform Stripe Connect Banner ── */}
          <StripePlatformBanner notify={notify}/>

          {/* ── Boost Revenue ── */}
          <div style={{background:`linear-gradient(135deg,${C.goldS},${C.card})`,border:`1px solid ${C.gold}44`,borderRadius:12,padding:"16px 20px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
            
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:C.gold,fontSize:T.sm}}>Artist Boost Revenue</div>
              <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>€50 per artist boost · {artists.filter(a=>a.isBoosted).length} active boosts · <strong style={{color:C.gold}}>€{artists.filter(a=>a.isBoosted).length * 50} earned</strong></div>
            </div>
            <button onClick={()=>setTab("artists")} style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:8,padding:"8px 16px",fontWeight:700,fontSize:T.xs,cursor:"pointer",fontFamily:"inherit"}}>Manage Boosts →</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${vp.isMobile?1:2},1fr)`,gap:12,marginBottom:24}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px"}}>
              <div style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:12}}>Revenue Breakdown</div>
              {[
                ["Total Deposits (Stripe)", `€${totalRevenue.toLocaleString()}`, C.text],
                ["Awaz Platform Fee (12%)", `€${awazRevenue.toLocaleString()}`, C.text],
                ["Artist Payouts (88%)", `€${(totalRevenue - awazRevenue).toLocaleString()}`, C.text],
              ].map(([label, value, color])=>(
                <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{color:C.textD,fontSize:T.sm}}>{label}</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color,fontSize:T.md}}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px"}}>
              <div style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:12}}>Booking Stats</div>
              {[
                ["Total Bookings",     bookings.length,                                                      C.text],
                ["Paid Deposits",      bookings.filter(b=>b.depositPaid).length,                             C.emerald],
                ["Confirmed Events",   confirmedBooks,                                                        C.lapis],
                ["Refunds Issued",     bookings.filter(b=>b.refunded).length,                                C.ruby],
                ["Avg. Deposit",       bookings.length?`€${Math.round(totalRevenue/(bookings.filter(b=>b.depositPaid).length||1))}`:"-", C.gold],
              ].map(([label, value, color])=>(
                <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{color:C.textD,fontSize:T.sm}}>{label}</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color,fontSize:T.md}}>{value}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Per-artist breakdown */}
          <div style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:12}}>Artist Revenue</div>
          {artists.filter(a=>a.status==="approved").map(a=>{
            const deps=bookings.filter(b=>b.artistId===a.id&&b.depositPaid).reduce((s,b)=>s+b.deposit,0);
            if(!deps)return null;
            return(
              <div key={a.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
                <div style={{fontSize:20}}>{a.emoji}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,color:C.text,fontSize:T.sm}}>{a.name}</div>
                  <div style={{color:C.muted,fontSize:T.xs}}>{bookings.filter(b=>b.artistId===a.id).length} bookings</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.gold,fontSize:T.md}}>€{deps.toLocaleString()}</div>
                  <div style={{color:C.muted,fontSize:T.xs}}>→ €{Math.round(deps*0.88).toLocaleString()} to artist</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Mobile layout ──
  if(vp.isMobile) return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:90,width:"100%"}}>
      <div style={{height:2,background:`linear-gradient(90deg,${C.ruby}88,${C.gold}88,${C.lapis}88)`,position:"fixed",top:0,left:0,right:0,zIndex:300}}/>
      <div style={{position:"fixed",top:3,left:0,right:0,zIndex:200,background:`${C.surface}F8`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,fontWeight:700,color:C.gold}}>Awaz Admin</div>
          <div style={{fontSize:T.xs,color:C.muted}}>Platform Control</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={onToggleTheme} style={{width:32,height:32,borderRadius:7,background:C.surface,border:`1px solid ${C.border}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,WebkitTapHighlightColor:"transparent"}}>
            {_theme==="dark"?"☀️":"🌙"}
          </button>
          <button onClick={onLogout} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"7px 14px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{t('signOut')}</button>
        </div>
      </div>
      <div style={{paddingTop:72}}>{pageContent}</div>
      <BottomNav active={tab} onNav={setTab} items={navItems}/>
      {chat&&<Chat booking={chat} artist={artists.find(a=>a.id===chat.artistId)} myRole="admin" onClose={()=>setChat(null)} onSend={onMsg}/>}
    </div>
  );

  // ── Desktop layout ──
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",width:"100%"}}>
      <div style={{height:2,background:`linear-gradient(90deg,${C.ruby}88,${C.gold}88,${C.lapis}88)`,position:"fixed",top:0,left:0,right:0,zIndex:200}}/>
      {/* Sidebar */}
      <aside style={{width:240,background:C.surface,borderRight:`1px solid ${C.border}`,padding:"0",display:"flex",flexDirection:"column",position:"fixed",top:3,bottom:0,zIndex:100,overflowY:"auto"}}>
        {/* Logo */}
        <div style={{padding:"24px 20px 20px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:20,color:C.gold}}>آواز</div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,fontWeight:700,color:C.text}}>Awaz</div>
          </div>
          <div style={{fontSize:T.xs,color:C.muted,fontWeight:600,letterSpacing:"0.5px"}}>Admin Dashboard</div>
        </div>
        {/* Nav */}
        <nav style={{flex:1,padding:"12px 0"}}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>setTab(item.id)} style={{
              display:"flex",gap:12,alignItems:"center",
              padding:"10px 20px",width:"100%",
              background:tab===item.id?C.goldS:"transparent",
              color:tab===item.id?C.gold:C.muted,
              border:"none",cursor:"pointer",
              fontFamily:"inherit",fontSize:T.sm,
              fontWeight:tab===item.id?700:400,
              borderLeft:`3px solid ${tab===item.id?C.gold:"transparent"}`,
              textAlign:"left",minHeight:44,
              transition:"all 0.1s",
              WebkitTapHighlightColor:"transparent",
            }}>
              <span style={{fontSize:16,flexShrink:0}}>{item.icon}</span>
              <span style={{flex:1}}>{item.label}</span>
              {(item.badge||0)>0&&(
                <span style={{background:C.ruby,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700,flexShrink:0}}>{item.badge}</span>
              )}
            </button>
          ))}
        </nav>
        {/* User */}
        <div style={{padding:"16px 20px",borderTop:`1px solid ${C.border}`}}>
          <div style={{fontSize:T.xs,color:C.muted,marginBottom:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Admin</div>
          <button onClick={onToggleTheme} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"9px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:6,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            {_theme==="dark"?"☀️ Light mode":"🌙 Dark mode"}
          </button>
          <button onClick={onLogout} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"9px",fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Sign Out</button>
        </div>
      </aside>
      {/* Main content */}
      <main style={{flex:1,marginLeft:240,paddingTop:3,overflow:"auto"}}>
        {pageContent}
      </main>
      {chat&&<Chat booking={chat} artist={artists.find(a=>a.id===chat.artistId)} myRole="admin" onClose={()=>setChat(null)} onSend={onMsg}/>}
      {reviewArtist&&(
        <AdminReviewSheet
          artist={reviewArtist}
          onClose={()=>setReviewArtist(null)}
          onApprove={(id)=>{
            onAction(id,"approved");
            setReviewArtist(null);
            notify("Artist approved and published","success");
            sendEmailNotification({type:"artist_approved",toEmail:reviewArtist?.email,toName:reviewArtist?.name,artistName:reviewArtist?.name});
          }}
          onReject={(id,msg)=>{
            onAction(id,"rejected");
            setAdminChatArtist(reviewArtist);setTab("chat");
            onMsg({artistId:id,text:`❌ Your profile was rejected. Feedback: ${msg}`,from:"admin"});
            setReviewArtist(null);
            notify("Rejected — feedback sent","success");
            sendEmailNotification({type:"artist_rejected",toEmail:reviewArtist?.email,toName:reviewArtist?.name,artistName:reviewArtist?.name,feedbackText:msg});
          }}
          onUnpublish={(id,msg)=>{
            onAction(id,"pending");
            setAdminChatArtist(reviewArtist);setTab("chat");
            onMsg({artistId:id,text:`⚠️ Your profile has been unpublished. Please make the following changes:\n\n${msg}\n\nOnce done, your profile will be reviewed again.`,from:"admin"});
            setReviewArtist(null);
            notify("Unpublished — feedback sent to artist","success");
            sendEmailNotification({type:"artist_rejected",toEmail:reviewArtist?.email,toName:reviewArtist?.name,artistName:reviewArtist?.name,feedbackText:msg});
          }}
          bookings={bookings}
        />
      )}
    </div>
  );
}



function AdminReviewSheet({artist, onClose, onApprove, onReject, onUnpublish, bookings}:{
  artist:any; onClose:()=>void;
  onApprove:(id:string)=>void;
  onReject:(id:string,msg:string)=>void;
  onUnpublish:(id:string,msg:string)=>void;
  bookings:any[];
}){
  const [feedback,setFeedback]=useState("");
  const [mode,setMode]=useState<"review"|"reject"|"unpublish">("review");
  const isUnpublishMode=artist._unpublishMode===true;
  const bookCount=bookings.filter(b=>b.artistId===artist.id).length;

  // Checklist of profile completeness
  const checks=[
    {label:"Profile photo",      ok:!!artist.photo},
    {label:"Bio written",         ok:!!artist.bio&&artist.bio.length>30},
    {label:"Genre selected",      ok:!!artist.genre},
    {label:"Location set",        ok:!!artist.location&&artist.location!=="—"},
    {label:"Deposit price set",   ok:(artist.deposit||0)>=50},
    {label:"Artist type set",     ok:!!artist.artistType},
    {label:"Bank account added",  ok:!!artist.iban||!!artist.bank_iban||artist.stripeConnected},
    {label:"Email confirmed",     ok:!!artist.email},
  ];
  const score=checks.filter(c=>c.ok).length;

  React.useEffect(()=>{
    if(isUnpublishMode) setMode("unpublish");
  },[isUnpublishMode]);

  return(
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:C.card,borderRadius:16,width:"100%",maxWidth:640,maxHeight:"90vh",overflow:"auto",border:`1px solid ${C.border}`,boxShadow:"0 32px 80px rgba(0,0,0,0.5)"}}>
        {/* Header */}
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text}}>
              {mode==="unpublish"?"Unpublish Artist":"Review Artist Profile"}
            </div>
            <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>{artist.name} · {artist.genre} · {artist.location}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        <div style={{padding:"20px 24px",display:"flex",flexDirection:"column" as const,gap:16}}>

          {/* Profile completeness score */}
          {mode==="review"&&(
            <>
              <div style={{background:C.surface,borderRadius:10,padding:"14px 16px",border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>Profile Completeness</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:score>=6?C.emerald:score>=4?C.saffron:C.ruby,fontSize:T.lg}}>{score}/{checks.length}</div>
                </div>
                {/* Progress bar */}
                <div style={{height:4,background:C.border,borderRadius:2,marginBottom:12,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(score/checks.length)*100}%`,background:score>=6?C.emerald:score>=4?C.saffron:C.ruby,borderRadius:2,transition:"width 0.3s"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {checks.map(({label,ok})=>(
                    <div key={label} style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
                      <span style={{color:ok?C.emerald:C.ruby,fontWeight:700,flexShrink:0}}>{ok?"✓":"✗"}</span>
                      <span style={{color:ok?C.textD:C.muted}}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key info */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  ["Status",         artist.status.toUpperCase()],
                  ["Artist type",    artist.artistType||"—"],
                  ["Deposit",        artist.deposit?`€${artist.deposit}`:"—"],
                  ["Currency",       artist.currency||"EUR"],
                  ["Bookings",       String(bookCount)],
                  ["Bank account",   artist.iban||artist.bank_iban?"✓ Added":"✗ Missing"],
                ].map(([k,v])=>(
                  <div key={k} style={{background:C.surface,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:2}}>{k}</div>
                    <div style={{fontSize:T.sm,fontWeight:700,color:C.text}}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Bio preview */}
              {artist.bio&&(
                <div style={{background:C.surface,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.muted,marginBottom:6,textTransform:"uppercase" as const,letterSpacing:"0.5px"}}>Bio</div>
                  <div style={{color:C.textD,fontSize:T.sm,lineHeight:1.7}}>{artist.bio}</div>
                </div>
              )}

              {/* Missing items auto-suggestion */}
              {checks.filter(c=>!c.ok).length>0&&(
                <div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontWeight:700,color:C.ruby,fontSize:T.xs,marginBottom:8}}>Missing items — suggest to artist:</div>
                  <div style={{display:"flex",flexDirection:"column" as const,gap:4}}>
                    {checks.filter(c=>!c.ok).map(({label})=>(
                      <div key={label} style={{fontSize:11,color:C.muted,display:"flex",gap:6}}>
                        <span style={{color:C.ruby}}>→</span>{label}
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>{
                    const missing=checks.filter(c=>!c.ok).map(c=>c.label).join(", ");
                    setFeedback(`Please complete the following before your profile can be approved:\n\n${missing.split(", ").map(l=>`• ${l}`).join("\n")}`);
                    setMode("reject");
                  }} style={{marginTop:10,background:"none",border:`1px solid ${C.ruby}44`,borderRadius:7,padding:"5px 12px",color:C.ruby,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    Use this as rejection feedback →
                  </button>
                </div>
              )}
            </>
          )}

          {/* Feedback text area — shown for reject or unpublish modes */}
          {(mode==="reject"||mode==="unpublish")&&(
            <div>
              <div style={{fontWeight:700,color:C.text,fontSize:T.sm,marginBottom:8}}>
                {mode==="unpublish"
                  ?"What does the artist need to change? (sent directly to them)"
                  :"Rejection reason — sent to artist as a message"}
              </div>
              <textarea
                value={feedback}
                onChange={e=>setFeedback(e.target.value)}
                rows={6}
                placeholder={mode==="unpublish"
                  ?"e.g. Please update your profile photo. The bio needs to be more detailed. Deposit price seems too low for your market."
                  :"e.g. Your profile photo is missing. Please add a proper bio and set a deposit price before reapplying."}
                style={{width:"100%",background:C.surface,border:`2px solid ${feedback.trim()?C.gold:C.border}`,borderRadius:10,padding:"12px 14px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box" as const}}
              />
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>
                This message will be sent directly to the artist via the platform chat.
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{display:"flex",gap:10,paddingTop:4}}>
            {mode==="review"&&!isUnpublishMode&&(
              <>
                <button onClick={()=>onApprove(artist.id)}
                  style={{flex:2,background:C.emerald,color:"#fff",border:"none",borderRadius:10,padding:"13px",fontWeight:800,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
                  ✓ Approve & Publish
                </button>
                <button onClick={()=>setMode("reject")}
                  style={{flex:1,background:C.rubyS,color:C.ruby,border:`1px solid ${C.ruby}44`,borderRadius:10,padding:"13px",fontWeight:700,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
                  ✗ Reject
                </button>
              </>
            )}
            {mode==="review"&&isUnpublishMode&&(
              <button onClick={()=>setMode("unpublish")}
                style={{flex:1,background:C.rubyS,color:C.ruby,border:`1px solid ${C.ruby}44`,borderRadius:10,padding:"13px",fontWeight:800,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
                ↩ Write unpublish reason
              </button>
            )}
            {mode==="reject"&&(
              <>
                <button onClick={()=>onReject(artist.id,feedback||"Please review our profile requirements and reapply.")}
                  style={{flex:2,background:C.ruby,color:"#fff",border:"none",borderRadius:10,padding:"13px",fontWeight:800,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit",opacity:1}}>
                  Send Rejection & Feedback
                </button>
                <button onClick={()=>setMode("review")}
                  style={{flex:1,background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px",fontWeight:600,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
                  ← Back
                </button>
              </>
            )}
            {mode==="unpublish"&&(
              <>
                <button
                  onClick={()=>{
                    if(!feedback.trim()){alert("Please write what the artist needs to change.");return;}
                    onUnpublish(artist.id,feedback);
                  }}
                  style={{flex:2,background:C.ruby,color:"#fff",border:"none",borderRadius:10,padding:"13px",fontWeight:800,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
                  ↩ Unpublish & Send Feedback
                </button>
                <button onClick={()=>setMode("review")}
                  style={{flex:1,background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px",fontWeight:600,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
                  ← Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



// ── Searchable Country Selector ──────────────────────────────────────────────
const COUNTRY_LIST=[
  ["AF","Afghanistan 🇦🇫"],["AL","Albania 🇦🇱"],["DZ","Algeria 🇩🇿"],
  ["AU","Australia 🇦🇺"],["AT","Austria 🇦🇹"],["AZ","Azerbaijan 🇦🇿"],
  ["BE","Belgium 🇧🇪"],["CA","Canada 🇨🇦"],["CN","China 🇨🇳"],
  ["DK","Denmark 🇩🇰"],["EG","Egypt 🇪🇬"],["FI","Finland 🇫🇮"],
  ["FR","France 🇫🇷"],["DE","Germany 🇩🇪"],["GR","Greece 🇬🇷"],
  ["HU","Hungary 🇭🇺"],["IS","Iceland 🇮🇸"],["IN","India 🇮🇳"],
  ["ID","Indonesia 🇮🇩"],["IR","Iran 🇮🇷"],["IQ","Iraq 🇮🇶"],
  ["IE","Ireland 🇮🇪"],["IL","Israel 🇮🇱"],["IT","Italy 🇮🇹"],
  ["JP","Japan 🇯🇵"],["JO","Jordan 🇯🇴"],["KZ","Kazakhstan 🇰🇿"],
  ["KW","Kuwait 🇰🇼"],["LB","Lebanon 🇱🇧"],["LY","Libya 🇱🇾"],
  ["MY","Malaysia 🇲🇾"],["MA","Morocco 🇲🇦"],["NL","Netherlands 🇳🇱"],
  ["NZ","New Zealand 🇳🇿"],["NO","Norway 🇳🇴"],["OM","Oman 🇴🇲"],
  ["PK","Pakistan 🇵🇰"],["PL","Poland 🇵🇱"],["PT","Portugal 🇵🇹"],
  ["QA","Qatar 🇶🇦"],["RU","Russia 🇷🇺"],["SA","Saudi Arabia 🇸🇦"],
  ["SE","Sweden 🇸🇪"],["CH","Switzerland 🇨🇭"],["TW","Taiwan 🇹🇼"],
  ["TJ","Tajikistan 🇹🇯"],["TR","Turkey 🇹🇷"],["TM","Turkmenistan 🇹🇲"],
  ["AE","UAE 🇦🇪"],["GB","United Kingdom 🇬🇧"],["US","United States 🇺🇸"],
  ["UZ","Uzbekistan"],["YE","Yemen"],["OTHER","Other"],
];
function CountrySelect({value,onChange,label="Country"}:{value:string;onChange:(v:string)=>void;label?:string}){
  const [q,setQ]=useState("");
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  const filtered=q?COUNTRY_LIST.filter(([,l])=>l.toLowerCase().includes(q.toLowerCase())):COUNTRY_LIST;
  const sel=COUNTRY_LIST.find(([c])=>c===value);
  useEffect(()=>{
    const handler=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[]);
  return(
    <div ref={ref} style={{position:"relative"}}>
      <div style={{fontSize:10,fontWeight:700,color:"#8A7D68",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6}}>{label}</div>
      <button type="button" onClick={()=>setOpen(o=>!o)}
        style={{width:"100%",background:C.bg,border:`1px solid ${open?"#C8A84A":"#201D2E"}`,borderRadius:12,padding:"12px 16px",color:"#EDE4CE",fontSize:14,textAlign:"left",cursor:"pointer",fontFamily:"inherit",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"border-color 0.15s"}}>
        <span>{sel?sel[1]:"Select country…"}</span>
        <span style={{color:"#8A7D68",fontSize:12}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#141220",border:"1px solid #2C2840",borderRadius:12,zIndex:200,boxShadow:"0 12px 40px rgba(0,0,0,0.6)",overflow:"hidden"}}>
          <div style={{padding:"8px 10px",borderBottom:"1px solid #201D2E"}}>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)}
              placeholder="Search country…"
              style={{width:"100%",background:C.bg,border:"1px solid #201D2E",borderRadius:8,padding:"8px 12px",color:"#EDE4CE",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
          </div>
          <div style={{maxHeight:220,overflowY:"auto"}}>
            {filtered.map(([code,label])=>(
              <button key={code} type="button" onClick={()=>{onChange(code);setOpen(false);setQ("");}}
                style={{width:"100%",background:value===code?"rgba(200,168,74,0.1)":"transparent",color:value===code?"#C8A84A":"#EDE4CE",border:"none",padding:"10px 16px",textAlign:"left",cursor:"pointer",fontSize:13,fontFamily:"inherit",display:"block"}}
                onMouseEnter={e=>(e.currentTarget.style.background="rgba(200,168,74,0.07)")}
                onMouseLeave={e=>(e.currentTarget.style.background=value===code?"rgba(200,168,74,0.1)":"transparent")}>
                {label}
              </button>
            ))}
            {filtered.length===0&&<div style={{padding:"12px 16px",color:"#8A7D68",fontSize:13}}>No results</div>}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Support Widget (artist → admin message) ──────────────────────────────────
function SupportWidget({artistId}:{artistId:string}){
  const [msg,setMsg]=React.useState("");
  const [sent,setSent]=React.useState(false);
  if(sent) return(
    <div style={{background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)",borderRadius:10,padding:"12px 16px",color:"#22C55E",fontWeight:700,fontSize:14}}>
      ✓ Message sent — check Messages tab for our reply
    </div>
  );
  return(
    <div>
      <textarea value={msg} onChange={e=>setMsg(e.target.value)}
        placeholder="Describe your issue or question…" rows={3}
        style={{width:"100%",background:C.bg,border:"1px solid #201D2E",borderRadius:10,padding:"10px 14px",color:"#EDE4CE",fontSize:14,fontFamily:"inherit",resize:"vertical",outline:"none",lineHeight:1.6,boxSizing:"border-box",marginBottom:10}}
      />
      <button onClick={async()=>{
        if(!msg.trim()) return;
        try{
          if(typeof getSupabase==="function"){
            const sb=await getSupabase();
            if(sb){
              // Save to chat_messages so admin sees it in Messages tab
              await sb.from("chat_messages").insert({
                artist_id: artistId,
                from_role: "artist",
                text: "🆘 SUPPORT: "+msg.trim(),
              });
              // Also save to inquiries table as backup
              await sb.from("inquiries").insert({
                name: "Support Request",
                email: "support@awaz.no",
                artist_id: artistId,
                message: "🆘 SUPPORT: "+msg.trim(),
                status: "new",
                event_type: "Support",
              });
            }
          }
          setSent(true);
        }catch(e){
          console.warn("Support send failed:", e);
          setSent(true); // Still show success to user
        }
      }} disabled={!msg.trim()}
        style={{width:"100%",background:msg.trim()?`linear-gradient(135deg,${C.gold},${C.saffron})`:"#141220",color:msg.trim()?C.bg:"#8A7D68",border:`1px solid ${msg.trim()?"#C8A84A":"#201D2E"}`,borderRadius:10,padding:"11px",fontWeight:700,fontSize:14,cursor:msg.trim()?"pointer":"not-allowed",fontFamily:"inherit"}}>
        Send to Awaz Support →
      </button>
    </div>
  );
}


// ── Artist Portal ──────────────────────────────────────────────────────
function BoostButton({ artist, onUpdateArtist, notify }) {
  const [showBoostPay, setShowBoostPay] = React.useState(false);
  return (
    <>
      <button onClick={()=>setShowBoostPay(true)}
        style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:10,padding:"12px 24px",fontWeight:800,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit",width:"100%"}}>
        ⭐ Boost My Profile — €50
      </button>
      <div style={{color:C.faint,fontSize:11,marginTop:5,textAlign:"center"}}>One-time payment · 6 months featured at top of browse</div>
      {showBoostPay&&(
        <StripePaywall
          amount={50}
          emoji=""
          label="Boost Your Profile"
          description="Featured at top of browse page for 6 months. Highlighted with gold border."
          metadata={{artistName:artist.name,bookingId:`boost_${artist.id}_${Date.now()}`,type:"boost"}}
          onSuccess={async(piId)=>{
            const boostUntil=new Date(Date.now()+180*24*60*60*1000).toISOString();
            onUpdateArtist(artist.id,{isBoosted:true,boostedUntil:boostUntil});
            if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("artists").update({is_boosted:true,boosted_until:boostUntil,boost_payment_id:piId}).eq("id",artist.id);}
            notify("Profile boosted for 6 months! You're now featured.","success");
            setShowBoostPay(false);
          }}
          onClose={()=>setShowBoostPay(false)}
        />
      )}
    </>
  );
}

function ArtistPortal({ user, artist, bookings, session, onLogout, onToggleDay, onMsg, onUpdateArtist, theme, onToggleTheme }) {
  // Sync module-level _theme so C proxy uses correct palette on every render
  if(theme) _theme = theme;
  const vp=useViewport();
  const {show:notify}=useNotif();
  const [tab,setTab]=useState("overview");
  const [bandMembers,setBandMembers]=useState<{role:string;name:string;price:number}[]>(
    ()=>Array.isArray(artist.bandMembers)?artist.bandMembers:[]
  );
  const [newMember,setNewMember]=useState({role:"Tabla",name:"",price:100});
  const [bandSaved,setBandSaved]=useState(false);
  const [songRequests,setSongRequests]=useState<any[]>([]);
  const [chat,setChat]=useState(null);
  const [localAdminMsgs,setLocalAdminMsgs]=useState([]);
  const [artistReplyMsg,setArtistReplyMsg]=useState("");
  const [calSaved,setCalSaved]=useState(false);
  const [showStripeConnect,setShowStripeConnect]=useState(false);
  const [editing,setEditing]=useState(false);
  const [showBoostPay,setShowBoostPay]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saveSuccess,setSaveSuccess]=useState(false);
  const [editF,setEditF]=useState({
    name:artist.name||"",
    email:artist.email||"",
    phone:artist.phone||"",
    bio:artist.bio,
    priceInfo:artist.priceInfo,
    currency:artist.currency||"EUR",
    deposit:String(Math.max(500, artist.deposit||500)),
    depositWithBand:String(artist.depositWithBand||artist.deposit_with_band||800),
    country:artist.country||"NO",
    cancellationPolicy:artist.cancellationPolicy,
    genres:(artist.tags||[]).join(", "),
    performingCountries:(artist.performingCountries||[]).join(", "),
  });

  // Social media state — separate from profile editing so each section saves independently
  const [socialF,setSocialF]=useState({
    spotifyUrl:       artist.spotify?.profileUrl||"",
    spotifyListeners: artist.spotify?.monthlyListeners||"",
    spotifyTrack1:    artist.spotify?.topTracks?.[0]||"",
    spotifyTrack2:    artist.spotify?.topTracks?.[1]||"",
    spotifyTrack3:    artist.spotify?.topTracks?.[2]||"",
    instagramHandle:  artist.instagram?.handle||"",
    instagramFollowers:artist.instagram?.followers||"",
    instagramUrl:     artist.instagram?.profileUrl||"",
    youtubeUrl:       artist.youtube?.url||"",
    youtubeSubscribers:artist.youtube?.subscribers||"",
    tiktokHandle:     artist.tiktok?.handle||"",
    tiktokFollowers:  artist.tiktok?.followers||"",
  });
  const [socialSaved,setSocialSaved]=useState(false);
  // Sync socialF when artist.spotify/instagram data changes (e.g. after DB load)
  React.useEffect(()=>{
    setSocialF({
      spotifyUrl:         artist.spotify?.profileUrl||"",
      spotifyListeners:   artist.spotify?.monthlyListeners||"",
      spotifyTrack1:      artist.spotify?.topTracks?.[0]||"",
      spotifyTrack2:      artist.spotify?.topTracks?.[1]||"",
      spotifyTrack3:      artist.spotify?.topTracks?.[2]||"",
      instagramHandle:    artist.instagram?.handle||"",
      instagramFollowers: artist.instagram?.followers||"",
      instagramUrl:       artist.instagram?.profileUrl||"",
      youtubeUrl:         artist.youtube?.url||"",
      youtubeSubscribers: artist.youtube?.subscribers||"",
      tiktokHandle:       artist.tiktok?.handle||"",
      tiktokFollowers:    artist.tiktok?.followers||"",
    });
  },[artist.id, artist.spotify, artist.instagram, artist.youtube, artist.tiktok]);
  const [socialErr,setSocialErr]=useState("");

  const myB=bookings.filter(b=>b.artistId===artist.id);
  const depositsIn=myB.filter(b=>b.depositPaid).reduce((s,b)=>s+Math.round(b.deposit*0.88),0);

  const pendingCount=myB.filter(b=>b.status==="pending_payment"||b.status==="pending").length;

  const [songRequestCount, setSongRequestCountBadge] = useState(0);
  const [bookingRequests,setBookingRequests]=useState<any[]>([]);

  // ── Load booking requests for this artist ──────────────────────────────
  React.useEffect(()=>{
    if(!HAS_SUPA) return;
    getSupabase().then(async sb=>{
      if(!sb) return;
      const {data}=await sb.from("booking_requests")
        .select("*").eq("artist_id",artist.id)
        .order("created_at",{ascending:false});
      if(data) setBookingRequests(data.map((r:any)=>({
        id:r.id,
        artistId:r.artist_id,
        customerName:r.customer_name,
        customerEmail:r.customer_email,
        eventDate:r.event_date,
        eventType:r.event_type,
        location:`${r.event_location_city||""}${r.event_location_country?", "+r.event_location_country:""}`,
        countryCode:r.event_location_country_code||"",
        guestCount:r.guest_count,
        bookingType:r.booking_type,
        budgetRange:r.customer_budget_range,
        notes:r.notes,
        status:r.status||"request_received",
        artistOffer:r.artist_offer||null,
        counterRound:r.counter_round||0,
        declineReason:r.decline_reason||null,
        expiresAt:r.expires_at?new Date(r.expires_at).getTime():Date.now()+48*60*60*1000,
        createdAt:r.created_at,
      })));
    });
  },[artist.id]);

  // ── Realtime: booking_requests ─────────────────────────────────────────
  React.useEffect(()=>{
    if(!HAS_SUPA) return;
    let ch:any=null;
    getSupabase().then(sb=>{
      if(!sb) return;
      ch=sb.channel(`booking_requests_${artist.id}`)
        .on("postgres_changes",{event:"*",schema:"public",table:"booking_requests",filter:`artist_id=eq.${artist.id}`},(payload:any)=>{
          const map=(r:any)=>({
            id:r.id,artistId:r.artist_id,customerName:r.customer_name,customerEmail:r.customer_email,
            eventDate:r.event_date,eventType:r.event_type,
            location:`${r.event_location_city||""}${r.event_location_country?", "+r.event_location_country:""}`,
            countryCode:r.event_location_country_code||"",guestCount:r.guest_count,
            bookingType:r.booking_type,budgetRange:r.customer_budget_range,notes:r.notes,
            status:r.status||"request_received",artistOffer:r.artist_offer||null,
            counterRound:r.counter_round||0,declineReason:r.decline_reason||null,
            expiresAt:r.expires_at?new Date(r.expires_at).getTime():Date.now()+48*60*60*1000,
            createdAt:r.created_at,
          });
          if(payload.eventType==="INSERT"){
            const nr=map(payload.new);
            setBookingRequests(p=>[nr,...p]);
            notify(`Ny bookingforespørsel fra ${nr.customerName}!`,"message");
            sendBrowserNotif("Ny forespørsel — Awaz",`${nr.customerName} ønsker å booke deg til ${nr.eventType}`);
            setTab("bookingreqs");
          } else if(payload.eventType==="UPDATE"){
            setBookingRequests(p=>p.map(r=>r.id===payload.new.id?map(payload.new):r));
          } else if(payload.eventType==="DELETE"){
            setBookingRequests(p=>p.filter(r=>r.id!==payload.old.id));
          }
        }).subscribe();
    });
    return()=>{if(ch) ch.unsubscribe();};
  },[artist.id]);

  const pendingBookingReqs=bookingRequests.filter(r=>r.status==="request_received"||r.status==="pending").length;
  const navItems=[
    {id:"overview",    label:"Oversikt"},
    {id:"bookingreqs", label:"Forespørsler", badge:pendingBookingReqs},
    {id:"bookings",    label:"Bookinger",    badge:pendingCount},
    {id:"songreqs",    label:"Song Req.",    badge:songRequestCount},
    {id:"calendar",    label:"Kalender"},
    {id:"messages",    label:"Meldinger"},
    {id:"band",        label:t('myBandTitle')},
    {id:"pricing",     label:"Priser"},
    {id:"profile",     label:"Profil"},
    {id:"social",      label:"Sosiale"},
    {id:"settings",    label:"Innstillinger"},
  ];

  const saveEdit=async()=>{
    setSaving(true);
    const dep=Math.max(500,parseInt(editF.deposit)||500);
    const depWithBand=artist.artistType==="vocalist"?Math.max(800,parseInt(editF.depositWithBand)||800):null;
    const newTags=editF.genres.split(",").map(g=>g.trim()).filter(Boolean);
    const newCountries=editF.performingCountries.split(",").map(c=>c.trim()).filter(Boolean);
    const updates={
      name:editF.name.trim()||artist.name,
      email:editF.email.trim(),
      phone:editF.phone.trim(),
      bio:editF.bio,
      priceInfo:editF.priceInfo,
      currency:"EUR",
      deposit:dep,
      depositWithBand:depWithBand,
      country:editF.country||"NO",
      cancellationPolicy:editF.cancellationPolicy,
      tags:newTags,
      performingCountries:newCountries,
    };
    onUpdateArtist(artist.id,updates);
    setEditing(false);
    setSaving(false);
    setSaveSuccess(true);
    notify("Profile updated!","success");
    setTimeout(()=>setSaveSuccess(false),3000);
    if(HAS_SUPA){
      try{
        const sb=await getSupabase();
        if(sb) await sb.from("artists").update({
          name:                updates.name,
          email:               updates.email,
          phone:               updates.phone,
          bio:                 updates.bio,
          price_info:          updates.priceInfo,
          deposit:             updates.deposit,
          cancellation_policy: updates.cancellationPolicy,
          currency:            "EUR",
          country:             updates.country,
          tags:                newTags,
          performing_countries:newCountries,
          photo:               artist.photo||null,
          emoji:               artist.emoji||"",
          updated_at:          new Date().toISOString(),
        }).eq("id",artist.id);
        // Also update name in profiles table
        if(updates.name!==artist.name) await sb.from("profiles").update({name:updates.name}).eq("id",artist.id);
      }catch(e){console.warn("Supabase artist update failed:",e);}
    }
  };

  const saveSocial=async()=>{
    setSocialErr("");

    // ── Build objects ──────────────────────────────────────────────────
    if(socialF.spotifyUrl){
      const testId=parseSpotifyArtistId(socialF.spotifyUrl);
      if(!testId){setSocialErr("Spotify link not recognized. Paste directly from Spotify → Share → Copy link to artist.");return;}
    }
    if(socialF.youtubeUrl&&!socialF.youtubeUrl.includes("youtube")&&!socialF.youtubeUrl.includes("youtu.be")){
      setSocialErr("YouTube link looks invalid.");return;
    }

    const newSpotify   = socialF.spotifyUrl ? {
      profileUrl:      socialF.spotifyUrl.trim(),
      monthlyListeners:socialF.spotifyListeners||"",
      topTracks:[socialF.spotifyTrack1,socialF.spotifyTrack2,socialF.spotifyTrack3].filter(Boolean),
    } : null;
    const ig           = parseInstagramHandle(socialF.instagramHandle);
    const newInstagram = ig ? {
      handle:ig, followers:socialF.instagramFollowers||"",
      profileUrl:socialF.instagramUrl||`https://instagram.com/${ig.replace("@","")}`, posts:[],
    } : null;
    const ytParsed   = parseYouTubeId(socialF.youtubeUrl||"");
    const newYoutube = socialF.youtubeUrl ? {
      url:socialF.youtubeUrl.trim(),
      handle:ytParsed?.type==="handle"?ytParsed.id:"",
      subscribers:socialF.youtubeSubscribers||"",
    } : null;
    const ttHandle = parseTikTokHandle(socialF.tiktokHandle||"");
    const newTiktok = ttHandle ? {handle:ttHandle, followers:socialF.tiktokFollowers||""} : null;

    // ── Optimistic local update ────────────────────────────────────────
    onUpdateArtist(artist.id,{spotify:newSpotify,instagram:newInstagram,youtube:newYoutube,tiktok:newTiktok});

    if(!HAS_SUPA){
      setSocialSaved(true);
      notify("Social profiles saved!","success");
      setTimeout(()=>setSocialSaved(false),4000);
      return;
    }

    try{
      const sb = await getSupabase();
      if(!sb){ setSocialErr("No database connection"); return; }

      // ── Write to DB ────────────────────────────────────────────────
      const payload = {
        spotify_data:   newSpotify   ?? null,
        instagram_data: newInstagram ?? null,
        youtube_data:   newYoutube   ?? null,
        tiktok_data:    newTiktok    ?? null,
        updated_at:     new Date().toISOString(),
      };

      const {error} = await sb.from("artists")
        .update(payload)
        .eq("id", artist.id);

      if(error){
        console.error("Social save error:", error);
        // Revert local
        onUpdateArtist(artist.id,{spotify:artist.spotify,instagram:artist.instagram,youtube:artist.youtube,tiktok:artist.tiktok});
        setSocialErr(`Save failed: ${error.message}`);
        return;
      }

      // ── Verify it actually saved (read back) ───────────────────────
      const {data:verify, error:verifyErr} = await sb
        .from("artists")
        .select("spotify_data,instagram_data,youtube_data,tiktok_data")
        .eq("id", artist.id)
        .single();

      if(verifyErr || !verify){
        setSocialErr("Saved but could not verify — please refresh to confirm.");
      } else {
        // Sync local state from what DB actually has
        onUpdateArtist(artist.id,{
          spotify:   verify.spotify_data||null,
          instagram: verify.instagram_data||null,
          youtube:   verify.youtube_data||null,
          tiktok:    verify.tiktok_data||null,
        });
        console.log("✅ Social verified from DB:", Object.keys(verify).filter(k=>verify[k]));
      }

    }catch(e:any){
      setSocialErr("Error: "+e.message);
      onUpdateArtist(artist.id,{spotify:artist.spotify,instagram:artist.instagram,youtube:artist.youtube,tiktok:artist.tiktok});
      return;
    }

    setSocialSaved(true);
    notify("✅ Social profiles saved and verified!","success");
    setTimeout(()=>setSocialSaved(false),4000);
  };

  const content=(
    <div style={{padding:vp.isMobile?"16px":"28px 32px",maxWidth:900}}>

      
      {tab==="overview"&&(
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>
            Hey, {artist.name.split(" ")[0]}
          </div>
          {/* Notification banner for pending bookings */}
          {pendingCount>0&&(
            <div onClick={()=>setTab("bookings")} style={{display:"flex",alignItems:"center",gap:12,background:"rgba(168,44,56,0.08)",border:"1px solid rgba(168,44,56,0.3)",borderRadius:12,padding:"14px 16px",marginBottom:16,cursor:"pointer"}}>
              
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:C.ruby,fontSize:T.sm}}>{pendingCount} new booking{pendingCount>1?"s":""} awaiting your response</div>
                <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>Tap to review →</div>
              </div>
            </div>
          )}
          {artist.status==="pending"&&(
            <div style={{background:"rgba(196,120,32,0.08)",border:`1px solid ${C.saffron}44`,borderRadius:12,padding:"16px 18px",marginBottom:16,fontFamily:"'DM Sans',sans-serif"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:18}}>⏳</span>
                <span style={{fontWeight:700,color:C.saffron,fontSize:T.sm}}>Profile under review — 24–48 hours</span>
              </div>
              <div style={{fontSize:T.xs,color:C.textD,marginBottom:12,lineHeight:1.6}}>
                While you wait, complete your profile to get approved faster and attract more clients.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {[
                  [!!artist.bio,"Add bio",()=>setTab("profile")],
                  [!!artist.spotify||!!artist.instagram,"Add Spotify / Instagram",()=>setTab("social")],
                  [(artist.available?.[MK]||[]).length>0,"Set available dates",()=>setTab("calendar")],
                  [!!artist.priceInfo&&artist.priceInfo!=="On request","Set your price",()=>setTab("profile")],
                ].map(([done,label,go])=>(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:10,cursor:done?"default":"pointer"}} onClick={done?undefined:go}>
                    <div style={{width:20,height:20,borderRadius:"50%",background:done?C.emeraldS:C.surface,border:`1px solid ${done?C.emerald:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>
                      {done?"✓":"→"}
                    </div>
                    <span style={{fontSize:T.xs,color:done?C.emerald:C.textD,textDecoration:done?"none":"underline"}}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {artist.status==="approved"&&artist.stripeConnected&&(
            <div style={{background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:8,fontSize:T.sm,fontFamily:"'DM Sans',sans-serif"}}>
              
              <span style={{color:C.emerald,fontWeight:700}}>Profile approved and Stripe connected</span>
              <span style={{color:C.muted,fontSize:T.xs}}>— you're ready to receive bookings</span>
            </div>
          )}
          {!artist.stripeConnected&&artist.status==="approved"&&(
            <div style={{background:"rgba(99,91,255,0.10)",border:"2px solid rgba(99,91,255,0.35)",borderRadius:12,padding:"14px 16px",marginBottom:12,fontSize:T.sm,color:C.textD,fontFamily:"'DM Sans',sans-serif",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div>
                <div style={{fontWeight:700,color:C.gold,marginBottom:3}}>💳 Connect Stripe to get paid automatically</div>
                <div style={{fontSize:T.xs,color:C.muted}}>Stripe splits payments instantly — 88% to you, 12% to Awaz</div>
              </div>
              <Btn v="gold" sz="sm" onClick={()=>setShowStripeConnect(true)}>Connect →</Btn>
            </div>
          )}
          {!artist.spotify&&!artist.instagram&&artist.status==="approved"&&(
            <div style={{background:"rgba(200,168,74,0.06)",border:`1px solid ${C.gold}28`,borderRadius:10,padding:"12px 14px",marginBottom:12,fontSize:T.sm,color:C.textD,fontFamily:"'DM Sans',sans-serif",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span><strong style={{color:C.gold}}>{t('addSocial')}</strong> — artists with social proof get 3× more views</span>
              <Btn v="ghost" sz="sm" onClick={()=>setTab("social")}>{t('addNow')}</Btn>
            </div>
          )}
          {/* ── Your Booking Link ── always visible, top of overview ── */}
          {(()=>{
            const slug=slugify(artist.name);
            const bookingUrl=`https://awazbooking.com/artist/${slug}`;
            return(
              <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:12,padding:"16px 18px",marginBottom:14}}>
                <div style={{fontSize:T.xs,fontWeight:700,color:C.gold,letterSpacing:"0.8px",textTransform:"uppercase" as const,marginBottom:10}}>🔗 Your Booking Link</div>
                <div style={{background:C.surface,borderRadius:8,padding:"9px 12px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10}}>
                  <span style={{fontSize:12,color:C.gold,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const,flex:1}}>{bookingUrl}</span>
                  <button onClick={()=>{navigator.clipboard.writeText(bookingUrl);notify("Link copied! ✓","success");}}
                    style={{background:C.gold,color:C.bg,border:"none",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                    Copy
                  </button>
                </div>
                <div style={{background:C.goldS,border:`1px solid ${C.gold}22`,borderRadius:8,padding:"10px 14px",fontSize:11,color:C.textD,lineHeight:1.7}}>
                  <strong style={{color:C.gold}}>📢 Required:</strong> Add this link to your Instagram, TikTok, and Facebook bio. Artists who promote their booking link get <strong>3× more bookings</strong>.
                  <div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap" as const}}>
                    {["📸 Instagram bio","🎵 TikTok bio","👍 Facebook page"].map(s=>(
                      <span key={s} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 9px",fontSize:10,color:C.muted}}>{s}</span>
                    ))}
                  </div>
                  <div style={{marginTop:8}}>
                    <span style={{color:C.muted}}>Suggested caption: </span>
                    <em>"Book me for your wedding or event 🎤 {bookingUrl}"</em>
                    <button onClick={()=>{navigator.clipboard.writeText(`Book me for your wedding or event 🎤 ${bookingUrl}`);notify("Caption copied!","success");}}
                      style={{marginLeft:8,background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 8px",fontSize:10,color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>Copy</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Earnings breakdown — clear and transparent ── */}
          <div style={{background:`linear-gradient(135deg,${C.goldS},${C.card})`,border:`1px solid ${C.gold}33`,borderRadius:14,padding:"18px 20px",marginBottom:16}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.gold,marginBottom:14}}>Your Earnings</div>
            {myB.filter(b=>b.depositPaid).length===0?(
              <div style={{color:C.muted,fontSize:T.sm}}>No paid bookings yet — earnings will appear here automatically after each booking.</div>
            ):(
              <>
                {myB.filter(b=>b.depositPaid).map(b=>{
                  const gross      = b.deposit;
                  const stripeFee  = Math.round(gross*0.029+30)/100; // 2.9% + €0.30
                  const awazFee    = Math.round(gross*0.12);
                  const youGet     = Math.round(gross*0.88);
                  return(
                    <div key={b.id} style={{background:C.surface,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                        <span style={{color:C.text,fontWeight:700,fontSize:T.sm}}>{b.customerName}</span>
                        <span style={{color:C.muted,fontSize:T.xs}}>{b.date}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
                        {[
                          ["Booking",`€${gross}`,C.muted],
                          ["Stripe fee",`−€${stripeFee}`,C.ruby],
                          ["Awaz (12%)",`−€${awazFee}`,C.ruby],
                          ["You receive",`€${youGet}`,C.emerald],
                        ].map(([l,v,c])=>(
                          <div key={l} style={{textAlign:"center",background:C.card,borderRadius:7,padding:"8px 4px",border:`1px solid ${C.border}`}}>
                            <div style={{color:c as string,fontWeight:800,fontSize:T.sm,fontFamily:"'Cormorant Garamond',serif"}}>{v}</div>
                            <div style={{color:C.faint,fontSize:10,marginTop:2}}>{l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div style={{background:C.emeraldS,border:`1px solid ${C.emerald}33`,borderRadius:10,padding:"12px 14px",marginTop:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{color:C.emerald,fontWeight:800,fontSize:T.sm}}>Total in your account</div>
                      <div style={{color:C.muted,fontSize:11,marginTop:2}}>Auto-transferred to your Stripe account after each booking</div>
                    </div>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.emerald,fontSize:"1.6rem"}}>€{depositsIn}</div>
                  </div>
                </div>
              </>
            )}
            {/* VAT note */}
            <div style={{marginTop:12,background:C.lapisS,border:`1px solid ${C.lapis}22`,borderRadius:8,padding:"10px 12px",fontSize:11,color:C.muted,lineHeight:1.7}}>
              <strong style={{color:C.text}}>VAT / Tax note:</strong> The deposit amount transferred to you is gross. You are responsible for reporting income and paying applicable taxes in your country of residence. Awaz does not withhold tax — consult your local tax authority.
            </div>
          </div>

          {/* ── Quick stats ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
            {[["","Bookings",myB.length,C.gold],["","Active Chats",myB.filter(b=>b.chatUnlocked).length,C.gold],["","Rating",artist.reviews>0?artist.rating:"—",C.gold],["🎵","Song Requests",0,C.gold]].map(([icon,label,value,color])=>(
              <div key={label as string} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px",borderTop:`3px solid ${C.border}38`}}>
                <div style={{fontSize:18,marginBottom:5}}>{icon}</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:800,color:color as string,lineHeight:1}}>{value}</div>
                <div style={{fontSize:T.xs,color:C.muted,marginTop:4}}>{label}</div>
              </div>
            ))}
          </div>
          {myB.length===0
            ?<div style={{textAlign:"center",padding:32,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,color:C.muted,fontSize:T.sm,fontStyle:"italic"}}>{t('noBookingsYet2')}</div>
            :myB.slice(0,4).map(b=>(
              <div key={b.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${b.status==="confirmed"?C.emerald:C.saffron}`,borderRadius:10,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,minHeight:64}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:C.text,fontWeight:600,fontSize:T.sm,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.customerName}</div>
                  <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>{b.event} · {b.date}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                  <span style={{color:C.gold,fontWeight:700,fontFamily:"'Cormorant Garamond',serif",fontSize:T.md}}>€{b.deposit}</span>
                  {b.chatUnlocked&&<button onClick={()=>setChat(b)} style={{width:36,height:36,borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,fontSize:16,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}></button>}
                </div>
              </div>
            ))}
        </div>
      )}

      {tab==="bookingreqs"&&(
        <div>
          <div style={{marginBottom:20}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>Bookingforespørsler</div>
            <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.6}}>Kunder som ønsker å booke deg. Svar med pristilbud innen 48 timer.</div>
          </div>

          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:20}}>
            {[
              {label:"Nye",      val:bookingRequests.filter(r=>r.status==="request_received"||r.status==="pending").length, color:C.saffron},
              {label:"Tilbud sendt", val:bookingRequests.filter(r=>r.status==="offered").length, color:C.lapis},
              {label:"Akseptert", val:bookingRequests.filter(r=>r.status==="accepted").length, color:C.emerald},
            ].map(({label,val,color})=>(
              <div key={label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px",textAlign:"center"}}>
                <div style={{fontSize:T.lg,fontWeight:800,color,marginBottom:2}}>{val}</div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,letterSpacing:"0.5px",textTransform:"uppercase"}}>{label}</div>
              </div>
            ))}
          </div>

          <ArtistOfferPanel
            requests={bookingRequests}
            artist={artist}
            onAction={async(id,update)=>{
              // Optimistic update
              setBookingRequests(p=>p.map(r=>r.id===id?{...r,...update}:r));
              if(!HAS_SUPA) return;
              try{
                const sb=await getSupabase();
                if(!sb) return;
                const dbUpdate:any={status:update.status};
                if(update.artistOffer!==undefined) dbUpdate.artist_offer=update.artistOffer;
                if(update.artistBalance!==undefined) dbUpdate.artist_balance=update.artistBalance;
                if(update.counterRound!==undefined) dbUpdate.counter_round=update.counterRound;
                if(update.declineReason!==undefined) dbUpdate.decline_reason=update.declineReason;
                await sb.from("booking_requests").update(dbUpdate).eq("id",id);
                notify(update.status==="declined"?"Forespørsel avslått":"Tilbud sendt!","success");
              }catch(e){console.warn("Booking request update failed:",e);}
            }}
          />
        </div>
      )}

      {tab==="calendar"&&(
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:8}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text}}>{t('availabilityTitle')}</div>
            {calSaved&&(
              <div style={{background:C.emeraldS,color:C.emerald,border:`1px solid ${C.emerald}33`,borderRadius:8,padding:"5px 12px",fontSize:T.xs,fontWeight:700}}>
                ✓ Saved
              </div>
            )}
          </div>
          <div style={{color:C.muted,fontSize:T.sm,marginBottom:16}}>Tap any date to toggle availability. Saves automatically.</div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:vp.isMobile?16:24}}>
            <MiniCal artist={artist} editMode onToggle={(mo,yr,day)=>{onToggleDay(artist.id,mo,yr,day);setCalSaved(true);setTimeout(()=>setCalSaved(false),2000);}} bookings={bookings}/>
          </div>
          <div style={{marginTop:12,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 13px",fontSize:T.xs,color:C.textD,lineHeight:1.6}}>
            <strong style={{color:artist.color}}>Tip:</strong> Mark dates as available so customers can book you.
          </div>
        </div>
      )}

      {tab==="bookings"&&(
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:14}}>My Bookings</div>
          {myB.length===0
            ?<div>
              {(!artist.genre||!artist.bio||!artist.spotify)&&(
                <div style={{background:`linear-gradient(135deg,rgba(200,168,74,0.06),${C.card})`,border:`1px solid ${C.gold}33`,borderRadius:12,padding:"18px 20px",marginBottom:12}}>
                  <div style={{fontWeight:700,color:C.gold,fontSize:T.sm,marginBottom:4}}>{t('completeProfileCta')||'Complete your profile to get bookings'}</div>
                  <div style={{color:C.muted,fontSize:T.xs,marginBottom:12}}>Artists with complete profiles get 3× more views</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {!artist.genre&&<button onClick={()=>setTab("profile")} style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:8,padding:"7px 14px",color:C.gold,fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:34}}>+ Add Genre</button>}
                    {!artist.bio&&<button onClick={()=>setTab("profile")} style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:8,padding:"7px 14px",color:C.gold,fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:34}}>+ Add Bio</button>}
                    {!artist.spotify&&<button onClick={()=>setTab("social")} style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:8,padding:"7px 14px",color:C.gold,fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:34}}>+ Add Spotify</button>}
                    <button onClick={()=>setTab("calendar")} style={{background:C.card,border:`1px solid ${C.emerald}44`,borderRadius:8,padding:"7px 14px",color:C.emerald,fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:34}}>+ Add Available Dates</button>
                  </div>
                </div>
              )}
              <div style={{textAlign:"center",padding:24,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,color:C.muted,fontSize:T.sm,fontStyle:"italic"}}>No bookings yet — add available dates to start getting discovered!</div>
            </div>
            :<div style={{display:"flex",flexDirection:"column",gap:12}}>
              {myB.map(b=>{
                const isPending=b.status==="pending"||b.status==="pending_payment";
                const sc=b.status==="confirmed"?C.emerald:b.status==="completed"?C.lapis:isPending?C.saffron:C.ruby;
                return(
                  <div key={b.id} style={{background:C.card,border:`2px solid ${isPending?C.saffron+"55":C.border}`,borderRadius:12,overflow:"hidden"}}>
                    <div style={{height:2,background:`linear-gradient(90deg,${sc},transparent)`}}/>
                    <div style={{padding:"16px"}}>
                      {/* Header */}
                      <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                        <div style={{width:42,height:42,borderRadius:10,background:C.goldS,border:`2px solid ${C.gold}28`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:C.gold,fontSize:18,flexShrink:0}}>
                          {b.customerName?.[0]?.toUpperCase()||"?"}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,color:C.text,fontSize:T.md}}>{b.customerName}</div>
                          <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>{b.customerEmail||""}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                          <Badge color={sc}>{isPending?"PENDING":b.status.replace(/_/g," ").toUpperCase()}</Badge>
                          <span style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:C.gold,fontSize:T.md}}>€{b.deposit}</span>
                        </div>
                      </div>
                      {/* Details */}
                      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:12}}>
                        {[["Date",b.date],["Event",b.event||b.eventType||"—"],["Country",b.country||"—"],["Deposit",b.depositPaid?"✓ Paid":"✗ Pending"]].map(([l,v])=>(
                          <div key={l} style={{background:C.surface,borderRadius:8,padding:"8px 10px"}}>
                            <div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>{l}</div>
                            <div style={{fontSize:T.xs,color:C.text}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {b.notes&&<div style={{fontSize:T.xs,color:C.muted,background:C.surface,borderRadius:8,padding:"8px 10px",marginBottom:12}}>{b.notes}</div>}
                      <EventPlanView bookingId={b.id} C={C} T={T}/>
                      {/* Action buttons */}
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        {isPending&&(
                          <>
                            <button
                              onClick={async()=>{
                                if(HAS_SUPA){
                                  const sb=await getSupabase();
                                  if(sb) await sb.from("bookings").update({status:"confirmed",chat_unlocked:true}).eq("id",b.id);
                                }
                                onUpdateArtist&&onUpdateArtist(artist.id,{});
                              }}
                              style={{flex:1,background:C.emerald,color:"#fff",border:"none",borderRadius:10,padding:"10px 14px",fontSize:T.sm,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:42}}>
                              ✓ Confirm
                            </button>
                            <button
                              onClick={async()=>{
                                if(HAS_SUPA){
                                  const sb=await getSupabase();
                                  if(sb) await sb.from("bookings").update({status:"cancelled"}).eq("id",b.id);
                                }
                                onUpdateArtist&&onUpdateArtist(artist.id,{});
                              }}
                              style={{flex:1,background:C.rubyS,color:C.ruby,border:`1px solid ${C.ruby}44`,borderRadius:10,padding:"10px 14px",fontSize:T.sm,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:42}}>
                              ✗ Decline
                            </button>
                          </>
                        )}
                        {b.status==="confirmed"&&(
                          <button
                            onClick={async()=>{
                              if(HAS_SUPA){
                                const sb=await getSupabase();
                                if(sb) await sb.from("bookings").update({status:"completed"}).eq("id",b.id);
                              }
                              onUpdateArtist&&onUpdateArtist(artist.id,{});
                            }}
                            style={{flex:1,background:"rgba(30,78,140,0.12)",color:C.lapis,border:`1px solid ${C.lapis}44`,borderRadius:10,padding:"10px 14px",fontSize:T.sm,fontWeight:700,cursor:"pointer",fontFamily:"inherit",minHeight:42}}>
                            ✓ Mark as Completed
                          </button>
                        )}
                        <button onClick={()=>setChat(b)} style={{width:42,height:42,borderRadius:10,background:C.surface,border:`1px solid ${C.border}`,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {b.chatUnlocked?"Chat":"Lock"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>}
        </div>
      )}

      {tab==="messages"&&(
        <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 140px)",minHeight:500}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:16}}>Messages</div>

          {/* ── Admin chat thread ── */}
          {localAdminMsgs.length > 0 ? (
            <div style={{flex:1,display:"flex",flexDirection:"column",background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
              {/* Header */}
              <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,background:C.surface}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:C.goldS,border:`2px solid ${C.gold}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👑</div>
                <div>
                  <div style={{fontWeight:700,color:C.gold,fontSize:T.sm}}>Awaz Admin</div>
                  <div style={{color:C.muted,fontSize:T.xs}}>Platform team</div>
                </div>
              </div>
              {/* Messages */}
              <div style={{flex:1,overflow:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:10}}>
                {localAdminMsgs[0]?.messages?.length > 0 ? localAdminMsgs[0].messages.map((msg,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:msg.from==="artist"?"flex-end":"flex-start"}}>
                    <div style={{
                      maxWidth:"75%",
                      background:msg.from==="artist"?`linear-gradient(135deg,${C.ruby},${C.ruby}cc)`:C.surface,
                      borderRadius:msg.from==="artist"?"14px 14px 4px 14px":"14px 14px 14px 4px",
                      padding:"10px 14px",
                      border:`1px solid ${msg.from==="artist"?C.ruby+"66":C.border}`,
                    }}>
                      <div style={{color:C.text,fontSize:T.sm,lineHeight:1.6}}>{msg.text}</div>
                      <div style={{color:C.muted,fontSize:10,marginTop:4,textAlign:"right"}}>{msg.time}</div>
                    </div>
                  </div>
                )) : (
                  <div style={{textAlign:"center",color:C.muted,fontSize:T.sm,marginTop:40}}>No messages yet</div>
                )}
              </div>
              {/* Artist reply input */}
              <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8}}>
                <input
                  value={artistReplyMsg||""}
                  onChange={e=>setArtistReplyMsg(e.target.value)}
                  onKeyDown={async e=>{
                    if(e.key==="Enter"&&(artistReplyMsg||"").trim()){
                      const text=(artistReplyMsg||"").trim();
                      setArtistReplyMsg("");
                      // Save to chat_messages table
                      if(HAS_SUPA){
                        const sb=await getSupabase();
                        if(sb){
                          await sb.from("chat_messages").insert({
                            artist_id: artist.id,
                            from_role: "artist",
                            text,
                          });
                          // Reload messages
                          setTab("overview");
                          setTimeout(()=>setTab("messages"),100);
                        }
                      }
                    }
                  }}
                  placeholder="Reply to admin..."
                  style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit"}}
                />
                <button onClick={async()=>{
                  const text=(artistReplyMsg||"").trim();
                  if(!text) return;
                  setArtistReplyMsg("");
                  if(HAS_SUPA){
                    const sb=await getSupabase();
                    if(sb){
                      await sb.from("chat_messages").insert({artist_id:artist.id,from_role:"artist",text});
                      setTab("overview");
                      setTimeout(()=>setTab("messages"),100);
                    }
                  }
                }} style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:10,padding:"10px 16px",fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:T.sm}}>→</button>
              </div>
            </div>
          ) : (
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
              {/* No admin messages — show customer chats */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"24px",textAlign:"center",color:C.muted,fontSize:T.sm}}>
                No messages yet. Admin messages will appear here.
              </div>
              {/* Customer booking chats */}
              {myB.filter(b=>b.chatUnlocked&&b.messages?.length>0).map(b=>(
                <div key={b.id} onClick={()=>setChat(b)}
                  style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",display:"flex",gap:12,alignItems:"center"}}>
                  
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{b.customerName}</div>
                    <div style={{color:C.muted,fontSize:T.xs,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.messages[b.messages.length-1]?.text}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab==="pricing"&&(
        <div>
          <CountryPricingTab artist={artist} onUpdateArtist={onUpdateArtist} vp={vp}/>
          <ArtistQRPanel artist={artist}/>

          {/* ── Artist Boost ── */}
          <div style={{marginTop:24,background:artist.isBoosted?`linear-gradient(135deg,rgba(200,168,74,0.1),${C.card})`:`linear-gradient(135deg,rgba(200,168,74,0.04),${C.card})`,border:`2px solid ${artist.isBoosted?C.gold:C.gold+"33"}`,borderRadius:16,padding:"22px 24px"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:14,flexWrap:"wrap"}}>
              
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.gold,marginBottom:6}}>
                  {artist.isBoosted?"You're Featured!":"Artist Boost"}
                </div>
                {artist.isBoosted?(
                  <div>
                    <div style={{color:C.emerald,fontWeight:700,fontSize:T.sm,marginBottom:6}}>Your profile is featured — {artist.boostedUntil?`active until ${new Date(artist.boostedUntil).toLocaleDateString()}`:'active'}d at the top of the browse page</div>
                    <div style={{color:C.muted,fontSize:T.xs,lineHeight:1.7}}>
                      Your profile appears in the Featured Artists section — visible to all visitors before the regular listing. Boosted by Awaz admin.
                    </div>
                  </div>
                ):(
                  <div>
                    <div style={{color:C.textD,fontSize:T.sm,lineHeight:1.7,marginBottom:12}}>
                      Get featured at the top of the browse page for <strong style={{color:C.gold}}>6 months</strong>. Your profile appears before all regular listings with a ⭐ Featured badge.
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                      {[["3× more profile views",""],["Top of browse page",""],["Featured badge",""],["30 days duration",""]].map(([text,icon])=>(
                        <div key={text} style={{display:"flex",alignItems:"center",gap:8,background:C.surface,borderRadius:8,padding:"8px 12px",border:`1px solid ${C.border}`}}>
                          <span style={{fontSize:16}}>{icon}</span>
                          <span style={{color:C.textD,fontSize:T.xs,fontWeight:600}}>{text}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.8rem",fontWeight:800,color:C.gold}}>€50</div>
                      <div style={{flex:1}}>
                        <button onClick={()=>setShowBoostPay(true)}
                          style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:10,padding:"12px 24px",fontWeight:800,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit",width:"100%"}}>
                          ⭐ Boost My Profile — €50
                        </button>
                        <div style={{color:C.faint,fontSize:11,marginTop:5,textAlign:"center"}}>One-time payment · 6 months featured at top of browse</div>
                        {showBoostPay&&(
                          <StripePaywall
                            amount={50}
                            emoji=""
                            label="Boost Your Profile"
                            description="Featured at top of browse page for 6 months. Highlighted with gold border."
                            metadata={{artistName:artist.name,bookingId:`boost_${artist.id}_${Date.now()}`,type:"boost"}}
                            onSuccess={async(piId)=>{
                              const boostUntil=new Date(Date.now()+180*24*60*60*1000).toISOString();
                              onUpdateArtist(artist.id,{isBoosted:true,boostedUntil:boostUntil});
                              if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("artists").update({is_boosted:true,boosted_until:boostUntil,boost_payment_id:piId}).eq("id",artist.id);}
                              notify("Profile boosted for 6 months! You're now featured.","success");
                              setShowBoostPay(false);
                            }}
                            onClose={()=>setShowBoostPay(false)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab==="songreqs"&&(
        <div>
          {/* ── Header with live stats ── */}
          <div style={{marginBottom:20}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>Song Requests</div>
            <div style={{color:C.muted,fontSize:T.sm}}>Manage live requests from your audience</div>
          </div>

          {/* ── Live stats strip ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
            {[
              {label:"Pending",    val:songRequests.filter(r=>r.status==="pending").length,  color:C.saffron},
              {label:"Accepted",   val:songRequests.filter(r=>r.status==="accepted").length, color:C.emerald},
              {label:"Completed",  val:songRequests.filter(r=>r.status==="completed").length,color:C.lapis},
              {label:"Earned",     val:`€${songRequests.filter(r=>["accepted","completed"].includes(r.status)).reduce((s,r)=>s+Math.round((r.amount||0)*0.88),0)}`,color:C.gold},
            ].map(({label,val,color})=>(
              <div key={label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px",textAlign:"center"}}>
                <div style={{fontSize:T.lg,fontWeight:800,color,marginBottom:2}}>{val}</div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,letterSpacing:"0.5px",textTransform:"uppercase"}}>{label}</div>
              </div>
            ))}
          </div>

          {/* ── Request list ── */}
          {songRequests.length===0?(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"48px 24px",textAlign:"center"}}>
              <div style={{fontSize:48,marginBottom:12}}></div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,color:C.text,marginBottom:8}}>No requests yet</div>
              <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.7}}>Share your Song Request link with your audience. Requests will appear here in real-time.</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Queue header */}
              {songRequests.filter(r=>r.status==="accepted").length>0&&(
                <div style={{background:`linear-gradient(135deg,${C.emerald}18,${C.emerald}08)`,border:`1px solid ${C.emerald}44`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                  
                  <div>
                    <div style={{fontSize:T.xs,fontWeight:700,color:C.emerald,letterSpacing:"0.6px",textTransform:"uppercase"}}>Now Playing Queue</div>
                    <div style={{fontSize:T.sm,color:C.text,marginTop:2}}>
                      {songRequests.filter(r=>r.status==="accepted").length} song(s) accepted — sing them in order, then mark as played
                    </div>
                  </div>
                </div>
              )}

              {/* Sort: pending by tip amount, then accepted (queue), then rest */}
              {[...songRequests].sort((a,b)=>{
                const order={accepted:0,pending:1,completed:2,rejected:3,refunded:4};
                if(a.status!==b.status) return (order[a.status as keyof typeof order]||0)-(order[b.status as keyof typeof order]||0);
                return (b.amount||0)-(a.amount||0); // highest tip first
              }).map((req,idx)=>{
                const isPending   = req.status==="pending";
                const isAccepted  = req.status==="accepted";
                const isCompleted = req.status==="completed";
                const isRejected  = req.status==="rejected";
                const isRefunded  = req.status==="refunded";
                const isDone      = isCompleted||isRefunded;

                const priorityColor = (req.amount||0)>=100?C.ruby:(req.amount||0)>=50?C.saffron:C.emerald;
                const priorityLabel = (req.amount||0)>=100?"MUST PLAY":(req.amount||0)>=50?"HIGH PRIORITY":"✓ Normal";

                // Queue position (only for accepted)
                const queuePos = isAccepted
                  ? [...songRequests].filter(r=>r.status==="accepted")
                      .sort((a,b)=>(b.amount||0)-(a.amount||0))
                      .findIndex(r=>r.id===req.id)+1
                  : null;

                return(
                  <div key={req.id} style={{
                    background:C.card,
                    border:`1px solid ${isAccepted?C.emerald+"55":isPending?priorityColor+"44":C.border}`,
                    borderLeft:`4px solid ${isAccepted?C.emerald:isPending?priorityColor:isDone?C.faint:C.border}`,
                    borderRadius:12,padding:"16px",
                    opacity:isDone?0.6:1,
                    transition:"opacity 0.3s",
                  }}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                      <div style={{flex:1,minWidth:0}}>
                        {/* Queue position badge */}
                        {queuePos&&(
                          <div style={{display:"inline-flex",alignItems:"center",gap:5,background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:6,padding:"2px 8px",marginBottom:6,fontSize:10,fontWeight:800,color:C.emerald,textTransform:"uppercase"}}>
                            #{queuePos} IN QUEUE {queuePos===1?"— SING NOW":""}
                          </div>
                        )}
                        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:2}}>
                          {req.song_title}
                        </div>
                        {req.song_artist&&(
                          <div style={{color:C.muted,fontSize:T.sm,marginBottom:6}}>by {req.song_artist}</div>
                        )}
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{color:C.textD,fontSize:T.xs}}>{req.guest_name||"Anonymous"}</span>
                          {req.message&&<span style={{color:C.muted,fontSize:T.xs}}>· "{req.message}"</span>}
                        </div>
                      </div>
                      {/* Right: amount + priority + delete */}
                      <div style={{textAlign:"right",flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:800,color:C.gold}}>€{req.amount||0}</div>
                        <div style={{fontSize:10,fontWeight:700,color:priorityColor}}>{priorityLabel}</div>
                        <div style={{fontSize:10,color:C.muted}}>You get: €{Math.round((req.amount||0)*0.88)}</div>
                        {/* Delete button — always visible */}
                        <button onClick={async()=>{
                          if(!confirm(`Delete "${req.song_title}" permanently?`)) return;
                          setSongRequests(p=>p.filter(r=>r.id!==req.id));
                          if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("song_requests").delete().eq("id",req.id);}
                        }} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:16,padding:"2px 4px",lineHeight:1}} title="Delete">
                          Del
                        </button>
                      </div>
                    </div>

                    {/* Status badge + time */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
                      <span style={{
                        background:isPending?C.saffronS:isAccepted?C.emeraldS:isCompleted?C.lapisS:C.rubyS,
                        color:isPending?C.saffron:isAccepted?C.emerald:isCompleted?C.lapis:C.ruby,
                        border:`1px solid ${isPending?C.saffron+"44":isAccepted?C.emerald+"44":isCompleted?C.lapis+"44":C.ruby+"44"}`,
                        borderRadius:20,fontSize:10,fontWeight:700,padding:"3px 10px",textTransform:"uppercase",letterSpacing:"0.5px",
                      }}>{req.status}</span>
                      <span style={{color:C.faint,fontSize:11}}>
                        {new Date(req.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                      </span>
                    </div>

                    {/* PENDING: Accept / Decline */}
                    {isPending&&(
                      <div style={{display:"flex",gap:8,marginTop:12}}>
                        <button onClick={async()=>{
                          setSongRequests(p=>p.map(r=>r.id===req.id?{...r,status:"accepted"}:r));
                          notify(`Added to queue: "${req.song_title}"`,"success");
                          if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("song_requests").update({status:"accepted",accepted_at:new Date().toISOString()}).eq("id",req.id);}
                        }} style={{flex:1,background:C.emerald,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontWeight:700,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
                          ✓ Accept & Queue
                        </button>
                        <button onClick={async()=>{
                          setSongRequests(p=>p.map(r=>r.id===req.id?{...r,status:"rejected"}:r));
                          notify(`Declined: "${req.song_title}"`,"info");
                          if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("song_requests").update({status:"rejected"}).eq("id",req.id);}
                        }} style={{flex:1,background:C.rubyS,color:C.ruby,border:`1px solid ${C.ruby}44`,borderRadius:8,padding:"11px",fontWeight:700,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
                          ✗ Decline
                        </button>
                      </div>
                    )}

                    {/* ACCEPTED (in queue): Mark as Played → auto-removes */}
                    {isAccepted&&(
                      <button onClick={async()=>{
                        notify(`"${req.song_title}" played! Removed from queue.`,"success");
                        // Remove immediately from UI (auto-clean)
                        setSongRequests(p=>p.filter(r=>r.id!==req.id));
                        if(HAS_SUPA){
                          const sb=await getSupabase();
                          if(sb) await sb.from("song_requests").delete().eq("id",req.id);
                        }
                      }} style={{width:"100%",marginTop:10,background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:8,padding:"11px",fontWeight:800,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
                        Played — Remove from Queue
                      </button>
                    )}

                    {/* REJECTED: Refund or Delete */}
                    {isRejected&&(
                      <div style={{display:"flex",gap:8,marginTop:10}}>
                        <button onClick={async()=>{
                          if(!confirm("Refund this payment to the guest?")) return;
                          setSongRequests(p=>p.map(r=>r.id===req.id?{...r,status:"refunded"}:r));
                          notify("Refund initiated — guest will receive payment back","info");
                          if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("song_requests").update({status:"refunded"}).eq("id",req.id);}
                        }} style={{flex:1,background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px",fontWeight:600,fontSize:T.xs,cursor:"pointer",fontFamily:"inherit"}}>
                          ↩ Refund Guest
                        </button>
                        <button onClick={async()=>{
                          setSongRequests(p=>p.filter(r=>r.id!==req.id));
                          if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("song_requests").delete().eq("id",req.id);}
                        }} style={{background:C.rubyS,color:C.ruby,border:`1px solid ${C.ruby}44`,borderRadius:8,padding:"9px 14px",fontWeight:600,fontSize:T.xs,cursor:"pointer",fontFamily:"inherit"}}>
                          Delete
                        </button>
                      </div>
                    )}

                    {/* COMPLETED/REFUNDED: just show delete */}
                    {isDone&&(
                      <button onClick={async()=>{
                        setSongRequests(p=>p.filter(r=>r.id!==req.id));
                        if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("song_requests").delete().eq("id",req.id);}
                      }} style={{width:"100%",marginTop:10,background:"transparent",color:C.faint,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px",fontWeight:600,fontSize:T.xs,cursor:"pointer",fontFamily:"inherit"}}>
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Clear completed button at bottom */}
              {songRequests.some(r=>["completed","rejected","refunded"].includes(r.status))&&(
                <button onClick={async()=>{
                  const toDelete = songRequests.filter(r=>["completed","rejected","refunded"].includes(r.status));
                  setSongRequests(p=>p.filter(r=>!["completed","rejected","refunded"].includes(r.status)));
                  if(HAS_SUPA){
                    const sb=await getSupabase();
                    if(sb) for(const r of toDelete) await sb.from("song_requests").delete().eq("id",r.id);
                  }
                  notify("Cleared completed requests","success");
                }} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px",color:C.muted,fontWeight:600,fontSize:T.xs,cursor:"pointer",fontFamily:"inherit",width:"100%"}}>
                  Clear All Completed / Rejected / Refunded
                </button>
              )}
            </div>
          )}
        </div>
      )}

            {tab==="band"&&(
              <div>
                <div style={{marginBottom:20}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text}}>{t('myBandTitle')}</div>
                  <div style={{color:C.muted,fontSize:T.sm,marginTop:4,lineHeight:1.6}}>
                    {t('myBandDesc')}
                  </div>
                </div>

                {/* Current members */}
                {bandMembers.length>0&&(
                  <div style={{marginBottom:20}}>
                    <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase" as const,marginBottom:10}}>{t('myBandCurrentMembers')}</div>
                    {bandMembers.map((m,i)=>{
                      const roleIcons:Record<string,string>={Tabla:"🥁",Rubab:"🪕",Drums:"🎶",Keyboard:"🎹",Guitar:"🎸",Harmonium:"🎵",Vocalist:"🎤"};
                      return(
                        <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:20}}>{roleIcons[m.role]||"🎵"}</span>
                            <div>
                              <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{m.name||m.role}</div>
                              <div style={{fontSize:11,color:C.muted}}>{m.role} · €{m.price}/session</div>
                            </div>
                          </div>
                          <button onClick={()=>setBandMembers(p=>p.filter((_,j)=>j!==i))}
                            style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:7,padding:"5px 10px",cursor:"pointer",color:C.ruby,fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
                            Remove
                          </button>
                        </div>
                      );
                    })}
                    {/* Band total */}
                    <div style={{background:C.goldS,border:`1px solid ${C.gold}33`,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontSize:T.xs,color:C.muted}}>Combined deposit (you + band)</div>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.gold,fontSize:T.lg}}>
                        €{(artist.deposit||0)+bandMembers.reduce((s,m)=>s+m.price,0)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Add new member */}
                <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px",marginBottom:16}}>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:12,textTransform:"uppercase" as const,letterSpacing:"0.8px"}}>{t('myBandAddMember')}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div>
                      <div style={{fontSize:T.xs,color:C.muted,marginBottom:4,fontWeight:600}}>Role</div>
                      <select value={newMember.role} onChange={e=>setNewMember(p=>({...p,role:e.target.value}))}
                        style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:T.xs,fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
                        {["Tabla","Rubab","Drums","Keyboard","Guitar","Harmonium","Vocalist"].map(r=>(
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:T.xs,color:C.muted,marginBottom:4,fontWeight:600}}>Price (€/session)</div>
                      <input type="number" min={50} max={500} value={newMember.price}
                        onChange={e=>setNewMember(p=>({...p,price:parseInt(e.target.value)||50}))}
                        style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:T.xs,fontFamily:"inherit",outline:"none",boxSizing:"border-box" as const}}/>
                    </div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:T.xs,color:C.muted,marginBottom:4,fontWeight:600}}>Name (optional)</div>
                    <input placeholder="e.g. Ahmad Karimi or leave blank" value={newMember.name}
                      onChange={e=>setNewMember(p=>({...p,name:e.target.value}))}
                      style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:T.xs,fontFamily:"inherit",outline:"none",boxSizing:"border-box" as const}}/>
                  </div>
                  <button onClick={()=>{
                    setBandMembers(p=>[...p,{...newMember}]);
                    setNewMember({role:"Tabla",name:"",price:100});
                    setBandSaved(false);
                  }} style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:"#fff",border:"none",borderRadius:8,padding:"10px 18px",fontWeight:700,fontSize:T.xs,cursor:"pointer",fontFamily:"inherit"}}>
                    + {t('myBandAddMember')}
                  </button>
                </div>

                {/* Save */}
                <button onClick={async()=>{
                  onUpdateArtist(artist.id,{bandMembers});
                  if(HAS_SUPA){
                    try{const sb=await getSupabase();if(sb)await sb.from("artists").update({band_members:bandMembers}).eq("id",artist.id);}catch{}
                  }
                  setBandSaved(true);
                  notify(t('myBandSaved'),"success");
                  setTimeout(()=>setBandSaved(false),2500);
                }} style={{width:"100%",background:bandSaved?C.emerald:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:bandSaved?"#fff":C.bg,border:"none",borderRadius:10,padding:"14px",fontWeight:800,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit",transition:"background 0.3s"}}>
                  {bandSaved?t('myBandSaved'):t('myBandSaveBtn')}
                </button>

                <div style={{marginTop:12,background:C.lapisS,border:`1px solid ${C.lapis}22`,borderRadius:8,padding:"10px 14px",fontSize:11,color:C.muted,lineHeight:1.7}}>
                  {t('myBandTip')}
                </div>
              </div>
            )}

            {tab==="settings"&&(
        <div>
          <div style={{marginBottom:20}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text}}>{t('settings')||"Settings"}</div>
            <div style={{color:C.muted,fontSize:T.sm,marginTop:4}}>Manage your account</div>
          </div>

          {/* ── Quick links to edit profile ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            {[
              {icon:"",label:t('editProfile')||"Edit Profile",go:"profile"},
              {icon:"",label:t('editPricing')||"Pricing",go:"pricing"},
              {icon:"",label:t('editSocial')||"Social Media",go:"social"},
              {icon:"",label:t('editCalendar')||"Calendar",go:"calendar"},
            ].map(({icon,label,go})=>(
              <button key={go} onClick={()=>setTab(go)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",textAlign:"left",transition:"border-color 0.15s",fontFamily:"inherit"}}
                onMouseEnter={e=>(e.currentTarget.style.borderColor=C.gold)}
                onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>
                <span style={{fontSize:20}}>{icon}</span>
                <span style={{fontSize:T.sm,fontWeight:600,color:C.text}}>{label}</span>
              </button>
            ))}
          </div>

          {/* ── Notification toggle ── */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontWeight:600,color:C.text,fontSize:T.sm,marginBottom:2}}>Browser Notifications</div>
              <div style={{color:C.muted,fontSize:T.xs}}>Get notified of new bookings and messages</div>
            </div>
            <button onClick={()=>requestPushPermission().then(ok=>notify(ok?"Notifications enabled!":" Please allow notifications in your browser","success"))}
              style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 14px",color:C.text,fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              Enable
            </button>
          </div>

          {/* ── Status ── */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",marginBottom:16}}>
            <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:14}}>{t('accountStatus')||"Account Status"}</div>
            {[
              [t('artistName')||"Artist Name",   artist.name],
              [t('genre')||"Genre",              artist.genre||"—"],
              [t('location')||"Location",        artist.location||"—"],
              [t('currency')||"Currency",        artist.currency||"EUR"],
              [t('status')||"Status",            artist.status==="approved"?`✓ ${t('approved')||"Approved"}`:`${t('pendingApproval')||"Pending Approval"}`],
              ["Bank / Stripe",     artist.stripeConnected
                  ? `✓ Connected · ${artist.stripeAccount?.startsWith("acct_")?artist.stripeAccount.slice(0,12)+"…":"Active"}`
                  : artist.iban
                  ? `IBAN: ${(artist.iban||"").slice(0,4)} •••• ${(artist.iban||"").slice(-4)}`
                  : "Not connected"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`,fontSize:T.sm}}>
                <span style={{color:C.muted}}>{k}</span>
                <span style={{color:(v as string).startsWith("✓")?C.emerald:C.text,fontWeight:600}}>{v}</span>
              </div>
            ))}
            {/* Connect / disconnect Stripe */}
            {!artist.stripeConnected&&(
              <div style={{marginTop:12}}>
                <button onClick={()=>setShowStripeConnect(true)}
                  style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:10,padding:"12px",fontWeight:800,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit"}}>
                  💳 Connect Stripe — Get Paid Automatically →
                </button>
                <div style={{fontSize:11,color:C.muted,textAlign:"center",marginTop:6}}>
                  Stripe splits payments: 88% to you · 12% to Awaz
                </div>
              </div>
            )}
            {artist.stripeConnected&&(
              <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center",background:C.emeraldS,borderRadius:8,padding:"8px 12px"}}>
                <div style={{fontSize:T.xs,color:C.emerald,flex:1}}>✓ Stripe connected · payments split automatically</div>
                <button onClick={async()=>{
                  if(!confirm("Disconnect Stripe? You won't receive automatic payments until reconnected.")) return;
                  onUpdateArtist(artist.id,{stripeConnected:false,stripeAccount:null});
                  if(HAS_SUPA){const sb=await getSupabase();if(sb)await sb.from("artists").update({stripe_connected:false,stripe_account:null}).eq("id",artist.id);}
                  notify("Stripe disconnected","success");
                }} style={{background:C.rubyS,color:C.ruby,border:`1px solid ${C.ruby}33`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {/* ── Visibility ── */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",marginBottom:16}}>
            <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:14}}>{t('visibility')||"Visibility"}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:600,color:C.text,fontSize:T.sm,marginBottom:4}}>{t('profilePublished')||"Profile published"}</div>
                <div style={{color:C.muted,fontSize:T.xs}}>
                  {artist.status==="approved"
                    ? (artist.isHidden
                        ? <span style={{color:C.ruby,fontWeight:700}}>Hidden — not visible to clients</span>
                        : t('profileVisibleToClients')||"Your profile is visible to clients")
                    : t('pendingAdminApproval')||"Waiting for admin approval"}
                </div>
              </div>
              <button
                onClick={async()=>{
                  if(artist.status!=="approved") return;
                  const newHidden = !(artist.isHidden||false);

                  // 1. Optimistic UI update immediately
                  onUpdateArtist(artist.id, {isHidden: newHidden});

                  if(!HAS_SUPA){
                    notify(newHidden?"Profile hidden":"Profile is now live 🟢","success");
                    return;
                  }

                  try{
                    const sb = await getSupabase();
                    if(!sb) throw new Error("No DB connection");

                    // 2. Write to DB
                    const {error} = await sb
                      .from("artists")
                      .update({is_hidden: newHidden, updated_at: new Date().toISOString()})
                      .eq("id", artist.id);

                    if(error) throw new Error(error.message);

                    // 3. Read back to VERIFY it actually saved
                    const {data: verify} = await sb
                      .from("artists")
                      .select("is_hidden")
                      .eq("id", artist.id)
                      .single();

                    if(!verify || verify.is_hidden !== newHidden){
                      // DB didn't save — column may not exist yet
                      onUpdateArtist(artist.id, {isHidden: !newHidden}); // revert
                      notify("⚠️ Could not save — run the SQL migration in Supabase (see below)","error");
                      return;
                    }

                    notify(
                      newHidden ? "Profile hidden — not visible to clients" : "✅ Profile is now live and visible to clients!",
                      newHidden ? "error" : "success"
                    );
                  }catch(e:any){
                    // Revert on any error
                    onUpdateArtist(artist.id, {isHidden: !newHidden});
                    notify("Could not save visibility: " + e.message,"error");
                  }
                }}
                style={{width:48,height:26,borderRadius:13,background:artist.isHidden?C.ruby:C.emerald,position:"relative",flexShrink:0,border:"none",cursor:artist.status==="approved"?"pointer":"not-allowed",padding:0}}>
                <div style={{position:"absolute",top:3,left:artist.isHidden?"3px":"25px",width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}/>
              </button>
            </div>
          </div>

          {/* ── Help ── */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:12}}>SUPPORT</div>
            <p style={{fontSize:T.sm,color:C.muted,lineHeight:1.7,marginBottom:14}}>Send a message directly to the Awaz team — we respond within a few hours.</p>
            <SupportWidget artistId={artist.id}/>

          {/* ── GDPR Data Rights ── */}
          <GDPRTools session={session} onDeleteAccount={async()=>{
            if(HAS_SUPA){
              const sb=await getSupabase();
              if(sb){
                await sb.from("song_requests").delete().eq("artist_id",artist.id);
                await sb.from("chat_messages").delete().eq("artist_id",artist.id);
                await sb.from("bookings").delete().eq("artist_id",artist.id);
                await sb.from("reviews").delete().eq("user_id",session.id);
                await sb.from("artists").update({status:"deleted",name:"[Deleted]",bio:"",photo:null}).eq("id",artist.id);
                await sb.from("profiles").delete().eq("id",session.id);
                await sb.auth.signOut();
              }
            }
            onLogout();
          }}/>
          </div>
        </div>
      )}

      {tab==="social"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>{t('socialMedia')}</div>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,color:C.muted,lineHeight:1.7}}>
              Connect your accounts. Your public profile will show a live Spotify widget and your Instagram link.
            </div>
          </div>

          {socialErr&&(
            <div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:10,padding:"12px 14px",color:C.ruby,fontSize:T.sm,fontFamily:"'DM Sans',sans-serif",display:"flex",gap:8,alignItems:"center"}}>
              {socialErr}
            </div>
          )}
          {socialSaved&&(
            <div style={{background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:10,padding:"12px 14px",color:C.emerald,fontSize:T.sm,fontFamily:"'DM Sans',sans-serif",display:"flex",gap:8,alignItems:"center"}}>
              ✓ Saved! Social links are live on your public profile.
            </div>
          )}

          {/* ── SPOTIFY ── */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
            <div style={{height:3,background:"linear-gradient(90deg,#1DB954,#16A34A)"}}/>
            <div style={{padding:vp.isMobile?18:24}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#1DB954">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.md,fontWeight:700,color:"#1DB954"}}>Spotify</div>
                {artist.spotify&&parseSpotifyArtistId(socialF.spotifyUrl)&&<Badge color="#1DB954">Live ✓</Badge>}
              </div>

              {/* What Spotify can do */}
              <div style={{background:"rgba(29,185,84,0.06)",border:"1px solid rgba(29,185,84,0.14)",borderRadius:8,padding:"10px 12px",marginBottom:14,fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,color:"#1DB954",lineHeight:1.7}}>
                ✓ Paste your Spotify link — your photo, bio, top tracks and monthly listeners appear <strong>automatically</strong> as a live widget on your profile.
              </div>

              <Inp
                label="Spotify Artist-lenke"
                placeholder="https://open.spotify.com/artist/..."
                value={socialF.spotifyUrl}
                onChange={e=>{
                  const val=e.target.value;
                  setSocialF(f=>({...f,spotifyUrl:val}));
                  setSocialErr("");
                }}
                onBlur={()=>{ if(socialF.spotifyUrl) saveSocial(); }}
                hint={parseSpotifyArtistId(socialF.spotifyUrl)
                  ? `✓ Connected — ${parseSpotifyArtistId(socialF.spotifyUrl)}`
                  : "Paste your Spotify artist link here — preview appears automatically"}
              />

              {/* Instruction */}
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",marginTop:12}}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,fontWeight:700,color:C.text,marginBottom:6}}>{t('howToFindLink')}</div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,color:C.textD,lineHeight:1.8}}>
                  <strong style={{color:C.gold}}>{t('spotifyAppLabel')}</strong> {t('spotifyInstructions2')}<br/>
                  <strong style={{color:C.gold}}>{t('browserLabel')}</strong> {t('browserSpotifyDesc')}
                </div>
              </div>

              {/* Live preview */}
              {parseSpotifyArtistId(socialF.spotifyUrl) && (
                <div style={{marginTop:14,background:"rgba(29,185,84,0.07)",border:"1px solid rgba(29,185,84,0.25)",borderRadius:12,padding:"16px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(29,185,84,0.15)",border:"1px solid rgba(29,185,84,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>✓</div>
                    <div>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,fontWeight:700,color:"#1DB954"}}>{t('spotifyLinkRecognized')}</div>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.xs,color:C.muted,marginTop:2}}>Artist-ID: {parseSpotifyArtistId(socialF.spotifyUrl)}</div>
                    </div>
                  </div>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,color:C.textD,lineHeight:1.7,marginBottom:12}}>
                    The Spotify widget is hidden in StackBlitz/editor — this is normal. On your published Vercel site it loads automatically showing your photo, bio and top tracks.
                  </div>
                  <a href={`https://open.spotify.com/artist/${parseSpotifyArtistId(socialF.spotifyUrl)}`} target="_blank" rel="noopener noreferrer"
                    style={{display:"inline-flex",alignItems:"center",gap:7,background:"#1DB954",color:"#000",borderRadius:20,padding:"9px 18px",fontSize:13,fontWeight:700,textDecoration:"none",fontFamily:"'DM Sans',sans-serif"}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="black"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                    Verify on Spotify ↗
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ── INSTAGRAM ── */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
            <div style={{height:3,background:"linear-gradient(90deg,#833AB4,#FD1D1D,#F77737)"}}/>
            <div style={{padding:vp.isMobile?18:24}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <div style={{width:22,height:22,borderRadius:6,background:"linear-gradient(135deg,#833AB4,#FD1D1D,#F77737)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.md,fontWeight:700,background:"linear-gradient(90deg,#C084FC,#FB7185)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Instagram</div>
                {parseInstagramHandle(socialF.instagramHandle)&&<Badge color="#E1306C">Connected ✓</Badge>}
              </div>

              {/* Honest explanation */}
              <div style={{background:"rgba(225,48,108,0.06)",border:"1px solid rgba(225,48,108,0.14)",borderRadius:8,padding:"10px 12px",marginBottom:14,fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,color:"#E1306C",lineHeight:1.7}}>
                ℹ Instagram does not allow automatic data fetching without logging in from your account. Paste your profile URL or @handle — we generate the link automatically. Enter your follower count manually.
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <Inp
                  label="Instagram-profil (URL eller @handle)"
                  placeholder="https://instagram.com/ditthandlenavn  eller  @ditthandlenavn"
                  value={socialF.instagramHandle}
                  onChange={e=>{
                    setSocialF(f=>({...f,instagramHandle:e.target.value}));
                    setSocialErr("");
                  }}
                  hint={parseInstagramHandle(socialF.instagramHandle) ? `✓ ✓ Handle recognized: ${parseInstagramHandle(socialF.instagramHandle)}` : "Copy your Instagram profile URL and paste here"}
                />
                <Inp
                  label="Følgertall (valgfritt, f.eks. 89.2K)"
                  placeholder="89.2K"
                  value={socialF.instagramFollowers}
                  onChange={e=>setSocialF(f=>({...f,instagramFollowers:e.target.value}))}
                  hint="Shown on profile as social proof — update manually as needed"
                />
              </div>

              {/* Live preview */}
              {parseInstagramHandle(socialF.instagramHandle) && (
                <div style={{marginTop:14,background:"rgba(225,48,108,0.07)",border:"1px solid rgba(225,48,108,0.25)",borderRadius:12,padding:"16px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(225,48,108,0.15)",border:"1px solid rgba(225,48,108,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>✓</div>
                    <div>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,fontWeight:700,color:"#E1306C"}}>{t('instagramRecognized')}</div>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.xs,color:C.muted,marginTop:2}}>{parseInstagramHandle(socialF.instagramHandle)}{socialF.instagramFollowers?` · ${socialF.instagramFollowers} følgere`:""}</div>
                    </div>
                  </div>
                  <a href={`https://instagram.com/${parseInstagramHandle(socialF.instagramHandle).replace("@","")}`} target="_blank" rel="noopener noreferrer"
                    style={{display:"inline-flex",alignItems:"center",gap:7,background:"linear-gradient(135deg,#833AB4,#E1306C)",color:"#fff",borderRadius:20,padding:"9px 18px",fontSize:13,fontWeight:700,textDecoration:"none",fontFamily:"'DM Sans',sans-serif"}}>
                    Verify on Instagram ↗
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Save */}
          <Btn v="gold" sz="lg" onClick={saveSocial} xs={{width:"100%"}}>
            {socialSaved?"✓ Saved!":"Save social profiles"}
          </Btn>

          {/* ── YOUTUBE ── */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
            <div style={{height:3,background:"linear-gradient(90deg,#FF0000,#CC0000)"}}/>
            <div style={{padding:vp.isMobile?18:24}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <svg width="22" height="16" viewBox="0 0 20 14" fill="#FF0000">
                  <path d="M19.582 2.186A2.506 2.506 0 0 0 17.82.422C16.254 0 10 0 10 0S3.746 0 2.18.422A2.506 2.506 0 0 0 .418 2.186C0 3.754 0 7 0 7s0 3.246.418 4.814A2.506 2.506 0 0 0 2.18 13.578C3.746 14 10 14 10 14s6.254 0 7.82-.422a2.506 2.506 0 0 0 1.762-1.764C20 10.246 20 7 20 7s0-3.246-.418-4.814zM8 10V4l5.333 3L8 10z"/>
                </svg>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.md,fontWeight:700,color:"#FF4444"}}>YouTube</div>
                {artist.youtube&&<Badge color="#FF4444">Connected ✓</Badge>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <Inp
                  label="YouTube-kanal eller video-URL"
                  placeholder="https://youtube.com/@dittkanalnavn  eller  youtube.com/watch?v=..."
                  value={socialF.youtubeUrl}
                  onChange={e=>{ setSocialF(f=>({...f,youtubeUrl:e.target.value})); setSocialErr(""); }}
                  hint={parseYouTubeId(socialF.youtubeUrl)
                    ? `✓ Gjenkjent: ${parseYouTubeId(socialF.youtubeUrl)?.type} — ${parseYouTubeId(socialF.youtubeUrl)?.id||parseYouTubeId(socialF.youtubeUrl)?.url}`
                    : "Copy the YouTube link and paste here"}
                />
                <Inp
                  label="Subscribers (optional, e.g. 48K)"
                  placeholder="48K"
                  value={socialF.youtubeSubscribers}
                  onChange={e=>setSocialF(f=>({...f,youtubeSubscribers:e.target.value}))}
                  hint="Shown as social proof on profile"
                />
              </div>
            </div>
          </div>

          {/* ── TIKTOK ── */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
            <div style={{height:3,background:"linear-gradient(90deg,#69C9D0,#EE1D52)"}}/>
            <div style={{padding:vp.isMobile?18:24}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{width:22,height:22,borderRadius:5,background:"#000",border:"1px solid #333",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>♪</div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.md,fontWeight:700,color:C.text}}>TikTok</div>
                {artist.tiktok&&<Badge color="#69C9D0">Connected ✓</Badge>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <Inp
                  label="TikTok @handle eller profil-URL"
                  placeholder="@ditthandlenavn  eller  tiktok.com/@handlenavn"
                  value={socialF.tiktokHandle}
                  onChange={e=>{ setSocialF(f=>({...f,tiktokHandle:e.target.value})); setSocialErr(""); }}
                  hint={parseTikTokHandle(socialF.tiktokHandle) ? `✓ Handle: ${parseTikTokHandle(socialF.tiktokHandle)}` : "Paste your TikTok profile link"}
                />
                <Inp
                  label="Followers (optional, e.g. 120K)"
                  placeholder="120K"
                  value={socialF.tiktokFollowers}
                  onChange={e=>setSocialF(f=>({...f,tiktokFollowers:e.target.value}))}
                />
              </div>
            </div>
          </div>

          <Btn v="gold" sz="lg" onClick={saveSocial} xs={{width:"100%"}}>
            {socialSaved?"✓ Saved!":"Save all social profiles"}
          </Btn>

          {(artist.spotify||artist.instagram||artist.youtube||artist.tiktok)&&(
            <button onClick={()=>{
              setSocialF({spotifyUrl:"",spotifyListeners:"",spotifyTrack1:"",spotifyTrack2:"",spotifyTrack3:"",instagramHandle:"",instagramFollowers:"",instagramUrl:"",youtubeUrl:"",youtubeSubscribers:"",tiktokHandle:"",tiktokFollowers:""});
              onUpdateArtist(artist.id,{spotify:null,instagram:null,youtube:null,tiktok:null});
              setSocialSaved(false);
            }} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:T.sm,fontFamily:"inherit",textDecoration:"underline",padding:0,minHeight:36}}>
              Remove all social accounts
            </button>
          )}
        </div>
        )}

      {tab==="profile"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text}}>{t('myProfile2')}</div>
            <Btn v="ghost" sz="sm" onClick={()=>setEditing(!editing)}>{editing?"Cancel":"Edit"}</Btn>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
            <div style={{height:3,background:`linear-gradient(90deg,${artist.color},${C.gold})`}}/>
            <div style={{padding:vp.isMobile?16:24}}>
              <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:16}}>
                <div>
                  <PhotoUpload photo={artist.photo} onPhoto={p=>onUpdateArtist(artist.id,{photo:p})} color={artist.color} emoji={artist.emoji} size={vp.isMobile?72:88} artistId={artist.id}/>
                  <div style={{textAlign:"center",marginTop:5,fontSize:T.xs,color:C.muted}}>{t('tapToChange')}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text}}>{artist.name}</div>
                  {artist.nameDari&&<div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:T.sm,color:C.gold,marginTop:2}}>{artist.nameDari}</div>}
                  <div style={{color:C.gold,fontSize:T.xs,marginTop:4}}>{artist.genre}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:8}}>
                    {artist.tags.map(t=><Badge key={t} color={C.muted}>{t}</Badge>)}
                  </div>
                </div>
              </div>

              {editing?(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {/* Personal info — easy to change */}
                  <div style={{background:C.surface,borderRadius:10,padding:"14px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:T.xs,fontWeight:700,color:C.gold,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Personal Information</div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      <Inp label="Full Name" value={editF.name} onChange={e=>setEditF(f=>({...f,name:e.target.value}))} placeholder="Your full name"/>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        <div style={{flex:1,minWidth:180}}>
                          <Inp label="Email Address" type="email" value={editF.email} onChange={e=>setEditF(f=>({...f,email:e.target.value}))} placeholder="your@email.com"/>
                        </div>
                        <div style={{flex:1,minWidth:140}}>
                          <Inp label="Phone Number" type="tel" value={editF.phone} onChange={e=>setEditF(f=>({...f,phone:e.target.value}))} placeholder="+47 900 00 000"/>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Genres — multi-select */}
                  <div style={{background:C.surface,borderRadius:10,padding:"14px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:T.xs,fontWeight:700,color:C.gold,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8}}>Music Genres (select all that apply)</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                      {["Ghazal","Herati","Mast","Pashto","Logari","Qarsak","Rubab","Tabla","Classical","Folk","Pop","Fusion","Sufi","Wedding","Eid","Cultural"].map(g=>{
                        const sel=editF.genres.split(",").map(x=>x.trim()).includes(g);
                        return(
                          <button key={g} onClick={()=>{
                            const cur=editF.genres.split(",").map(x=>x.trim()).filter(Boolean);
                            const next=sel?cur.filter(x=>x!==g):[...cur,g];
                            setEditF(f=>({...f,genres:next.join(", ")}));
                          }} style={{background:sel?C.goldS:C.card,color:sel?C.gold:C.muted,border:`1px solid ${sel?C.gold+"55":C.border}`,borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:sel?700:400,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                            {g}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{fontSize:11,color:C.muted}}>Selected: {editF.genres||"None"}</div>
                  </div>
                  {/* Performing countries */}
                  <div style={{background:C.surface,borderRadius:10,padding:"14px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:T.xs,fontWeight:700,color:C.gold,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8}}>Performing In (countries)</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                      {MARKETS.filter(m=>m.code!=="OTHER").map(m=>{
                        const cur=editF.performingCountries.split(",").map(x=>x.trim()).filter(Boolean);
                        const sel=cur.includes(m.code);
                        return(
                          <button key={m.code} onClick={()=>{
                            const next=sel?cur.filter(x=>x!==m.code):[...cur,m.code];
                            setEditF(f=>({...f,performingCountries:next.join(", ")}));
                          }} style={{background:sel?C.lapisS:C.card,color:sel?C.lapis:C.muted,border:`1px solid ${sel?C.lapis+"44":C.border}`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:sel?700:400,cursor:"pointer",fontFamily:"inherit"}}>
                            {m.flag} {m.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Pricing */}
                  <div style={{background:C.surface,borderRadius:10,padding:"14px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:T.xs,fontWeight:700,color:C.gold,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Pricing</div>
                    <Inp label="Bio" value={editF.bio} onChange={e=>setEditF(f=>({...f,bio:e.target.value}))} rows={3} placeholder="Tell clients about yourself…"/>
                    <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                      <Inp label="Starting Price" value={editF.priceInfo} onChange={e=>setEditF(f=>({...f,priceInfo:e.target.value}))} placeholder="From €2,500"/>
                      <Inp label={artist.artistType==="vocalist"?"🎤 Solo deposit (min €500)":"Deposit (min €500)"} type="number" value={editF.deposit} onChange={e=>setEditF(f=>({...f,deposit:String(Math.max(500,parseInt(e.target.value)||500))}))}/>
                    </div>
                    {artist.artistType==="vocalist"&&(
                      <div style={{background:C.lapisS,border:`1px solid ${C.lapis}33`,borderRadius:10,padding:"12px 14px",marginTop:10}}>
                        <div style={{fontSize:T.xs,fontWeight:700,color:C.lapis,marginBottom:6}}>🎼 With-band deposit (min €800)</div>
                        <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Set a higher price when you perform with your full band</div>
                        <Inp label="" type="number" value={editF.depositWithBand} onChange={e=>setEditF(f=>({...f,depositWithBand:String(Math.max(800,parseInt(e.target.value)||800))}))}/>
                        <div style={{fontSize:11,color:C.muted,marginTop:4}}>Customers see both prices and choose when booking</div>
                      </div>
                    )}
                    <Sel label="Cancellation Policy" value={editF.cancellationPolicy} onChange={e=>setEditF(f=>({...f,cancellationPolicy:e.target.value}))}
                      options={POLICIES.map(p=>[p.id,`${p.label} — ${p.desc}`])}/>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <Btn v="ghost" onClick={()=>setEditing(false)} xs={{flex:1}}>Cancel</Btn>
                    <Btn onClick={saveEdit} xs={{flex:2}} loading={saving}>{saving?"Saving…":"Save All Changes ✓"}</Btn>
                  </div>
                  {saveSuccess&&<div style={{background:C.emeraldS,border:`1px solid ${C.emerald}33`,borderRadius:8,padding:"10px 14px",color:C.emerald,fontSize:T.xs,textAlign:"center"}}>✅ Profile saved successfully!</div>}
                </div>
              ):(
                <>
                  <p style={{color:C.text,fontSize:T.sm,lineHeight:1.85,marginBottom:14,fontFamily:"'DM Sans',sans-serif",fontWeight:450}}>{artist.bio}</p>
                  <HR color={artist.color}/>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:12}}>
                    <span style={{color:C.muted,fontSize:T.xs}}>{t('stripeLabel')}</span>
                    {artist.stripeConnected?<Badge color={C.emerald}>✓ Connected</Badge>:<><Badge color={C.ruby}>{t('notConnected')}</Badge><Btn v="stripe" sz="sm" onClick={()=>setShowStripeConnect(true)} xs={{marginLeft:4}}>Connect →</Btn></>}
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:14}}>
                    <span style={{color:C.muted,fontSize:T.xs}}>{t('depositLabel2')}</span>
                    <Badge color={C.gold}>€{artist.deposit}</Badge>
                    <span style={{color:C.muted,fontSize:T.xs}}>·</span>
                    <span style={{color:C.muted,fontSize:T.xs}}>{t('policyLabel')}</span>
                    <Badge color={C.lapis}>{POLICIES.find(p=>p.id===artist.cancellationPolicy)?.label}</Badge>
                  </div>
                  <div style={{background:C.surface,borderRadius:8,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:T.xs,color:C.muted,letterSpacing:"0.8px",marginBottom:7,fontWeight:700}}>{t('paymentModel')}</div>
                    <div style={{fontSize:T.sm,color:C.textD,lineHeight:1.8}}>{t("youReceive")} <strong style={{color:C.text}}>€{Math.round(artist.deposit*0.88)}</strong> {t("from")} €{artist.deposit} {t("depositLabel")} (88%). {t("balanceCashNote")}.</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (vp.isMobile) return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:88}}>
      <div style={{height:2,background:`linear-gradient(90deg,${artist.color}88,${C.gold}88,${artist.color}88)`,position:"fixed",top:0,left:0,right:0,zIndex:300}}/>
      <div style={{position:"fixed",top:3,left:0,right:0,zIndex:200,background:`${C.surface}F8`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.border}`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {artist.photo?<img src={artist.photo} alt="" style={{width:32,height:32,borderRadius:7,objectFit:"cover"}}/>:<div style={{width:32,height:32,borderRadius:7,background:`${artist.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{artist.emoji}</div>}
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.sm,fontWeight:700,color:C.text}}>{artist.name}</div>
            <div style={{fontSize:9,color:artist.color,textTransform:"uppercase",fontWeight:700}}>{t('artistPortal')}</div>
          </div>
        </div>
        <Btn v="ghost" sz="sm" onClick={onLogout}>{t('signOut')}</Btn>
      </div>
      <div style={{paddingTop:68}}>{content}</div>
      <BottomNav active={tab} onNav={setTab} items={navItems}/>
      {chat&&<Chat booking={chat} artist={artist} myRole="artist" onClose={()=>setChat(null)} onSend={onMsg}/>}
      {showStripeConnect&&(
        <StripeConnectSheet artist={artist} onConnected={u=>{onUpdateArtist(artist.id,u);setShowStripeConnect(false);}} onClose={()=>setShowStripeConnect(false)}/>
      )}
    </div>
  );



  // Load song requests for this artist
  React.useEffect(()=>{
    if(!HAS_SUPA) return;
    getSupabase().then(async sb=>{
      if(!sb) return;
      const {data}=await sb.from("song_requests")
        .select("*")
        .eq("artist_id", artist.id)
        .order("created_at",{ascending:false});
      if(data){
        const prevPending = songRequests.filter(r=>r.status==="pending").length;
        const newPending  = data.filter(r=>r.status==="pending").length;
        if(newPending > prevPending){
          notify(`${newPending - prevPending} new song request(s)!`,"message");
          sendBrowserNotif("New Song Request","Someone wants to hear a song live!");
        }
        setSongRequests(data);
      }
    });
  },[artist.id]);


  // ── TRUE REALTIME: Supabase subscription for song requests ──────────────
  React.useEffect(()=>{
    if(!HAS_SUPA) return;
    let channel:any = null;
    getSupabase().then(sb=>{
      if(!sb) return;
      channel = sb
        .channel(`song_requests_${artist.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "song_requests",
          filter: `artist_id=eq.${artist.id}`,
        }, (payload:any) => {
          if(payload.eventType === "INSERT"){
            const newReq = payload.new;
            setSongRequests(p => [newReq, ...p]);
            notify(`New song request: "${newReq.song_title}"`, "message");
            sendBrowserNotif("New Song Request — Awaz",
              `"${newReq.song_title}" from ${newReq.guest_name}`);
          } else if(payload.eventType === "UPDATE"){
            setSongRequests(p => p.map(r => r.id===payload.new.id ? payload.new : r));
          } else if(payload.eventType === "DELETE"){
            setSongRequests(p => p.filter(r => r.id!==payload.old.id));
          }
        })
        .subscribe();
    });
    return ()=>{ if(channel) channel.unsubscribe(); };
  },[artist.id]);
  // ── Poll every 3s as backup to realtime subscription ────────────────
  React.useEffect(()=>{
    if(!HAS_SUPA) return;
    const poll=setInterval(async()=>{
      const sb=await getSupabase();
      if(!sb) return;
      const {data}=await sb.from("song_requests")
        .select("*").eq("artist_id",artist.id)
        .in("status",["pending","accepted"])
        .order("created_at",{ascending:false});
      if(data){
        const cur=songRequests.filter(r=>r.status==="pending").length;
        const incoming=data.filter(r=>r.status==="pending").length;
        if(incoming > cur){
          notify(`${incoming-cur} new song request(s)!`,"message");
          sendBrowserNotif("New Song Request — Awaz","Check your Requests tab!");
        }
        // Merge: keep local state for statuses not in poll (completed/etc)
        setSongRequests(prev=>{
          const polledIds=new Set(data.map((r:any)=>r.id));
          const kept=prev.filter(r=>!polledIds.has(r.id));
          return [...data,...kept];
        });
      }
    },3000);
    return ()=>clearInterval(poll);
  },[artist.id]);
  // Load messages from chat_messages table when Messages tab opens
  React.useEffect(()=>{
    if(tab !== "messages" || !HAS_SUPA) return;
    let cancelled = false;

    const load = async () => {
      const sb = await getSupabase();
      if(!sb || cancelled) return;

      const {data, error} = await sb
        .from("chat_messages")
        .select("*")
        .eq("artist_id", artist.id)
        .order("created_at", {ascending: true});

      if(cancelled) return;
      if(error){ console.warn("Chat load error:", error.message); return; }
      if(!data?.length){ setLocalAdminMsgs([]); return; }
      // Notify artist of new admin messages
      const adminMsgCount = data.reduce((s,r)=>s+1,0);
      if(adminMsgCount>0) notify(`${adminMsgCount} message${adminMsgCount>1?'s':''} from Awaz team`,'message');

      // Group all messages into one "conversation"
      const msgs = data.map(r=>({
        from:r.from_role,
        text:r.text,
        time:new Date(r.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
      }));

      setLocalAdminMsgs([{
        id:          "admin-chat-"+artist.id,
        artistId:    artist.id,
        customerName:"Awaz Admin",
        customerEmail:"admin@awaz.no",
        date:        "",
        event:       "Messages from Awaz",
        deposit:     0,
        status:      "admin_chat",
        depositPaid: false,
        chatUnlocked:true,
        messages:    msgs,
        country:     "",
      }]);
    };

    load();
    return ()=>{ cancelled = true; };
  },[tab, artist.id]);

  // ── REALTIME: admin chat messages ──────────────────────────────────────
  React.useEffect(()=>{
    if(!HAS_SUPA) return;
    let channel:any = null;
    getSupabase().then(sb=>{
      if(!sb) return;
      channel = sb
        .channel(`chat_${artist.id}`)
        .on("postgres_changes",{
          event:"INSERT",
          schema:"public",
          table:"chat_messages",
          filter:`artist_id=eq.${artist.id}`,
        },(payload:any)=>{
          const msg = payload.new;
          if(msg.from_role==="admin"){
            const newMsg={from:"admin",text:msg.text,time:new Date(msg.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})};
            setLocalAdminMsgs(p=>{
              if(!p.length) return [{id:"admin-chat-"+artist.id,artistId:artist.id,customerName:"Awaz Admin",customerEmail:"admin@awaz.no",date:"",event:"Messages from Awaz",deposit:0,status:"admin_chat",depositPaid:false,chatUnlocked:true,messages:[newMsg],country:""}];
              return p.map((b,i)=>i===0?{...b,messages:[...b.messages,newMsg]}:b);
            });
            notify("New message from Awaz team","message");
            sendBrowserNotif("New message from Awaz","Check your Messages tab!");
          }
        })
        .subscribe();
    });
    return ()=>{ if(channel) channel.unsubscribe(); };
  },[artist.id]);

  // Mobile bottom nav tabs (most important ones)
  const mobileNavItems=[
    {id:"overview",  icon:"🏠", label:"Home"},
    {id:"bookings",  icon:"📅", label:"Bookings", badge:pendingCount},
    {id:"messages",  icon:"💬", label:"Messages"},
    {id:"profile",   icon:"👤", label:"Profile"},
  ];

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex"}}>
      <div style={{height:2,background:`linear-gradient(90deg,${artist.color}88,${C.gold}88,${artist.color}88)`,position:"fixed",top:0,left:0,right:0,zIndex:200}}/>

      {/* ── MOBILE LAYOUT ── */}
      {vp.isMobile?(
        <>
          {/* Mobile top header */}
          <div style={{position:"fixed",top:2,left:0,right:0,zIndex:100,height:52,background:`${C.surface}F8`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {artist.photo
                ?<img src={artist.photo} alt="" style={{width:30,height:30,borderRadius:6,objectFit:"cover"}}/>
                :<div style={{width:30,height:30,borderRadius:6,background:`${artist.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{artist.emoji}</div>
              }
              <div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,fontWeight:700,color:C.text,lineHeight:1}}>{artist.name}</div>
                <div style={{fontSize:9,color:artist.color,textTransform:"uppercase",fontWeight:700}}>{t('artistPortal')}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={onToggleTheme} aria-label="Toggle theme"
                style={{width:32,height:32,borderRadius:7,background:C.surface,border:`1px solid ${C.border}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,WebkitTapHighlightColor:"transparent"}}>
                {_theme==="dark"?"☀️":"🌙"}
              </button>
              <button onClick={onLogout} style={{background:C.rubyS,border:`1px solid ${C.ruby}44`,borderRadius:7,padding:"6px 10px",color:C.ruby,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",WebkitTapHighlightColor:"transparent"}}>{t('signOut')}</button>
            </div>
          </div>

          {/* Mobile content area */}
          <div style={{flex:1,width:"100%",paddingTop:54,paddingBottom:72,overflow:"auto"}}>
            {content}
          </div>

          {/* Mobile bottom nav */}
          <nav style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:`${C.surface}F8`,backdropFilter:"blur(20px)",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"stretch",paddingBottom:"env(safe-area-inset-bottom,0px)",height:`calc(58px + env(safe-area-inset-bottom,0px))`}}>
            {mobileNavItems.map(({id,icon,label,badge})=>{
              const isActive=tab===id;
              return(
                <button key={id} onClick={()=>setTab(id)}
                  style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:"transparent",border:"none",cursor:"pointer",color:isActive?artist.color:C.muted,paddingTop:8,paddingBottom:4,minHeight:44,WebkitTapHighlightColor:"transparent",fontFamily:"inherit",position:"relative"}}>
                  {isActive&&<div style={{position:"absolute",top:0,width:24,height:2,borderRadius:1,background:artist.color}}/>}
                  {badge>0&&<div style={{position:"absolute",top:6,right:"calc(50% - 16px)",width:16,height:16,borderRadius:"50%",background:C.ruby,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1}}>{badge}</div>}
                  <div style={{fontSize:20,lineHeight:1}}>{icon}</div>
                  <div style={{fontSize:9,fontWeight:isActive?700:500}}>{label}</div>
                </button>
              );
            })}
          </nav>
        </>
      ):(
        /* ── DESKTOP LAYOUT ── */
        <>
          <div style={{width:220,background:C.surface,borderRight:`1px solid ${C.border}`,padding:"40px 0 24px",display:"flex",flexDirection:"column",position:"fixed",top:3,bottom:0,zIndex:100}}>
            <div style={{padding:"0 20px 20px",borderBottom:`1px solid ${C.border}`,marginBottom:14}}>
              {artist.photo?<img src={artist.photo} alt="" style={{width:42,height:42,borderRadius:8,objectFit:"cover",marginBottom:10}}/>:<div style={{width:42,height:42,borderRadius:8,background:`${artist.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,marginBottom:10}}>{artist.emoji}</div>}
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.sm,fontWeight:700,color:C.text}}>{artist.name}</div>
              <div style={{fontSize:T.xs,color:artist.color,textTransform:"uppercase",fontWeight:700,marginTop:2}}>{t('artistPortal')}</div>
            </div>
            {navItems.map(({id,label,badge}:{id:string,label:string,badge?:number})=>(
              <button key={id} onClick={()=>setTab(id)} style={{display:"flex",gap:10,alignItems:"center",padding:"12px 20px",background:tab===id?`${artist.color}18`:"transparent",color:tab===id?artist.color:C.muted,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:T.sm,fontWeight:tab===id?700:400,borderLeft:`3px solid ${tab===id?artist.color:"transparent"}`,width:"100%",textAlign:"left",minHeight:48,position:"relative"}}>
                {badge>0&&<div style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",width:18,height:18,borderRadius:"50%",background:C.ruby,color:"#fff",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{badge}</div>}
                {label}
              </button>
            ))}
            <div style={{marginTop:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={onToggleTheme} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 12px",color:C.muted,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,justifyContent:"center"}}>
                {_theme==="dark"?"☀️ Light mode":"🌙 Dark mode"}
              </button>
              <Btn v="ghost" sz="sm" onClick={onLogout} xs={{width:"100%"}}>{t('signOut')}</Btn>
            </div>
          </div>
          <div style={{flex:1,marginLeft:220,paddingTop:3,overflow:"auto"}}>{content}</div>
        </>
      )}

      {chat&&<Chat booking={chat} artist={artist} myRole="artist" onClose={()=>setChat(null)} onSend={onMsg}/>}
      {showStripeConnect&&<StripeConnectSheet artist={artist} onConnected={u=>{onUpdateArtist(artist.id,u);setShowStripeConnect(false);}} onClose={()=>setShowStripeConnect(false)}/>}
    </div>
  );
}

// ── Stripe Connect Sheet ───────────────────────────────────────────────
function StripeConnectSheet({ artist, onConnected, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [done, setDone]       = useState(false);

  // Handle return from Stripe onboarding
  React.useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    if(params.get("stripe")==="success"){
      onConnected({ stripeConnected:true, stripeAccount:artist.stripeAccount });
      setDone(true);
      window.history.replaceState({},"",window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const startConnect = async () => {
    setLoading(true); setError("");
    try {
      const SUPA_URL = (import.meta as any).env?.VITE_SUPABASE_URL;
      const SUPA_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
      if(!SUPA_URL||!SUPA_KEY) throw new Error("Missing environment variables");

      const res = await fetch(`${SUPA_URL}/functions/v1/stripe-connect-onboard`, {
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${SUPA_KEY}`,"apikey":SUPA_KEY},
        body:JSON.stringify({
          artistId:   artist.id,
          artistEmail:artist.email||"",
          artistName: artist.name,
          returnUrl:  window.location.origin+"/?stripe=success",
        }),
      });
      const data = await res.json();
      if(!res.ok||data.error){
        // Stripe Connect not activated on platform account
        if(data.error?.includes("signed up for Connect")||data.error?.includes("Connect")){
          throw new Error("connect_not_activated");
        }
        throw new Error(data.error||"Connection failed");
      }

      // Save account ID immediately
      if(HAS_SUPA){
        const sb=await getSupabase();
        if(sb) await sb.from("artists").update({stripe_account:data.accountId,stripe_connected:false}).eq("id",artist.id);
      }
      onConnected({stripeConnected:false,stripeAccount:data.accountId});

      // Redirect to Stripe onboarding
      window.location.href = data.url;
    } catch(e:any){
      const msg=e.message||"";
      if(msg==="connect_not_activated"){
        setError("stripe_connect_setup_needed");
      } else {
        setError(msg||"Failed to connect. Please try again.");
      }
      setLoading(false);
    }
  };

  if(done) return(
    <Sheet open title="Stripe Connected ✓" onClose={onClose}>
      <div style={{padding:"32px 20px",textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:12}}>🎉</div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:8}}>
          You're ready to get paid!
        </div>
        <div style={{color:C.textD,fontSize:T.sm,lineHeight:1.8,marginBottom:8}}>
          <strong style={{color:C.gold}}>88%</strong> of every deposit goes directly to your bank — automatically, every Monday.
        </div>
        <div style={{color:C.muted,fontSize:11,marginBottom:24}}>Awaz keeps 12% as platform fee</div>
        <Btn full v="gold" onClick={onClose}>Back to Dashboard</Btn>
      </div>
    </Sheet>
  );

  return(
    <Sheet open title="Connect Stripe Account" onClose={onClose}>
      <div style={{padding:"16px 20px 32px",display:"flex",flexDirection:"column",gap:14}}>

        {/* Benefits */}
        <div style={{background:C.goldS,border:`1px solid ${C.gold}33`,borderRadius:12,padding:"16px"}}>
          <div style={{fontWeight:700,color:C.gold,fontSize:T.sm,marginBottom:10}}>💰 How you get paid</div>
          {[
            "Customer pays deposit → Stripe splits it instantly",
            "You receive 88% directly to your bank account",
            "Awaz receives 12% automatically — no manual work",
            "Weekly payouts every Monday",
            "Free to set up — no monthly fees",
          ].map(item=>(
            <div key={item} style={{display:"flex",gap:8,marginBottom:5}}>
              <span style={{color:C.gold,flexShrink:0}}>✓</span>
              <span style={{color:C.textD,fontSize:T.sm}}>{item}</span>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div style={{background:C.surface,borderRadius:10,padding:"14px",border:`1px solid ${C.border}`,fontSize:T.xs,color:C.muted,lineHeight:1.7}}>
          <strong style={{color:C.text}}>How it works:</strong> You'll be redirected to Stripe to enter your bank details securely. Takes about 5 minutes. Once done, every booking payment is split automatically — you never have to ask for your money.
        </div>

        {error==="stripe_connect_setup_needed"?(
          <div style={{background:C.goldS,border:`1px solid ${C.gold}44`,borderRadius:12,padding:"16px"}}>
            <div style={{fontWeight:700,color:C.gold,fontSize:T.sm,marginBottom:10}}>⚙️ One-time setup needed by Awaz admin</div>
            <div style={{color:C.textD,fontSize:T.sm,lineHeight:1.8,marginBottom:12}}>
              Stripe Connect needs to be activated on the Awaz platform account before artists can connect. This is a one-time admin step.
            </div>
            <a href="https://dashboard.stripe.com/connect" target="_blank" rel="noopener noreferrer"
              style={{display:"block",background:`linear-gradient(135deg,#635BFF,#4B44CC)`,color:"#fff",borderRadius:10,padding:"12px",textAlign:"center",fontWeight:700,fontSize:T.sm,textDecoration:"none",marginBottom:8}}>
              Activate Stripe Connect (Admin only) →
            </a>
            <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>
              After activating Connect on dashboard.stripe.com/connect, come back and try again.
            </div>
            <button onClick={()=>setError("")} style={{marginTop:8,background:"none",border:"none",color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>← Try again</button>
          </div>
        ):error?(
          <div style={{background:C.rubyS,border:`1px solid ${C.ruby}33`,borderRadius:8,padding:"10px 14px",color:C.ruby,fontSize:T.sm}}>
            ⚠ {error}
            <button onClick={()=>setError("")} style={{display:"block",background:"none",border:"none",color:C.muted,fontSize:11,cursor:"pointer",marginTop:4,fontFamily:"inherit",padding:0}}>Try again</button>
          </div>
        ):null}

        <Btn full v="gold" sz="lg" loading={loading} onClick={startConnect}>
          {loading?"Connecting to Stripe…":"Connect Stripe Account →"}
        </Btn>

        <div style={{textAlign:"center",color:C.faint,fontSize:11}}>
          Secure · Powered by Stripe · PCI-DSS compliant
        </div>
      </div>
    </Sheet>
  );
}


function SongRequestModal({artist, bookingId, onClose}:{artist:any;bookingId?:string;onClose:()=>void}){
  const {show:notify}=useNotif();
  const [step,setStep]=useState<"form"|"priority"|"pay"|"done">("form");
  const [f,setF]=useState({song_title:"",song_artist:"",guest_name:"",message:""});
  const [tier,setTier]=useState(PRIORITY_TIERS[0]);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  const submit=async()=>{
    if(!f.song_title.trim()){setErr("Song title is required");return;}
    if(!f.guest_name.trim()){setErr("Your name is required");return;}
    setLoading(true);setErr("");
    try{
      if(HAS_SUPA){
        const sb=await getSupabase();
        if(sb){
          const {error}=await sb.from("song_requests").insert({
            artist_id:        artist.id,
            booking_id:       bookingId||null,
            song_title:       f.song_title.trim(),
            song_artist:      f.song_artist.trim()||null,
            guest_name:       f.guest_name.trim(),
            message:          f.message.trim()||null,
            amount:           tier.amount,
            priority_amount:  tier.amount,
            status:           "pending",
          });
          if(error){setErr("Failed to submit. Please try again.");setLoading(false);return;}
        }
      }
      setLoading(false);setStep("done");
      notify(`Request sent: "${f.song_title}"!`,"success");
    }catch(e){setLoading(false);setErr("Connection error. Please try again.");}
  };

  const vp=useViewport();

  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{
        background:C.bg,borderRadius:"24px 24px 0 0",
        border:`1px solid ${C.border}`,
        width:"100%",maxWidth:520,
        maxHeight:"92vh",overflow:"auto",
        animation:"fade 0.25s ease",
        paddingBottom:"env(safe-area-inset-bottom,16px)",
      }}>
        {/* Handle bar */}
        <div style={{width:36,height:3,borderRadius:2,background:"rgba(255,255,255,0.15)",margin:"12px auto 0"}}/>

        {step==="done"?(
          <div style={{padding:"32px 24px 40px",textAlign:"center"}}>
            
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.8rem",fontWeight:700,color:"#EDE4CE",marginBottom:8}}>Request Sent!</div>
            <div style={{color:"#8A7D68",fontSize:14,lineHeight:1.8,marginBottom:6}}>
              <strong style={{color:"#C8A84A"}}>"{f.song_title}"</strong> has been sent to <strong style={{color:"#EDE4CE"}}>{artist.name}</strong>
            </div>
            <div style={{background:"rgba(200,168,74,0.07)",border:"1px solid rgba(200,168,74,0.2)",borderRadius:12,padding:"12px 16px",marginTop:16,marginBottom:24,fontSize:13,color:"#8A7D68",lineHeight:1.7}}>
              {tier.icon} <strong style={{color:tier.color}}>{tier.label}</strong> — {tier.desc}
              <br/>You paid: <strong style={{color:"#C8A84A"}}>€{tier.amount}</strong>
            </div>
            <button onClick={onClose} style={{background:C.surface,color:"#8A7D68",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 32px",fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>Close</button>
          </div>
        ):step==="priority"?(
          <div style={{padding:"20px 20px 32px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
              <button onClick={()=>setStep("form")} style={{background:"none",border:"none",color:"#8A7D68",cursor:"pointer",padding:"4px",fontSize:18}}>←</button>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.4rem",fontWeight:700,color:"#EDE4CE"}}>Choose Priority</div>
            </div>
            <div style={{background:"rgba(200,168,74,0.05)",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#8A7D68"}}>
              Requesting: <strong style={{color:"#C8A84A"}}>"{f.song_title}"</strong>
              {f.song_artist&&<span> by {f.song_artist}</span>}
            </div>
            {/* Tip selector */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8A7D68",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Add a tip (optional)</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
                {[0,5,10,20].map(t=>(
                  <button key={t} onClick={()=>setTier({...tier,amount:t})}
                    style={{background:tier.amount===t?"rgba(200,168,74,0.15)":"rgba(255,255,255,0.03)",color:tier.amount===t?"#C8A84A":"#8A7D68",border:`1px solid ${tier.amount===t?"rgba(200,168,74,0.4)":"rgba(255,255,255,0.07)"}`,borderRadius:10,padding:"12px 4px",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700}}>
                    {t===0?"No tip":`+€${t}`}
                  </button>
                ))}
              </div>
            </div>
            {err&&<div style={{color:"#EF4444",fontSize:13,marginBottom:12,padding:"10px 14px",background:"rgba(239,68,68,0.08)",borderRadius:8}}>{err}</div>}
            <button onClick={()=>{
              if(tier.amount>0){
                setStep("pay");
              } else {
                submit();
              }
            }} disabled={loading}
              style={{width:"100%",background:loading?"#201D2E":`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:14,padding:"16px",fontWeight:800,fontSize:16,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit"}}>
              {loading?"Sending…":tier.amount===0?"Send Request (Free) →":`Pay €${tier.amount} & Request →`}
            </button>
            <div style={{color:"#8A7D68",fontSize:11,textAlign:"center",marginTop:8}}>88% of tip goes to {artist.name}</div>
          </div>
        ):(
          /* FORM STEP */
          <div style={{padding:"20px 20px 32px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.5rem",fontWeight:700,color:"#EDE4CE"}}>Request a Song</div>
                <div style={{color:"#8A7D68",fontSize:13,marginTop:2}}>from <strong style={{color:"#C8A84A"}}>{artist.name}</strong></div>
              </div>
              <button onClick={onClose} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:"#8A7D68",cursor:"pointer",padding:"6px 10px",fontSize:14}}>✕</button>
            </div>

            {/* Song fields */}
            {[
              {field:"song_title",  label:"Song Title *",   placeholder:"e.g. Bya Ke Bya"},
              {field:"song_artist", label:"Original Artist", placeholder:"e.g. Ahmad Zahir"},
              {field:"guest_name",  label:"Your Name *",    placeholder:"e.g. Layla"},
              {field:"message",     label:"Message (optional)", placeholder:"Special dedication or note…"},
            ].map(({field,label,placeholder})=>(
              <div key={field} style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#8A7D68",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6}}>{label}</div>
                <input value={(f as any)[field]} onChange={e=>setF(p=>({...p,[field]:e.target.value}))}
                  placeholder={placeholder}
                  style={{width:"100%",background:"#141220",border:"1px solid #201D2E",borderRadius:10,padding:"12px 14px",color:"#EDE4CE",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>
            ))}

            {err&&<div style={{color:"#EF4444",fontSize:13,marginBottom:12,padding:"10px 14px",background:"rgba(239,68,68,0.08)",borderRadius:8}}>{err}</div>}

            <button onClick={()=>{
              if(!f.song_title.trim()){setErr("Song title is required");return;}
              if(!f.guest_name.trim()){setErr("Your name is required");return;}
              setErr("");setStep("priority");
            }} style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:14,padding:"16px",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>
              Choose Priority → 
            </button>
            <div style={{color:"#8A7D68",fontSize:11,textAlign:"center",marginTop:8}}>Free or add a tip · 88% goes to artist</div>
          </div>
        )}

        {/* StripePaywall for paid tips */}
        {step==="pay"&&tier.amount>0&&(
          <StripePaywall
            amount={tier.amount}
            emoji=""
            label={`Request: "${f.song_title}"`}
            description={`Tip for ${artist.name} · 88% goes directly to the artist`}
            metadata={{artistName:artist.name,bookingId:`songreq_${artist.id}_${Date.now()}`,email:"",type:"tip"}}
            onSuccess={async(piId)=>{
              setLoading(true);
              try{
                if(HAS_SUPA){
                  const sb=await getSupabase();
                  if(sb) await sb.from("song_requests").insert({
                    artist_id:artist.id, booking_id:bookingId||null,
                    song_title:f.song_title.trim(), song_artist:f.song_artist.trim()||null,
                    guest_name:f.guest_name.trim(), message:f.message.trim()||null,
                    amount:tier.amount, priority_amount:tier.amount,
                    status:"pending", payment_intent_id:piId,
                  });
                }
              }catch(e){console.warn("Song req DB error:",e);}
              setLoading(false);
              setStep("done");
            }}
            onClose={()=>setStep("priority")}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 🎵 QR SONG REQUEST SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

// Generate QR code as SVG using a simple URL-based approach
// Uses api.qrserver.com (free, no API key needed)
function QRCode({url, size=200}:{url:string;size?:number}){
  const qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&bgcolor=0F0D16&color=C8A84A&margin=2&format=png&qzone=1`;
  return(
    <img src={qrUrl} alt="QR Code" width={size} height={size}
      style={{borderRadius:12,display:"block",imageRendering:"pixelated"}}/>
  );
}

// ── Song Request Landing Page (scanned from QR) ──────────────────────────
function SongRequestPage({artistId, artists, onBack}:{artistId:string;artists:any[];onBack:()=>void}){
  const artist = artists.find(a=>a.id===artistId);
  const {show:notify}=useNotif();

  // Track how many songs THIS guest has requested (stored in localStorage per artist)
  const storageKey = `awaz_req_${artistId}`;
  const [guestReqCount,setGuestReqCount]=useState(()=>{
    try{ return parseInt(localStorage.getItem(storageKey)||"0",10); }
    catch{ return 0; }
  });

  const getBasePrice=(count:number)=>count===0?0:count===1?10:20;
  const currentBase = getBasePrice(guestReqCount);

  const [step,setStep]=useState<"form"|"tip"|"done">("form");
  const [f,setF]=useState({song_title:"",song_artist:"",guest_name:"",message:""});
  const [tip,setTip]=useState(0);
  const [customTip,setCustomTip]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  const totalAmount = currentBase + tip;

  if(!artist) return(
    <div style={{minHeight:"100vh",background:"#070608",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center",color:"#8A7D68"}}>
        
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.4rem",color:"#EDE4CE"}}>Artist not found</div>
      </div>
    </div>
  );

  // ── Final submit — only called AFTER payment confirmed (or free) ──
  const saveRequest=async(piId:string|null)=>{
    setLoading(true);setErr("");
    try{
      if(HAS_SUPA){
        const sb=await getSupabase();
        if(sb){
          const{error}=await sb.from("song_requests").insert({
            artist_id:       artist.id,
            song_title:      sanitize(f.song_title.trim()),
            song_artist:     sanitize(f.song_artist.trim())||null,
            guest_name:      sanitize(f.guest_name.trim()),
            message:         sanitize(f.message.trim())||null,
            amount:          totalAmount,
            priority_amount: totalAmount,
            status:          "pending",
            payment_intent_id: piId||null,
          });
          if(error){setErr("Failed to send. Please try again.");setLoading(false);return;}
        }
      }
      const newCount=guestReqCount+1;
      setGuestReqCount(newCount);
      try{localStorage.setItem(storageKey,String(newCount));}catch{}
      setLoading(false);setStep("done");
    }catch(e){setLoading(false);setErr("Connection error. Please try again.");}
  };

  // ── showStripePaywall state — mobile-safe ──
  const [showPaywall,setShowPaywall]=useState(false);
  const effectiveTotal=currentBase+(parseInt(customTip||"0")||tip);

  // ── Stripe Paywall wrapper (renders as portal to avoid z-index issues on mobile) ──
  const PaywallPortal=showPaywall&&effectiveTotal>0?(
    <div style={{position:"fixed",inset:0,zIndex:99999,touchAction:"none"}}>
      <StripePaywall
        amount={effectiveTotal}
        emoji=""
        label={`"${f.song_title}"`}
        description={`Song request for ${artist.name} · 88% goes to artist`}
        metadata={{artistName:artist.name,bookingId:`qr_${artist.id}_${Date.now()}`,email:"",type:"tip"}}
        onSuccess={async(piId)=>{
          setShowPaywall(false);
          await saveRequest(piId);
        }}
        onClose={()=>setShowPaywall(false)}
      />
    </div>
  ):null;

  return(
    <>
    {PaywallPortal}
    <div style={{minHeight:"100vh",background:"#070608",fontFamily:"'DM Sans',sans-serif",color:"#EDE4CE",WebkitOverflowScrolling:"touch" as any}}>
      {/* Header */}
      <div style={{background:"linear-gradient(180deg,rgba(200,168,74,0.1),transparent)",borderBottom:"1px solid rgba(200,168,74,0.12)",padding:"20px 24px",display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:52,height:52,borderRadius:12,background:`${artist.color}20`,border:`2px solid ${artist.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0,overflow:"hidden"}}>
          {artist.photo?<img src={artist.photo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:artist.emoji}
        </div>
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.4rem",fontWeight:700}}>{artist.name}</div>
          <div style={{color:"#8A7D68",fontSize:13,marginTop:2}}>Song Request</div>
        </div>
        {/* Pricing info pill */}
        <div style={{marginLeft:"auto",background:"rgba(200,168,74,0.08)",border:"1px solid rgba(200,168,74,0.2)",borderRadius:20,padding:"6px 14px",fontSize:12,color:"#C8A84A",fontWeight:600,whiteSpace:"nowrap"}}>
          {guestReqCount===0?"1st: Free":guestReqCount===1?"2nd: €10":"3rd+: €20"}
        </div>
      </div>

      <div style={{maxWidth:480,margin:"0 auto",padding:"24px 20px 60px"}}>
        {/* Pricing ladder — always visible */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:24}}>
          {SONG_PRICING.map((p,i)=>{
            const isActive = guestReqCount===i || (i===2 && guestReqCount>=2);
            const isDone = guestReqCount > i && !(i===2 && guestReqCount>=2);
            return(
              <div key={i} style={{background:isActive?C.goldS:C.surface,border:`1px solid ${isActive?C.gold+"44":isDone?C.emerald+"33":C.border}`,borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:isDone?16:14,marginBottom:2}}>{isDone?"✓":p.icon}</div>
                <div style={{fontWeight:700,fontSize:13,color:isActive?C.gold:isDone?C.emerald:C.muted}}>
                  {p.base===0?"Free":`€${p.base}`}
                </div>
                <div style={{fontSize:10,color:C.faint,marginTop:1}}>{p.label}</div>
              </div>
            );
          })}
        </div>

        {step==="done"?(
          <div style={{textAlign:"center",paddingTop:20}}>
            <div style={{fontSize:72,marginBottom:12}}></div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"2rem",fontWeight:700,marginBottom:8}}>Sent!</div>
            <div style={{color:"#8A7D68",fontSize:14,lineHeight:1.8,marginBottom:4}}>
              <strong style={{color:"#C8A84A"}}>"{f.song_title}"</strong> sent to <strong style={{color:"#EDE4CE"}}>{artist.name}</strong>
            </div>
            {totalAmount>0&&(
              <div style={{background:"rgba(200,168,74,0.06)",border:"1px solid rgba(200,168,74,0.15)",borderRadius:12,padding:"14px",marginTop:16,marginBottom:20}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.8rem",color:"#C8A84A",fontWeight:800}}>€{totalAmount}</div>
                {tip>0&&<div style={{color:"#22C55E",fontSize:12,marginTop:2}}>incl. €{tip} tip — thank you!</div>}
              </div>
            )}
            {totalAmount===0&&(
              <div style={{color:"#22C55E",fontSize:14,fontWeight:700,marginTop:8,marginBottom:20}}>✓ Free request sent!</div>
            )}
            <button onClick={()=>{setStep("form");setF({song_title:"",song_artist:"",guest_name:f.guest_name,message:""});setTip(0);setCustomTip("");}}
              style={{background:"rgba(200,168,74,0.1)",color:"#C8A84A",border:"1px solid rgba(200,168,74,0.3)",borderRadius:12,padding:"12px 28px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              + Request another song {guestReqCount>=1?`(€${getBasePrice(guestReqCount)})`:""}
            </button>
          </div>

        ):step==="tip"?(
          /* TIP STEP */
          <div>
            <button onClick={()=>setStep("form")} style={{background:"none",border:"none",color:"#8A7D68",cursor:"pointer",fontSize:13,fontFamily:"inherit",marginBottom:20,display:"flex",alignItems:"center",gap:6}}>← Back</button>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.6rem",fontWeight:700,marginBottom:6}}>
              {currentBase===0?"Send Free Request":`Pay €${currentBase} + Tip`}
            </div>
            <div style={{background:"rgba(200,168,74,0.05)",border:"1px solid rgba(200,168,74,0.15)",borderRadius:10,padding:"12px 14px",marginBottom:20,fontSize:13,color:"#8A7D68"}}>
              Song: <strong style={{color:"#C8A84A"}}>"{f.song_title}"</strong>{f.song_artist&&` by ${f.song_artist}`}
            </div>

            {/* Tip selector */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8A7D68",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>
                {currentBase===0?"Add a tip? (optional)":"Add an extra tip?"}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
                {[0,5,10,20].map(t=>(
                  <button key={t} onClick={()=>{setTip(t);setCustomTip("");}}
                    style={{background:tip===t&&customTip===""?"rgba(200,168,74,0.15)":"rgba(255,255,255,0.03)",color:tip===t&&customTip===""?"#C8A84A":"#8A7D68",border:`1px solid ${tip===t&&customTip===""?"rgba(200,168,74,0.4)":"rgba(255,255,255,0.07)"}`,borderRadius:10,padding:"12px 4px",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700}}>
                    {t===0?"No tip":`+€${t}`}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:"#8A7D68",fontSize:13,whiteSpace:"nowrap"}}>Custom:</span>
                <div style={{position:"relative",flex:1}}>
                  <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#8A7D68",fontSize:14}}>€</span>
                  <input type="number" min="0" max="500" value={customTip}
                    onChange={e=>{setCustomTip(e.target.value);setTip(0);}}
                    placeholder="0"
                    style={{width:"100%",background:"#141220",border:"1px solid #201D2E",borderRadius:10,padding:"11px 14px 11px 28px",color:"#EDE4CE",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                </div>
              </div>
            </div>

            {/* Total */}
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:"#8A7D68",fontSize:12}}>Total</div>
                {currentBase>0&&<div style={{color:"#4A4054",fontSize:11}}>€{currentBase} song + €{customTip||tip} tip</div>}
              </div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"2rem",fontWeight:800,color:totalAmount+(parseInt(customTip||"0"))>0?"#C8A84A":"#22C55E"}}>
                {currentBase+(parseInt(customTip||"0")+tip)===0?"FREE":`€${currentBase+(parseInt(customTip||"0")||tip)}`}
              </div>
            </div>

            {err&&<div style={{color:"#EF4444",fontSize:13,marginBottom:12,padding:"10px 14px",background:"rgba(239,68,68,0.08)",borderRadius:8}}>{err}</div>}
            {/* KEY FIX: Open Stripe FIRST, save to DB only after successful payment */}
            <button onClick={()=>{
              const finalTip=parseInt(customTip||"0")||tip;
              const total=currentBase+finalTip;
              if(total>0){
                setShowPaywall(true); // Stripe opens → onSuccess → saveRequest()
              } else {
                submit(); // Free → save directly
              }
            }} disabled={loading}
              style={{width:"100%",background:loading?"#1A1728":`linear-gradient(135deg,#C8A84A,#E09F3E)`,color:"#07060B",border:"none",borderRadius:14,padding:"18px",fontWeight:800,fontSize:16,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit",minHeight:56,WebkitTapHighlightColor:"transparent" as any}}>
              {loading?"Sending…":(currentBase+(parseInt(customTip||"0")||tip))===0?"Send Free Request →":`Pay €${currentBase+(parseInt(customTip||"0")||tip)} & Request →`}
            </button>
            <div style={{color:"#4A4054",fontSize:11,textAlign:"center",marginTop:10}}>
              {(currentBase+(parseInt(customTip||"0")||tip))>0?"Stripe — paid before request is sent":"88% goes directly to "+artist.name}
            </div>
          </div>

        ):(
          /* FORM STEP */
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.8rem",fontWeight:700,marginBottom:4}}>Request a Song</div>
            <div style={{color:"#8A7D68",fontSize:14,marginBottom:24}}>
              {currentBase===0?"Your first song tonight is free!":`Song #${guestReqCount+1} — €${currentBase}`}
            </div>
            {[
              {field:"song_title",  label:"Song Title *",    placeholder:"e.g. Bya Ke Bya, Leili Jan…"},
              {field:"song_artist", label:"Original Artist", placeholder:"e.g. Ahmad Zahir, Farhad Darya…"},
              {field:"guest_name",  label:"Your Name *",     placeholder:"e.g. Layla, Ahmad…"},
              {field:"message",     label:"Dedication",      placeholder:"Happy birthday Noor!"},
            ].map(({field,label,placeholder})=>(
              <div key={field} style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"#8A7D68",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:7}}>{label}</div>
                {field==="message"?(
                  <textarea value={(f as any)[field]} onChange={e=>setF(p=>({...p,[field]:e.target.value}))}
                    placeholder={placeholder} rows={2}
                    style={{width:"100%",background:"#141220",border:"1px solid #201D2E",borderRadius:10,padding:"12px 14px",color:"#EDE4CE",fontSize:15,fontFamily:"inherit",outline:"none",resize:"none",lineHeight:1.6,boxSizing:"border-box"}}/>
                ):(
                  <input value={(f as any)[field]} onChange={e=>setF(p=>({...p,[field]:e.target.value}))}
                    placeholder={placeholder}
                    style={{width:"100%",background:"#141220",border:"1px solid #201D2E",borderRadius:10,padding:"13px 14px",color:"#EDE4CE",fontSize:15,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                )}
              </div>
            ))}
            {err&&<div style={{color:"#EF4444",fontSize:13,marginBottom:12,padding:"10px 14px",background:"rgba(239,68,68,0.08)",borderRadius:8}}>{err}</div>}
            <button onClick={()=>{
              if(!f.song_title.trim()){setErr("Song title is required");return;}
              if(!f.guest_name.trim()){setErr("Your name is required");return;}
              setErr("");setStep("tip");
            }} style={{width:"100%",background:`linear-gradient(135deg,#C8A84A,#E09F3E)`,color:"#07060B",border:"none",borderRadius:14,padding:"18px",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit",minHeight:56,WebkitTapHighlightColor:"transparent" as any}}>
              {currentBase===0?"Continue — Free ✓ →":"Continue →"}
            </button>
            <div style={{color:"#4A4054",fontSize:12,textAlign:"center",marginTop:12}}>
              {currentBase===0?"1st song is free · Add a tip if you'd like":`€${currentBase} · + optional tip · 88% to artist`}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}


// ── QR Code Panel — shown in artist portal ──────────────────────────────────
function ArtistQRPanel({artist}:{artist:any}){
  const [copied,setCopied]=useState(false);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://awaz-beryl.vercel.app";
  const requestUrl = `${baseUrl}/?request=${artist.id}`;

  const copyUrl=()=>{
    navigator.clipboard.writeText(requestUrl);
    setCopied(true);
    setTimeout(()=>setCopied(false),2000);
  };

  const printQR=()=>{
    const w=window.open("","_blank");
    if(!w) return;
    w.document.write(`
      <!DOCTYPE html><html><head><title>QR – ${artist.name}</title>
      <style>
        body{margin:0;padding:40px;font-family:'Georgia',serif;background:#fff;color:#111;text-align:center;}
        .card{max-width:400px;margin:0 auto;padding:40px;border:2px solid #111;border-radius:16px;}
        h1{font-size:2rem;margin:20px 0 4px;}
        p{color:#666;margin:0 0 24px;font-size:1rem;}
        img{width:240px;height:240px;border-radius:8px;display:block;margin:0 auto 20px;}
        .url{font-size:11px;color:#888;word-break:break-all;margin-top:16px;}
        .steps{text-align:left;margin-top:24px;font-size:14px;color:#444;}
        .steps li{margin-bottom:8px;}
        @media print{.noprint{display:none;}}
      </style></head><body>
      <div class="card">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(requestUrl)}&bgcolor=ffffff&color=111111&margin=2&format=png" alt="QR"/>
        <h1>${artist.name}</h1>
        <p>Request a song</p>
        <ol class="steps">
          <li>Scan the QR code with your phone</li>
          <li>Choose your song and dedication</li>
          <li>Pay to have it played live</li>
        </ol>
        <div class="url">${requestUrl}</div>
      </div>
      <button class="noprint" onclick="window.print()" style="margin-top:24px;padding:12px 32px;font-size:16px;cursor:pointer;background:#111;color:#fff;border:none;border-radius:8px;">Print / Save as PDF</button>
      </body></html>
    `);
    w.document.close();
  };

  return(
    <div style={{background:"rgba(200,168,74,0.04)",border:"1px solid rgba(200,168,74,0.2)",borderRadius:16,padding:"24px",marginTop:24}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.3rem",fontWeight:700,color:"#EDE4CE"}}>Your Song Request QR</div>
          <div style={{color:"#8A7D68",fontSize:13,marginTop:2}}>Show this at events — guests scan to request and pay</div>
        </div>
      </div>

      <div style={{display:"flex",gap:20,alignItems:"flex-start",flexWrap:"wrap"}}>
        {/* QR Code */}
        <div style={{background:"#fff",borderRadius:14,padding:12,display:"inline-block",flexShrink:0}}>
          <QRCode url={requestUrl} size={160}/>
        </div>

        {/* Info + actions */}
        <div style={{flex:1,minWidth:200}}>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#8A7D68",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6}}>REQUEST LINK</div>
            <div style={{background:"#141220",border:"1px solid #201D2E",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#8A7D68",wordBreak:"break-all",lineHeight:1.5,marginBottom:8}}>
              {requestUrl}
            </div>
            <button onClick={copyUrl}
              style={{background:copied?"rgba(34,197,94,0.1)":"rgba(200,168,74,0.08)",color:copied?"#22C55E":"#C8A84A",border:`1px solid ${copied?"rgba(34,197,94,0.3)":"rgba(200,168,74,0.2)"}`,borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",width:"100%",marginBottom:8}}>
              {copied?"✓ Copied!":"Copy Link"}
            </button>
            <button onClick={printQR}
              style={{background:C.surface,color:"#EDE4CE",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",width:"100%"}}>
              Print / Save QR Card
            </button>
          </div>
          <div style={{color:"#4A4054",fontSize:11,lineHeight:1.7}}>
            How to use: Print the QR card and place it on tables at your event. Guests scan, choose a song, pick priority (€30–€100) and pay. You see requests live in your Requests tab.
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 🎤 ARTIST DEMO PAGE — Live showcase of the full artist experience
// ══════════════════════════════════════════════════════════════════════════════
function DemoPage({onBook, onApply, vp}:{onBook:()=>void;onApply:()=>void;vp:any}){
  const [demoStep,setDemoStep]=useState<"intro"|"profile"|"booking"|"dashboard"|"songreq">("intro");
  const [demoTab,setDemoTab]=useState("overview");
  const [bookingDone,setBookingDone]=useState(false);
  const [songDone,setSongDone]=useState(false);
  const [songTitle,setSongTitle]=useState("");
  const [guestName,setGuestName]=useState("");

  const demoArtist={
    id:"demo-001",
    name:"Soraya Rahimi",
    nameDari:"ثریا رحیمی",
    genre:"Traditional · Ghazal · Fusion",
    location:"Oslo, Norway",
    emoji:"",
    color:"#A82C38",
    photo:null,
    bio:"Award-winning Afghan vocalist based in Oslo. Specialising in traditional Ghazal, folk songs and contemporary fusion. Performed across Europe at weddings, Eid celebrations and cultural galas. Trained under Ustad Mohammad Omar's tradition.",
    deposit:1200,
    priceInfo:"From €1,200",
    rating:4.9,
    reviews:47,
    verified:true,
    isBoosted:true,
    tags:["Ghazal","Traditional","Wedding","Eid","Live Band"],
    instruments:["Voice","Rubab","Harmonium"],
    spotify:{profileUrl:"https://open.spotify.com/",monthlyListeners:"12,400",topTracks:["Leili Jan","Bya Ke Bya","Atan"]},
    instagram:{handle:"soraya.music",followers:"8,200",profileUrl:"https://instagram.com/"},
  };

  const steps = [
    {id:"intro",     label:t('demoOverviewTab'),    icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>},
    {id:"profile",   label:t('demoProfileTab'),     icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>},
    {id:"booking",   label:t('demoBookingTab'),     icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>},
    {id:"dashboard", label:t('demoDashboardTab'),   icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>},
    {id:"songreq",   label:t('demoSongTab'),icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>},
  ];

  // Use global C proxy so theme-toggle (dark/light) works here too
  const S = {
    card: {background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"20px"},
    gold:  C.gold,
    ruby:  C.ruby,
    muted: C.muted,
    text:  C.text,
    green: C.emerald,
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Sans',sans-serif",paddingTop:62,paddingBottom:80}}>
      {/* Hero */}
      <div style={{background:`linear-gradient(135deg,${C.rubyS},${C.goldS})`,borderBottom:`1px solid ${C.gold}18`,padding:vp.isMobile?"32px 20px":"48px 0",textAlign:"center"}}>
        <div style={{maxWidth:700,margin:"0 auto",padding:"0 24px"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,background:C.goldS,border:`1px solid ${C.gold}44`,borderRadius:20,padding:"5px 14px",marginBottom:18}}>
            <span style={{fontSize:12,fontWeight:700,color:C.gold,letterSpacing:"1px",textTransform:"uppercase"}}>Live Demo</span>
          </div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:vp.isMobile?"2.2rem":"3rem",fontWeight:700,lineHeight:1.2,marginBottom:14,color:C.text}}>
            Experience Awaz as an Artist
          </div>
          <div style={{color:C.muted,fontSize:16,lineHeight:1.8,marginBottom:28,maxWidth:540,margin:"0 auto 28px"}}>
            See exactly how artists use the platform — from profile to bookings, live song requests and earnings dashboard.
          </div>
          <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={onApply}
              style={{background:`linear-gradient(135deg,${C.ruby},${C.ruby}cc)`,color:"#fff",border:"none",borderRadius:12,padding:"13px 28px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
              Apply as Artist →
            </button>
            <button onClick={onBook}
              style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 28px",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
              Browse Artists
            </button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:920,margin:"0 auto",padding:vp.isMobile?"0 0 40px":"0 24px 60px"}}>
        {/* Step tabs */}
        <div style={{display:"flex",overflowX:"auto",gap:4,padding:"20px 20px 0",scrollbarWidth:"none"}}>
          {steps.map((s,i)=>(
            <button key={s.id} onClick={()=>setDemoStep(s.id as any)}
              style={{display:"flex",alignItems:"center",gap:7,background:demoStep===s.id?C.goldS:"transparent",color:demoStep===s.id?C.gold:C.muted,border:`1px solid ${demoStep===s.id?C.gold+"44":C.border}`,borderRadius:10,padding:"9px 16px",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:demoStep===s.id?700:500,whiteSpace:"nowrap",flexShrink:0}}>
              {s.icon}{s.label}
            </button>
          ))}
        </div>

        <div style={{padding:"0 20px"}}>

          {/* ── INTRO ── */}
          {demoStep==="intro"&&(
            <div style={{paddingTop:28}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.6rem",fontWeight:700,marginBottom:6}}>{t('demoPlatformOverview')}</div>
              <div style={{color:C.muted,fontSize:14,marginBottom:24}}>{t('demoPlatformSub')}</div>
              <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr":"1fr 1fr",gap:12}}>
                {[
                  {color:C.ruby,    title:t('demoFeat1Title'),desc:t('demoFeat1Desc')},
                  {color:C.lapis,   title:t('demoFeat2Title'),desc:t('demoFeat2Desc')},
                  {color:C.emerald, title:t('demoFeat3Title'),desc:t('demoFeat3Desc')},
                  {color:C.gold,    title:t('demoFeat4Title'),desc:t('demoFeat4Desc')},
                  {color:C.saffron, title:t('demoFeat5Title'),desc:t('demoFeat5Desc')},
                  {color:C.gold,    title:t('demoFeat6Title'),desc:t('demoFeat6Desc')},
                  {color:C.lapis,   title:t('demoFeat7Title'),desc:t('demoFeat7Desc')},
                  {color:C.emerald, title:t('demoFeat8Title'),desc:t('demoFeat8Desc')},
                ].map(({color,title,desc})=>(
                  <div key={title} style={{...S.card,display:"flex",gap:14,alignItems:"flex-start"}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:color,flexShrink:0,marginTop:7}}/>
                    <div>
                      <div style={{fontWeight:700,color:C.text,fontSize:14,marginBottom:5}}>{title}</div>
                      <div style={{color:C.muted,fontSize:13,lineHeight:1.7}}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:24,textAlign:"center"}}>
                <button onClick={()=>setDemoStep("profile")}
                  style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:12,padding:"13px 32px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                  See Artist Profile Demo →
                </button>
              </div>
            </div>
          )}

          {/* ── PROFILE ── */}
          {demoStep==="profile"&&(
            <div style={{paddingTop:24}}>
              <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.5rem",fontWeight:700}}>{t('demoProfileTitle')}</div>
                  <div style={{color:C.muted,fontSize:13}}>{t('demoProfileSub')}</div>
                </div>
                <span style={{background:"rgba(200,168,74,0.1)",color:C.gold,border:"1px solid rgba(200,168,74,0.2)",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700}}>{t('demoLivePreview')}</span>
              </div>
              {/* Demo profile card */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
                {/* Profile header */}
                <div style={{background:`linear-gradient(135deg,${C.rubyS},${C.goldS})`,padding:vp.isMobile?"20px":"28px 32px",display:"flex",gap:20,alignItems:"flex-start",flexWrap:"wrap"}}>
                  <div style={{width:80,height:80,borderRadius:14,background:`${C.ruby}20`,border:`2px solid ${C.ruby}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,flexShrink:0}}></div>
                  <div style={{flex:1,minWidth:200}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:4}}>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.8rem",fontWeight:700}}>{demoArtist.name}</div>
                      <div style={{fontFamily:"'Noto Naskh Arabic',serif",color:C.muted,fontSize:16}}>{demoArtist.nameDari}</div>
                    </div>
                    <div style={{color:C.muted,fontSize:13,marginBottom:8}}>{demoArtist.genre} · {demoArtist.location}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                      {demoArtist.tags.map(t=>(
                        <span key={t} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:"3px 10px",fontSize:11,color:C.muted}}>{t}</span>
                      ))}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                      <div style={{display:"flex",gap:2}}>
                        {"★★★★★".split("").map((s,i)=>(
                          <span key={i} style={{color:C.gold,fontSize:14}}>{s}</span>
                        ))}
                        <span style={{color:C.muted,fontSize:12,marginLeft:6}}>{demoArtist.rating} ({demoArtist.reviews} reviews)</span>
                      </div>
                      <span style={{background:"rgba(34,197,94,0.1)",color:C.emerald,border:"1px solid rgba(34,197,94,0.2)",borderRadius:6,fontSize:11,fontWeight:700,padding:"2px 8px"}}>✓ VERIFIED</span>
                      <span style={{background:"rgba(200,168,74,0.1)",color:C.gold,border:"1px solid rgba(200,168,74,0.2)",borderRadius:6,fontSize:11,fontWeight:700,padding:"2px 8px"}}>⭐ FEATURED</span>
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{color:C.muted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:4}}>FROM</div>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.6rem",fontWeight:800,color:C.ruby}}>{demoArtist.priceInfo}</div>
                    <div style={{color:C.muted,fontSize:11,marginBottom:12}}>€{demoArtist.deposit} deposit · Balance cash</div>
                    <button onClick={()=>setDemoStep("booking")}
                      style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:10,padding:"11px 22px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",display:"block",width:"100%",marginBottom:8}}>
                      Book Now
                    </button>
                    <button onClick={()=>setDemoStep("songreq")}
                      style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 22px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit",display:"block",width:"100%"}}>
                      Request a Song
                    </button>
                  </div>
                </div>
                {/* Bio + Social */}
                <div style={{padding:vp.isMobile?"16px":"24px 32px",borderTop:`1px solid ${C.border}`}}>
                  <div style={{marginBottom:16}}>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.1rem",fontWeight:700,color:C.gold,marginBottom:8}}>About {demoArtist.name}</div>
                    <div style={{color:"rgba(237,228,206,0.75)",fontSize:14,lineHeight:1.85}}>{demoArtist.bio}</div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {[["Spotify","12,400 monthly listeners"],["Instagram","8,200 followers"]].map(([label,sub])=>(
                      <div key={label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",display:"flex",gap:8,alignItems:"center"}}>
                        <div>
                          <div style={{fontWeight:700,color:C.text,fontSize:13}}>{label}</div>
                          <div style={{color:C.muted,fontSize:11}}>{sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{marginTop:16,textAlign:"center"}}>
                <button onClick={()=>setDemoStep("booking")}
                  style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:12,padding:"12px 28px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
                  Try Booking Flow →
                </button>
              </div>
            </div>
          )}

          {/* ── BOOKING ── */}
          {demoStep==="booking"&&(
            <div style={{paddingTop:24}}>
              <div style={{marginBottom:20}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.5rem",fontWeight:700}}>{t('demoBookingTitle')}</div>
                <div style={{color:C.muted,fontSize:13}}>{t('demoBookingSub')}</div>
              </div>
              {bookingDone?(
                <div style={{textAlign:"center",padding:"48px 24px",...S.card}}>
                  
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.8rem",fontWeight:700,marginBottom:8}}>{t('demoConfirmed')}</div>
                  <div style={{color:C.muted,fontSize:14,lineHeight:1.8,marginBottom:24}}>
                    The artist receives a notification instantly.<br/>
                    <strong style={{color:C.gold}}>€{demoArtist.deposit}</strong> deposit secured via Stripe.<br/>
                    Artist gets <strong style={{color:C.emerald}}>€{Math.round(demoArtist.deposit*0.88)}</strong> (88%) — Awaz keeps €{Math.round(demoArtist.deposit*0.12)} (12%).
                  </div>
                  <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                    <button onClick={()=>setDemoStep("dashboard")}
                      style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:12,padding:"12px 24px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
                      See Artist Dashboard →
                    </button>
                    <button onClick={()=>setBookingDone(false)}
                      style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 20px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                      Try Again
                    </button>
                  </div>
                </div>
              ):(
                <div style={{...S.card,maxWidth:440}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.border}`}}>
                    <div style={{width:44,height:44,borderRadius:10,background:"rgba(168,44,56,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}></div>
                    <div>
                      <div style={{fontWeight:700,color:C.text,fontSize:14}}>{demoArtist.name}</div>
                      <div style={{color:C.muted,fontSize:12}}>Deposit: €{demoArtist.deposit}</div>
                    </div>
                  </div>
                  {[
                    {label:t('demoFieldName'),     placeholder:"e.g. Ahmad Karimi",    type:"text"},
                    {label:t('demoFieldEmail'),         placeholder:"you@email.com",         type:"email"},
                    {label:t('demoFieldEventType'),    placeholder:t('demoFieldTypePh'),  type:"text"},
                    {label:t('demoFieldDate'),    placeholder:t('demoFieldDatePh'),     type:"text"},
                  ].map(({label,placeholder,type})=>(
                    <div key={label} style={{marginBottom:14}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6}}>{label}</div>
                      <input type={type} placeholder={placeholder}
                        style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",color:C.text,fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                    </div>
                  ))}
                  <div style={{background:"rgba(200,168,74,0.06)",border:"1px solid rgba(200,168,74,0.15)",borderRadius:10,padding:"12px 14px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{color:C.muted,fontSize:13}}>{t('demoDepositNow')}</div>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.5rem",fontWeight:800,color:C.gold}}>€{demoArtist.deposit}</div>
                  </div>
                  <button onClick={()=>setBookingDone(true)}
                    style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:12,padding:"14px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                    Pay Deposit · €{demoArtist.deposit} →
                  </button>
                  <div style={{color:"rgba(138,125,104,0.7)",fontSize:11,textAlign:"center",marginTop:8}}>Secured by Stripe · PCI compliant</div>
                </div>
              )}
            </div>
          )}

          {/* ── ARTIST DASHBOARD ── */}
          {demoStep==="dashboard"&&(
            <div style={{paddingTop:24}}>
              <div style={{marginBottom:20}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.5rem",fontWeight:700}}>{t('demoDashTitle')}</div>
                <div style={{color:C.muted,fontSize:13}}>What {demoArtist.name} sees when she logs in</div>
              </div>
              {/* Mini nav */}
              <div style={{display:"flex",gap:4,overflowX:"auto",marginBottom:16,scrollbarWidth:"none"}}>
                {["overview","bookings","requests","calendar","earnings"].map(tab=>(
                  <button key={tab} onClick={()=>setDemoTab(tab)}
                    style={{background:demoTab===tab?C.goldS:"transparent",color:demoTab===tab?C.gold:C.muted,border:`1px solid ${demoTab===tab?C.gold+"44":C.border}`,borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,whiteSpace:"nowrap",textTransform:"capitalize"}}>
                    {tab}
                  </button>
                ))}
              </div>

              {demoTab==="overview"&&(
                <div>
                  <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:20}}>
                    {[
                      {label:t('demoTotalEarned'),  val:"€8,580",   sub:t('demoThisYear'),       color:C.gold},
                      {label:t('demoBookingTab'),       val:"9",         sub:t('demoConfirmedLabel'),       color:C.emerald},
                      {label:t('demoPendingLabel').charAt(0).toUpperCase()+t('demoPendingLabel').slice(1),        val:"2",         sub:t('demoNewRequests'),    color:"#F59E0B"},
                      {label:t('demoRatingLabel'),         val:"4.9 ★",     sub:"47 "+t('demoRatingLabel'),      color:C.ruby},
                    ].map(({label,val,sub,color})=>(
                      <div key={label} style={{...S.card,textAlign:"center"}}>
                        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.6rem",fontWeight:800,color,marginBottom:2}}>{val}</div>
                        <div style={{fontWeight:700,color:C.text,fontSize:12}}>{label}</div>
                        <div style={{color:C.muted,fontSize:11,marginTop:1}}>{sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{...S.card,marginBottom:12}}>
                    <div style={{color:C.gold,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:12}}>{t('demoUpcoming')}</div>
                    {[
                      {name:"Karimi Family Wedding",date:"14 Jun 2025",deposit:1200,status:"confirmed"},
                      {name:"Eid Gala — Oslo Kulturhus",date:"28 May 2025",deposit:1500,status:"pending"},
                    ].map(b=>(
                      <div key={b.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                        <div>
                          <div style={{fontWeight:600,color:C.text,fontSize:13}}>{b.name}</div>
                          <div style={{color:C.muted,fontSize:11,marginTop:1}}>{b.date}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontWeight:700,color:C.gold,fontSize:13}}>€{Math.round(b.deposit*0.88)}</div>
                          <span style={{background:b.status==="confirmed"?"rgba(34,197,94,0.1)":"rgba(245,158,11,0.1)",color:b.status==="confirmed"?C.emerald:"#F59E0B",fontSize:10,fontWeight:700,borderRadius:4,padding:"2px 6px"}}>{b.status.toUpperCase()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setDemoStep("songreq")}
                    style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:12,padding:"12px 24px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",width:"100%"}}>
                    See Song Requests →
                  </button>
                </div>
              )}

              {demoTab==="bookings"&&(
                <div style={{...S.card}}>
                  <div style={{color:C.gold,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:14}}>{t('demoAllBookings')}</div>
                  {[
                    {name:"Rahimi Wedding",      date:"14 Jun",price:1056,status:"confirmed"},
                    {name:"Eid Gala Oslo",        date:"28 May",price:1320,status:"pending"},
                    {name:"Ahmadi 50th Birthday", date:"3 Apr", price:880, status:"completed"},
                    {name:"Cultural Night — Berlin",date:"15 Mar",price:1760,status:"completed"},
                  ].map(b=>(
                    <div key={b.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
                      <div>
                        <div style={{fontWeight:600,color:C.text,fontSize:13}}>{b.name}</div>
                        <div style={{color:C.muted,fontSize:11,marginTop:2}}>{b.date} 2025</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontWeight:700,color:C.gold,fontSize:13}}>€{b.price}</div>
                        <span style={{fontSize:10,fontWeight:700,borderRadius:4,padding:"2px 6px",background:b.status==="completed"?"rgba(34,197,94,0.1)":b.status==="confirmed"?"rgba(200,168,74,0.1)":"rgba(245,158,11,0.1)",color:b.status==="completed"?C.emerald:b.status==="confirmed"?C.gold:"#F59E0B"}}>{b.status.toUpperCase()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {demoTab==="calendar"&&(
                <div style={{...S.card}}>
                  <div style={{color:C.gold,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:14}}>{t('demoCalTitle')+' — MAY 2025'}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:12}}>
                    {["M","T","W","T","F","S","S"].map((d,i)=>(
                      <div key={i} style={{textAlign:"center",color:C.muted,fontSize:11,fontWeight:700,paddingBottom:6}}>{d}</div>
                    ))}
                    {Array.from({length:31},(_,i)=>i+1).map(d=>{
                      const booked=[14,28].includes(d);
                      const available=[10,11,12,15,16,17,18,20,21,22].includes(d);
                      return(
                        <div key={d} style={{textAlign:"center",padding:"6px 2px",borderRadius:6,fontSize:12,fontWeight:600,background:booked?"rgba(168,44,56,0.2)":available?"rgba(34,197,94,0.1)":"transparent",color:booked?C.ruby:available?C.emerald:C.muted,border:`1px solid ${booked?"rgba(168,44,56,0.3)":available?"rgba(34,197,94,0.2)":"transparent"}`}}>
                          {d}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{display:"flex",gap:16,fontSize:11,color:C.muted}}>
                    <span style={{color:C.emerald}}>■ Available</span>
                    <span style={{color:C.ruby}}>■ Booked</span>
                  </div>
                </div>
              )}

              {demoTab==="requests"&&(
                <ArtistOfferPanel requests={[]} artist={artist} onAction={async()=>{}}/>
              )}

              {demoTab==="earnings"&&(
                <div>
                  <div style={{...S.card,marginBottom:12}}>
                    <div style={{color:C.gold,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:14}}>2025 EARNINGS</div>
                    {[["January","€880"],["February","€1,056"],["March","€1,760"],["April","€880"],["May","€2,376 (est.)"]].map(([m,v])=>(
                      <div key={m} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                        <span style={{color:C.muted,fontSize:13}}>{m}</span>
                        <span style={{fontWeight:700,color:C.gold,fontSize:13}}>{v}</span>
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0",borderTop:"1px solid rgba(200,168,74,0.2)",marginTop:4}}>
                      <span style={{fontWeight:700,color:C.text,fontSize:14}}>{t('demoTotal2025')}</span>
                      <span style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.gold,fontSize:"1.4rem"}}>€8,952</span>
                    </div>
                  </div>
                  <div style={{background:"rgba(34,197,94,0.05)",border:"1px solid rgba(34,197,94,0.15)",borderRadius:12,padding:"14px 16px",fontSize:13,color:C.muted,lineHeight:1.7}}>
                    88% split: For every €1,000 deposit, you receive <strong style={{color:C.emerald}}>€880</strong> directly to your Stripe account. Awaz keeps €120 (12%) as platform fee.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SONG REQUESTS ── */}
          {demoStep==="songreq"&&(
            <div style={{paddingTop:24}}>
              <div style={{marginBottom:20}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.5rem",fontWeight:700}}>{t('demoSongTitle')}</div>
                <div style={{color:C.muted,fontSize:13}}>{t('demoSongSub')}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr":"1fr 1fr",gap:16}}>
                {/* Guest side */}
                <div>
                  <div style={{color:C.gold,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:12}}>{t('demoGuestSide')}</div>
                  {!songDone?(
                    <div style={{...S.card}}>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.2rem",fontWeight:700,marginBottom:4}}>{t('demoRequestSong')}</div>
                      <div style={{color:C.muted,fontSize:12,marginBottom:16}}>from {demoArtist.name} · 1st song free</div>
                      <div style={{marginBottom:12}}>
                        <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6}}>{t('demoSongTitleField')}</div>
                        <input value={songTitle} onChange={e=>setSongTitle(e.target.value)}
                          placeholder={t('demoSongPh')}
                          style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                      </div>
                      <div style={{marginBottom:16}}>
                        <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6}}>{t('demoYourName')}</div>
                        <input value={guestName} onChange={e=>setGuestName(e.target.value)}
                          placeholder={t('demoNamePh')}
                          style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",color:C.text,fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                      </div>
                      <div style={{background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.15)",borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:12,color:C.emerald,fontWeight:700}}>
                        1st song tonight is FREE!
                      </div>
                      <button onClick={()=>{ if(songTitle&&guestName) setSongDone(true); }}
                        disabled={!songTitle||!guestName}
                        style={{width:"100%",background:songTitle&&guestName?`linear-gradient(135deg,${C.gold},${C.saffron})`:C.surface,color:songTitle&&guestName?C.bg:C.muted,border:"none",borderRadius:10,padding:"12px",fontWeight:800,fontSize:14,cursor:songTitle&&guestName?"pointer":"not-allowed",fontFamily:"inherit"}}>
                        Send Free Request →
                      </button>
                    </div>
                  ):(
                    <div style={{...S.card,textAlign:"center",padding:"32px 20px"}}>
                      <div style={{fontSize:48,marginBottom:12}}></div>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.4rem",fontWeight:700,marginBottom:6}}>{t('demoSentTitle')}</div>
                      <div style={{color:C.muted,fontSize:13,lineHeight:1.7}}>
                        <strong style={{color:C.gold}}>"{songTitle}"</strong> sent to {demoArtist.name}
                      </div>
                      <button onClick={()=>{setSongDone(false);setSongTitle("");setGuestName("");}}
                        style={{marginTop:16,background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 20px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
                {/* Artist side */}
                <div>
                  <div style={{color:C.gold,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:12}}>{t('demoArtistSide')}</div>
                  <div style={{...S.card}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                      {[{label:"Pending",val:songDone?"2":"1",color:"#F59E0B"},{label:"Earned",val:"€30",color:C.gold}].map(({label,val,color})=>(
                        <div key={label} style={{background:C.surface,borderRadius:8,padding:"10px",textAlign:"center"}}>
                          <div style={{fontWeight:800,color,fontSize:"1.3rem"}}>{val}</div>
                          <div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</div>
                        </div>
                      ))}
                    </div>
                    {[
                      {song:"Leili Jan",guest:"Ahmad",amount:0,priority:"FREE",color:C.emerald,status:"pending"},
                      {song:"Bya Ke Bya",guest:"Noor",amount:50,priority:"HIGH",color:"#F59E0B",status:"pending"},
                      ...(songDone?[{song:songTitle,guest:guestName,amount:0,priority:"FREE",color:C.emerald,status:"new"}]:[]),
                    ].map((r,i)=>(
                      <div key={i} style={{borderLeft:`3px solid ${r.color}`,borderRadius:8,padding:"10px 12px",background:C.surface,marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                          <div>
                            <div style={{fontWeight:700,color:C.text,fontSize:13}}>{r.song}</div>
                            <div style={{color:C.muted,fontSize:11}}>{r.guest}</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontWeight:700,color:r.color,fontSize:12}}>{r.priority}</div>
                            {r.amount>0&&<div style={{color:C.muted,fontSize:10}}>€{r.amount}</div>}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          <button style={{flex:1,background:"rgba(34,197,94,0.1)",color:C.emerald,border:"1px solid rgba(34,197,94,0.2)",borderRadius:6,padding:"5px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓ Accept</button>
                          <button style={{flex:1,background:"rgba(168,44,56,0.08)",color:C.ruby,border:"1px solid rgba(168,44,56,0.15)",borderRadius:6,padding:"5px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✗ Skip</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* CTA */}
              <div style={{marginTop:24,background:"linear-gradient(135deg,rgba(168,44,56,0.1),rgba(200,168,74,0.05))",border:"1px solid rgba(200,168,74,0.15)",borderRadius:16,padding:"24px",textAlign:"center"}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.5rem",fontWeight:700,marginBottom:8}}>{t('demoJoinTitle')}</div>
                <div style={{color:C.muted,fontSize:14,marginBottom:20,lineHeight:1.7}}>Start receiving bookings from the Afghan diaspora across Europe.<br/>{t('demoJoinSub')}</div>
                <button onClick={onApply}
                  style={{background:`linear-gradient(135deg,${C.ruby},${C.ruby}cc)`,color:"#fff",border:"none",borderRadius:12,padding:"14px 36px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                  Apply as Artist — It's Free →
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Private Inquiry Widget (floating concierge button + form) ─────────
// ══════════════════════════════════════════════════════════════════
// CUSTOMER PORTAL — logged-in customer dashboard
// ══════════════════════════════════════════════════════════════════
function CustomerPortal({session, artists, onLogout, theme, onToggleTheme}:{session:any;artists:any[];onLogout:()=>void;theme:string;onToggleTheme:()=>void}){
  if(theme) _theme=theme;
  const vp=useViewport();
  const {show:notify}=useNotif();
  const [requests,setRequests]=useState<any[]>([]);
  const [sel,setSel]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [counterAmt,setCounterAmt]=useState("");
  const [counterErr,setCounterErr]=useState("");
  const [chatMsgs,setChatMsgs]=useState<any[]>([]);
  const [chatInput,setChatInput]=useState("");
  const chatBottomRef=React.useRef<any>(null);

  useEffect(()=>{
    if(!HAS_SUPA){setLoading(false);return;}
    getSupabase().then(async sb=>{
      if(!sb){setLoading(false);return;}
      const{data}=await sb.from("booking_requests")
        .select("*").or(`customer_email.eq.${session.email},customer_id.eq.${session.id}`)
        .order("created_at",{ascending:false});
      if(data) setRequests(data);
      setLoading(false);
    });
  },[session.id,session.email]);

  // Realtime: offers + status updates
  useEffect(()=>{
    if(!HAS_SUPA) return;
    let ch:any=null;
    getSupabase().then(sb=>{
      if(!sb) return;
      ch=sb.channel(`cust_reqs_${session.id}`)
        .on("postgres_changes",{event:"UPDATE",schema:"public",table:"booking_requests"},(payload:any)=>{
          const r=payload.new;
          if(r.customer_email===session.email||r.customer_id===session.id){
            setRequests(p=>p.map(x=>x.id===r.id?r:x));
            if(sel?.id===r.id) setSel(r);
            const aName=artists.find((a:any)=>a.id===r.artist_id)?.name||"Artisten";
            if(r.status==="offered"){
              notify(`${aName} har sendt deg et tilbud! Svar nå ✨`,"message");
              sendBrowserNotif("Nytt tilbud — Awaz",`${aName}: €${r.artist_offer} depositum`);
            } else if(r.status==="declined"){
              notify(`${aName} har avslått forespørselen.`,"message");
            }
          }
        }).subscribe();
    });
    return()=>{if(ch) ch.unsubscribe();};
  },[session.id,session.email,sel?.id]);

  // Chat load + realtime
  useEffect(()=>{
    if(!sel||!HAS_SUPA) return;
    let ch:any=null;
    getSupabase().then(async sb=>{
      if(!sb) return;
      const{data}=await sb.from("booking_messages").select("*").eq("request_id",sel.id).order("created_at",{ascending:true});
      if(data) setChatMsgs(data);
      ch=sb.channel(`bm_cust_${sel.id}`)
        .on("postgres_changes",{event:"INSERT",schema:"public",table:"booking_messages",filter:`request_id=eq.${sel.id}`},(payload:any)=>{
          setChatMsgs(p=>{if(p.find(m=>m.id===payload.new.id)) return p; return [...p,payload.new];});
          if(payload.new.from_role==="artist"){
            notify(`Ny melding fra ${payload.new.sender_name||"artisten"}!`,"message");
            sendBrowserNotif("Ny melding — Awaz",payload.new.text?.slice(0,60)||"");
          }
        }).subscribe();
    });
    return()=>{if(ch) ch.unsubscribe();};
  },[sel?.id]);

  useEffect(()=>{if(chatBottomRef.current) chatBottomRef.current.scrollIntoView({behavior:"smooth"});},[chatMsgs]);

  const sendMsg=async()=>{
    if(!chatInput.trim()||!sel) return;
    const msg={id:crypto.randomUUID(),request_id:sel.id,from_role:"customer",sender_name:session.name||session.email,text:chatInput.trim(),created_at:new Date().toISOString()};
    setChatMsgs(p=>[...p,msg]); setChatInput("");
    if(HAS_SUPA){
      const sb=await getSupabase(); if(!sb) return;
      await sb.from("booking_messages").insert([msg]);
      const a=artists.find((x:any)=>x.id===sel.artist_id);
      if(a?.email) sendEmailNotification({type:"new_chat_message",toEmail:a.email,toName:a.name,fromName:session.name||session.email,message:msg.text,artistName:a.name});
    }
  };

  const acceptOffer=async()=>{
    if(!sel) return;
    const updated={...sel,status:"accepted"};
    setRequests(p=>p.map(r=>r.id===sel.id?updated:r)); setSel(updated);
    if(HAS_SUPA){
      const sb=await getSupabase(); if(!sb) return;
      await sb.from("booking_requests").update({status:"accepted"}).eq("id",sel.id);
      const confMsg={id:crypto.randomUUID(),request_id:sel.id,from_role:"customer",sender_name:session.name||"Kunde",text:`Jeg aksepterer tilbudet!\n\n💳 Depositum: €${sel.artist_offer}\n${(sel.artist_balance||0)>0?"💵 Saldo etter konsert: €"+sel.artist_balance+"\n":""}Gleder meg til arrangementet! 🎵`,created_at:new Date().toISOString()};
      await sb.from("booking_messages").insert([confMsg]);
      setChatMsgs(p=>[...p,confMsg]);
      const a=artists.find((x:any)=>x.id===sel.artist_id);
      if(a?.email) sendEmailNotification({type:"offer_accepted",toEmail:a.email,toName:a.name,fromName:session.name||session.email,artistName:a.name,depositAmount:sel.artist_offer,bookingDate:sel.event_date,eventType:sel.event_type});
      sendEmailNotification({type:"booking_confirmed",toEmail:session.email,toName:session.name||session.email,fromName:a?.name||"",artistName:a?.name||"",depositAmount:sel.artist_offer,bookingDate:sel.event_date,eventType:sel.event_type});
    }
    notify("Booking akseptert! Bekreftelse sendes på e-post.","success");
  };

  const sendCounter=async()=>{
    const amt=parseInt(counterAmt);
    if(!amt||amt<50){setCounterErr("Skriv inn gyldig beløp");return;}
    const updated={...sel,status:"counter_offered",customer_counter:amt};
    setRequests(p=>p.map(r=>r.id===sel.id?updated:r)); setSel(updated);
    if(HAS_SUPA){
      const sb=await getSupabase(); if(!sb) return;
      await sb.from("booking_requests").update({status:"counter_offered",customer_counter:amt}).eq("id",sel.id);
      const cMsg={id:crypto.randomUUID(),request_id:sel.id,from_role:"customer",sender_name:session.name||"Kunde",text:`Jeg sender et motbud: €${amt} depositum. Håper vi finner en løsning! 🙏`,created_at:new Date().toISOString()};
      await sb.from("booking_messages").insert([cMsg]); setChatMsgs(p=>[...p,cMsg]);
    }
    setCounterAmt("");setCounterErr("");
    notify("Motbud sendt!","success");
  };

  const SC:Record<string,string>={request_received:C.saffron,pending:C.saffron,offered:C.lapis,accepted:C.emerald,counter_offered:C.gold,declined:C.ruby,expired:C.muted};
  const SL:Record<string,string>={request_received:"Venter på svar",pending:"Venter på svar",offered:"Tilbud mottatt ✨",accepted:"Booking bekreftet ✓",counter_offered:"Motbud sendt",declined:"Avslått",expired:"Utløpt"};
  const aOf=(r:any)=>artists.find((a:any)=>a.id===r.artist_id);

  if(sel) return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky" as const,top:0,zIndex:50}}>
        <button onClick={()=>{setSel(null);setChatMsgs([]);}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:T.sm,display:"flex",alignItems:"center",gap:6}}>← Mine bookinger</button>
        <span style={{background:`${SC[sel.status]||C.muted}20`,color:SC[sel.status]||C.muted,padding:"4px 12px",borderRadius:20,fontSize:10,fontWeight:700}}>{SL[sel.status]||sel.status}</span>
      </div>
      <div style={{maxWidth:680,margin:"0 auto",padding:vp.isMobile?"16px":"24px"}}>

        {/* Artist info */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px",marginBottom:14,display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:52,height:52,borderRadius:12,background:C.goldS,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{aOf(sel)?.emoji||"🎵"}</div>
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text}}>{aOf(sel)?.name||"Artist"}</div>
            <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>{sel.event_type} · {sel.event_date}</div>
          </div>
        </div>

        {/* Timeline */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px",marginBottom:14}}>
          <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,marginBottom:12}}>Status</div>
          <div style={{display:"flex",alignItems:"center",gap:0}}>
            {[["Sendt","request_received"],["Tilbud","offered"],["Akseptert","accepted"]].map(([label,st],i,arr)=>{
              const order=["request_received","pending","offered","counter_offered","accepted","declined"];
              const cur=order.indexOf(sel.status); const tgt=order.indexOf(st);
              const done=sel.status==="accepted"?i<=2:cur>=tgt;
              return(
                <React.Fragment key={label}>
                  <div style={{display:"flex",flexDirection:"column" as const,alignItems:"center",minWidth:60}}>
                    <div style={{width:30,height:30,borderRadius:"50%",background:done?C.gold:C.surface,border:`2px solid ${done?C.gold:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:done?"#000":C.muted,fontWeight:700,marginBottom:4}}>{done?"✓":(i+1)}</div>
                    <div style={{fontSize:10,color:done?C.gold:C.muted,fontWeight:done?700:400,textAlign:"center" as const,whiteSpace:"nowrap" as const}}>{label}</div>
                  </div>
                  {i<arr.length-1&&<div style={{flex:1,height:2,background:done&&cur>tgt?C.gold:C.border,margin:"0 4px",marginBottom:16}}/>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Offer card */}
        {sel.status==="offered"&&(
          <div style={{background:C.card,border:`2px solid ${C.gold}55`,borderRadius:14,padding:18,marginBottom:14}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.gold,marginBottom:14}}>✨ Du har mottatt et tilbud</div>
            <div style={{display:"grid",gridTemplateColumns:(sel.artist_balance||0)>0?"1fr 1fr":"1fr",gap:10,marginBottom:16}}>
              <div style={{background:C.goldS,borderRadius:10,padding:"14px 16px",textAlign:"center" as const}}>
                <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,marginBottom:4}}>Depositum — betales nå</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.9rem",fontWeight:800,color:C.gold}}>€{sel.artist_offer}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:4}}>Sikker betaling via Stripe</div>
              </div>
              {(sel.artist_balance||0)>0&&(
                <div style={{background:`${C.emerald}10`,border:`1px solid ${C.emerald}33`,borderRadius:10,padding:"14px 16px",textAlign:"center" as const}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,marginBottom:4}}>Saldo — etter konsert</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.9rem",fontWeight:800,color:C.emerald}}>€{sel.artist_balance}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:4}}>Kontant til artisten</div>
                </div>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column" as const,gap:8}}>
              <button onClick={acceptOffer} style={{width:"100%",background:`linear-gradient(135deg,${C.emerald},#16a34a)`,color:"#fff",border:"none",borderRadius:10,padding:"14px",fontWeight:800,fontSize:T.base,cursor:"pointer",fontFamily:"inherit"}}>
                ✓ Aksepter og bekreft booking
              </button>
              <div style={{display:"flex",gap:8,alignItems:"center"}}><div style={{flex:1,height:1,background:C.border}}/><span style={{color:C.muted,fontSize:11,whiteSpace:"nowrap" as const}}>eller send motbud</span><div style={{flex:1,height:1,background:C.border}}/></div>
              <div style={{display:"flex",gap:8}}>
                <div style={{position:"relative" as const,flex:1}}>
                  <span style={{position:"absolute" as const,left:12,top:"50%",transform:"translateY(-50%)",color:C.muted}}>€</span>
                  <input type="number" value={counterAmt} onChange={e=>setCounterAmt(e.target.value)} placeholder="Ditt motbud" min={50} style={{width:"100%",background:C.surface,border:`2px solid ${counterAmt?C.gold:C.border}`,borderRadius:8,padding:"11px 12px 11px 28px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit",boxSizing:"border-box" as const}}/>
                </div>
                <button onClick={sendCounter} style={{background:C.goldS,color:C.gold,border:`1px solid ${C.gold}44`,borderRadius:8,padding:"0 16px",fontWeight:700,fontSize:T.xs,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap" as const}}>Send motbud</button>
              </div>
              {counterErr&&<div style={{color:C.ruby,fontSize:T.xs}}>⚠ {counterErr}</div>}
            </div>
          </div>
        )}

        {/* Accepted: confirmation + payment instructions */}
        {sel.status==="accepted"&&(
          <div style={{background:`linear-gradient(135deg,${C.emerald}12,${C.card})`,border:`2px solid ${C.emerald}44`,borderRadius:14,padding:18,marginBottom:14}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.emerald,marginBottom:12}}>🎉 Booking bekreftet!</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div style={{background:C.goldS,borderRadius:10,padding:"12px 14px",textAlign:"center" as const}}>
                <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,marginBottom:4}}>Depositum (Stripe)</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.6rem",fontWeight:800,color:C.gold}}>€{sel.artist_offer}</div>
              </div>
              {(sel.artist_balance||0)>0&&(
                <div style={{background:`${C.emerald}10`,borderRadius:10,padding:"12px 14px",textAlign:"center" as const}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,marginBottom:4}}>Saldo kontant</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.6rem",fontWeight:800,color:C.emerald}}>€{sel.artist_balance}</div>
                </div>
              )}
            </div>
            <div style={{background:C.surface,borderRadius:8,padding:"12px 14px",fontSize:T.xs,color:C.muted,lineHeight:1.7}}>
              📧 <strong style={{color:C.text}}>Bekreftelse er sendt til {session.email}</strong><br/>
              📅 Dato: <strong style={{color:C.text}}>{sel.event_date}</strong><br/>
              💳 Artisten sender deg Stripe-betalingslenke for depositum. Sjekk chattevinduet nedenfor.
            </div>
          </div>
        )}

        {sel.status==="declined"&&(
          <div style={{background:`${C.ruby}10`,border:`1px solid ${C.ruby}33`,borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{fontWeight:700,color:C.ruby,fontSize:T.sm,marginBottom:4}}>Forespørsel avslått</div>
            {sel.decline_reason&&<div style={{color:C.muted,fontSize:T.xs,marginTop:4}}>Grunn: {sel.decline_reason}</div>}
            <div style={{color:C.muted,fontSize:T.xs,marginTop:6,lineHeight:1.6}}>Du kan sende forespørsel til en annen artist.</div>
          </div>
        )}

        {/* Request details */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:14}}>
          <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,marginBottom:10}}>Forespørselsdetaljer</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[["Dato",sel.event_date],["Type",sel.event_type],["Sted",sel.event_location_city||"—"],["Gjester",sel.guest_count||"—"]].map(([k,v])=>(
              <div key={k as string} style={{background:C.surface,borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,marginBottom:2}}>{k}</div>
                <div style={{fontSize:T.xs,color:C.text}}>{v as string||"—"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat — available from request sent onwards */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16}}>💬</span>
            <span style={{fontWeight:700,color:C.text,fontSize:T.sm}}>Meldinger med {aOf(sel)?.name||"artisten"}</span>
          </div>
          <div style={{padding:"14px 16px",minHeight:100,maxHeight:300,overflowY:"auto" as const}}>
            {chatMsgs.length===0?(
              <div style={{color:C.muted,fontSize:T.xs,textAlign:"center" as const,padding:"24px 0"}}>Ingen meldinger ennå. Du kan stille spørsmål til artisten her.</div>
            ):chatMsgs.map(m=>(
              <div key={m.id} style={{marginBottom:10,display:"flex",flexDirection:"column" as const,alignItems:m.from_role==="customer"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"78%",background:m.from_role==="customer"?`linear-gradient(135deg,${C.gold}22,${C.goldS})`:C.surface,border:`1px solid ${m.from_role==="customer"?C.gold+"44":C.border}`,borderRadius:10,padding:"9px 13px",fontSize:T.xs,color:C.text,lineHeight:1.65,whiteSpace:"pre-wrap" as const}}>
                  {m.text}
                </div>
                <div style={{fontSize:9,color:C.faint,marginTop:3}}>
                  {m.from_role==="customer"?"Deg":aOf(sel)?.name} · {new Date(m.created_at).toLocaleTimeString("nb-NO",{hour:"2-digit",minute:"2-digit"})}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef}/>
          </div>
          <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8}}>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg();}}}
              placeholder="Skriv en melding…"
              style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={sendMsg} style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:8,padding:"0 18px",fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:T.sm}}>→</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── List view ──
  const newOffers=requests.filter(r=>r.status==="offered").length;
  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky" as const,top:0,zIndex:50}}>
        <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:22,color:C.gold}}>آواز</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{color:C.muted,fontSize:T.xs,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{session.name||session.email}</span>
          <button onClick={onLogout} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",color:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:T.xs}}>Logg ut</button>
        </div>
      </div>
      <div style={{maxWidth:700,margin:"0 auto",padding:vp.isMobile?"16px":"32px 24px"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>Mine bookinger</div>
        <div style={{color:C.muted,fontSize:T.sm,marginBottom:20}}>Følg statusen på dine forespørsler og svar på tilbud.</div>

        {newOffers>0&&(
          <div style={{background:`${C.lapis}12`,border:`1px solid ${C.lapis}44`,borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>✨</span>
            <div>
              <div style={{fontWeight:700,color:C.lapis,fontSize:T.sm}}>Du har {newOffers} ubesvart{newOffers>1?"e":""} tilbud!</div>
              <div style={{color:C.muted,fontSize:T.xs}}>Klikk for å se og svare på tilbudet</div>
            </div>
          </div>
        )}

        {loading?(
          <div style={{textAlign:"center" as const,padding:"48px 0"}}>
            <div style={{width:36,height:36,border:`3px solid ${C.border}`,borderTopColor:C.gold,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto"}}/>
          </div>
        ):requests.length===0?(
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"48px 24px",textAlign:"center" as const}}>
            <div style={{fontSize:48,marginBottom:12}}>✦</div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,color:C.text,marginBottom:8}}>Ingen forespørsler ennå</div>
            <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.7}}>Finn en artist du vil booke og send din første forespørsel — det er gratis.</div>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column" as const,gap:10}}>
            {requests.map(r=>{
              const a=aOf(r);
              const isOffer=r.status==="offered";
              return(
                <div key={r.id} onClick={()=>{setSel(r);setChatMsgs([]);}}
                  style={{background:C.card,border:`2px solid ${isOffer?C.gold+"66":r.status==="accepted"?C.emerald+"44":C.border}`,borderRadius:12,padding:"16px 18px",cursor:"pointer",transition:"border-color 0.15s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,flexWrap:"wrap" as const,gap:8}}>
                    <div style={{display:"flex",gap:12,alignItems:"center"}}>
                      <div style={{width:38,height:38,borderRadius:8,background:C.goldS,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{a?.emoji||"🎵"}</div>
                      <div>
                        <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{a?.name||"Artist"}</div>
                        <div style={{color:C.muted,fontSize:T.xs,marginTop:1}}>{r.event_type} · {r.event_date}</div>
                      </div>
                    </div>
                    <span style={{background:`${SC[r.status]||C.muted}20`,color:SC[r.status]||C.muted,padding:"4px 12px",borderRadius:20,fontSize:10,fontWeight:700,whiteSpace:"nowrap" as const}}>{SL[r.status]||r.status}</span>
                  </div>
                  {isOffer&&r.artist_offer&&(
                    <div style={{background:C.goldS,borderRadius:8,padding:"8px 12px",fontSize:T.xs,color:C.gold,fontWeight:700,marginBottom:6}}>
                      Tilbud: €{r.artist_offer} depositum{(r.artist_balance||0)>0?` + €${r.artist_balance} etter konsert`:""}
                    </div>
                  )}
                  <div style={{color:C.faint,fontSize:10}}>{new Date(r.created_at).toLocaleDateString("nb-NO",{day:"numeric",month:"long",year:"numeric"})}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}



function InquiryWidget({ artists, onSubmit }) {
  const [open,setOpen]=useState(false);
  const [step,setStep]=useState("form"); // form | sent
  const [f,setF]=useState({name:"",email:"",country:"NO",eventType:"",date:"",budget:"",artistId:"",message:""});
  const [err,setErr]=useState("");
  const vp=useViewport();

  const BUDGETS=["Under €1,000","€1,000 – 2,500","€2,500 – 5,000","€5,000 – 10,000","€10,000+","Flexible / Open to offers"];
  const approved=artists.filter(a=>a.status==="approved");

  const submit=()=>{
    if(!f.name.trim()||!f.email.includes("@")){setErr("Please enter your name and a valid email.");return;}
    if(!f.message.trim()){setErr("Please describe your event.");return;}
    setErr("");
    // Sanitize inputs before storing
    const sf={...f,name:sanitize(f.name),email:sanitize(f.email),message:sanitize(f.message),eventType:sanitize(f.eventType||"")};
    const inq={...sf,id:`i_${Date.now()}`,status:"new",ts:Date.now()};
    onSubmit(inq);
    // Save to Supabase inquiries table
    if(typeof getSupabase==="function"){
      getSupabase().then(sb=>{
        if(!sb) return;
        sb.from("inquiries").insert([{
          name:         f.name,
          email:        f.email,
          country:      f.country||"NO",
          event_type:   f.eventType,
          date:         f.date,
          budget:       f.budget,
          artist_id:    f.artistId||null,
          message:      f.message,
          status:       "new",
        }]).then(({error})=>{ if(error) console.warn("Inquiry save error:", error.message); });
      });
    }
    setStep("sent");
  };

  const reset=()=>{setStep("form");setF({name:"",email:"",country:"NO",eventType:"",date:"",budget:"",artistId:"",message:""});setErr("");};

  return(
    <>
      {/* Floating concierge button */}
      <div style={{
        position:"fixed",
        bottom:vp.isMobile?"80px":"32px",
        right:vp.isMobile?"16px":"32px",
        zIndex:150,
      }}>
        <button id="awaz-inquiry-widget" onClick={()=>{setOpen(true);reset();}}
          style={{
            display:"flex",alignItems:"center",gap:9,
            background:`linear-gradient(135deg,${C.gold},${C.saffron})`,
            color:C.bg,border:"none",borderRadius:vp.isMobile?"50%":"50px",
            width:vp.isMobile?52:undefined,height:52,
            padding:vp.isMobile?0:"0 20px",
            cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
            fontSize:13,fontWeight:800,letterSpacing:"0.3px",
            boxShadow:`0 8px 32px ${C.gold}55`,
            WebkitTapHighlightColor:"transparent",
            animation:"inquiryPulse 3s ease-in-out infinite",
          }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.bg} strokeWidth="2.2" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {!vp.isMobile&&<span>{t('privateInquiry')}</span>}
        </button>
      </div>

      {/* Inquiry sheet */}
      <Sheet open={open} onClose={()=>setOpen(false)} title={step==="sent"?"":"Private Inquiry"} maxH="96vh">
        {step==="sent"?(
          <div style={{padding:"40px 24px 48px",textAlign:"center"}}>
            {/* Premium sent confirmation */}
            <div style={{width:72,height:72,margin:"0 auto 20px",position:"relative"}}>
              <div style={{position:"absolute",inset:0,borderRadius:"50%",background:C.goldS,border:`2px solid ${C.gold}44`,animation:"spin 6s linear infinite"}}/>
              <div style={{position:"absolute",inset:6,borderRadius:"50%",background:C.gold,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.bg} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:800,color:C.text,marginBottom:10}}>{t('inquiryReceived')}</div>
            <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.9,marginBottom:28,maxWidth:320,margin:"0 auto 28px"}}>
              Thank you, <strong style={{color:C.gold}}>{f.name.split(" ")[0]}</strong>. Your inquiry has been sent directly to the owner. You will receive a personalised response within <strong style={{color:C.text}}>24 hours</strong>.
            </div>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 18px",marginBottom:24,textAlign:"left"}}>
              {[["Event",f.eventType||"Private Event"],["Date",f.date||"To be confirmed"],["Budget",f.budget||"Not specified"],["Country",MARKETS.find(m=>m.code===f.country)?.name||f.country]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:T.sm,marginBottom:7}}>
                  <span style={{color:C.muted}}>{k}</span>
                  <span style={{color:C.text,fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
            <Btn full sz="lg" onClick={()=>setOpen(false)}>Close</Btn>
          </div>
        ):(
          <div style={{padding:"16px 20px 40px",display:"flex",flexDirection:"column",gap:14}}>
            {/* Header branding */}
            <div style={{background:`linear-gradient(135deg,${C.goldS},${C.rubyS})`,borderRadius:12,padding:"16px 18px",display:"flex",gap:12,alignItems:"center",border:`1px solid ${C.gold}22`}}>
              <div style={{width:42,height:42,borderRadius:10,background:C.gold,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:18,color:C.bg,fontWeight:700}}>آ</span>
              </div>
              <div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text}}>{t('directToOwner')}</div>
                <div style={{fontSize:T.xs,color:C.muted,lineHeight:1.5,marginTop:2}}>{t('directToOwnerDesc')}</div>
              </div>
            </div>

            {/* Form fields */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Inp label="Your Name *" placeholder="Full name" value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}/>
              <Inp label="Email *" type="email" placeholder="you@email.com" value={f.email} onChange={e=>setF(p=>({...p,email:e.target.value}))}/>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              <label style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase"}}>{t('country')}</label>
              <select value={f.country} onChange={e=>setF(p=>({...p,country:e.target.value}))}
                style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px 15px",color:C.text,fontSize:T.base,outline:"none",width:"100%",fontFamily:"inherit",minHeight:44,WebkitAppearance:"none"}}>
                {MARKETS.map(m=><option key={m.code} value={m.code}>{m.flag} {m.name}</option>)}
              </select>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Inp label="Event Type" placeholder="Wedding, Eid, Gala…" value={f.eventType} onChange={e=>setF(p=>({...p,eventType:e.target.value}))}/>
              <Inp label="Approximate Date" placeholder="June 2025" value={f.date} onChange={e=>setF(p=>({...p,date:e.target.value}))}/>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              <label style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase"}}>{t('budgetRange')}</label>
              <select value={f.budget} onChange={e=>setF(p=>({...p,budget:e.target.value}))}
                style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px 15px",color:f.budget?C.text:C.muted,fontSize:T.base,outline:"none",width:"100%",fontFamily:"inherit",minHeight:44,WebkitAppearance:"none"}}>
                <option value="">{t('selectRange')}</option>
                {BUDGETS.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              <label style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase"}}>{t('preferredArtist')}</label>
              <select value={f.artistId} onChange={e=>setF(p=>({...p,artistId:e.target.value}))}
                style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px 15px",color:f.artistId?C.text:C.muted,fontSize:T.base,outline:"none",width:"100%",fontFamily:"inherit",minHeight:44,WebkitAppearance:"none"}}>
                <option value="">{t('notSureYet')}</option>
                {approved.map(a=><option key={a.id} value={a.id}>{a.emoji} {a.name} — {a.genre}</option>)}
              </select>
            </div>

            <Inp label="Your Message *" placeholder="Tell us about your event — occasion, number of guests, atmosphere, any special requirements…" value={f.message} onChange={e=>setF(p=>({...p,message:e.target.value}))} rows={4}/>

            {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:8,padding:"10px 13px",color:C.ruby,fontSize:T.xs}}>⚠ {err}</div>}

            <button onClick={submit}
              style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:12,padding:"16px",fontSize:T.md,fontWeight:800,cursor:"pointer",fontFamily:"inherit",minHeight:54,letterSpacing:"0.3px",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.bg} strokeWidth="2.2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Send Private Inquiry
            </button>
            <div style={{textAlign:"center",fontSize:T.xs,color:C.muted,lineHeight:1.6}}>
              Your message goes directly to Awaz. Personal reply within 24 hours.
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

// ── Country Pricing Tab (Artist Portal) ────────────────────────────────
function CountryPricingTab({ artist, onUpdateArtist, vp }) {
  const existing = artist.countryPricing||[];
  const initPricing = () => MARKETS.map(m=>{
    const ex = existing.find((e:any)=>e.code===m.code);
    return ex||{code:m.code, active:false, price:artist.deposit*10, deposit:artist.deposit};
  });
  const [pricing,setPricing]=useState(initPricing);
  const [saved,setSaved]=useState(false);
  const [expanded,setExpanded]=useState<string|null>(null);

  const update=(code:string,field:string,val:any)=>setPricing((p:any[])=>p.map(row=>row.code===code?{...row,[field]:val}:row));

  const save=async(pricingData=pricing)=>{
    onUpdateArtist(artist.id,{countryPricing:pricingData});
    setSaved(true); setTimeout(()=>setSaved(false),3000);
    if(typeof getSupabase==="function"){
      try{
        const sb=await getSupabase();
        if(sb) await sb.from("artists").update({country_pricing:pricingData}).eq("id",artist.id);
      }catch(e){console.warn("Market pricing save:",e);}
    }
  };

  const toggleAndSave=(code:string)=>{
    const newPricing=pricing.map((row:any)=>row.code===code?{...row,active:!row.active}:row);
    setPricing(newPricing);
    save(newPricing);
  };

  const active=pricing.filter((r:any)=>r.active);
  const inactive=pricing.filter((r:any)=>!r.active);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>{t('marketPricing')}</div>
        <div style={{fontSize:T.sm,color:C.muted,lineHeight:1.7,marginBottom:10}}>
          Aktiver landene du er tilgjengelig i. Sett full pris og depositum per land — dette er intern informasjon og vises aldri til kunder.
        </div>
        <div style={{background:`${C.lapis}12`,border:`1px solid ${C.lapis}33`,borderRadius:8,padding:"9px 14px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:14}}>🔒</span>
          <span style={{fontSize:11,color:C.muted,lineHeight:1.5}}>
            <strong style={{color:C.text}}>Prisene er private.</strong> Kunder ser kun hvilke land du kan spille i — ikke beløpene. Prisene brukes internt til å gi smarte prisanbefalinger når du mottar en forespørsel.
          </span>
        </div>
      </div>

      {/* Active markets */}
      {active.length>0&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}>
          <div style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Active in {active.length} market{active.length!==1?"s":""}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {active.map((row:any)=>{
              const m=MARKETS.find(m=>m.code===row.code);
              return(
                <div key={row.code} style={{background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16}}>{m?.flag}</span>
                  <div>
                    <div style={{fontSize:T.xs,fontWeight:700,color:C.emerald}}>{m?.name}</div>
                    <div style={{fontSize:10,color:C.muted}}>€{row.price?.toLocaleString()} · Deposit €{row.deposit?.toLocaleString()}</div>
                  </div>
                  <button onClick={()=>toggleAndSave(row.code)} style={{background:"none",border:"none",color:C.ruby,cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1}}>✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {saved&&<div style={{background:C.emeraldS,border:`1px solid ${C.emerald}33`,borderRadius:8,padding:"10px 14px",color:C.emerald,fontSize:T.xs,fontWeight:700}}>✅ Saved!</div>}

      {/* All markets */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:4}}>Select your markets</div>
        {MARKETS.filter(m=>m.code!=="OTHER").map(m=>{
          const row:any = pricing.find((r:any)=>r.code===m.code)||{code:m.code,active:false,price:artist.deposit*10,deposit:artist.deposit};
          const isActive = row.active;
          return(
            <div key={m.code} style={{background:C.card,border:`1px solid ${isActive?C.emerald+"55":C.border}`,borderRadius:10,overflow:"hidden",transition:"border-color 0.2s"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",cursor:"pointer"}} onClick={()=>setExpanded(expanded===m.code?null:m.code)}>
                <span style={{fontSize:22,flexShrink:0}}>{m.flag}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{m.name}</div>
                  {isActive&&<div style={{fontSize:11,color:C.emerald,marginTop:2}}>€{row.price?.toLocaleString()} · Deposit €{row.deposit?.toLocaleString()}</div>}
                </div>
                <button onClick={e=>{e.stopPropagation();toggleAndSave(m.code);}}
                  style={{background:isActive?C.emerald:C.surface,border:`1px solid ${isActive?C.emerald:C.border}`,borderRadius:20,padding:"5px 14px",color:isActive?"#fff":C.muted,fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
                  {isActive?"On":"Off"}
                </button>
              </div>
              {/* Expanded price editor */}
              {expanded===m.code&&isActive&&(
                <div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.border}`,paddingTop:12}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>
                      <div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:6}}>FULL PRICE (€)</div>
                      <input type="number" value={row.price||""} onChange={e=>update(m.code,"price",parseInt(e.target.value)||0)}
                        style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit"}}/>
                    </div>
                    <div>
                      <div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:6}}>DEPOSIT (€, min 500)</div>
                      <input type="number" value={row.deposit||""} onChange={e=>update(m.code,"deposit",Math.max(500,parseInt(e.target.value)||500))}
                        style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit"}}/>
                    </div>
                  </div>
                  <button onClick={()=>save()} style={{marginTop:10,background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:8,padding:"9px 20px",fontWeight:700,fontSize:T.xs,cursor:"pointer",fontFamily:"inherit"}}>
                    Save Prices ✓
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Admin Inquiry Panel ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
// AWAZ OFFER & COUNTER-OFFER SYSTEM
// ══════════════════════════════════════════════════════════════════

const BUDGET_RANGES=[
  {label:"Under €500",min:0,max:500},
  {label:"€500 – 1,000",min:500,max:1000},
  {label:"€1,000 – 2,500",min:1000,max:2500},
  {label:"€2,500 – 5,000",min:2500,max:5000},
  {label:"€5,000 – 10,000",min:5000,max:10000},
  {label:"€10,000+",min:10000,max:999999},
  {label:"Open to proposals",min:0,max:999999},
];
const DECLINE_REASONS=["Not available on this date","Budget is too low","Event type doesn't match my style","Location too far","Already have a booking that day","Other"];
const PHONE_RE=/(\+?\d[\d\s\-]{7,})/;
const EMAIL_RE2=/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const sanitizeMsg=(t:string)=>t.replace(PHONE_RE,"[contact info removed]").replace(EMAIL_RE2,"[email removed]").slice(0,500);

function ArtistOfferPanel({requests,artist,onAction}:{requests:any[];artist:any;onAction:(id:string,update:any)=>void}){
  const [sel,setSel]=useState<any>(null);
  const [depositAmt,setDepositAmt]=useState("");
  const [balanceAmt,setBalanceAmt]=useState("");
  const [declineReason,setDeclineReason]=useState("");
  const [confirmAction,setConfirmAction]=useState<string|null>(null);
  const [err,setErr]=useState("");
  const [chatMsgs,setChatMsgs]=useState<any[]>([]);
  const [chatInput,setChatInput]=useState("");
  const [chatLoading,setChatLoading]=useState(false);
  const {show:notify}=useNotif();
  const vp=useViewport();
  const chatBottomRef=React.useRef<any>(null);

  const myReqs=requests.filter(r=>r.artistId===artist?.id||r.artist_id===artist?.id);
  const pending=myReqs.filter(r=>["pending","request_received","counter_offered"].includes(r.status));
  const active=myReqs.filter(r=>["offered","accepted"].includes(r.status));
  const history=myReqs.filter(r=>["declined","expired","booked"].includes(r.status));

  const SC:Record<string,string>={request_received:C.saffron,pending:C.saffron,offered:C.lapis,counter_offered:C.gold,accepted:C.emerald,declined:C.ruby,expired:C.muted,booked:C.emerald};
  const SL:Record<string,string>={request_received:"Ny forespørsel",pending:"Ny forespørsel",offered:"Tilbud sendt",counter_offered:"Kunde motbyr",accepted:"Pris avtalt ✓",declined:"Avslått",expired:"Utløpt",booked:"Booket ✓"};

  // Load + realtime for chat messages
  React.useEffect(()=>{
    if(!sel||!HAS_SUPA) return;
    setChatLoading(true);
    let ch:any=null;
    getSupabase().then(async sb=>{
      if(!sb){setChatLoading(false);return;}
      const{data}=await sb.from("booking_messages").select("*").eq("request_id",sel.id).order("created_at",{ascending:true});
      if(data) setChatMsgs(data);
      setChatLoading(false);
      // Realtime subscription
      ch=sb.channel(`bm_artist_${sel.id}`)
        .on("postgres_changes",{event:"INSERT",schema:"public",table:"booking_messages",filter:`request_id=eq.${sel.id}`},(payload:any)=>{
          setChatMsgs(p=>{
            if(p.find(m=>m.id===payload.new.id)) return p;
            return [...p,payload.new];
          });
          if(payload.new.from_role==="customer"){
            notify(`Ny melding fra ${payload.new.sender_name||"kunden"}!`,"message");
            sendBrowserNotif("Ny melding — Awaz",payload.new.text?.slice(0,60)||"");
          }
        }).subscribe();
    });
    return()=>{if(ch) ch.unsubscribe();};
  },[sel?.id]);

  // Scroll chat to bottom
  React.useEffect(()=>{
    if(chatBottomRef.current) chatBottomRef.current.scrollIntoView({behavior:"smooth"});
  },[chatMsgs]);

  const sendChat=async()=>{
    if(!chatInput.trim()||!sel) return;
    const msg={id:crypto.randomUUID(),request_id:sel.id,from_role:"artist",sender_name:artist.name,text:chatInput.trim(),created_at:new Date().toISOString()};
    setChatMsgs(p=>[...p,msg]);
    setChatInput("");
    if(HAS_SUPA){
      const sb=await getSupabase();
      if(sb){
        await sb.from("booking_messages").insert([msg]);
        // Notify customer
        sendEmailNotification({type:"new_chat_message",toEmail:sel.customer_email||sel.customerEmail,toName:sel.customer_name||sel.customerName,fromName:artist.name,message:msg.text,artistName:artist.name});
      }
    }
  };

  const doOffer=async()=>{
    const dep=parseInt(depositAmt);
    const bal=parseInt(balanceAmt)||0;
    if(!dep||dep<50){setErr("Depositum må være minst €50");return;}
    await onAction(sel.id,{status:"offered",artistOffer:dep,artistBalance:bal,counterRound:(sel.counterRound||0)+1});
    // Notify customer by email
    sendEmailNotification({type:"offer_sent",toEmail:sel.customer_email||sel.customerEmail,toName:sel.customer_name||sel.customerName,fromName:artist.name,artistName:artist.name,depositAmount:dep,bookingDate:sel.event_date||sel.eventDate,eventType:sel.event_type||sel.eventType});
    // Send auto-message in chat
    const autoMsg={id:crypto.randomUUID(),request_id:sel.id,from_role:"artist",sender_name:artist.name,text:`Hei! Jeg har sendt deg et pristilbud:\n\n💳 Depositum: €${dep}\n${bal>0?`💵 Saldo etter konsert: €${bal}\n`:""}Gleder meg til å høre fra deg!`,created_at:new Date().toISOString()};
    setChatMsgs(p=>[...p,autoMsg]);
    if(HAS_SUPA){const sb=await getSupabase();if(sb) await sb.from("booking_messages").insert([autoMsg]);}
    setDepositAmt("");setBalanceAmt("");setConfirmAction(null);
    setSel((p:any)=>({...p,status:"offered",artistOffer:dep,artistBalance:bal}));
  };

  const doDecline=async()=>{
    if(!declineReason){setErr("Velg en grunn");return;}
    await onAction(sel.id,{status:"declined",declineReason});
    setDeclineReason("");setSel(null);setConfirmAction(null);
  };

  const qualityBadge=(req:any)=>{
    const s=req.quality_score||req.qualityScore||50;
    const f=req.flagged||s<30;
    if(f) return{label:"⚠ Lav",bg:`${C.ruby}15`,color:C.ruby};
    if(s>=70) return{label:"★ Seriøs",bg:C.emeraldS,color:C.emerald};
    return{label:"OK",bg:C.surface,color:C.muted};
  };

  const ReqCard=({req}:{req:any})=>{
    const h=Math.max(0,(new Date(req.expiresAt||req.expires_at||Date.now()+48*3600000).getTime()-Date.now())/(1000*60*60));
    const isNew=req.status==="request_received"||req.status==="pending";
    const qb=qualityBadge(req);
    const unread=0; // could count unread msgs per req if needed
    return(
      <div onClick={()=>{setSel(req);setErr("");setDepositAmt("");setBalanceAmt("");setDeclineReason("");setConfirmAction(null);setChatMsgs([]);}}
        style={{background:C.card,border:`2px solid ${qb.color===C.ruby?""+C.ruby+"33":isNew?C.gold+"66":C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",marginBottom:10,opacity:qb.color===C.ruby?0.85:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
          <div>
            <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{req.customerName||req.customer_name}</div>
            <div style={{color:C.muted,fontSize:11,marginTop:2}}>{req.eventType||req.event_type} · {req.eventDate||req.event_date}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
            <span style={{background:`${SC[req.status]||C.muted}20`,color:SC[req.status]||C.muted,fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,whiteSpace:"nowrap"}}>{SL[req.status]||req.status}</span>
            <span style={{background:qb.bg,color:qb.color,fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{qb.label}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
          {(req.location||req.event_location_city)&&<span style={{background:C.surface,borderRadius:6,padding:"3px 8px",fontSize:11,color:C.muted}}>📍 {req.location||req.event_location_city}</span>}
          {isNew&&h>0&&h<48&&<span style={{background:`${C.ruby}20`,borderRadius:6,padding:"3px 8px",fontSize:11,color:C.ruby}}>{Math.round(h)}t igjen</span>}
        </div>
      </div>
    );
  };

  if(sel) return(
    <div style={{padding:vp.isMobile?"0":"0 0 0 0",maxWidth:720}}>
      <button onClick={()=>{setSel(null);setChatMsgs([]);}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:T.sm,marginBottom:16,display:"flex",alignItems:"center",gap:6,padding:"4px 0"}}>← Alle forespørsler</button>

      {/* Flagged warning */}
      {(sel.flagged||(sel.quality_score||sel.qualityScore||50)<30)&&(
        <div style={{background:`${C.ruby}12`,border:`1px solid ${C.ruby}44`,borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",gap:10,alignItems:"flex-start"}}>
          <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
          <div><div style={{fontWeight:700,color:C.ruby,fontSize:T.xs,marginBottom:3}}>Automatisk flagget som lav kvalitet</div>
          <div style={{color:C.muted,fontSize:11,lineHeight:1.6}}>Vurder nøye. Du kan avslå uten grunn eller rapportere til admin.</div></div>
        </div>
      )}

      {/* Request details */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:14}}>
        <div style={{height:3,background:`linear-gradient(90deg,${C.gold},${SC[sel.status]||C.gold})`}}/>
        <div style={{padding:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text}}>{sel.eventType||sel.event_type}</div>
              <div style={{color:C.muted,fontSize:T.sm,marginTop:3}}>{sel.eventDate||sel.event_date} · {sel.location||sel.event_location_city||"—"}</div>
            </div>
            <span style={{background:`${SC[sel.status]||C.muted}20`,color:SC[sel.status]||C.muted,padding:"5px 12px",borderRadius:20,fontSize:T.xs,fontWeight:700}}>{SL[sel.status]||sel.status}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:sel.notes?12:0}}>
            {[["Kunde",sel.customerName||sel.customer_name],["E-post",sel.customerEmail||sel.customer_email],["Dato",sel.eventDate||sel.event_date],["Sted",(sel.location||`${sel.event_location_city||""}${sel.event_location_country?", "+sel.event_location_country:""}`.trim())||"—"],["Gjester",(sel.guestCount||sel.guest_count)||"—"],["Bookingtype",sel.bookingType||sel.booking_type||"—"]].map(([k,v])=>(
              <div key={k as string} style={{background:C.surface,borderRadius:8,padding:"9px 12px"}}>
                <div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:3}}>{k}</div>
                <div style={{fontSize:T.sm,color:C.text,wordBreak:"break-all"}}>{v as string||"—"}</div>
              </div>
            ))}
          </div>
          {sel.notes&&<div style={{background:C.surface,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Notat fra kunde</div>
            <div style={{fontSize:T.sm,color:C.textD,lineHeight:1.8}}>{sel.notes}</div>
          </div>}
        </div>
      </div>

      {/* Accepted: confirmation card */}
      {sel.status==="accepted"&&(
        <div style={{background:`linear-gradient(135deg,${C.emerald}12,${C.card})`,border:`2px solid ${C.emerald}55`,borderRadius:12,padding:18,marginBottom:14}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.emerald,marginBottom:12}}>✓ Booking bekreftet!</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div style={{background:C.goldS,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Depositum (Stripe)</div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.6rem",fontWeight:800,color:C.gold}}>€{sel.artistOffer||sel.artist_offer}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:3}}>Du mottar €{Math.round((sel.artistOffer||sel.artist_offer||0)*0.88)} (88%)</div>
            </div>
            {(sel.artistBalance||sel.artist_balance)>0&&(
              <div style={{background:`${C.emerald}10`,border:`1px solid ${C.emerald}33`,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Saldo (kontant)</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.6rem",fontWeight:800,color:C.emerald}}>€{sel.artistBalance||sel.artist_balance}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:3}}>100% til deg etter konsert</div>
              </div>
            )}
          </div>
          <div style={{background:C.surface,borderRadius:8,padding:"10px 14px",fontSize:T.xs,color:C.muted,lineHeight:1.7}}>
            📋 <strong style={{color:C.text}}>Neste steg:</strong> Kunden betaler depositum via Stripe. Du mottar bekreftelse på e-post. Hold av datoen <strong style={{color:C.gold}}>{sel.eventDate||sel.event_date}</strong>.
          </div>
        </div>
      )}

      {/* Active offer summary */}
      {sel.status==="offered"&&(sel.artistOffer||sel.artist_offer)&&(
        <div style={{background:C.goldS,border:`1px solid ${C.gold}44`,borderRadius:10,padding:"12px 16px",marginBottom:14}}>
          <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Ditt aktive tilbud</div>
          <div style={{display:"flex",gap:16,flexWrap:"wrap" as const}}>
            <div><div style={{fontSize:10,color:C.muted}}>Depositum</div><div style={{fontWeight:800,color:C.gold,fontSize:T.lg}}>€{sel.artistOffer||sel.artist_offer}</div></div>
            {(sel.artistBalance||sel.artist_balance)>0&&<div><div style={{fontSize:10,color:C.muted}}>Saldo kontant</div><div style={{fontWeight:800,color:C.emerald,fontSize:T.lg}}>€{sel.artistBalance||sel.artist_balance}</div></div>}
          </div>
        </div>
      )}

      {/* Action panel — only for pending/counter_offered */}
      {["pending","request_received","counter_offered"].includes(sel.status)&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:18,marginBottom:14}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.gold,marginBottom:14}}>Svar på forespørselen</div>
          {confirmAction==="decline"?(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:T.sm,fontWeight:700,color:C.text,marginBottom:4}}>Velg grunn for avslag:</div>
              {DECLINE_REASONS.map(r=><button key={r} onClick={()=>setDeclineReason(r)} style={{background:declineReason===r?`${C.ruby}20`:C.surface,border:`2px solid ${declineReason===r?C.ruby:C.border}`,borderRadius:8,padding:"10px 14px",color:declineReason===r?C.ruby:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:T.sm,textAlign:"left" as const}}>{r}</button>)}
              {err&&<div style={{color:C.ruby,fontSize:T.xs}}>⚠ {err}</div>}
              <div style={{display:"flex",gap:10,marginTop:4}}>
                <Btn v="ghost" onClick={()=>{setConfirmAction(null);setDeclineReason("");setErr("");}}>Avbryt</Btn>
                <Btn v="ruby" onClick={doDecline}>Bekreft avslag</Btn>
              </div>
            </div>
          ):confirmAction==="offer"?(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px"}}>
                <label style={{fontSize:T.xs,fontWeight:700,color:C.gold,display:"block",marginBottom:8}}>💳 Depositum — betales nå via Stripe</label>
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:C.muted,fontWeight:700}}>€</span>
                  <input type="number" value={depositAmt} onChange={e=>setDepositAmt(e.target.value)} min={50} step={50} placeholder="F.eks. 1500" style={{width:"100%",background:C.card,border:`2px solid ${depositAmt?C.gold:C.border}`,borderRadius:8,padding:"12px 14px 12px 30px",color:C.text,fontSize:T.lg,outline:"none",fontFamily:"inherit",boxSizing:"border-box" as const,fontWeight:700}}/>
                </div>
                {depositAmt&&parseInt(depositAmt)>0&&(
                  <div style={{marginTop:8,background:C.goldS,borderRadius:7,padding:"8px 12px",fontSize:12}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.muted}}>Du mottar (88%)</span><strong style={{color:C.gold}}>€{Math.round(parseInt(depositAmt)*0.88)}</strong></div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}><span style={{color:C.muted}}>Awaz plattformgebyr (12%)</span><span style={{color:C.muted}}>€{Math.round(parseInt(depositAmt)*0.12)}</span></div>
                  </div>
                )}
              </div>
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px"}}>
                <label style={{fontSize:T.xs,fontWeight:700,color:C.emerald,display:"block",marginBottom:8}}>💵 Saldo etter konsert — betales kontant til deg</label>
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:C.muted,fontWeight:700}}>€</span>
                  <input type="number" value={balanceAmt} onChange={e=>setBalanceAmt(e.target.value)} min={0} step={50} placeholder="F.eks. 1000 (valgfritt)" style={{width:"100%",background:C.card,border:`2px solid ${balanceAmt?C.emerald:C.border}`,borderRadius:8,padding:"12px 14px 12px 30px",color:C.text,fontSize:T.lg,outline:"none",fontFamily:"inherit",boxSizing:"border-box" as const,fontWeight:700}}/>
                </div>
                {balanceAmt&&parseInt(balanceAmt)>0&&<div style={{marginTop:6,fontSize:11,color:C.emerald}}>100% til deg — Awaz tar ingenting av saldoen</div>}
              </div>
              {depositAmt&&parseInt(depositAmt)>0&&(
                <div style={{background:C.card,border:`1px solid ${C.gold}33`,borderRadius:10,padding:"12px 16px"}}>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:6,textTransform:"uppercase" as const}}>Oppsummering til deg</div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:C.muted,fontSize:T.sm}}>Depositum (88%)</span><strong style={{color:C.gold}}>€{Math.round(parseInt(depositAmt)*0.88)}</strong></div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:C.muted,fontSize:T.sm}}>Saldo kontant</span><strong style={{color:C.emerald}}>€{parseInt(balanceAmt)||0}</strong></div>
                  <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:4}}><span style={{fontWeight:700,color:C.text,fontSize:T.sm}}>Totalt til deg</span><strong style={{color:C.gold,fontSize:T.md}}>€{Math.round(parseInt(depositAmt)*0.88)+(parseInt(balanceAmt)||0)}</strong></div>
                </div>
              )}
              {err&&<div style={{background:C.rubyS,borderRadius:8,padding:"8px 12px",color:C.ruby,fontSize:T.xs}}>⚠ {err}</div>}
              <div style={{display:"flex",gap:10}}>
                <Btn v="ghost" onClick={()=>{setConfirmAction(null);setErr("");}}>Avbryt</Btn>
                <Btn v="gold" onClick={doOffer}>Send tilbud →</Btn>
              </div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <Btn full v="gold" sz="lg" onClick={()=>setConfirmAction("offer")}>Send pristilbud →</Btn>
              <Btn full v="ghost" onClick={()=>setConfirmAction("decline")}>Avslå forespørsel</Btn>
              <button onClick={async()=>{if(!HAS_SUPA) return;const sb=await getSupabase();if(sb){await sb.from("booking_requests").update({flagged:true,flag_reason:"artist_reported"}).eq("id",sel.id);setSel((p:any)=>({...p,flagged:true}));notify("Rapportert til admin","success");}}} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:10,fontFamily:"inherit",textDecoration:"underline",padding:"4px 0"}}>Rapporter misbruk til admin</button>
            </div>
          )}
        </div>
      )}

      {/* ── CHAT — bidirectional, available from offer sent onwards ── */}
      {["offered","accepted","counter_offered","request_received","pending"].includes(sel.status)&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>💬 Chat med {sel.customerName||sel.customer_name}</div>
            {chatMsgs.length>0&&<span style={{fontSize:10,color:C.muted}}>{chatMsgs.length} meldinger</span>}
          </div>
          <div style={{padding:"14px 16px",minHeight:100,maxHeight:280,overflowY:"auto" as const}}>
            {chatLoading?(
              <div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:T.xs}}>Laster meldinger…</div>
            ):chatMsgs.length===0?(
              <div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:T.xs}}>Ingen meldinger ennå. Start samtalen med kunden.</div>
            ):chatMsgs.map(m=>(
              <div key={m.id} style={{marginBottom:10,display:"flex",flexDirection:"column",alignItems:m.from_role==="artist"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"78%",background:m.from_role==="artist"?`linear-gradient(135deg,${C.gold}22,${C.goldS})`:C.surface,border:`1px solid ${m.from_role==="artist"?C.gold+"44":C.border}`,borderRadius:10,padding:"9px 13px",fontSize:T.xs,color:C.text,lineHeight:1.65,whiteSpace:"pre-wrap" as const}}>
                  {m.text}
                </div>
                <div style={{fontSize:9,color:C.faint,marginTop:3}}>{m.from_role==="artist"?"Deg":sel.customerName||sel.customer_name} · {new Date(m.created_at).toLocaleTimeString("nb-NO",{hour:"2-digit",minute:"2-digit"})}</div>
              </div>
            ))}
            <div ref={chatBottomRef}/>
          </div>
          <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8}}>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}}
              placeholder="Skriv melding til kunden…"
              style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={sendChat} style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:8,padding:"0 18px",fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:T.sm}}>→</button>
          </div>
        </div>
      )}
    </div>
  );

  return(
    <div style={{padding:vp.isMobile?"16px":"24px 32px"}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.gold,marginBottom:4}}>Bookingforespørsler</div>
      <div style={{color:C.muted,fontSize:T.sm,marginBottom:20}}>Svar innen 48 timer — ubesvarte forespørsler utløper automatisk</div>
      {pending.length>0&&<div style={{marginBottom:24}}><div style={{fontSize:T.xs,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Trenger svar ({pending.length})</div>{pending.map(r=><ReqCard key={r.id} req={r}/>)}</div>}
      {active.length>0&&<div style={{marginBottom:24}}><div style={{fontSize:T.xs,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Aktive ({active.length})</div>{active.map(r=><ReqCard key={r.id} req={r}/>)}</div>}
      {pending.length===0&&active.length===0&&(
        <div style={{textAlign:"center",padding:"48px 24px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:40,marginBottom:12,color:C.gold}}>✦</div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:6}}>Ingen forespørsler ennå</div>
          <div style={{color:C.muted,fontSize:T.sm}}>Nye bookingforespørsler fra kunder vises her i sanntid.</div>
        </div>
      )}
      {history.length>0&&<div style={{marginTop:8}}><div style={{fontSize:T.xs,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Historikk</div>{history.map(r=><ReqCard key={r.id} req={r}/>)}</div>}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════

function InquiryPanel({ inquiries, artists, onUpdateInquiry, vp }) {
  const [sel,setSel]=useState(null);
  const [replyText,setReplyText]=useState("");
  const [noteText,setNoteText]=useState("");

  const statusColor={new:C.ruby,viewed:C.saffron,replied:C.emerald};
  const statusLabel={new:"New",viewed:"Viewed",replied:"Replied"};

  const markViewed=(inq)=>{
    if(inq.status==="new") onUpdateInquiry(inq.id,{status:"viewed"});
    setSel(inq);setReplyText(inq.reply||"");setNoteText(inq.note||"");
  };

  const sendReply=()=>{
    if(!replyText.trim()) return;
    onUpdateInquiry(sel.id,{status:"replied",reply:replyText,note:noteText,repliedAt:Date.now()});
    setSel(p=>({...p,status:"replied",reply:replyText,note:noteText}));
  };

  const prefArtist=inq=>artists.find(a=>a.id===inq.preferredArtist);
  const market=inq=>MARKETS.find(m=>m.code===inq.country);

  if(sel) return(
    <div style={{padding:vp.isMobile?"16px":"28px 32px",maxWidth:700}}>
      <button onClick={()=>setSel(null)}
        style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:T.sm,marginBottom:16,display:"flex",alignItems:"center",gap:6,minHeight:36}}>← All Inquiries</button>

      {/* Inquiry detail */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:16}}>
        <div style={{height:2,background:`linear-gradient(90deg,${C.gold},${C.ruby})`}}/>
        <div style={{padding:vp.isMobile?16:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text}}>{sel.name}</div>
              <div style={{color:C.muted,fontSize:T.sm,marginTop:3}}>{sel.email}</div>
            </div>
            <Badge color={statusColor[sel.status]||C.muted}>{statusLabel[sel.status]||sel.status}</Badge>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {[["Country",`${market(sel)?.flag} ${market(sel)?.name}`],["Event",sel.eventType||"—"],["Date",sel.date||"—"],["Budget",sel.budget||"—"],["Artist",prefArtist(sel)?`${prefArtist(sel).emoji} ${prefArtist(sel).name}`:"Not specified"]].map(([k,v])=>(
              <div key={k} style={{background:C.surface,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.6px",textTransform:"uppercase",marginBottom:4}}>{k}</div>
                <div style={{fontSize:T.sm,color:C.text,fontWeight:500}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.surface,borderRadius:8,padding:"14px",border:`1px solid ${C.border}`,marginBottom:16}}>
            <div style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.6px",textTransform:"uppercase",marginBottom:8}}>{t('message')}</div>
            <div style={{fontSize:T.sm,color:C.textD,lineHeight:1.8,fontFamily:"'DM Sans',sans-serif"}}>{sel.message}</div>
          </div>
          {sel.status==="replied"&&sel.reply&&(
            <div style={{background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:8,padding:"14px"}}>
              <div style={{fontSize:T.xs,color:C.emerald,fontWeight:700,letterSpacing:"0.6px",textTransform:"uppercase",marginBottom:6}}>{t('yourReply')}</div>
              <div style={{fontSize:T.sm,color:C.textD,lineHeight:1.7}}>{sel.reply}</div>
            </div>
          )}
        </div>
      </div>

      {/* Reply form */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:vp.isMobile?16:24}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.gold,marginBottom:14}}>{sel.status==="replied"?"Update Reply":"Write a Reply"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Inp label="Private Note (internal only)" placeholder="e.g. Spoke to Soraya — she can do 20% discount for June" value={noteText} onChange={e=>setNoteText(e.target.value)} rows={2}/>
          <Inp label="Reply to Customer *" placeholder="Dear [Name], thank you for your inquiry…" value={replyText} onChange={e=>setReplyText(e.target.value)} rows={5}/>
          <Btn v="gold" sz="lg" onClick={sendReply} disabled={!replyText.trim()} xs={{width:"100%"}}>
            {sel.status==="replied"?"Update Reply":"Send Reply to Customer"}
          </Btn>
          <div style={{fontSize:T.xs,color:C.muted,textAlign:"center"}}>In production this sends an email to {sel.email}</div>
        </div>
      </div>
    </div>
  );

  return(
    <div style={{padding:vp.isMobile?"16px":"28px 32px",maxWidth:800}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text}}>
          Inquiries {inquiries.filter(i=>i.status==="new").length>0&&<Badge color={C.ruby}>{inquiries.filter(i=>i.status==="new").length} new</Badge>}
        </div>
      </div>
      {inquiries.length===0?(
        <div style={{textAlign:"center",padding:"48px 24px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
          
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,color:C.text,marginBottom:6}}>{t('noInquiriesYet')}</div>
          <div style={{color:C.muted,fontSize:T.sm}}>{t('noInquiriesDesc')}</div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[...inquiries].sort((a,b)=>b.ts-a.ts).map(inq=>{
            const pref=prefArtist(inq);
            const mkt=market(inq);
            const sc=statusColor[inq.status]||C.muted;
            return(
              <div key={inq.id} onClick={()=>markViewed(inq)}
                style={{background:C.card,border:`2px solid ${inq.status==="new"?C.ruby+"55":C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",WebkitTapHighlightColor:"transparent",transition:"border-color 0.15s"}}>
                <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                  {/* Avatar */}
                  <div style={{width:42,height:42,borderRadius:"50%",background:C.goldS,border:`2px solid ${C.gold}28`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:C.gold,flexShrink:0}}>
                    {inq.name[0]}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,flexWrap:"wrap",gap:6}}>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:T.sm,color:C.text}}>{inq.name}</div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        <Badge color={sc}>{statusLabel[inq.status]||inq.status}</Badge>
                        <span style={{color:C.muted,fontSize:T.xs}}>{new Date(inq.ts).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:6}}>
                      <span style={{fontSize:T.xs,color:C.muted}}>{mkt?.flag} {mkt?.name}</span>
                      {inq.eventType&&<><span style={{color:C.border}}>·</span><span style={{fontSize:T.xs,color:C.muted}}>{inq.eventType}</span></>}
                      {inq.budget&&<><span style={{color:C.border}}>·</span><span style={{fontSize:T.xs,color:C.gold,fontWeight:600}}>{inq.budget}</span></>}
                      {pref&&<><span style={{color:C.border}}>·</span><span style={{fontSize:T.xs,color:pref.color}}>{pref.emoji} {pref.name}</span></>}
                    </div>
                    <div style={{fontSize:T.xs,color:C.textD,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.5}}>{inq.message}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function LangSwitcher({ lang, onSwitch }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const LANGS = [
    { code:'en', label:'English',  short:'EN',  flag:'🇬🇧', rtl:false },
    { code:'no', label:'Norsk',    short:'NO',  flag:'🇳🇴', rtl:false },
    { code:'de', label:'Deutsch',  short:'DE',  flag:'🇩🇪', rtl:false },
    { code:'fr', label:'Français', short:'FR',  flag:'🇫🇷', rtl:false },
    { code:'da', label:'دری',      short:'دری', flag:'🇦🇫', rtl:true  },
    { code:'ps', label:'پښتو',     short:'پښتو',flag:'🇦🇫', rtl:true  },
  ];

  const current = LANGS.find(l=>l.code===lang) || LANGS[0];

  // Close on outside click
  useEffect(()=>{
    if(!open) return;
    const handler = e => { if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return ()=>document.removeEventListener('mousedown', handler);
  },[open]);

  return (
    <div ref={ref} style={{position:'relative',zIndex:500}}>
      {/* Trigger button */}
      <button onClick={()=>setOpen(o=>!o)}
        style={{
          height:36, display:'flex', alignItems:'center', gap:6,
          background:C.surface, border:`1px solid ${open?C.gold:C.border}`,
          borderRadius:8, padding:'0 10px', cursor:'pointer',
          fontFamily:current.rtl?"'Noto Naskh Arabic',sans-serif":"'DM Sans',sans-serif",
          fontSize:12, fontWeight:700, color:C.text,
          WebkitTapHighlightColor:'transparent', transition:'border-color 0.15s',
          whiteSpace:'nowrap',
        }}>
        <span style={{fontSize:14}}>{current.flag}</span>
        <span>{current.short}</span>
        <span style={{
          fontSize:9, color:C.muted, marginLeft:1,
          transform: open?'rotate(180deg)':'rotate(0deg)',
          transition:'transform 0.2s', display:'inline-block',
        }}>▾</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', right:0,
          background:C.card, border:`1px solid ${C.border}`,
          borderRadius:12, overflow:'hidden',
          boxShadow:'0 12px 40px rgba(0,0,0,0.35)',
          minWidth:160,
          animation:'fadeIn 0.15s ease both',
        }}>
          <div style={{height:2, background:`linear-gradient(90deg,${C.ruby},${C.gold},${C.lapis})`}}/>
          {LANGS.map(l=>(
            <button key={l.code} onClick={()=>{ onSwitch(l.code); setOpen(false); }}
              style={{
                display:'flex', alignItems:'center', gap:10,
                width:'100%', padding:'10px 14px',
                background: lang===l.code ? C.goldS : 'transparent',
                border:'none', borderBottom:`1px solid ${C.border}`,
                cursor:'pointer', textAlign:'left',
                fontFamily: l.rtl?"'Noto Naskh Arabic',sans-serif":"'DM Sans',sans-serif",
                fontSize:13, fontWeight: lang===l.code ? 700 : 400,
                color: lang===l.code ? C.gold : C.textD,
                WebkitTapHighlightColor:'transparent',
                transition:'background 0.1s',
                direction: l.rtl ? 'rtl' : 'ltr',
              }}>
              <span style={{fontSize:16, flexShrink:0}}>{l.flag}</span>
              <span style={{flex:1}}>{l.label}</span>
              {lang===l.code && (
                <span style={{fontSize:11, color:C.gold, flexShrink:0}}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Global Error Boundary ──────────────────────────────────────────────
// Catches any render-time errors that would otherwise produce a blank screen.
// Shows a visible fallback with a reload button instead of nothing.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{minHeight:"100vh",background:"#07060B",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans',sans-serif"}}>
          <div style={{background:"#141220",border:"1px solid #201D2E",borderRadius:16,padding:32,maxWidth:420,width:"100%",textAlign:"center"}}>
            
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:"#EDE4CE",marginBottom:8}}>Something went wrong</div>
            <div style={{color:"#8A7D68",fontSize:14,lineHeight:1.7,marginBottom:24,wordBreak:"break-word"}}>
              {this.state.error?.message || "An unexpected error occurred."}
            </div>
            <button
              onClick={()=>window.location.reload()}
              style={{background:"linear-gradient(135deg,#C8A84A,#A87820)",color:"#07060B",border:"none",borderRadius:10,padding:"13px 28px",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════
function AppInner() {
  const vp=useViewport();
  const [theme,setTheme]=useState(()=>{ try{return localStorage.getItem('awaz-theme')||'light';}catch{return 'light';} });
  const toggleTheme=()=>{
    const next=theme==='dark'?'light':'dark';
    _theme=next;
    try{localStorage.setItem('awaz-theme',next);}catch{}
    setTheme(next);
  };
  const [lang,setLang]=useState(()=>{ try{return localStorage.getItem('awaz-lang')||'en';}catch{return 'en';} });
  const switchLang=l=>{
    _lang=l;
    try{localStorage.setItem('awaz-lang',l);}catch{}
    setLang(l);
  };
  const isRTL = isRTLLang(lang);
  const [users,setUsers]=useState([]);  // Users loaded from Supabase only
  const {show:notify}=useNotif();
  const [cookieConsent,setCookieConsent]=useState(()=>localStorage.getItem("awaz_cookie")||"");
  // Handle QR scan: /?request=ARTIST_ID
  const urlReqArtistId = new URLSearchParams(typeof window!=="undefined"?window.location.search:"").get("request");;
  const [showPrivacy,setShowPrivacy]=useState(false);
  const [artists,setArtists]=useState<any[]>([]);
  const [bookings,setBookings]=useState<any[]>([]);
  const [inquiries,setInquiries]=useState<any[]>([]);
  const [adminBookingRequests,setAdminBookingRequests]=useState<any[]>([]);
  const handleNewInquiry=inq=>{setInquiries(p=>[inq,...p]);notify(`New inquiry from ${inq.name||'a visitor'}!`,'inquiry'); sendBrowserNotif('New Inquiry — Awaz',`${inq.name||'Someone'} sent a private inquiry`);};
  const handleUpdateInquiry=(id,updates)=>setInquiries(p=>p.map(i=>i.id===id?{...i,...updates}:i));
  const [session,setSession]=useState(null);
  const [appReady,setAppReady]=useState(!HAS_SUPA); // true immediately if no Supabase
  const [view,setView]=useState("home");
  const [selArtist,setSelArtist]=useState(null);
  const [showLogin,setShowLogin]=useState(false);
  const [loginPrefill,setLoginPrefill]=useState<{mode:string;email:string}|null>(null);
  const [showApply,setShowApply]=useState(false);
  const [showBandBooking,setShowBandBooking]=useState(false);
  const [showBandSent,setShowBandSent]=useState(false);
  const [showContact,setShowContact]=useState(false);
  const [showSongReq,setShowSongReq]=useState(false);
  const [search,setSearch]=useState("");
  const [genreF,setGenreF]=useState("All");
  const [sortBy,setSortBy]=useState<"recommended"|"most_booked"|"most_available"|"price_asc"|"price_desc">("recommended");
  const [occasionF,setOccasionF]=useState("All");

  // Occasion → genre mapping for smart filtering
  const OCCASION_MAP:Record<string,string[]>={
    Wedding:["Ghazal","Herati","Mast","Folk","Classical"],
    Eid:["Pashto","Qarsak","Logari","Folk"],
    Birthday:["Mast","Pop","Fusion","Folk"],
    Concert:["Classical","Fusion","Sufi","Ghazal"],
    Corporate:["Classical","Fusion","Folk"],
  };
  const [menuOpen,setMenuOpen]=useState(false);

  const genres=["All","Ghazal","Herati","Mast","Pashto","Logari","Qarsak","Rubab","Tabla","Classical","Folk","Pop","Fusion","Sufi"];

  // ── Supabase initialisation: session restore + data hydration ─────────
  useEffect(()=>{
    if(!HAS_SUPA){setAppReady(true);return;}
    let unsub=null;
    (async()=>{
      try{
      const sb=await getSupabase();
      if(!sb){setAppReady(true);return;}

      // ── 1. Restore session from Supabase auth (persists across refreshes) ──
      const{data:{session:existingSession}}=await sb.auth.getSession();
      if(existingSession?.user){
        const email=existingSession.user.email?.toLowerCase()||"";
        // Admin check first — hardcoded, no DB needed
        if(ADMIN_EMAILS.includes(email)){
          setSession({
            id:existingSession.user.id,
            email:existingSession.user.email,
            name:"Admin",
            role:"admin",
            artistId:null,
          });
          // Admin: load all data then set ready
          try{
            const[artistRes,inquiryRes,bookingRes,bookingReqRes]=await Promise.all([
              sb.from("artists").select("*"),
              sb.from("inquiries").select("*").order("created_at",{ascending:false}),
              sb.from("bookings").select("*").neq("status","admin_chat"),
              sb.from("booking_requests").select("*").order("created_at",{ascending:false}),
            ]);
            if(bookingReqRes.data?.length>0) setAdminBookingRequests(bookingReqRes.data);
            if(artistRes.data?.length>0) setArtists(artistRes.data.map((a:any)=>({
              id:a.id,name:a.name,nameDari:a.name_dari||"",genre:a.genre||"",location:a.location||"",
              rating:a.rating||0,reviews:a.reviews||0,priceInfo:a.price_info||"On request",
              deposit:a.deposit||1000,emoji:a.emoji||"",color:a.color||"#A82C38",
              photo:a.photo||null,bio:a.bio||"",tags:Array.isArray(a.tags)?a.tags:[],
              instruments:Array.isArray(a.instruments)?a.instruments:[],
              superhost:a.superhost||false,status:a.status||"pending",joined:a.joined_date||"",
              isBoosted:a.is_boosted||false,available:a.available||{},blocked:a.blocked||{},
              earnings:a.earnings||0,totalBookings:a.total_bookings||0,verified:a.verified||false,
              isHidden:a.is_hidden||false,boostedUntil:a.boosted_until||null,
              stripeConnected:a.stripe_connected||false,stripeAccount:a.stripe_account||null,iban:a.bank_iban||null,bankName:a.bank_name||null,
              email:a.email||a.contact_email||"",
              cancellationPolicy:a.cancellation_policy||"moderate",
              spotify:a.spotify_data||null,instagram:a.instagram_data||null,
              youtube:a.youtube_data||null,tiktok:a.tiktok_data||null,
              countryPricing:a.country_pricing||[],currency:a.currency||"EUR",
            })));
            if(inquiryRes.data?.length>0) setInquiries(inquiryRes.data.map((r:any)=>({
              id:r.id,name:r.name,email:r.email,country:r.country||"",
              eventType:r.event_type||"",date:r.date||"",budget:r.budget||"",
              artistId:r.artist_id||"",message:r.message||"",
              status:r.status||"new",reply:r.reply||"",ts:new Date(r.created_at).getTime(),
            })));
            if(bookingRes.data?.length>0) setBookings(bookingRes.data.map((b:any)=>({
              id:b.id,artistId:b.artist_id,customerName:b.customer_name,
              customerEmail:b.customer_email,date:b.date,eventType:b.event_type||b.event||"",
              notes:b.notes||"",deposit:b.deposit||0,status:b.status||"pending",
              depositPaid:b.paid||false,chatUnlocked:b.chat_unlocked||b.paid||false,
              country:b.country||"NO",messages:Array.isArray(b.messages)?b.messages:[],
            })));
          }catch(e){console.warn("Admin init load error:",e);}
          setAppReady(true);
          return; // Admin done — skip non-admin path below
        } else {
        // Check users table first (new schema), then profiles (old schema)
        const{data:dbUser}=await sb.from("users").select("*").eq("id",existingSession.user.id).single();
        const{data:profile}=await sb.from("profiles").select("*").eq("id",existingSession.user.id).single();
        const role=dbUser?.role||profile?.role||"customer";
        // Find artistId — try multiple strategies:
        // 1. profile.artist_id (explicit link)
        // 2. artists.id = user.id (same UUID — most common)
        // 3. artists.email = user.email (fallback for older profiles)
        let artistId=profile?.artist_id||null;
        if(!artistId && role==="artist"){
          // Strategy 2: UUID match
          const{data:aById}=await sb.from("artists").select("id").eq("id",existingSession.user.id).single();
          if(aById) artistId=aById.id;
        }
        if(!artistId && role==="artist" && existingSession.user.email){
          // Strategy 3: email match
          const{data:aByEmail}=await sb.from("artists").select("id").eq("email",existingSession.user.email).single();
          if(aByEmail) artistId=aByEmail.id;
        }
        if(!artistId && role==="artist") artistId=existingSession.user.id;

        // On refresh: if artist, pre-load their profile into artists array
        // so ArtistPortal renders immediately without a loading spinner
        if(role==="artist"&&artistId){
          try{
            const{data:aRow}=await sb.from("artists").select("*").eq("id",artistId).single();
            if(aRow){
              const mapped={
                id:aRow.id,name:aRow.name,nameDari:aRow.name_dari||"",
                genre:aRow.genre||"",location:aRow.location||"",
                rating:aRow.rating||0,reviews:aRow.reviews||0,
                priceInfo:aRow.price_info||"On request",
                deposit:aRow.deposit||1000,
                emoji:aRow.emoji||"",color:aRow.color||"#A82C38",
                photo:aRow.photo||null,bio:aRow.bio||"",
                tags:Array.isArray(aRow.tags)?aRow.tags:[],
                instruments:Array.isArray(aRow.instruments)?aRow.instruments:[],
                superhost:aRow.superhost||false,
                status:aRow.status||"pending",joined:aRow.joined_date||"",
                available:aRow.available||{},blocked:aRow.blocked||{},
                earnings:aRow.earnings||0,totalBookings:aRow.total_bookings||0,
                verified:aRow.verified||false,
                isHidden:aRow.is_hidden||false,
                isBoosted:aRow.is_boosted||false,
                boostedUntil:aRow.boosted_until||null,
                stripeConnected:aRow.stripe_connected||false,
                stripeAccount:aRow.stripe_account||null,
                email:aRow.email||aRow.contact_email||"",
                iban:aRow.bank_iban||null,bankName:aRow.bank_name||null,
                cancellationPolicy:aRow.cancellation_policy||"moderate",
                spotify:aRow.spotify_data||null,
                instagram:aRow.instagram_data||null,
                youtube:aRow.youtube_data||null,
                tiktok:aRow.tiktok_data||null,
                countryPricing:aRow.country_pricing||[],
                currency:aRow.currency||"EUR",
                email:aRow.email||aRow.contact_email||"",
                phone:aRow.phone||aRow.contact_phone||"",
                performingCountries:Array.isArray(aRow.performing_countries)?aRow.performing_countries:[],
              };
              setArtists(prev=>{
                if(prev.find(x=>x.id===aRow.id))
                  return prev.map(x=>x.id===aRow.id?{...x,...mapped}:x);
                return[...prev,mapped];
              });
              // Also load from artist_social table (belt + suspenders)
              try{
                const{data:social}=await sb.from("artist_social").select("*").eq("artist_id",artistId).single();
                if(social){
                  const sp=social.spotify_data?JSON.parse(social.spotify_data):null;
                  const ig=social.instagram_data?JSON.parse(social.instagram_data):null;
                  const yt=social.youtube_data?JSON.parse(social.youtube_data):null;
                  const tt=social.tiktok_data?JSON.parse(social.tiktok_data):null;
                  setArtists(prev=>prev.map(x=>x.id===artistId?{
                    ...x,
                    spotify:   sp||x.spotify,
                    instagram: ig||x.instagram,
                    youtube:   yt||x.youtube,
                    tiktok:    tt||x.tiktok,
                  }:x));
                }
              }catch{/* artist_social table may not exist yet */}
            }
          }catch(e2){console.warn("Artist profile restore failed:",e2);}
        }

        setSession({
          id:existingSession.user.id,
          email:existingSession.user.email,
          name:profile?.name||existingSession.user.email,
          role,
          artistId,
        });
        } // end else (non-admin)
      }

      // ── 2. Subscribe to future auth changes (login/logout) ──
      // Kept simple and clean: just reflect Supabase's auth state into React.
      // Admin protection is handled at the source (ApplySheet uses a separate
      // Supabase client so it never touches this client's session).
      const{data:{subscription}}=sb.auth.onAuthStateChange(async(_event,supaSession)=>{
        try{
          // Skip TOKEN_REFRESHED — no need to re-fetch profile on every token refresh
          // This was causing the "stuck" state after logout/login
          if(_event==="TOKEN_REFRESHED") return;

          if(supaSession?.user){
            const email=supaSession.user.email?.toLowerCase()||"";

            // Admin check — email-based, verified against Supabase Auth
            if(ADMIN_EMAILS.includes(email)){
              setSession({
                id:supaSession.user.id,
                email:supaSession.user.email,
                name:"Admin",
                role:"admin",
                artistId:null,
              });
              // Load admin data if not already loaded
              try{
                const[artistRes, inquiryRes, bookingRes, bookingReqRes2] = await Promise.all([
                  sb.from("artists").select("*"),
                  sb.from("inquiries").select("*").order("created_at",{ascending:false}),
                  sb.from("bookings").select("*").neq("status","admin_chat"),
                  sb.from("booking_requests").select("*").order("created_at",{ascending:false}),
                ]);
                if(bookingReqRes2.data?.length>0) setAdminBookingRequests(bookingReqRes2.data);
                if(artistRes.data?.length>0){
                  setArtists(artistRes.data.map(a=>({
                    id:a.id,name:a.name,nameDari:a.name_dari||"",
                    genre:a.genre||"",location:a.location||"",
                    rating:a.rating||0,reviews:a.reviews||0,
                    priceInfo:a.price_info||"On request",deposit:a.deposit||1000,
                    emoji:a.emoji||"",color:a.color||"#A82C38",
                    photo:a.photo||null,bio:a.bio||"",
                    tags:Array.isArray(a.tags)?a.tags:[],
                    instruments:Array.isArray(a.instruments)?a.instruments:[],
                    superhost:a.superhost||false,
                    status:a.status||"pending",joined:a.joined_date||"",
                    isBoosted:a.is_boosted||false,
                    available:a.available||{},blocked:a.blocked||{},
                    earnings:a.earnings||0,totalBookings:a.total_bookings||0,
                    verified:a.verified||false,isHidden:a.is_hidden||false,
                    boostedUntil:a.boosted_until||null,
                    stripeConnected:a.stripe_connected||false,
                    stripeAccount:a.stripe_account||null,
                    cancellationPolicy:a.cancellation_policy||"moderate",
                    spotify:a.spotify_data||null,instagram:a.instagram_data||null,
                    youtube:a.youtube_data||null,tiktok:a.tiktok_data||null,
                    countryPricing:a.country_pricing||[],currency:a.currency||"EUR",
                  })));
                }
                if(inquiryRes.data?.length>0){
                  setInquiries(inquiryRes.data.map(r=>({
                    id:r.id,name:r.name,email:r.email,country:r.country||"",
                    eventType:r.event_type||"",date:r.date||"",budget:r.budget||"",
                    artistId:r.artist_id||"",message:r.message||"",
                    status:r.status||"new",reply:r.reply||"",
                    ts:new Date(r.created_at).getTime(),
                  })));
                }
                if(bookingRes.data?.length>0){
                  setBookings(bookingRes.data.map(b=>({
                    id:b.id,artistId:b.artist_id,
                    customerName:b.customer_name,customerEmail:b.customer_email,
                    date:b.date,eventType:b.event_type||b.event||"",
                    notes:b.notes||"",deposit:b.deposit||0,
                    status:b.status||"pending",depositPaid:b.paid||false,
                    chatUnlocked:b.chat_unlocked||b.paid||false,
                    country:b.country||"NO",messages:Array.isArray(b.messages)?b.messages:[],
                  })));
                }
              }catch(e){console.warn("Admin data load error:",e);}
              setAppReady(true);
              return;
            }

            // ── STEP 2: Non-admin — parallel fetch for speed ──────────────
            const [userRes, profileRes] = await Promise.all([
              sb.from("users").select("*").eq("id",supaSession.user.id).single(),
              sb.from("profiles").select("*").eq("id",supaSession.user.id).single(),
            ]);
            const dbUser = userRes.data;
            const profile = profileRes.data;
            const role=
              (profile?.role==="artist" ? "artist" : null) ||
              dbUser?.role ||
              profile?.role ||
              "customer";

            let artistId=profile?.artist_id||null;
            if(!artistId && role==="artist"){
              const{data:aById}=await sb.from("artists").select("id").eq("id",supaSession.user.id).single();
              if(aById) artistId=aById.id;
            }
            if(!artistId && role==="artist" && supaSession.user.email){
              const{data:aByEmail}=await sb.from("artists").select("id").eq("email",supaSession.user.email).single();
              if(aByEmail) artistId=aByEmail.id;
            }
            if(!artistId && role==="artist") artistId=supaSession.user.id;

            // ── STEP 3: If artist, load profile + social data in parallel ──
            if(role==="artist"&&artistId){
              try{
                // Parallel: fetch artist row AND artist_social in one go
                const [artistRes, socialRes] = await Promise.all([
                  sb.from("artists").select("*").eq("id",artistId).single(),
                  sb.from("artist_social").select("*").eq("artist_id",artistId).single(),
                ]);
                const aRow = artistRes.data;
                const socialRow = socialRes.data;

                if(aRow){
                  // Merge: prefer artist_social if it exists (most recent save)
                  const parseJ=(v:any)=>{ if(!v) return null; if(typeof v==="string"){try{return JSON.parse(v);}catch{return null;}} return v; };
                  const sp = parseJ(socialRow?.spotify_data)   || aRow.spotify_data   || null;
                  const ig = parseJ(socialRow?.instagram_data) || aRow.instagram_data || null;
                  const yt = parseJ(socialRow?.youtube_data)   || aRow.youtube_data   || null;
                  const tt = parseJ(socialRow?.tiktok_data)    || aRow.tiktok_data    || null;

                  const mapped={
                    id:aRow.id,name:aRow.name,nameDari:aRow.name_dari||"",
                    genre:aRow.genre||"",location:aRow.location||"",
                    rating:aRow.rating||0,reviews:aRow.reviews||0,
                    priceInfo:aRow.price_info||"On request",
                    deposit:aRow.deposit||1000,
                    emoji:aRow.emoji||"",color:aRow.color||"#A82C38",
                    photo:aRow.photo||null,bio:aRow.bio||"",
                    tags:Array.isArray(aRow.tags)?aRow.tags:[],
                    instruments:Array.isArray(aRow.instruments)?aRow.instruments:[],
                    superhost:aRow.superhost||false,
                    status:aRow.status||"pending",joined:aRow.joined_date||"",
                    available:aRow.available||{},blocked:aRow.blocked||{},
                    earnings:aRow.earnings||0,totalBookings:aRow.total_bookings||0,
                    verified:aRow.verified||false,
                    isBoosted:aRow.is_boosted||false,
                    boostedUntil:aRow.boosted_until||null,
                    stripeConnected:aRow.stripe_connected||false,
                    stripeAccount:aRow.stripe_account||null,
                    cancellationPolicy:aRow.cancellation_policy||"moderate",
                    spotify:   sp,
                    instagram: ig,
                    youtube:   yt,
                    tiktok:    tt,
                    countryPricing:aRow.country_pricing||[],
                    currency:aRow.currency||"EUR",
                    email:aRow.email||aRow.contact_email||"",
                    phone:aRow.phone||aRow.contact_phone||"",
                    performingCountries:Array.isArray(aRow.performing_countries)?aRow.performing_countries:[],
                  };
                  setArtists(prev=>{
                    if(prev.find(x=>x.id===aRow.id))
                      return prev.map(x=>x.id===aRow.id?{...x,...mapped}:x);
                    return[...prev,mapped];
                  });
                }
              }catch(e2){console.warn("Artist profile fetch:",e2);}
            }

            setSession({
              id:supaSession.user.id,
              email:supaSession.user.email,
              name:profile?.name||supaSession.user.email,
              role,
              artistId,
            });
          } else {
            // Only clear session on explicit sign-out — not token refresh etc.
            if(_event==="SIGNED_OUT") setSession(null);
          }
        }catch(e){console.warn("Auth state change error:",e);}
      });
      unsub=subscription;

      // ── 3. Load all artists from Supabase ──
      const{data:artistRows}=await sb.from("artists").select("*");
      if(artistRows?.length>0){
        setArtists(prev=>{
          const supaIds=new Set(artistRows.map(a=>a.id));
          const demo=prev.filter(a=>!supaIds.has(a.id));
          const supa=artistRows.map(a=>({
            id:a.id,name:a.name,nameDari:a.name_dari||"",
            genre:a.genre||"",location:a.location||"",
            rating:a.rating||0,reviews:a.reviews||0,
            priceInfo:a.price_info||"On request",
            deposit:a.deposit||1000,
            emoji:a.emoji||"",color:a.color||C.ruby,
            photo:a.photo||null,bio:a.bio||"",
            tags:Array.isArray(a.tags)?a.tags:[],
            instruments:Array.isArray(a.instruments)?a.instruments:[],
            superhost:a.superhost||false,
            status:a.status||"pending",joined:a.joined_date||"",isBoosted:a.is_boosted||false,
            available:a.available||{},blocked:a.blocked||{},
            earnings:a.earnings||0,totalBookings:a.total_bookings||0,
            verified:a.verified||false,
            isHidden:a.is_hidden||false,
            stripeConnected:a.stripe_connected||false,
            stripeAccount:a.stripe_account||null,
            email:a.email||a.contact_email||"",
            cancellationPolicy:a.cancellation_policy||"moderate",
            spotify:a.spotify_data||null,
            instagram:a.instagram_data||null,
            youtube:a.youtube_data||null,
            tiktok:a.tiktok_data||null,
            countryPricing:a.country_pricing||[],
            currency:a.currency||"EUR",
          }));
          return[...demo,...supa];
        });
      }

      // ── 3b. Load inquiries from Supabase ──
      const{data:inquiryRows}=await sb.from("inquiries").select("*").order("created_at",{ascending:false});
      if(inquiryRows?.length>0){
        setInquiries(inquiryRows.map(r=>({
          id:       r.id,
          name:     r.name,
          email:    r.email,
          country:  r.country||"",
          eventType:r.event_type||"",
          date:     r.date||"",
          budget:   r.budget||"",
          artistId: r.artist_id||"",
          message:  r.message||"",
          status:   r.status||"new",
          reply:    r.reply||"",
          ts:       new Date(r.created_at).getTime(),
        })));
      }

      // ── 4. Load bookings (excluding admin_chat which are separate) ──
      const{data:bookingRows}=await sb.from("bookings").select("*").neq("status","admin_chat");
      // Also load admin chat messages for artists
      const{data:adminChatRows}=await sb.from("bookings").select("*").eq("status","admin_chat");
      if(adminChatRows?.length>0){
        setBookings(prev=>{
          const adminMapped=adminChatRows.map(b=>({
            id:b.id,artistId:b.artist_id,customerName:"Awaz Admin",
            customerEmail:"admin@awaz.no",date:"",event:"Admin Message",
            deposit:0,status:"admin_chat",depositPaid:false,
            chatUnlocked:true,messages:b.messages||[],country:"",
          }));
          return[...prev,...adminMapped];
        });
      }
      if(bookingRows?.length>0){
        setBookings(prev=>{
          const supaIds=new Set(bookingRows.map(b=>b.id));
          const local=prev.filter(b=>!supaIds.has(b.id));
          const supa=bookingRows.map(b=>({
            id:b.id,artistId:b.artist_id,
            customerName:b.customer_name,customerEmail:b.customer_email,
            customerPhone:b.customer_phone||"",
            date:b.date,eventType:b.event_type||b.event||"",
            notes:b.notes||"",deposit:b.deposit||0,
            status:b.status||"pending",
            depositPaid:b.deposit_paid||b.paid||false,
            chatUnlocked:b.chat_unlocked||b.deposit_paid||b.paid||false,
            country:b.country||"",
            selectedInstrument:b.selected_instrument||"",
            paymentIntentId:b.payment_intent_id||"",
            messages:Array.isArray(b.messages)?b.messages:[],
            createdAt:b.created_at||"",
          }));
          return[...local,...supa];
        });
      }

      setAppReady(true);

      // ── Real-time: new bookings appear instantly on ALL devices ──────
      try{
        const sbRt=await getSupabase();
        if(sbRt){
          sbRt.channel("awaz-realtime-bookings")
            .on("postgres_changes",{event:"INSERT",schema:"public",table:"bookings"},(payload:any)=>{
              const b=payload.new;
              if(!b) return;
              const mapped={
                id:b.id,artistId:b.artist_id,
                customerName:b.customer_name,customerEmail:b.customer_email,
                customerPhone:b.customer_phone||"",
                date:b.date,eventType:b.event_type||"",
                notes:b.notes||"",deposit:b.deposit||0,
                status:b.status||"confirmed",
                depositPaid:b.deposit_paid||b.paid||false,
                chatUnlocked:b.chat_unlocked||b.deposit_paid||false,
                country:b.country||"",
                selectedInstrument:b.selected_instrument||"",
                messages:[],createdAt:b.created_at||"",
              };
              setBookings(prev=>{
                if(prev.find(x=>x.id===mapped.id)) return prev;
                return [...prev,mapped];
              });
            })
            .subscribe();
        }
      }catch(rtErr){ console.warn("Realtime subscription failed:",rtErr); }
      }catch(err){
        console.error("Supabase init error:",err);
        setAppReady(true);
      }
    })();
    return()=>{ try{unsub?.unsubscribe();}catch{} };
  },[]);
  const approved=useMemo(()=>artists.filter(a=>a.status==="approved"&&!a.isHidden),[artists]);

  // ── Demo profiles — shown when no real artists approved yet ──────────
  const DEMO_ARTISTS = useMemo(()=>[
    {id:"demo-1",name:"Ahmad Shah",nameDari:"احمد شاه",genre:"Ghazal",location:"Oslo, Norway",
     rating:4.9,reviews:47,priceInfo:"From €2,500",deposit:800,emoji:"🎤",
     color:"#8B1A2E",photo:null,bio:"Ahmad Shah is one of Norway's most celebrated Afghan vocalists, known for his soul-stirring Ghazal performances at weddings and cultural events. With over 15 years of experience, he brings authentic Kabul concert hall energy to every event.",
     tags:["Ghazal","Wedding","Eid","Classical"],instruments:["Vocals","Harmonium"],
     superhost:true,status:"approved",joined:"2024-01",isBoosted:true,
     available:{},blocked:{},earnings:0,totalBookings:47,verified:true,
     isHidden:false,boostedUntil:null,stripeConnected:false,stripeAccount:null,
     cancellationPolicy:"moderate",spotify:null,instagram:{handle:"@ahmadshahmusic",followers:"12.4K",profileUrl:"https://instagram.com"},
     youtube:null,tiktok:null,countryPricing:[],currency:"EUR",country:"NO"},
    {id:"demo-2",name:"Laila Karimi",nameDari:"لیلا کریمی",genre:"Herati",location:"Stockholm, Sweden",
     rating:4.8,reviews:31,priceInfo:"From €2,000",deposit:700,emoji:"🎶",
     color:"#1A5C8B",photo:null,bio:"Laila Karimi is a versatile Herati folk singer based in Stockholm. Her enchanting voice and traditional Herati style make her the perfect choice for Afghan weddings, Nowruz celebrations and cultural festivals across Scandinavia.",
     tags:["Herati","Folk","Nowruz","Cultural"],instruments:["Vocals","Dutar"],
     superhost:false,status:"approved",joined:"2024-03",isBoosted:false,
     available:{},blocked:{},earnings:0,totalBookings:31,verified:true,
     isHidden:false,boostedUntil:null,stripeConnected:false,stripeAccount:null,
     cancellationPolicy:"flexible",spotify:null,instagram:{handle:"@lailakarimisings",followers:"8.1K",profileUrl:"https://instagram.com"},
     youtube:null,tiktok:null,countryPricing:[],currency:"EUR",country:"SE"},
    {id:"demo-3",name:"Wahid Qasimi",nameDari:"واحد قاسمی",genre:"Mast",location:"Berlin, Germany",
     rating:4.7,reviews:22,priceInfo:"From €1,800",deposit:600,emoji:"🥁",
     color:"#2D6A4F",photo:null,bio:"Wahid Qasimi brings the high-energy Mast dance music of Afghanistan to stages across Europe. Based in Berlin, he has performed at Afghan community events in Germany, Austria and Switzerland, keeping Afghan wedding traditions alive for the diaspora.",
     tags:["Mast","Wedding","Dance","Party"],instruments:["Tabla","Dhol","Vocals"],
     superhost:false,status:"approved",joined:"2024-05",isBoosted:false,
     available:{},blocked:{},earnings:0,totalBookings:22,verified:true,
     isHidden:false,boostedUntil:null,stripeConnected:false,stripeAccount:null,
     cancellationPolicy:"moderate",spotify:null,instagram:null,
     youtube:null,tiktok:null,countryPricing:[],currency:"EUR",country:"DE"},
    {id:"demo-4",name:"Farhad Sultani",nameDari:"فرهاد سلطانی",genre:"Classical",location:"London, UK",
     rating:5.0,reviews:18,priceInfo:"From €3,500",deposit:1200,emoji:"🪕",
     color:"#6B3A8B",photo:null,bio:"Farhad Sultani is a master Rubab player trained in the classical Afghan tradition. Based in London, his performances captivate audiences with the ancient sound of the national instrument of Afghanistan. Available for concerts, cultural events and intimate private gatherings.",
     tags:["Classical","Rubab","Instrumental","Concert"],instruments:["Rubab","Harmonium"],
     superhost:true,status:"approved",joined:"2023-11",isBoosted:true,
     available:{},blocked:{},earnings:0,totalBookings:18,verified:true,
     isHidden:false,boostedUntil:null,stripeConnected:false,stripeAccount:null,
     cancellationPolicy:"strict",spotify:null,instagram:{handle:"@farhadrubab",followers:"5.6K",profileUrl:"https://instagram.com"},
     youtube:null,tiktok:null,countryPricing:[],currency:"EUR",country:"GB"},
  ], []);

  // Show demo artists only when no real approved artists exist
  const displaySource = approved.length > 0 ? approved : DEMO_ARTISTS;

  const filtered=useMemo(()=>{
    const mk=`${NOW.getFullYear()}-${NOW.getMonth()}`;
    const getOpen=(a:any)=>(a.available?.[mk]||[]).filter((d:any)=>!(a.blocked?.[mk]||[]).includes(d)).length;
    let list=displaySource.filter(a=>{
      const ms=!search||a.name.toLowerCase().includes(search.toLowerCase())||a.genre.toLowerCase().includes(search.toLowerCase())||a.tags.some((tg:string)=>tg.toLowerCase().includes(search.toLowerCase()));
      const mg=genreF==="All"||a.tags.includes(genreF)||a.genre.toLowerCase().includes(genreF.toLowerCase());
      const mo=occasionF==="All"||(OCCASION_MAP[occasionF]||[]).some(g=>a.genre.toLowerCase().includes(g.toLowerCase())||a.tags.some((tg:string)=>tg.toLowerCase().includes(g.toLowerCase())));
      return ms&&mg&&mo;
    });
    if(sortBy==="most_booked") list=[...list].sort((a,b)=>(b.totalBookings||0)-(a.totalBookings||0));
    else if(sortBy==="most_available") list=[...list].sort((a,b)=>getOpen(b)-getOpen(a));
    else if(sortBy==="price_asc") list=[...list].sort((a,b)=>(a.deposit||0)-(b.deposit||0));
    else if(sortBy==="price_desc") list=[...list].sort((a,b)=>(b.deposit||0)-(a.deposit||0));
    else list=[...list].sort((a,b)=>(b.isBoosted?1:0)-(a.isBoosted?1:0)||(b.verified?1:0)-(a.verified?1:0)||(b.totalBookings||0)-(a.totalBookings||0));
    return list;
  },[displaySource,search,genreF,occasionF,sortBy]);

  const login=u=>{setSession(u);setShowLogin(false);requestPushPermission();};
  const logout=async()=>{
    // 1. Clear React state immediately
    setSession(null);
    if(HAS_SUPA){
      try{
        const sb=await getSupabase();
        if(sb) await sb.auth.signOut();
      }catch(e){
        console.warn("Supabase signOut error:",e);
      }
    }
    // 2. Reset Supabase singleton so next login gets a fresh client
    // This prevents stale internal auth state from blocking re-login
    _supabase = null;
  };
  const handleArtistAction=async(id,action)=>{
    if(action==="verify"){
      setArtists(p=>p.map(a=>a.id===id?{...a,verified:true}:a));
      if(HAS_SUPA){
        const sb=await getSupabase();
        if(sb) await sb.from("artists").update({verified:true}).eq("id",id);
      }
    } else if(action==="boost"||action==="unboost"){
      const isBoosted=action==="boost";
      setArtists(p=>p.map(a=>a.id===id?{...a,isBoosted}:a));
      if(HAS_SUPA){
        const sb=await getSupabase();
        if(sb) await sb.from("artists").update({is_boosted:isBoosted,boosted_until:isBoosted?new Date(Date.now()+30*24*60*60*1000).toISOString():null}).eq("id",id);
      }
    } else {
      // Update local state immediately
      setArtists(p=>p.map(a=>a.id===id?{...a,status:action}:a));
      if(HAS_SUPA){
        const sb=await getSupabase();
        if(sb){
          // Update artists.status
          await sb.from("artists").update({status:action}).eq("id",id);
          // CRITICAL: also update users.is_approved so artist can access dashboard
          const isApproved = action==="approved";
          await sb.from("users")
            .update({role:"artist", is_approved:isApproved})
            .eq("id",id); // artists.id = users.id (same UUID from trigger)
          // Also update profiles.role
          await sb.from("profiles")
            .update({role:"artist"})
            .eq("id",id);
        }
      }
    }
  };
  const handleToggle=async(aid,month,year,day)=>{
    let newAvailable={},newBlocked={};
    setArtists(p=>p.map(a=>{
      if(a.id!==aid)return a;
      const k=`${year}-${month}`,av=[...(a.available[k]||[])],bl=[...(a.blocked[k]||[])];
      let updated;
      if(av.includes(day)) updated={...a,available:{...a.available,[k]:av.filter(d=>d!==day)},blocked:{...a.blocked,[k]:[...bl,day]}};
      else if(bl.includes(day)) updated={...a,blocked:{...a.blocked,[k]:bl.filter(d=>d!==day)},available:{...a.available,[k]:[...av,day]}};
      else updated={...a,available:{...a.available,[k]:[...av,day]}};
      newAvailable=updated.available;newBlocked=updated.blocked;
      return updated;
    }));
    // Persist to Supabase immediately
    if(HAS_SUPA&&Object.keys(newAvailable).length>0){
      const sb=await getSupabase();
      if(sb) await sb.from("artists").update({available:newAvailable,blocked:newBlocked}).eq("id",aid);
    }
  };
  const handleUpdateArtist=async(id,updates)=>{
    setArtists(p=>p.map(a=>a.id===id?{...a,...updates}:a));
    if(selArtist?.id===id) setSelArtist(p=>p?{...p,...updates}:p);
    if(!HAS_SUPA) return;
    const dbUpdates:any={};
    if(updates.photo!==undefined)          dbUpdates.photo            = updates.photo;
    if(updates.emoji!==undefined)          dbUpdates.emoji            = updates.emoji;
    if(updates.color!==undefined)          dbUpdates.color            = updates.color;
    if(updates.isBoosted!==undefined)      dbUpdates.is_boosted       = updates.isBoosted;
    if(updates.boostedUntil!==undefined)   dbUpdates.boosted_until    = updates.boostedUntil;
    if(updates.isHidden!==undefined)       dbUpdates.is_hidden        = updates.isHidden;
    if(updates.stripeConnected!==undefined)dbUpdates.stripe_connected = updates.stripeConnected;
    if(updates.stripeAccount!==undefined)  dbUpdates.stripe_account   = updates.stripeAccount;
    if(updates.iban!==undefined)           dbUpdates.bank_iban        = updates.iban;
    if(updates.bankName!==undefined)       dbUpdates.bank_name        = updates.bankName;
    if(updates.available!==undefined)      dbUpdates.available        = updates.available;
    if(updates.blocked!==undefined)        dbUpdates.blocked          = updates.blocked;
    if(updates.countryPricing!==undefined) dbUpdates.country_pricing  = updates.countryPricing;
    if(updates.bio!==undefined)            dbUpdates.bio              = updates.bio;
    if(updates.priceInfo!==undefined)      dbUpdates.price_info       = updates.priceInfo;
    if(updates.deposit!==undefined)        dbUpdates.deposit          = updates.deposit;
    if(updates.currency!==undefined)       dbUpdates.currency         = updates.currency;
    if(updates.cancellationPolicy!==undefined) dbUpdates.cancellation_policy = updates.cancellationPolicy;
    // ── Social media — critical: must persist after logout ──
    if(updates.spotify!==undefined)        dbUpdates.spotify_data     = updates.spotify;
    if(updates.instagram!==undefined)      dbUpdates.instagram_data   = updates.instagram;
    if(updates.youtube!==undefined)        dbUpdates.youtube_data     = updates.youtube;
    if(updates.tiktok!==undefined)         dbUpdates.tiktok_data      = updates.tiktok;
    if(Object.keys(dbUpdates).length>0){
      const sb=await getSupabase();
      if(sb){
        const{error}=await sb.from("artists").update({...dbUpdates,updated_at:new Date().toISOString()}).eq("id",id);
        if(error) console.warn("Artist update failed:",error.message);
        else console.log("✅ Artist updated in DB:",Object.keys(dbUpdates).join(", "));
      }
    }
  };
  const handleNewBooking=async b=>{
    // ── New request-based flow (has artist_id field, no deposit) ──────────
    const isRequest = b.artist_id !== undefined && b.deposit === undefined;
    if(isRequest){
      // This is a booking REQUEST, not a confirmed booking
      notify(`Ny forespørsel fra ${b.customer_name||b.customerName||"en kunde"}!`,'booking');
      sendBrowserNotif('Ny bookingforespørsel — Awaz',
        `${b.customer_name||b.customerName||'En kunde'} ønsker å booke deg`);
      // The Supabase insert already happened in BookingRequestForm.
      // The realtime subscription in ArtistPortal will pick it up automatically.
      return;
    }
    // ── Legacy confirmed booking ──────────────────────────────────────────
    setBookings(p=>[...p,b]);
    notify(`New booking from ${b.customerName||"a customer"}!`,'booking');
    sendBrowserNotif('New Booking — Awaz',`${b.customerName||'A customer'} wants to book you!`);
    if(HAS_SUPA){
      try{
        const sb=await getSupabase();
        if(sb){
          // Generate a proper UUID (Supabase expects UUID format)
          const uuid = b.id.startsWith('b')
            ? crypto.randomUUID()
            : b.id;
          const{error}=await sb.from("bookings").insert([{
            id:           uuid,
            artist_id:    b.artistId,
            customer_name:b.customerName,
            customer_email:b.customerEmail,
            date:         b.date,
            event_type:   b.event||b.eventType||"",
            notes:        b.notes||"",
            deposit:      b.deposit||0,
            status:       b.status||"confirmed",
            paid:         b.depositPaid||false,
            deposit_paid: b.depositPaid||false,
            chat_unlocked:b.chatUnlocked||false,
            country:      b.country||"",
            messages:     b.messages||[],
            selected_instrument: b.selectedInstrument||"",
            created_at:   new Date().toISOString(),
          }]);
          if(error){
            console.error("❌ Booking insert failed:",error.message, error.details);
          } else {
            console.log("✅ Booking saved to Supabase:",uuid);
            // Update local booking id to match DB uuid
            setBookings(p=>p.map(bk=>bk.id===b.id?{...bk,id:uuid}:bk));
          }
        }
      }catch(e:any){
        console.error("Booking save exception:",e.message);
      }
    }
  };
  const handleNewArtist=(a,u,autoLogin=false)=>{
    // Always add artist to local state immediately
    setArtists(prev=>{
      if(prev.find(x=>x.id===a.id)) return prev.map(x=>x.id===a.id?{...x,...a}:x);
      return [...prev, a];
    });
    setUsers(p=>[...p,u]);
    if(autoLogin){
      // Set session → React re-renders → ArtistPortal shows immediately
      setSession({
        id:      u.id,
        email:   u.email,
        name:    u.name,
        role:    "artist",
        artistId:u.artistId,
      });
      setShowApply(false);
    }
  };
  const handleMsg=(bid,m)=>{
    notify('New message received','message');
    setBookings(p=>p.map(b=>{
      if(b.id!==bid)return b;
      const msgs=[...(b.messages||[]),m];
      if(HAS_SUPA){
        getSupabase().then(sb=>{
          if(sb) sb.from("bookings").update({messages:msgs}).eq("id",bid);
        });
      }
      return{...b,messages:msgs};
    }));
  };

  // ── ALL HOOKS MUST BE DECLARED BEFORE ANY CONDITIONAL RETURN ─────────
  // AUTH-FIX-1: prevView was previously declared AFTER conditional returns,
  // violating React Rules of Hooks. Moving it here prevents "change in order
  // of Hooks" crash when session state changes (login/logout).
  const [prevView,setPrevView]=useState("home");

  // AUTH-FIX-3: nav() also moved above conditional returns so it is always
  // in scope regardless of which render path executes.
  // Clean URL for every view
  const VIEW_URLS:Record<string,string>={
    home:"/",browse:"/browse",how:"/how-it-works",
    pricing:"/pricing",band:"/book-a-band",demo:"/demo",
    portal:"/dashboard",admin:"/admin",
  };
  const VIEW_TITLES:Record<string,string>={
    home:"Awaz — Book Afghan Artists",
    browse:"Browse Artists · Awaz",
    how:"How It Works · Awaz",
    pricing:"Pricing · Awaz",
    band:"Book a Band · Awaz",
    portal:"Artist Dashboard · Awaz",
    admin:"Admin · Awaz",
    demo:"Demo · Awaz",
  };

  const nav=(v:string,artist?:any)=>{
    if(v==="profile")setPrevView(view);
    window.scrollTo({top:0,behavior:"instant"});
    setView(v);setMenuOpen(false);
    if(v==="profile"&&artist){
      const slug=slugify(artist.name);
      window.history.pushState({view:"profile",artistId:artist.id},`${artist.name} · Awaz`,`/artist/${slug}`);
      document.title=`${artist.name} · ${artist.genre||"Artist"} · Awaz`;
      let meta=document.querySelector('meta[name="description"]');
      if(!meta){meta=document.createElement("meta");(meta as HTMLMetaElement).name="description";document.head.appendChild(meta);}
      (meta as HTMLMetaElement).content=`Book ${artist.name} for your wedding, Eid or event. ${artist.genre} artist based in ${artist.location}. Secure booking via Awaz.`;
    } else {
      const url=VIEW_URLS[v]||`/?view=${v}`;
      window.history.pushState({view:v},"",url);
      document.title=VIEW_TITLES[v]||"Awaz — Afghan Artist Booking";
    }
  };
  // ── URL routing — runs once on mount ──────────────────────────────
  React.useEffect(()=>{
    const URL_TO_VIEW:Record<string,string>={
      "/":"home","/browse":"browse","/how-it-works":"how",
      "/pricing":"pricing","/book-a-band":"band",
      "/dashboard":"portal","/admin":"admin","/demo":"demo",
    };

    const restore=()=>{
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get("view");
      const path = window.location.pathname.split("?")[0];

      if(path.startsWith("/artist/")){
        const slug=path.replace("/artist/","");
        const tryFind=()=>{
          const found=artists.find(a=>slugify(a.name)===slug&&(a.status==="approved"||a.verified));
          if(found){setSelArtist(found);setView("profile");document.title=`${found.name} · Awaz`;}
          else if(artists.length===0)setTimeout(tryFind,400);
          else setView("browse");
        };
        tryFind();
      } else if(URL_TO_VIEW[path]){
        setView(URL_TO_VIEW[path]);
      } else if(viewParam&&["browse","how","pricing","band","portal","admin"].includes(viewParam)){
        setView(viewParam);
      }
    };
    restore();

    // Handle browser back/forward
    const onPop=(e:PopStateEvent)=>{
      if(e.state?.view) setView(e.state.view);
      else restore();
    };
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[artists.length]);

  // ── Page title updates (MUST be before early returns — React Rules of Hooks) ──
  useEffect(()=>{
    const titles={
      home:"Awaz · آواز — Book Afghan Artists",
      browse:"Browse Artists · Awaz",
      how:"How It Works · Awaz",
      pricing:"Pricing · Awaz",
      profile:selArtist?`${selArtist.name} · Awaz`:"Artist · Awaz",
    };
    document.title=titles[view]||"Awaz · آواز";
  },[view,selArtist]);

    // ── Route to dashboards (after ALL hooks) ────────────────────────────
  if(!appReady&&session?.role==="admin") return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:32,color:C.gold}}>آواز</div>
      <div style={{color:C.muted,fontSize:T.sm}}>Loading admin data…</div>
      <div style={{width:40,height:40,border:`3px solid ${C.border}`,borderTopColor:C.gold,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    </div>
  );
  if(session?.role==="admin") return <AdminDash key={lang+theme} theme={theme} onToggleTheme={toggleTheme} artists={artists} setArtists={setArtists} bookings={bookings} setBookings={setBookings} users={users} inquiries={inquiries} bookingRequests={adminBookingRequests} setBookingRequests={setAdminBookingRequests} onAction={handleArtistAction} onLogout={logout} onMsg={handleMsg} onUpdateInquiry={handleUpdateInquiry}/>;
  if(session?.role==="customer") return <CustomerPortal session={session} artists={artists} onLogout={logout} theme={theme} onToggleTheme={toggleTheme}/>;
  if(session?.role==="artist"){
    const myA=artists.find(a=>a.id===session.artistId);
    // Only show dashboard if artist is approved by admin
    if(myA && myA.status==="approved") return <ArtistPortal key={lang+theme} theme={theme} onToggleTheme={toggleTheme} user={session} artist={myA} bookings={bookings} onLogout={logout} session={session} onToggleDay={handleToggle} onMsg={handleMsg} onUpdateArtist={handleUpdateArtist}/>;
    // Wait for hydration — avoid race condition on page refresh
    if(!appReady) return(
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,fontFamily:"'DM Sans',sans-serif"}}>
        <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:32,color:C.gold}}>آواز</div>
        <div style={{color:C.muted,fontSize:T.sm}}>Loading your dashboard…</div>
        <div style={{width:36,height:36,border:`3px solid ${C.border}`,borderTopColor:C.gold,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      </div>
    );
    // Artist logged in but not in local artists[] yet.
    // This happens on page refresh before Supabase data loads.
    // We trigger a fetch and show a spinner — will re-render when data arrives.
    if(HAS_SUPA && session.artistId){
      getSupabase().then(sb=>{
        if(!sb) return;
        sb.from("artists").select("*").eq("id", session.artistId).single()
          .then(({data:a})=>{
            if(a){
              setArtists(prev=>{
                if(prev.find(x=>x.id===a.id)) return prev;
                return [...prev, {
                  id:a.id, name:a.name, nameDari:a.name_dari||"",
                  genre:a.genre||"", location:a.location||"",
                  rating:a.rating||0, reviews:a.reviews||0,
                  priceInfo:a.price_info||"On request",
                  deposit:a.deposit||1000, emoji:a.emoji||"",
                  color:a.color||"#A82C38", photo:a.photo||null,
                  bio:a.bio||"", tags:Array.isArray(a.tags)?a.tags:[],
                  instruments:Array.isArray(a.instruments)?a.instruments:[],
                  superhost:a.superhost||false, status:a.status||"pending",
                  joined:a.joined_date||"", available:a.available||{},
                  blocked:a.blocked||{}, earnings:a.earnings||0,
                  totalBookings:a.total_bookings||0, verified:a.verified||false,
                  isHidden:a.is_hidden||false,
            stripeConnected:a.stripe_connected||false,
                  stripeAccount:a.stripe_account||null,
                  cancellationPolicy:a.cancellation_policy||"moderate",
                  spotify:a.spotify_data||null, instagram:a.instagram_data||null,
                  youtube:a.youtube_data||null, tiktok:a.tiktok_data||null,
                  countryPricing:a.country_pricing||[], currency:a.currency||"EUR",
                }];
              });
            }
          });
      });
    }
    // Artist logged in but profile not loaded yet — check if pending approval
    // Show appropriate screen based on what we know
    const pendingArtist = artists.find(a => a.id === session.artistId);
    const isPending = !pendingArtist || pendingArtist?.status === "pending";

    return(
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans',sans-serif"}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:32,maxWidth:420,width:"100%",textAlign:"center"}}>
          <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:28,color:C.gold,marginBottom:16}}>آواز</div>
          {isPending ? (
            <>
              
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:C.text,marginBottom:12}}>
                Profile Under Review
              </div>
              <div style={{color:C.muted,fontSize:14,lineHeight:1.8,marginBottom:8}}>
                Welcome, <strong style={{color:C.gold}}>{session.name}</strong>!
              </div>
              <div style={{color:C.muted,fontSize:13,lineHeight:1.8,marginBottom:24}}>
                Your artist profile has been submitted and is being reviewed by the Awaz team. You'll get full access to your dashboard once approved — typically within 24–48 hours.
              </div>
              <div style={{background:"rgba(196,120,32,0.08)",border:`1px solid ${C.saffron}33`,borderRadius:10,padding:"12px 16px",marginBottom:24,fontSize:12,color:C.textD,lineHeight:1.7}}>
                Make sure you've confirmed your email address if required.
              </div>
            </>
          ) : (
            <>
              <div style={{fontSize:36,marginBottom:12}}>🔍</div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:C.text,marginBottom:8}}>
                Profile Not Found
              </div>
              <div style={{color:C.muted,fontSize:13,lineHeight:1.7,marginBottom:16}}>
                Logged in as <strong style={{color:C.gold}}>{session.name}</strong>. Your account exists but the artist profile could not be matched automatically.
              </div>
              <div style={{background:C.goldS,border:`1px solid ${C.gold}33`,borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:12,color:C.textD,lineHeight:1.7,textAlign:"left"}}>
                This can happen if the profile was created with a different email. Try refreshing — if it keeps happening, contact <strong>support@awaz.no</strong> with your email address.
              </div>
              <Btn v="gold" sz="lg" onClick={()=>window.location.reload()} xs={{width:"100%",marginBottom:10}}>
                Refresh & Try Again
              </Btn>
            </>
          )}
          <Btn v="ghost" sz="lg" onClick={logout} xs={{width:"100%"}}>{t('signOut')}</Btn>
        </div>
      </div>
    );
  }



  // If URL has ?request=ARTIST_ID — show song request landing page
  if(urlReqArtistId && artists.length > 0){
    const reqArtist = artists.find(a=>a.id===urlReqArtistId);
    if(reqArtist) return(
      <NotifContext.Provider value={{show:notify}}>
        <SongRequestPage artistId={urlReqArtistId} artists={artists} onBack={()=>window.history.pushState({},"",window.location.pathname)}/>
      </NotifContext.Provider>
    );
  }



  return(
    <div key={lang} dir={isRTL?'rtl':'ltr'} translate="no" style={{background:C.bg,minHeight:"100vh",width:"100%",maxWidth:"100%",margin:0,padding:0,overflowX:"hidden",fontFamily:isRTL?"'Noto Naskh Arabic','DM Sans',sans-serif":"'DM Sans',sans-serif",color:C.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300;1,400;1,600&family=Noto+Naskh+Arabic:wght@400;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
        html,body,#root{margin:0!important;padding:0!important;width:100%;max-width:100vw;overflow-x:hidden;background:${C.bg};box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
        *,*::before,*::after{box-sizing:border-box;}
        input,textarea,select,button{font-family:inherit;-webkit-appearance:none;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes inquiryPulse{0%,100%{box-shadow:0 0 0 0 rgba(200,168,74,0.4)}70%{box-shadow:0 0 0 10px rgba(200,168,74,0)}}
        @keyframes notifSlide{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes notifExit{from{transform:translateX(0);opacity:1}to{transform:translateX(110%);opacity:0}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}
        .notranslate{transform:translateZ(0);}
        input,textarea,select,button{outline:none;}
      `}</style>

      {/* ── Header ── */}
      <header style={{
        position:"fixed",top:0,left:0,right:0,zIndex:100,
        height:vp.isMobile?56:62,
        background:`${C.bg}F4`,backdropFilter:"blur(24px)",
        borderBottom:`1px solid ${C.border}`,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:`0 ${vp.isMobile?16:48}px`,
      }}>
        <div onClick={()=>nav("home")} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:10,WebkitTapHighlightColor:"transparent"}}>
          <div>
            <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:vp.isMobile?17:19,color:C.gold,lineHeight:1}}>آواز</div>
            <div style={{height:1,background:C.gold,opacity:0.4,marginTop:2}}/>
          </div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:vp.isMobile?19:21,fontWeight:700,color:C.text,letterSpacing:"0.3px"}}>Awaz</div>
        </div>

        {vp.isDesktop&&(
          <nav style={{display:"flex",gap:2,alignItems:"center"}}>
            {[[t('browseArtists'),"browse"],[t('howItWorks'),"how"],[t('pricing'),"pricing"]].map(([l,v])=>(
              <button key={v} onClick={()=>nav(v)} style={{background:"transparent",border:"none",color:view===v?C.gold:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:T.sm,fontWeight:500,padding:"6px 13px",borderRadius:6,minHeight:44,WebkitTapHighlightColor:"transparent"}}>
                {l}
              </button>
            ))}
            {/* ── Book a Band — pill badge ── */}
            <button onClick={()=>setShowBandBooking(true)} style={{
              display:"flex",alignItems:"center",gap:6,
              background:"transparent",
              border:`1px solid ${C.gold}66`,
              borderRadius:20,padding:"6px 14px",cursor:"pointer",
              fontFamily:"inherit",fontSize:T.xs,fontWeight:600,
              color:C.gold,minHeight:36,WebkitTapHighlightColor:"transparent",
            }}>
              Book a Band
            </button>
          </nav>
        )}

        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {vp.isDesktop&&<LangSwitcher lang={lang} onSwitch={switchLang}/>}
          {vp.isDesktop&&!session&&(
            <>
              <Btn onClick={()=>setShowLogin(true)} v="gold" sz="sm">{t('signIn')}</Btn>
              <Btn onClick={()=>setShowApply(true)} v="ghost" sz="sm">{t('applyAsArtist')}</Btn>
              <button onClick={toggleTheme} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
                style={{width:36,height:36,borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,color:theme==='dark'?'#C8A84A':C.muted,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0,WebkitTapHighlightColor:'transparent'}}>
                {theme==='dark'?'☀️':'🌙'}
              </button>
            </>
          )}
          {vp.isDesktop&&session&&(
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{color:C.muted,fontSize:T.xs}}>{session.name.split(" ")[0]}</span>
              <Btn onClick={logout} v="ghost" sz="sm">{t('signOut')}</Btn>
              <button onClick={toggleTheme} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
                style={{width:36,height:36,borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,color:theme==='dark'?'#C8A84A':C.muted,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>
                {theme==='dark'?'☀️':'🌙'}
              </button>
            </div>
          )}
          {vp.isMobile&&(
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <LangSwitcher lang={lang} onSwitch={switchLang}/>
              {!session&&(
                <button onClick={()=>setShowLogin(true)}
                  style={{height:32,borderRadius:20,background:"transparent",border:`1px solid ${C.gold}`,color:C.gold,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:"0 14px",fontSize:12,fontWeight:600,fontFamily:"inherit",WebkitTapHighlightColor:"transparent",flexShrink:0,letterSpacing:"0.3px"}}>
                  {t('signIn')}
                </button>
              )}
              {session&&(
                <button onClick={logout}
                  style={{height:32,borderRadius:20,background:"transparent",border:`1px solid ${C.border}`,color:C.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:"0 12px",fontSize:11,fontWeight:500,fontFamily:"inherit",WebkitTapHighlightColor:"transparent",flexShrink:0}}>
                  {t('signOut')}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── HOME ── */}
      {view==="home"&&(
        <div style={{paddingTop:vp.isMobile?56:62}}>

          {/* ── Trust bar ── */}
          <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"8px 16px"}}>
            <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:vp.isMobile?20:40,flexWrap:"nowrap" as const,overflow:"hidden"}}>
              {(vp.isMobile?[
                "Stripe secured",
                "Verified artists",
              ]:[
                "Payments secured by Stripe",
                "Verified artists only",
                "Direct messaging after booking",
                "No hidden fees",
              ]).map(label=>(
                <div key={label} style={{fontSize:11,color:C.muted,fontWeight:500,flexShrink:0,letterSpacing:"0.2px"}}>
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Hero */}
          <section style={{minHeight:vp.isMobile?"85vh":"90vh",display:"flex",flexDirection:"column",justifyContent:"center",position:"relative",overflow:"hidden",background:"transparent"}}>
            <Geo id="hero" op={0.03}/>
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"min(900px,140vw)",height:"min(600px,80vh)",background:`radial-gradient(ellipse,${C.ruby}0A 0%,${C.lapis}06 45%,transparent 70%)`,pointerEvents:"none"}}/>
            <div style={{position:"absolute",bottom:0,left:0,right:0,height:"20%",background:`linear-gradient(to top,${C.bg},transparent)`,pointerEvents:"none"}}/>

            <div style={{
              maxWidth:vp.isMobile?"100%":900,
              margin:"0 auto",
              padding:vp.isMobile?"0 20px":"0 48px",
              position:"relative",zIndex:2,width:"100%",
              textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",
            }}>
              <div className="u0" style={{display:"flex",alignItems:"center",gap:14,marginBottom:vp.isMobile?20:28}}>
                <div style={{height:1,width:vp.isMobile?32:56,background:`linear-gradient(90deg,transparent,${C.gold}44)`}}/>
                <span style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:vp.isMobile?13:15,color:C.gold,opacity:0.78,letterSpacing:"1.5px"}}>{t('heroEyebrow')}</span>
                <div style={{height:1,width:vp.isMobile?32:56,background:`linear-gradient(270deg,transparent,${C.gold}44)`}}/>
              </div>

              <h1 className="u1" translate="no" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["5xl"],fontWeight:800,color:C.text,lineHeight:0.94,margin:"0 0 6px",letterSpacing:vp.isMobile?"-2px":"-3px"}}>
                {t('heroLine1')}
              </h1>
              <h1 className="u1" translate="no" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["5xl"],fontWeight:800,color:C.text,lineHeight:0.94,margin:"0 0 22px",letterSpacing:vp.isMobile?"-2px":"-3px",background:"transparent"}}>
                {t('heroLine2')} <em style={{color:C.ruby,fontStyle:"italic"}}>{t('heroLine2em')}</em>
              </h1>

              <div className="u2" style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,width:"100%",maxWidth:320}}>
                <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${C.gold}38)`}}/>
                <svg width="8" height="8" viewBox="0 0 8 8"><path d="M4 0L5 3L8 4L5 5L4 8L3 5L0 4L3 3Z" fill={C.gold} opacity="0.55"/></svg>
                <div style={{flex:1,height:1,background:`linear-gradient(270deg,transparent,${C.gold}38)`}}/>
              </div>

              <p className="u2" style={{fontFamily:"'DM Sans',sans-serif",color:C.textD,fontSize:vp.isMobile?T.base:T.lg,maxWidth:vp.isMobile?"100%":560,lineHeight:1.8,marginBottom:vp.isMobile?28:36,fontWeight:400}}>
                {t('heroBody')}
              </p>

              {/* Search */}
              <div className="u3" style={{display:"flex",width:"100%",maxWidth:vp.isMobile?"100%":560,background:C.card,borderRadius:12,border:`1px solid ${C.borderM}`,overflow:"hidden",boxShadow:"0 16px 50px rgba(0,0,0,0.7)",marginBottom:24}}>
                <input
                  placeholder={t('searchPlaceholder')}
                  value={search} onChange={e=>setSearch(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&nav("browse")}
                  style={{flex:1,background:"transparent",border:"none",color:C.text,fontSize:T.base,padding:vp.isMobile?"15px 16px":"16px 22px",outline:"none",minWidth:0,minHeight:52}}/>
                <button onClick={()=>nav("browse")}
                  style={{background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",padding:vp.isMobile?"15px 20px":"16px 28px",fontSize:T.base,fontWeight:800,cursor:"pointer",fontFamily:"inherit",flexShrink:0,minHeight:52,WebkitTapHighlightColor:"transparent"}}>
                  {t('searchBtn')}
                </button>
              </div>

              {/* Trust chips */}
              <div className="u3" style={{display:"flex",gap:vp.isMobile?16:22,flexWrap:"wrap",justifyContent:"center"}}>
                {(vp.isMobile
                  ?[["✓",t('trustVerified')],["·",t('trustStripe')],["·",t('trustChat')],["·",t('trustCulture')]]
                  :[["✓",t('trustVerified')],["·",t('trustStripe')],["·",t('trustChat')],["·",t('trustDeposits')],["·",t('trustCulture')]]
                ).map(([icon,l])=>(
                  <div key={l} style={{display:"flex",alignItems:"center",gap:6,fontSize:T.sm,color:C.muted,fontFamily:"'DM Sans',sans-serif"}}>
                    <span style={{color:C.gold,fontSize:13}}>{icon}</span>{l}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Featured artists */}
          <section style={{maxWidth:1240,margin:"0 auto",padding:vp.isMobile?"24px 16px":"60px 48px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:8}}>
              <div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,lineHeight:1}}>{t('featuredTitle')}</div>
                <div style={{color:C.muted,fontSize:T.sm,marginTop:6,fontFamily:"'DM Sans',sans-serif"}}>{t('featuredSub')}</div>
              </div>
              <Btn onClick={()=>nav("browse")} v="ghost" sz="sm">{t('seeAll')}</Btn>
            </div>
            <HR color={C.gold}/>

            {/* Mobile: vertical list | Tablet: 2-col | Desktop: 2-col + AI sidebar */}
            {vp.isDesktop?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:28,alignItems:"start",marginTop:8}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  {displaySource.slice(0,4).map(a=><ArtistCard key={a.id} artist={a} onClick={art=>{setSelArtist(art);setView("profile");}}/>)}
                </div>
                <div style={{position:"sticky",top:80}}>
                  <AIWidget artists={displaySource} onPick={art=>{setSelArtist(art);nav("profile",art);}}/>
                </div>
              </div>
            ):vp.isTablet?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:8}}>
                {displaySource.slice(0,4).map(a=><ArtistCard key={a.id} artist={a} onClick={art=>{setSelArtist(art);nav("profile",art);}}/>)}
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:8}}>
                {displaySource.slice(0,4).map(a=><ArtistCard key={a.id} artist={a} onClick={art=>{setSelArtist(art);nav("profile",art);}} compact/>)}
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════════════════
              🎼  BAND BOOKING FEATURE SECTION
              Full-width showcase — home page only
          ══════════════════════════════════════════════════ */}
          <section style={{
            background:C.surface,
            borderTop:`1px solid ${C.border}`,
            borderBottom:`1px solid ${C.border}`,
            position:"relative",overflow:"hidden",
          }}>
            {/* Background pattern */}
            <div style={{position:"absolute",inset:0,opacity:0.03,backgroundImage:`radial-gradient(circle at 20% 50%, ${C.lapis} 1px, transparent 1px), radial-gradient(circle at 80% 20%, ${C.gold} 1px, transparent 1px)`,backgroundSize:"40px 40px"}}/>

            <div style={{maxWidth:1240,margin:"0 auto",padding:vp.isMobile?"24px 16px 28px":"60px 48px",position:"relative",display:vp.isMobile?"block":"grid",gridTemplateColumns:"1fr 1fr",gap:48,alignItems:"center"}}>

              {/* Left — copy */}
              <div style={{marginBottom:vp.isMobile?0:0}}>
                {/* Afghan flag badge — only the logo uses flag colors */}
                <div style={{display:"inline-flex",alignItems:"center",gap:8,borderRadius:20,padding:"5px 14px",marginBottom:12,background:C.goldS,border:`1px solid ${C.gold}44`}}>
                  <span style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:16,color:C.gold}}>آواز</span>
                  <span style={{fontSize:11,fontWeight:700,color:C.gold,letterSpacing:"1px",textTransform:"uppercase" as const}}>Band Booking</span>
                </div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:vp.isMobile?T.xl:T["3xl"],fontWeight:800,color:C.text,lineHeight:1.1,marginBottom:10}}>
                  Book et afghansk <span style={{color:C.gold}}>ensemble</span>
                </div>
                {!vp.isMobile&&(
                  <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.8,marginBottom:20,maxWidth:440}}>
                    Book et komplett afghansk band til ditt arrangement — artisten setter opp sitt eget band, eller bygg ditt eget med musikere fra plattformen.
                  </div>
                )}

                {/* Two options */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                  {[
                    {label:"Alternativ A",desc:"Artistens eget band",sub:"Artisten bestemmer sammensetningen og antall musikere",icon:"🎼"},
                    {label:"Alternativ B",desc:"Bygg ditt eget",sub:"Velg musikere enkeltvis fra verifiserte artister på plattformen",icon:"🎛️"},
                  ].map(({label,desc,sub,icon})=>(
                    <div key={label} style={{background:C.card,border:`1px solid ${C.gold}22`,borderRadius:10,padding:"10px 12px"}}>
                      <span style={{fontSize:16}}>{icon}</span>
                      <div style={{fontWeight:700,color:C.gold,fontSize:T.xs,marginTop:4}}>{label} — {desc}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:2,lineHeight:1.4}}>{sub}</div>
                    </div>
                  ))}
                </div>

                <button onClick={()=>setShowBandBooking(true)} style={{
                  display:"flex",alignItems:"center",gap:10,
                  background:`linear-gradient(135deg,${C.gold},${C.saffron})`,
                  color:C.bg,border:"none",borderRadius:12,
                  padding:vp.isMobile?"14px 20px":"16px 28px",cursor:"pointer",
                  fontFamily:"inherit",fontWeight:800,fontSize:vp.isMobile?14:16,
                  boxShadow:`0 8px 32px ${C.gold}44`,
                  width:vp.isMobile?"100%":"auto",
                  justifyContent:"center",
                }}>
                  <span style={{fontSize:18}}>🎼</span>
                  Book et band nå →
                </button>
                <div style={{fontSize:11,color:C.muted,marginTop:8,textAlign:vp.isMobile?"center":"left"}}>Gratis å sende forespørsel · Betal kun ved enighet</div>
              </div>

              {/* Right — how it works card */}
              {!vp.isMobile&&(
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,overflow:"hidden",boxShadow:`0 24px 80px rgba(0,0,0,0.12)`}}>
                  <div style={{height:4,background:`linear-gradient(90deg,${C.gold},${C.saffron},transparent)`}}/>
                  <div style={{padding:"24px 20px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                      <span style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:22,color:C.gold}}>آواز</span>
                      <div>
                        <div style={{fontSize:11,fontWeight:700,color:C.gold,letterSpacing:"1px",textTransform:"uppercase" as const}}>AWAZ</div>
                        <div style={{fontSize:10,color:C.muted}}>Afghansk musikk booking</div>
                      </div>
                    </div>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:16}}>Slik fungerer bandbooking</div>

                    {[
                      {icon:"🎤",label:"Alternativ A — Artistens eget band",desc:"Book en vokalist som har satt opp sitt eget faste band. Artisten bestemmer hvem som er med."},
                      {icon:"🎛️",label:"Alternativ B — Bygg ditt eget",desc:"Velg enkeltmusikere fra plattformen — kun de som er tilgjengelige på din dato."},
                      {icon:"💳",label:"Depositum via Stripe",desc:"Kunden betaler depositum for å bekrefte bookingen. Trygt og sikkert."},
                      {icon:"💵",label:"Saldo etter arrangementet",desc:"Restbeløpet betales kontant direkte til artistene på kvelden."},
                    ].map(({icon,label,desc})=>(
                      <div key={label} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                        <span style={{fontSize:18,flexShrink:0,marginTop:2}}>{icon}</span>
                        <div>
                          <div style={{fontWeight:700,color:C.gold,fontSize:T.xs,marginBottom:2}}>{label}</div>
                          <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>{desc}</div>
                        </div>
                      </div>
                    ))}

                    <button onClick={()=>setShowBandBooking(true)} style={{
                      width:"100%",marginTop:16,
                      background:`linear-gradient(135deg,${C.gold},${C.saffron})`,
                      color:C.bg,border:"none",borderRadius:12,padding:"14px",
                      fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",
                    }}>
                      🎼 Start bandbooking →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* How it works */}
          <section style={{background:C.bg,borderTop:`1px solid ${C.border}`,position:"relative",overflow:"hidden"}}>
            <Geo id="hiw" op={0.03}/>
            <div style={{maxWidth:1240,margin:"0 auto",padding:vp.isMobile?"28px 16px":"60px 48px",position:"relative"}}>
              <div style={{textAlign:"center",marginBottom:vp.isMobile?28:44}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:6}}>{t('howSectionTitle')}</div>
                <div style={{color:C.muted,fontSize:T.sm,maxWidth:360,margin:"0 auto",lineHeight:1.5}}>{t('howSectionSub')}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr":vp.isTablet?"repeat(3,1fr)":"repeat(5,1fr)",gap:vp.isMobile?12:16,position:"relative"}}>
                {!vp.isMobile&&<div style={{position:"absolute",top:28,left:"10%",right:"10%",height:1,background:`linear-gradient(90deg,transparent,${C.gold}24,${C.gold}24,transparent)`}}/>}
                {[["1.",t('howStep1Title'),t('howStep1Desc')],["2.",t('howStep2Title'),t('howStep2Desc')],["3.",t('howStep3Title'),t('howStep3Desc')],["4.",t('howStep4Title'),t('howStep4Desc')],["5.",t('howStep5Title'),t('howStep5Desc')]].map(([icon,title,desc],i)=>(
                  vp.isMobile?(
                    <div key={title} style={{display:"flex",gap:14,alignItems:"flex-start",padding:"12px 14px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`}}>
                      <div style={{width:40,height:40,borderRadius:"50%",background:C.bg,border:`1px solid ${C.borderM}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                        <span style={{color:C.gold,fontWeight:700,fontSize:12,position:"absolute"}}>{i+1}</span>
                        {icon}
                      </div>
                      <div><div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:C.text,fontSize:T.md,marginBottom:3}}>{title}</div><div style={{color:C.muted,fontSize:T.xs,lineHeight:1.5}}>{desc}</div></div>
                    </div>
                  ):(
                    <div key={title} style={{textAlign:"center",position:"relative",zIndex:1}}>
                      <div style={{width:54,height:54,borderRadius:"50%",background:C.card,border:`1px solid ${C.borderM}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,margin:"0 auto 14px"}}>{icon}</div>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:C.text,fontSize:T.md,marginBottom:6}}>{title}</div>
                      <div style={{color:C.muted,fontSize:T.xs,lineHeight:1.6,maxWidth:150,margin:"0 auto"}}>{desc}</div>
                    </div>
                  )
                ))}
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer style={{background:C.bg,borderTop:`1px solid ${C.border}`,padding:vp.isMobile?"24px 16px 100px":"44px 48px 32px"}}>
            {vp.isMobile&&(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:16,color:C.gold}}>آواز</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15,fontWeight:700,color:C.text}}>Awaz</div>
                </div>
                <p style={{color:C.muted,fontSize:T.xs,lineHeight:1.7,marginBottom:16}}>{t('footerDesc')}</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:16}}>
                  {[[t('footerBrowse'),()=>nav("browse")],[t('footerApply'),()=>setShowApply(true)],[t('howItWorks'),()=>nav("how")]].map(([l,fn])=>(
                    <button key={l as string} onClick={fn as ()=>void} style={{color:C.muted,fontSize:T.xs,cursor:"pointer",background:"none",border:"none",fontFamily:"inherit",padding:0,minHeight:36}}>{l}</button>
                  ))}
                </div>
                <div style={{color:C.faint,fontSize:T.xs}}>© {YEAR} Awaz AS · All rights reserved</div>
              </div>
            )}
          </footer>
        </div>
      )}


      {/* ── BROWSE ── */}
      {view==="browse"&&(
        <div style={{paddingTop:vp.isMobile?56:62,paddingBottom:vp.isMobile?88:0}}>
          <div style={{maxWidth:1240,margin:"0 auto",padding:vp.isMobile?"16px":"36px 48px"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>{t('browseArtists')}</div>
            <div style={{color:C.muted,fontSize:T.xs,marginBottom:14}}>{t('bookDirectly')}</div>

            {/* Search + Sort row */}
            <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
              <div style={{flex:1,display:"flex",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",alignItems:"center",gap:8,height:52}}>
                <span style={{color:C.muted,fontSize:16}}>🔍</span>
                <input placeholder={t('searchArtists')} value={search} onChange={e=>setSearch(e.target.value)}
                  style={{flex:1,background:"transparent",border:"none",color:C.text,fontSize:T.base,outline:"none",height:"100%",minWidth:0}}/>
                {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1,flexShrink:0,minWidth:32,minHeight:32}}>×</button>}
              </div>
              {!vp.isMobile&&(
                <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)}
                  style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",height:52,color:C.text,fontSize:T.xs,fontWeight:600,fontFamily:"inherit",cursor:"pointer",outline:"none",flexShrink:0}}>
                  <option value="recommended">⭐ Recommended</option>
                  <option value="most_booked">🔥 Most Booked</option>
                  <option value="most_available">📅 Most Available</option>
                  <option value="price_asc">€ Price: Low → High</option>
                  <option value="price_desc">€ Price: High → Low</option>
                </select>
              )}
            </div>

            {/* Occasion shortcuts — emotional triggers */}
            <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch",scrollbarWidth:"none",marginBottom:10}}>
              {([
                {k:"All",label:"All Events"},
                {k:"Wedding",label:"Wedding"},
                {k:"Eid",label:"Eid"},
                {k:"Birthday",label:"Birthday"},
                {k:"Concert",label:"Concert"},
                {k:"Corporate",label:"Corporate"},
              ] as const).map(({k,label})=>(
                <button key={k} onClick={()=>setOccasionF(k)}
                  style={{background:occasionF===k?C.gold:C.card,color:occasionF===k?C.bg:C.muted,border:`1px solid ${occasionF===k?C.gold:C.border}`,borderRadius:20,padding:"7px 16px",fontSize:T.xs,fontWeight:occasionF===k?700:500,cursor:"pointer",fontFamily:"inherit",flexShrink:0,minHeight:36,whiteSpace:"nowrap",transition:"all 0.15s",letterSpacing:"0.2px"}}>
                  {label}
                </button>
              ))}
            </div>

            {/* Genre filters — horizontal scroll on mobile */}
            <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:8,WebkitOverflowScrolling:"touch",scrollbarWidth:"none",marginBottom:10}}>
              {genres.map(g=>(
                <button key={g} onClick={()=>setGenreF(g)}
                  style={{background:genreF===g?C.ruby:C.card,color:genreF===g?"#fff":C.muted,border:`1px solid ${genreF===g?C.ruby:C.border}`,borderRadius:20,padding:vp.isMobile?"8px 14px":"8px 16px",fontSize:T.xs,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flexShrink:0,minHeight:36,WebkitTapHighlightColor:"transparent",whiteSpace:"nowrap",transition:"all 0.15s"}}>
                  {g}
                </button>
              ))}
            </div>

            {/* Results count + active filters summary */}
            {filtered.length===0?(
              <div style={{textAlign:"center",padding:"40px 24px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:32,marginBottom:12}}>🎵</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:6}}>{t('noArtistsFound')}</div>
                <div style={{color:C.muted,fontSize:T.sm,marginBottom:16}}>{t('tryDifferent')}</div>
                <Btn v="ghost" sz="md" onClick={()=>{setSearch("");setGenreF("All");setOccasionF("All");setSortBy("recommended");}}>{t('clearFilters')}</Btn>
              </div>
            ):vp.isMobile?(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {displaySource.filter(a=>a.isBoosted).map(a=>(
                  <div key={a.id+"boost"} onClick={()=>{setSelArtist(a);nav("profile",a);}} style={{position:"relative",cursor:"pointer",borderRadius:12,overflow:"hidden",border:`2px solid ${C.gold}55`}}>
                    <div style={{position:"absolute",top:8,right:8,zIndex:2,background:`linear-gradient(135deg,${C.gold},${C.saffron})`,borderRadius:12,padding:"2px 8px",fontSize:9,fontWeight:800,color:C.bg}}>⭐ FEATURED</div>
                    <ArtistCard artist={a} onClick={art=>{setSelArtist(art);nav("profile",art);}} compact/>
                  </div>
                ))}
                {filtered.filter(a=>!a.isBoosted).map(a=><ArtistCard key={a.id} artist={a} onClick={art=>{setSelArtist(art);nav("profile",art);}} compact/>)}
              </div>
            ):(
              <div>
                {displaySource.filter(a=>a.isBoosted).length>0&&(
                  <div style={{marginBottom:24}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                      <div style={{height:1,flex:1,background:`linear-gradient(90deg,${C.gold}33,transparent)`}}/>
                      <span style={{color:C.gold,fontSize:T.xs,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase"}}>Featured Artists</span>
                      <div style={{height:1,flex:1,background:`linear-gradient(270deg,${C.gold}33,transparent)`}}/>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:`repeat(${vp.isTablet?2:3},1fr)`,gap:16}}>
                      {displaySource.filter(a=>a.isBoosted).map(a=>(
                        <div key={a.id+"feat"} onClick={()=>{setSelArtist(a);nav("profile",a);}} style={{position:"relative",cursor:"pointer",borderRadius:14,overflow:"hidden",border:`2px solid ${C.gold}55`,boxShadow:`0 0 20px ${C.gold}18`}}>
                          <div style={{position:"absolute",top:10,right:10,zIndex:2,background:`linear-gradient(135deg,${C.gold},${C.saffron})`,borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:800,color:C.bg,letterSpacing:"0.5px"}}>⭐ FEATURED</div>
                          <ArtistCard artist={a} onClick={art=>{setSelArtist(art);nav("profile",art);}}/>
                        </div>
                      ))}
                    </div>
                    <div style={{height:1,background:C.border,margin:"20px 0"}}/>
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:`repeat(${vp.isTablet?2:3},1fr)`,gap:16}}>
                  {filtered.filter(a=>!a.isBoosted).map(a=><ArtistCard key={a.id} artist={a} onClick={art=>{setSelArtist(art);nav("profile",art);}}/>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROFILE ── */}
      {view==="profile"&&selArtist&&(
        <div style={{paddingTop:vp.isMobile?56:62}}>
          <ProfilePage artist={selArtist} artists={artists} bookings={bookings} session={session} onBack={()=>nav(prevView||"browse")} onBookingCreated={handleNewBooking} onLoginRequest={(mode,prefill)=>{setLoginPrefill({mode,email:prefill});setShowLogin(true);}}/>
        </div>
      )}

      {/* ── HOW IT WORKS ── */}
      {view==="demo"&&(
        <DemoPage onBook={()=>nav("browse")} onApply={()=>setShowApply(true)} vp={vp}/>
      )}

      {view==="how"&&(()=>{
        // ── Step data — rewritten for clarity, trust, conversion ────────
        const steps=[
          {
            n:"01", icon:"🔍", color:C.lapis,
            title:t('step1Title'),
            desc:t('step1Desc'),
            badge:t('step1Badge'),
          },
          {
            n:"02", icon:"📅", color:C.emerald,
            title:t('step2Title'),
            desc:t('step2Desc'),
            badge:t('step2Badge'),
          },
          {
            n:"03", icon:"✍️", color:C.saffron,
            title:t('step3Title'),
            desc:t('step3Desc'),
            badge:t('step3Badge'),
          },
          {
            n:"04", icon:"💳", color:"#635BFF",
            title:t('step4Title'),
            desc:t('step4Desc'),
            badge:t('step4Badge'),
          },
          {
            n:"05", icon:"💬", color:C.ruby,
            title:t('step5Title'),
            desc:t('step5Desc'),
            badge:t('step5Badge'),
          },
          {
            n:"06", icon:"🎉", color:C.gold,
            title:t('step6Title'),
            desc:t('step6Desc'),
            badge:t('step6Badge'),
          },
        ];

        // ── Contrast-safe text colors (WCAG AAA on #07060B bg) ──────────
        // #EDE4CE = 11.4:1 (AAA) — primary text
        // #C8BBA0 = 7.1:1  (AAA) — body text
        // #A89470 = 4.6:1  (AA)  — original muted — upgraded to above
        const bodyText  = "#C8BBA0";  // AAA contrast on dark bg
        const labelText = "#8A7D68";  // muted labels

        return(
          <div style={{paddingTop:vp.isMobile?56:62,paddingBottom:vp.isMobile?104:60,background:C.bg}}>

            {/* ── Page hero ── */}
            <div style={{
              maxWidth:720,margin:"0 auto",
              padding:vp.isMobile?"40px 20px 32px":"72px 48px 48px",
              textAlign:"center",
            }}>
              {/* Eyebrow */}
              <div style={{
                display:"inline-flex",alignItems:"center",gap:8,
                background:`${C.gold}10`,border:`1px solid ${C.gold}28`,
                borderRadius:40,padding:"6px 16px",marginBottom:vp.isMobile?20:24,
              }}>
                <span style={{fontSize:12}}>✦</span>
                <span style={{
                  fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,
                  color:C.gold,letterSpacing:"1.2px",textTransform:"uppercase",
                }}>Simple &amp; transparent</span>
                <span style={{fontSize:12}}>✦</span>
              </div>

              {/* Main headline */}
              <h1 style={{
                fontFamily:"'Cormorant Garamond',serif",
                fontSize:vp.isMobile?"clamp(38px,9vw,48px)":"clamp(52px,5vw,68px)",
                fontWeight:800,lineHeight:0.95,
                color:C.text,margin:"0 0 20px",
                letterSpacing:vp.isMobile?"-1.5px":"-2.5px",
              }}>
                { t('howTitle') }<br/>
                <em style={{color:C.gold,fontStyle:"italic"}}>{t('howTitleEm')}</em>
              </h1>

              {/* Sub-headline */}
              <p style={{
                fontFamily:"'DM Sans',sans-serif",
                fontSize:vp.isMobile?16:18,fontWeight:400,
                color:bodyText,lineHeight:1.75,
                margin:"0 auto",maxWidth:480,
              }}>
                From discovery to performance — the entire booking process
                is designed to be fast, safe, and completely transparent.
              </p>
            </div>

            {/* ── Steps ── */}
            <div style={{
              maxWidth:680,margin:"0 auto",
              padding:vp.isMobile?"0 16px":"0 48px",
              display:"flex",flexDirection:"column",
              gap:vp.isMobile?16:12,
            }}>
              {steps.map((s,i)=>(
                <div key={s.n} style={{
                  position:"relative",
                  background:C.card,
                  border:`1px solid ${C.border}`,
                  borderLeft:`3px solid ${s.color}`,
                  borderRadius:16,
                  padding:vp.isMobile?"22px 20px":"28px 32px",
                  display:"flex",gap:vp.isMobile?16:24,
                  alignItems:"flex-start",
                  // Subtle glow on left edge matching step color
                  boxShadow:`-2px 0 24px ${s.color}0C`,
                }}>

                  {/* Step number */}
                  <div style={{
                    flexShrink:0,
                    fontFamily:"'Cormorant Garamond',serif",
                    fontSize:vp.isMobile?13:14,fontWeight:700,
                    color:labelText,letterSpacing:"2px",
                    paddingTop:4,
                  }}>{s.n}</div>

                  {/* Text column */}
                  <div style={{flex:1,minWidth:0,paddingTop:2}}>

                    {/* Title */}
                    <div style={{
                      fontFamily:"'Cormorant Garamond',serif",
                      fontSize:vp.isMobile?"clamp(19px,5vw,22px)":24,
                      fontWeight:700,lineHeight:1.15,
                      color:C.text,
                      marginBottom:vp.isMobile?8:10,
                      letterSpacing:"-0.3px",
                    }}>{s.title}</div>

                    {/* Description — DM Sans for body, not serif */}
                    <p style={{
                      fontFamily:"'DM Sans',sans-serif",
                      fontSize:vp.isMobile?15:15.5,
                      fontWeight:400,
                      color:bodyText,
                      lineHeight:1.8,
                      margin:"0 0 12px",
                    }}>{s.desc}</p>

                    {/* Badge */}
                    <div style={{
                      display:"inline-flex",alignItems:"center",gap:5,
                      background:`${s.color}10`,
                      border:`1px solid ${s.color}28`,
                      borderRadius:20,
                      padding:"4px 12px",
                    }}>
                      <div style={{width:5,height:5,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                      <span style={{
                        fontFamily:"'DM Sans',sans-serif",
                        fontSize:11,fontWeight:700,
                        color:s.color,letterSpacing:"0.6px",
                        textTransform:"uppercase",
                      }}>{s.badge}</span>
                    </div>
                  </div>

                  {/* Connector line between steps (not on last) */}
                  {i<steps.length-1&&(
                    <div style={{
                      position:"absolute",
                      left:vp.isMobile?47:55,
                      bottom:vp.isMobile?-17:-13,
                      width:1,height:vp.isMobile?17:13,
                      background:`linear-gradient(to bottom,${s.color}40,${steps[i+1].color}30)`,
                      zIndex:1,
                    }}/>
                  )}
                </div>
              ))}
            </div>

            {/* ── Trust bar ── */}
            <div style={{
              maxWidth:680,margin:vp.isMobile?"32px auto 0":"40px auto 0",
              padding:vp.isMobile?"0 16px":"0 48px",
            }}>
              <div style={{
                background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:16,padding:vp.isMobile?"20px":"24px 32px",
                display:"grid",
                gridTemplateColumns:vp.isMobile?"1fr 1fr":"repeat(4,1fr)",
                gap:vp.isMobile?16:0,
              }}>
                {[
                  ["·",t('trustStripe'),t('trustStripeDesc')],
                  ["✓",t('trustVerified'),t('trustVerifiedDesc')],
                  ["·",t('trustChat'),t('trustChatDesc')],
                  ["0%",t('trustFees'),t('trustFeesDesc')],
                ].map(([icon,title,sub],i)=>(
                  <div key={title} style={{
                    textAlign:"center",
                    borderRight:(!vp.isMobile&&i<3)?`1px solid ${C.border}`:"none",
                    padding:vp.isMobile?"0":"0 16px",
                  }}>
                    <div style={{fontSize:vp.isMobile?22:20,marginBottom:5}}>{icon}</div>
                    <div style={{
                      fontFamily:"'DM Sans',sans-serif",
                      fontSize:vp.isMobile?13:13,fontWeight:700,
                      color:C.text,marginBottom:3,
                    }}>{title}</div>
                    <div style={{
                      fontFamily:"'DM Sans',sans-serif",
                      fontSize:vp.isMobile?11:11,fontWeight:400,
                      color:labelText,lineHeight:1.5,
                    }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── CTA ── */}
            <div style={{
              maxWidth:560,margin:"0 auto",
              padding:vp.isMobile?"24px 20px 0":"36px 48px 0",
              display:"flex",
              flexDirection:"column",
              gap:10,alignItems:"stretch",
            }}>
              <Btn onClick={()=>nav("browse")} v="gold" sz="xl"
                xs={{width:"100%",justifyContent:"center"}}>
                Browse Artists Now →
              </Btn>

              <div style={{display:"flex",gap:10}}>
                {/* Band Booking CTA */}
                <button onClick={()=>setShowBandBooking(true)} style={{
                  flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  background:`linear-gradient(135deg,rgba(30,78,140,0.18),rgba(30,78,140,0.08))`,
                  border:`2px solid ${C.lapis}`,
                  borderRadius:12,padding:"13px 16px",
                  cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s",
                }}>
                  <span style={{fontSize:16}}>🎼</span>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontWeight:800,fontSize:13,color:C.lapis}}>Book a Band</div>
                    <div style={{fontSize:10,color:C.muted}}>from €500</div>
                  </div>
                </button>

                <Btn onClick={()=>setShowApply(true)} v="ghost" sz="lg"
                  xs={{flex:1,justifyContent:"center"}}>
                  Apply as Artist
                </Btn>
              </div>
            </div>

          </div>
        );
      })()}

      {/* ── PRICING ── */}
      {view==="pricing"&&(
        <div style={{paddingTop:vp.isMobile?56:62,paddingBottom:vp.isMobile?88:0}}>
          <div style={{maxWidth:800,margin:"0 auto",padding:vp.isMobile?"24px 16px":"60px 48px"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["3xl"],fontWeight:800,color:C.text,marginBottom:4}}>{t('pricingTitle')}</div>
            <div style={{color:C.muted,fontSize:T.sm,marginBottom:20}}>{t('pricingSubtitle')}</div>
            <HR color={C.gold}/>
            <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr":"1fr 1fr",gap:14,marginTop:16,marginBottom:28}}>
              {[{label:t('forClients'),icon:"",color:C.gold,items:[t('pricingClient1'),t('pricingClient2'),t('pricingClient3'),t('pricingClient4'),t('pricingClient5')]},
                {label:t('forArtists'),icon:"",color:C.ruby,items:[t('pricingArtist1'),t('pricingArtist2'),t('pricingArtist3'),t('pricingArtist4'),t('pricingArtist5'),t('pricingArtist6')]}].map(({label,icon,color,items})=>(
                <div key={label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                  <div style={{height:3,background:`linear-gradient(90deg,${color},${C.gold})`}}/>
                  <div style={{padding:vp.isMobile?16:22}}>
                    <div style={{fontSize:28,marginBottom:8}}>{icon}</div>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:14}}>{label}</div>
                    {items.map((item,i)=>(
                      <div key={i} style={{display:"flex",gap:10,marginBottom:10,fontSize:T.sm,color:C.textD}}>
                        <span style={{color,flexShrink:0}}>✓</span>{item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:vp.isMobile?16:22}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.gold,marginBottom:6,textAlign:"center"}}>{t('depositSplit')}</div>
              {/* Tagline */}
              <div style={{textAlign:"center",color:C.muted,fontSize:T.sm,marginBottom:16,lineHeight:1.6}}>
                You keep the majority of your earnings. We only take a small platform fee from the deposit.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[["Artist deposit","Set by artist\nmin €500",C.gold],["You receive","88% direct\nto Stripe",C.emerald],["Awaz fee","12% platform\noperations",C.lapis]].map(([l,v,c])=>(
                  <div key={l} style={{background:C.surface,borderRadius:8,padding:"12px",border:`1px solid ${C.border}`,borderTop:`3px solid ${c}38`,textAlign:"center"}}>
                    <div style={{color:c,fontWeight:700,fontSize:T.xs,marginBottom:4}}>{l}</div>
                    <div style={{color:C.text,fontSize:T.xs,lineHeight:1.4,whiteSpace:"pre-line"}}>{v}</div>
                  </div>
                ))}
              </div>
              {/* Example calculation */}
              <div style={{marginTop:14,background:C.surface,borderRadius:8,padding:"12px 14px",border:`1px solid ${C.emerald}22`,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                
                <span style={{color:C.muted,fontSize:T.xs,lineHeight:1.6}}>
                  Example: For a <strong style={{color:C.text}}>€1,000</strong> deposit, you receive <strong style={{color:C.emerald}}>€880</strong> automatically to your Stripe account. Awaz keeps <strong style={{color:C.lapis}}>€120</strong>.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER (desktop + tablet, public pages only) ── */}
      {!vp.isMobile&&["home","browse","how","pricing"].includes(view)&&(
        <footer style={{borderTop:`1px solid ${C.border}`,background:C.surface,marginTop:60,paddingBottom:40}}>
          <div style={{maxWidth:1200,margin:"0 auto",padding:"40px 48px 0"}}>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:40,marginBottom:32}}>
              {/* Brand */}
              <div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:C.text,marginBottom:4,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontFamily:"'Noto Naskh Arabic',serif",color:C.gold}}>آواز</span> Awaz
                </div>
                <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.8,maxWidth:280,marginBottom:16}}>
                  The premier booking platform for Afghan artists performing across Europe. Transparent pricing, instant payments, real culture.
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {[["·","Stripe Secure"],["✓","Verified Artists"],["·","Europe-wide"]].map(([i,l])=>(
                    <span key={l} style={{fontSize:T.xs,color:C.muted,display:"flex",alignItems:"center",gap:4}}>
                      <span style={{color:C.gold}}>{i}</span>{l}
                    </span>
                  ))}
                </div>
              </div>
              {/* Platform */}
              <div>
                <div style={{fontSize:T.xs,fontWeight:700,color:C.text,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:14}}>Platform</div>
                {[["Browse Artists",()=>nav("browse")],["How It Works",()=>nav("how")],["Pricing",()=>nav("pricing")]].map(([l,fn])=>(
                  <button key={l as string} onClick={fn as ()=>void} style={{display:"block",background:"none",border:"none",color:C.muted,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit",padding:"4px 0",textAlign:"left",lineHeight:1.7}}>
                    {l}
                  </button>
                ))}
                {/* Book a Band — highlighted */}
                <button onClick={()=>setShowBandBooking(true)} style={{
                  display:"flex",alignItems:"center",gap:6,marginTop:8,
                  background:`${C.lapis}14`,border:`1px solid ${C.lapis}44`,
                  borderRadius:8,padding:"6px 10px",
                  color:C.lapis,fontSize:T.xs,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                }}>
                  🎼 Book a Band
                </button>
              </div>
              {/* For Artists */}
              <div>
                <div style={{fontSize:T.xs,fontWeight:700,color:C.text,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:14}}>For Artists</div>
                {[["Sign In",()=>setShowLogin(true)],["Apply Now",()=>setShowApply(true)],["Pricing & Fees",()=>nav("pricing")],["How Payments Work",()=>nav("how")]].map(([l,fn])=>(
                  <button key={l as string} onClick={fn as ()=>void} style={{display:"block",background:"none",border:"none",color:C.muted,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit",padding:"4px 0",textAlign:"left",lineHeight:1.7}}>
                    {l}
                  </button>
                ))}
              </div>
              {/* Legal & Contact */}
              <div>
                <div style={{fontSize:T.xs,fontWeight:700,color:C.text,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:14}}>Legal</div>
                {[["Privacy Policy",()=>setShowPrivacy(true)],["Terms of Service",()=>setShowPrivacy(true)],["Cookie Policy",()=>setShowPrivacy(true)]].map(([l,fn])=>(
                  <button key={l as string} onClick={fn as ()=>void} style={{display:"block",background:"none",border:"none",color:C.muted,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit",padding:"4px 0",textAlign:"left",lineHeight:1.7}}>
                    {l}
                  </button>
                ))}
                <div style={{marginTop:16}}>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.text,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Contact</div>
                  <div style={{color:C.muted,fontSize:T.xs,lineHeight:1.7,marginBottom:8}}>
                    Have a question? Send us a message directly through the platform.
                  </div>
                  <button onClick={()=>setShowContact(true)} style={{background:C.goldS,border:`1px solid ${C.gold}44`,borderRadius:8,padding:"8px 14px",color:C.gold,fontWeight:700,fontSize:T.xs,cursor:"pointer",fontFamily:"inherit"}}>
                    Send us a message →
                  </button>
                  <div style={{color:C.faint,fontSize:T.xs,marginTop:6}}>Norway · Europe</div>
                </div>
              </div>
            </div>
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:20,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
              <div style={{color:C.faint,fontSize:T.xs}}>© {new Date().getFullYear()} Awaz AS · All rights reserved · Norway</div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{fontSize:T.xs,color:C.faint}}>Payments secured by Stripe</span>
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* ── Mobile Bottom Nav (public pages) ── */}
      {vp.isMobile&&["home","browse","how","pricing","how","pricing"].includes(view)&&(
        <nav style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:`${C.bg}F8`,backdropFilter:"blur(24px)",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"stretch",paddingBottom:"env(safe-area-inset-bottom,0px)",height:`calc(56px + env(safe-area-inset-bottom,0px))`}}>
          {[
            {id:"home",   icon:"⌂",  label:t('portalHome'),      fn:()=>nav("home")},
            {id:"browse", icon:"♪",  label:t('browseArtists'),   fn:()=>nav("browse")},
            {id:"band",   icon:"♫",  label:"Band",               fn:()=>setShowBandBooking(true)},
            ...(session ? [
              {id:"logout", icon:"→", label:t('signOut'),         fn:()=>logout()},
            ] : [
              {id:"apply",  icon:"✦",  label:t('applyAsArtist'),  fn:()=>setShowApply(true)},
              {id:"signin", icon:"→",  label:t('signIn'),         fn:()=>setShowLogin(true)},
            ]),
          ].map(({id,icon,label,fn})=>{
            const isActive=(id==="home"&&view==="home")||(id==="browse"&&view==="browse");
            const isSignIn=id==="signin";
            return(
              <button key={id} onClick={fn} style={{
                flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap:3,border:"none",cursor:"pointer",paddingTop:8,paddingBottom:4,
                minHeight:44,WebkitTapHighlightColor:"transparent",fontFamily:"inherit",position:"relative",
                background:"transparent",
                color:isActive?C.gold:isSignIn?C.text:C.muted,
              }}>
                {isActive&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:20,height:2,borderRadius:1,background:C.gold}}/>}
                <div style={{fontSize:isSignIn?16:18,lineHeight:1,fontWeight:isActive||isSignIn?600:400}}>{icon}</div>
                <div style={{fontSize:9,fontWeight:isActive?700:isSignIn?600:400,letterSpacing:"0.2px"}}>{isSignIn?label:label}</div>
              </button>
            );
          })}
        </nav>
      )}

      {/* ── Modals ── */}
      <LoginSheet users={users} open={showLogin} onLogin={login} onClose={()=>{setShowLogin(false);setLoginPrefill(null);}} prefill={loginPrefill}/>
      {!cookieConsent&&<CookieBanner
        onAccept={()=>{localStorage.setItem("awaz_cookie","accepted");setCookieConsent("accepted");}}
        onDecline={()=>{localStorage.setItem("awaz_cookie","essential");setCookieConsent("essential");}}
      />}
      {showPrivacy&&<PrivacyPage onClose={()=>setShowPrivacy(false)}/>}
      {showSongReq&&selArtist&&<SongRequestModal artist={selArtist} onClose={()=>setShowSongReq(false)}/>}
      {showApply&&<ApplySheet onSubmit={handleNewArtist} onClose={()=>setShowApply(false)}/>}
      {showBandBooking&&(
        <BandBookingSheet
          artists={artists}
          onClose={()=>setShowBandBooking(false)}
          onBook={(req)=>{
            // Same flow as solo: request sent, artist responds with price
            handleNewBooking(req);
            setShowBandBooking(false);
            // Show confirmation
            setShowBandSent(true);
          }}
        />
      )}
      {showBandSent&&(
        <div style={{position:"fixed",inset:0,zIndex:9100,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowBandSent(false)}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"40px 36px",maxWidth:440,width:"100%",textAlign:"center"}} onClick={(e:any)=>e.stopPropagation()}>
            <div style={{fontSize:56,marginBottom:16}}>🎼</div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:10}}>Bandforespørsel sendt!</div>
            <div style={{color:C.textD,fontSize:T.sm,lineHeight:1.8,marginBottom:20}}>
              Artistene har <strong style={{color:C.text}}>48 timer</strong> på å svare med et pristilbud.<br/>
              Ingen betaling kreves nå — du betaler depositum kun etter at dere er enige om pris.
            </div>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",marginBottom:20,fontSize:12,color:C.muted,lineHeight:1.7,textAlign:"left"}}>
              ✦ Svar og pristilbud vises i dashbordet ditt<br/>
              💬 All kommunikasjon skjer på Awaz — ingen e-post<br/>
              🔒 Betaling sikres via Stripe ved aksept
            </div>
            <button onClick={()=>setShowBandSent(false)} style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:12,padding:14,fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
              Tilbake til forsiden
            </button>
          </div>
        </div>
      )}
      {/* Contact / Inquiry modal */}
      {showContact&&(
        <div style={{position:"fixed",inset:0,zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)"}} onClick={()=>setShowContact(false)}>
          <div style={{background:C.card,borderRadius:20,width:"100%",maxWidth:520,maxHeight:"85vh",overflowY:"auto",padding:"28px 24px 32px",boxShadow:"0 24px 80px rgba(0,0,0,0.6)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text}}>Send us a message</div>
              <button onClick={()=>setShowContact(false)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:"50%",color:C.muted,cursor:"pointer",fontSize:18,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{color:C.muted,fontSize:T.sm,marginBottom:20,lineHeight:1.6}}>
              Have a question about booking, an artist, or the platform? We'll get back to you as soon as possible — all messages go directly to our team.
            </div>
            <InquiryWidget artists={displaySource} onSubmit={(data)=>{
              handleNewInquiry(data);
              setShowContact(false);
            }}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI Widget (home sidebar on desktop) ───────────────────────────────
function AIWidget({ artists, onPick }) {
  const [step,setStep]=useState("idle");
  const [prefs,setPrefs]=useState({event:"",mood:""});
  const [results,setResults]=useState([]);
  const events=["Wedding","Eid","Corporate","Concert","Birthday","Festival"];
  const moods=[["traditional","Traditional","Classic Afghan"],["modern","Modern","Contemporary"],["festive","Festive","High energy"],["intimate","Intimate","Small & personal"]];
  const run=()=>{
    setStep("loading");
    setTimeout(()=>{
      const s=artists.filter(a=>a.status==="approved").map(a=>{
        let score=60+Math.random()*30;
        if(prefs.event&&(a.tags.some(t=>t.toLowerCase().includes(prefs.event.toLowerCase()))||a.genre.toLowerCase().includes(prefs.event.toLowerCase())))score+=18;
        if(prefs.mood==="traditional"&&["Ghazal","Rubab","Folk","Classical","Traditional"].some(g=>a.genre.includes(g)))score+=14;
        if(prefs.mood==="modern"&&["Pop","Jazz","Fusion","Modern"].some(g=>a.genre.includes(g)))score+=14;
        return{...a,match:Math.min(Math.round(score),99)};
      }).sort((a,b)=>b.match-a.match).slice(0,3);
      setResults(s);setStep("results");
    },1600);
  };
  return(
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
      <div style={{height:2,background:`linear-gradient(90deg,${C.lapis},${C.gold},${C.ruby})`}}/>
      <div style={{padding:20}}>
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16}}>
          <div style={{width:34,height:34,borderRadius:8,background:C.lapisS,border:`1px solid ${C.lapis}38`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>✦</div>
          <div><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,fontWeight:700,color:C.text}}>{t('aiTitle')}</div><div style={{color:C.muted,fontSize:T.xs}}>{t('findPerfectArtist')}</div></div>
        </div>
        {step==="idle"&&(
          <>
            <div style={{marginBottom:12}}>
              <div style={{color:C.muted,fontSize:T.xs,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:7}}>{t('aiEvent')}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {events.map(e=><button key={e} onClick={()=>setPrefs(p=>({...p,event:e}))} style={{background:prefs.event===e?`${C.gold}22`:C.surface,color:prefs.event===e?C.gold:C.muted,border:`1px solid ${prefs.event===e?`${C.gold}44`:C.border}`,borderRadius:5,padding:"5px 10px",fontSize:T.xs,cursor:"pointer",fontFamily:"inherit",fontWeight:600,minHeight:32,WebkitTapHighlightColor:"transparent"}}>{e}</button>)}
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{color:C.muted,fontSize:T.xs,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:7}}>{t('aiStyle')}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {moods.map(([v,l,d])=><button key={v} onClick={()=>setPrefs(p=>({...p,mood:v}))} style={{background:prefs.mood===v?`${C.ruby}18`:C.surface,color:prefs.mood===v?C.ruby:C.muted,border:`1px solid ${prefs.mood===v?`${C.ruby}44`:C.border}`,borderRadius:7,padding:"8px 10px",fontSize:T.xs,cursor:"pointer",fontFamily:"inherit",textAlign:"left",minHeight:44,WebkitTapHighlightColor:"transparent"}}><div style={{fontWeight:700}}>{l}</div><div style={{fontSize:9,opacity:0.7,marginTop:1}}>{d}</div></button>)}
              </div>
            </div>
            <Btn v="lapis" full onClick={run} disabled={!prefs.event&&!prefs.mood}>{t('aiFindBtn')}</Btn>
          </>
        )}
        {step==="loading"&&<div style={{textAlign:"center",padding:"24px 0"}}><div style={{width:32,height:32,border:`2px solid ${C.border}`,borderTopColor:C.lapis,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,color:C.text}}>Analyzing…</div></div>}
        {step==="results"&&(
          <div>
            <div style={{color:C.muted,fontSize:T.xs,marginBottom:10}}>Top matches for {prefs.event||"your event"}</div>
            {results.map((a,i)=>(
              <div key={a.id} onClick={()=>onPick(a)} style={{display:"flex",gap:10,alignItems:"center",background:i===0?`${a.color}10`:C.surface,borderRadius:8,padding:"10px 12px",marginBottom:7,cursor:"pointer",border:`1px solid ${i===0?`${a.color}44`:C.border}`,minHeight:52,WebkitTapHighlightColor:"transparent"}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:i===0?C.gold:C.muted,fontSize:15,width:18,textAlign:"center",flexShrink:0}}>{i+1}</div>
                {a.photo?<img src={a.photo} alt="" style={{width:32,height:32,borderRadius:6,objectFit:"cover",flexShrink:0}}/>:<div style={{width:32,height:32,borderRadius:6,background:`${a.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{a.emoji}</div>}
                <div style={{flex:1,minWidth:0}}><div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:C.text,fontSize:T.sm,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div><div style={{color:a.color,fontSize:T.xs}}>{a.genre}</div></div>
                <div style={{background:i===0?`${C.gold}20`:C.surface,border:`1px solid ${i===0?`${C.gold}44`:C.border}`,borderRadius:4,padding:"2px 7px",fontSize:T.xs,fontWeight:800,color:i===0?C.gold:C.muted,flexShrink:0}}>{a.match}%</div>
              </div>
            ))}
            <button onClick={()=>{setStep("idle");setResults([]);setPrefs({event:"",mood:""}); }} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:T.xs,fontFamily:"inherit",textDecoration:"underline",marginTop:4,minHeight:36,WebkitTapHighlightColor:"transparent"}}>{t('startOver')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Apply as Artist Sheet ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
// 🎸  BAND BOOKING SYSTEM
// Option A: Pre-built band  |  Option B: Build-your-own band
// Validates roles, suggests missing instruments, calculates totals,
// checks availability, requires Stripe payment before confirmation.
// ═══════════════════════════════════════════════════════════════════

const BAND_ROLES = [
  {role:"vocalist",    icon:"🎤", label:"Vocalist",     dari:"خواننده",  minPrice:500, maxPrice:null},
  {role:"tabla",       icon:"🥁", label:"Tabla",        dari:"طبله",     minPrice:50,  maxPrice:250},
  {role:"rubab",       icon:"🪕", label:"Rubab",        dari:"رباب",     minPrice:50,  maxPrice:250},
  {role:"drums",       icon:"🎶", label:"Drums",        dari:"درامز",    minPrice:50,  maxPrice:250},
  {role:"keyboard",    icon:"🎹", label:"Keyboard",     dari:"کیبورد",   minPrice:50,  maxPrice:250},
  {role:"guitar",      icon:"🎸", label:"Guitar",       dari:"گیتار",    minPrice:50,  maxPrice:250},
  {role:"harmonium",   icon:"🎵", label:"Harmonium",    dari:"هارمونیم", minPrice:50,  maxPrice:250},
] as const;

const PREBUILT_BAND = {
  name:"Classic Afghan Band",
  nameFrom:"بینداوز کلاسیک",
  roles:["vocalist","tabla","rubab","drums"],
  description:"The complete traditional Afghan ensemble — singer, tabla, rubab and drums. Perfect for weddings and Eid celebrations.",
  basePrice:800, // vocalist deposit min
};

// ── Currency conversion rates (EUR base) ───────────────────────────
const FX: Record<string,number> = {EUR:1,NOK:11.6,SEK:11.4,DKK:7.46,GBP:0.86,USD:1.09};
function toLocalCurrency(eurAmount:number,currency:string):string{
  const rate=FX[currency]||1;
  const val=Math.round(eurAmount*rate);
  const sym:{[k:string]:string}={EUR:"€",NOK:"kr",SEK:"kr",DKK:"kr",GBP:"£",USD:"$"};
  return `${sym[currency]||currency}${val.toLocaleString()}`;
}

function getArtistRole(artist:any):string{
  // Determine role from artist_type + specific_instrument
  if(artist.artistType==="instrumentalist"||artist.artist_type==="instrumentalist"){
    const inst=(artist.specificInstrument||artist.specific_instrument||"").toLowerCase();
    if(inst) return inst;
    // fallback: infer from instruments array
    const insts:string[]=Array.isArray(artist.instruments)?artist.instruments:[];
    const known=["tabla","rubab","drums","keyboard","guitar","harmonium"];
    const match=insts.map(i=>i.toLowerCase()).find(i=>known.includes(i));
    return match||"instrumentalist";
  }
  return "vocalist";
}

function BandBookingSheet({artists, onClose, onBook}:{artists:any[];onClose:()=>void;onBook:(selection:any)=>void}){
  const [mode,setMode]=useState<"choose"|"prebuilt"|"custom"|"confirm"|"pay">("choose");
  const [selectedLeadId,setSelectedLeadId]=useState<string|null>(null);
  const [selected,setSelected]=useState<{role:string;artistId:string|null}[]>([]);
  const [customRoles,setCustomRoles]=useState<string[]>([]);
  const [bookingDate,setBookingDate]=useState("");
  const [eventType,setEventType]=useState("");
  const [currency,setCurrency]=useState("EUR");
  const [err,setErr]=useState("");
  const [showPaywall,setShowPaywall]=useState(false);

  // ── Availability helper ──────────────────────────────────────────────
  const isAvailableOn=(artist:any, dateStr:string):boolean=>{
    if(!dateStr) return true;
    try{
      const d=new Date(dateStr);
      const mk=`${d.getFullYear()}-${d.getMonth()}`;
      const day=d.getDate();
      const avail:number[]=artist.available?.[mk]||[];
      const blocked:number[]=artist.blocked?.[mk]||[];
      if(avail.length===0) return true; // no calendar set = assume available
      return avail.includes(day)&&!blocked.includes(day);
    }catch{return true;}
  };

  // Available artists by role, sorted: available first when date is set
  const artistsByRole = useMemo(()=>{
    const map:Record<string,any[]>={};
    artists.filter(a=>a.status==="approved"||a.verified).forEach(a=>{
      const r=getArtistRole(a);
      if(!map[r]) map[r]=[];
      map[r].push(a);
    });
    // Sort: available on selected date first
    if(bookingDate){
      Object.keys(map).forEach(role=>{
        map[role]=map[role].sort((a,b)=>{
          const aOk=isAvailableOn(a,bookingDate)?1:0;
          const bOk=isAvailableOn(b,bookingDate)?1:0;
          return bOk-aOk;
        });
      });
    }
    return map;
  },[artists,bookingDate]);

  // Build slots for prebuilt mode from the lead artist's configured band
  const leadArtist=selectedLeadId?artists.find(a=>a.id===selectedLeadId):null;
  const prebuiltSlots=useMemo(()=>{
    if(!leadArtist) return [];
    const slots:[{role:string;artistId:string|null}]=[{role:"vocalist",artistId:leadArtist.id}];
    (leadArtist.bandMembers||[]).forEach((m:any)=>{
      slots.push({role:m.role.toLowerCase(),artistId:null}); // customer picks the actual player
    });
    return slots;
  },[leadArtist]);

  const currentSlots = mode==="prebuilt"
    ? prebuiltSlots.map(s=>({...s,artistId:selected.find(x=>x.role===s.role)?.artistId??s.artistId}))
    : customRoles.map(r=>({role:r,artistId:selected.find(s=>s.role===r)?.artistId||null}));

  const assignArtist=(role:string,artistId:string|null)=>{
    setSelected(prev=>{
      const without=prev.filter(s=>s.role!==role);
      return [...without,{role,artistId}];
    });
  };

  const totalEur=selectedLeadId&&leadArtist
    ? (leadArtist.depositWithBand||leadArtist.deposit_with_band||leadArtist.deposit||0)+(leadArtist.bandMembers as any[]).reduce((s:number,m:any)=>s+(m.price||0),0)
    : currentSlots.reduce((sum,slot)=>{
        if(!slot.artistId) return sum;
        const a=artists.find(x=>x.id===slot.artistId);
        const price=(a?.artistType==="vocalist"||a?.artist_type==="vocalist")&&(a?.depositWithBand||a?.deposit_with_band)
          ? (a.depositWithBand||a.deposit_with_band)
          : (a?.deposit||0);
        return sum+price;
      },[0] as unknown as number);

  const missingRoles=currentSlots.filter(s=>!s.artistId).map(s=>s.role);
  const filledRoles=currentSlots.filter(s=>!!s.artistId).map(s=>s.role);
  const allFilled=missingRoles.length===0&&currentSlots.length>0;

  // Smart suggestion: find best available alternative for a role
  const getSuggestion=(role:string,excludeId?:string):any=>{
    const candidates=(artistsByRole[role]||[]).filter(a=>a.id!==excludeId&&isAvailableOn(a,bookingDate));
    return candidates[0]||null;
  };

  const addCustomRole=(role:string)=>{
    if(!customRoles.includes(role)) setCustomRoles(p=>[...p,role]);
  };
  const removeCustomRole=(role:string)=>{
    setCustomRoles(p=>p.filter(r=>r!==role));
    setSelected(p=>p.filter(s=>s.role!==role));
  };

  const validate=()=>{
    if(!bookingDate) return"Pick a date first — we'll check who's free.";
    if(!eventType) return"What kind of event is it?";
    if(currentSlots.length===0) return"Add at least one musician.";
    const unfilled=currentSlots.filter(s=>!s.artistId);
    if(unfilled.length>0) return`Still need to choose: ${unfilled.map(s=>BAND_ROLES.find(r=>r.role===s.role)?.label||s.role).join(", ")}.`;
    return null;
  };

  const proceed=()=>{
    const e=validate();
    if(e){setErr(e);return;}
    setErr("");
    setMode("confirm");
  };

  // ── Role Card with availability indicator + smart suggestion ─────────
  const RoleCard=({slot}:{slot:{role:string;artistId:string|null}})=>{
    const def=BAND_ROLES.find(r=>r.role===slot.role);
    const assigned=slot.artistId?artists.find(a=>a.id===slot.artistId):null;
    const allForRole=artistsByRole[slot.role]||[];
    const assignedAvailable=assigned?isAvailableOn(assigned,bookingDate):true;
    const suggestion=getSuggestion(slot.role,slot.artistId||undefined);

    // Price to show: vocalists show with-band price
    const getPrice=(a:any)=>{
      if((a?.artistType==="vocalist"||a?.artist_type==="vocalist")&&(a?.depositWithBand||a?.deposit_with_band)){
        return a.depositWithBand||a.deposit_with_band;
      }
      return a?.deposit||0;
    };

    return(
      <div style={{background:C.surface,border:`1px solid ${assigned&&assignedAvailable?C.emerald:assigned&&!assignedAvailable?C.ruby:C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
        {/* Header row */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:20}}>{def?.icon||"🎵"}</span>
            <div>
              <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{def?.label||slot.role}</div>
              {def&&<div style={{fontSize:10,color:C.muted,fontFamily:"'Noto Naskh Arabic',serif"}}>{def.dari}</div>}
            </div>
          </div>
          {assigned?(
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:T.xs,fontWeight:700,color:assignedAvailable?C.emerald:C.ruby}}>
                {assignedAvailable?"✓ Available":"✗ Busy"} — {assigned.name}
              </div>
              <div style={{fontSize:10,color:C.muted}}>{toLocalCurrency(getPrice(assigned),currency)}</div>
            </div>
          ):(
            <div style={{fontSize:11,color:allForRole.length>0?C.ruby:C.muted}}>
              {allForRole.length>0?`${allForRole.filter(a=>isAvailableOn(a,bookingDate)||!bookingDate).length} free`:"None yet"}
            </div>
          )}
        </div>

        {/* Unavailability warning + auto-suggestion */}
        {assigned&&!assignedAvailable&&bookingDate&&(
          <div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:8,padding:"8px 12px",marginBottom:8}}>
            <div style={{fontSize:11,color:C.ruby,fontWeight:700,marginBottom:suggestion?4:0}}>
              ⚠ {assigned.name} is busy on this date
            </div>
            {suggestion&&(
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <div style={{fontSize:11,color:C.muted}}>
                  💡 <strong style={{color:C.text}}>{suggestion.name}</strong> is free — {toLocalCurrency(getPrice(suggestion),currency)}
                </div>
                <button onClick={()=>assignArtist(slot.role,suggestion.id)}
                  style={{background:C.emerald,color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                  Switch →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Artist selector */}
        {allForRole.length>0&&(
          <select value={slot.artistId||""} onChange={e=>assignArtist(slot.role,e.target.value||null)}
            style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:assigned?C.text:C.muted,fontSize:T.xs,fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
            <option value="">— Choose who plays {def?.label||slot.role} —</option>
            {allForRole.map(a=>{
              const free=isAvailableOn(a,bookingDate);
              return(
                <option key={a.id} value={a.id} disabled={!free&&!!bookingDate}>
                  {free||!bookingDate?"✓":"✗"} {a.name}{a.location?` · ${a.location}`:""} · {toLocalCurrency(getPrice(a),currency)}{!free&&bookingDate?" (busy)":""}
                </option>
              );
            })}
          </select>
        )}
        {allForRole.length===0&&(
          <div style={{fontSize:11,color:C.muted,marginTop:4,fontStyle:"italic"}}>No {def?.label||slot.role} players yet — check back soon.</div>
        )}
      </div>
    );
  };

  return(
    <Sheet open onClose={onClose} title="Book a Band 🎼" maxH="96vh">
      <div style={{padding:"16px 20px 32px"}}>

        {/* ── MODE SELECTION ── */}
        {mode==="choose"&&(
          <div>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:6}}>{t('bandBookTitle')}</div>
              <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.6}}>{t('bandBookSub')}</div>
            </div>

            {/* Option A — Artist-configured bands */}
            {(()=>{
              const bandsAvailable=artists.filter(a=>(a.status==="approved"||a.verified)&&Array.isArray(a.bandMembers)&&a.bandMembers.length>0);
              return bandsAvailable.length>0?(
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.gold,letterSpacing:"1px",textTransform:"uppercase" as const,marginBottom:8}}>{t('bandOptionAHeading')}</div>
                  {bandsAvailable.map(lead=>{
                    const members:any[]=lead.bandMembers||[];
                    const totalDeposit=(lead.depositWithBand||lead.deposit_with_band||lead.deposit||0)+members.reduce((s:number,m:any)=>s+(m.price||0),0);
                    const roleIcons:Record<string,string>={Tabla:"🥁",Rubab:"🪕",Drums:"🎶",Keyboard:"🎹",Guitar:"🎸",Harmonium:"🎵",Vocalist:"🎤"};
                    return(
                      <div key={lead.id} onClick={()=>{
                        setSelectedLeadId(lead.id);
                        setSelected([{role:"vocalist",artistId:lead.id}]);
                        setMode("prebuilt");
                      }} style={{background:`linear-gradient(135deg,${C.goldS},${C.surface})`,border:`2px solid ${C.gold}`,borderRadius:14,padding:"16px 18px",marginBottom:10,cursor:"pointer",transition:"all 0.2s"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                          <div>
                            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text}}>{lead.name}</div>
                            <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>{lead.genre} · {lead.location}</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.gold,fontSize:T.lg}}>{toLocalCurrency(totalDeposit,currency)}</div>
                            <div style={{fontSize:10,color:C.muted}}>{t('depositLabel')}</div>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
                          <span style={{background:C.goldS,border:`1px solid ${C.gold}44`,borderRadius:20,padding:"3px 10px",fontSize:11,color:C.gold,fontWeight:600}}>🎤 {lead.name.split(" ")[0]}</span>
                          {members.map((m,i)=>(
                            <span key={i} style={{background:C.lapisS,border:`1px solid ${C.lapis}33`,borderRadius:20,padding:"3px 10px",fontSize:11,color:C.lapis,fontWeight:600}}>
                              {roleIcons[m.role]||"🎵"} {m.name||m.role}
                            </span>
                          ))}
                        </div>
                        <div style={{fontSize:11,color:C.muted,marginTop:8}}>
                          {members.length+1} {t('bandMusicianCount')} · {t('bandSecureNote')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ):(
                <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:12,textAlign:"center"}}>
                  <div style={{fontSize:20,marginBottom:6}}>🎼</div>
                  <div style={{fontWeight:700,color:C.text,fontSize:T.sm,marginBottom:4}}>{t('bandNoBands')}</div>
                  <div style={{color:C.muted,fontSize:T.xs,lineHeight:1.6}}>{t('bandNoBandsDesc')}</div>
                </div>
              );
            })()}

            {/* Option B */}
            <div onClick={()=>{setMode("custom");setCustomRoles([]);setSelected([]);}} style={{background:C.surface,border:`2px solid ${C.border}`,borderRadius:16,padding:"20px 18px",cursor:"pointer",transition:"all 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.lapis,letterSpacing:"1px",textTransform:"uppercase" as const,marginBottom:4}}>{t('bandBuildOwn')}</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text}}>{t('bandPickMusicians')}</div>
                  <div style={{color:C.muted,fontSize:T.xs,marginTop:4}}>{t('bandPickDesc')}</div>
                </div>
                <span style={{fontSize:28}}>🎛️</span>
              </div>
            </div>

            {/* Currency selector */}
            <div style={{marginTop:16}}>
              <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:6}}>{t('bandDisplayPrices')}</div>
              <div style={{display:"flex",gap:6}}>
                {["EUR","NOK","SEK","DKK","GBP"].map(cur=>(
                  <button key={cur} onClick={e=>{e.stopPropagation();setCurrency(cur);}}
                    style={{flex:1,background:currency===cur?C.goldS:C.surface,border:`1px solid ${currency===cur?C.gold:C.border}`,borderRadius:8,padding:"8px 4px",cursor:"pointer",fontSize:11,fontWeight:700,color:currency===cur?C.gold:C.muted,fontFamily:"inherit"}}>
                    {cur}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── OPTION A — Artist's Primary Band ── */}
        {mode==="prebuilt"&&leadArtist&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <button onClick={()=>setMode("choose")} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",cursor:"pointer",color:C.muted,fontSize:12,fontFamily:"inherit"}}>← Back</button>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text}}>{leadArtist.name}'s Band</div>
            </div>

            {/* Band preview card */}
            <div style={{background:`linear-gradient(135deg,${C.goldS},${C.surface})`,border:`2px solid ${C.gold}44`,borderRadius:14,padding:"16px 18px",marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:C.gold,letterSpacing:"1px",textTransform:"uppercase" as const,marginBottom:10}}>Complete ensemble — as chosen by {leadArtist.name.split(" ")[0]}</div>
              {/* Lead vocalist */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:20}}>🎤</span>
                  <div>
                    <div style={{fontWeight:700,color:C.gold,fontSize:T.sm}}>{leadArtist.name}</div>
                    <div style={{fontSize:10,color:C.muted}}>{leadArtist.genre} · {leadArtist.location}</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:700,color:C.gold,fontSize:T.sm}}>{toLocalCurrency(leadArtist.depositWithBand||leadArtist.deposit_with_band||leadArtist.deposit||0,currency)}</div>
                  <div style={{fontSize:10,color:C.muted}}>vocalist deposit</div>
                </div>
              </div>
              {/* Band members */}
              {(leadArtist.bandMembers as any[]).map((m:any,i:number)=>{
                const roleIcons:Record<string,string>={Tabla:"🥁",Rubab:"🪕",Drums:"🎶",Keyboard:"🎹",Guitar:"🎸",Harmonium:"🎵",Vocalist:"🎤"};
                return(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:20}}>{roleIcons[m.role]||"🎵"}</span>
                      <div>
                        <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{m.name||m.role}</div>
                        <div style={{fontSize:10,color:C.lapis,fontWeight:600,textTransform:"uppercase" as const}}>{m.role}</div>
                      </div>
                    </div>
                    <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{toLocalCurrency(m.price||0,currency)}</div>
                  </div>
                );
              })}
              {/* Total */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:12,marginTop:4}}>
                <div>
                  <div style={{fontSize:T.xs,color:C.muted}}>Total deposit · {(leadArtist.bandMembers as any[]).length+1} musicians</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>{t('pricingAfterLabel')}</div>
                </div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.gold,fontSize:T.xl}}>
                  {toLocalCurrency((leadArtist.depositWithBand||leadArtist.deposit_with_band||leadArtist.deposit||0)+(leadArtist.bandMembers as any[]).reduce((s:number,m:any)=>s+(m.price||0),0),currency)}
                </div>
              </div>
            </div>

            {/* Availability check */}
            {bookingDate&&!isAvailableOn(leadArtist,bookingDate)&&(
              <div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:T.xs,color:C.ruby}}>
                ⚠ {leadArtist.name} may not be available on this date — contact them to confirm
              </div>
            )}
            {bookingDate&&isAvailableOn(leadArtist,bookingDate)&&(
              <div style={{background:C.emeraldS,border:`1px solid ${C.emerald}33`,borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:T.xs,color:C.emerald,fontWeight:700}}>
                ✓ {leadArtist.name.split(" ")[0]} is available on this date
              </div>
            )}

            {/* Date + event */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>📅 Event date</div>
                <input type="date" value={bookingDate} onChange={e=>setBookingDate(e.target.value)}
                  style={{width:"100%",background:C.card,border:`2px solid ${bookingDate?C.gold:C.border}`,borderRadius:10,padding:"10px 12px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit",boxSizing:"border-box" as const}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>🎉 Event type</div>
                <select value={eventType} onChange={e=>setEventType(e.target.value)}
                  style={{width:"100%",background:C.card,border:`2px solid ${eventType?C.gold:C.border}`,borderRadius:10,padding:"10px 12px",color:eventType?C.text:C.muted,fontSize:T.sm,outline:"none",fontFamily:"inherit",cursor:"pointer",boxSizing:"border-box" as const}}>
                  <option value="">Choose…</option>
                  {["Wedding","Eid","Birthday","Concert","Corporate","Other"].map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:10,padding:"10px 14px",color:C.ruby,fontSize:T.xs,marginBottom:10}}>⚠️ {err}</div>}

            <button onClick={()=>{
              if(!bookingDate){setErr("Pick a date first.");return;}
              if(!eventType){setErr("What kind of event is it?");return;}
              setErr("");setMode("confirm");
            }} style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:12,padding:"16px",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>
              Review &amp; Pay Deposit →
            </button>
          </div>
        )}

        {/* ── OPTION B — Build Your Own ── */}
        {mode==="custom"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <button onClick={()=>setMode("choose")} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",cursor:"pointer",color:C.muted,fontSize:12,fontFamily:"inherit"}}>← Back</button>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text}}>Build Your Band</div>
            </div>

            {/* Step 1 — date first */}
            <div style={{background:C.goldS,border:`1px solid ${C.gold}33`,borderRadius:12,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontSize:T.xs,fontWeight:700,color:C.gold,marginBottom:8}}>📅 Step 1 — Pick your event date</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Date</div>
                  <input type="date" value={bookingDate} onChange={e=>setBookingDate(e.target.value)}
                    style={{width:"100%",background:C.card,border:`2px solid ${bookingDate?C.gold:C.border}`,borderRadius:10,padding:"10px 12px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit",boxSizing:"border-box" as const}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Event type</div>
                  <select value={eventType} onChange={e=>setEventType(e.target.value)}
                    style={{width:"100%",background:C.card,border:`2px solid ${eventType?C.gold:C.border}`,borderRadius:10,padding:"10px 12px",color:eventType?C.text:C.muted,fontSize:T.sm,outline:"none",fontFamily:"inherit",cursor:"pointer",boxSizing:"border-box" as const}}>
                    <option value="">Choose…</option>
                    {["Wedding","Eid","Birthday","Concert","Corporate","Other"].map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {bookingDate&&<div style={{fontSize:11,color:C.gold,marginTop:8,fontWeight:600}}>✓ We'll show which artists are free on this date</div>}
            </div>

            {/* Step 2 — pick instruments */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:8}}>🎵 Step 2 — Which instruments do you want?</div>
              <div style={{display:"flex",flexWrap:"wrap" as const,gap:6,marginBottom:4}}>
                {BAND_ROLES.map(({role,icon,label})=>(
                  <button key={role} onClick={()=>customRoles.includes(role)?removeCustomRole(role):addCustomRole(role)}
                    style={{background:customRoles.includes(role)?C.lapisS:C.surface,border:`1px solid ${customRoles.includes(role)?C.lapis:C.border}`,borderRadius:20,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600,color:customRoles.includes(role)?C.lapis:C.muted,fontFamily:"inherit",transition:"all 0.15s"}}>
                    {icon} {label} {customRoles.includes(role)?"✓":"＋"}
                  </button>
                ))}
              </div>
              {customRoles.length===0&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>Tap the instruments you need ↑</div>}
            </div>

            {/* Unavailable warning */}
            {bookingDate&&currentSlots.some(s=>s.artistId&&!isAvailableOn(artists.find(a=>a.id===s.artistId),bookingDate))&&(
              <div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:T.xs,color:C.ruby}}>
                ⚠ Some chosen artists are busy on this date — see suggestions below
              </div>
            )}

            {/* Step 3 — pick artists per role */}
            {customRoles.length>0&&(
              <>
                <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:8}}>👤 Step 3 — Choose your artists</div>
                {currentSlots.map(slot=><RoleCard key={slot.role} slot={slot}/>)}
              </>
            )}

            {/* Total */}
            {currentSlots.length>0&&(
              <div style={{background:C.goldS,border:`1px solid ${C.gold}33`,borderRadius:12,padding:"14px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:T.xs,color:C.muted,marginBottom:2}}>{filledRoles.length} of {currentSlots.length} chosen</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.gold,fontSize:T.xl}}>{toLocalCurrency(totalEur,currency)}</div>
                  {currency!=="EUR"&&<div style={{fontSize:10,color:C.muted}}>≈ €{totalEur} EUR</div>}
                </div>
                <div style={{textAlign:"right",fontSize:11,color:C.muted,lineHeight:1.7}}>
                  <div>{t('pricingDepositLabel')}</div>
                  <div>{t('pricingAfterLabel')}</div>
                </div>
              </div>
            )}

            {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:10,padding:"10px 14px",color:C.ruby,fontSize:T.xs,marginBottom:10}}>⚠️ {err}</div>}

            <button onClick={proceed} disabled={currentSlots.length===0}
              style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:12,padding:"16px",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit",opacity:currentSlots.length===0?0.5:1}}>
              Se over og send forespørsel →
            </button>
            {!allFilled&&currentSlots.length>0&&(
              <div style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:6}}>Choose an artist for each role to continue</div>
            )}
          </div>
        )}

        {/* ── CONFIRM → SEND REQUEST (same flow as solo booking) ── */}
        {mode==="confirm"&&(
          <div>
            <div style={{marginBottom:18}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:4}}>
                Bekreft og send forespørsel
              </div>
              <div style={{color:C.muted,fontSize:T.sm}}>Gratis å sende · Artistene svarer innen 48 timer · Betal kun når dere er enige</div>
            </div>

            {/* Band lineup summary — NO PRICES shown to customer */}
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:"1px",marginBottom:10}}>Ditt band</div>
              {selectedLeadId&&leadArtist?(
                <>
                  {[{name:leadArtist.name,role:"Vokalist",icon:"🎤",genre:leadArtist.genre},
                    ...(leadArtist.bandMembers as any[]).map((m:any)=>({name:m.name||m.role,role:m.role,icon:{Tabla:"🥁",Rubab:"🪕",Drums:"🎶",Keyboard:"🎹",Guitar:"🎸",Harmonium:"🎵",Vocalist:"🎤"}[m.role]||"🎵",genre:""}))
                  ].map((member,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:18}}>{member.icon}</span>
                      <div>
                        <div style={{fontWeight:600,color:C.text,fontSize:T.sm}}>{member.name}</div>
                        <div style={{fontSize:10,color:C.muted}}>{member.role}{member.genre?` · ${member.genre}`:""}</div>
                      </div>
                    </div>
                  ))}
                </>
              ):(
                currentSlots.map(slot=>{
                  const def=BAND_ROLES.find(r=>r.role===slot.role);
                  const a=artists.find(x=>x.id===slot.artistId);
                  return(
                    <div key={slot.role} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:18}}>{def?.icon||"🎵"}</span>
                      <div>
                        <div style={{fontWeight:600,color:C.text,fontSize:T.sm}}>{a?.name||"—"}</div>
                        <div style={{fontSize:10,color:C.muted}}>{def?.label||slot.role}</div>
                      </div>
                    </div>
                  );
                })
              )}
              <div style={{paddingTop:10,display:"flex",gap:16,fontSize:12,color:C.muted,flexWrap:"wrap" as const}}>
                <span>📅 {bookingDate}</span>
                <span>🎉 {eventType}</span>
                <span>🎼 {currentSlots.length} musikere</span>
              </div>
            </div>

            {/* Customer name + email */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <Inp label="Ditt fulle navn *" placeholder="Fornavn Etternavn" value={(window as any)._bandName||""} onChange={(e:any)=>{(window as any)._bandName=e.target.value;setErr("");}}/>
              <Inp label="E-post *" type="email" placeholder="deg@epost.no" value={(window as any)._bandEmail||""} onChange={(e:any)=>{(window as any)._bandEmail=e.target.value;setErr("");}}/>
            </div>
            <div style={{marginBottom:14}}>
              <Inp label="By / sted for arrangementet" placeholder="Oslo, Bergen…" value={(window as any)._bandCity||""} onChange={(e:any)=>{(window as any)._bandCity=e.target.value;}}/>
            </div>

            {/* Trust signals */}
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",flexWrap:"wrap" as const,gap:12}}>
              {[["🔒","Kryptert og trygg"],["💰","Betal kun ved enighet"],["⏱","Svar innen 48t"],["🎼","Alle artistene varsles"]].map(([icon,text])=>(
                <span key={text as string} style={{fontSize:11,color:C.muted,display:"flex",alignItems:"center",gap:4}}><span>{icon}</span><span>{text}</span></span>
              ))}
            </div>

            {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:8,padding:"10px 14px",color:C.ruby,fontSize:T.xs,marginBottom:12}}>⚠️ {err}</div>}

            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setMode(selectedLeadId?"prebuilt":"custom")}
                style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",color:C.muted}}>
                ← Endre
              </button>
              <button onClick={async()=>{
                const name=((window as any)._bandName||"").trim();
                const email=((window as any)._bandEmail||"").trim();
                if(!name||name.length<3){setErr("Skriv inn fullt navn");return;}
                if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){setErr("Gyldig e-post er påkrevd");return;}
                const req={
                  id:crypto.randomUUID(),
                  artist_id:selectedLeadId||currentSlots[0]?.artistId||"",
                  customer_name:name,
                  customer_email:email.toLowerCase(),
                  event_date:bookingDate,
                  event_type:eventType,
                  event_location_city:((window as any)._bandCity||"").trim(),
                  booking_type:"band",
                  band_slots:JSON.stringify(currentSlots),
                  notes:`Bandforespørsel: ${currentSlots.length} musikere — ${currentSlots.map(s=>artists.find(a=>a.id===s.artistId)?.name||s.role).join(", ")}`,
                  status:"request_received",
                  created_at:new Date().toISOString(),
                };
                if(HAS_SUPA){
                  try{
                    const sb=await getSupabase();
                    if(sb) await sb.from("booking_requests").insert([req]);
                  }catch(e){console.warn("Band request save:",e);}
                }
                onBook(req);
                (window as any)._bandName="";
                (window as any)._bandEmail="";
                (window as any)._bandCity="";
              }}
                style={{flex:2,background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:12,padding:"16px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                Send bandforespørsel →
              </button>
            </div>
            <div style={{textAlign:"center" as const,fontSize:11,color:C.faint,marginTop:8}}>
              Gratis å sende · Ingen betaling nå · Artistene setter pris og du aksepterer
            </div>
          </div>
        )}

      </div>
    </Sheet>
  );
}

function ApplySheet({ onSubmit, onClose }) {
  const [step,setStep]=useState(1);
  const [f,setF]=useState({name:"",nameDari:"",email:"",pass:"",pass2:"",genres:[] as string[],country:"NO",location:"",currency:"EUR",priceInfo:"",deposit:"500",depositWithBand:"800",bio:"",instruments:"",tags:"",cancellationPolicy:"moderate",artistType:"" as ""|"vocalist"|"instrumentalist",selectedInstruments:[] as string[]});
  const toggleGenre=(g:string)=>setF(p=>({...p,genres:p.genres.includes(g)?p.genres.filter(x=>x!==g):[...p.genres,g]}));
  const toggleInstrument=(inst:string)=>setF(p=>({...p,selectedInstruments:p.selectedInstruments.includes(inst)?p.selectedInstruments.filter(i=>i!==inst):[...p.selectedInstruments,inst]}));
  const [err,setErr]=useState(""),[done,setDone]=useState(false),[loading,setLoading]=useState(false);

  const v1=()=>{
    if(!f.name)return"Please enter your name.";
    if(!f.email||!f.email.includes("@"))return"Please enter a valid email address.";
    if(f.pass.length<8)return"Password must be at least 8 characters.";
    if(!/[A-Z]/.test(f.pass))return"Add at least one uppercase letter to your password.";
    if(!/[0-9]/.test(f.pass))return"Add at least one number to your password.";
    if(f.pass!==f.pass2)return"The two passwords don't match — please check.";
    return null;
  };
  const v2=()=>{
    if(f.genres.length===0)return"Choose at least one type of music.";
    if(!f.artistType)return"Are you a Singer or an Instrumentalist? Please choose one.";
    if(f.artistType==="instrumentalist"&&f.selectedInstruments.length===0)return"Please select which instrument you play.";
    if(f.artistType==="vocalist"&&parseInt(f.deposit)<500)return"Singers must set a deposit of at least €500.";
    if(f.artistType==="instrumentalist"){const d=parseInt(f.deposit);if(d<50||d>250)return"Instrumentalists: your price must be between €50 and €250.";}
    return null;
  };

  const next=()=>{const e=step===1?v1():v2();if(e){setErr(e);return;}setErr("");setStep(s=>s+1);};
  const submit=async()=>{
    setLoading(true);setErr("");
    const emojis=["","","","","","",""],cols=[C.ruby,C.lapis,C.emerald,C.saffron,C.gold,C.lavender];
    // Use UUID so it matches artists.id column type in Supabase
    const id=crypto.randomUUID();
    const depositAmt=f.artistType==="instrumentalist"?Math.min(250,Math.max(50,parseInt(f.deposit)||100)):Math.max(500,parseInt(f.deposit)||500);
    const depositWithBandAmt=f.artistType==="vocalist"?Math.max(800,parseInt(f.depositWithBand)||800):null;
    const primaryInstrument=f.selectedInstruments[0]||"";
    const artistData={id,name:f.name,nameDari:f.nameDari||"",genre:f.genres[0]||"",location:f.location||"—",country:f.country||"NO",currency:f.currency||"EUR",rating:0,reviews:0,priceInfo:f.priceInfo||"On request",deposit:depositAmt,depositWithBand:depositWithBandAmt,emoji:emojis[Math.floor(Math.random()*emojis.length)],color:cols[Math.floor(Math.random()*cols.length)],photo:null,bio:f.bio||"",tags:[...f.genres,...f.tags.split(",").map(t=>t.trim()).filter(Boolean)],instruments:f.artistType==="instrumentalist"?f.selectedInstruments:f.instruments.split(",").map(t=>t.trim()).filter(Boolean),superhost:false,status:"pending",joined:MONTHS[NOW.getMonth()]+" "+NOW.getFullYear(),available:{[MK]:[]},blocked:{[MK]:[]},earnings:0,totalBookings:0,verified:false,stripeConnected:false,stripeAccount:null,cancellationPolicy:f.cancellationPolicy,artistType:f.artistType||"vocalist",specificInstrument:primaryInstrument};

    // ── Supabase signup ───────────────────────────────────────────────
    // KEY: Use a SEPARATE temporary Supabase client for registration.
    // This ensures the main client's session (admin/visitor) is NEVER affected.
    if(HAS_SUPA){
      try{
        const{createClient:cc}=await import("@supabase/supabase-js");
        const regSb=cc(SUPA_URL,SUPA_KEY,{
          auth:{persistSession:false,storageKey:"awaz-reg-temp",lock:(_n,_t,fn)=>fn()}
        });
        const{data,error}=await regSb.auth.signUp({
          email:f.email.toLowerCase().trim(),
          password:f.pass,
          options:{data:{name:f.name, role:"artist"},emailRedirectTo:window.location.origin},
        });
        if(error){
          setLoading(false);
          const msg=error.message.toLowerCase();
          if(msg.includes("rate limit")||msg.includes("email rate")||msg.includes("over_email")){
            onSubmit(artistData,{id:`u_${id}`,role:"artist",email:f.email,name:f.name,artistId:id},false);
            setDone(true);
          } else if(msg.includes("already registered")||msg.includes("already exists")){
            setErr("An account with this email already exists. Please sign in instead.");
          } else {
            setErr(error.message);
          }
          return;
        }
        // ── Save to Supabase using the NEW USER's session (regSb) ──────
        // CRITICAL: We must use regSb (not mainSb) for inserts because
        // RLS policies check auth.uid() — only the new user can insert their own data.
        if(data.user){
          const authId = data.user.id;

          // 1. Insert into artists table
          const depositFinal = f.artistType==="instrumentalist"?Math.min(250,Math.max(50,parseInt(f.deposit)||100)):Math.max(500,parseInt(f.deposit)||500);
          const instList=f.artistType==="instrumentalist"?f.selectedInstruments:f.instruments.split(",").map(t=>t.trim()).filter(Boolean);
          const primaryInst=f.selectedInstruments[0]||null;
          const{error:aErr}=await regSb.from("artists").insert([{
            id:                  authId,
            name:                f.name,
            name_dari:           f.nameDari||"",
            genre:               f.genres[0]||"",
            location:            f.location||"—",
            country:             f.country||"NO",
            currency:            f.currency||"EUR",
            bio:                 f.bio||"",
            price_info:          f.priceInfo||"On request",
            deposit:             depositFinal,
            emoji:               artistData.emoji,
            color:               artistData.color,
            tags:                artistData.tags,
            instruments:         instList,
            status:              "pending",
            cancellation_policy: f.cancellationPolicy,
            joined_date:         MONTHS[NOW.getMonth()]+" "+NOW.getFullYear(),
            artist_type:         f.artistType||"vocalist",
            specific_instrument: primaryInst,
            deposit_with_band:   depositWithBandAmt,
          }]);
          if(aErr) console.warn("artists insert error:",aErr.message);

          // 2. Upsert profiles — artist_id = same UUID as artists.id
          const{error:pErr}=await regSb.from("profiles").upsert([{
            id:        authId,
            role:      "artist",
            artist_id: authId,   // same UUID — no FK mismatch
            name:      f.name,
          }],{onConflict:"id"});
          if(pErr) console.warn("profiles upsert error:",pErr.message);

          // 3. Upsert users table
          const{error:uErr}=await regSb.from("users").upsert({
            id:          authId,
            email:       f.email.toLowerCase().trim(),
            name:        f.name,
            role:        "artist",
            is_approved: false,
          },{onConflict:"id"});
          if(uErr) console.warn("users upsert error:",uErr.message);

          // Update artistData to use the correct UUID
          Object.assign(artistData, { id: authId });
        }
        // NOTE: No signOut() on regSb — with persistSession:false there is
        // no session to clear, and calling signOut() could broadcast a
        // SIGNED_OUT event that would clear the main app's session (admin).
        // Registration complete — show pending screen.
        // artistData.id was updated to authId above via Object.assign
        const authUserId = data.user?.id || `u_${id}`;

        onSubmit(artistData, {
          id: authUserId, role: "artist",
          email: f.email,
          name: f.name, artistId: authUserId,
        }, false); // wait for admin approval

        setLoading(false);
        setDone(true);
        return;
      }catch(e){
        console.error("Registration error:",e);
        setLoading(false);setErr("Registration failed — please try again.");return;
      }
    }

    // ── Demo fallback ─────────────────────────────────────────────────
    setTimeout(()=>{
      onSubmit(artistData,{id:`u_${id}`,role:"artist",email:f.email,name:f.name,artistId:id});
      setLoading(false);setDone(true);
    },600);
  };

  return(
    <Sheet open onClose={onClose} title={done?t('applyWelcome')||"Welcome to Awaz!":step===1?t('applyStep1Title')||"Join Awaz — Step 1 of 2":t('applyStep2Title')||"Almost done — Step 2 of 2"} maxH="96vh">
      <div style={{padding:"16px 20px 32px"}}>

        {/* ← Tilbake-knapp — vises på steg 1 og 2, ikke etter ferdig */}
        {!done&&(
          <button onClick={step===1?onClose:()=>{setStep(1);setErr("");}}
            style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:C.muted,fontSize:T.sm,cursor:"pointer",fontFamily:"inherit",padding:"0 0 16px 0",fontWeight:500}}>
            <span style={{fontSize:18,lineHeight:1}}>←</span>
            <span>{step===1?"Back":"Back to step 1"}</span>
          </button>
        )}
        {done?(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:8}}>You're in! Account created.</div>
            <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.8,marginBottom:20}}>Welcome to Awaz — the platform that helps Afghan artists across Europe get booked and paid.</div>
            <div style={{background:C.surface,borderRadius:10,padding:"14px 16px",marginBottom:16,textAlign:"left",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:T.xs,fontWeight:700,color:C.gold,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>{t('applyNextSteps')}</div>
              {[
                ["📧",t('applyNext1')||"Check your email and confirm your account"],
                ["🔑",t('applyNext2')||"Come back and click Sign In"],
                ["🎵",t('applyNext3')||"Complete your profile — add photo, bio, prices"],
                ["🚀",t('applyNext4')||"Get approved within 24h and start getting bookings"],
              ].map(([icon,l])=>(
                <div key={l} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
                  <span style={{fontSize:16,flexShrink:0}}>{icon}</span>
                  <span style={{fontSize:T.xs,color:C.textD,lineHeight:1.5}}>{l}</span>
                </div>
              ))}
            </div>
            <div style={{background:C.goldS,border:`1px solid ${C.gold}33`,borderRadius:8,padding:"12px 14px",marginBottom:16,fontSize:T.sm,color:C.text,lineHeight:1.6,textAlign:"left"}}>
              {t('applyProTip')||"Pro tip: Artists with a complete profile get 3x more bookings. Complete yours right after signing in!"}
            </div>
            <Btn full sz="lg" onClick={onClose}>{t('applySignInComplete')||"Sign In & Complete Profile →"}</Btn>
          </div>
        ):(
          <>
            {/* Value proposition — shown BEFORE form, reduces abandonment */}
            {step===1&&(
              <div style={{background:`linear-gradient(135deg,${C.goldS},${C.card})`,border:`1px solid ${C.gold}33`,borderRadius:12,padding:"14px 16px",marginBottom:18}}>
                <div style={{fontSize:T.xs,fontWeight:800,color:C.gold,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Artister på Awaz får</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
                  {[["€0","å bli med","helt gratis"],["48t","godkjenning","& du er live"],["🌍","Europa","Norge, Sverige, Tyskland +"]].map(([v,l,s])=>(
                    <div key={l} style={{textAlign:"center",background:C.card,borderRadius:8,padding:"10px 6px",border:`1px solid ${C.border}`}}>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:800,color:C.gold,fontSize:"1.4rem",lineHeight:1}}>{v}</div>
                      <div style={{fontSize:9,color:C.muted,marginTop:3,lineHeight:1.4}}>{l}<br/><span style={{color:C.text,fontWeight:600}}>{s}</span></div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.muted}}>
                  <span style={{color:C.emerald}}>●</span>
                  <span>{t('artistsLive')||'Artister bookes i Norge, Sverige, Tyskland og Storbritannia akkurat nå'}</span>
                </div>
              </div>
            )}
            {/* Progress dots — visual, not text */}
            <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:20}}>
              {[1,2].map(i=>(
                <div key={i} style={{width:i===step?24:8,height:8,borderRadius:4,background:i<=step?C.gold:C.border,transition:"all 0.3s"}}/>
              ))}
            </div>
            {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:10,padding:"12px 14px",color:C.ruby,fontSize:T.sm,marginBottom:14,display:"flex",gap:8,alignItems:"center"}}>⚠️ {err}</div>}

            {step===1&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {/* Step title */}
                <div style={{textAlign:"center",marginBottom:4}}>
                  
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text}}>Who are you?</div>
                  <div style={{color:C.muted,fontSize:T.sm,marginTop:4}}>اسم و ایمیل خود را بنویسید</div>
                </div>

                {/* Name — large, clear */}
                <div>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:6,display:"flex",gap:6,alignItems:"center"}}>
                    Artist name <span style={{color:C.ruby}}>*</span>
                  </div>
                  <input value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}
                    placeholder="e.g. Ahmad Shah"
                    style={{width:"100%",background:C.surface,border:`2px solid ${f.name?C.emerald:C.border}`,borderRadius:12,padding:"14px 16px",color:C.text,fontSize:16,outline:"none",fontFamily:"inherit",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
                </div>

                {/* Dari name */}
                <div>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:6}}>Name in Dari / Pashto (optional — اختیاری)</div>
                  <input value={f.nameDari} onChange={e=>setF(p=>({...p,nameDari:e.target.value}))}
                    placeholder="احمد شاه"
                    dir="rtl"
                    style={{width:"100%",background:C.surface,border:`2px solid ${f.nameDari?C.emerald:C.border}`,borderRadius:12,padding:"14px 16px",color:C.text,fontSize:16,outline:"none",fontFamily:"'Noto Naskh Arabic',serif",boxSizing:"border-box",transition:"border-color 0.2s",textAlign:"right"}}/>
                </div>

                {/* Email */}
                <div>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:6,display:"flex",gap:6,alignItems:"center"}}>
                    Email address <span style={{color:C.ruby}}>*</span>
                  </div>
                  <input value={f.email} onChange={e=>setF(p=>({...p,email:e.target.value}))}
                    type="email" placeholder="you@gmail.com"
                    style={{width:"100%",background:C.surface,border:`2px solid ${f.email&&f.email.includes("@")?C.emerald:C.border}`,borderRadius:12,padding:"14px 16px",color:C.text,fontSize:16,outline:"none",fontFamily:"inherit",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
                </div>

                {/* Password */}
                <div>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:6,display:"flex",gap:6,alignItems:"center"}}>
                    Password <span style={{color:C.ruby}}>*</span>
                  </div>
                  <input value={f.pass} onChange={e=>setF(p=>({...p,pass:e.target.value}))}
                    type="password" placeholder="At least 8 characters"
                    style={{width:"100%",background:C.surface,border:`2px solid ${f.pass.length>=8?C.emerald:C.border}`,borderRadius:12,padding:"14px 16px",color:C.text,fontSize:16,outline:"none",fontFamily:"inherit",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
                  {f.pass.length>0&&f.pass.length<8&&<div style={{color:C.ruby,fontSize:11,marginTop:4}}>⚠ Too short — need {8-f.pass.length} more characters</div>}
                </div>

                <div>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:6}}>Repeat password <span style={{color:C.ruby}}>*</span></div>
                  <input value={f.pass2} onChange={e=>setF(p=>({...p,pass2:e.target.value}))}
                    type="password" placeholder="Same password again"
                    style={{width:"100%",background:C.surface,border:`2px solid ${f.pass2&&f.pass2===f.pass?C.emerald:f.pass2?C.ruby:C.border}`,borderRadius:12,padding:"14px 16px",color:C.text,fontSize:16,outline:"none",fontFamily:"inherit",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
                  {f.pass2&&f.pass2!==f.pass&&<div style={{color:C.ruby,fontSize:11,marginTop:4}}>⚠ Passwords don't match</div>}
                  {f.pass2&&f.pass2===f.pass&&<div style={{color:C.emerald,fontSize:11,marginTop:4}}>✓ Passwords match!</div>}
                </div>
              </div>
            )}

            {step===2&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {/* Step title */}
                <div style={{textAlign:"center",marginBottom:4}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text}}>Your music</div>
                  <div style={{color:C.muted,fontSize:T.sm,marginTop:4}}>چه نوع موسیقی می‌نوازید؟</div>
                </div>

                {/* ── ARTIST TYPE — mandatory choice ── */}
                <div>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:8}}>
                    I am a… <span style={{color:C.ruby}}>*</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {([
                      {v:"vocalist",   icon:"🎤", en:"Vocalist",      dari:"خواننده",   desc:"Singer / Ghazal"},
                      {v:"instrumentalist", icon:"🎸", en:"Instrumentalist", dari:"نوازنده", desc:"Plays an instrument"},
                    ] as const).map(({v,icon,en,dari,desc})=>(
                      <button key={v} onClick={()=>setF(p=>({...p,artistType:v,deposit:v==="vocalist"?"500":"100",selectedInstruments:[]}))}
                        style={{background:f.artistType===v?C.goldS:C.surface,border:`2px solid ${f.artistType===v?C.gold:C.border}`,borderRadius:12,padding:"14px 10px",cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.2s"}}>
                        <div style={{fontSize:24,marginBottom:4}}>{icon}</div>
                        <div style={{fontWeight:700,color:f.artistType===v?C.gold:C.text,fontSize:T.sm}}>{en}</div>
                        <div style={{fontSize:11,color:C.muted,fontFamily:"'Noto Naskh Arabic',serif",marginTop:2}}>{dari}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:4,lineHeight:1.4}}>{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── INSTRUMENT SELECTOR — multi-select for instrumentalists ── */}
                {f.artistType==="instrumentalist"&&(
                  <div>
                    <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:4}}>
                      Your instruments <span style={{color:C.ruby}}>*</span>
                      <span style={{fontWeight:400,marginLeft:6,color:C.muted}}>Select all you can play</span>
                    </div>
                    {f.selectedInstruments.length===0&&(
                      <div style={{fontSize:11,color:C.ruby,marginBottom:6}}>⚠ Select at least one instrument</div>
                    )}
                    {f.selectedInstruments.length>0&&(
                      <div style={{fontSize:11,color:C.emerald,marginBottom:6}}>✓ {f.selectedInstruments.length} instrument{f.selectedInstruments.length>1?"s":""} selected: {f.selectedInstruments.join(", ")}</div>
                    )}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {([
                        {v:"Tabla",    icon:"🥁", dari:"طبله"},
                        {v:"Rubab",    icon:"🪕", dari:"رباب"},
                        {v:"Drums",    icon:"🎶", dari:"درامز"},
                        {v:"Keyboard", icon:"🎹", dari:"کیبورد"},
                        {v:"Guitar",   icon:"🎸", dari:"گیتار"},
                        {v:"Harmonium",icon:"🎵", dari:"هارمونیم"},
                      ] as const).map(({v,icon,dari})=>{
                        const sel=f.selectedInstruments.includes(v);
                        return(
                          <button key={v} onClick={()=>toggleInstrument(v)}
                            style={{background:sel?`${C.lapis}22`:C.surface,border:`2px solid ${sel?C.lapis:C.border}`,borderRadius:10,padding:"10px 8px",cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.15s",position:"relative"}}>
                            {sel&&<div style={{position:"absolute",top:5,right:7,fontSize:11,color:C.lapis,fontWeight:900}}>✓</div>}
                            <div style={{fontSize:20,marginBottom:2}}>{icon}</div>
                            <div style={{fontWeight:700,color:sel?C.lapis:C.text,fontSize:T.xs}}>{v}</div>
                            <div style={{fontSize:10,color:C.muted,fontFamily:"'Noto Naskh Arabic',serif"}}>{dari}</div>
                          </button>
                        );
                      })}
                    </div>
                    {f.selectedInstruments.length>1&&(
                      <div style={{background:C.lapisS,border:`1px solid ${C.lapis}22`,borderRadius:8,padding:"8px 12px",marginTop:8,fontSize:11,color:C.textD,lineHeight:1.6}}>
                        💡 Customers can choose which instrument they want you to play when booking. Your primary instrument will be: <strong style={{color:C.lapis}}>{f.selectedInstruments[0]}</strong> (first selected)
                      </div>
                    )}
                  </div>
                )}

                {/* Genre — multi-select */}
                <div>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:4}}>
                    What type of music? <span style={{color:C.ruby}}>*</span>
                    <span style={{fontWeight:400,marginLeft:6,color:C.muted}}>Pick all that apply</span>
                  </div>
                  {f.genres.length===0&&(
                    <div style={{fontSize:11,color:C.ruby,marginBottom:6}}>⚠ Select at least one genre</div>
                  )}
                  {f.genres.length>0&&(
                    <div style={{fontSize:11,color:C.emerald,marginBottom:6}}>✓ {f.genres.join(", ")}</div>
                  )}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[["Ghazal","غزل"],["Herati","هراتی"],["Mast","مست"],["Pashto","پشتو"],["Logari","لوگری"],["Classical","کلاسیک"],["Folk","فولک"],["Fusion","فیوژن"],["Sufi","صوفی"],["Wedding","عروسی"]].map(([g,dari])=>{
                      const sel=f.genres.includes(g);
                      return(
                        <button key={g} onClick={()=>toggleGenre(g)}
                          style={{background:sel?C.goldS:C.surface,border:`2px solid ${sel?C.gold:C.border}`,borderRadius:10,padding:"11px 8px",cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.15s",position:"relative"}}>
                          {sel&&<div style={{position:"absolute",top:5,right:7,fontSize:11,color:C.gold,fontWeight:900}}>✓</div>}
                          <div style={{fontWeight:700,color:sel?C.gold:C.text,fontSize:T.sm}}>{g}</div>
                          <div style={{fontSize:11,color:C.muted,fontFamily:"'Noto Naskh Arabic',serif"}}>{dari}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Location */}
                <div>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:6}}>Your city</div>
                  <input value={f.location} onChange={e=>setF(p=>({...p,location:e.target.value}))}
                    placeholder="e.g. Oslo, Norway"
                    style={{width:"100%",background:C.surface,border:`2px solid ${f.location?C.emerald:C.border}`,borderRadius:12,padding:"14px 16px",color:C.text,fontSize:16,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                </div>

                {/* Currency preference */}
                <div>
                  <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:8}}>Preferred payout currency</div>
                  <div style={{display:"flex",gap:8}}>
                    {(["EUR","NOK","SEK","DKK","GBP"] as const).map(cur=>(
                      <button key={cur} onClick={()=>setF(p=>({...p,currency:cur}))}
                        style={{flex:1,background:f.currency===cur?C.goldS:C.surface,border:`2px solid ${f.currency===cur?C.gold:C.border}`,borderRadius:10,padding:"10px 4px",cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.15s"}}>
                        <div style={{fontWeight:700,color:f.currency===cur?C.gold:C.text,fontSize:T.xs}}>{cur}</div>
                      </button>
                    ))}
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginTop:5}}>Stripe auto-converts · EUR is always the base rate</div>
                </div>

                {/* ── PRICING ── */}
                <div>
                  {/* How pricing works — shown for everyone */}
                  <div style={{background:C.goldS,border:`1px solid ${C.gold}33`,borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                    <div style={{fontSize:T.xs,fontWeight:700,color:C.gold,marginBottom:6}}>{t('pricingHowTitle')}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {[
                        [t('pricingDepositLabel'),t('pricingDepositDesc'),"💳"],
                        [t('pricingCountryLabel'),t('pricingCountryDesc'),"🌍"],
                        [t('pricingAfterLabel'),t('pricingAfterDesc'),"💵"],
                      ].map(([title,desc,icon])=>(
                        <div key={title} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                          <span style={{fontSize:14,flexShrink:0}}>{icon}</span>
                          <div>
                            <span style={{fontWeight:700,color:C.text,fontSize:T.xs}}>{title}: </span>
                            <span style={{fontSize:T.xs,color:C.muted}}>{desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {f.artistType==="vocalist"||f.artistType===""?(
                    <>
                      {/* Solo deposit */}
                      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:10}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                          <span style={{fontSize:18}}>🎤</span>
                          <div>
                            <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{t('soloDepositLabel')} <span style={{color:C.ruby}}>*</span></div>
                            <div style={{fontSize:11,color:C.muted}}>{t('soloDepositSub')}</div>
                          </div>
                        </div>
                        <div style={{background:C.rubyS,border:`1px solid ${C.ruby}22`,borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:C.textD,lineHeight:1.6}}>
                          ⚠️ <strong style={{color:C.text}}>!</strong> {t('soloImportant')}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                          {[500,800,1000,1500].map(d=>(
                            <button key={d} onClick={()=>setF(p=>({...p,deposit:String(d)}))}
                              style={{background:f.deposit===String(d)?C.goldS:C.card,border:`2px solid ${f.deposit===String(d)?C.gold:C.border}`,borderRadius:10,padding:"10px 4px",cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.15s"}}>
                              <div style={{fontWeight:700,color:f.deposit===String(d)?C.gold:C.text,fontSize:T.sm}}>€{d}</div>
                            </button>
                          ))}
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                          <div style={{fontSize:11,color:C.muted}}>{t('keepPct')} <strong style={{color:C.gold}}>€{Math.round(parseInt(f.deposit||"500")*0.88)}</strong></div>
                          <div style={{fontSize:10,color:C.muted}}>+ balance paid cash after event</div>
                        </div>
                      </div>

                      {/* With-band deposit */}
                      <div style={{background:C.lapisS,border:`1px solid ${C.lapis}33`,borderRadius:12,padding:"14px 16px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                          <span style={{fontSize:18}}>🎼</span>
                          <div>
                            <div style={{fontWeight:700,color:C.lapis,fontSize:T.sm}}>{t('withBandDepositLabel')} <span style={{color:C.ruby}}>*</span></div>
                            <div style={{fontSize:11,color:C.muted}}>Upfront deposit when you bring your full band · min €800 · per country prices set in dashboard</div>
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                          {[800,1200,1500,2000].map(d=>(
                            <button key={d} onClick={()=>setF(p=>({...p,depositWithBand:String(d)}))}
                              style={{background:f.depositWithBand===String(d)?`${C.lapis}22`:C.card,border:`2px solid ${f.depositWithBand===String(d)?C.lapis:C.border}`,borderRadius:10,padding:"10px 4px",cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.15s"}}>
                              <div style={{fontWeight:700,color:f.depositWithBand===String(d)?C.lapis:C.text,fontSize:T.sm}}>€{d}</div>
                            </button>
                          ))}
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                          <div style={{fontSize:11,color:C.muted}}>{t('keepPct')} <strong style={{color:C.lapis}}>€{Math.round(parseInt(f.depositWithBand||"800")*0.88)}</strong></div>
                          <div style={{fontSize:10,color:C.muted}}>+ balance paid cash after event</div>
                        </div>
                      </div>
                    </>
                  ):(
                    <>
                      <div style={{fontSize:T.xs,fontWeight:700,color:C.muted,marginBottom:4}}>
                        Session deposit <span style={{color:C.ruby}}>*</span>
                        <span style={{fontWeight:400,marginLeft:6}}>€50 – €250 · per country prices set in dashboard</span>
                      </div>
                      <div style={{background:C.lapisS,border:`1px solid ${C.lapis}33`,borderRadius:10,padding:"10px 12px",marginBottom:8,fontSize:11,color:C.textD,lineHeight:1.6}}>
                        💡 This is the deposit customers pay upfront via Stripe. You set full prices per country in your dashboard after signing up. The remaining balance is paid in cash after the event.
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:6}}>
                        {[50,100,150,200,250].slice(0,4).map(d=>(
                          <button key={d} onClick={()=>setF(p=>({...p,deposit:String(d)}))}
                            style={{background:f.deposit===String(d)?`${C.lapis}22`:C.surface,border:`2px solid ${f.deposit===String(d)?C.lapis:C.border}`,borderRadius:10,padding:"10px 4px",cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.15s"}}>
                            <div style={{fontWeight:700,color:f.deposit===String(d)?C.lapis:C.text,fontSize:T.sm}}>€{d}</div>
                          </button>
                        ))}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <input type="number" min={50} max={250} value={f.deposit}
                          onChange={e=>setF(p=>({...p,deposit:e.target.value}))}
                          style={{flex:1,background:C.surface,border:`2px solid ${C.border}`,borderRadius:10,padding:"10px 12px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit"}}
                          placeholder="Custom (50–250)"/>
                        <div style={{fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>You get €{Math.round(parseInt(f.deposit||"100")*0.88)}</div>
                      </div>
                      {(parseInt(f.deposit)<50||parseInt(f.deposit)>250)&&f.deposit!==""&&(
                        <div style={{color:C.ruby,fontSize:11,marginTop:4}}>⚠ Must be between €50 and €250</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:8,marginTop:20}}>
              {step>1&&(
                <button onClick={()=>{setStep(s=>s-1);setErr("");}}
                  style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",color:C.muted}}>
                  ← Back
                </button>
              )}
              {step<2?(
                <button onClick={next}
                  style={{flex:2,background:`linear-gradient(135deg,${C.gold},${C.saffron})`,color:C.bg,border:"none",borderRadius:12,padding:"16px",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>
                  Continue → ادامه
                </button>
              ):(
                <button onClick={submit} disabled={loading}
                  style={{flex:2,background:loading?C.surface:`linear-gradient(135deg,${C.ruby},${C.rubyD||C.ruby})`,color:loading?C.muted:"#fff",border:"none",borderRadius:12,padding:"16px",fontWeight:800,fontSize:16,cursor:loading?"wait":"pointer",fontFamily:"inherit"}}>
                  {loading?"Creating account…":"Create My Artist Profile"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════════
// AWAZ AI MODULE — EventPlanForm + EventPlanView
// Plugs in as overlay — zero changes to existing UI/UX
// ═══════════════════════════════════════════════════════════════

interface ProgramItem { time:string;title:string;note:string;type:"ceremony"|"dinner"|"dance"|"attan"|"speech"|"other"; }
interface EventPlan { booking_id:string;customer_name:string;event_type:string;event_date:string;venue:string;venue_city:string;guest_count:number|"";start_time:string;end_time:string;program:ProgramItem[];special_songs:string;special_requests:string;dress_code:string;food_served:boolean;languages:string[]; }

async function getEPSupabase(){
  const {createClient}=await import("@supabase/supabase-js") as any;
  return createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function EventPlanForm({bookingId,customerName,eventType,eventDate,onSubmitted}:{bookingId:string;customerName:string;eventType?:string;eventDate?:string;onSubmitted?:()=>void;}){
  const [step,setStep]=useState<"form"|"program"|"songs"|"done">("form");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [form,setForm]=useState<EventPlan>({booking_id:bookingId,customer_name:customerName,event_type:eventType||"",event_date:eventDate||"",venue:"",venue_city:"",guest_count:"",start_time:"",end_time:"",program:[],special_songs:"",special_requests:"",dress_code:"",food_served:false,languages:[]});
  const [newItem,setNewItem]=useState<ProgramItem>({time:"",title:"",note:"",type:"ceremony"});
  const setF=(k:keyof EventPlan,v:any)=>setForm(p=>({...p,[k]:v}));
  const toggleLang=(l:string)=>setF("languages",form.languages.includes(l)?form.languages.filter(x=>x!==l):[...form.languages,l]);
  const addItem=()=>{if(!newItem.time||!newItem.title)return;setF("program",[...form.program,newItem]);setNewItem({time:"",title:"",note:"",type:"ceremony"});};
  const EP={card:{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:14,padding:"18px 20px",marginBottom:16},lbl:{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.45)",letterSpacing:"0.7px",textTransform:"uppercase" as const,marginBottom:6,display:"block"},inp:{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"10px 14px",color:"#EDE4CE",fontSize:14,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box" as const,outline:"none"},btn:(col="#C8A84A")=>({background:col,color:col==="#C8A84A"?"#07060B":"#fff",border:"none",borderRadius:10,padding:"11px 20px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}),chip:(s:boolean)=>({display:"inline-block",padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",border:s?"1px solid #C8A84A":"1px solid rgba(255,255,255,0.15)",background:s?"rgba(200,168,74,0.18)":"transparent",color:s?"#C8A84A":"rgba(255,255,255,0.55)",marginRight:6,marginBottom:6})};
  const submit=async()=>{setLoading(true);setError("");try{const sb=await getEPSupabase();const{error:e}=await sb.from("event_plans").upsert({...form,updated_at:new Date().toISOString()},{onConflict:"booking_id"});if(e)throw new Error(e.message);setStep("done");onSubmitted?.();}catch(e:any){setError(e.message);}setLoading(false);};
  const tIcon:{[k:string]:string}={ceremony:"Seremoni",dinner:"Middag",dance:"Dans",attan:"Attan",speech:"Tale",other:"Annet"};

  if(step==="done")return(<div style={{textAlign:"center",padding:"40px 20px",color:"#EDE4CE"}}><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontWeight:700,marginBottom:8}}>Planen er sendt!</div><div style={{color:"rgba(255,255,255,0.5)",fontSize:14,lineHeight:1.7}}>Artisten forbereder seg nå til arrangementet ditt.</div></div>);

  return(
    <div style={{background:"#0F0D16",borderRadius:20,padding:"24px 20px 32px",color:"#EDE4CE",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:700,color:"#C8A84A",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Etter booking</div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontWeight:700,marginBottom:4}}>Fortell artisten om arrangementet</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",lineHeight:1.6}}>Hjelp artisten å forberede den perfekte opplevelsen</div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:20}}>{["Detaljer","Program","Sanger"].map((l,i)=><div key={l} style={{flex:1,height:3,borderRadius:2,background:i<(step==="form"?1:step==="program"?2:3)?"#C8A84A":"rgba(255,255,255,0.1)",transition:"background 0.3s"}}/>)}</div>
      {error&&<div style={{background:"rgba(168,44,56,0.15)",border:"1px solid rgba(168,44,56,0.3)",borderRadius:8,padding:"10px 14px",color:"#F87171",fontSize:13,marginBottom:12}}>⚠ {error}</div>}

      {step==="form"&&(<div>
        <div style={EP.card}>
          <label style={EP.lbl}>Type arrangement</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{["Bryllup","Forlovelse","Eid","Bursdag","Konsert","Annet"].map(t=><span key={t} onClick={()=>setF("event_type",t)} style={EP.chip(form.event_type===t)}>{t}</span>)}</div>
          <label style={EP.lbl}>Dato</label>
          <input type="date" value={form.event_date} onChange={e=>setF("event_date",e.target.value)} style={EP.inp}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><label style={EP.lbl}>Start</label><input type="time" value={form.start_time} onChange={e=>setF("start_time",e.target.value)} style={EP.inp}/></div><div><label style={EP.lbl}>Slutt</label><input type="time" value={form.end_time} onChange={e=>setF("end_time",e.target.value)} style={EP.inp}/></div></div>
        </div>
        <div style={EP.card}>
          <label style={EP.lbl}>Sted / Venue</label><input value={form.venue} onChange={e=>setF("venue",e.target.value)} placeholder="Navn på lokalet" style={EP.inp}/>
          <label style={EP.lbl}>By</label><input value={form.venue_city} onChange={e=>setF("venue_city",e.target.value)} placeholder="Oslo, Bergen..." style={EP.inp}/>
          <label style={EP.lbl}>Antall gjester</label><input type="number" value={form.guest_count} onChange={e=>setF("guest_count",parseInt(e.target.value)||"")} placeholder="100" style={EP.inp}/>
        </div>
        <div style={EP.card}>
          <label style={EP.lbl}>Gjestenes språk</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{["Dari","Pashto","Norsk","Deutsch","English","Français","Arabisk"].map(l=><span key={l} onClick={()=>toggleLang(l)} style={EP.chip(form.languages.includes(l))}>{l}</span>)}</div>
        </div>
        <button style={{...EP.btn(),width:"100%"}} onClick={()=>setStep("program")}>Neste: Program →</button>
      </div>)}

      {step==="program"&&(<div>
        <div style={EP.card}>
          <label style={EP.lbl}>Legg til programpunkter</label>
          <div style={{display:"grid",gridTemplateColumns:"80px 1fr",gap:8,marginBottom:8}}><input value={newItem.time} onChange={e=>setNewItem(p=>({...p,time:e.target.value}))} type="time" style={{...EP.inp,marginBottom:0}}/><input value={newItem.title} onChange={e=>setNewItem(p=>({...p,title:e.target.value}))} placeholder="Navn på punkt" style={{...EP.inp,marginBottom:0}}/></div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>{(Object.keys(tIcon) as any[]).map((t:any)=><span key={t} onClick={()=>setNewItem(p=>({...p,type:t}))} style={EP.chip(newItem.type===t)}>{tIcon[t]}</span>)}</div>
          <input value={newItem.note} onChange={e=>setNewItem(p=>({...p,note:e.target.value}))} placeholder="Notat (valgfritt)" style={EP.inp}/>
          <button style={EP.btn()} onClick={addItem}>+ Legg til</button>
        </div>
        {form.program.length>0&&<div style={EP.card}>{form.program.map((item,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.07)"}}><div><span style={{marginRight:8}}>{{"ceremony":"💍","dinner":"🍽️","dance":"💃","attan":"🥁","speech":"🎤","other":"⭐"}[item.type]}</span><strong style={{color:"#EDE4CE",fontSize:13}}>{item.time} — {item.title}</strong>{item.note&&<div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:2}}>{item.note}</div>}</div><button onClick={()=>setF("program",form.program.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"rgba(255,100,100,0.7)",cursor:"pointer",fontSize:16}}>✕</button></div>)}</div>}
        <div style={{display:"flex",gap:8}}><button style={{...EP.btn("rgba(255,255,255,0.1)"),flex:1,color:"#EDE4CE"}} onClick={()=>setStep("form")}>← Tilbake</button><button style={{...EP.btn(),flex:2}} onClick={()=>setStep("songs")}>Neste: Sanger →</button></div>
      </div>)}

      {step==="songs"&&(<div>
        <div style={EP.card}>
          <label style={EP.lbl}>Ønskede sanger (én per linje)</label>
          <textarea value={form.special_songs} onChange={e=>setF("special_songs",e.target.value)} placeholder={"Laila — Ahmad Zahir\nDa Meena Shor — Nashenas"} rows={5} style={{...EP.inp,resize:"vertical"}}/>
          <label style={EP.lbl}>Dresscode</label>
          <input value={form.dress_code} onChange={e=>setF("dress_code",e.target.value)} placeholder="Tradisjonelt, formelt..." style={EP.inp}/>
          <label style={EP.lbl}>Andre ønsker til artisten</label>
          <textarea value={form.special_requests} onChange={e=>setF("special_requests",e.target.value)} placeholder="F.eks: Spill attan etter kl 21..." rows={3} style={{...EP.inp,resize:"vertical"}}/>
          <div style={{display:"flex",alignItems:"center",gap:10,marginTop:4}}><input type="checkbox" id="food" checked={form.food_served} onChange={e=>setF("food_served",e.target.checked)} style={{width:18,height:18}}/><label htmlFor="food" style={{fontSize:13,color:"rgba(255,255,255,0.6)",cursor:"pointer"}}>Mat / middag serveres</label></div>
        </div>
        <div style={{display:"flex",gap:8}}><button style={{...EP.btn("rgba(255,255,255,0.1)"),flex:1,color:"#EDE4CE"}} onClick={()=>setStep("program")}>← Tilbake</button><button style={{...EP.btn(),flex:2}} onClick={submit} disabled={loading}>{loading?"Sender…":"Send plan til artisten ✓"}</button></div>
      </div>)}
    </div>
  );
}

export function EventPlanView({bookingId,C,T}:{bookingId:string;C:any;T:any}){
  const [plan,setPlan]=useState<EventPlan|null>(null);
  const [open,setOpen]=useState(false);
  useEffect(()=>{(async()=>{try{const sb=await getEPSupabase();const{data}=await sb.from("event_plans").select("*").eq("booking_id",bookingId).single();setPlan(data||null);}catch{setPlan(null);}})();},[bookingId]);
  if(!plan)return null;
  const tI:{[k:string]:string}={ceremony:"",dinner:"",dance:"",attan:"",speech:"",other:""};
  return(
    <div style={{marginBottom:12}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%",background:`linear-gradient(135deg,rgba(200,168,74,0.08),${C.card})`,border:`1px solid ${C.gold}44`,borderRadius:10,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"inherit"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>📋</span><span style={{fontSize:T.xs,fontWeight:700,color:C.gold}}>Event Plan Received</span>{plan.program?.length>0&&<span style={{background:C.goldS,color:C.gold,fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:10}}>{plan.program.length} items</span>}</div>
        <span style={{color:C.muted,fontSize:12}}>{open?"▲ Close":"▼ View"}</span>
      </button>
      {open&&<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:"0 0 10px 10px",padding:"14px 16px",borderTop:"none"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:14}}>
          {[["Type",plan.event_type],["Date",plan.event_date],["Time",plan.start_time?`${plan.start_time}–${plan.end_time}`:null],["Venue",plan.venue||plan.venue_city||null],["Guests",plan.guest_count?`ca. ${plan.guest_count}`:null],["Dresscode",plan.dress_code||null]].map(([l,v])=>v?<div key={l as string} style={{background:C.surface,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:"0.5px",marginBottom:2}}>{l}</div><div style={{fontSize:T.xs,color:C.text}}>{v}</div></div>:null)}
        </div>
        {plan.languages?.length>0&&<div style={{marginBottom:12}}><div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,marginBottom:6}}>Guest Languages</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{plan.languages.map(l=><span key={l} style={{background:C.lapisS,color:C.lapis,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,border:`1px solid ${C.lapis}33`}}>{l}</span>)}</div></div>}
        {plan.program?.length>0&&<div style={{marginBottom:12}}><div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,marginBottom:8}}>Programme</div>{plan.program.map((item,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 10px",background:C.surface,borderRadius:8,marginBottom:6,borderLeft:item.type==="attan"?`3px solid ${C.gold}`:`3px solid ${C.border}`}}><span style={{fontSize:15,flexShrink:0}}>{tI[item.type]||"⭐"}</span><div><div style={{fontSize:T.xs,fontWeight:700,color:C.text}}>{item.time} — {item.title}</div>{item.note&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{item.note}</div>}</div></div>)}</div>}
        {plan.special_songs&&<div style={{marginBottom:12}}><div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,marginBottom:6}}>Requested Songs</div><div style={{background:C.goldS,border:`1px solid ${C.gold}33`,borderRadius:8,padding:"10px 12px",fontSize:T.xs,color:C.textD,lineHeight:1.7,whiteSpace:"pre-wrap"}}>🎵 {plan.special_songs}</div></div>}
        {plan.special_requests&&<div><div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase" as const,marginBottom:6}}>Special Requests</div><div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",fontSize:T.xs,color:C.muted,lineHeight:1.7,whiteSpace:"pre-wrap"}}>📝 {plan.special_requests}</div></div>}
        {plan.food_served&&<div style={{marginTop:10,fontSize:T.xs,color:C.muted,display:"flex",gap:6}}><span>🍽️</span><span>Food / dinner will be served</span></div>}
      </div>}
    </div>
  );
}

// ── Root export — wraps everything in ErrorBoundary ─────────────────
export default function App(){
  return(
    <NotificationProvider>
      <ErrorBoundary><AppInner/></ErrorBoundary>
    </NotificationProvider>
  );
}
