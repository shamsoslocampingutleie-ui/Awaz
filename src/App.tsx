import { useState, useRef, useEffect, useMemo } from "react";

// ── Supabase client ───────────────────────────────────────────────────
const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPA_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

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

// ── Global error handler for Chrome extension noise (the error you see) ──
useEffect(() => {
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const msg = String(event.reason?.message || event.reason || "").toLowerCase();
    if (
      msg.includes("no listener") ||
      msg.includes("tabs:outgoing.message.ready") ||
      msg.includes("receiving end does not exist") ||
      msg.includes("could not establish connection")
    ) {
      event.preventDefault();
      console.debug("[Awaz] Ignored non-critical browser extension error");
      return;
    }
  };

  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
}, []);

/* ═══════════════════════════════════════════════════════════════════════
   AWAZ  ·  آواز  ·  Afghan Artist Booking Platform
   Mobile-first · Apple HIG · Airbnb UX · Stripe precision
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

// ── Dual-theme system ────────────────────────────────────────────────
const DARK = {
  bg:'#07060B', surface:'#0F0D16', card:'#141220', cardH:'#1A1728',
  border:'#201D2E', borderM:'#2C2840',
  gold:'#C8A84A', goldLt:'#E2C870', goldS:'rgba(200,168,74,0.09)',
  ruby:'#A82C38', rubyLt:'#CC3848', rubyS:'rgba(168,44,56,0.09)',
  lapis:'#1E4E8C', lapisS:'rgba(30,78,140,0.09)',
  emerald:'#1A7850', emeraldS:'rgba(26,120,80,0.09)',
  saffron:'#C47820', lavender:'#6B4EAA', stripe:'#635BFF',
  text:'#EDE4CE', textD:'#C8BBA0', muted:'#8A7D68', faint:'#4A4238',
  spotifyCard:'#0A1A0D', youtubeCard:'#150A0A', instagramCard:'#120810', tiktokCard:'#0A0A12',
  spotify:'#1DB954', instagram:'#E1306C',
};

const LIGHT = {
  bg:'#FAF8F4', surface:'#F0EBE2', card:'#FFFFFF', cardH:'#FAF7F2',
  border:'#E2D8CC', borderM:'#CFC3B3',
  gold:'#6B4D08', goldLt:'#8A6510', goldS:'rgba(107,77,8,0.08)',
  ruby:'#8B1E2A', rubyLt:'#A82533', rubyS:'rgba(139,30,42,0.07)',
  lapis:'#1A3F7C', lapisS:'rgba(26,63,124,0.07)',
  emerald:'#145E3C', emeraldS:'rgba(20,94,60,0.07)',
  saffron:'#7A4400', lavender:'#5B3F9A', stripe:'#4B44CC',
  text:'#1C160D', textD:'#3B2F1E', muted:'#6B5C45', faint:'#A89880',
  spotifyCard:'#F0FAF5', youtubeCard:'#FFF5F5', instagramCard:'#FFF0F5', tiktokCard:'#F0FAFC',
  spotify:'#1DB954', instagram:'#E1306C',
};

let _theme = (() => { try { return localStorage.getItem('awaz-theme')||'dark'; } catch { return 'dark'; } })();
const C = new Proxy({}, { get:(_,k) => (_theme==='dark'?DARK:LIGHT)[k] });

const YEAR = new Date().getFullYear();

// ── Fluid typography ─────────────────────────────────────────────────
const T = {
  xs:   "clamp(12px, 3vw,   13px)",
  sm:   "clamp(13px, 3.3vw, 14px)",
  base: "clamp(15px, 3.8vw, 16px)",
  md:   "clamp(16px, 4vw,   17px)",
  lg:   "clamp(18px, 4.5vw, 20px)",
  xl:   "clamp(22px, 5.5vw, 26px)",
  "2xl":"clamp(27px, 6.5vw, 34px)",
  "3xl":"clamp(34px, 8vw,   48px)",
  "4xl":"clamp(42px, 10vw,  68px)",
  "5xl":"clamp(52px, 12vw,  92px)",
};

// ── i18n ─────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  en: { /* ... hele ditt en-objekt ... */ },
  no: { /* ... hele ditt no-objekt ... */ },
  de: { /* ... hele ditt de-objekt ... */ },
  fr: { /* ... hele ditt fr-objekt ... */ },
  da: { /* ... hele ditt da-objekt ... */ },
  ps: { /* ... hele ditt ps-objekt ... */ },
};

let _lang = (() => { try { return localStorage.getItem('awaz-lang')||'en'; } catch { return 'en'; } })();
const t = key => TRANSLATIONS[_lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
const isRTLLang = l => l==='da'||l==='ps';

const getMonths = () => (TRANSLATIONS[_lang]||TRANSLATIONS.en).months;
const getWdays  = () => (TRANSLATIONS[_lang]||TRANSLATIONS.en).wdays;

const MONTHS = new Proxy([], { get:(_,k) => typeof k==='string'&&!isNaN(k) ? getMonths()[+k] : getMonths()[k] });
const WDAYS  = new Proxy([], { get:(_,k) => typeof k==='string'&&!isNaN(k) ? getWdays()[+k]  : getWdays()[k]  });

const NOW = new Date();
const MK = `${NOW.getFullYear()}-${NOW.getMonth()}`;
const _nm = NOW.getMonth()+1;
const MK2 = _nm>11?`${NOW.getFullYear()+1}-0`:`${NOW.getFullYear()}-${_nm}`;

const sh = s => { let h=0; for(let i=0;i<s.length;i++) h=(Math.imul(31,h)+s.charCodeAt(i))|0; return h.toString(36); };

// ── URL parsers og andre hjelpefunksjoner ─────────────────────────────
// (Lim inn alle dine parseSpotifyArtistId, parseInstagramHandle, parseYouTubeId osv. her)

// ── Alle komponenter (ArtistCard, ProfilePage, Sheet, Btn, Inp, AdminDash, ArtistPortal, etc.) ──
// Lim inn hele resten av din originale kode herfra og ned til export default function App()

// ── ROOT APP ──────────────────────────────────────────────────────────
export default function App() {
  const vp = useViewport();
  const [theme, setTheme] = useState(_theme);
  const [lang, setLang] = useState(_lang);
  const isRTL = isRTLLang(lang);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    _theme = next;
    try { localStorage.setItem('awaz-theme', next); } catch {}
    setTheme(next);
  };

  const switchLang = (l: string) => {
    _lang = l;
    try { localStorage.setItem('awaz-lang', l); } catch {}
    setLang(l);
  };

  // ... alle dine andre useState, useEffect, funksjoner (login, logout, handleToggle, etc.) ...

  return (
    <div 
      key={lang} 
      dir={isRTL ? 'rtl' : 'ltr'} 
      translate="no" 
      style={{background:C.bg, minHeight:"100vh", width:"100%", overflowX:"hidden", fontFamily: isRTL ? "'Noto Naskh Arabic','DM Sans',sans-serif" : "'DM Sans',sans-serif", color:C.text}}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300;1,400;1,600&family=Noto+Naskh+Arabic:wght@400;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body{margin:0!important;padding:0!important;width:100%;max-width:100%;overflow-x:hidden;background:${C.bg};-webkit-text-size-adjust:100%;text-size-adjust:100%;}
        body{line-height:1.6;}
        .notranslate{transform:translateZ(0);}
        input,textarea,button,select{font-family:'DM Sans',sans-serif;}
        ::selection{background:rgba(200,168,74,0.25);color:#EDE4CE;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes up{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
        .u0,.u1,.u2,.u3{animation:up 0.6s cubic-bezier(.4,0,.2,1) both;}
      `}</style>

      {/* Din header, main content, modals osv. – lim inn resten av JSX-en din her */}

    </div>
  );
}
