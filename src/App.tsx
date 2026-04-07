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
    const titles = { home: "Awaz", browse: "Browse", how: "How it works", pricing: "Pricing", profile: selArtist?.name || "Profile" };
    document.title = titles[view] || "Awaz";
  }, [view, selArtist]);

  if (session?.role === "admin") return <AdminDash artists={artists} bookings={bookings} users={users} inquiries={inquiries} onAction={handleArtistAction} onLogout={logout} onMsg={handleMsg} onUpdateInquiry={handleUpdateInquiry} />;
  
  if (session?.role === "artist") {
    const myA = artists.find(a => a.id === session.artistId);
    if (myA) return <ArtistPortal user={session} artist={myA} bookings={bookings} onLogout={logout} onToggleDay={handleToggle} onMsg={handleMsg} onUpdateArtist={handleUpdateArtist} />;
  }

  const approved = artists.filter(a => a.status === "approved");
  const filtered = approved.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div key={lang} dir={isRTL ? 'rtl' : 'ltr'} style={{ background: C.bg, minHeight: "100vh", color: C.text }}>
      <header style={{height:60, display:'flex', alignItems:'center', padding:'0 20px', justifyContent:'space-between', borderBottom:`1px solid ${C.border}`}}>
        <div onClick={() => nav("home")} style={{cursor:'pointer', fontWeight:800}}>AWAZ</div>
        <Btn v="ghost" sz="sm" onClick={() => setShowLogin(true)}>Login</Btn>
      </header>

      <main style={{padding:20}}>
        {view === "home" && <div style={{textAlign:'center', padding:40}}><h1>Welcome to Awaz</h1><Btn onClick={() => nav("browse")}>Browse Artists</Btn></div>}
        {view === "browse" && <div style={{display:'grid', gap:15}}>{filtered.map(a => <ArtistCard key={a.id} artist={a} onClick={() => {setSelArtist(a); nav("profile");}} />)}</div>}
        {view === "profile" && selArtist && <ProfilePage artist={selArtist} bookings={bookings} onBack={() => nav("browse")} onBookingCreated={handleNewBooking} />}
      </main>

      <LoginSheet users={users} open={showLogin} onLogin={login} onClose={() => setShowLogin(false)} />
      {showApply && <ApplySheet onSubmit={handleNewArtist} onClose={() => setShowApply(false)} />}
    </div>
  );
}
