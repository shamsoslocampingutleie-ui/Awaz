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
  const [prevView, setPrevView] = useState("home");

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

  const nav = (v) => {
    if (v === "profile") setPrevView(view);
    window.scrollTo({ top: 0, behavior: "instant" });
    setView(v); setMenuOpen(false);
  };

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

  // Sjekk admin/artist tilgang
  if (session?.role === "admin") return <AdminDash key={lang} artists={artists} bookings={bookings} users={users} inquiries={inquiries} onAction={handleArtistAction} onLogout={logout} onMsg={handleMsg} onUpdateInquiry={handleUpdateInquiry} />;
  if (session?.role === "artist") {
    const myA = artists.find(a => a.id === session.artistId);
    if (myA) return <ArtistPortal key={lang} user={session} artist={myA} bookings={bookings} onLogout={logout} onToggleDay={handleToggle} onMsg={handleMsg} onUpdateArtist={handleUpdateArtist} />;
    return <div style={{padding:40, textAlign:'center'}}><Btn onClick={logout}>Sign Out</Btn></div>;
  }

  // LOGIKK FOR FILTRERING (viktig for at "Browse" skal fungere)
  const genres = ["All", "Ghazal", "Traditional", "Folk", "Pop", "Jazz", "Fusion", "Percussion", "Classical"];
  const approved = artists.filter(a => a.status === "approved");
  const filtered = approved.filter(a => {
    const ms = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.genre.toLowerCase().includes(search.toLowerCase()) || a.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const mg = genreF === "All" || a.tags.includes(genreF) || a.genre.toLowerCase().includes(genreF.toLowerCase());
    return ms && mg;
  });

  // SELVE VISNINGEN (JSX)
  return (
    <div key={lang} dir={isRTL ? 'rtl' : 'ltr'} style={{ background: C.bg, minHeight: "100vh", fontFamily: isRTL ? "'Noto Naskh Arabic','DM Sans',sans-serif" : "'DM Sans',sans-serif", color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300;1,400;1,600&family=Noto+Naskh+Arabic:wght@400;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .u0 { animation: up 0.6s cubic-bezier(.4,0,.2,1) both; }
      `}</style>

      {/* Her limer du inn resten av HTML/JSX koden din for Header, Hero, Browse osv hvis du slettet den */}
      <header style={{position:'fixed', top:0, width:'100%', height:60, background:C.surface, zIndex:100, display:'flex', alignItems:'center', padding:'0 20px', justifyContent:'space-between'}}>
         <div onClick={() => nav("home")} style={{cursor:'pointer', fontWeight:800}}>AWAZ</div>
         <Btn v="ghost" sz="sm" onClick={() => setShowLogin(true)}>Login</Btn>
      </header>

      <main style={{paddingTop:80}}>
        {view === "home" && <div className="u0" style={{textAlign:'center'}}><h1>Velkommen til Awaz</h1><Btn onClick={() => nav("browse")}>Finn Artister</Btn></div>}
        {view === "browse" && <div>{filtered.map(a => <ArtistCard key={a.id} artist={a} onClick={() => {setSelArtist(a); nav("profile");}} />)}</div>}
        {view === "profile" && selArtist && <ProfilePage artist={selArtist} bookings={bookings} onBack={() => nav("browse")} onBookingCreated={handleNewBooking} />}
      </main>

      <LoginSheet users={users} open={showLogin} onLogin={login} onClose={() => setShowLogin(
