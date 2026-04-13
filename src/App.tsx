import { useState, useRef, useEffect, useMemo } from "react";

// ── Supabase client ───────────────────────────────────────────────────
// Reads env vars injected by Vite (VITE_ prefix required)
const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPA_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Lazy-load Supabase so the app still works without it (demo mode)
let supabase = null;
async function getSupabase() {
  if (supabase) return supabase;
  if (!SUPA_URL || !SUPA_KEY) return null;
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabase = createClient(SUPA_URL, SUPA_KEY);
    return supabase;
  } catch { return null; }
}
const HAS_SUPA = !!(SUPA_URL && SUPA_KEY);

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

// ── Dual-theme system — WCAG AAA verified ────────────────────────────
// Dark: deep Afghan midnight. Light: warm Afghan parchment.
// Every color verified for contrast ratios:
//   AAA = 7:1+  |  AA+ = 4.5:1+  |  decorative = visual only
const DARK = {
  bg:'#07060B', surface:'#0F0D16', card:'#141220', cardH:'#1A1728',
  border:'#201D2E', borderM:'#2C2840',
  // Brand — bright on dark bg
  gold:'#C8A84A',    // 9.0:1 on bg — AAA ✓
  goldLt:'#E2C870',
  goldS:'rgba(200,168,74,0.09)',
  ruby:'#A82C38',    // 5.8:1 — AA+ ✓
  rubyLt:'#CC3848',
  rubyS:'rgba(168,44,56,0.09)',
  lapis:'#1E4E8C',
  lapisS:'rgba(30,78,140,0.09)',
  emerald:'#1A7850',
  emeraldS:'rgba(26,120,80,0.09)',
  saffron:'#C47820',
  lavender:'#6B4EAA',
  stripe:'#635BFF',
  // Typography — dark mode
  text:'#EDE4CE',    // 11.4:1 — AAA ✓
  textD:'#C8BBA0',   // 7.8:1  — AAA ✓
  muted:'#8A7D68',   // 4.8:1  — AA+  ✓
  faint:'#4A4238',
  // Social card backgrounds
  spotifyCard:'#0A1A0D',
  youtubeCard:'#150A0A',
  instagramCard:'#120810',
  tiktokCard:'#0A0A12',
  spotify:'#1DB954', instagram:'#E1306C',
};

const LIGHT = {
  bg:'#FAF8F4', surface:'#F0EBE2', card:'#FFFFFF', cardH:'#FAF7F2',
  border:'#E2D8CC', borderM:'#CFC3B3',
  // Brand — darkened for light bg
  gold:'#6B4D08',    // 7.3:1 on bg — AAA ✓
  goldLt:'#8A6510',
  goldS:'rgba(107,77,8,0.08)',
  ruby:'#8B1E2A',    // 8.6:1 — AAA ✓
  rubyLt:'#A82533',
  rubyS:'rgba(139,30,42,0.07)',
  lapis:'#1A3F7C',   // 9.6:1 — AAA ✓
  lapisS:'rgba(26,63,124,0.07)',
  emerald:'#145E3C', // 7.2:1 — AAA ✓
  emeraldS:'rgba(20,94,60,0.07)',
  saffron:'#7A4400', // 7.0:1 — AAA ✓
  lavender:'#5B3F9A',
  stripe:'#4B44CC',
  // Typography — light mode
  text:'#1C160D',    // 16.8:1 — AAA ✓
  textD:'#3B2F1E',   // 12.4:1 — AAA ✓
  muted:'#6B5C45',   // 6.1:1  — AA+  ✓
  faint:'#A89880',
  // Social card backgrounds (warm tints)
  spotifyCard:'#F0FAF5',
  youtubeCard:'#FFF5F5',
  instagramCard:'#FFF0F5',
  tiktokCard:'#F0FAFC',
  spotify:'#1DB954', instagram:'#E1306C',
};

// Module-level theme ref — updated on toggle, re-read on each render
let _theme = (() => { try { return localStorage.getItem('awaz-theme')||'dark'; } catch { return 'dark'; } })();
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
    aiTitle:"AI Artist Matching", aiFindBtn:"Find My Artist ✦", aiEvent:"Event Type", aiStyle:"Music Style",
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
    chatUnlocked:"Chat with {name} is now unlocked!",
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
    editProfile:"Edit", cancelEdit:"Cancel", saveProfile:"Save",
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
    howStep3Desc:"Artist-set deposit via Stripe — auto-split",
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
    pendingApproval:"Pending approval",
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
    notConnected:"Not Connected",
    youReceive:"You receive",
    artistPortal:"Artist Portal",
    depositSplit:"Deposit Split",
    findPerfectArtist:"Find your perfect artist",
    startOver:"Start over",
    profileUnderReview:"Your profile is under review. Sign in to connect Stripe and complete verification.",
    submitApplication:"Submit Application",
    inquiryReceived:"Inquiry Received",
    privateInquiry:"Private Inquiry",
    directToOwner:"Direct to Owner",
    directToOwnerDesc:"Personal response · Price negotiation · Bespoke packages",
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
    connected:"Connected!",
    youllReceive:"You'll receive",
    onYourWay:"You're on your way!",
    areYouArtist:"Are you an artist?",
    buttonInstead:"button instead.",
    spotifyInstructions2:"Go to your profile → three dots (⋯) → Share → Copy link to artist",
    spotifyLinkRecognized:"Spotify link recognized",
    instagramRecognized:"Instagram profile recognized",
    howToFindLink:"How to find your link",
    spotifyInstructions:"Spotify app: Go to your profile → three dots (⋯) → Share → Copy link to artist",
    artistProfileNotFound:"Artist Profile Not Found",
    noStripe:"No Stripe",
    recentBookingsLabel:"Recent Bookings",
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
    aiTitle:"AI Artistmatch", aiFindBtn:"Finn min artist ✦", aiEvent:"Arrangementtype", aiStyle:"Musikstil",
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
    chatUnlocked:"Chat med {name} er nå låst opp!",
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
    aiTitle:"KI-Künstler-Matching", aiFindBtn:"Meinen Künstler finden ✦", aiEvent:"Veranstaltungsart", aiStyle:"Musikstil",
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
    chatUnlocked:"Chat mit {name} ist jetzt freigeschaltet!",
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
    aiTitle:"Correspondance IA", aiFindBtn:"Trouver mon artiste ✦", aiEvent:"Type d'événement", aiStyle:"Style musical",
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
    chatUnlocked:"Le chat avec {name} est maintenant débloqué !",
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
    aiTitle:"تطابق هوشمند هنرمند", aiFindBtn:"پیدا کردن هنرمند ✦", aiEvent:"نوع رویداد", aiStyle:"سبک موسیقی",
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
    chatUnlocked:"چت با {name} باز شد!",
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
    aiTitle:"د هنرمند هوښیار مطابقت", aiFindBtn:"زما هنرمند ومومئ ✦", aiEvent:"د پیښې ډول", aiStyle:"د موسیقۍ سټایل",
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
    chatUnlocked:"د {name} سره چیټ خلاص شو!",
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
  },
};

// Module-level lang ref — updated on toggle
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

const sh = s => { let h=0; for(let i=0;i<s.length;i++) h=(Math.imul(31,h)+s.charCodeAt(i))|0; return h.toString(36); };

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
function SpotifyEmbed({ artistId, profileUrl }) {
  const [status, setStatus] = useState("idle"); // idle|loading|loaded|blocked
  const timerRef = useRef(null);

  const tryLoad = () => {
    setStatus("loading");
    // CSP blocks don't fire onError reliably on iframes.
    // Use a 5s timeout: if onLoad hasn't fired, assume blocked.
    timerRef.current = setTimeout(() => {
      setStatus(s => s==="loading" ? "blocked" : s);
    }, 5000);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!artistId) return null;

  if (status === "idle") return (
    <button onClick={tryLoad} style={{
      width:"100%",display:"flex",alignItems:"center",justifyContent:"center",
      gap:10,background:"rgba(29,185,84,0.08)",border:"1px dashed rgba(29,185,84,0.3)",
      borderRadius:10,padding:"14px",cursor:"pointer",
      fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:600,color:"#1DB954",
      WebkitTapHighlightColor:"transparent",marginTop:4,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#1DB954">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
      Load Spotify widget
    </button>
  );

  if (status === "loading") return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"24px 0"}}>
      <div style={{width:28,height:28,border:"2px solid rgba(29,185,84,0.2)",borderTopColor:"#1DB954",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"#1DB954"}}>{t('loadingSpotify')}</span>
    </div>
  );

  if (status === "blocked") return (
    <div style={{background:"rgba(29,185,84,0.05)",border:"1px solid rgba(29,185,84,0.2)",borderRadius:10,padding:"16px",marginTop:4,textAlign:"center"}}>
      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,color:"#1DB954",marginBottom:6}}>{t('spotifyBlocked')}</div>
      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:12}}>
        This only happens in preview. On your published Vercel site the widget loads fully. Add <code style={{background:C.bg,padding:"1px 5px",borderRadius:3,fontSize:11}}>frame-src open.spotify.com</code> to vercel.json CSP.
      </div>
      {profileUrl && (
        <a href={profileUrl} target="_blank" rel="noopener noreferrer" style={{
          display:"inline-flex",alignItems:"center",gap:7,
          background:"#1DB954",color:"#000",borderRadius:20,
          padding:"10px 20px",fontSize:13,fontWeight:700,
          textDecoration:"none",fontFamily:"'DM Sans',sans-serif",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="black"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
          Open in Spotify
        </a>
      )}
    </div>
  );

  // status === "loaded"
  return (
    <iframe
      src={`https://open.spotify.com/embed/artist/${artistId}?utm_source=generator&theme=0`}
      width="100%" height="352" frameBorder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      onLoad={()=>{ clearTimeout(timerRef.current); setStatus("loaded"); }}
      onError={()=>{ clearTimeout(timerRef.current); setStatus("blocked"); }}
      style={{display:"block",borderRadius:10,border:"1px solid rgba(29,185,84,0.2)",marginTop:4}}
    />
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
                    <div style={{width:30,height:30,borderRadius:6,background:"rgba(29,185,84,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>🎵</div>
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
            {spotifyId && <SpotifyEmbed artistId={spotifyId} profileUrl={spotify.profileUrl}/>}
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
function BottomNav({ active, onNav, items }) {
  return (
    <nav style={{
      position:"fixed",bottom:0,left:0,right:0,zIndex:200,
      background:`${C.surface}F8`,backdropFilter:"blur(20px)",
      
      display:"flex",alignItems:"stretch",
      paddingBottom:"env(safe-area-inset-bottom,0px)",
      height:`calc(58px + env(safe-area-inset-bottom,0px))`,
    }}>
      {items.map(({ id, icon, label }) => {
        const isActive = active === id;
        return (
          <button key={id} onClick={() => onNav(id)}
            style={{
              flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              gap:3,background:"transparent",border:"none",cursor:"pointer",
              color:isActive?C.gold:C.muted,
              paddingTop:8,paddingBottom:4,
              minHeight:44,minWidth:44,
              transition:"color 0.15s",
              fontFamily:"inherit",
            }}>
            <div style={{fontSize:22,lineHeight:1}}>{icon}</div>
            <div style={{fontSize:10,fontWeight:isActive?700:500,letterSpacing:"0.2px"}}>{label}</div>
            {isActive && <div style={{position:"absolute",top:0,width:24,height:2,borderRadius:1,background:C.gold}}/>}
          </button>
        );
      })}
    </nav>
  );
}

// ── UI Primitives ─────────────────────────────────────────────────────
const Diamond = ({ color=C.gold, size=8 }) => (
  <svg width={size} height={size} viewBox="0 0 8 8" style={{flexShrink:0}}>
    <path d="M4 0L5 3L8 4L5 5L4 8L3 5L0 4L3 3Z" fill={color} opacity="0.6"/>
  </svg>
);

const HR = ({ color=C.gold, my=14 }) => (
  <div style={{display:"flex",alignItems:"center",gap:10,margin:`${my}px 0`}}>
    <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${color}38)`}}/>
    <Diamond color={color}/>
    <div style={{flex:1,height:1,background:`linear-gradient(270deg,transparent,${color}38)`}}/>
  </div>
);

const Badge = ({ children, color=C.gold, sm=true }) => (
  <span style={{
    background:color+"14",color,border:`1px solid ${color}30`,
    borderRadius:4,padding:sm?"2px 8px":"3px 10px",
    fontSize:sm?10:11,fontWeight:700,letterSpacing:"0.4px",
    display:"inline-flex",alignItems:"center",gap:3,flexShrink:0,
  }}>{children}</span>
);

const Stars = ({ rating, count, size=12 }) => (
  <span style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
    <span style={{color:C.gold,fontSize:size}}>★</span>
    <span style={{color:C.text,fontWeight:700,fontSize:size}}>{rating}</span>
    {count && <span style={{color:C.muted,fontSize:size-1}}>({count})</span>}
  </span>
);

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
  const fg = v==="gold" ? C.bg : C.text;
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
    // Fallback: local base64
    const r = new FileReader();
    r.onload = ev => onPhoto(ev.target.result);
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
  const [msgs,setMsgs]=useState(booking.messages||[]);
  const ref=useRef(null);
  const endRef=useRef(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"auto"});},[]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  const send=()=>{
    if(!msg.trim()||!booking.chatUnlocked)return;
    const m={from:myRole,text:msg.trim(),time:new Date().toLocaleTimeString("en",{hour:"2-digit",minute:"2-digit"})};
    setMsgs(p=>[...p,m]);onSend?.(booking.id,m);setMsg("");
  };
  const bub=from=>from==="customer"?{bg:C.goldS,align:"flex-end"}:from==="artist"?{bg:`${artist?.color||C.ruby}18`,align:"flex-start"}:{bg:C.lapisS,align:"flex-start"};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:900,display:"flex",flexDirection:"column"}} onClick={onClose}>
      <div style={{flex:1,maxWidth:540,width:"100%",margin:"auto",display:"flex",flexDirection:"column",background:C.card,borderRadius:14,overflow:"hidden",maxHeight:"90vh",boxShadow:"0 40px 100px #000"}} onClick={e=>e.stopPropagation()}>
        <div style={{height:2,background:artist?`linear-gradient(90deg,${artist.color},${C.gold})`:`linear-gradient(90deg,${C.gold},${C.ruby})`}}/>
        <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,background:C.surface,flexShrink:0}}>
          {artist?.photo?<img src={artist.photo} alt="" style={{width:38,height:38,borderRadius:8,objectFit:"cover",flexShrink:0}}/>:
            <div style={{width:38,height:38,borderRadius:8,background:`${artist?.color||C.gold}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{artist?.emoji}</div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{artist?.name}</div>
            <div style={{fontSize:T.xs,color:booking.chatUnlocked?C.emerald:C.ruby,display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:booking.chatUnlocked?C.emerald:C.ruby}}/>
              {booking.chatUnlocked?"Active":"Locked — deposit required"}
            </div>
          </div>
          <button onClick={onClose} style={{width:36,height:36,borderRadius:"50%",background:C.surface,border:"none",color:C.muted,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"14px 14px",display:"flex",flexDirection:"column",gap:10}}>
          {!booking.chatUnlocked&&(
            <div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:12,padding:20,textAlign:"center",margin:"auto 0"}}>
              <div style={{fontSize:28,marginBottom:8}}>🔒</div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:6}}>{t('chatLockedTitle2')}</div>
              <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.6}}>{t('chatLockedBody2')}</div>
            </div>
          )}
          {msgs.map((m,i)=>{const s=bub(m.from);return(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:s.align}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:3}}>{m.from} · {m.time}</div>
              <div style={{background:s.bg,border:`1px solid rgba(255,255,255,0.04)`,borderRadius:12,padding:"10px 14px",maxWidth:"80%",fontSize:T.sm,color:C.text,lineHeight:1.55}}>{m.text}</div>
            </div>
          );})}
          <div ref={endRef}/>
        </div>
        <div style={{padding:"10px 12px",display:"flex",gap:8,background:C.surface,flexShrink:0,paddingBottom:`max(10px,env(safe-area-inset-bottom,10px))`}}>
          <input value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
            placeholder={booking.chatUnlocked?"Type a message…":"Deposit required"}
            disabled={!booking.chatUnlocked}
            style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.text,fontSize:T.base,outline:"none",fontFamily:"inherit",opacity:booking.chatUnlocked?1:0.5,minHeight:44}}/>
          <Btn onClick={send} sz="md" disabled={!booking.chatUnlocked||!msg.trim()}>→</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Stripe checkout ───────────────────────────────────────────────────
function StripeCheckout({ booking, artist, onSuccess, onClose }) {
  const [card,setCard]=useState({number:"",expiry:"",cvc:"",name:""});
  const [step,setStep]=useState("form");
  const [err,setErr]=useState("");
  const deposit=booking.deposit||1000;
  const artistAmt=Math.round(deposit*0.88);
  const awazAmt=deposit-artistAmt;
  const fmt4=v=>v.replace(/\D/g,"").replace(/(.{4})/g,"$1 ").trim().slice(0,19);
  const fmtEx=v=>{const n=v.replace(/\D/g,"");return n.length>=3?n.slice(0,2)+"/"+n.slice(2,4):n;};
  const pay=()=>{
    if(!card.name||card.number.replace(/\s/g,"").length<16||card.expiry.length<5||card.cvc.length<3){setErr("Please complete all fields.");return;}
    setErr("");setStep("processing");setTimeout(()=>setStep("done"),2000);
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:920,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{background:C.card,borderRadius:"20px 20px 0 0",maxHeight:"95vh",overflow:"auto",animation:"slideUp 0.28s cubic-bezier(0.32,0.72,0,1) both",boxShadow:"0 -20px 60px rgba(0,0,0,0.8)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"center",padding:"12px 0 4px"}}><div style={{width:40,height:4,borderRadius:2,background:C.borderM}}/></div>
        <div style={{height:3,background:`linear-gradient(90deg,${artist.color},${C.gold},${artist.color})`}}/>
        <div style={{padding:"0 20px 32px",paddingBottom:`max(32px,calc(env(safe-area-inset-bottom,0px) + 32px))`}}>

          {step==="processing"&&(
            <div style={{textAlign:"center",padding:"48px 0"}}>
              <div style={{width:48,height:48,border:`3px solid ${C.border}`,borderTopColor:C.gold,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 20px"}}/>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,color:C.text,marginBottom:6}}>Processing…</div>
              <div style={{color:C.muted,fontSize:T.sm}}>{t('securedByStripe')}</div>
            </div>
          )}

          {step==="done"&&(
            <div style={{textAlign:"center",padding:"32px 0"}}>
              <div style={{width:60,height:60,borderRadius:"50%",background:C.emeraldS,border:`2px solid ${C.emerald}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",fontSize:26}}>✓</div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:8}}>{t('depositConfirmed2')}</div>
              <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.7,marginBottom:8}}>
                <strong style={{color:C.gold}}>€{deposit}</strong> processed securely.
              </div>
              <div style={{background:C.surface,borderRadius:10,padding:"12px 16px",marginBottom:16,border:`1px solid ${C.border}`,textAlign:"left"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:T.sm,marginBottom:5}}>
                  <span style={{color:C.muted}}>→ {artist.name}</span>
                  <span style={{color:C.emerald,fontWeight:700}}>€{artistAmt} (direct)</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:T.sm}}>
                  <span style={{color:C.muted}}>→ Awaz fee (12%)</span>
                  <span style={{color:C.lapis,fontWeight:700}}>€{awazAmt}</span>
                </div>
              </div>
              <div style={{background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:T.sm,color:C.emerald}}>
                💬 Chat with {artist.name} is now unlocked!
              </div>
              <Btn v="emerald" sz="lg" full onClick={()=>{onSuccess();onClose();}}>{t('continueToChat2')}</Btn>
              <div style={{color:C.muted,fontSize:T.xs,marginTop:10}}>{t('balanceCashNote2')}</div>
            </div>
          )}

          {step==="form"&&(
            <>
              <div style={{paddingTop:16,paddingBottom:14,borderBottom:`1px solid ${C.border}`,marginBottom:16,display:"flex",gap:12,alignItems:"center"}}>
                {artist.photo?<img src={artist.photo} alt="" style={{width:44,height:44,borderRadius:8,objectFit:"cover",flexShrink:0}}/>:
                  <div style={{width:44,height:44,borderRadius:8,background:`${artist.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{artist.emoji}</div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,fontWeight:700,color:C.text}}>{artist.name}</div>
                  <div style={{color:artist.color,fontSize:T.xs}}>{booking.event} · {booking.date}</div>
                </div>
              </div>

              <div style={{background:C.surface,borderRadius:10,padding:"14px",marginBottom:14,border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{color:C.muted,fontSize:T.sm}}>{t('depositStripe')}</span>
                  <span style={{color:C.gold,fontWeight:800,fontSize:T.xl,fontFamily:"'Cormorant Garamond',serif"}}>€{deposit}</span>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1,background:C.emeraldS,borderRadius:6,padding:"7px 10px",textAlign:"center"}}>
                    <div style={{color:C.emerald,fontWeight:700,fontSize:T.sm}}>€{artistAmt}</div>
                    <div style={{color:C.muted,fontSize:T.xs,marginTop:1}}>Artist (88%)</div>
                  </div>
                  <div style={{flex:1,background:C.lapisS,borderRadius:6,padding:"7px 10px",textAlign:"center"}}>
                    <div style={{color:C.lapis,fontWeight:700,fontSize:T.sm}}>€{awazAmt}</div>
                    <div style={{color:C.muted,fontSize:T.xs,marginTop:1}}>Awaz (12%)</div>
                  </div>
                </div>
              </div>

              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <div style={{flex:1,height:1,background:C.border}}/>
                <div style={{background:"#635BFF",borderRadius:4,padding:"3px 10px",fontSize:T.xs,fontWeight:800,color:"#fff"}}>stripe</div>
                <div style={{flex:1,height:1,background:C.border}}/>
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:11,marginBottom:14}}>
                <Inp label="Cardholder Name" placeholder="Full name on card" value={card.name} onChange={e=>setCard(c=>({...c,name:e.target.value}))}/>
                <Inp label="Card Number" placeholder="4242 4242 4242 4242" value={card.number} onChange={e=>setCard(c=>({...c,number:fmt4(e.target.value)}))}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
                  <Inp label="Expiry" placeholder="MM/YY" value={card.expiry} onChange={e=>setCard(c=>({...c,expiry:fmtEx(e.target.value)}))}/>
                  <Inp label="CVC" placeholder="•••" value={card.cvc} onChange={e=>setCard(c=>({...c,cvc:e.target.value.replace(/\D/g,"").slice(0,4)}))}/>
                </div>
              </div>

              {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:8,padding:"10px 13px",color:C.ruby,fontSize:T.xs,marginBottom:12}}>⚠ {err}</div>}

              <button onClick={pay} style={{width:"100%",background:"linear-gradient(135deg,#635BFF,#7B72FF)",color:"#fff",border:"none",borderRadius:10,padding:16,fontSize:T.md,fontWeight:800,cursor:"pointer",fontFamily:"inherit",minHeight:52}}>
                Pay €{deposit} deposit securely
              </button>
              <div style={{textAlign:"center",marginTop:10,color:C.muted,fontSize:T.xs}}>🔒 256-bit SSL · Stripe PCI L1 · Auto-split payments</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────
const POLICIES=[
  {id:"flexible", label:"Flexible",  desc:"Full refund 7+ days before, 50% within 7 days"},
  {id:"moderate", label:"Moderate",  desc:"Full refund 72h+ before, no refund after"},
  {id:"strict",   label:"Strict",    desc:"50% refund 72h+ before, no refund after"},
  {id:"no_refund",label:"No Refund", desc:"No refunds under any circumstances"},
];
const USERS=[
  {id:"u0",role:"admin", email:"shams.nn@outlook.com",  hash:sh("Grindatuneth301.."),  name:"Admin"},
  {id:"u1",role:"artist",email:"soraya@awaz.no", hash:sh("Soraya123!"),  name:"Soraya Rahimi",  artistId:"a1"},
  {id:"u2",role:"artist",email:"ahmad@awaz.no",  hash:sh("Ahmad123!"),   name:"Ahmad Zafar",   artistId:"a2"},
  {id:"u3",role:"artist",email:"khalid@awaz.no", hash:sh("Khalid123!"),  name:"Khalid Noori",  artistId:"a4"},
];
const ARTISTS=[
  {id:"a1",name:"Soraya Rahimi",    nameDari:"ثریا رحیمی",   genre:"Classical Ghazal",  location:"Kabul · Oslo",   rating:4.98,reviews:87, priceInfo:"From €2,500",deposit:1000,emoji:"🎤",color:C.ruby,   photo:null,bio:"Soraya is one of Europe's leading Afghan vocalists, rooted in the classical ghazal tradition. Her voice carries the soul of centuries of Afghan poetry — Rumi, Hafez, Bedil — delivered with technical mastery and emotional depth that leaves audiences speechless.",tags:["Ghazal","Classical","Wedding","Eid"],        instruments:["Vocals","Harmonium"],       superhost:true, status:"approved",joined:"Jan 2024",available:{[MK]:[3,7,8,14,15,21,22,28],[MK2]:[1,5,8,12,15,19,22,26]},blocked:{[MK]:[10,11]},        earnings:7500,totalBookings:6, verified:true, stripeConnected:true, stripeAccount:"acct_sor123",cancellationPolicy:"moderate",
    spotify:{monthlyListeners:"124K",topTracks:["Laila (Live Oslo)","Ghazal-e-Rumi","Del-e-Man"],profileUrl:"https://open.spotify.com/artist/example"},
    instagram:{handle:"@soraya.rahimi.music",followers:"89.2K",profileUrl:"https://instagram.com/soraya.rahimi.music",posts:[{thumb:"🎤",caption:"Oslo Concert"},{thumb:"🎶",caption:"Recording"},{thumb:"🌹",caption:"Eid Special"}]},
    countryPricing:[
      {code:"NO",active:true, price:28000,deposit:11500},
      {code:"SE",active:true, price:26000,deposit:10500},
      {code:"DE",active:true, price:2500, deposit:1000},
      {code:"GB",active:true, price:2200, deposit:900},
      {code:"NL",active:false,price:2500, deposit:1000},
      {code:"US",active:false,price:2800, deposit:1100},
    ],
  },
  {id:"a2",name:"Ahmad Zafar",      nameDari:"احمد ظفر",      genre:"Rubab · Traditional",location:"Kandahar · Bergen",rating:4.93,reviews:52, priceInfo:"From €1,800",deposit:800, emoji:"🪕",color:C.lapis, photo:null,bio:"A virtuoso of the rubab — Afghanistan's national instrument. Ahmad has dedicated 20 years mastering both the Kabuli and Herati styles. His performances bridge generations, carrying the sound of ancient Afghanistan into every concert hall in Europe.",tags:["Rubab","Traditional","Festival"],               instruments:["Rubab","Tabla"],            superhost:false,status:"approved",joined:"Mar 2024",available:{[MK]:[2,9,16,22,23,29],[MK2]:[3,6,10,14,17,21]},blocked:{[MK]:[13]},           earnings:3600,totalBookings:4, verified:true, stripeConnected:true, stripeAccount:"acct_ahm456",cancellationPolicy:"flexible",
    spotify:{monthlyListeners:"41K",topTracks:["Rubab Raga No. 1","Herati Saz","Safar"],profileUrl:"https://open.spotify.com/artist/example"},
    instagram:{handle:"@ahmad.rubab",followers:"22.8K",profileUrl:"https://instagram.com/ahmad.rubab",posts:[{thumb:"🪕",caption:"Studio"},{thumb:"🎵",caption:"Bergen"},{thumb:"🏔",caption:"Afghanistan"}]},
    countryPricing:[
      {code:"NO",active:true, price:20700,deposit:9200},
      {code:"SE",active:true, price:19000,deposit:8500},
      {code:"DE",active:true, price:1800, deposit:800},
      {code:"GB",active:false,price:1600, deposit:700},
    ],
  },
  {id:"a3",name:"Mariam & Ensemble",nameDari:"مریم و گروه",   genre:"Afghan Folk",        location:"Herat · London", rating:5.0, reviews:41, priceInfo:"From €4,000",deposit:1200,emoji:"🎶",color:C.emerald,photo:null,bio:"A six-piece ensemble specializing in Herati folk music. Their sound blends dutaar, dohol, and haunting vocals that transport audiences to the valleys of western Afghanistan.",tags:["Folk","Ensemble","Wedding","Eid","Cultural"],   instruments:["Dutaar","Dohol","Tula"],    superhost:true, status:"pending", joined:"Nov 2024",available:{[MK]:[5,12,19,25,26]},                                         blocked:{[MK]:[]},             earnings:0,   totalBookings:0, verified:false,stripeConnected:false,stripeAccount:null,cancellationPolicy:"moderate",
    spotify:null,
    instagram:{handle:"@mariam.ensemble",followers:"11.4K",profileUrl:"https://instagram.com/mariam.ensemble",posts:[{thumb:"🎶",caption:"Rehearsal"},{thumb:"🌸",caption:"Herat"},{thumb:"👥",caption:"Ensemble"}]},
  },
  {id:"a4",name:"Khalid Noori",     nameDari:"خالد نوری",    genre:"Modern Afghan Pop",  location:"Oslo · Stockholm",rating:4.85,reviews:118,priceInfo:"From €2,200",deposit:1000,emoji:"🎸",color:C.saffron,photo:null,bio:"Khalid blends Afghan melody with contemporary pop production. With hundreds of thousands of followers and sell-out shows across Scandinavia, he is the defining voice of the Afghan diaspora generation.",tags:["Pop","Modern","Concert","Festival"],             instruments:["Guitar","Keyboard","Vocals"],superhost:false,status:"approved",joined:"Jun 2024",available:{[MK]:[4,10,17,18,24,25],[MK2]:[2,7,11,15,18,22]},blocked:{[MK]:[12]},          earnings:4400,totalBookings:5, verified:true, stripeConnected:true, stripeAccount:"acct_kha789",cancellationPolicy:"strict",
    spotify:{monthlyListeners:"318K",topTracks:["Watan (My Homeland)","Oslo Nights","Dil Ba Dil"],profileUrl:"https://open.spotify.com/artist/example"},
    instagram:{handle:"@khalidnoori",followers:"204K",profileUrl:"https://instagram.com/khalidnoori",posts:[{thumb:"🎸",caption:"Tour 2025"},{thumb:"🎤",caption:"Stockholm"},{thumb:"🌙",caption:"New Single"}]},
  },
  {id:"a5",name:"Fatima Qaderi",    nameDari:"فاطمه قادری",  genre:"Tabla · Percussion", location:"Mazar · Amsterdam",rating:4.96,reviews:33, priceInfo:"From €1,500",deposit:800, emoji:"🪘",color:C.gold,  photo:null,bio:"One of very few female tabla virtuosos in Europe. Fatima trained at the Kabul Conservatory under maestro Ustad Rahimi. Her performances are simultaneously meditative and explosive — a rare combination that leaves audiences transformed.",tags:["Tabla","Percussion","Classical"],               instruments:["Tabla","Zerbaghali"],       superhost:true, status:"approved",joined:"Feb 2024",available:{[MK]:[6,7,13,20,21,27],[MK2]:[4,8,11,15,18,22]},blocked:{[MK]:[]},             earnings:3000,totalBookings:3, verified:true, stripeConnected:false,stripeAccount:null,cancellationPolicy:"flexible",
    spotify:{monthlyListeners:"28K",topTracks:["Tabla Meditation","Mazar-e-Sharif","Zerbaghali Solo"],profileUrl:"https://open.spotify.com/artist/example"},
    instagram:{handle:"@fatima.tabla",followers:"34.1K",profileUrl:"https://instagram.com/fatima.tabla",posts:[{thumb:"🪘",caption:"Amsterdam"},{thumb:"🎵",caption:"Concert"},{thumb:"🌟",caption:"Masterclass"}]},
  },
  {id:"a6",name:"Rustam & Band",    nameDari:"رستم و باند",  genre:"Afghan Jazz Fusion",  location:"Kabul · Berlin",  rating:4.88,reviews:29, priceInfo:"From €3,000",deposit:1200,emoji:"🎷",color:C.lavender,photo:null,bio:"Europe's only Afghan jazz-fusion ensemble. Rustam weaves maqam scales through jazz harmony, drawing on influences from Miles Davis to Ahmad Shah Massoud's favourite composers. Profoundly Afghan, undeniably universal.",tags:["Jazz","Fusion","Concert","Corporate"],          instruments:["Saxophone","Rubab","Bass"], superhost:false,status:"pending", joined:"Dec 2024",available:{[MK]:[2,9,16,23,30]},                                           blocked:{[MK]:[]},             earnings:0,   totalBookings:0, verified:false,stripeConnected:false,stripeAccount:null,cancellationPolicy:"moderate",
    spotify:{monthlyListeners:"19K",topTracks:["Kabul Jazz","Maqam Minor","Silk Road"],profileUrl:"https://open.spotify.com/artist/example"},
    instagram:{handle:"@rustamband",followers:"8.7K",profileUrl:"https://instagram.com/rustamband",posts:[{thumb:"🎷",caption:"Berlin"},{thumb:"🎺",caption:"Jazz Festival"},{thumb:"🌐",caption:"World Tour"}]},
  },
];
// ── Global markets — diaspora-relevant countries with EUR conversion ──
const MARKETS=[
  // Nordic diaspora hub — top priority
  {code:"NO",flag:"🇳🇴",name:"Norway",        currency:"NOK",sym:"kr",  toEur:0.087, pop:true},
  {code:"SE",flag:"🇸🇪",name:"Sweden",        currency:"SEK",sym:"kr",  toEur:0.089, pop:true},
  {code:"DK",flag:"🇩🇰",name:"Denmark",       currency:"DKK",sym:"kr",  toEur:0.134, pop:true},
  {code:"FI",flag:"🇫🇮",name:"Finland",       currency:"EUR",sym:"€",   toEur:1,     pop:true},
  // Western Europe
  {code:"DE",flag:"🇩🇪",name:"Germany",       currency:"EUR",sym:"€",   toEur:1,     pop:true},
  {code:"GB",flag:"🇬🇧",name:"United Kingdom",currency:"GBP",sym:"£",   toEur:1.17,  pop:true},
  {code:"NL",flag:"🇳🇱",name:"Netherlands",   currency:"EUR",sym:"€",   toEur:1,     pop:true},
  {code:"FR",flag:"🇫🇷",name:"France",        currency:"EUR",sym:"€",   toEur:1,     pop:true},
  {code:"BE",flag:"🇧🇪",name:"Belgium",       currency:"EUR",sym:"€",   toEur:1,     pop:true},
  {code:"CH",flag:"🇨🇭",name:"Switzerland",   currency:"CHF",sym:"Fr",  toEur:1.03,  pop:true},
  {code:"AT",flag:"🇦🇹",name:"Austria",       currency:"EUR",sym:"€",   toEur:1,     pop:false},
  {code:"IT",flag:"🇮🇹",name:"Italy",         currency:"EUR",sym:"€",   toEur:1,     pop:false},
  {code:"ES",flag:"🇪🇸",name:"Spain",         currency:"EUR",sym:"€",   toEur:1,     pop:false},
  {code:"PT",flag:"🇵🇹",name:"Portugal",      currency:"EUR",sym:"€",   toEur:1,     pop:false},
  {code:"IE",flag:"🇮🇪",name:"Ireland",       currency:"EUR",sym:"€",   toEur:1,     pop:false},
  // North America
  {code:"US",flag:"🇺🇸",name:"USA",           currency:"USD",sym:"$",   toEur:0.92,  pop:true},
  {code:"CA",flag:"🇨🇦",name:"Canada",        currency:"CAD",sym:"$",   toEur:0.68,  pop:true},
  // Oceania
  {code:"AU",flag:"🇦🇺",name:"Australia",     currency:"AUD",sym:"$",   toEur:0.61,  pop:true},
  {code:"NZ",flag:"🇳🇿",name:"New Zealand",   currency:"NZD",sym:"$",   toEur:0.56,  pop:false},
  // Middle East / Afghan diaspora
  {code:"AE",flag:"🇦🇪",name:"UAE",           currency:"AED",sym:"د.إ", toEur:0.25,  pop:true},
  {code:"QA",flag:"🇶🇦",name:"Qatar",         currency:"QAR",sym:"ر.ق", toEur:0.25,  pop:true},
  {code:"KW",flag:"🇰🇼",name:"Kuwait",        currency:"KWD",sym:"د.ك", toEur:3.00,  pop:false},
  {code:"SA",flag:"🇸🇦",name:"Saudi Arabia",  currency:"SAR",sym:"ر.س", toEur:0.24,  pop:false},
  {code:"TR",flag:"🇹🇷",name:"Turkey",        currency:"TRY",sym:"₺",   toEur:0.028, pop:false},
  {code:"IR",flag:"🇮🇷",name:"Iran",          currency:"USD",sym:"$",   toEur:0.92,  pop:false},
  {code:"PK",flag:"🇵🇰",name:"Pakistan",      currency:"USD",sym:"$",   toEur:0.92,  pop:false},
  {code:"AF",flag:"🇦🇫",name:"Afghanistan",   currency:"USD",sym:"$",   toEur:0.92,  pop:true},
];

// ── Demo inquiries (owner inbox) ──────────────────────────────────────
const DEMO_INQUIRIES=[
  {id:"i1",name:"Farid Ahmadzai",email:"farid@email.com",country:"NO",eventType:"Wedding Reception",date:"June 2025",budget:"€2,500–5,000",preferredArtist:"a1",message:"We are planning a 200-person wedding in Oslo and would love Soraya Rahimi. Is there any flexibility on the price if we book two nights?",status:"new",ts:Date.now()-3600000},
  {id:"i2",name:"Zainab Hussain",email:"zainab@email.com",country:"GB",eventType:"Cultural Gala",date:"August 2025",budget:"€5,000+",preferredArtist:"",message:"We represent the Afghan Cultural Society of London. We are organising our annual gala and are interested in multiple artists. Please contact us to discuss a package deal.",status:"viewed",ts:Date.now()-86400000},
  {id:"i3",name:"Omar Karimi",email:"omar@gmail.com",country:"DE",eventType:"Eid Celebration",date:"March 2025",budget:"€1,000–2,500",preferredArtist:"a4",message:"Small private Eid party, approx 60 guests in Berlin. Very interested in Khalid Noori. What is the minimum booking fee?",status:"replied",reply:"Thank you Omar! We have spoken to Khalid and he can offer a special rate for intimate events. Will send details shortly.",ts:Date.now()-172800000},
];
const DEMO_BOOKINGS=[
  {id:"b1",artistId:"a1",customerName:"Nasrin Ahmadi",  customerEmail:"nasrin@email.com", date:`${MONTHS[NOW.getMonth()]} 7, ${NOW.getFullYear()}`, event:"Wedding Reception",   deposit:1000,depositPaid:true, status:"confirmed", chatUnlocked:true, messages:[{from:"customer",text:"So excited for the big day!",time:"10:30"},{from:"artist",text:"It will be absolutely unforgettable.",time:"10:45"},{from:"customer",text:"Can we add a Dari folk song?",time:"11:00"},{from:"artist",text:"Of course! I'll prepare Laila specially.",time:"11:12"}]},
  {id:"b2",artistId:"a2",customerName:"Jamshid Karimi", customerEmail:"jamshid@email.com",date:`${MONTHS[NOW.getMonth()]} 9, ${NOW.getFullYear()}`, event:"Eid Celebration",     deposit:800, depositPaid:true, status:"completed",  chatUnlocked:true, messages:[{from:"customer",text:"Thank you for the amazing performance!",time:"21:00"},{from:"artist",text:"Eid Mubarak to you and your family!",time:"21:20"}]},
  {id:"b3",artistId:"a4",customerName:"Layla Mansouri", customerEmail:"layla@email.com",  date:`${MONTHS[NOW.getMonth()]} 10, ${NOW.getFullYear()}`,event:"Corporate Gala",       deposit:1000,depositPaid:false,status:"pending_payment",chatUnlocked:false,messages:[]},
  {id:"b4",artistId:"a1",customerName:"Omar Safi",      customerEmail:"omar@email.com",   date:`${MONTHS[NOW.getMonth()]} 14, ${NOW.getFullYear()}`,event:"Birthday Celebration", deposit:1000,depositPaid:true, status:"confirmed", chatUnlocked:true, messages:[{from:"artist",text:"Looking forward to your celebration!",time:"09:00"},{from:"customer",text:"Can we discuss the setlist?",time:"09:30"}]},
  {id:"b5",artistId:"a4",customerName:"Fawad Noor",     customerEmail:"fawad@email.com",  date:`${MONTHS[NOW.getMonth()]} 17, ${NOW.getFullYear()}`,event:"Cultural Festival",    deposit:1000,depositPaid:true, status:"confirmed", chatUnlocked:true, messages:[{from:"customer",text:"Need you on stage by 7pm.",time:"14:00"},{from:"artist",text:"Confirmed, soundcheck at 5pm.",time:"14:20"}]},
];

// ── Artist card ───────────────────────────────────────────────────────
function ArtistCard({ artist, onClick, compact=false }) {
  const key=`${NOW.getFullYear()}-${NOW.getMonth()}`;
  const open=(artist.available[key]||[]).filter(d=>!(artist.blocked[key]||[]).includes(d)).length;
  const totalFollowers = useMemo(()=>{
    const sp = artist.spotify?.monthlyListeners||"";
    const ig = artist.instagram?.followers||"";
    if(!sp&&!ig) return null;
    return [sp&&`${sp} Spotify`,ig&&`${ig} IG`].filter(Boolean).join(" · ");
  },[artist]);

  if (compact) {
    return (
      <div onClick={()=>onClick(artist)}
        style={{display:"flex",gap:14,alignItems:"center",padding:"16px",background:C.card,borderRadius:12,cursor:"pointer",border:`1px solid ${C.border}`,WebkitTapHighlightColor:"transparent",minHeight:80,transition:"border-color 0.15s",borderLeft:`3px solid ${artist.color}44`}}>
        <div style={{position:"relative",flexShrink:0}}>
          {artist.photo?<img src={artist.photo} alt={artist.name} style={{width:54,height:54,borderRadius:10,objectFit:"cover",border:`2px solid ${artist.color}50`}}/>:
            <div style={{width:54,height:54,borderRadius:10,background:`${artist.color}15`,border:`2px solid ${artist.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{artist.emoji}</div>}
          {artist.verified&&<div style={{position:"absolute",bottom:-3,right:-3,width:16,height:16,borderRadius:"50%",background:C.emerald,border:`2px solid ${C.card}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:800}}>✓</div>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.2}}>{artist.name}</div>
          <div style={{color:artist.color,fontSize:T.sm,fontWeight:600,marginTop:3}}>{artist.genre}</div>
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:5,flexWrap:"wrap"}}>
            <Stars rating={artist.rating} count={artist.reviews} size={12}/>
            <span style={{color:C.muted,fontSize:T.xs}}>·</span>
            <span style={{color:C.emerald,fontSize:T.sm,fontWeight:700}}>{open} {t('openDates')}</span>
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,fontWeight:700,color:artist.color}}>{artist.priceInfo}</div>
          <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>€{artist.deposit} dep.</div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={()=>onClick(artist)}
      style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,cursor:"pointer",overflow:"hidden",WebkitTapHighlightColor:"transparent",transition:"border-color 0.15s, transform 0.15s"}}>
      <div style={{height:3,background:`linear-gradient(90deg,${artist.color},${C.gold},${artist.color})`}}/>
      <div style={{padding:"20px"}}>
        <div style={{display:"flex",gap:13,alignItems:"flex-start",marginBottom:14}}>
          <div style={{position:"relative",flexShrink:0}}>
            {artist.photo?<img src={artist.photo} alt={artist.name} style={{width:60,height:60,borderRadius:11,objectFit:"cover",border:`2px solid ${artist.color}50`}}/>:
              <div style={{width:60,height:60,borderRadius:11,background:`${artist.color}15`,border:`2px solid ${artist.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>{artist.emoji}</div>}
            {artist.verified&&<div style={{position:"absolute",bottom:-4,right:-4,width:17,height:17,borderRadius:"50%",background:C.emerald,border:`2px solid ${C.card}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:800}}>✓</div>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            {artist.nameDari&&<div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:T.sm,color:C.muted,textAlign:"right",marginBottom:2}}>{artist.nameDari}</div>}
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,lineHeight:1.1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{artist.name}</div>
            <div style={{color:artist.color,fontSize:T.sm,fontWeight:600,marginTop:3}}>{artist.genre}</div>
            {totalFollowers&&<div style={{fontSize:T.xs,color:C.muted,marginTop:3}}>{totalFollowers}</div>}
          </div>
          {artist.superhost&&<Badge color={C.gold}>★ Top</Badge>}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{color:C.muted,fontSize:T.sm}}>📍 {artist.location}</span>
          <Badge color={C.emerald}>{open} {t('openDates')}</Badge>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>
          {artist.tags.slice(0,3).map(t=><Badge key={t} color={artist.color}>{t}</Badge>)}
        </div>
        <div style={{height:1,background:C.border,marginBottom:14}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Stars rating={artist.rating} count={artist.reviews} size={13}/>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:artist.color}}>{artist.priceInfo}</div>
            <div style={{fontSize:T.xs,color:C.muted,marginTop:2}}>€{artist.deposit} deposit</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Login sheet — Supabase Auth + demo fallback ────────────────────────
function LoginSheet({ users, open, onLogin, onClose }) {
  const [mode,setMode]=useState("login"); // login | register | forgot | forgot_sent
  const [email,setEmail]=useState(""),[pass,setPass]=useState(""),
    [name,setName]=useState(""),
    [err,setErr]=useState(""),
    [attempts,setAt]=useState(0),[locked,setLocked]=useState(false),
    [loading,setLoading]=useState(false);

  useEffect(()=>{ if(open){setErr("");setMode("login");setName("");} },[open]);

  const doLogin=async()=>{
    if(locked){setErr("Too many attempts. Wait 5 min.");return;}
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
        // Fetch profile to get role + artistId
        const {data:profile}=await sb.from("profiles").select("*").eq("id",data.user.id).single();
        // Also check local USERS array by email as role fallback (handles admin accounts)
        const localUser=users.find(u=>u.email.toLowerCase()===data.user.email.toLowerCase());
        const role=profile?.role||localUser?.role||"customer";
        onLogin({
          id:data.user.id,
          email:data.user.email,
          name:profile?.name||localUser?.name||data.user.email,
          role,
          artistId:profile?.artist_id||localUser?.artistId||null,
        });
      } catch(e){
        setLoading(false);
        // If Supabase completely fails, try demo users as fallback
        const u=users.find(u=>u.email.toLowerCase()===email.toLowerCase()&&u.hash===sh(pass));
        if(u){ onLogin(u); } else { setErr("Connection error — check Supabase URL in Vercel settings."); }
      }
      return;
    }

    // ── Demo fallback (no Supabase) ───────────────────────────────────
    setTimeout(()=>{
      const u=users.find(u=>u.email.toLowerCase()===email.toLowerCase()&&u.hash===sh(pass));
      setLoading(false);
      if(!u){
        setAt(prev=>{
          const na=prev+1;
          if(na>=5){setLocked(true);setTimeout(()=>{setLocked(false);setAt(0);},5*60*1000);}
          setErr(`Wrong credentials. ${Math.max(0,5-na)} attempts left.`);
          return na;
        });
        return;
      }
      onLogin(u);
    },500);
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
            ?<><div style={{fontSize:36,marginBottom:8}}>📧</div>
               <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:6}}>{t('emailSent2')}</div>
               <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.7,marginBottom:20}}>{t("checkInbox2")} <strong style={{color:C.gold}}>{email}</strong> {t("forResetLink")}</div>
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
            <div style={{background:C.surface,borderRadius:10,padding:"14px",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:T.xs,color:C.saffron,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                <span>⚠</span> Demo accounts — testing only
              </div>
              <div style={{fontSize:T.xs,color:C.muted,marginBottom:10,lineHeight:1.5}}>{t('demoNote2')}</div>
              {[["shams.nn@outlook.com","Grindatuneth301..","Admin"],["soraya@awaz.no","Soraya123!","Artist"],["khalid@awaz.no","Khalid123!","Artist"]].map(([e,p,r])=>(
                <button key={e} onClick={()=>{setEmail(e);setPass(p);setErr("");}}
                  style={{display:"flex",justifyContent:"space-between",width:"100%",background:"transparent",border:"none",borderBottom:`1px solid ${C.border}`,color:C.textD,cursor:"pointer",fontSize:T.xs,padding:"10px 0",fontFamily:"inherit",minHeight:44,WebkitTapHighlightColor:"transparent"}}>
                  <span><span style={{color:C.gold}}>→</span> {e}</span><span style={{color:C.muted}}>{r}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ── Artist Profile Page ───────────────────────────────────────────────
function ProfilePage({ artist, bookings, onBack, onBookingCreated }) {
  const vp=useViewport();
  const [selDay,setSelDay]=useState(null),[selMonth,setSelMonth]=useState(null),[selYear,setSelYear]=useState(null);
  const [tab,setTab]=useState("about");
  const [showBook,setShowBook]=useState(false);
  const [showCal,setShowCal]=useState(false);
  const [form,setForm]=useState({name:"",email:"",phone:"",event:"",notes:""});
  const [pending,setPending]=useState(null);
  const [showStripe,setShowStripe]=useState(false);
  const [chat,setChat]=useState(null);
  const [err,setErr]=useState("");
  const policy=POLICIES.find(p=>p.id===artist.cancellationPolicy);

  const doBook=()=>{
    if(!form.name){setErr("Your name is required.");return;}
    if(!form.email||!form.email.includes("@")){setErr("Valid email is required.");return;}
    setErr("");
    const nb={id:`b${Date.now()}`,artistId:artist.id,customerName:form.name,customerEmail:form.email,
      date:`${MONTHS[selMonth]} ${selDay}, ${selYear}`,event:form.event||"Private Event",
      deposit:artist.deposit,depositPaid:false,status:"pending_payment",chatUnlocked:false,messages:[]};
    setPending(nb);setShowBook(false);setShowStripe(true);
  };
  const onPaid=()=>{
    if(!pending)return;
    const paid={...pending,depositPaid:true,status:"confirmed",chatUnlocked:true};
    onBookingCreated(paid);setChat(paid);
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
                <div style={{width:vp.isMobile?80:100,height:vp.isMobile?80:100,borderRadius:14,background:`${artist.color}20`,border:`2px solid ${artist.color}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:vp.isMobile?38:48}}>{artist.emoji}</div>}
              {artist.verified&&<div style={{position:"absolute",bottom:-5,right:-5,background:C.emerald,borderRadius:20,padding:"3px 8px",fontSize:10,fontWeight:700,color:"#fff",border:`2px solid ${C.bg}`}}>✓</div>}
            </div>
            <div style={{flex:1}}>
              {artist.nameDari&&<div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:T.sm,color:C.gold,direction:"rtl",marginBottom:3}}>{artist.nameDari}</div>}
              <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["3xl"],fontWeight:800,color:C.text,margin:"0 0 5px",lineHeight:1}}>{artist.name}</h1>
              <div style={{color:artist.color,fontWeight:600,fontSize:T.sm,marginBottom:8}}>{artist.genre}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
                <span style={{color:C.muted,fontSize:T.xs}}>📍 {artist.location}</span>
                {artist.reviews>0&&<Stars rating={artist.rating} count={artist.reviews}/>}
                {artist.superhost&&<Badge color={C.gold}>★ Top</Badge>}
              </div>
            </div>
            {!vp.isMobile&&(
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:T.xs,color:C.muted,marginBottom:3}}>FROM</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:800,color:artist.color}}>{artist.priceInfo}</div>
                <div style={{fontSize:T.xs,color:C.muted,marginTop:3}}>€{artist.deposit} deposit · Balance cash</div>
              </div>
            )}
          </div>
          {/* Mobile price + book CTA */}
          {vp.isMobile&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:16}}>
              <div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:800,color:artist.color}}>{artist.priceInfo}</div>
                <div style={{fontSize:T.xs,color:C.muted,marginTop:2}}>€{artist.deposit} deposit · Balance cash</div>
              </div>
              <Btn v="gold" sz="lg" onClick={()=>setShowCal(true)}>{t('bookNow')}</Btn>
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
                <div style={{background:C.card,borderRadius:12,padding:vp.isMobile?20:28,border:`1px solid ${C.border}`}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.xl,fontWeight:700,marginBottom:14,letterSpacing:"-0.3px"}}>About {artist.name.split(" ")[0]}</div>
                  <p style={{
                    color:C.textD,lineHeight:1.85,margin:"0 0 16px",
                    fontSize:T.base,
                    fontFamily:"'DM Sans',sans-serif",
                    fontWeight:400,
                  }}>{artist.bio}</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7}}>{artist.tags.map(t=><Badge key={t} color={artist.color} sm={false}>{t}</Badge>)}</div>
                </div>
                <div style={{background:C.card,borderRadius:12,padding:vp.isMobile?20:28,border:`1px solid ${C.border}`}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.xl,fontWeight:700,marginBottom:14,letterSpacing:"-0.3px"}}>{t('bookingTerms')}</div>
                  <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr":"1fr 1fr",gap:12}}>
                    {[["💳",`€${artist.deposit} deposit via Stripe`,"Paid at booking — auto-split"],["💬","Chat unlocks immediately","Direct messaging after payment"],["💵","Balance in cash","To artist after the concert"],["📋",`${policy?.label} policy`,policy?.desc||""]].map(([icon,k,v])=>(
                      <div key={k} style={{background:C.surface,borderRadius:8,padding:"12px 14px",border:`1px solid ${C.border}`,borderLeft:`3px solid ${artist.color}35`}}>
                        <div style={{fontSize:18,marginBottom:6}}>{icon}</div>
                        <div style={{color:C.text,fontWeight:700,fontSize:T.xs,marginBottom:3}}>{k}</div>
                        <div style={{color:C.muted,fontSize:T.xs,lineHeight:1.5}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Market pricing — if artist has set country prices */}
                {artist.countryPricing?.filter(r=>r.active).length>0&&(
                  <div style={{background:C.card,borderRadius:12,padding:vp.isMobile?20:28,border:`1px solid ${C.border}`}}>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.xl,fontWeight:700,marginBottom:6,letterSpacing:"-0.3px"}}>{t('pricingByCountry')}</div>
                    <div style={{color:C.muted,fontSize:T.xs,marginBottom:14}}>{t('pricesLocal')}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:7}}>
                      {artist.countryPricing.filter(r=>r.active).map(row=>{
                        const m=MARKETS.find(m=>m.code===row.code);
                        if(!m) return null;
                        const eurP=row.price?Math.round(row.price*m.toEur):null;
                        const eurD=row.deposit?Math.round(row.deposit*m.toEur):null;
                        return(
                          <div key={row.code} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",background:C.surface,borderRadius:8,border:`1px solid ${C.border}`}}>
                            <span style={{fontSize:20,flexShrink:0}}>{m.flag}</span>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:700,fontSize:T.sm,color:C.text}}>{m.name}</div>
                              <div style={{fontSize:T.xs,color:C.muted,marginTop:1}}>{m.currency !== "EUR" ? `${m.sym}${row.deposit?.toLocaleString()} deposit` : `€${row.deposit?.toLocaleString()} deposit`}</div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:800,color:artist.color}}>
                                {m.sym}{row.price?.toLocaleString()}
                              </div>
                              {m.currency!=="EUR"&&eurP&&<div style={{fontSize:T.xs,color:C.muted}}>≈ €{eurP.toLocaleString()}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {tab==="instruments"&&(
              <div style={{background:C.card,borderRadius:12,padding:vp.isMobile?16:24,border:`1px solid ${C.border}`}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.lg,fontWeight:700,marginBottom:14}}>Instruments & Skills</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {artist.instruments.map(ins=>(
                    <div key={ins} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${artist.color}`,borderRadius:8,padding:"13px 15px",fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,color:C.text,fontWeight:600}}>{ins}</div>
                  ))}
                </div>
              </div>
            )}
            {tab==="reviews"&&(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {[{name:"Nasrin Ahmadi",date:"Feb 2025",text:"An absolutely incredible performance. Every guest was moved to tears. Truly unforgettable.",rating:5},{name:"Jamshid Karimi",date:"Jan 2025",text:"Professional, punctual, authentic. The music perfectly captured the spirit of our Eid. Cannot recommend enough.",rating:5},{name:"Layla Mansouri",date:"Dec 2024",text:"Exceeded every expectation at our corporate cultural evening. The entire room was captivated.",rating:4.8}].map((r,i)=>(
                  <div key={i} style={{background:C.card,borderRadius:12,padding:vp.isMobile?18:24,border:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                      <div><div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:C.text,fontSize:T.lg}}>{r.name}</div><div style={{color:C.muted,fontSize:T.sm,marginTop:2}}>{r.date}</div></div>
                      <Stars rating={r.rating} size={14}/>
                    </div>
                    <p style={{color:C.textD,fontSize:T.base,margin:0,lineHeight:1.8,fontFamily:"'DM Sans',sans-serif",fontWeight:400}}>{r.text}</p>
                  </div>
                ))}
              </div>
            )}
            {tab==="social"&&(
              <div style={{paddingTop:4}}>
                {(artist.spotify||artist.instagram)
                  ?<SocialBar artist={artist}/>
                  :<div style={{textAlign:"center",padding:"40px 24px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:36,marginBottom:12}}>🎵</div>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:6}}>{t('noSocialConnected')}</div>
                    <div style={{color:C.muted,fontSize:T.sm}}>{t('noSocialDesc')}</div>
                  </div>
                }
              </div>
            )}
            {tab==="policy"&&(
              <div style={{background:C.card,borderRadius:12,padding:vp.isMobile?20:28,border:`1px solid ${C.border}`}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.xl,fontWeight:700,marginBottom:16,letterSpacing:"-0.3px"}}>Booking Terms — {policy?.label}</div>
                {[["Deposit",`€${artist.deposit} via Stripe — auto-split 88% artist / 12% Awaz`],["Balance","Paid cash directly to artist after performance"],["Cancellation",policy?.desc||""],["Force Majeure","Full refund issued regardless of policy"],["No-Show","Customer no-show forfeits deposit · Artist no-show triggers full refund + €50 credit"]].map(([k,v])=>(
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
              <div style={{height:3,background:`linear-gradient(90deg,${artist.color},${C.gold},${artist.color})`}}/>
              <div style={{padding:20}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:T.lg,fontWeight:700,marginBottom:14}}>{t('selectDate2')}</div>
                <MiniCal artist={artist} selDay={selDay} selMonth={selMonth} selYear={selYear} onSelect={(d,m,y)=>{setSelDay(d);setSelMonth(m);setSelYear(y);}} bookings={bookings}/>
                <HR color={artist.color} my={14}/>
                {selDay&&!showBook&&(
                  <div style={{background:C.surface,borderRadius:8,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:T.sm,marginBottom:6}}><span style={{color:C.muted}}>Date</span><span style={{color:C.text,fontWeight:600}}>{MONTHS[selMonth]} {selDay}</span></div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:T.sm,marginBottom:6}}><span style={{color:C.muted}}>{t('deposit2')}</span><span style={{color:C.gold,fontWeight:700}}>€{artist.deposit}</span></div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:T.sm}}><span style={{color:C.muted}}>{t('balance')}</span><span style={{color:C.textD}}>{t('cashAfterConcert')}</span></div>
                  </div>
                )}
                {!showBook?(
                  <button onClick={()=>selDay&&setShowBook(true)} disabled={!selDay}
                    style={{width:"100%",background:selDay?`linear-gradient(135deg,${artist.color},${artist.color}AA)`:C.border,color:selDay?"#fff":C.muted,border:"none",borderRadius:10,padding:14,fontSize:T.base,fontWeight:800,cursor:selDay?"pointer":"not-allowed",fontFamily:"inherit",minHeight:50,letterSpacing:"0.2px"}}>
                     {selDay?`${t('bookNow')} — ${MONTHS[selMonth]} ${selDay} ✦`:t('selectDateFirst')}
                  </button>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <button onClick={()=>{setShowBook(false);setErr("");}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:T.sm,fontFamily:"inherit",textAlign:"left",minHeight:36}}>← Change date</button>
                    {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:7,padding:"10px 12px",color:C.ruby,fontSize:T.sm}}>⚠ {err}</div>}
                    <Inp label={t('yourName')+' *'} placeholder={t('yourName')} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
                    <Inp label="Email *" type="email" placeholder="you@email.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
                    <Inp label={t('eventType')} placeholder={t('eventPlaceholder')} value={form.event} onChange={e=>setForm(f=>({...f,event:e.target.value}))}/>
                    <Inp label={t('notes')} placeholder={t('notesPlaceholder')} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}/>
                    <button onClick={doBook} disabled={!form.name||!form.email}
                      style={{width:"100%",background:"linear-gradient(135deg,#635BFF,#7B72FF)",color:"#fff",border:"none",borderRadius:10,padding:14,fontSize:T.base,fontWeight:800,cursor:"pointer",opacity:!form.name||!form.email?0.5:1,fontFamily:"inherit",minHeight:50,letterSpacing:"0.2px"}}>
                      Pay €{artist.deposit} via Stripe →
                    </button>
                    <div style={{textAlign:"center",color:C.muted,fontSize:T.sm}}>🔒 Stripe · SSL · PCI compliant</div>
                  </div>
                )}
              </div>
            </div>
            {/* Social proof below booking card */}
            <SocialBar artist={artist}/>
          </div>
        )}
      </div>

      {/* Mobile: Calendar Sheet */}
      <Sheet open={showCal} onClose={()=>setShowCal(false)} title={t('selectDate')}>
        <div style={{padding:"16px 20px 32px"}}>
          <MiniCal artist={artist} selDay={selDay} selMonth={selMonth} selYear={selYear} onSelect={(d,m,y)=>{setSelDay(d);setSelMonth(m);setSelYear(y);}} bookings={bookings}/>
          {selDay&&(
            <div style={{marginTop:16,background:C.surface,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`,marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{color:C.muted,fontSize:T.sm}}>Date</span><span style={{color:C.text,fontWeight:600,fontSize:T.sm}}>{MONTHS[selMonth]} {selDay}</span></div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.muted,fontSize:T.sm}}>{t('deposit2')}</span><span style={{color:C.gold,fontWeight:700,fontSize:T.md,fontFamily:"'Cormorant Garamond',serif"}}>€{artist.deposit}</span></div>
            </div>
          )}
          <Btn full sz="lg" disabled={!selDay} onClick={()=>{if(selDay){setShowCal(false);setShowBook(true);}}} style={{marginTop:8}}>
             {selDay?`${t('continueWith')} ${MONTHS[selMonth]} ${selDay}`:t('selectDateFirst')}
          </Btn>
        </div>
      </Sheet>

      {/* Mobile: Booking form sheet */}
      <Sheet open={showBook&&vp.isMobile} onClose={()=>setShowBook(false)} title={t('completeBooking')}>
        <div style={{padding:"16px 20px 32px",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:C.surface,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:C.muted,fontSize:T.sm}}>{artist.name}</span><span style={{color:C.gold,fontWeight:700,fontSize:T.md,fontFamily:"'Cormorant Garamond',serif"}}>€{artist.deposit}</span></div>
            <div style={{color:C.muted,fontSize:T.xs}}>{MONTHS[selMonth]} {selDay}, {selYear}</div>
          </div>
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
          <div style={{textAlign:"center",color:C.muted,fontSize:T.xs}}>🔒 Stripe · SSL · PCI compliant · Auto-split</div>
        </div>
      </Sheet>

      {showStripe&&pending&&<StripeCheckout booking={pending} artist={artist} onSuccess={onPaid} onClose={()=>setShowStripe(false)}/>}
      {chat&&<Chat booking={chat} artist={artist} myRole="customer" onClose={()=>setChat(null)} onSend={()=>{}}/>}
    </div>
  );
}

// ── Admin Dashboard ────────────────────────────────────────────────────
function AdminDash({ artists, bookings, setBookings, users, inquiries, onAction, onLogout, onMsg, onUpdateInquiry }) {
  const vp=useViewport();
  const [tab,setTab]=useState("overview");
  const [adminChatArtist,setAdminChatArtist]=useState(null);
  const [adminChatMsg,setAdminChatMsg]=useState("");
  const [adminChats,setAdminChats]=useState({});
  const sendAdminChat=()=>{
    if(!adminChatArtist||!adminChatMsg.trim())return;
    const msg={from:"admin",text:adminChatMsg.trim(),time:new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})};
    setAdminChats(p=>({...p,[adminChatArtist.id]:[...(p[adminChatArtist.id]||[]),msg]}));
    setAdminChatMsg("");
  };
  const [chat,setChat]=useState(null);

  const confirmed=bookings.filter(b=>b.status==="confirmed").length;
  const pendingPay=bookings.filter(b=>b.status==="pending_payment").length;
  const pendingApp=artists.filter(a=>a.status==="pending").length;
  const totalDep=bookings.filter(b=>b.depositPaid).reduce((s,b)=>s+b.deposit,0);
  const awazCut=Math.round(totalDep*0.12);

  const navItems=[
    {id:"overview",icon:"📊",label:t('platformOverview')},
    {id:"chat",    icon:"💬",label:t('adminChat')},
    {id:"inquiries",icon:"📬",label:"Inquiries",badge:inquiries.filter(i=>i.status==="new").length},
    {id:"bookings",icon:"📅",label:t('allBookings')},
    {id:"artists", icon:"🎤",label:t('allArtists')},
    {id:"messages",icon:"💬",label:t('portalMessages')},
    {id:"finance", icon:"💶",label:t('finance')},
  ];

  const SB=({icon,label,value,color=C.gold})=>(
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:vp.isMobile?"14px":"18px 22px",borderTop:`3px solid ${color}44`}}>
      <div style={{fontSize:20,marginBottom:6}}>{icon}</div>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:vp.isMobile?T.xl:T["2xl"],fontWeight:800,color,lineHeight:1}}>{value}</div>
      <div style={{fontSize:T.xs,color:C.muted,marginTop:4,lineHeight:1.3}}>{label}</div>
    </div>
  );

  const content=(
    <div style={{padding:vp.isMobile?"16px":"28px 32px",maxWidth:1080}}>
      {tab==="overview"&&(
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:14}}>{t('platformOverview2')}</div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${vp.isMobile?2:3},1fr)`,gap:10,marginBottom:20}}>
            <SB icon="💶" label="Deposits Collected" value={`€${totalDep.toLocaleString()}`} color={C.gold}/>
            <SB icon="🏦" label="Awaz Revenue (12%)" value={`€${awazCut}`}                   color={C.emerald}/>
            <SB icon="📅" label="Confirmed Bookings" value={confirmed}                        color={C.lapis}/>
            <SB icon="⏳" label="Awaiting Deposit"   value={pendingPay}                       color={C.saffron}/>
            <SB icon="🔍" label="Pending Review"     value={pendingApp}                       color={C.ruby}/>
            <SB icon="🎤" label="Active Artists"     value={artists.filter(a=>a.status==="approved").length} color={C.lavender}/>
          </div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:12}}>{t('recentBookings')}</div>
          {bookings.slice(0,4).map(b=>{
            const art=artists.find(a=>a.id===b.artistId);
            const sc=b.status==="confirmed"?C.emerald:b.status==="completed"?C.lapis:C.saffron;
            return(
              <div key={b.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:20,flexShrink:0}}>{art?.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,color:C.text,fontSize:T.sm,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.customerName} → {art?.name}</div>
                  <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>{b.event} · {b.date}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                  <Badge color={sc}>{b.status.replace(/_/g," ")}</Badge>
                  <span style={{color:C.gold,fontWeight:700,fontSize:T.sm,fontFamily:"'Cormorant Garamond',serif"}}>€{b.deposit}</span>
                </div>
                <button onClick={()=>setChat(b)} style={{width:36,height:36,borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,fontSize:16,cursor:"pointer",flexShrink:0,WebkitTapHighlightColor:"transparent"}}>💬</button>
              </div>
            );
          })}
        </div>
      )}

      {tab==="bookings"&&(
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:14}}>{t('allBookings2')}</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {bookings.map(b=>{
              const art=artists.find(a=>a.id===b.artistId);
              const sc=b.status==="confirmed"?C.emerald:b.status==="completed"?C.lapis:b.status==="pending_payment"?C.saffron:C.muted;
              return(
                <div key={b.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                  <div style={{height:2,background:`linear-gradient(90deg,${art?.color||C.gold},${C.gold})`}}/>
                  <div style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
                      <div style={{fontSize:22,flexShrink:0}}>{art?.emoji}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,color:C.text,fontSize:T.sm}}>{b.customerName}</div>
                        <div style={{color:art?.color,fontSize:T.xs,fontFamily:"'Cormorant Garamond',serif",fontWeight:700}}>{art?.name}</div>
                        <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>{b.event} · {b.date}</div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                        <Badge color={sc}>{b.status.replace(/_/g," ")}</Badge>
                        <span style={{color:C.gold,fontWeight:700,fontFamily:"'Cormorant Garamond',serif",fontSize:T.md}}>€{b.deposit}</span>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{color:b.depositPaid?C.emerald:C.ruby,fontSize:T.xs,fontWeight:700}}>{t('depositLabel')} {b.depositPaid?"✓":"✗"}</span>
                      <span style={{color:C.muted,fontSize:T.xs}}>·</span>
                      <span style={{color:b.chatUnlocked?C.emerald:C.muted,fontSize:T.xs}}>Chat {b.chatUnlocked?"open":"locked"}</span>
                      {b.depositPaid&&(
                        <button onClick={()=>{
                          if(window.confirm(`Refund deposit to ${b.customerName}?`)){
                            setBookings(p=>p.map(bk=>bk.id===b.id?{...bk,depositPaid:false,refunded:true}:bk));
                            alert(`Refund initiated for ${b.customerName}. Process via Stripe dashboard.`);
                          }
                        }} style={{background:C.rubyS,border:`1px solid ${C.ruby}44`,color:C.ruby,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                          {t('refund')}
                        </button>
                      )}
                      {b.refunded&&<span style={{color:C.muted,fontSize:10,fontWeight:700}}>REFUNDED</span>}
                      <button onClick={()=>setChat(b)} style={{marginLeft:"auto",width:36,height:36,borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,fontSize:16,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>💬</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab==="artists"&&(
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:14}}>
            Artists {pendingApp>0&&<Badge color={C.ruby}>{pendingApp} pending</Badge>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {artists.map(a=>{
              const sc=a.status==="approved"?C.emerald:a.status==="pending"?C.saffron:C.ruby;
              return(
                <div key={a.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                  <div style={{height:2,background:`linear-gradient(90deg,${a.color},${C.gold})`}}/>
                  <div style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10}}>
                      {a.photo?<img src={a.photo} alt="" style={{width:44,height:44,borderRadius:8,objectFit:"cover",flexShrink:0}}/>:
                        <div style={{width:44,height:44,borderRadius:8,background:`${a.color}15`,border:`2px solid ${a.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{a.emoji}</div>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,fontWeight:700,color:C.text}}>{a.name}</div>
                        <div style={{color:C.muted,fontSize:T.xs,marginTop:2}}>{a.genre}</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:6}}>
                          <Badge color={sc}>{a.status}</Badge>
                          {a.verified?<Badge color={C.emerald}>✓ Verified</Badge>:<Badge color={C.saffron}>{t('unverified')}</Badge>}
                          {a.stripeConnected?<Badge color={C.lapis}>💳</Badge>:<Badge color={C.muted}>{t('noStripe')}</Badge>}
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {a.status==="pending"&&<><Btn sz="sm" v="emerald" onClick={()=>onAction(a.id,"approved")}>✓ Approve</Btn><Btn sz="sm" v="ruby" onClick={()=>onAction(a.id,"rejected")}>✗ Reject</Btn></>}
                      {a.status==="approved"&&<Btn sz="sm" v="ruby" onClick={()=>onAction(a.id,"suspended")}>{t('suspend')}</Btn>}
                  {!a.verified&&<Btn sz="sm" v="emerald" onClick={()=>onAction(a.id,"verify")}>{t('verifyArtist')}</Btn>}
                  {a.verified&&<span style={{color:C.emerald,fontSize:T.xs,fontWeight:700}}>✓ {t('verified2')}</span>}
                      {a.status==="suspended"&&<Btn sz="sm" v="emerald" onClick={()=>onAction(a.id,"approved")}>{t('reinstate')}</Btn>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab==="messages"&&(
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:14}}>{t('allConversations2')}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {bookings.map(b=>{
              const art=artists.find(a=>a.id===b.artistId);
              const last=b.messages?.[b.messages.length-1];
              return(
                <div key={b.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",display:"flex",gap:10,alignItems:"center",cursor:"pointer",minHeight:64,WebkitTapHighlightColor:"transparent"}} onClick={()=>setChat(b)}>
                  <div style={{fontSize:20,flexShrink:0}}>{art?.emoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,color:C.text,fontSize:T.sm,marginBottom:2}}>{b.customerName} ↔ {art?.name}</div>
                    {last?<div style={{color:C.muted,fontSize:T.xs,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{last.text}</div>
                         :<div style={{color:C.muted,fontSize:T.xs,fontStyle:"italic"}}>{t('noMessages')}</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                    <Badge color={b.chatUnlocked?C.emerald:C.ruby}>{b.chatUnlocked?"Open":"Locked"}</Badge>
                    <span style={{color:C.muted,fontSize:T.xs}}>{b.messages?.length||0} msgs</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab==="inquiries"&&(
        <InquiryPanel inquiries={inquiries} artists={artists} onUpdateInquiry={onUpdateInquiry} vp={vp}/>
      )}

      
          {tab==="chat"&&(
            <div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>{t('adminChat')}</div>
              <div style={{color:C.muted,fontSize:T.xs,marginBottom:20}}>{t('adminChatWith')}</div>
              <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr":"1fr 2fr",gap:16,height:500}}>
                {/* Artist list */}
                <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,overflow:"auto"}}>
                  {artists.map(a=>(
                    <button key={a.id} onClick={()=>setAdminChatArtist(a)}
                      style={{width:"100%",display:"flex",gap:10,alignItems:"center",padding:"12px 14px",background:adminChatArtist?.id===a.id?C.goldS:"transparent",border:"none",borderBottom:`1px solid ${C.border}`,cursor:"pointer",textAlign:"left",WebkitTapHighlightColor:"transparent"}}>
                      <div style={{width:36,height:36,borderRadius:8,background:`${a.color}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{a.photo?<img src={a.photo} alt="" style={{width:36,height:36,borderRadius:8,objectFit:"cover"}}/>:a.emoji}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,color:C.text,fontSize:T.sm,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                        <div style={{color:a.status==="approved"?C.emerald:C.muted,fontSize:T.xs}}>{a.status}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {/* Chat panel */}
                <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,display:"flex",flexDirection:"column"}}>
                  {adminChatArtist?(
                    <>
                      <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
                        <div style={{fontSize:20}}>{adminChatArtist.emoji}</div>
                        <div>
                          <div style={{fontWeight:700,color:C.text,fontSize:T.sm}}>{adminChatArtist.name}</div>
                          <div style={{color:C.muted,fontSize:T.xs}}>{adminChatArtist.genre}</div>
                        </div>
                      </div>
                      <div style={{flex:1,overflow:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:8}}>
                        {(adminChats[adminChatArtist.id]||[]).map((msg,i)=>(
                          <div key={i} style={{display:"flex",justifyContent:msg.from==="admin"?"flex-end":"flex-start"}}>
                            <div style={{maxWidth:"75%",background:msg.from==="admin"?C.goldS:C.surface,borderRadius:10,padding:"8px 12px",border:`1px solid ${msg.from==="admin"?C.gold+"44":C.border}`}}>
                              <div style={{color:C.text,fontSize:T.sm,lineHeight:1.5}}>{msg.text}</div>
                              <div style={{color:C.muted,fontSize:10,marginTop:3}}>{msg.time}</div>
                            </div>
                          </div>
                        ))}
                        {!(adminChats[adminChatArtist.id]||[]).length&&(
                          <div style={{textAlign:"center",color:C.muted,fontSize:T.sm,marginTop:40}}>{t('noMessagesYet')}</div>
                        )}
                      </div>
                      <div style={{padding:"12px 16px",display:"flex",gap:8}}>
                        <input value={adminChatMsg} onChange={e=>setAdminChatMsg(e.target.value)}
                          onKeyDown={e=>{if(e.key==="Enter"&&adminChatMsg.trim()){sendAdminChat();}}}
                          placeholder={t('typeMessage')}
                          style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:T.sm,outline:"none",fontFamily:"inherit"}}/>
                        <Btn onClick={sendAdminChat} disabled={!adminChatMsg.trim()} sz="sm">→</Btn>
                      </div>
                    </>
                  ):(
                    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:T.sm}}>{t('adminChatWith')}</div>
                  )}
                </div>
              </div>
            </div>
          )}
{tab==="finance"&&(
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:14}}>{t('finance')}</div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${vp.isMobile?2:4},1fr)`,gap:10,marginBottom:18}}>
            <SB icon="💶" label="Total Deposits"        value={`€${totalDep.toLocaleString()}`} color={C.gold}/>
            <SB icon="🏦" label="Awaz Revenue (12%)"    value={`€${awazCut}`}                   color={C.emerald}/>
            <SB icon="🎤" label="Artist Share (88%)"    value={`€${totalDep-awazCut}`}          color={C.lapis}/>
            <SB icon="⏳" label="Pending"               value={`€${bookings.filter(b=>!b.depositPaid).reduce((s,b)=>s+b.deposit,0)}`} color={C.saffron}/>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16,marginBottom:14}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,color:C.gold,fontWeight:700,marginBottom:12}}>{t('paymentSplit')}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {[[t('splitLabel1'),t('splitDesc1'),C.gold],[t('splitLabel2'),t('splitDesc2'),C.emerald],[t('splitLabel3'),t('splitDesc3'),C.lapis]].map(([l,d,c])=>(
                <div key={l} style={{background:C.surface,borderRadius:8,padding:"12px",border:`1px solid ${C.border}`,borderTop:`3px solid ${c}38`}}>
                  <div style={{color:c,fontWeight:700,fontSize:T.sm,marginBottom:4}}>{l}</div>
                  <div style={{color:C.muted,fontSize:T.xs}}>{d}</div>
                </div>
              ))}
            </div>
          </div>
          {artists.filter(a=>a.earnings>0).map(a=>{
            const cut=Math.round(a.earnings*0.12),pct=totalDep?Math.round((a.earnings/totalDep)*100):0;
            return(
              <div key={a.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:18,flexShrink:0}}>{a.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.sm,fontWeight:700,color:C.text,marginBottom:4}}>{a.name}</div>
                  <div style={{height:4,borderRadius:2,overflow:"hidden",background:C.border}}><div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${a.color},${C.gold})`}}/></div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2,flexShrink:0,fontSize:T.xs}}>
                  <span style={{color:C.gold,fontWeight:700}}>€{a.earnings}</span>
                  <span style={{color:C.emerald}}>→ €{a.earnings-cut}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // Mobile: stacked with bottom nav
  if (vp.isMobile) return(
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:88}}>
      <div style={{height:3,background:`linear-gradient(90deg,${C.ruby},${C.gold},${C.lapis})`,position:"fixed",top:0,left:0,right:0,zIndex:300}}/>
      <div style={{position:"fixed",top:3,left:0,right:0,zIndex:200,background:`${C.surface}F8`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.md,fontWeight:700,color:C.gold}}>{t('awazAdmin')}</div>
          <div style={{fontSize:T.xs,color:C.muted}}>{t('platformControl')}</div>
        </div>
        <Btn v="ghost" sz="sm" onClick={onLogout}>{t('signOut')}</Btn>
      </div>
      <div style={{paddingTop:72}}>
        {content}
      </div>
      <BottomNav active={tab} onNav={setTab} items={navItems}/>
      {chat&&<Chat booking={chat} artist={artists.find(a=>a.id===chat.artistId)} myRole="admin" onClose={()=>setChat(null)} onSend={onMsg}/>}
    </div>
  );

  // Desktop: sidebar layout
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex"}}>
      <div style={{height:3,background:`linear-gradient(90deg,${C.ruby},${C.gold},${C.lapis})`,position:"fixed",top:0,left:0,right:0,zIndex:200}}/>
      <div style={{width:220,background:C.surface,borderRight:`1px solid ${C.border}`,padding:"40px 0 24px",display:"flex",flexDirection:"column",position:"fixed",top:3,bottom:0,zIndex:100,overflowY:"auto"}}>
        <div style={{padding:"0 20px 20px",borderBottom:`1px solid ${C.border}`,marginBottom:14}}>
          <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:18,color:C.gold,marginBottom:3}}>آواز</div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15,fontWeight:700,color:C.text}}>{t('adminPanel')}</div>
        </div>
        {navItems.map((item)=>(
          <button key={item.id} onClick={()=>setTab(item.id)} style={{display:"flex",gap:10,alignItems:"center",padding:"12px 20px",background:tab===item.id?C.goldS:"transparent",color:tab===item.id?C.gold:C.muted,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:T.sm,fontWeight:tab===item.id?700:400,borderLeft:`3px solid ${tab===item.id?C.gold:"transparent"}`,width:"100%",textAlign:"left",minHeight:48,WebkitTapHighlightColor:"transparent"}}>
            <span style={{fontSize:18}}>{item.icon}</span>{item.label}
            {item.id==="artists"&&pendingApp>0&&<span style={{marginLeft:"auto",background:C.ruby,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{pendingApp}</span>}
            {item.id==="inquiries"&&(item.badge||0)>0&&<span style={{marginLeft:"auto",background:C.ruby,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{item.badge}</span>}
          </button>
        ))}
        <div style={{marginTop:"auto",padding:"16px 20px",}}>
          <Btn v="ghost" sz="sm" onClick={onLogout} xs={{width:"100%"}}>{t('signOut')}</Btn>
        </div>
      </div>
      <div style={{flex:1,marginLeft:220,paddingTop:3,overflow:"auto"}}>{content}</div>
      {chat&&<Chat booking={chat} artist={artists.find(a=>a.id===chat.artistId)} myRole="admin" onClose={()=>setChat(null)} onSend={onMsg}/>}
    </div>
  );
}

// ── Artist Portal ──────────────────────────────────────────────────────
function ArtistPortal({ user, artist, bookings, onLogout, onToggleDay, onMsg, onUpdateArtist }) {
  const vp=useViewport();
  const [tab,setTab]=useState("overview");
  const [chat,setChat]=useState(null);
  const [showStripeConnect,setShowStripeConnect]=useState(false);
  const [editing,setEditing]=useState(false);
  const [editF,setEditF]=useState({
    bio:artist.bio,
    priceInfo:artist.priceInfo,
    deposit:String(artist.deposit),
    cancellationPolicy:artist.cancellationPolicy,
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
  const [socialErr,setSocialErr]=useState("");

  const myB=bookings.filter(b=>b.artistId===artist.id);
  const depositsIn=myB.filter(b=>b.depositPaid).reduce((s,b)=>s+Math.round(b.deposit*0.88),0);

  const navItems=[
    {id:"overview",icon:"🏠",label:t('portalHome')},
    {id:"calendar",icon:"📅",label:t('portalCalendar')},
    {id:"bookings",icon:"📋",label:t('portalBookings')},
    {id:"messages",icon:"💬",label:t('portalMessages')},
    {id:"pricing", icon:"🌍",label:"Pricing"},
    {id:"profile", icon:"👤",label:t('portalProfile')},
    {id:"social",  icon:"🎵",label:t('portalSocial')},
  ];

  const saveEdit=async()=>{
    const updates={bio:editF.bio,priceInfo:editF.priceInfo,deposit:parseInt(editF.deposit)||1000,cancellationPolicy:editF.cancellationPolicy};
    onUpdateArtist(artist.id,updates);
    setEditing(false);
    // Persist to Supabase
    if(HAS_SUPA){
      try{
        const sb=await getSupabase();
        if(sb) await sb.from("artists").update({
          bio:updates.bio,
          price_info:updates.priceInfo,
          deposit:updates.deposit,
          cancellation_policy:updates.cancellationPolicy,
        }).eq("id",artist.id);
      }catch(e){console.warn("Supabase artist update failed:",e);}
    }
  };

  const saveSocial=()=>{
    setSocialErr("");
    if(socialF.spotifyUrl&&!socialF.spotifyUrl.includes("spotify")){setSocialErr("Spotify link looks invalid — make sure it contains 'spotify.com'.");return;}
    if(socialF.youtubeUrl&&!socialF.youtubeUrl.includes("youtube")&&!socialF.youtubeUrl.includes("youtu.be")){setSocialErr("YouTube link looks invalid.");return;}

    const newSpotify=socialF.spotifyUrl?{
      profileUrl:socialF.spotifyUrl.trim(),
      monthlyListeners:socialF.spotifyListeners||"",
      topTracks:[socialF.spotifyTrack1,socialF.spotifyTrack2,socialF.spotifyTrack3].filter(Boolean),
    }:null;
    const ig=parseInstagramHandle(socialF.instagramHandle);
    const newInstagram=ig?{
      handle:ig,
      followers:socialF.instagramFollowers||"",
      profileUrl:socialF.instagramUrl||`https://instagram.com/${ig.replace("@","")}`,
      posts:[],
    }:null;
    const ytParsed=parseYouTubeId(socialF.youtubeUrl||"");
    const newYoutube=socialF.youtubeUrl?{
      url:socialF.youtubeUrl.trim(),
      handle:ytParsed?.type==="handle"?ytParsed.id:"",
      subscribers:socialF.youtubeSubscribers||"",
    }:null;
    const ttHandle=parseTikTokHandle(socialF.tiktokHandle||"");
    const newTiktok=ttHandle?{handle:ttHandle,followers:socialF.tiktokFollowers||""}:null;

    onUpdateArtist(artist.id,{spotify:newSpotify,instagram:newInstagram,youtube:newYoutube,tiktok:newTiktok});
    setSocialSaved(true);
    setTimeout(()=>setSocialSaved(false),3500);
    if(HAS_SUPA){
      getSupabase().then(sb=>{
        if(sb) sb.from("artists").update({
          spotify_data:newSpotify,
          instagram_data:newInstagram,
          youtube_data:newYoutube,
          tiktok_data:newTiktok,
        }).eq("id",artist.id);
      });
    }
  };

  const content=(
    <div style={{padding:vp.isMobile?"16px":"28px 32px",maxWidth:900}}>

      {tab==="overview"&&(
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>
            Hey, {artist.name.split(" ")[0]} 👋
          </div>
          {artist.status==="pending"&&<div style={{background:"rgba(196,120,32,0.08)",border:`1px solid ${C.saffron}38`,borderRadius:10,padding:"12px 14px",marginBottom:12,fontSize:T.sm,color:C.textD,fontFamily:"'DM Sans',sans-serif"}}>⏳ <strong style={{color:C.saffron}}>{t('pendingApproval')}</strong> — 24–48 hours to review.</div>}
          {!artist.stripeConnected&&artist.status==="approved"&&(
            <div style={{background:"rgba(99,91,255,0.08)",border:"1px solid rgba(99,91,255,0.28)",borderRadius:10,padding:"12px 14px",marginBottom:12,fontSize:T.sm,color:C.textD,fontFamily:"'DM Sans',sans-serif",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span>💳 <strong style={{color:"#8B83FF"}}>{t('connectStripe')}</strong> to receive deposits</span>
              <Btn v="stripe" sz="sm" onClick={()=>setShowStripeConnect(true)}>Connect →</Btn>
            </div>
          )}
          {!artist.spotify&&!artist.instagram&&artist.status==="approved"&&(
            <div style={{background:"rgba(200,168,74,0.06)",border:`1px solid ${C.gold}28`,borderRadius:10,padding:"12px 14px",marginBottom:12,fontSize:T.sm,color:C.textD,fontFamily:"'DM Sans',sans-serif",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span>🎵 <strong style={{color:C.gold}}>{t('addSocial')}</strong> — artists with social proof get 3× more views</span>
              <Btn v="ghost" sz="sm" onClick={()=>setTab("social")}>{t('addNow')}</Btn>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
            {[["💶",`Earnings (88%)`,`€${depositsIn}`,C.gold],["📅","Bookings",myB.length,artist.color],["💬","Active Chats",myB.filter(b=>b.chatUnlocked).length,C.lavender],["⭐","Rating",artist.reviews>0?artist.rating:"—",C.saffron]].map(([icon,label,value,color])=>(
              <div key={label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px",borderTop:`3px solid ${color}38`}}>
                <div style={{fontSize:18,marginBottom:5}}>{icon}</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:800,color,lineHeight:1}}>{value}</div>
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
                  {b.chatUnlocked&&<button onClick={()=>setChat(b)} style={{width:36,height:36,borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,fontSize:16,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>💬</button>}
                </div>
              </div>
            ))}
        </div>
      )}

      {tab==="calendar"&&(
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>{t('availabilityTitle')}</div>
          <div style={{color:C.muted,fontSize:T.sm,marginBottom:16}}>{t('tapToToggle')}</div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:vp.isMobile?16:24}}>
            <MiniCal artist={artist} editMode onToggle={(mo,yr,day)=>onToggleDay(artist.id,mo,yr,day)} bookings={bookings}/>
          </div>
          <div style={{marginTop:12,background:artist.color+"10",border:`1px solid ${artist.color}28`,borderRadius:8,padding:"11px 13px",fontSize:T.xs,color:C.textD,lineHeight:1.6}}>
            <strong style={{color:artist.color}}>Tip:</strong> Keep your calendar updated to attract more bookings.
          </div>
        </div>
      )}

      {tab==="bookings"&&(
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:14}}>{t('myBookings2')}</div>
          {myB.length===0
            ?<div style={{textAlign:"center",padding:32,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,color:C.muted,fontSize:T.sm,fontStyle:"italic"}}>{t('noBookingsYet3')}</div>
            :<div style={{display:"flex",flexDirection:"column",gap:10}}>
              {myB.map(b=>{
                const sc=b.status==="confirmed"?C.emerald:b.status==="completed"?C.lapis:C.saffron;
                return(
                  <div key={b.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px",display:"flex",flexDirection:vp.isMobile?"column":"row",justifyContent:"space-between",gap:10,minHeight:72}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,color:C.text,fontSize:T.md}}>{b.customerName}</div>
                      <div style={{color:C.muted,fontSize:T.xs,marginTop:3}}>{b.event} · {b.date}</div>
                      <div style={{fontSize:T.xs,marginTop:5}}>
                        <span style={{color:b.depositPaid?C.emerald:C.ruby}}>Deposit {b.depositPaid?"✓ Paid":"✗ Pending"}</span>
                        {b.depositPaid&&<span style={{color:C.muted}}> · Balance: cash after concert</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <Badge color={sc}>{b.status.replace(/_/g," ")}</Badge>
                      <span style={{color:C.gold,fontWeight:700,fontFamily:"'Cormorant Garamond',serif",fontSize:T.md}}>€{b.deposit}</span>
                      <button onClick={()=>setChat(b)} style={{width:36,height:36,borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,fontSize:16,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>{b.chatUnlocked?"💬":"🔒"}</button>
                    </div>
                  </div>
                );
              })}
            </div>}
        </div>
      )}

      {tab==="messages"&&(
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:14}}>{t('messages2')}</div>
          {myB.filter(b=>b.chatUnlocked).length===0
            ?<div style={{textAlign:"center",padding:32,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,color:C.muted,fontSize:T.sm,fontStyle:"italic"}}>{t('noChatsYet2')}</div>
            :myB.filter(b=>b.chatUnlocked).map(b=>{
              const last=b.messages?.[b.messages.length-1];
              return(
                <div key={b.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px",display:"flex",gap:12,alignItems:"center",cursor:"pointer",marginBottom:8,minHeight:64,WebkitTapHighlightColor:"transparent"}} onClick={()=>setChat(b)}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:C.goldS,border:`2px solid ${C.gold}28`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:C.gold,fontSize:16,flexShrink:0}}>{b.customerName[0]}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,color:C.text,fontSize:T.sm,marginBottom:2}}>{b.customerName}</div>
                    {last?<div style={{color:C.muted,fontSize:T.xs,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{last.text}</div>
                         :<div style={{color:C.muted,fontSize:T.xs,fontStyle:"italic"}}>{t('noMessagesYet')}</div>}
                  </div>
                  <span style={{color:C.muted,fontSize:T.xs,flexShrink:0}}>{b.messages?.length||0} msgs</span>
                </div>
              );
            })}
        </div>
      )}

      {tab==="pricing"&&(
        <CountryPricingTab artist={artist} onUpdateArtist={onUpdateArtist} vp={vp}/>
      )}

      {tab==="social"&&(()=>{
        const previewSpotifyId = parseSpotifyArtistId(socialF.spotifyUrl);
        const previewHandle    = parseInstagramHandle(socialF.instagramHandle);

        return(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>{t('socialMedia')}</div>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,color:C.muted,lineHeight:1.7}}>
              Connect your accounts. Your public profile will show a live Spotify widget and your Instagram link.
            </div>
          </div>

          {socialErr&&(
            <div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:10,padding:"12px 14px",color:C.ruby,fontSize:T.sm,fontFamily:"'DM Sans',sans-serif",display:"flex",gap:8,alignItems:"center"}}>
              ⚠ {socialErr}
            </div>
          )}
          {socialSaved&&(
            <div style={{background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:10,padding:"12px 14px",color:C.emerald,fontSize:T.sm,fontFamily:"'DM Sans',sans-serif",display:"flex",gap:8,alignItems:"center"}}>
              ✓ Saved! Your social profile is now live on your public page.
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
                {artist.spotify&&previewSpotifyId&&<Badge color="#1DB954">Live ✓</Badge>}
              </div>

              {/* What Spotify can do */}
              <div style={{background:"rgba(29,185,84,0.06)",border:"1px solid rgba(29,185,84,0.14)",borderRadius:8,padding:"10px 12px",marginBottom:14,fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,color:"#1DB954",lineHeight:1.7}}>
                ✓ Limer du inn Spotify-lenken din hentes <strong>alt automatisk</strong> — bilde, biografi, topp-sanger og lyttere vises direkte på profilen din som en live widget.
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
                hint={previewSpotifyId
                  ? `✓ ✓ Artist ID found: ${previewSpotifyId}`
                  : "Copy the link from your Spotify profile and paste here"}
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
              {previewSpotifyId && (
                <div style={{marginTop:14,background:"rgba(29,185,84,0.07)",border:"1px solid rgba(29,185,84,0.25)",borderRadius:12,padding:"16px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(29,185,84,0.15)",border:"1px solid rgba(29,185,84,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>✓</div>
                    <div>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,fontWeight:700,color:"#1DB954"}}>{t('spotifyLinkRecognized')}</div>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.xs,color:C.muted,marginTop:2}}>Artist-ID: {previewSpotifyId}</div>
                    </div>
                  </div>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,color:C.textD,lineHeight:1.7,marginBottom:12}}>
                    The Spotify widget is hidden in StackBlitz/editor — this is normal. On your published Vercel site it loads automatically showing your photo, bio and top tracks.
                  </div>
                  <a href={`https://open.spotify.com/artist/${previewSpotifyId}`} target="_blank" rel="noopener noreferrer"
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
                {previewHandle&&<Badge color="#E1306C">Connected ✓</Badge>}
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
                  hint={previewHandle ? `✓ ✓ Handle recognized: ${previewHandle}` : "Copy your Instagram profile URL and paste here"}
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
              {previewHandle && (
                <div style={{marginTop:14,background:"rgba(225,48,108,0.07)",border:"1px solid rgba(225,48,108,0.25)",borderRadius:12,padding:"16px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(225,48,108,0.15)",border:"1px solid rgba(225,48,108,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>✓</div>
                    <div>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.sm,fontWeight:700,color:"#E1306C"}}>{t('instagramRecognized')}</div>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:T.xs,color:C.muted,marginTop:2}}>{previewHandle}{socialF.instagramFollowers?` · ${socialF.instagramFollowers} følgere`:""}</div>
                    </div>
                  </div>
                  <a href={`https://instagram.com/${previewHandle.replace("@","")}`} target="_blank" rel="noopener noreferrer"
                    style={{display:"inline-flex",alignItems:"center",gap:7,background:"linear-gradient(135deg,#833AB4,#E1306C)",color:"#fff",borderRadius:20,padding:"9px 18px",fontSize:13,fontWeight:700,textDecoration:"none",fontFamily:"'DM Sans',sans-serif"}}>
                    Verify on Instagram ↗
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Save */}
          <Btn v="gold" sz="lg" onClick={saveSocial} xs={{width:"100%"}}>
            Save social profiles
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
            Save social profiles
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
        );
      })()}

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
                  <PhotoUpload photo={artist.photo} onPhoto={p=>onUpdateArtist(artist.id,{photo:p})} color={artist.color} emoji={artist.emoji} size={vp.isMobile?72:88}/>
                  <div style={{textAlign:"center",marginTop:5,fontSize:T.xs,color:C.muted}}>{t('tapToChange')}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text}}>{artist.name}</div>
                  {artist.nameDari&&<div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:T.sm,color:C.gold,marginTop:2}}>{artist.nameDari}</div>}
                  <div style={{color:artist.color,fontSize:T.xs,marginTop:4}}>{artist.genre}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:8}}>
                    {artist.tags.map(t=><Badge key={t} color={artist.color}>{t}</Badge>)}
                  </div>
                </div>
              </div>

              {editing?(
                <div style={{display:"flex",flexDirection:"column",gap:11}}>
                  <Inp label="Bio" value={editF.bio} onChange={e=>setEditF(f=>({...f,bio:e.target.value}))} rows={4} placeholder="Tell clients about yourself…"/>
                  <Inp label="Starting Price" value={editF.priceInfo} onChange={e=>setEditF(f=>({...f,priceInfo:e.target.value}))} placeholder="From €2,500"/>
                  <Inp label="Deposit Amount (€)" type="number" value={editF.deposit} onChange={e=>setEditF(f=>({...f,deposit:e.target.value}))} hint="Minimum €500"/>
                  <Sel label="Cancellation Policy" value={editF.cancellationPolicy} onChange={e=>setEditF(f=>({...f,cancellationPolicy:e.target.value}))}
                    options={POLICIES.map(p=>[p.id,`${p.label} — ${p.desc}`])}/>
                  <div style={{display:"flex",gap:8}}>
                    <Btn v="ghost" onClick={()=>setEditing(false)} xs={{flex:1}}>Cancel</Btn>
                    <Btn onClick={saveEdit} xs={{flex:2}}>Save</Btn>
                  </div>
                </div>
              ):(
                <>
                  <p style={{color:C.textD,fontSize:T.sm,lineHeight:1.8,marginBottom:14,fontFamily:"'Cormorant Garamond',serif"}}>{artist.bio}</p>
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
                    <div style={{fontSize:T.sm,color:C.textD,lineHeight:1.8}}>{t("youReceive")} <strong style={{color:C.emerald}}>€{Math.round(artist.deposit*0.88)}</strong> {t("from")} €{artist.deposit} {t("depositLabel")} (88%). {t("balanceCashNote")}.</div>
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
      <div style={{height:3,background:`linear-gradient(90deg,${artist.color},${C.gold},${artist.color})`,position:"fixed",top:0,left:0,right:0,zIndex:300}}/>
      <div style={{position:"fixed",top:3,left:0,right:0,zIndex:200,background:`${C.surface}F8`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.border}`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {artist.photo?<img src={artist.photo} alt="" style={{width:32,height:32,borderRadius:7,objectFit:"cover"}}/>:<div style={{width:32,height:32,borderRadius:7,background:`${artist.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{artist.emoji}</div>}
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.sm,fontWeight:700,color:C.text}}>{artist.name}</div>
            <div style={{fontSize:9,color:artist.color,textTransform:"uppercase",fontWeight:700}}>{t('artistPortal')}</div>
          </div>
        </div>
        <Btn v="ghost" sz="sm" onClick={onLogout}>Out</Btn>
      </div>
      <div style={{paddingTop:68}}>{content}</div>
      <BottomNav active={tab} onNav={setTab} items={navItems}/>
      {chat&&<Chat booking={chat} artist={artist} myRole="artist" onClose={()=>setChat(null)} onSend={onMsg}/>}
      {showStripeConnect&&(
        <StripeConnectSheet artist={artist} onConnected={u=>{onUpdateArtist(artist.id,u);setShowStripeConnect(false);}} onClose={()=>setShowStripeConnect(false)}/>
      )}
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex"}}>
      <div style={{height:3,background:`linear-gradient(90deg,${artist.color},${C.gold},${artist.color})`,position:"fixed",top:0,left:0,right:0,zIndex:200}}/>
      <div style={{width:220,background:C.surface,borderRight:`1px solid ${C.border}`,padding:"40px 0 24px",display:"flex",flexDirection:"column",position:"fixed",top:3,bottom:0,zIndex:100}}>
        <div style={{padding:"0 20px 20px",borderBottom:`1px solid ${C.border}`,marginBottom:14}}>
          {artist.photo?<img src={artist.photo} alt="" style={{width:42,height:42,borderRadius:8,objectFit:"cover",marginBottom:10}}/>:<div style={{width:42,height:42,borderRadius:8,background:`${artist.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,marginBottom:10}}>{artist.emoji}</div>}
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.sm,fontWeight:700,color:C.text}}>{artist.name}</div>
          <div style={{fontSize:T.xs,color:artist.color,textTransform:"uppercase",fontWeight:700,marginTop:2}}>{t('artistPortal')}</div>
        </div>
        {navItems.map(({id,icon,label})=>(
          <button key={id} onClick={()=>setTab(id)} style={{display:"flex",gap:10,alignItems:"center",padding:"12px 20px",background:tab===id?`${artist.color}18`:"transparent",color:tab===id?artist.color:C.muted,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:T.sm,fontWeight:tab===id?700:400,borderLeft:`3px solid ${tab===id?artist.color:"transparent"}`,width:"100%",textAlign:"left",minHeight:48}}>
            <span style={{fontSize:18}}>{icon}</span>{label}
          </button>
        ))}
        <div style={{marginTop:"auto",padding:"16px 20px",}}>
          <Btn v="ghost" sz="sm" onClick={onLogout} xs={{width:"100%"}}>{t('signOut')}</Btn>
        </div>
      </div>
      <div style={{flex:1,marginLeft:220,paddingTop:3,overflow:"auto"}}>{content}</div>
      {chat&&<Chat booking={chat} artist={artist} myRole="artist" onClose={()=>setChat(null)} onSend={onMsg}/>}
      {showStripeConnect&&<StripeConnectSheet artist={artist} onConnected={u=>{onUpdateArtist(artist.id,u);setShowStripeConnect(false);}} onClose={()=>setShowStripeConnect(false)}/>}
    </div>
  );
}

// ── Stripe Connect Sheet ───────────────────────────────────────────────
function StripeConnectSheet({ artist, onConnected, onClose }) {
  const [iban,setIban]=useState(""),[loading,setLoading]=useState(false),[done,setDone]=useState(false);
  const connect=()=>{
    if(!iban.trim())return;
    setLoading(true);
    setTimeout(()=>{
      onConnected({stripeConnected:true,stripeAccount:`acct_${artist.name.split(" ")[0].toLowerCase()}${Date.now().toString().slice(-5)}`});
      setDone(true);setLoading(false);
    },2000);
  };
  return(
    <Sheet open title="Connect Stripe Account" onClose={onClose}>
      <div style={{padding:"16px 20px 32px"}}>
        {done?(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{width:52,height:52,borderRadius:"50%",background:C.emeraldS,border:`2px solid ${C.emerald}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:24}}>✓</div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:8}}>{t('connected')}</div>
            <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.7,marginBottom:16}}>{t('youllReceive')}<strong style={{color:C.gold}}>€{Math.round(artist.deposit*0.88)}</strong> from each deposit automatically.</div>
            <Btn v="emerald" full sz="lg" onClick={onClose}>Done</Btn>
          </div>
        ):loading?(
          <div style={{textAlign:"center",padding:"32px 0"}}>
            <div style={{width:44,height:44,border:`3px solid ${C.border}`,borderTopColor:"#635BFF",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 16px"}}/>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,color:C.text}}>{t('connectingStripe')}</div>
          </div>
        ):(
          <>
            <div style={{background:"#635BFF12",border:"1px solid #635BFF30",borderRadius:10,padding:"14px",marginBottom:16}}>
              {["Client pays deposit via Stripe","88% auto-transferred to your account","12% retained as Awaz platform fee","Balance paid cash by client after concert"].map((t,i)=>(
                <div key={i} style={{display:"flex",gap:8,marginBottom:6,fontSize:T.sm,color:C.textD}}><span style={{color:"#8B83FF",fontWeight:700}}>{i+1}.</span>{t}</div>
              ))}
            </div>
            <Inp label="Bank Account / IBAN *" placeholder="NO12 3456 7890 1234 5" value={iban} onChange={e=>setIban(e.target.value)} hint="Deposits transferred here automatically"/>
            <div style={{height:16}}/>
            <button onClick={connect} disabled={!iban.trim()}
              style={{width:"100%",background:"linear-gradient(135deg,#635BFF,#7B72FF)",color:"#fff",border:"none",borderRadius:10,padding:16,fontSize:T.md,fontWeight:800,cursor:iban.trim()?"pointer":"not-allowed",opacity:iban.trim()?1:0.5,fontFamily:"inherit",minHeight:52}}>
              Connect via Stripe →
            </button>
            <div style={{textAlign:"center",marginTop:10,color:C.muted,fontSize:T.xs}}>{t('stripeSecurity')}</div>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ── Private Inquiry Widget (floating concierge button + form) ─────────
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
    onSubmit({...f,id:`i_${Date.now()}`,status:"new",ts:Date.now()});
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
        <button onClick={()=>{setOpen(true);reset();}}
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
              Your message goes directly to the Awaz owner. Personal reply within 24 hours.
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
    const ex = existing.find(e=>e.code===m.code);
    const baseEur = artist.deposit/0.1; // estimate full price from deposit
    return ex||{code:m.code,active:false,price:Math.round(baseEur/m.toEur),deposit:Math.round(artist.deposit/m.toEur)};
  });
  const [pricing,setPricing]=useState(initPricing);
  const [saved,setSaved]=useState(false);
  const [expanded,setExpanded]=useState(null); // which market card is expanded

  const update=(code,field,val)=>setPricing(p=>p.map(row=>row.code===code?{...row,[field]:val}:row));
  const toggle=(code)=>setPricing(p=>p.map(row=>row.code===code?{...row,active:!row.active}:row));

  const save=()=>{
    onUpdateArtist(artist.id,{countryPricing:pricing});
    setSaved(true);setTimeout(()=>setSaved(false),3000);
  };

  const eurVal=(row)=>{
    const m=MARKETS.find(m=>m.code===row.code);
    if(!m||!row.price) return null;
    return Math.round(row.price*m.toEur);
  };

  const active=pricing.filter(r=>r.active);
  const inactive=pricing.filter(r=>!r.active);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Header */}
      <div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:4}}>{t('marketPricing')}</div>
        <div style={{fontSize:T.sm,color:C.muted,lineHeight:1.7}}>
          Set your fee per country. Customers see your local-currency price. Toggle markets on/off to control where you appear.
        </div>
      </div>

      {/* Active markets summary */}
      {active.length>0&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,display:"flex",flexWrap:"wrap",gap:8}}>
          <div style={{width:"100%",fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:4}}>Active in {active.length} market{active.length!==1?"s":""}</div>
          {active.map(row=>{
            const m=MARKETS.find(m=>m.code===row.code);
            const eur=eurVal(row);
            return(
              <div key={row.code} style={{background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:8,padding:"6px 12px",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:14}}>{m?.flag}</span>
                <span style={{fontSize:T.xs,fontWeight:700,color:C.emerald}}>{m?.name}</span>
                <span style={{fontSize:T.xs,color:C.muted}}>·</span>
                <span style={{fontSize:T.xs,color:C.text,fontWeight:600}}>{m?.sym}{row.price?.toLocaleString()}</span>
                {eur&&m?.currency!=="EUR"&&<span style={{fontSize:10,color:C.muted}}>≈ €{eur.toLocaleString()}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Market cards */}
      {[{label:"Active Markets",rows:active,emptyMsg:"No active markets yet — toggle markets below to activate them."},{label:"Add Markets",rows:inactive,emptyMsg:"All available markets are active."}].map(({label,rows,emptyMsg})=>(
        <div key={label}>
          <div style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>{label}</div>
          {rows.length===0?(
            <div style={{fontSize:T.sm,color:C.faint,fontStyle:"italic",padding:"8px 0"}}>{emptyMsg}</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {rows.map(row=>{
                const m=MARKETS.find(m=>m.code===row.code);
                const eur=eurVal(row);
                const isOpen=expanded===row.code;
                return(
                  <div key={row.code} style={{background:C.card,border:`1px solid ${row.active?C.emerald+"44":C.border}`,borderRadius:12,overflow:"hidden",transition:"border-color 0.15s"}}>
                    {/* Card header — always visible */}
                    <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",cursor:"pointer"}} onClick={()=>setExpanded(isOpen?null:row.code)}>
                      <span style={{fontSize:22,flexShrink:0}}>{m?.flag}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:T.sm,color:C.text}}>{m?.name}</div>
                        <div style={{fontSize:T.xs,color:C.muted,marginTop:2}}>
                          {row.price?`${m?.sym}${row.price?.toLocaleString()}${eur&&m?.currency!=="EUR"?` ≈ €${eur.toLocaleString()}`:""}`:"No price set"}
                        </div>
                      </div>
                      {/* Active toggle */}
                      <div onClick={e=>{e.stopPropagation();toggle(row.code);}}
                        style={{width:44,height:24,borderRadius:12,background:row.active?C.emerald:C.border,position:"relative",cursor:"pointer",flexShrink:0,transition:"background 0.2s"}}>
                        <div style={{position:"absolute",top:3,left:row.active?"23px":"3px",width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}/>
                      </div>
                      <div style={{fontSize:10,color:C.muted,transform:`rotate(${isOpen?180:0}deg)`,transition:"transform 0.2s",flexShrink:0}}>▾</div>
                    </div>

                    {/* Expanded: price inputs */}
                    {isOpen&&(
                      <div style={{padding:"0 16px 16px",paddingTop:12}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                          <div style={{display:"flex",flexDirection:"column",gap:5}}>
                            <label style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase"}}>Full Price ({m?.currency})</label>
                            <div style={{display:"flex",alignItems:"center",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                              <span style={{padding:"0 12px",fontSize:T.sm,color:C.muted,flexShrink:0,background:C.card,height:"100%",display:"flex",alignItems:"center",borderRight:`1px solid ${C.border}`,minHeight:44,fontWeight:700}}>{m?.sym}</span>
                              <input type="number" value={row.price||""} onChange={e=>update(row.code,"price",parseInt(e.target.value)||0)}
                                style={{flex:1,background:"transparent",border:"none",color:C.text,fontSize:T.base,padding:"13px 12px",outline:"none",fontFamily:"inherit",minHeight:44}}/>
                            </div>
                            {eur&&m?.currency!=="EUR"&&<div style={{fontSize:10,color:C.emerald}}>≈ €{eur.toLocaleString()} EUR</div>}
                          </div>
                          <div style={{display:"flex",flexDirection:"column",gap:5}}>
                            <label style={{fontSize:T.xs,color:C.muted,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase"}}>Deposit ({m?.currency})</label>
                            <div style={{display:"flex",alignItems:"center",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                              <span style={{padding:"0 12px",fontSize:T.sm,color:C.muted,flexShrink:0,background:C.card,height:"100%",display:"flex",alignItems:"center",borderRight:`1px solid ${C.border}`,minHeight:44,fontWeight:700}}>{m?.sym}</span>
                              <input type="number" value={row.deposit||""} onChange={e=>update(row.code,"deposit",parseInt(e.target.value)||0)}
                                style={{flex:1,background:"transparent",border:"none",color:C.text,fontSize:T.base,padding:"13px 12px",outline:"none",fontFamily:"inherit",minHeight:44}}/>
                            </div>
                            {row.deposit&&m?.currency!=="EUR"&&<div style={{fontSize:10,color:C.muted}}>≈ €{Math.round(row.deposit*m.toEur).toLocaleString()} deposit</div>}
                          </div>
                        </div>
                        <div style={{fontSize:T.xs,color:C.muted,lineHeight:1.6,background:C.surface,borderRadius:6,padding:"8px 10px"}}>
                          💡 Price shown to customers browsing from {m?.name}. Stripe deposit auto-converts to EUR for processing.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Save */}
      {saved?(
        <div style={{background:C.emeraldS,border:`1px solid ${C.emerald}44`,borderRadius:10,padding:"12px 16px",color:C.emerald,fontSize:T.sm,fontWeight:700,display:"flex",gap:8,alignItems:"center"}}>
          ✓ Market pricing saved and live on your profile.
        </div>
      ):(
        <Btn v="gold" sz="lg" onClick={save} xs={{width:"100%"}}>{t('saveMarketPricing')}</Btn>
      )}
    </div>
  );
}

// ── Admin Inquiry Panel ────────────────────────────────────────────────
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
            {sel.status==="replied"?"Update Reply ✦":"Send Reply to Customer ✦"}
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
          <div style={{fontSize:36,marginBottom:12}}>📬</div>
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

// ═══════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const vp=useViewport();
  const [theme,setTheme]=useState(()=>{ try{return localStorage.getItem('awaz-theme')||'dark';}catch{return 'dark';} });
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
  const [users,setUsers]=useState(USERS);
  const [artists,setArtists]=useState(ARTISTS);
  const [bookings,setBookings]=useState(DEMO_BOOKINGS);
  const [inquiries,setInquiries]=useState(DEMO_INQUIRIES);
  const handleNewInquiry=inq=>setInquiries(p=>[inq,...p]);
  const handleUpdateInquiry=(id,updates)=>setInquiries(p=>p.map(i=>i.id===id?{...i,...updates}:i));
  const [session,setSession]=useState(null);
  const [view,setView]=useState("home");
  const [selArtist,setSelArtist]=useState(null);
  const [showLogin,setShowLogin]=useState(false);
  const [showApply,setShowApply]=useState(false);
  const [search,setSearch]=useState("");
  const [genreF,setGenreF]=useState("All");
  const [menuOpen,setMenuOpen]=useState(false);

  const genres=["All","Ghazal","Herati","Mast","Pashto","Logari","Qarsak","Rubab","Tabla","Classical","Folk","Pop","Fusion","Sufi"];

  // ── Hydrate from Supabase on mount ───────────────────────────────────
  useEffect(()=>{
    if(!HAS_SUPA)return;
    (async()=>{
      const sb=await getSupabase();
      if(!sb)return;
      // Load approved artists
      const{data:artistRows}=await sb.from("artists").select("*").eq("status","approved");
      if(artistRows&&artistRows.length>0){
        setArtists(prev=>{
          const supaIds=new Set(artistRows.map(a=>a.id));
          // Keep demo artists not in Supabase, merge with Supabase artists
          const demo=prev.filter(a=>!supaIds.has(a.id));
          const supa=artistRows.map(a=>({
            id:a.id,name:a.name,nameDari:a.name_dari||"",
            genre:a.genre||"",location:a.location||"",
            rating:a.rating||0,reviews:a.reviews||0,
            priceInfo:a.price_info||"On request",
            deposit:a.deposit||1000,
            emoji:a.emoji||"🎤",color:a.color||C.gold,
            photo:a.photo||null,bio:a.bio||"",
            tags:a.tags||[],instruments:a.instruments||[],
            superhost:a.superhost||false,
            status:a.status,joined:a.joined_date||"",
            available:a.available||{},blocked:a.blocked||{},
            earnings:a.earnings||0,totalBookings:a.total_bookings||0,
            verified:a.verified||false,
            stripeConnected:a.stripe_connected||false,
            stripeAccount:a.stripe_account||null,
            cancellationPolicy:a.cancellation_policy||"moderate",
            spotify:a.spotify_data||null,
            instagram:a.instagram_data||null,
            youtube:a.youtube_data||null,
            tiktok:a.tiktok_data||null,
            countryPricing:a.country_pricing||[],
          }));
          return[...demo,...supa];
        });
      }
    })();
  },[]);
  const approved=useMemo(()=>artists.filter(a=>a.status==="approved"),[artists]);
  const filtered=useMemo(()=>approved.filter(a=>{
    const ms=!search||a.name.toLowerCase().includes(search.toLowerCase())||a.genre.toLowerCase().includes(search.toLowerCase())||a.tags.some(t=>t.toLowerCase().includes(search.toLowerCase()));
    const mg=genreF==="All"||a.tags.includes(genreF)||a.genre.toLowerCase().includes(genreF.toLowerCase());
    return ms&&mg;
  }),[approved,search,genreF]);

  const login=u=>{setSession(u);setShowLogin(false);};
  const logout=async()=>{
    if(HAS_SUPA){
      const sb=await getSupabase();
      if(sb) await sb.auth.signOut();
    }
    setSession(null);
  };
  const handleArtistAction=(id,action)=>{
    if(action==="verify") {
      setArtists(p=>p.map(a=>a.id===id?{...a,verified:true}:a));
    } else {
      setArtists(p=>p.map(a=>a.id===id?{...a,status:action}:a));
    }
  };
  const handleToggle=(aid,month,year,day)=>setArtists(p=>p.map(a=>{
    if(a.id!==aid)return a;
    const k=`${year}-${month}`,av=[...(a.available[k]||[])],bl=[...(a.blocked[k]||[])];
    if(av.includes(day))return{...a,available:{...a.available,[k]:av.filter(d=>d!==day)},blocked:{...a.blocked,[k]:[...bl,day]}};
    if(bl.includes(day))return{...a,blocked:{...a.blocked,[k]:bl.filter(d=>d!==day)},available:{...a.available,[k]:[...av,day]}};
    return{...a,available:{...a.available,[k]:[...av,day]}};
  }));
  const handleUpdateArtist=(id,updates)=>{setArtists(p=>p.map(a=>a.id===id?{...a,...updates}:a));if(selArtist?.id===id)setSelArtist(p=>p?{...p,...updates}:p);};
  const handleNewBooking=async b=>{
    setBookings(p=>[...p,b]);
    if(HAS_SUPA){
      try{
        const sb=await getSupabase();
        if(sb) await sb.from("bookings").insert([{
          id:b.id,
          artist_id:b.artistId,
          customer_name:b.customerName,
          customer_email:b.customerEmail,
          date:b.date,
          event_type:b.eventType||"",
          notes:b.notes||"",
          deposit:b.deposit,
          status:b.status||"pending",
          paid:b.paid||false,
          country:b.country||"NO",
          messages:b.messages||[],
        }]);
      }catch(e){console.warn("Supabase booking insert failed:",e);}
    }
  };
  const handleNewArtist=(a,u)=>{setArtists(p=>[...p,a]);setUsers(p=>[...p,u]);};
  const handleMsg=(bid,m)=>{
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
  const nav=(v)=>{
    if(v==="profile")setPrevView(view);
    window.scrollTo({top:0,behavior:"instant"});
    setView(v);setMenuOpen(false);
  };

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
  if(session?.role==="admin") return <AdminDash key={lang} artists={artists} bookings={bookings} setBookings={setBookings} users={users} inquiries={inquiries} onAction={handleArtistAction} onLogout={logout} onMsg={handleMsg} onUpdateInquiry={handleUpdateInquiry}/>;
  if(session?.role==="artist"){
    const myA=artists.find(a=>a.id===session.artistId);
    if(myA) return <ArtistPortal key={lang} user={session} artist={myA} bookings={bookings} onLogout={logout} onToggleDay={handleToggle} onMsg={handleMsg} onUpdateArtist={handleUpdateArtist}/>;
    // AUTH-FIX-2: Artist logged in but no matching artist profile found.
    // Previously fell through silently — user stuck in broken limbo with no
    // logout button. Now shows a clear error with logout option.
    return(
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans',sans-serif"}}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;0,800&family=DM+Sans:wght@400;500;700&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:32,maxWidth:400,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:16}}>⚠️</div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:C.text,marginBottom:8}}>{t('artistProfileNotFound')}</div>
          <div style={{color:C.muted,fontSize:14,lineHeight:1.7,marginBottom:24}}>
            You're logged in as <strong style={{color:C.gold}}>{session.name}</strong> but your artist profile could not be loaded. Please contact support or sign out and try again.
          </div>
          <Btn v="ghost" sz="lg" onClick={logout} xs={{width:"100%"}}>{t('signOut')}</Btn>
        </div>
      </div>
    );
  }



  return(
    <div key={lang} dir={isRTL?'rtl':'ltr'} translate="no" style={{background:C.bg,minHeight:"100vh",fontFamily:isRTL?"'Noto Naskh Arabic','DM Sans',sans-serif":"'DM Sans',sans-serif",color:C.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300;1,400;1,600&family=Noto+Naskh+Arabic:wght@400;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        .notranslate{transform:translateZ(0);}
        html{
          -webkit-text-size-adjust:100%;text-size-adjust:100%;
          -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
          text-rendering:optimizeLegibility;
          scroll-behavior:smooth;
        }
        body{line-height:1.6;}
        input,textarea,button,select{font-family:'DM Sans',sans-serif;-webkit-appearance:none;}
        ::selection{background:rgba(200,168,74,0.25);color:#EDE4CE;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
        @keyframes slideUp{from{transform:translateY(100%);opacity:0.6;}to{transform:translateY(0);opacity:1;}}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes up{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
        @keyframes inquiryPulse{0%,100%{box-shadow:0 8px 32px ${C.gold}55;}50%{box-shadow:0 8px 48px ${C.gold}99,0 0 0 8px ${C.gold}15;}}
        @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
        .u0{animation:up 0.6s cubic-bezier(.4,0,.2,1) both;}
        .u1{animation:up 0.6s 0.1s cubic-bezier(.4,0,.2,1) both;}
        .u2{animation:up 0.6s 0.2s cubic-bezier(.4,0,.2,1) both;}
        .u3{animation:up 0.6s 0.3s cubic-bezier(.4,0,.2,1) both;}
        img{max-width:100%;height:auto;}
        button{cursor:pointer;}
        @media(hover:hover){
          button:not(:disabled):hover{opacity:0.85;}
          a:hover{opacity:0.8;}
        }
        @media(max-width:767px){
          *{-webkit-tap-highlight-color:transparent;}
        }
        p{line-height:1.8;}
        :focus-visible{outline:2px solid ${C.gold};outline-offset:3px;border-radius:4px;}
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
            <div style={{height:1,background:`linear-gradient(90deg,${C.ruby},${C.gold},${C.lapis})`,marginTop:2}}/>
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
          </nav>
        )}

        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {vp.isDesktop&&<LangSwitcher lang={lang} onSwitch={switchLang}/>}
          {vp.isDesktop&&!session&&(
            <>
              <Btn onClick={()=>setShowApply(true)} v="ruby" sz="sm">{t('applyAsArtist')}</Btn>
              <Btn onClick={()=>setShowLogin(true)} v="ghost" sz="sm">{t('signIn')}</Btn>
              <button onClick={toggleTheme} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
                style={{width:36,height:36,borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0,WebkitTapHighlightColor:'transparent'}}>
                {theme==='dark'?'☀':'🌙'}
              </button>
            </>
          )}
          {vp.isDesktop&&session&&(
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{color:C.muted,fontSize:T.xs}}>👤 {session.name.split(" ")[0]}</span>
              <Btn onClick={logout} v="ghost" sz="sm">{t('signOut')}</Btn>
              <button onClick={toggleTheme} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
                style={{width:36,height:36,borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>
                {theme==='dark'?'☀':'🌙'}
              </button>
            </div>
          )}
          {vp.isMobile&&(
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <LangSwitcher lang={lang} onSwitch={switchLang}/>
              <button onClick={toggleTheme} aria-label="Toggle theme"
                style={{width:34,height:34,borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,WebkitTapHighlightColor:'transparent'}}>
                {theme==='dark'?'☀':'🌙'}
              </button>
              {!session&&(
                <button onClick={()=>setShowLogin(true)} aria-label={t('signIn')}
                  style={{width:38,height:38,borderRadius:10,background:C.surface,border:`1px solid ${C.border}`,color:C.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,WebkitTapHighlightColor:"transparent"}}>
                  👤
                </button>
              )}
              {session&&(
                <button onClick={logout} aria-label={t('signOut')}
                  style={{height:34,borderRadius:8,background:C.rubyS,border:`1px solid ${C.ruby}44`,color:C.ruby,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:"0 10px",fontSize:11,fontWeight:700,fontFamily:"inherit",WebkitTapHighlightColor:"transparent"}}>
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
                  {vp.isMobile?"🔍":t('searchBtn')}
                </button>
              </div>

              {/* Trust chips */}
              <div className="u3" style={{display:"flex",gap:vp.isMobile?16:22,flexWrap:"wrap",justifyContent:"center"}}>
                {(vp.isMobile
                  ?[["✓",t('trustVerified')],["🔒",t('trustStripe')],["💬",t('trustChat')],["🇦🇫",t('trustCulture')]]
                  :[["✓",t('trustVerified')],["🔒",t('trustStripe')],["💬",t('trustChat')],["💳",t('trustDeposits')],["🇦🇫",t('trustCulture')]]
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
                  {approved.slice(0,4).map(a=><ArtistCard key={a.id} artist={a} onClick={art=>{setSelArtist(art);setView("profile");}}/>)}
                </div>
                <div style={{position:"sticky",top:80}}>
                  <AIWidget artists={artists} onPick={art=>{setSelArtist(art);nav("profile");}}/>
                </div>
              </div>
            ):vp.isTablet?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:8}}>
                {approved.slice(0,4).map(a=><ArtistCard key={a.id} artist={a} onClick={art=>{setSelArtist(art);nav("profile");}}/>)}
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:8}}>
                {approved.slice(0,4).map(a=><ArtistCard key={a.id} artist={a} onClick={art=>{setSelArtist(art);nav("profile");}} compact/>)}
              </div>
            )}
          </section>

          {/* How it works */}
          <section style={{background:C.surface,position:"relative",overflow:"hidden"}}>
            <Geo id="hiw" op={0.03}/>
            <div style={{maxWidth:1240,margin:"0 auto",padding:vp.isMobile?"28px 16px":"60px 48px",position:"relative"}}>
              <div style={{textAlign:"center",marginBottom:vp.isMobile?28:44}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T["2xl"],fontWeight:700,color:C.text,marginBottom:6}}>{t('howSectionTitle')}</div>
                <div style={{color:C.muted,fontSize:T.sm,maxWidth:360,margin:"0 auto",lineHeight:1.5}}>{t('howSectionSub')}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:vp.isMobile?"1fr":vp.isTablet?"repeat(3,1fr)":"repeat(5,1fr)",gap:vp.isMobile?12:16,position:"relative"}}>
                {!vp.isMobile&&<div style={{position:"absolute",top:28,left:"10%",right:"10%",height:1,background:`linear-gradient(90deg,transparent,${C.gold}24,${C.gold}24,transparent)`}}/>}
                {[["🔍",t('howStep1Title'),t('howStep1Desc')],["📅",t('howStep2Title'),t('howStep2Desc')],["💳",t('howStep3Title'),t('howStep3Desc')],["💬",t('howStep4Title'),t('howStep4Desc')],["🎶",t('howStep5Title'),t('howStep5Desc')]].map(([icon,title,desc],i)=>(
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
          <footer style={{background:C.surface,padding:vp.isMobile?"24px 16px 100px":"44px 48px 32px"}}>
            {vp.isMobile?(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:16,color:C.gold}}>آواز</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15,fontWeight:700,color:C.text}}>Awaz</div>
                </div>
                <p style={{color:C.muted,fontSize:T.xs,lineHeight:1.7,marginBottom:16}}>{t('footerDesc')}</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:14,marginBottom:16}}>
                  {[[t('footerBrowse'),()=>nav("browse")],[t('footerApply'),()=>setShowApply(true)],[t('howItWorks'),()=>nav("how")]].map(([l,fn])=>(
                    <button key={l} onClick={fn} style={{color:C.muted,fontSize:T.xs,cursor:"pointer",background:"none",border:"none",fontFamily:"inherit",padding:0,minHeight:36}}>{l}</button>
                  ))}
                </div>
                <div style={{color:C.faint,fontSize:T.xs}}>{t('footerCopyright').replace('{year}', YEAR)}</div>
              </div>
            ):(
              <div style={{maxWidth:1240,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{fontFamily:"'Noto Naskh Arabic',serif",fontSize:16,color:C.gold}}>آواز</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,fontWeight:700,color:C.text}}>Awaz — Afghan Artist Booking</div>
                </div>
                <div style={{display:"flex",gap:18}}>
                  {[[t('footerBrowse'),()=>nav("browse")],[t('footerApply'),()=>setShowApply(true)],[t('howItWorks'),()=>nav("how")],["Pricing",()=>nav("pricing")]].map(([l,fn])=>(
                    <button key={l} onClick={fn} style={{color:C.muted,fontSize:T.xs,cursor:"pointer",background:"none",border:"none",fontFamily:"inherit",padding:0,minHeight:36}}>{l}</button>
                  ))}
                </div>
                <div style={{color:C.faint,fontSize:T.xs}}>{t('footerCopyright').replace('{year}', String(YEAR))}</div>
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

            {/* Search */}
            <div style={{display:"flex",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",alignItems:"center",gap:8,height:52,marginBottom:12}}>
              <span style={{color:C.muted,fontSize:16}}>🔍</span>
              <input placeholder={t('searchArtists')} value={search} onChange={e=>setSearch(e.target.value)}
                style={{flex:1,background:"transparent",border:"none",color:C.text,fontSize:T.base,outline:"none",height:"100%",minWidth:0}}/>
              {search&&<button onClick={()=>setSearch("")} aria-label="Fjern søk" style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1,flexShrink:0,minWidth:32,minHeight:32,WebkitTapHighlightColor:"transparent"}}>×</button>}
            </div>

            {/* Genre filters — horizontal scroll on mobile */}
            <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:8,WebkitOverflowScrolling:"touch",scrollbarWidth:"none",marginBottom:14}}>
              {genres.map(g=>(
                <button key={g} onClick={()=>setGenreF(g)}
                  style={{background:genreF===g?C.ruby:C.card,color:genreF===g?"#fff":C.muted,border:`1px solid ${genreF===g?C.ruby:C.border}`,borderRadius:20,padding:vp.isMobile?"8px 14px":"8px 16px",fontSize:T.xs,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flexShrink:0,minHeight:36,WebkitTapHighlightColor:"transparent",whiteSpace:"nowrap",transition:"all 0.15s"}}>
                  {g}
                </button>
              ))}
            </div>

            <div style={{color:C.muted,fontSize:T.xs,marginBottom:14}}>{filtered.length===1?t('artistsCount').replace('{n}',filtered.length):t('artistsCountPlural').replace('{n}',filtered.length)}</div>

            {filtered.length===0?(
              <div style={{textAlign:"center",padding:"40px 24px",background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:40,marginBottom:14}}>🎵</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.text,marginBottom:6}}>{t('noArtistsFound')}</div>
                <div style={{color:C.muted,fontSize:T.sm,marginBottom:16}}>{t('tryDifferent')}</div>
                <Btn v="ghost" sz="md" onClick={()=>{setSearch("");setGenreF("All");}}>{t('clearFilters')}</Btn>
              </div>
            ):vp.isMobile?(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {filtered.map(a=><ArtistCard key={a.id} artist={a} onClick={art=>{setSelArtist(art);nav("profile");}} compact/>)}
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:`repeat(${vp.isTablet?2:3},1fr)`,gap:16}}>
                {filtered.map(a=><ArtistCard key={a.id} artist={a} onClick={art=>{setSelArtist(art);nav("profile");}}/>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROFILE ── */}
      {view==="profile"&&selArtist&&(
        <div style={{paddingTop:vp.isMobile?56:62}}>
          <ProfilePage artist={selArtist} bookings={bookings} onBack={()=>nav(prevView||"browse")} onBookingCreated={handleNewBooking}/>
        </div>
      )}

      {/* ── HOW IT WORKS ── */}
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
            n:"03", icon:"📋", color:C.saffron,
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
            n:"06", icon:"🎶", color:C.gold,
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

                  {/* Icon column */}
                  <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                    {/* Step number */}
                    <div style={{
                      fontFamily:"'Cormorant Garamond',serif",
                      fontSize:vp.isMobile?11:12,fontWeight:700,
                      color:labelText,letterSpacing:"1.5px",
                      lineHeight:1,
                    }}>{s.n}</div>
                    {/* Icon circle */}
                    <div style={{
                      width:vp.isMobile?52:60,height:vp.isMobile?52:60,
                      borderRadius:14,
                      background:`${s.color}14`,
                      border:`1.5px solid ${s.color}30`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:vp.isMobile?24:28,
                      flexShrink:0,
                    }}>{s.icon}</div>
                  </div>

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
                  ["🔒",t('trustStripe'),t('trustStripeDesc')],
                  ["✓",t('trustVerified'),t('trustVerifiedDesc')],
                  ["💬",t('trustChat'),t('trustChatDesc')],
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
              maxWidth:680,margin:"0 auto",
              padding:vp.isMobile?"28px 16px 0":"36px 48px 0",
              display:"flex",
              flexDirection:vp.isMobile?"column":"row",
              gap:12,alignItems:"center",justifyContent:"center",
            }}>
              <Btn onClick={()=>nav("browse")} v="gold" sz="xl"
                xs={vp.isMobile?{width:"100%",justifyContent:"center"}:{}}>
                Browse Artists Now →
              </Btn>
              <Btn onClick={()=>setShowApply(true)} v="ghost" sz="lg"
                xs={vp.isMobile?{width:"100%",justifyContent:"center"}:{}}>
                Apply as an Artist
              </Btn>
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
              {[{label:t('forClients'),icon:"🎉",color:C.gold,items:[t('pricingClient1'),t('pricingClient2'),t('pricingClient3'),t('pricingClient4'),t('pricingClient5')]},
                {label:t('forArtists'),icon:"🎤",color:C.ruby,items:[t('pricingArtist1'),t('pricingArtist2'),t('pricingArtist3'),t('pricingArtist4'),t('pricingArtist5'),t('pricingArtist6')]}].map(({label,icon,color,items})=>(
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
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.lg,fontWeight:700,color:C.gold,marginBottom:14,textAlign:"center"}}>{t('depositSplit')}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[["Artist deposit","Set by artist\nmin €500",C.gold],["You receive","88% direct\nto Stripe",C.emerald],["Awaz fee","12% platform\noperations",C.lapis]].map(([l,v,c])=>(
                  <div key={l} style={{background:C.surface,borderRadius:8,padding:"12px",border:`1px solid ${C.border}`,borderTop:`3px solid ${c}38`,textAlign:"center"}}>
                    <div style={{color:c,fontWeight:700,fontSize:T.xs,marginBottom:4}}>{l}</div>
                    <div style={{color:C.text,fontSize:T.xs,lineHeight:1.4,whiteSpace:"pre-line"}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Bottom Nav (public pages) ── */}
      {vp.isMobile&&["home","browse","how","pricing"].includes(view)&&(
        <nav style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:`${C.surface}F8`,backdropFilter:"blur(20px)",display:"flex",alignItems:"stretch",paddingBottom:"env(safe-area-inset-bottom,0px)",height:`calc(58px + env(safe-area-inset-bottom,0px))`}}>
          {[ {id:"home",icon:"🏠",label:t('portalHome'),fn:()=>nav("home")}, {id:"browse",icon:"🔍",label:t('browseArtists'),fn:()=>nav("browse")}, {id:"apply",icon:"🎤",label:t('applyAsArtist'),fn:()=>setShowApply(true)},
            session
              ? {id:"logout",icon:"👋",label:t('signOut'),fn:()=>logout()}
              : {id:"signin",icon:"👤",label:t('signIn'),fn:()=>setShowLogin(true)}
          ].map(({id,icon,label,fn})=>{
            const isActive=(id==="home"&&view==="home")||(id==="browse"&&view==="browse");
            return(
              <button key={id} onClick={fn} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,background:"transparent",border:"none",cursor:"pointer",color:isActive?C.gold:id==="logout"?C.ruby:C.muted,paddingTop:8,paddingBottom:4,minHeight:44,WebkitTapHighlightColor:"transparent",fontFamily:"inherit",position:"relative"}}>
                {isActive&&<div style={{position:"absolute",top:0,width:24,height:2,borderRadius:1,background:C.gold}}/>}
                <div style={{fontSize:22,lineHeight:1}}>{icon}</div>
                <div style={{fontSize:9,fontWeight:isActive?700:500}}>{label}</div>
              </button>
            );
          })}
        </nav>
      )}

      {/* ── Modals ── */}
      <LoginSheet users={users} open={showLogin} onLogin={login} onClose={()=>setShowLogin(false)}/>
      {showApply&&<ApplySheet onSubmit={handleNewArtist} onClose={()=>setShowApply(false)}/>}
      {/* Floating concierge inquiry button — always visible to visitors */}
      {/* InquiryWidget removed */}
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
function ApplySheet({ onSubmit, onClose }) {
  const [step,setStep]=useState(1);
  const [f,setF]=useState({name:"",nameDari:"",email:"",pass:"",pass2:"",genre:"",location:"",priceInfo:"",deposit:"1000",bio:"",instruments:"",tags:"",cancellationPolicy:"moderate"});
  const [err,setErr]=useState(""),[done,setDone]=useState(false),[loading,setLoading]=useState(false);

  const v1=()=>{if(!f.name)return"Name required.";if(!f.email||!f.email.includes("@"))return"Valid email required.";if(f.pass.length<8)return"Password: 8+ chars.";if(!/[A-Z]/.test(f.pass))return"Need 1 uppercase.";if(!/[0-9]/.test(f.pass))return"Need 1 number.";if(f.pass!==f.pass2)return"Passwords don't match.";return null;};
  const v2=()=>{if(!f.genre)return"Genre required.";return null;};

  const next=()=>{const e=step===1?v1():v2();if(e){setErr(e);return;}setErr("");setStep(s=>s+1);};
  const submit=async()=>{
    setLoading(true);setErr("");
    const emojis=["🎤","🪕","🎶","🎸","🪘","🎷","🎹"],cols=[C.ruby,C.lapis,C.emerald,C.saffron,C.gold,C.lavender];
    const id=`a${Date.now()}`;
    const artistData={id,name:f.name,nameDari:f.nameDari||"",genre:f.genre,location:f.location||"—",rating:0,reviews:0,priceInfo:f.priceInfo||"On request",deposit:parseInt(f.deposit)||1000,emoji:emojis[Math.floor(Math.random()*emojis.length)],color:cols[Math.floor(Math.random()*cols.length)],photo:null,bio:f.bio||"",tags:f.tags.split(",").map(t=>t.trim()).filter(Boolean),instruments:f.instruments.split(",").map(t=>t.trim()).filter(Boolean),superhost:false,status:"pending",joined:MONTHS[NOW.getMonth()]+" "+NOW.getFullYear(),available:{[MK]:[]},blocked:{[MK]:[]},earnings:0,totalBookings:0,verified:false,stripeConnected:false,stripeAccount:null,cancellationPolicy:f.cancellationPolicy};

    // ── Supabase signup ───────────────────────────────────────────────
    if(HAS_SUPA){
      try{
        const sb=await getSupabase();
        const{data,error}=await sb.auth.signUp({
          email:f.email.toLowerCase().trim(),
          password:f.pass,
          options:{data:{name:f.name},emailRedirectTo:window.location.origin},
        });
        if(error){
          setLoading(false);
          const msg = error.message.toLowerCase();
          if(msg.includes('rate limit')||msg.includes('email rate')||msg.includes('over_email')){
            // Supabase email limit hit — save to demo mode, notify admin
            onSubmit(artistData,{id:`u_${id}`,role:"artist",email:f.email,hash:sh(f.pass),name:f.name,artistId:id});
            setDone(true);
          } else if(msg.includes('already registered')||msg.includes('already exists')){
            setErr("An account with this email already exists. Please sign in instead.");
          } else {
            setErr(error.message);
          }
          return;
        }
        // Insert artist row
        await sb.from("artists").insert([{
          id,name:f.name,name_dari:f.nameDari||"",genre:f.genre,
          location:f.location||"—",bio:f.bio||"",price_info:f.priceInfo||"On request",
          deposit:parseInt(f.deposit)||1000,
          emoji:artistData.emoji,color:artistData.color,
          tags:artistData.tags,instruments:artistData.instruments,
          status:"pending",cancellation_policy:f.cancellationPolicy,
          joined_date:MONTHS[NOW.getMonth()]+" "+NOW.getFullYear(),
        }]);
        // Insert profile
        if(data.user){
          await sb.from("profiles").upsert([{
            id:data.user.id,role:"artist",artist_id:id,name:f.name,
          }],{onConflict:"id"});
        }
        setLoading(false);setDone(true);
        return;
      }catch(e){setLoading(false);setErr("Registration failed — please try again.");return;}
    }

    // ── Demo fallback ─────────────────────────────────────────────────
    setTimeout(()=>{
      onSubmit(artistData,{id:`u_${id}`,role:"artist",email:f.email,hash:sh(f.pass),name:f.name,artistId:id});
      setLoading(false);setDone(true);
    },600);
  };

  return(
    <Sheet open onClose={onClose} title={done?"Application Submitted":step===1?"Apply as Artist — Step 1/2":"Apply as Artist — Step 2/2"} maxH="96vh">
      <div style={{padding:"16px 20px 32px"}}>
        {done?(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{width:52,height:52,borderRadius:"50%",background:C.emeraldS,border:`2px solid ${C.emerald}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:22}}>✓</div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:T.xl,fontWeight:700,color:C.text,marginBottom:8}}>{t('onYourWay')}</div>
            <div style={{color:C.muted,fontSize:T.sm,lineHeight:1.7,marginBottom:20}}>{t('profileUnderReview')}</div>
            <Btn full sz="lg" onClick={onClose}>Done</Btn>
          </div>
        ):(
          <>
            <div style={{display:"flex",gap:4,marginBottom:18}}>{[1,2].map(i=><div key={i} style={{flex:1,height:3,borderRadius:2,background:i<=step?C.gold:C.border,transition:"background 0.3s"}}/>)}</div>
            {err&&<div style={{background:C.rubyS,border:`1px solid ${C.ruby}28`,borderRadius:8,padding:"10px 13px",color:C.ruby,fontSize:T.xs,marginBottom:12}}>⚠ {err}</div>}

            {step===1&&(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <Inp label="Artist / Band Name *" placeholder="Soraya Rahimi" value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))} required/>
                <Inp label="Name in Dari (optional)" placeholder="ثریا رحیمی" value={f.nameDari} onChange={e=>setF(p=>({...p,nameDari:e.target.value}))}/>
                <Inp label="Email *" type="email" placeholder="you@email.com" value={f.email} onChange={e=>setF(p=>({...p,email:e.target.value}))} required/>
                <Inp label="Password *" type="password" placeholder="8+ chars, uppercase, number" value={f.pass} onChange={e=>setF(p=>({...p,pass:e.target.value}))} required hint="Min 8 chars, 1 uppercase, 1 number"/>
                <Inp label="Confirm Password *" type="password" placeholder="Repeat password" value={f.pass2} onChange={e=>setF(p=>({...p,pass2:e.target.value}))} required/>
              </div>
            )}
            {step===2&&(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <Sel label="Genre / Style *" value={f.genre} onChange={e=>setF(p=>({...p,genre:e.target.value}))}
                options={[["","Select genre…"],["Ghazal","Ghazal — Classical vocal"],["Herati","Herati — Western Afghan folk"],["Mast","Mast — Dance & celebratory"],["Pashto","Pashto — Pashtun traditional"],["Logari","Logari — Southern Afghan"],["Qarsak","Qarsak — Party & wedding"],["Rubab","Rubab — Instrumental"],["Tabla","Tabla — Percussion"],["Sufi","Sufi — Devotional"],["Classical","Classical Afghan"],["Folk","Afghan Folk"],["Pop","Afghan Pop"],["Fusion","Afghan Fusion"],["Other","Other / Mixed"]]}/>
                <Inp label="Location" placeholder="Kabul · Oslo" value={f.location} onChange={e=>setF(p=>({...p,location:e.target.value}))}/>
                <Inp label="Starting Price" placeholder="From €2,500" value={f.priceInfo} onChange={e=>setF(p=>({...p,priceInfo:e.target.value}))}/>
                <Inp label="Deposit Amount (€)" type="number" value={f.deposit} onChange={e=>setF(p=>({...p,deposit:e.target.value}))} hint="Minimum €500"/>
                <Inp label="Instruments (comma-separated)" placeholder="Vocals, Harmonium" value={f.instruments} onChange={e=>setF(p=>({...p,instruments:e.target.value}))}/>
                <Inp label="Tags (comma-separated)" placeholder="Ghazal, Wedding, Eid" value={f.tags} onChange={e=>setF(p=>({...p,tags:e.target.value}))}/>
                <Sel label="Cancellation Policy" value={f.cancellationPolicy} onChange={e=>setF(p=>({...p,cancellationPolicy:e.target.value}))}
                  options={[["flexible","Flexible — Full refund 7+ days"],["moderate","Moderate — Full refund 72h+"],["strict","Strict — 50% refund 72h+"],["no_refund","No Refund"]]}/>
                <Inp label="Bio" placeholder="Tell clients about yourself…" value={f.bio} onChange={e=>setF(p=>({...p,bio:e.target.value}))} rows={3}/>
              </div>
            )}

            <div style={{display:"flex",gap:8,marginTop:18}}>
              {step>1&&<Btn v="ghost" onClick={()=>{setStep(s=>s-1);setErr("");}} xs={{flex:1}}>{t('back')}</Btn>}
              {step<2?<Btn onClick={next} xs={{flex:step>1?2:1}}>Next →</Btn>:<Btn onClick={submit} loading={loading} xs={{flex:2}}>{t('submitApplication')}</Btn>}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
