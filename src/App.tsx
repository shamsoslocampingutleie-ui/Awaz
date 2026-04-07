export default function App() {
  const vp = useViewport();
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [prevView, setPrevView] = useState("home"); // VIKTIG: Flyttet opp hit

  // Theme og Språk funksjoner
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    _theme = next;
    try { localStorage.setItem('awaz-theme', next); } catch { }
    setTheme(next);
  };
  const switchLang = l => {
    _lang = l;
    try { localStorage.setItem('awaz-lang', l); } catch { }
    setLang(l);
  };
  const isRTL = isRTLLang(lang);

  // Navigasjonsfunksjon
  const nav = (v) => {
    if (v === "profile") setPrevView(view);
    window.scrollTo({ top: 0, behavior: "instant" });
    setView(v); setMenuOpen(false);
  };

  // Auth funksjoner
  const login = u => { setSession(u); setShowLogin(false); };
  const logout = async () => {
    if (HAS_SUPA) {
      const sb = await getSupabase();
      if (sb) await sb.auth.signOut();
    }
    setSession(null);
  };

  const handleArtistAction = (id, action) => setArtists(p => p.map(a => a.id === id ? { ...a, status: action } : a));
  const handleToggle = (aid, month, year, day) => setArtists(p => p.map(a => {
    if (a.id !== aid) return a;
    const k = `${year}-${month}`, av = [...(a.available[k] || [])], bl = [...(a.blocked[k] || [])];
    if (av.includes(day)) return { ...a, available: { ...a.available, [k]: av.filter(d => d !== day) }, blocked: { ...a.blocked, [k]: [...bl, day] } };
    if (bl.includes(day)) return { ...a, blocked: { ...a.blocked, [k]: bl.filter(d => d !== day) }, available: { ...a.available, [k]: [...av, day] } };
    return { ...a, available: { ...a.available, [k]: [...av, day] } };
  }));
  const handleUpdateArtist = (id, updates) => { setArtists(p => p.map(a => a.id === id ? { ...a, ...updates } : a)); if (selArtist?.id === id) setSelArtist(p => p ? { ...p, ...updates } : p); };
  const handleNewBooking = b => setBookings(p => [...p, b]);
  const handleNewArtist = (a, u) => { setArtists(p => [...p, a]); setUsers(p => [...p, u]); };
  const handleMsg = (bid, m) => setBookings(p => p.map(b => b.id === bid ? { ...b, messages: [...(b.messages || []), m] } : b));

  // Sidetittel effekt
  useEffect(() => {
    const titles = {
      home: "Awaz · آواز — Book Afghan Artists",
      browse: "Browse Artists · Awaz",
      how: "How It Works · Awaz",
      pricing: "Pricing · Awaz",
      profile: selArtist ? `${selArtist.name} · Awaz` : "Artist · Awaz",
    };
    document.title = titles[view] || "Awaz · آواز";
  }, [view, selArtist]);

  // --- NÅ KAN VI SJEKKE ROLLER OG RETURNERE DASHBORD ---
  
  if (session?.role === "admin") {
    return <AdminDash key={lang} artists={artists} bookings={bookings} users={users} inquiries={inquiries} onAction={handleArtistAction} onLogout={logout} onMsg={handleMsg} onUpdateInquiry={handleUpdateInquiry} />;
  }

  if (session?.role === "artist") {
    const myA = artists.find(a => a.id === session.artistId);
    if (myA) return <ArtistPortal key={lang} user={session} artist={myA} bookings={bookings} onLogout={logout} onToggleDay={handleToggle} onMsg={handleMsg} onUpdateArtist={handleUpdateArtist} />;
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, maxWidth: 400, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 8 }}>Profil ikke funnet</div>
          <Btn v="ghost" sz="lg" onClick={logout} xs={{ width: "100%" }}>Logg ut</Btn>
        </div>
      </div>
    );
  }

  // Logikk for forsiden fortsetter her...
  const genres = ["All", "Ghazal", "Traditional", "Folk", "Pop", "Jazz", "Fusion", "Percussion", "Classical"];
  const approved = approvedArtists = artists.filter(a => a.status === "approved"); // Forenklet for eksempel
  
  // Returner hovedsiden (den lange JSX-blokken din)
  return (
     <div key={lang} dir={isRTL ? 'rtl' : 'ltr'} ...>
     {/* Resten av koden din her */}
