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

// ── Theme System ─────────────────────────────────────────────────────
const DARK = {
  bg:'#07060B', surface:'#0F0D16', card:'#141220', cardH:'#1A1728',
  border:'#201D2E', borderM:'#2C2840', gold:'#C8A84A', goldLt:'#E2C870',
  goldS:'rgba(200,168,74,0.09)', ruby:'#A82C38', rubyLt:'#CC3848',
  rubyS:'rgba(168,44,56,0.09)', lapis:'#1E4E8C', lapisS:'rgba(30,78,140,0.09)',
  emerald:'#1A7850', emeraldS:'rgba(26,120,80,0.09)', saffron:'#C47820',
  lavender:'#6B4EAA', stripe:'#635BFF', text:'#EDE4CE', textD:'#C8BBA0',
  muted:'#8A7D68', faint:'#4A4238', spotifyCard:'#0A1A0D', youtubeCard:'#150A0A',
  instagramCard:'#120810', tiktokCard:'#0A0A12', spotify:'#1DB954', instagram:'#E1306C',
};

const LIGHT = {
  bg:'#FAF8F4', surface:'#F0EBE2', card:'#FFFFFF', cardH:'#FAF7F2',
  border:'#E2D8CC', borderM:'#CFC3B3', gold:'#6B4D08', goldLt:'#8A6510',
  goldS:'rgba(107,77,8,0.08)', ruby:'#8B1E2A', rubyLt:'#A82533',
  rubyS:'rgba(139,30,42,0.07)', lapis:'#1A3F7C', lapisS:'rgba(26,63,124,0.07)',
  emerald:'#145E3C', emeraldS:'rgba(20,94,60,0.07)', saffron:'#7A4400',
  lavender:'#5B3F9A', stripe:'#4B44CC', text:'#1C160D', textD:'#3B2F1E',
  muted:'#6B5C45', faint:'#A89880', spotifyCard:'#F0FAF5', youtubeCard:'#FFF5F5',
  instagramCard:'#FFF0F5', tiktokCard:'#F0FAFC', spotify:'#1DB954', instagram:'#E1306C',
};

let _theme = (() => { try { return localStorage.getItem('awaz-theme')||'dark'; } catch { return 'dark'; } })();
const C = new Proxy({}, { get:(_,k) => (_theme==='dark'?DARK:LIGHT)[k] });

const T = {
  xs: "clamp(12px, 3vw, 13px)", sm: "clamp(13px, 3.3vw, 14px)",
  base: "clamp(15px, 3.8vw, 16px)", md: "clamp(16px, 4vw, 17px)",
  lg: "clamp(18px, 4.5vw, 20px)", xl: "clamp(22px, 5.5vw, 26px)",
  "2xl":"clamp(27px, 6.5vw, 34px)", "3xl":"clamp(34px, 8vw, 48px)",
  "4xl":"clamp(42px, 10vw, 68px)", "5xl":"clamp(52px, 12vw, 92px)",
};

const TRANSLATIONS = {
    en: { browseArtists:"Browse Artists", howItWorks:"How It Works", pricing:"Pricing", applyAsArtist:"Apply as Artist", signIn:"Sign In", signOut:"Sign Out", heroEyebrow:"Book Afghan Artists Directly", heroLine1:"Book Afghan", heroLine2:"Artists", heroLine2em:"Directly", heroBody:"Discover and book verified Afghan artists for your event.", searchPlaceholder:"Artist, genre, or city...", searchBtn:"Search", months:["January","February","March","April","May","June","July","August","September","October","November","December"], wdays:["Mo","Tu","We","Th","Fr","Sa","Su"], portalHome:"Home", portalCalendar:"Calendar", portalBookings:"Bookings", portalMessages:"Messages", portalProfile:"Profile" },
    no: { browseArtists:"Artister", howItWorks:"Slik fungerer det", pricing:"Priser", applyAsArtist:"Søk som artist", signIn:"Logg inn", signOut:"Logg ut", heroEyebrow:"Bestill afghanske artister direkte", heroLine1:"Bestill afghanske", heroLine2:"artister", heroLine2em:"direkte", heroBody:"Finn og bestill verifiserte afghanske artister til ditt arrangement.", searchPlaceholder:"Artist, sjanger eller by...", searchBtn:"Søk", months:["Januar","Februar","Mars","April","Mai","Juni","Juli","August","September","Oktober","November","Desember"], wdays:["Ma","Ti","On","To","Fr","Lø","Sø"], portalHome:"Hjem", portalCalendar:"Kalender", portalBookings:"Bookinger", portalMessages:"Meldinger", portalProfile:"Profil" }
};

let _lang = (() => { try { return localStorage.getItem('awaz-lang')||'en'; } catch { return 'en'; } })();
const t = key => TRANSLATIONS[_lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
const MONTHS = new Proxy([], { get:(_,k) => typeof k==='string'&&!isNaN(k) ? (TRANSLATIONS[_lang]||TRANSLATIONS.en).months[+k] : (TRANSLATIONS[_lang]||TRANSLATIONS.en).months[k] });
const WDAYS  = new Proxy([], { get:(_,k) => typeof k==='string'&&!isNaN(k) ? (TRANSLATIONS[_lang]||TRANSLATIONS.en).wdays[+k]  : (TRANSLATIONS[_lang]||TRANSLATIONS.en).wdays[k]  });

const NOW = new Date();
const MK = `${NOW.getFullYear()}-${NOW.getMonth()}`;
const sh = s => { let h=0; for(let i=0;i<s.length;i++) h=(Math.imul(31,h)+s.charCodeAt(i))|0; return h.toString(36); };

// ── Components ───────────────────────────────────────────────────────
const Diamond = ({ color=C.gold, size=8 }) => (
  <svg width={size} height={size} viewBox="0 0 8 8" style={{flexShrink:0}}><path d="M4 0L5 3L8 4L5 5L4 8L3 5L0 4L3 3Z" fill={color} opacity="0.6"/></svg>
);

const HR = ({ color=C.gold, my=14 }) => (
  <div style={{display:"flex",alignItems:"center",gap:10,margin:`${my}px 0`}}>
    <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${color}38)`}}/><Diamond color={color}/><div style={{flex:1,height:1,background:`linear-gradient(270deg,transparent,${color}38)`}}/>
  </div>
);

const Badge = ({ children, color=C.gold, sm=true }) => (
  <span style={{background:color+"14",color,border:`1px solid ${color}30`,borderRadius:4,padding:sm?"2px 8px":"3px 10px",fontSize:sm?10:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:3}}>{children}</span>
);

function Btn({ children, onClick, v="gold", sz="md", disabled, full, loading, xs={}, type="button" }) {
  const bgs = { gold:`linear-gradient(135deg,${C.gold},${C.saffron})`, ruby:`linear-gradient(135deg,${C.ruby},${C.rubyLt})`, ghost:"transparent", dark:C.card };
  const s = { sm:{p:"10px 16px",fs:T.sm}, md:{p:"12px 20px",fs:T.sm}, lg:{p:"14px 28px",fs:T.base} }[sz] || {p:"12px 20px",fs:T.sm};
  return (
    <button type={type} disabled={disabled||loading} onClick={onClick} style={{background:bgs[v]||"transparent", color:v==="gold"?C.bg:C.text, border:`1px solid ${v==="ghost"?C.border:"transparent"}`, borderRadius:10, padding:s.p, fontSize:s.fs, fontWeight:700, cursor:"pointer", width:full?"100%":"auto", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7, transition:"opacity 0.15s", ...xs}}>
      {loading && <div style={{width:14,height:14,border:`2px solid currentColor`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>}
      {children}
    </button>
  );
}

const Inp = ({ label, value, onChange, type="text", placeholder, rows }) => (
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {label && <label style={{fontSize:T.xs,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>{label}</label>}
    {rows ? <textarea value={value} onChange={onChange} rows={rows} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px 15px",color:C.text,fontSize:T.base,width:"100%",fontFamily:"inherit"}}/> : <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px 15px",color:C.text,fontSize:T.base,width:"100%",fontFamily:"inherit"}}/>}
  </div>
);

function Sheet({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:800,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)"}} onClick={onClose}/>
      <div style={{position:"relative",background:C.card,borderRadius:"20px 20px 0 0",maxHeight:"90vh",overflow:"auto",animation:"slideUp 0.3s ease-out"}}>
        <div style={{padding:"20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}><h2 style={{fontFamily:"serif"}}>{title}</h2><button onClick={onClose} style={{background:'none',border:'none',color:C.text,fontSize:24}}>×</button></div>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Data ─────────────────────────────────────────────────────────────
const USERS = [{id:"u0",role:"admin",email:"shams.nn@outlook.com",hash:sh("Grindatuneth301.."),name:"Admin"}];
const ARTISTS = [
  {id:"a1",name:"Soraya Rahimi",genre:"Classical Ghazal",location:"Oslo",rating:4.9,reviews:87,priceInfo:"From €2,500",deposit:1000,emoji:"🎤",color:C.ruby,status:"approved",tags:["Ghazal","Wedding"],available:{[MK]:[1,2,3]},blocked:{[MK]:[]},bio:"Leading Afghan vocalist."},
  {id:"a2",name:"Ahmad Zafar",genre:"Rubab",location:"Bergen",rating:4.8,reviews:52,priceInfo:"From €1,800",deposit:800,emoji:"🪕",color:C.lapis,status:"approved",tags:["Rubab","Traditional"],available:{[MK]:[4,5,6]},blocked:{[MK]:[]},bio:"Rubab virtuoso."}
];
const DEMO_BOOKINGS = [];
const DEMO_INQUIRIES = [];

// ── Components ───────────────────────────────────────────────────────

function ArtistCard({ artist, onClick, compact }) {
  return (
    <div onClick={() => onClick(artist)} style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:16, cursor:'pointer', marginBottom:10}}>
      <div style={{display:'flex', gap:15, alignItems:'center'}}>
        <div style={{fontSize:30, background:artist.color+'22', padding:10, borderRadius:8}}>{artist.emoji}</div>
        <div>
          <h3 style={{color:C.text}}>{artist.name}</h3>
          <p style={{color:C.muted, fontSize:12}}>{artist.genre} · {artist.location}</p>
        </div>
      </div>
    </div>
  );
}

function LoginSheet({ open, onClose, onLogin, users }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const handleLogin = () => {
    const u = users.find(u => u.email === email && u.hash === sh(pass));
    if (u) { onLogin(u); onClose(); }
    else setErr("Feil e-post eller passord.");
  };

  return (
    <Sheet open={open} onClose={onClose} title="Logg inn">
      <div style={{display:'flex', flexDirection:'column', gap:15}}>
        <Inp label="E-post" value={email} onChange={e => setEmail(e.target.value)} />
        <Inp label="Passord" type="password" value={pass} onChange={e => setPass(e.target.value)} />
        {err && <p style={{color:C.ruby, fontSize:12}}>{err}</p>}
        <Btn full onClick={handleLogin}>Logg inn</Btn>
      </div>
    </Sheet>
  );
}

function AdminDash({ artists, onLogout }) {
  return (
    <div style={{padding:40, background:C.bg, minHeight:'100vh'}}>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:30}}>
        <h1 style={{color:C.text}}>Admin Dashboard</h1>
        <Btn v="ghost" onClick={onLogout}>Logg ut</Btn>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(250px, 1fr))', gap:20}}>
        {artists.map(a => <ArtistCard key={a.id} artist={a} onClick={()=>{}} />)}
      </div>
    </div>
  );
}

function ArtistPortal({ artist, onLogout }) {
  return (
    <div style={{padding:40, background:C.bg, minHeight:'100vh'}}>
       <div style={{display:'flex', justifyContent:'space-between', marginBottom:30}}>
        <h1 style={{color:C.text}}>Artist Portal: {artist.name}</h1>
        <Btn v="ghost" onClick={onLogout}>Logg ut</Btn>
      </div>
      <div style={{background:C.card, padding:20, borderRadius:12, color:C.text}}>
        <p>Velkommen tilbake! Her kan du se dine bookinger.</p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// HOVED APP KOMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function App() {
  const vp = useViewport();
  
  // Alle useState må være øverst!
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('awaz-theme') || 'dark'; } catch { return 'dark'; } });
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('awaz-lang') || 'en'; } catch { return 'en'; } });
  const [users, setUsers] = useState(USERS);
  const [artists, setArtists] = useState(ARTISTS);
  const [bookings, setBookings] = useState(DEMO_BOOKINGS);
  const [inquiries, setInquiries] = useState(DEMO_INQUIRIES);
  const [session, setSession] = useState(null);
  const [view, setView] = useState("home");
  const [selArtist, setSelArtist] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [search, setSearch] = useState("");
  const [genreF, setGenreF] = useState("All");
  const [prevView, setPrevView] = useState("home");

  // Funksjoner
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    _theme = next;
    try { localStorage.setItem('awaz-theme', next); } catch { }
    setTheme(next);
  };

  const nav = (v) => {
    if (v === "profile") setPrevView(view);
    window.scrollTo({ top: 0, behavior: "instant" });
    setView(v);
  };

  const login = u => { setSession(u); setShowLogin(false); };
  const logout = () => setSession(null);

  // Sidetittel
  useEffect(() => {
    document.title = "Awaz · Afghan Artist Booking";
  }, [view]);

  // Dashbord-logikk (Admin / Artist)
  if (session?.role === "admin") {
    return <AdminDash artists={artists} onLogout={logout} />;
  }
  if (session?.role === "artist") {
    const myA = artists.find(a => a.id === session.artistId);
    if (myA) return <ArtistPortal artist={myA} onLogout={logout} />;
  }

  // Filtrering av artister
  const approved = artists.filter(a => a.status === "approved");
  const filtered = approved.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));

  // Hoved visning
  return (
    <div key={lang} style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: 'sans-serif' }}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <header style={{ height: 60, display: 'flex', alignItems: 'center', padding: '0 20px', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, position:'sticky', top:0, background:C.bg, zIndex:100 }}>
        <div onClick={() => nav("home")} style={{ cursor: 'pointer', fontWeight: 800, fontSize: 20, color: C.gold }}>AWAZ</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn v="ghost" sz="sm" onClick={toggleTheme}>{theme === 'dark' ? '☀️' : '🌙'}</Btn>
          <Btn v="ghost" sz="sm" onClick={() => setShowLogin(true)}>{t('signIn')}</Btn>
        </div>
      </header>

      <main style={{ padding: vp.isMobile ? 20 : 40 }}>
        {view === "home" && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <h1 style={{ fontSize: T["4xl"], marginBottom: 20 }}>{t('heroLine1')} {t('heroLine2')}</h1>
            <p style={{ color: C.muted, marginBottom: 30 }}>{t('heroBody')}</p>
            <div style={{ maxWidth: 500, margin: '0 auto', display: 'flex', gap: 10 }}>
              <input placeholder={t('searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, padding: 15, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text }} />
              <Btn onClick={() => nav("browse")}>{t('searchBtn')}</Btn>
            </div>
          </div>
        )}

        {view === "browse" && (
          <div>
            <h2 style={{ marginBottom: 20 }}>{t('browseArtists')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: vp.isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {filtered.map(a => <ArtistCard key={a.id} artist={a} onClick={() => { setSelArtist(a); nav("profile"); }} />)}
            </div>
          </div>
        )}

        {view === "profile" && selArtist && (
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <Btn v="ghost" onClick={() => nav("browse")}>← Tilbake</Btn>
            <div style={{ background: C.card, padding: 30, borderRadius: 15, marginTop: 20 }}>
              <div style={{ fontSize: 60 }}>{selArtist.emoji}</div>
              <h1>{selArtist.name}</h1>
              <Badge color={selArtist.color}>{selArtist.genre}</Badge>
              <p style={{ marginTop: 20, lineHeight: 1.6 }}>{selArtist.bio}</p>
              <HR color={selArtist.color} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: C.muted }}>Pris:</span>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{selArtist.priceInfo}</div>
                </div>
                <Btn v="gold" sz="lg">Book nå</Btn>
              </div>
            </div>
          </div>
        )}
      </main>

      <LoginSheet open={showLogin} onClose={() => setShowLogin(false)} onLogin={login} users={users} />
    </div>
  );
}
