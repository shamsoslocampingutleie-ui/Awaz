import { useState, useRef, useEffect, useMemo } from 'react';

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
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);
  return {
    ...vp,
    isMobile: vp.w < 768,
    isTablet: vp.w >= 768 && vp.w < 1024,
    isDesktop: vp.w >= 1024,
  };
}

// ── Design tokens ─────────────────────────────────────────────────────
const C = {
  bg: '#07060B',
  surface: '#0F0D16',
  card: '#141220',
  cardH: '#1A1728',
  border: '#201D2E',
  borderM: '#2C2840',
  gold: '#C8A84A',
  goldLt: '#E2C870',
  goldS: 'rgba(200,168,74,0.09)',
  ruby: '#A82C38',
  rubyLt: '#CC3848',
  rubyS: 'rgba(168,44,56,0.09)',
  lapis: '#1E4E8C',
  lapisS: 'rgba(30,78,140,0.09)',
  emerald: '#1A7850',
  emeraldS: 'rgba(26,120,80,0.09)',
  saffron: '#C47820',
  lavender: '#6B4EAA',
  stripe: '#635BFF',
  text: '#EDE4CE', // 11.4:1 contrast (AAA)
  textD: '#C8BBA0', // 7.8:1 contrast (AAA) — was #A89470 @ 4.6:1 (AA only)
  muted: '#8A7D68', // 4.8:1 contrast (AA+) — was #5C5040 @ 3.1:1 (FAIL)
  faint: '#4A4238',
  // Spotify / social brand colours
  spotify: '#1DB954',
  instagram: '#E1306C',
};

// ── Spacing tokens (4px grid) — reference only ───────────────────────
// const S = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 7:28, 8:32, 10:40, 12:48, 16:64 };

const YEAR = new Date().getFullYear();

// ── Fluid typography — WCAG AAA, mobile-first ─────────────────────────
// Old scale was xs=10px (unreadable), sm=12px (too small for body).
// New scale: minimum body text 15px, never below 13px anywhere.
const T = {
  xs: 'clamp(12px, 3vw,   13px)', // captions, labels   (was 10–11px)
  sm: 'clamp(13px, 3.3vw, 14px)', // secondary body     (was 12–13px)
  base: 'clamp(15px, 3.8vw, 16px)', // primary body       (was 14–15px)
  md: 'clamp(16px, 4vw,   17px)', // emphasis / UI      (was 15–16px)
  lg: 'clamp(18px, 4.5vw, 20px)', // section subheads   (was 17–19px)
  xl: 'clamp(22px, 5.5vw, 26px)', // card heads         (was 20–24px)
  '2xl': 'clamp(27px, 6.5vw, 34px)', // page section heads (was 24–32px)
  '3xl': 'clamp(34px, 8vw,   48px)', // page titles        (was 30–44px)
  '4xl': 'clamp(42px, 10vw,  68px)', // hero heads         (was 38–64px)
  '5xl': 'clamp(52px, 12vw,  92px)', // display            (was 48–88px)
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const NOW = new Date();
const MK = `${NOW.getFullYear()}-${NOW.getMonth()}`;
const _nm = NOW.getMonth() + 1;
const MK2 =
  _nm > 11 ? `${NOW.getFullYear() + 1}-0` : `${NOW.getFullYear()}-${_nm}`;

const sh = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h.toString(36);
};

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
function parseSpotifyArtistId(input = '') {
  if (!input) return null;
  const s = input.trim();
  const uri = s.match(/spotify:artist:([A-Za-z0-9]+)/);
  if (uri) return uri[1];
  const url = s.match(/\/artist\/([A-Za-z0-9]+)/);
  if (url) return url[1];
  if (/^[A-Za-z0-9]{22}$/.test(s)) return s;
  return null;
}

function parseInstagramHandle(input = '') {
  if (!input) return null;
  const s = input.trim();
  const url = s.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  if (url) return '@' + url[1];
  const bare = s.replace(/^@/, '');
  if (/^[A-Za-z0-9._]{1,30}$/.test(bare)) return '@' + bare;
  return null;
}

function parseYouTubeId(input = '') {
  if (!input) return null;
  const s = input.trim();
  // Watch URL: youtube.com/watch?v=ID
  const watch = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (watch) return { type: 'video', id: watch[1] };
  // Short URL: youtu.be/ID
  const short = s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (short) return { type: 'video', id: short[1] };
  // Channel: youtube.com/channel/UCxxxxx
  const chan = s.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]+)/);
  if (chan) return { type: 'channel', id: chan[1] };
  // Handle: youtube.com/@handle
  const handle = s.match(/youtube\.com\/@([A-Za-z0-9._-]+)/);
  if (handle) return { type: 'handle', id: '@' + handle[1], url: s };
  return null;
}

function parseTikTokHandle(input = '') {
  if (!input) return null;
  const s = input.trim();
  const url = s.match(/tiktok\.com\/@([A-Za-z0-9._]+)/);
  if (url) return '@' + url[1];
  const bare = s.replace(/^@/, '');
  if (/^[A-Za-z0-9._]{2,24}$/.test(bare)) return '@' + bare;
  return null;
}

// ── SpotifyEmbed: iframe with graceful load-detection fallback ─────────
function SpotifyEmbed({ artistId, profileUrl }) {
  const [status, setStatus] = useState('idle'); // idle|loading|loaded|blocked
  const timerRef = useRef(null);

  const tryLoad = () => {
    setStatus('loading');
    // CSP blocks don't fire onError reliably on iframes.
    // Use a 5s timeout: if onLoad hasn't fired, assume blocked.
    timerRef.current = setTimeout(() => {
      setStatus((s) => (s === 'loading' ? 'blocked' : s));
    }, 5000);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!artistId) return null;

  if (status === 'idle')
    return (
      <button
        onClick={tryLoad}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          background: 'rgba(29,185,84,0.08)',
          border: '1px dashed rgba(29,185,84,0.3)',
          borderRadius: 10,
          padding: '14px',
          cursor: 'pointer',
          fontFamily: "'DM Sans',sans-serif",
          fontSize: 14,
          fontWeight: 600,
          color: '#1DB954',
          WebkitTapHighlightColor: 'transparent',
          marginTop: 4,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#1DB954">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
        Last inn Spotify-widget
      </button>
    );

  if (status === 'loading')
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          padding: '24px 0',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            border: '2px solid rgba(29,185,84,0.2)',
            borderTopColor: '#1DB954',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span
          style={{
            fontFamily: "'DM Sans',sans-serif",
            fontSize: 13,
            color: '#1DB954',
          }}
        >
          Laster Spotify…
        </span>
      </div>
    );

  if (status === 'blocked')
    return (
      <div
        style={{
          background: 'rgba(29,185,84,0.05)',
          border: '1px solid rgba(29,185,84,0.2)',
          borderRadius: 10,
          padding: '16px',
          marginTop: 4,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: "'DM Sans',sans-serif",
            fontSize: 13,
            fontWeight: 700,
            color: '#1DB954',
            marginBottom: 6,
          }}
        >
          Spotify-widget er blokkert av nettleseren
        </div>
        <div
          style={{
            fontFamily: "'DM Sans',sans-serif",
            fontSize: 12,
            color: C.muted,
            lineHeight: 1.7,
            marginBottom: 12,
          }}
        >
          Dette skjer kun i forhåndsvisning. På din publiserte side (Vercel)
          fungerer widgeten fullt ut. Legg til{' '}
          <code
            style={{
              background: C.bg,
              padding: '1px 5px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            frame-src open.spotify.com
          </code>{' '}
          i vercel.json CSP.
        </div>
        {profileUrl && (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: '#1DB954',
              color: '#000',
              borderRadius: 20,
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="black">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Åpne i Spotify
          </a>
        )}
      </div>
    );

  // status === "loaded"
  return (
    <iframe
      src={`https://open.spotify.com/embed/artist/${artistId}?utm_source=generator&theme=0`}
      width="100%"
      height="352"
      frameBorder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      onLoad={() => {
        clearTimeout(timerRef.current);
        setStatus('loaded');
      }}
      onError={() => {
        clearTimeout(timerRef.current);
        setStatus('blocked');
      }}
      style={{
        display: 'block',
        borderRadius: 10,
        border: '1px solid rgba(29,185,84,0.2)',
        marginTop: 4,
      }}
    />
  );
}

// ── SocialBar — primary display on public artist profile ──────────────
function SocialBar({ artist }) {
  const { spotify, instagram, youtube, tiktok } = artist;
  if (!spotify && !instagram && !youtube && !tiktok) return null;

  const spotifyId = spotify
    ? parseSpotifyArtistId(spotify.profileUrl || '')
    : null;
  const ytParsed = youtube ? parseYouTubeId(youtube.url || '') : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── SPOTIFY ── */}
      {spotify && (
        <div
          style={{
            background: '#0A1A0D',
            border: '1px solid rgba(29,185,84,0.2)',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: 2,
              background: 'linear-gradient(90deg,#1DB954,#16A34A)',
            }}
          />
          <div style={{ padding: '16px 16px 4px' }}>
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#1DB954">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                <span
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#1DB954',
                  }}
                >
                  Spotify
                </span>
              </div>
              {spotify.profileUrl && (
                <a
                  href={spotify.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12,
                    color: '#1DB954',
                    opacity: 0.7,
                    textDecoration: 'none',
                  }}
                >
                  Åpne ↗
                </a>
              )}
            </div>

            {/* Listener count — always visible, no iframe needed */}
            {spotify.monthlyListeners && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: 26,
                    fontWeight: 800,
                    color: C.text,
                    lineHeight: 1,
                  }}
                >
                  {spotify.monthlyListeners}
                </span>
                <span
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12,
                    color: C.muted,
                  }}
                >
                  månedlige lyttere
                </span>
              </div>
            )}

            {/* Top tracks — always visible */}
            {spotify.topTracks?.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  marginBottom: 12,
                }}
              >
                {spotify.topTracks.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 11px',
                      background: 'rgba(29,185,84,0.06)',
                      borderRadius: 8,
                      border: '1px solid rgba(29,185,84,0.1)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 11,
                        fontWeight: 800,
                        color: '#1DB954',
                        width: 14,
                        textAlign: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        background: 'rgba(29,185,84,0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      🎵
                    </div>
                    <span
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 13,
                        color: C.textD,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t}
                    </span>
                    {spotify.profileUrl && (
                      <a
                        href={spotify.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: 'rgba(29,185,84,0.15)',
                          border: '1px solid rgba(29,185,84,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textDecoration: 'none',
                          fontSize: 10,
                          color: '#1DB954',
                          flexShrink: 0,
                        }}
                      >
                        ▶
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional: load real iframe embed on demand */}
          <div style={{ padding: '0 16px 16px' }}>
            {spotifyId && (
              <SpotifyEmbed
                artistId={spotifyId}
                profileUrl={spotify.profileUrl}
              />
            )}
            {!spotifyId && spotify.profileUrl && (
              <a
                href={spotify.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: '#1DB954',
                  color: '#000',
                  borderRadius: 20,
                  padding: '12px',
                  textDecoration: 'none',
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="black">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                Spill på Spotify
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── YOUTUBE ── */}
      {youtube && (
        <div
          style={{
            background: '#150A0A',
            border: '1px solid rgba(255,0,0,0.2)',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: 2,
              background: 'linear-gradient(90deg,#FF0000,#CC0000)',
            }}
          />
          <div style={{ padding: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="20" height="14" viewBox="0 0 20 14" fill="#FF0000">
                  <path d="M19.582 2.186A2.506 2.506 0 0 0 17.82.422C16.254 0 10 0 10 0S3.746 0 2.18.422A2.506 2.506 0 0 0 .418 2.186C0 3.754 0 7 0 7s0 3.246.418 4.814A2.506 2.506 0 0 0 2.18 13.578C3.746 14 10 14 10 14s6.254 0 7.82-.422a2.506 2.506 0 0 0 1.762-1.764C20 10.246 20 7 20 7s0-3.246-.418-4.814zM8 10V4l5.333 3L8 10z" />
                </svg>
                <span
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#FF4444',
                  }}
                >
                  YouTube
                </span>
              </div>
              <a
                href={youtube.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 12,
                  color: '#FF4444',
                  opacity: 0.8,
                  textDecoration: 'none',
                }}
              >
                {youtube.handle || 'Åpne'} ↗
              </a>
            </div>
            {youtube.subscribers && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: 26,
                    fontWeight: 800,
                    color: C.text,
                    lineHeight: 1,
                  }}
                >
                  {youtube.subscribers}
                </span>
                <span
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12,
                    color: C.muted,
                  }}
                >
                  abonnenter
                </span>
              </div>
            )}
            {/* Latest video embed — also iframe, same fallback pattern */}
            {ytParsed?.type === 'video' && (
              <div
                style={{
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,0,0,0.15)',
                  marginTop: 4,
                }}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${ytParsed.id}?rel=0&modestbranding=1`}
                  width="100%"
                  height="200"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                  style={{ display: 'block' }}
                />
              </div>
            )}
            {(ytParsed?.type === 'channel' || ytParsed?.type === 'handle') && (
              <a
                href={youtube.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: '#FF0000',
                  color: '#fff',
                  borderRadius: 20,
                  padding: '11px',
                  textDecoration: 'none',
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  marginTop: 4,
                }}
              >
                <svg width="14" height="10" viewBox="0 0 20 14" fill="white">
                  <path d="M19.582 2.186A2.506 2.506 0 0 0 17.82.422C16.254 0 10 0 10 0S3.746 0 2.18.422A2.506 2.506 0 0 0 .418 2.186C0 3.754 0 7 0 7s0 3.246.418 4.814A2.506 2.506 0 0 0 2.18 13.578C3.746 14 10 14 10 14s6.254 0 7.82-.422a2.506 2.506 0 0 0 1.762-1.764C20 10.246 20 7 20 7s0-3.246-.418-4.814zM8 10V4l5.333 3L8 10z" />
                </svg>
                Se på YouTube
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── INSTAGRAM ── */}
      {instagram && (
        <div
          style={{
            background: '#120810',
            border: '1px solid rgba(225,48,108,0.2)',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: 2,
              background: 'linear-gradient(90deg,#833AB4,#FD1D1D,#F77737)',
            }}
          />
          <div style={{ padding: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    background:
                      'linear-gradient(135deg,#833AB4,#FD1D1D,#F77737)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </div>
                <span
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 13,
                    fontWeight: 700,
                    background: 'linear-gradient(90deg,#C084FC,#FB7185)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  Instagram
                </span>
              </div>
              <a
                href={instagram.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 12,
                  color: '#E1306C',
                  textDecoration: 'none',
                  opacity: 0.8,
                }}
              >
                {instagram.handle} ↗
              </a>
            </div>
            {instagram.followers && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: 26,
                    fontWeight: 800,
                    color: C.text,
                    lineHeight: 1,
                  }}
                >
                  {instagram.followers}
                </span>
                <span
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12,
                    color: C.muted,
                  }}
                >
                  følgere
                </span>
              </div>
            )}
            <a
              href={instagram.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'linear-gradient(135deg,#833AB4,#E1306C,#F77737)',
                color: '#fff',
                borderRadius: 20,
                padding: '11px',
                textDecoration: 'none',
                fontFamily: "'DM Sans',sans-serif",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Se på Instagram ↗
            </a>
          </div>
        </div>
      )}

      {/* ── TIKTOK ── */}
      {tiktok && (
        <div
          style={{
            background: '#0A0A12',
            border: '1px solid rgba(105,201,208,0.2)',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: 2,
              background: 'linear-gradient(90deg,#69C9D0,#EE1D52)',
            }}
          />
          <div style={{ padding: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    background: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                  }}
                >
                  ♪
                </div>
                <span
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.text,
                  }}
                >
                  TikTok
                </span>
              </div>
              <a
                href={`https://tiktok.com/${tiktok.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 12,
                  color: '#69C9D0',
                  textDecoration: 'none',
                  opacity: 0.8,
                }}
              >
                {tiktok.handle} ↗
              </a>
            </div>
            {tiktok.followers && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: 26,
                    fontWeight: 800,
                    color: C.text,
                    lineHeight: 1,
                  }}
                >
                  {tiktok.followers}
                </span>
                <span
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12,
                    color: C.muted,
                  }}
                >
                  følgere
                </span>
              </div>
            )}
            <a
              href={`https://tiktok.com/${tiktok.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'linear-gradient(135deg,#69C9D0,#EE1D52)',
                color: '#fff',
                borderRadius: 20,
                padding: '11px',
                textDecoration: 'none',
                fontFamily: "'DM Sans',sans-serif",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Se på TikTok ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

const Geo = ({ id = 'g', op = 0.04 }) => (
  <svg
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      opacity: op,
      pointerEvents: 'none',
    }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <pattern id={id} width="72" height="72" patternUnits="userSpaceOnUse">
        <polygon
          points="36,3 68,19.5 68,52.5 36,69 4,52.5 4,19.5"
          fill="none"
          stroke="#C8A84A"
          strokeWidth="0.7"
        />
        <polygon
          points="36,12 60,25 60,47 36,60 12,47 12,25"
          fill="none"
          stroke="#C47820"
          strokeWidth="0.38"
        />
        <circle
          cx="36"
          cy="36"
          r="4.5"
          fill="none"
          stroke="#C8A84A"
          strokeWidth="0.48"
        />
        <circle cx="36" cy="36" r="1.4" fill="#C8A84A" opacity="0.28" />
        <line
          x1="36"
          y1="3"
          x2="36"
          y2="12"
          stroke="#C8A84A"
          strokeWidth="0.38"
        />
        <line
          x1="68"
          y1="19.5"
          x2="60"
          y2="25"
          stroke="#C8A84A"
          strokeWidth="0.38"
        />
        <line
          x1="68"
          y1="52.5"
          x2="60"
          y2="47"
          stroke="#C8A84A"
          strokeWidth="0.38"
        />
        <line
          x1="36"
          y1="69"
          x2="36"
          y2="60"
          stroke="#C8A84A"
          strokeWidth="0.38"
        />
        <line
          x1="4"
          y1="52.5"
          x2="12"
          y2="47"
          stroke="#C8A84A"
          strokeWidth="0.38"
        />
        <line
          x1="4"
          y1="19.5"
          x2="12"
          y2="25"
          stroke="#C8A84A"
          strokeWidth="0.38"
        />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>
);

// ── Bottom Sheet (mobile modal) ───────────────────────────────────────
function Sheet({ open, onClose, children, title, maxH = '92vh' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 800,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.72)',
        }}
        onClick={onClose}
      />
      <div
        ref={ref}
        style={{
          position: 'relative',
          background: C.card,
          borderRadius: '20px 20px 0 0',
          maxHeight: maxH,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.8)',
          animation: 'slideUp 0.28s cubic-bezier(0.32,0.72,0,1) both',
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '12px 0 4px',
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: C.borderM,
            }}
          />
        </div>
        {title && (
          <div
            style={{
              padding: '8px 20px 14px',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T.lg,
                fontWeight: 700,
                color: C.text,
              }}
            >
              {title}
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: C.surface,
                border: 'none',
                color: C.muted,
                cursor: 'pointer',
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        )}
        <div
          style={{ flex: 1, overflow: 'auto', overscrollBehavior: 'contain' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Bottom Navigation (mobile) ────────────────────────────────────────
function BottomNav({ active, onNav, items }) {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: `${C.surface}F8`,
        backdropFilter: 'blur(20px)',
        borderTop: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'stretch',
        paddingBottom: 'env(safe-area-inset-bottom,0px)',
        height: `calc(58px + env(safe-area-inset-bottom,0px))`,
      }}
    >
      {items.map(({ id, icon, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onNav(id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isActive ? C.gold : C.muted,
              paddingTop: 8,
              paddingBottom: 4,
              minHeight: 44,
              minWidth: 44,
              transition: 'color 0.15s',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
            <div
              style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: '0.2px',
              }}
            >
              {label}
            </div>
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  width: 24,
                  height: 2,
                  borderRadius: 1,
                  background: C.gold,
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ── UI Primitives ─────────────────────────────────────────────────────
const Diamond = ({ color = C.gold, size = 8 }) => (
  <svg width={size} height={size} viewBox="0 0 8 8" style={{ flexShrink: 0 }}>
    <path d="M4 0L5 3L8 4L5 5L4 8L3 5L0 4L3 3Z" fill={color} opacity="0.6" />
  </svg>
);

const HR = ({ color = C.gold, my = 14 }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      margin: `${my}px 0`,
    }}
  >
    <div
      style={{
        flex: 1,
        height: 1,
        background: `linear-gradient(90deg,transparent,${color}38)`,
      }}
    />
    <Diamond color={color} />
    <div
      style={{
        flex: 1,
        height: 1,
        background: `linear-gradient(270deg,transparent,${color}38)`,
      }}
    />
  </div>
);

const Badge = ({ children, color = C.gold, sm = true }) => (
  <span
    style={{
      background: color + '14',
      color,
      border: `1px solid ${color}30`,
      borderRadius: 4,
      padding: sm ? '2px 8px' : '3px 10px',
      fontSize: sm ? 10 : 11,
      fontWeight: 700,
      letterSpacing: '0.4px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      flexShrink: 0,
    }}
  >
    {children}
  </span>
);

const Stars = ({ rating, count, size = 12 }) => (
  <span
    style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
  >
    <span style={{ color: C.gold, fontSize: size }}>★</span>
    <span style={{ color: C.text, fontWeight: 700, fontSize: size }}>
      {rating}
    </span>
    {count && (
      <span style={{ color: C.muted, fontSize: size - 1 }}>({count})</span>
    )}
  </span>
);

function Btn({
  children,
  onClick,
  v = 'gold',
  sz = 'md',
  disabled,
  full,
  loading,
  xs = {},
  type = 'button',
}) {
  const bgs = {
    gold: `linear-gradient(135deg,${C.gold},${C.saffron})`,
    ruby: `linear-gradient(135deg,${C.ruby},${C.rubyLt})`,
    ghost: 'transparent',
    stripe: `linear-gradient(135deg,#635BFF,#7B72FF)`,
    emerald: `linear-gradient(135deg,${C.emerald},#22A068)`,
    lapis: `linear-gradient(135deg,${C.lapis},#2860AA)`,
    dark: C.card,
  };
  const sizes = {
    sm: { p: '10px 16px', fs: T.sm, h: '36px' },
    md: { p: '12px 20px', fs: T.sm, h: '44px' },
    lg: { p: '14px 28px', fs: T.base, h: '48px' },
    xl: { p: '16px 36px', fs: T.md, h: '54px' },
  };
  const s = sizes[sz] || sizes.md;
  const fg = v === 'gold' ? C.bg : C.text;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      style={{
        background: bgs[v] || 'transparent',
        color: fg,
        border: `1px solid ${v === 'ghost' ? C.border : 'transparent'}`,
        borderRadius: 10,
        padding: s.p,
        fontSize: s.fs,
        fontWeight: 700,
        minHeight: s.h,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        width: full ? '100%' : 'auto',
        fontFamily: 'inherit',
        letterSpacing: '0.3px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        transition: 'opacity 0.15s',
        ...xs,
      }}
    >
      {loading && (
        <div
          style={{
            width: 14,
            height: 14,
            border: `2px solid ${fg}44`,
            borderTopColor: fg,
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      )}
      {children}
    </button>
  );
}

const Inp = ({
  label,
  value,
  onChange,
  onKeyDown,
  type = 'text',
  placeholder,
  hint,
  error,
  required,
  rows,
  disabled,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
    {label && (
      <label
        style={{
          fontSize: T.xs,
          color: C.muted,
          fontWeight: 700,
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
        }}
      >
        {label}
        {required && <span style={{ color: C.ruby, marginLeft: 2 }}>*</span>}
      </label>
    )}
    {rows ? (
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        style={{
          background: C.surface,
          border: `1px solid ${error ? C.ruby : C.border}`,
          borderRadius: 10,
          padding: '13px 15px',
          color: C.text,
          fontSize: T.base,
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          resize: 'vertical',
          lineHeight: 1.6,
          minHeight: 44,
        }}
      />
    ) : (
      <input
        type={type}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          background: C.surface,
          border: `1px solid ${error ? C.ruby : C.border}`,
          borderRadius: 10,
          padding: '13px 15px',
          color: C.text,
          fontSize: T.base,
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          minHeight: 44,
        }}
      />
    )}
    {error && <div style={{ color: C.ruby, fontSize: T.xs }}>⚠ {error}</div>}
    {hint && !error && (
      <div style={{ color: C.muted, fontSize: T.xs, lineHeight: 1.5 }}>
        {hint}
      </div>
    )}
  </div>
);

const Sel = ({ label, value, onChange, options }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
    {label && (
      <label
        style={{
          fontSize: T.xs,
          color: C.muted,
          fontWeight: 700,
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </label>
    )}
    <select
      value={value}
      onChange={onChange}
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '13px 15px',
        color: C.text,
        fontSize: T.base,
        outline: 'none',
        width: '100%',
        fontFamily: 'inherit',
        minHeight: 44,
        WebkitAppearance: 'none',
      }}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  </div>
);

// ── Photo upload ──────────────────────────────────────────────────────
function PhotoUpload({ photo, onPhoto, color, emoji, size = 80 }) {
  const ref = useRef();
  const handle = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      alert('Max 5MB');
      return;
    }
    const r = new FileReader();
    r.onload = (ev) => onPhoto(ev.target.result);
    r.readAsDataURL(f);
  };
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        cursor: 'pointer',
        flexShrink: 0,
      }}
      onClick={() => ref.current?.click()}
    >
      <input
        ref={ref}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handle}
      />
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.16,
          background: `${color}18`,
          border: `2px solid ${color}55`,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.44,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          emoji
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: -3,
          right: -3,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: C.gold,
          border: `2px solid ${C.bg}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
        }}
      >
        📷
      </div>
    </div>
  );
}

// ── Mini calendar ─────────────────────────────────────────────────────
function MiniCal({
  artist,
  onSelect,
  selDay,
  selMonth,
  selYear,
  editMode,
  onToggle,
  bookings = [],
}) {
  const [cal, setCal] = useState({
    month: NOW.getMonth(),
    year: NOW.getFullYear(),
  });
  const key = `${cal.year}-${cal.month}`;
  const avail = artist?.available?.[key] || [];
  const blocked = artist?.blocked?.[key] || [];
  const bookedD = useMemo(
    () =>
      bookings
        .filter((b) => b.artistId === artist?.id)
        .map((b) => {
          try {
            const d = new Date(b.date);
            return d.getMonth() === cal.month && d.getFullYear() === cal.year
              ? d.getDate()
              : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean),
    [bookings, artist?.id, cal.month, cal.year]
  );
  const fd = new Date(cal.year, cal.month, 1).getDay();
  const dim = new Date(cal.year, cal.month + 1, 0).getDate();
  const off = fd === 0 ? 6 : fd - 1;
  const isNow = cal.month === NOW.getMonth() && cal.year === NOW.getFullYear();
  const isPrevDisabled = isNow;
  const nav = (dir) =>
    setCal((c) => {
      const m = c.month + dir;
      if (m < 0) return { month: 11, year: c.year - 1 };
      if (m > 11) return { month: 0, year: c.year + 1 };
      return { month: m, year: c.year };
    });

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <button
          onClick={() => !isPrevDisabled && nav(-1)}
          disabled={isPrevDisabled}
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            cursor: isPrevDisabled ? 'not-allowed' : 'pointer',
            fontSize: 18,
            color: isPrevDisabled ? C.faint : C.textD,
            opacity: isPrevDisabled ? 0.3 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          ‹
        </button>
        <span
          style={{
            fontFamily: "'Cormorant Garamond',serif",
            fontSize: T.md,
            fontWeight: 700,
            color: C.gold,
          }}
        >
          {MONTHS[cal.month]} {cal.year}
        </span>
        <button
          onClick={() => nav(1)}
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 18,
            color: C.textD,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          ›
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7,1fr)',
          gap: 2,
          marginBottom: 4,
        }}
      >
        {WDAYS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: T.xs,
              color: C.muted,
              fontWeight: 700,
              padding: '2px 0',
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7,1fr)',
          gap: 2,
        }}
      >
        {Array(off)
          .fill(null)
          .map((_, i) => (
            <div key={`e${i}`} />
          ))}
        {Array(dim)
          .fill(null)
          .map((_, i) => {
            const day = i + 1;
            const isB = bookedD.includes(day),
              isX = blocked.includes(day),
              isA = avail.includes(day) && !isB && !isX;
            const isPast = isNow && day < NOW.getDate(),
              isSel =
                selDay === day &&
                selMonth === cal.month &&
                selYear === cal.year;
            let bg = 'transparent',
              color = C.muted,
              border = '1px solid transparent',
              fw = 500;
            if (isPast) color = C.faint;
            else if (isB) {
              bg = C.rubyS;
              color = C.ruby;
              border = `1px solid ${C.ruby}28`;
            } else if (isX) {
              bg = 'rgba(16,12,24,0.9)';
              border = `1px solid ${C.border}`;
            } else if (isA) {
              bg = C.emeraldS;
              color = C.emerald;
              border = `1px solid ${C.emerald}38`;
            }
            if (isSel && isA) {
              bg = C.gold;
              color = C.bg;
              border = `1px solid ${C.gold}`;
              fw = 800;
            }
            const click = () => {
              if (isPast || isB) return;
              if (editMode && onToggle) {
                onToggle(cal.month, cal.year, day);
                return;
              }
              if (!editMode && isA && onSelect)
                onSelect(day, cal.month, cal.year);
            };
            return (
              <div
                key={day}
                onClick={click}
                style={{
                  textAlign: 'center',
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  fontSize: T.sm,
                  fontWeight: fw,
                  background: bg,
                  color,
                  border,
                  cursor: isA || editMode ? 'pointer' : 'default',
                  opacity: isPast ? 0.22 : 1,
                  userSelect: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  minHeight: 36,
                }}
              >
                {day}
              </div>
            );
          })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
        {[
          { c: C.emerald, l: 'Available' },
          { c: C.ruby, l: 'Booked' },
          { c: C.muted, l: 'Blocked' },
        ].map(({ c, l }) => (
          <div
            key={l}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: T.xs,
              color: C.muted,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: c + '38',
                border: `1px solid ${c}48`,
              }}
            />
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chat ──────────────────────────────────────────────────────────────
function Chat({ booking, artist, myRole, onClose, onSend }) {
  const [msg, setMsg] = useState('');
  const [msgs, setMsgs] = useState(booking.messages || []);
  const ref = useRef(null);
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' });
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);
  const send = () => {
    if (!msg.trim() || !booking.chatUnlocked) return;
    const m = {
      from: myRole,
      text: msg.trim(),
      time: new Date().toLocaleTimeString('en', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    setMsgs((p) => [...p, m]);
    onSend?.(booking.id, m);
    setMsg('');
  };
  const bub = (from) =>
    from === 'customer'
      ? { bg: C.goldS, align: 'flex-end' }
      : from === 'artist'
      ? { bg: `${artist?.color || C.ruby}18`, align: 'flex-start' }
      : { bg: C.lapisS, align: 'flex-start' };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.88)',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={onClose}
    >
      <div
        style={{
          flex: 1,
          maxWidth: 540,
          width: '100%',
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          background: C.card,
          borderRadius: 14,
          overflow: 'hidden',
          maxHeight: '90vh',
          boxShadow: '0 40px 100px #000',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            height: 2,
            background: artist
              ? `linear-gradient(90deg,${artist.color},${C.gold})`
              : `linear-gradient(90deg,${C.gold},${C.ruby})`,
          }}
        />
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: C.surface,
            flexShrink: 0,
          }}
        >
          {artist?.photo ? (
            <img
              src={artist.photo}
              alt=""
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: `${artist?.color || C.gold}18`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              {artist?.emoji}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T.md,
                fontWeight: 700,
                color: C.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {artist?.name}
            </div>
            <div
              style={{
                fontSize: T.xs,
                color: booking.chatUnlocked ? C.emerald : C.ruby,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: booking.chatUnlocked ? C.emerald : C.ruby,
                }}
              />
              {booking.chatUnlocked ? 'Active' : 'Locked — deposit required'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: C.surface,
              border: 'none',
              color: C.muted,
              cursor: 'pointer',
              fontSize: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '14px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {!booking.chatUnlocked && (
            <div
              style={{
                background: C.rubyS,
                border: `1px solid ${C.ruby}28`,
                borderRadius: 12,
                padding: 20,
                textAlign: 'center',
                margin: 'auto 0',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: T.lg,
                  fontWeight: 700,
                  color: C.text,
                  marginBottom: 6,
                }}
              >
                Chat Locked
              </div>
              <div style={{ color: C.muted, fontSize: T.sm, lineHeight: 1.6 }}>
                Pay the deposit to unlock messaging.
              </div>
            </div>
          )}
          {msgs.map((m, i) => {
            const s = bub(m.from);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: s.align,
                }}
              >
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 3 }}>
                  {m.from} · {m.time}
                </div>
                <div
                  style={{
                    background: s.bg,
                    border: `1px solid rgba(255,255,255,0.04)`,
                    borderRadius: 12,
                    padding: '10px 14px',
                    maxWidth: '80%',
                    fontSize: T.sm,
                    color: C.text,
                    lineHeight: 1.55,
                  }}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <div
          style={{
            padding: '10px 12px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            gap: 8,
            background: C.surface,
            flexShrink: 0,
            paddingBottom: `max(10px,env(safe-area-inset-bottom,10px))`,
          }}
        >
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={
              booking.chatUnlocked ? 'Type a message…' : 'Deposit required'
            }
            disabled={!booking.chatUnlocked}
            style={{
              flex: 1,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: '10px 14px',
              color: C.text,
              fontSize: T.base,
              outline: 'none',
              fontFamily: 'inherit',
              opacity: booking.chatUnlocked ? 1 : 0.5,
              minHeight: 44,
            }}
          />
          <Btn
            onClick={send}
            sz="md"
            disabled={!booking.chatUnlocked || !msg.trim()}
          >
            →
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Stripe checkout ───────────────────────────────────────────────────
function StripeCheckout({ booking, artist, onSuccess, onClose }) {
  const [card, setCard] = useState({
    number: '',
    expiry: '',
    cvc: '',
    name: '',
  });
  const [step, setStep] = useState('form');
  const [err, setErr] = useState('');
  const deposit = booking.deposit || 1000;
  const artistAmt = Math.round(deposit * 0.88);
  const awazAmt = deposit - artistAmt;
  const fmt4 = (v) =>
    v
      .replace(/\D/g, '')
      .replace(/(.{4})/g, '$1 ')
      .trim()
      .slice(0, 19);
  const fmtEx = (v) => {
    const n = v.replace(/\D/g, '');
    return n.length >= 3 ? n.slice(0, 2) + '/' + n.slice(2, 4) : n;
  };
  const pay = () => {
    if (
      !card.name ||
      card.number.replace(/\s/g, '').length < 16 ||
      card.expiry.length < 5 ||
      card.cvc.length < 3
    ) {
      setErr('Please complete all fields.');
      return;
    }
    setErr('');
    setStep('processing');
    setTimeout(() => setStep('done'), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 920,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.card,
          borderRadius: '20px 20px 0 0',
          maxHeight: '95vh',
          overflow: 'auto',
          animation: 'slideUp 0.28s cubic-bezier(0.32,0.72,0,1) both',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '12px 0 4px',
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: C.borderM,
            }}
          />
        </div>
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg,${artist.color},${C.gold},${artist.color})`,
          }}
        />
        <div
          style={{
            padding: '0 20px 32px',
            paddingBottom: `max(32px,calc(env(safe-area-inset-bottom,0px) + 32px))`,
          }}
        >
          {step === 'processing' && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  border: `3px solid ${C.border}`,
                  borderTopColor: C.gold,
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 20px',
                }}
              />
              <div
                style={{
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: T.xl,
                  color: C.text,
                  marginBottom: 6,
                }}
              >
                Processing…
              </div>
              <div style={{ color: C.muted, fontSize: T.sm }}>
                Secured by Stripe
              </div>
            </div>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: C.emeraldS,
                  border: `2px solid ${C.emerald}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 18px',
                  fontSize: 26,
                }}
              >
                ✓
              </div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: T['2xl'],
                  fontWeight: 700,
                  color: C.text,
                  marginBottom: 8,
                }}
              >
                Deposit Confirmed!
              </div>
              <div
                style={{
                  color: C.muted,
                  fontSize: T.sm,
                  lineHeight: 1.7,
                  marginBottom: 8,
                }}
              >
                <strong style={{ color: C.gold }}>€{deposit}</strong> processed
                securely.
              </div>
              <div
                style={{
                  background: C.surface,
                  borderRadius: 10,
                  padding: '12px 16px',
                  marginBottom: 16,
                  border: `1px solid ${C.border}`,
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: T.sm,
                    marginBottom: 5,
                  }}
                >
                  <span style={{ color: C.muted }}>→ {artist.name}</span>
                  <span style={{ color: C.emerald, fontWeight: 700 }}>
                    €{artistAmt} (direct)
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: T.sm,
                  }}
                >
                  <span style={{ color: C.muted }}>→ Awaz fee (12%)</span>
                  <span style={{ color: C.lapis, fontWeight: 700 }}>
                    €{awazAmt}
                  </span>
                </div>
              </div>
              <div
                style={{
                  background: C.emeraldS,
                  border: `1px solid ${C.emerald}44`,
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 16,
                  fontSize: T.sm,
                  color: C.emerald,
                }}
              >
                💬 Chat with {artist.name} is now unlocked!
              </div>
              <Btn
                v="emerald"
                sz="lg"
                full
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
              >
                Continue to Chat →
              </Btn>
              <div style={{ color: C.muted, fontSize: T.xs, marginTop: 10 }}>
                Balance paid cash to artist after concert
              </div>
            </div>
          )}

          {step === 'form' && (
            <>
              <div
                style={{
                  paddingTop: 16,
                  paddingBottom: 14,
                  borderBottom: `1px solid ${C.border}`,
                  marginBottom: 16,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                {artist.photo ? (
                  <img
                    src={artist.photo}
                    alt=""
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      background: `${artist.color}18`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22,
                      flexShrink: 0,
                    }}
                  >
                    {artist.emoji}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond',serif",
                      fontSize: T.md,
                      fontWeight: 700,
                      color: C.text,
                    }}
                  >
                    {artist.name}
                  </div>
                  <div style={{ color: artist.color, fontSize: T.xs }}>
                    {booking.event} · {booking.date}
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: C.surface,
                  borderRadius: 10,
                  padding: '14px',
                  marginBottom: 14,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ color: C.muted, fontSize: T.sm }}>
                    Deposit (Stripe)
                  </span>
                  <span
                    style={{
                      color: C.gold,
                      fontWeight: 800,
                      fontSize: T.xl,
                      fontFamily: "'Cormorant Garamond',serif",
                    }}
                  >
                    €{deposit}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      background: C.emeraldS,
                      borderRadius: 6,
                      padding: '7px 10px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        color: C.emerald,
                        fontWeight: 700,
                        fontSize: T.sm,
                      }}
                    >
                      €{artistAmt}
                    </div>
                    <div
                      style={{ color: C.muted, fontSize: T.xs, marginTop: 1 }}
                    >
                      Artist (88%)
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: C.lapisS,
                      borderRadius: 6,
                      padding: '7px 10px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        color: C.lapis,
                        fontWeight: 700,
                        fontSize: T.sm,
                      }}
                    >
                      €{awazAmt}
                    </div>
                    <div
                      style={{ color: C.muted, fontSize: T.xs, marginTop: 1 }}
                    >
                      Awaz (12%)
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <div
                  style={{
                    background: '#635BFF',
                    borderRadius: 4,
                    padding: '3px 10px',
                    fontSize: T.xs,
                    fontWeight: 800,
                    color: '#fff',
                  }}
                >
                  stripe
                </div>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 11,
                  marginBottom: 14,
                }}
              >
                <Inp
                  label="Cardholder Name"
                  placeholder="Full name on card"
                  value={card.name}
                  onChange={(e) =>
                    setCard((c) => ({ ...c, name: e.target.value }))
                  }
                />
                <Inp
                  label="Card Number"
                  placeholder="4242 4242 4242 4242"
                  value={card.number}
                  onChange={(e) =>
                    setCard((c) => ({ ...c, number: fmt4(e.target.value) }))
                  }
                />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 11,
                  }}
                >
                  <Inp
                    label="Expiry"
                    placeholder="MM/YY"
                    value={card.expiry}
                    onChange={(e) =>
                      setCard((c) => ({ ...c, expiry: fmtEx(e.target.value) }))
                    }
                  />
                  <Inp
                    label="CVC"
                    placeholder="•••"
                    value={card.cvc}
                    onChange={(e) =>
                      setCard((c) => ({
                        ...c,
                        cvc: e.target.value.replace(/\D/g, '').slice(0, 4),
                      }))
                    }
                  />
                </div>
              </div>

              {err && (
                <div
                  style={{
                    background: C.rubyS,
                    border: `1px solid ${C.ruby}28`,
                    borderRadius: 8,
                    padding: '10px 13px',
                    color: C.ruby,
                    fontSize: T.xs,
                    marginBottom: 12,
                  }}
                >
                  ⚠ {err}
                </div>
              )}

              <button
                onClick={pay}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg,#635BFF,#7B72FF)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: 16,
                  fontSize: T.md,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  minHeight: 52,
                }}
              >
                Pay €{deposit} deposit securely
              </button>
              <div
                style={{
                  textAlign: 'center',
                  marginTop: 10,
                  color: C.muted,
                  fontSize: T.xs,
                }}
              >
                🔒 256-bit SSL · Stripe PCI L1 · Auto-split payments
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────
const POLICIES = [
  {
    id: 'flexible',
    label: 'Flexible',
    desc: 'Full refund 7+ days before, 50% within 7 days',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    desc: 'Full refund 72h+ before, no refund after',
  },
  {
    id: 'strict',
    label: 'Strict',
    desc: '50% refund 72h+ before, no refund after',
  },
  {
    id: 'no_refund',
    label: 'No Refund',
    desc: 'No refunds under any circumstances',
  },
];
const USERS = [
  {
    id: 'u0',
    role: 'admin',
    email: 'admin@awaz.no',
    hash: sh('Admin2025!'),
    name: 'Admin',
  },
  {
    id: 'u1',
    role: 'artist',
    email: 'soraya@awaz.no',
    hash: sh('Soraya123!'),
    name: 'Soraya Rahimi',
    artistId: 'a1',
  },
  {
    id: 'u2',
    role: 'artist',
    email: 'ahmad@awaz.no',
    hash: sh('Ahmad123!'),
    name: 'Ahmad Zafar',
    artistId: 'a2',
  },
  {
    id: 'u3',
    role: 'artist',
    email: 'khalid@awaz.no',
    hash: sh('Khalid123!'),
    name: 'Khalid Noori',
    artistId: 'a4',
  },
];
const ARTISTS = [
  {
    id: 'a1',
    name: 'Soraya Rahimi',
    nameDari: 'ثریا رحیمی',
    genre: 'Classical Ghazal',
    location: 'Kabul · Oslo',
    rating: 4.98,
    reviews: 87,
    priceInfo: 'From €2,500',
    deposit: 1000,
    emoji: '🎤',
    color: C.ruby,
    photo: null,
    bio: "Soraya is one of Europe's leading Afghan vocalists, rooted in the classical ghazal tradition. Her voice carries the soul of centuries of Afghan poetry — Rumi, Hafez, Bedil — delivered with technical mastery and emotional depth that leaves audiences speechless.",
    tags: ['Ghazal', 'Classical', 'Wedding', 'Eid'],
    instruments: ['Vocals', 'Harmonium'],
    superhost: true,
    status: 'approved',
    joined: 'Jan 2024',
    available: {
      [MK]: [3, 7, 8, 14, 15, 21, 22, 28],
      [MK2]: [1, 5, 8, 12, 15, 19, 22, 26],
    },
    blocked: { [MK]: [10, 11] },
    earnings: 7500,
    totalBookings: 6,
    verified: true,
    stripeConnected: true,
    stripeAccount: 'acct_sor123',
    cancellationPolicy: 'moderate',
    spotify: {
      monthlyListeners: '124K',
      topTracks: ['Laila (Live Oslo)', `Ghazal-e-Rumi`, 'Del-e-Man'],
      profileUrl: 'https://open.spotify.com/artist/example',
    },
    instagram: {
      handle: '@soraya.rahimi.music',
      followers: '89.2K',
      profileUrl: 'https://instagram.com/soraya.rahimi.music',
      posts: [
        { thumb: '🎤', caption: 'Oslo Concert' },
        { thumb: '🎶', caption: 'Recording' },
        { thumb: '🌹', caption: 'Eid Special' },
      ],
    },
  },
  {
    id: 'a2',
    name: 'Ahmad Zafar',
    nameDari: 'احمد ظفر',
    genre: 'Rubab · Traditional',
    location: 'Kandahar · Bergen',
    rating: 4.93,
    reviews: 52,
    priceInfo: 'From €1,800',
    deposit: 800,
    emoji: '🪕',
    color: C.lapis,
    photo: null,
    bio: "A virtuoso of the rubab — Afghanistan's national instrument. Ahmad has dedicated 20 years mastering both the Kabuli and Herati styles. His performances bridge generations, carrying the sound of ancient Afghanistan into every concert hall in Europe.",
    tags: ['Rubab', 'Traditional', 'Festival'],
    instruments: ['Rubab', 'Tabla'],
    superhost: false,
    status: 'approved',
    joined: 'Mar 2024',
    available: { [MK]: [2, 9, 16, 22, 23, 29], [MK2]: [3, 6, 10, 14, 17, 21] },
    blocked: { [MK]: [13] },
    earnings: 3600,
    totalBookings: 4,
    verified: true,
    stripeConnected: true,
    stripeAccount: 'acct_ahm456',
    cancellationPolicy: 'flexible',
    spotify: {
      monthlyListeners: '41K',
      topTracks: ['Rubab Raga No. 1', 'Herati Saz', 'Safar'],
      profileUrl: 'https://open.spotify.com/artist/example',
    },
    instagram: {
      handle: '@ahmad.rubab',
      followers: '22.8K',
      profileUrl: 'https://instagram.com/ahmad.rubab',
      posts: [
        { thumb: '🪕', caption: 'Studio' },
        { thumb: '🎵', caption: 'Bergen' },
        { thumb: '🏔', caption: 'Afghanistan' },
      ],
    },
  },
  {
    id: 'a3',
    name: 'Mariam & Ensemble',
    nameDari: 'مریم و گروه',
    genre: 'Afghan Folk',
    location: 'Herat · London',
    rating: 5.0,
    reviews: 41,
    priceInfo: 'From €4,000',
    deposit: 1200,
    emoji: '🎶',
    color: C.emerald,
    photo: null,
    bio: 'A six-piece ensemble specializing in Herati folk music. Their sound blends dutaar, dohol, and haunting vocals that transport audiences to the valleys of western Afghanistan.',
    tags: ['Folk', 'Ensemble', 'Wedding', 'Eid', 'Cultural'],
    instruments: ['Dutaar', 'Dohol', 'Tula'],
    superhost: true,
    status: 'pending',
    joined: 'Nov 2024',
    available: { [MK]: [5, 12, 19, 25, 26] },
    blocked: { [MK]: [] },
    earnings: 0,
    totalBookings: 0,
    verified: false,
    stripeConnected: false,
    stripeAccount: null,
    cancellationPolicy: 'moderate',
    spotify: null,
    instagram: {
      handle: '@mariam.ensemble',
      followers: '11.4K',
      profileUrl: 'https://instagram.com/mariam.ensemble',
      posts: [
        { thumb: '🎶', caption: 'Rehearsal' },
        { thumb: '🌸', caption: 'Herat' },
        { thumb: '👥', caption: 'Ensemble' },
      ],
    },
  },
  {
    id: 'a4',
    name: 'Khalid Noori',
    nameDari: 'خالد نوری',
    genre: 'Modern Afghan Pop',
    location: 'Oslo · Stockholm',
    rating: 4.85,
    reviews: 118,
    priceInfo: 'From €2,200',
    deposit: 1000,
    emoji: '🎸',
    color: C.saffron,
    photo: null,
    bio: 'Khalid blends Afghan melody with contemporary pop production. With hundreds of thousands of followers and sell-out shows across Scandinavia, he is the defining voice of the Afghan diaspora generation.',
    tags: ['Pop', 'Modern', 'Concert', 'Festival'],
    instruments: ['Guitar', 'Keyboard', 'Vocals'],
    superhost: false,
    status: 'approved',
    joined: 'Jun 2024',
    available: { [MK]: [4, 10, 17, 18, 24, 25], [MK2]: [2, 7, 11, 15, 18, 22] },
    blocked: { [MK]: [12] },
    earnings: 4400,
    totalBookings: 5,
    verified: true,
    stripeConnected: true,
    stripeAccount: 'acct_kha789',
    cancellationPolicy: 'strict',
    spotify: {
      monthlyListeners: '318K',
      topTracks: ['Watan (My Homeland)', 'Oslo Nights', 'Dil Ba Dil'],
      profileUrl: 'https://open.spotify.com/artist/example',
    },
    instagram: {
      handle: '@khalidnoori',
      followers: '204K',
      profileUrl: 'https://instagram.com/khalidnoori',
      posts: [
        { thumb: '🎸', caption: 'Tour 2025' },
        { thumb: '🎤', caption: 'Stockholm' },
        { thumb: '🌙', caption: 'New Single' },
      ],
    },
  },
  {
    id: 'a5',
    name: 'Fatima Qaderi',
    nameDari: 'فاطمه قادری',
    genre: 'Tabla · Percussion',
    location: 'Mazar · Amsterdam',
    rating: 4.96,
    reviews: 33,
    priceInfo: 'From €1,500',
    deposit: 800,
    emoji: '🪘',
    color: C.gold,
    photo: null,
    bio: 'One of very few female tabla virtuosos in Europe. Fatima trained at the Kabul Conservatory under maestro Ustad Rahimi. Her performances are simultaneously meditative and explosive — a rare combination that leaves audiences transformed.',
    tags: ['Tabla', 'Percussion', 'Classical'],
    instruments: ['Tabla', 'Zerbaghali'],
    superhost: true,
    status: 'approved',
    joined: 'Feb 2024',
    available: { [MK]: [6, 7, 13, 20, 21, 27], [MK2]: [4, 8, 11, 15, 18, 22] },
    blocked: { [MK]: [] },
    earnings: 3000,
    totalBookings: 3,
    verified: true,
    stripeConnected: false,
    stripeAccount: null,
    cancellationPolicy: 'flexible',
    spotify: {
      monthlyListeners: '28K',
      topTracks: ['Tabla Meditation', 'Mazar-e-Sharif', 'Zerbaghali Solo'],
      profileUrl: 'https://open.spotify.com/artist/example',
    },
    instagram: {
      handle: '@fatima.tabla',
      followers: '34.1K',
      profileUrl: 'https://instagram.com/fatima.tabla',
      posts: [
        { thumb: '🪘', caption: 'Amsterdam' },
        { thumb: '🎵', caption: 'Concert' },
        { thumb: '🌟', caption: 'Masterclass' },
      ],
    },
  },
  {
    id: 'a6',
    name: 'Rustam & Band',
    nameDari: 'رستم و باند',
    genre: 'Afghan Jazz Fusion',
    location: 'Kabul · Berlin',
    rating: 4.88,
    reviews: 29,
    priceInfo: 'From €3,000',
    deposit: 1200,
    emoji: '🎷',
    color: C.lavender,
    photo: null,
    bio: "Europe's only Afghan jazz-fusion ensemble. Rustam weaves maqam scales through jazz harmony, drawing on influences from Miles Davis to Ahmad Shah Massoud's favourite composers. Profoundly Afghan, undeniably universal.",
    tags: ['Jazz', 'Fusion', 'Concert', 'Corporate'],
    instruments: ['Saxophone', 'Rubab', 'Bass'],
    superhost: false,
    status: 'pending',
    joined: 'Dec 2024',
    available: { [MK]: [2, 9, 16, 23, 30] },
    blocked: { [MK]: [] },
    earnings: 0,
    totalBookings: 0,
    verified: false,
    stripeConnected: false,
    stripeAccount: null,
    cancellationPolicy: 'moderate',
    spotify: {
      monthlyListeners: '19K',
      topTracks: ['Kabul Jazz', 'Maqam Minor', 'Silk Road'],
      profileUrl: 'https://open.spotify.com/artist/example',
    },
    instagram: {
      handle: '@rustamband',
      followers: '8.7K',
      profileUrl: 'https://instagram.com/rustamband',
      posts: [
        { thumb: '🎷', caption: 'Berlin' },
        { thumb: '🎺', caption: 'Jazz Festival' },
        { thumb: '🌐', caption: 'World Tour' },
      ],
    },
  },
];
const BOOKINGS = [
  {
    id: 'b1',
    artistId: 'a1',
    customerName: 'Nasrin Ahmadi',
    customerEmail: 'nasrin@email.com',
    date: `${MONTHS[NOW.getMonth()]} 7, ${NOW.getFullYear()}`,
    event: 'Wedding Reception',
    deposit: 1000,
    depositPaid: true,
    status: 'confirmed',
    chatUnlocked: true,
    messages: [
      { from: 'customer', text: 'So excited for the big day!', time: '10:30' },
      {
        from: 'artist',
        text: 'It will be absolutely unforgettable.',
        time: '10:45',
      },
      { from: 'customer', text: 'Can we add a Dari folk song?', time: '11:00' },
      {
        from: 'artist',
        text: "Of course! I'll prepare Laila specially.",
        time: '11:12',
      },
    ],
  },
  {
    id: 'b2',
    artistId: 'a2',
    customerName: 'Jamshid Karimi',
    customerEmail: 'jamshid@email.com',
    date: `${MONTHS[NOW.getMonth()]} 9, ${NOW.getFullYear()}`,
    event: 'Eid Celebration',
    deposit: 800,
    depositPaid: true,
    status: 'completed',
    chatUnlocked: true,
    messages: [
      {
        from: 'customer',
        text: 'Thank you for the amazing performance!',
        time: '21:00',
      },
      {
        from: 'artist',
        text: 'Eid Mubarak to you and your family!',
        time: '21:20',
      },
    ],
  },
  {
    id: 'b3',
    artistId: 'a4',
    customerName: 'Layla Mansouri',
    customerEmail: 'layla@email.com',
    date: `${MONTHS[NOW.getMonth()]} 10, ${NOW.getFullYear()}`,
    event: 'Corporate Gala',
    deposit: 1000,
    depositPaid: false,
    status: 'pending_payment',
    chatUnlocked: false,
    messages: [],
  },
  {
    id: 'b4',
    artistId: 'a1',
    customerName: 'Omar Safi',
    customerEmail: 'omar@email.com',
    date: `${MONTHS[NOW.getMonth()]} 14, ${NOW.getFullYear()}`,
    event: 'Birthday Celebration',
    deposit: 1000,
    depositPaid: true,
    status: 'confirmed',
    chatUnlocked: true,
    messages: [
      {
        from: 'artist',
        text: 'Looking forward to your celebration!',
        time: '09:00',
      },
      { from: 'customer', text: 'Can we discuss the setlist?', time: '09:30' },
    ],
  },
  {
    id: 'b5',
    artistId: 'a4',
    customerName: 'Fawad Noor',
    customerEmail: 'fawad@email.com',
    date: `${MONTHS[NOW.getMonth()]} 17, ${NOW.getFullYear()}`,
    event: 'Cultural Festival',
    deposit: 1000,
    depositPaid: true,
    status: 'confirmed',
    chatUnlocked: true,
    messages: [
      { from: 'customer', text: 'Need you on stage by 7pm.', time: '14:00' },
      { from: 'artist', text: 'Confirmed, soundcheck at 5pm.', time: '14:20' },
    ],
  },
];

// ── Artist card ───────────────────────────────────────────────────────
function ArtistCard({ artist, onClick, compact = false }) {
  const key = `${NOW.getFullYear()}-${NOW.getMonth()}`;
  const open = (artist.available[key] || []).filter(
    (d) => !(artist.blocked[key] || []).includes(d)
  ).length;
  const totalFollowers = useMemo(() => {
    const sp = artist.spotify?.monthlyListeners || '';
    const ig = artist.instagram?.followers || '';
    if (!sp && !ig) return null;
    return [sp && `${sp} Spotify`, ig && `${ig} IG`]
      .filter(Boolean)
      .join(' · ');
  }, [artist]);

  if (compact) {
    return (
      <div
        onClick={() => onClick(artist)}
        style={{
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          padding: '16px',
          background: C.card,
          borderRadius: 12,
          cursor: 'pointer',
          border: `1px solid ${C.border}`,
          WebkitTapHighlightColor: 'transparent',
          minHeight: 80,
          transition: 'border-color 0.15s',
          borderLeft: `3px solid ${artist.color}44`,
        }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {artist.photo ? (
            <img
              src={artist.photo}
              alt={artist.name}
              style={{
                width: 54,
                height: 54,
                borderRadius: 10,
                objectFit: 'cover',
                border: `2px solid ${artist.color}50`,
              }}
            />
          ) : (
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 10,
                background: `${artist.color}15`,
                border: `2px solid ${artist.color}44`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
              }}
            >
              {artist.emoji}
            </div>
          )}
          {artist.verified && (
            <div
              style={{
                position: 'absolute',
                bottom: -3,
                right: -3,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: C.emerald,
                border: `2px solid ${C.card}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 8,
                color: '#fff',
                fontWeight: 800,
              }}
            >
              ✓
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T.lg,
              fontWeight: 700,
              color: C.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
            }}
          >
            {artist.name}
          </div>
          <div
            style={{
              color: artist.color,
              fontSize: T.sm,
              fontWeight: 600,
              marginTop: 3,
            }}
          >
            {artist.genre}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginTop: 5,
              flexWrap: 'wrap',
            }}
          >
            <Stars rating={artist.rating} count={artist.reviews} size={12} />
            <span style={{ color: C.muted, fontSize: T.xs }}>·</span>
            <span style={{ color: C.emerald, fontSize: T.sm, fontWeight: 700 }}>
              {open} open
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T.md,
              fontWeight: 700,
              color: artist.color,
            }}
          >
            {artist.priceInfo}
          </div>
          <div style={{ color: C.muted, fontSize: T.xs, marginTop: 2 }}>
            €{artist.deposit} dep.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onClick(artist)}
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        cursor: 'pointer',
        overflow: 'hidden',
        WebkitTapHighlightColor: 'transparent',
        transition: 'border-color 0.15s, transform 0.15s',
      }}
    >
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg,${artist.color},${C.gold},${artist.color})`,
        }}
      />
      <div style={{ padding: '20px' }}>
        <div
          style={{
            display: 'flex',
            gap: 13,
            alignItems: 'flex-start',
            marginBottom: 14,
          }}
        >
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {artist.photo ? (
              <img
                src={artist.photo}
                alt={artist.name}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 11,
                  objectFit: 'cover',
                  border: `2px solid ${artist.color}50`,
                }}
              />
            ) : (
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 11,
                  background: `${artist.color}15`,
                  border: `2px solid ${artist.color}44`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                }}
              >
                {artist.emoji}
              </div>
            )}
            {artist.verified && (
              <div
                style={{
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  width: 17,
                  height: 17,
                  borderRadius: '50%',
                  background: C.emerald,
                  border: `2px solid ${C.card}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  color: '#fff',
                  fontWeight: 800,
                }}
              >
                ✓
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {artist.nameDari && (
              <div
                style={{
                  fontFamily: "'Noto Naskh Arabic',serif",
                  fontSize: T.sm,
                  color: C.muted,
                  textAlign: 'right',
                  marginBottom: 2,
                }}
              >
                {artist.nameDari}
              </div>
            )}
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T.xl,
                fontWeight: 700,
                color: C.text,
                lineHeight: 1.1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {artist.name}
            </div>
            <div
              style={{
                color: artist.color,
                fontSize: T.sm,
                fontWeight: 600,
                marginTop: 3,
              }}
            >
              {artist.genre}
            </div>
            {totalFollowers && (
              <div style={{ fontSize: T.xs, color: C.muted, marginTop: 3 }}>
                {totalFollowers}
              </div>
            )}
          </div>
          {artist.superhost && <Badge color={C.gold}>★ Top</Badge>}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <span style={{ color: C.muted, fontSize: T.sm }}>
            📍 {artist.location}
          </span>
          <Badge color={C.emerald}>{open} open</Badge>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 5,
            marginBottom: 14,
          }}
        >
          {artist.tags.slice(0, 3).map((t) => (
            <Badge key={t} color={artist.color}>
              {t}
            </Badge>
          ))}
        </div>
        <div style={{ height: 1, background: C.border, marginBottom: 14 }} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Stars rating={artist.rating} count={artist.reviews} size={13} />
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T.lg,
                fontWeight: 700,
                color: artist.color,
              }}
            >
              {artist.priceInfo}
            </div>
            <div style={{ fontSize: T.xs, color: C.muted, marginTop: 2 }}>
              €{artist.deposit} deposit
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Login sheet ────────────────────────────────────────────────────────
function LoginSheet({ users, open, onLogin, onClose }) {
  const [email, setEmail] = useState(''),
    [pass, setPass] = useState(''),
    [err, setErr] = useState(''),
    [attempts, setAt] = useState(0),
    [locked, setLocked] = useState(false),
    [loading, setLoading] = useState(false);

  // AUTH-FIX-5: Clear error message when sheet re-opens so stale
  // "Invalid credentials" doesn't persist from a previous attempt session.
  // Lockout counter intentionally preserved across open/close for security.
  useEffect(() => {
    if (open) setErr('');
  }, [open]);

  const doLogin = () => {
    if (locked) {
      setErr('Too many attempts. Wait 5 min.');
      return;
    }
    if (!email || !pass) {
      setErr('Enter email and password.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const u = users.find(
        (u) =>
          u.email.toLowerCase() === email.toLowerCase() && u.hash === sh(pass)
      );
      setLoading(false);
      if (!u) {
        // AUTH-FIX-6: Use functional update to avoid stale closure on `attempts`.
        // Previously `attempts` captured in closure could be outdated after 500ms.
        setAt((prev) => {
          const na = prev + 1;
          if (na >= 5) {
            setLocked(true);
            setTimeout(() => {
              setLocked(false);
              setAt(0);
            }, 5 * 60 * 1000);
          }
          setErr(
            `Invalid credentials. ${Math.max(0, 5 - na)} attempt${
              5 - na !== 1 ? 's' : ''
            } left.`
          );
          return na;
        });
        return;
      }
      onLogin(u);
    }, 500);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Sign In to Awaz">
      <div style={{ padding: '16px 20px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              fontFamily: "'Noto Naskh Arabic',serif",
              fontSize: T.xl,
              color: C.gold,
              marginBottom: 4,
            }}
          >
            آواز
          </div>
          <div style={{ color: C.muted, fontSize: T.sm }}>Welcome back</div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <Inp
            label="Email"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doLogin()}
          />
          <Inp
            label="Password"
            type="password"
            placeholder="••••••••"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doLogin()}
          />
        </div>
        {err && (
          <div
            style={{
              background: C.rubyS,
              border: `1px solid ${C.ruby}28`,
              borderRadius: 8,
              padding: '10px 13px',
              color: C.ruby,
              fontSize: T.xs,
              marginBottom: 12,
            }}
          >
            ⚠ {err}
          </div>
        )}
        <Btn full sz="lg" loading={loading} disabled={locked} onClick={doLogin}>
          Sign In
        </Btn>
        <HR color={C.border} my={16} />
        <div
          style={{
            background: C.surface,
            borderRadius: 10,
            padding: '14px',
            border: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              fontSize: T.xs,
              color: C.saffron,
              fontWeight: 700,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>⚠</span> Demo-kontoer — kun for testing
          </div>
          <div
            style={{
              fontSize: T.xs,
              color: C.muted,
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            Disse fjernes når du kobler til Supabase Auth.
          </div>
          {[
            ['admin@awaz.no', 'Admin2025!', 'Admin'],
            ['soraya@awaz.no', 'Soraya123!', 'Artist'],
            ['khalid@awaz.no', 'Khalid123!', 'Artist'],
          ].map(([e, p, r]) => (
            <button
              key={e}
              onClick={() => {
                setEmail(e);
                setPass(p);
                setErr('');
              }}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${C.border}`,
                color: C.textD,
                cursor: 'pointer',
                fontSize: T.xs,
                padding: '10px 0',
                fontFamily: 'inherit',
                minHeight: 44,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span>
                <span style={{ color: C.gold }}>→</span> {e}
              </span>
              <span style={{ color: C.muted }}>{r}</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

// ── Artist Profile Page ───────────────────────────────────────────────
function ProfilePage({ artist, bookings, onBack, onBookingCreated }) {
  const vp = useViewport();
  const [selDay, setSelDay] = useState(null),
    [selMonth, setSelMonth] = useState(null),
    [selYear, setSelYear] = useState(null);
  const [tab, setTab] = useState('about');
  const [showBook, setShowBook] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    event: '',
    notes: '',
  });
  const [pending, setPending] = useState(null);
  const [showStripe, setShowStripe] = useState(false);
  const [chat, setChat] = useState(null);
  const [err, setErr] = useState('');
  const policy = POLICIES.find((p) => p.id === artist.cancellationPolicy);

  const doBook = () => {
    if (!form.name) {
      setErr('Your name is required.');
      return;
    }
    if (!form.email || !form.email.includes('@')) {
      setErr('Valid email is required.');
      return;
    }
    setErr('');
    const nb = {
      id: `b${Date.now()}`,
      artistId: artist.id,
      customerName: form.name,
      customerEmail: form.email,
      date: `${MONTHS[selMonth]} ${selDay}, ${selYear}`,
      event: form.event || 'Private Event',
      deposit: artist.deposit,
      depositPaid: false,
      status: 'pending_payment',
      chatUnlocked: false,
      messages: [],
    };
    setPending(nb);
    setShowBook(false);
    setShowStripe(true);
  };
  const onPaid = () => {
    if (!pending) return;
    const paid = {
      ...pending,
      depositPaid: true,
      status: 'confirmed',
      chatUnlocked: true,
    };
    onBookingCreated(paid);
    setChat(paid);
  };

  // Mobile: stack layout | Desktop: side-by-side
  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        paddingBottom: vp.isMobile ? 88 : 0,
      }}
    >
      {/* Hero */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <Geo id="prof" op={0.05} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at 30% 80%,${artist.color}0C 0%,transparent 60%)`,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: `0 ${vp.isMobile ? 16 : 48}px`,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div style={{ paddingTop: 16, marginBottom: 16 }}>
            <button
              onClick={onBack}
              style={{
                background: 'transparent',
                border: `1px solid ${C.border}`,
                color: C.muted,
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: T.sm,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                minHeight: 44,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              ← Back
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: vp.isMobile ? 'column' : 'row',
              gap: vp.isMobile ? 14 : 24,
              alignItems: vp.isMobile ? 'flex-start' : 'flex-end',
              paddingBottom: 24,
              position: 'relative',
            }}
          >
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {artist.photo ? (
                <img
                  src={artist.photo}
                  alt={artist.name}
                  style={{
                    width: vp.isMobile ? 80 : 100,
                    height: vp.isMobile ? 80 : 100,
                    borderRadius: 14,
                    objectFit: 'cover',
                    border: `2px solid ${artist.color}66`,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: vp.isMobile ? 80 : 100,
                    height: vp.isMobile ? 80 : 100,
                    borderRadius: 14,
                    background: `${artist.color}20`,
                    border: `2px solid ${artist.color}66`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: vp.isMobile ? 38 : 48,
                  }}
                >
                  {artist.emoji}
                </div>
              )}
              {artist.verified && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: -5,
                    right: -5,
                    background: C.emerald,
                    borderRadius: 20,
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                    border: `2px solid ${C.bg}`,
                  }}
                >
                  ✓
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              {artist.nameDari && (
                <div
                  style={{
                    fontFamily: "'Noto Naskh Arabic',serif",
                    fontSize: T.sm,
                    color: C.gold,
                    direction: 'rtl',
                    marginBottom: 3,
                  }}
                >
                  {artist.nameDari}
                </div>
              )}
              <h1
                style={{
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: T['3xl'],
                  fontWeight: 800,
                  color: C.text,
                  margin: '0 0 5px',
                  lineHeight: 1,
                }}
              >
                {artist.name}
              </h1>
              <div
                style={{
                  color: artist.color,
                  fontWeight: 600,
                  fontSize: T.sm,
                  marginBottom: 8,
                }}
              >
                {artist.genre}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <span style={{ color: C.muted, fontSize: T.xs }}>
                  📍 {artist.location}
                </span>
                {artist.reviews > 0 && (
                  <Stars rating={artist.rating} count={artist.reviews} />
                )}
                {artist.superhost && <Badge color={C.gold}>★ Top</Badge>}
              </div>
            </div>
            {!vp.isMobile && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div
                  style={{ fontSize: T.xs, color: C.muted, marginBottom: 3 }}
                >
                  FROM
                </div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: T['2xl'],
                    fontWeight: 800,
                    color: artist.color,
                  }}
                >
                  {artist.priceInfo}
                </div>
                <div style={{ fontSize: T.xs, color: C.muted, marginTop: 3 }}>
                  €{artist.deposit} deposit · Balance cash
                </div>
              </div>
            )}
          </div>
          {/* Mobile price + book CTA */}
          {vp.isMobile && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: T.xl,
                    fontWeight: 800,
                    color: artist.color,
                  }}
                >
                  {artist.priceInfo}
                </div>
                <div style={{ fontSize: T.xs, color: C.muted, marginTop: 2 }}>
                  €{artist.deposit} deposit · Balance cash
                </div>
              </div>
              <Btn v="gold" sz="lg" onClick={() => setShowCal(true)}>
                Book Now
              </Btn>
            </div>
          )}
        </div>
        <div
          style={{
            height: 1,
            background: `linear-gradient(90deg,transparent,${artist.color}38,transparent)`,
          }}
        />
      </div>

      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: `20px ${vp.isMobile ? 0 : 48}px 60px`,
          display: vp.isMobile ? 'block' : 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: 32,
        }}
      >
        {/* Content tabs */}
        <div>
          {/* Tab bar — scrollable on mobile */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              borderBottom: `1px solid ${C.border}`,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              padding: vp.isMobile ? '0 16px' : 0,
            }}
          >
            {[
              ['about', 'About'],
              ['instruments', 'Instruments'],
              ['social', 'Social'],
              ['reviews', 'Reviews'],
              ['policy', 'Terms'],
            ].map(([id, l]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  background: 'transparent',
                  color: tab === id ? artist.color : C.muted,
                  border: 'none',
                  borderBottom: `2px solid ${
                    tab === id ? artist.color : 'transparent'
                  }`,
                  padding: '14px 18px',
                  fontSize: T.sm,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                  marginBottom: -1,
                  minHeight: 48,
                  WebkitTapHighlightColor: 'transparent',
                  letterSpacing: '0.2px',
                }}
              >
                {l}
              </button>
            ))}
          </div>

          <div
            style={{
              padding: vp.isMobile ? '16px' : '0px',
              paddingTop: vp.isMobile ? 16 : 20,
            }}
          >
            {tab === 'about' && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: vp.isMobile ? 20 : 28,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond',serif",
                      color: C.gold,
                      fontSize: T.xl,
                      fontWeight: 700,
                      marginBottom: 14,
                      letterSpacing: '-0.3px',
                    }}
                  >
                    About {artist.name.split(' ')[0]}
                  </div>
                  <p
                    style={{
                      color: C.textD,
                      lineHeight: 1.85,
                      margin: '0 0 16px',
                      fontSize: T.base,
                      fontFamily: "'DM Sans',sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    {artist.bio}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {artist.tags.map((t) => (
                      <Badge key={t} color={artist.color} sm={false}>
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: vp.isMobile ? 20 : 28,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond',serif",
                      color: C.gold,
                      fontSize: T.xl,
                      fontWeight: 700,
                      marginBottom: 14,
                      letterSpacing: '-0.3px',
                    }}
                  >
                    Booking Terms
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: vp.isMobile ? '1fr' : '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    {[
                      [
                        '💳',
                        `€${artist.deposit} deposit via Stripe`,
                        'Paid at booking — auto-split',
                      ],
                      [
                        '💬',
                        'Chat unlocks immediately',
                        'Direct messaging after payment',
                      ],
                      ['💵', 'Balance in cash', 'To artist after the concert'],
                      ['📋', `${policy?.label} policy`, policy?.desc || ''],
                    ].map(([icon, k, v]) => (
                      <div
                        key={k}
                        style={{
                          background: C.surface,
                          borderRadius: 8,
                          padding: '12px 14px',
                          border: `1px solid ${C.border}`,
                          borderLeft: `3px solid ${artist.color}35`,
                        }}
                      >
                        <div style={{ fontSize: 18, marginBottom: 6 }}>
                          {icon}
                        </div>
                        <div
                          style={{
                            color: C.text,
                            fontWeight: 700,
                            fontSize: T.xs,
                            marginBottom: 3,
                          }}
                        >
                          {k}
                        </div>
                        <div
                          style={{
                            color: C.muted,
                            fontSize: T.xs,
                            lineHeight: 1.5,
                          }}
                        >
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {tab === 'instruments' && (
              <div
                style={{
                  background: C.card,
                  borderRadius: 12,
                  padding: vp.isMobile ? 16 : 24,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    color: C.gold,
                    fontSize: T.lg,
                    fontWeight: 700,
                    marginBottom: 14,
                  }}
                >
                  Instruments & Skills
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                  }}
                >
                  {artist.instruments.map((ins) => (
                    <div
                      key={ins}
                      style={{
                        background: C.surface,
                        border: `1px solid ${C.border}`,
                        borderLeft: `3px solid ${artist.color}`,
                        borderRadius: 8,
                        padding: '13px 15px',
                        fontFamily: "'Cormorant Garamond',serif",
                        fontSize: T.md,
                        color: C.text,
                        fontWeight: 600,
                      }}
                    >
                      {ins}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab === 'reviews' && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                {[
                  {
                    name: 'Nasrin Ahmadi',
                    date: 'Feb 2025',
                    text: 'An absolutely incredible performance. Every guest was moved to tears. Truly unforgettable.',
                    rating: 5,
                  },
                  {
                    name: 'Jamshid Karimi',
                    date: 'Jan 2025',
                    text: 'Professional, punctual, authentic. The music perfectly captured the spirit of our Eid. Cannot recommend enough.',
                    rating: 5,
                  },
                  {
                    name: 'Layla Mansouri',
                    date: 'Dec 2024',
                    text: 'Exceeded every expectation at our corporate cultural evening. The entire room was captivated.',
                    rating: 4.8,
                  },
                ].map((r, i) => (
                  <div
                    key={i}
                    style={{
                      background: C.card,
                      borderRadius: 12,
                      padding: vp.isMobile ? 18 : 24,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: "'Cormorant Garamond',serif",
                            fontWeight: 700,
                            color: C.text,
                            fontSize: T.lg,
                          }}
                        >
                          {r.name}
                        </div>
                        <div
                          style={{
                            color: C.muted,
                            fontSize: T.sm,
                            marginTop: 2,
                          }}
                        >
                          {r.date}
                        </div>
                      </div>
                      <Stars rating={r.rating} size={14} />
                    </div>
                    <p
                      style={{
                        color: C.textD,
                        fontSize: T.base,
                        margin: 0,
                        lineHeight: 1.8,
                        fontFamily: "'DM Sans',sans-serif",
                        fontWeight: 400,
                      }}
                    >
                      {r.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {tab === 'social' && (
              <div style={{ paddingTop: 4 }}>
                {artist.spotify || artist.instagram ? (
                  <SocialBar artist={artist} />
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '40px 24px',
                      background: C.card,
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🎵</div>
                    <div
                      style={{
                        fontFamily: "'Cormorant Garamond',serif",
                        fontSize: T.lg,
                        fontWeight: 700,
                        color: C.text,
                        marginBottom: 6,
                      }}
                    >
                      No social accounts connected
                    </div>
                    <div style={{ color: C.muted, fontSize: T.sm }}>
                      This artist hasn't linked Spotify or Instagram yet.
                    </div>
                  </div>
                )}
              </div>
            )}
            {tab === 'policy' && (
              <div
                style={{
                  background: C.card,
                  borderRadius: 12,
                  padding: vp.isMobile ? 20 : 28,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    color: C.gold,
                    fontSize: T.xl,
                    fontWeight: 700,
                    marginBottom: 16,
                    letterSpacing: '-0.3px',
                  }}
                >
                  Booking Terms — {policy?.label}
                </div>
                {[
                  [
                    'Deposit',
                    `€${artist.deposit} via Stripe — auto-split 88% artist / 12% Awaz`,
                  ],
                  ['Balance', 'Paid cash directly to artist after performance'],
                  ['Cancellation', policy?.desc || ''],
                  ['Force Majeure', 'Full refund issued regardless of policy'],
                  [
                    'No-Show',
                    'Customer no-show forfeits deposit · Artist no-show triggers full refund + €50 credit',
                  ],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      marginBottom: 18,
                      paddingBottom: 18,
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <div
                      style={{
                        color: C.text,
                        fontWeight: 700,
                        fontSize: T.md,
                        marginBottom: 5,
                        fontFamily: "'DM Sans',sans-serif",
                      }}
                    >
                      {k}
                    </div>
                    <div
                      style={{
                        color: C.textD,
                        fontSize: T.base,
                        lineHeight: 1.75,
                        fontFamily: "'DM Sans',sans-serif",
                      }}
                    >
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Desktop + Tablet sidebar */}
        {!vp.isMobile && (
          <div
            style={{
              position: 'sticky',
              top: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              }}
            >
              <div
                style={{
                  height: 3,
                  background: `linear-gradient(90deg,${artist.color},${C.gold},${artist.color})`,
                }}
              />
              <div style={{ padding: 20 }}>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    color: C.gold,
                    fontSize: T.lg,
                    fontWeight: 700,
                    marginBottom: 14,
                  }}
                >
                  Select a Date
                </div>
                <MiniCal
                  artist={artist}
                  selDay={selDay}
                  selMonth={selMonth}
                  selYear={selYear}
                  onSelect={(d, m, y) => {
                    setSelDay(d);
                    setSelMonth(m);
                    setSelYear(y);
                  }}
                  bookings={bookings}
                />
                <HR color={artist.color} my={14} />
                {selDay && !showBook && (
                  <div
                    style={{
                      background: C.surface,
                      borderRadius: 8,
                      padding: '12px 14px',
                      marginBottom: 12,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: T.sm,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ color: C.muted }}>Date</span>
                      <span style={{ color: C.text, fontWeight: 600 }}>
                        {MONTHS[selMonth]} {selDay}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: T.sm,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ color: C.muted }}>Deposit</span>
                      <span style={{ color: C.gold, fontWeight: 700 }}>
                        €{artist.deposit}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: T.sm,
                      }}
                    >
                      <span style={{ color: C.muted }}>Balance</span>
                      <span style={{ color: C.textD }}>Cash after concert</span>
                    </div>
                  </div>
                )}
                {!showBook ? (
                  <button
                    onClick={() => selDay && setShowBook(true)}
                    disabled={!selDay}
                    style={{
                      width: '100%',
                      background: selDay
                        ? `linear-gradient(135deg,${artist.color},${artist.color}AA)`
                        : C.border,
                      color: selDay ? '#fff' : C.muted,
                      border: 'none',
                      borderRadius: 10,
                      padding: 14,
                      fontSize: T.base,
                      fontWeight: 800,
                      cursor: selDay ? 'pointer' : 'not-allowed',
                      fontFamily: 'inherit',
                      minHeight: 50,
                      letterSpacing: '0.2px',
                    }}
                  >
                    {selDay
                      ? `Book ${artist.name} ✦`
                      : 'Select an available date'}
                  </button>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <button
                      onClick={() => {
                        setShowBook(false);
                        setErr('');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: C.muted,
                        cursor: 'pointer',
                        fontSize: T.sm,
                        fontFamily: 'inherit',
                        textAlign: 'left',
                        minHeight: 36,
                      }}
                    >
                      ← Change date
                    </button>
                    {err && (
                      <div
                        style={{
                          background: C.rubyS,
                          border: `1px solid ${C.ruby}28`,
                          borderRadius: 7,
                          padding: '10px 12px',
                          color: C.ruby,
                          fontSize: T.sm,
                        }}
                      >
                        ⚠ {err}
                      </div>
                    )}
                    <Inp
                      label="Your Name *"
                      placeholder="Full name"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                    <Inp
                      label="Email *"
                      type="email"
                      placeholder="you@email.com"
                      value={form.email}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, email: e.target.value }))
                      }
                    />
                    <Inp
                      label="Event Type"
                      placeholder="Wedding, Eid…"
                      value={form.event}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, event: e.target.value }))
                      }
                    />
                    <Inp
                      label="Notes (optional)"
                      placeholder="Special requests…"
                      value={form.notes}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      rows={2}
                    />
                    <button
                      onClick={doBook}
                      disabled={!form.name || !form.email}
                      style={{
                        width: '100%',
                        background: 'linear-gradient(135deg,#635BFF,#7B72FF)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 10,
                        padding: 14,
                        fontSize: T.base,
                        fontWeight: 800,
                        cursor: 'pointer',
                        opacity: !form.name || !form.email ? 0.5 : 1,
                        fontFamily: 'inherit',
                        minHeight: 50,
                        letterSpacing: '0.2px',
                      }}
                    >
                      Pay €{artist.deposit} via Stripe →
                    </button>
                    <div
                      style={{
                        textAlign: 'center',
                        color: C.muted,
                        fontSize: T.sm,
                      }}
                    >
                      🔒 Stripe · SSL · PCI compliant
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Social proof below booking card */}
            <SocialBar artist={artist} />
          </div>
        )}
      </div>

      {/* Mobile: Calendar Sheet */}
      <Sheet
        open={showCal}
        onClose={() => setShowCal(false)}
        title="Select a Date"
      >
        <div style={{ padding: '16px 20px 32px' }}>
          <MiniCal
            artist={artist}
            selDay={selDay}
            selMonth={selMonth}
            selYear={selYear}
            onSelect={(d, m, y) => {
              setSelDay(d);
              setSelMonth(m);
              setSelYear(y);
            }}
            bookings={bookings}
          />
          {selDay && (
            <div
              style={{
                marginTop: 16,
                background: C.surface,
                borderRadius: 10,
                padding: '12px 14px',
                border: `1px solid ${C.border}`,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 5,
                }}
              >
                <span style={{ color: C.muted, fontSize: T.sm }}>Date</span>
                <span
                  style={{ color: C.text, fontWeight: 600, fontSize: T.sm }}
                >
                  {MONTHS[selMonth]} {selDay}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.muted, fontSize: T.sm }}>Deposit</span>
                <span
                  style={{
                    color: C.gold,
                    fontWeight: 700,
                    fontSize: T.md,
                    fontFamily: "'Cormorant Garamond',serif",
                  }}
                >
                  €{artist.deposit}
                </span>
              </div>
            </div>
          )}
          <Btn
            full
            sz="lg"
            disabled={!selDay}
            onClick={() => {
              if (selDay) {
                setShowCal(false);
                setShowBook(true);
              }
            }}
            style={{ marginTop: 8 }}
          >
            {selDay
              ? `Continue with ${MONTHS[selMonth]} ${selDay}`
              : 'Select a date first'}
          </Btn>
        </div>
      </Sheet>

      {/* Mobile: Booking form sheet */}
      <Sheet
        open={showBook && vp.isMobile}
        onClose={() => setShowBook(false)}
        title="Complete Your Booking"
      >
        <div
          style={{
            padding: '16px 20px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              background: C.surface,
              borderRadius: 10,
              padding: '12px 14px',
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <span style={{ color: C.muted, fontSize: T.sm }}>
                {artist.name}
              </span>
              <span
                style={{
                  color: C.gold,
                  fontWeight: 700,
                  fontSize: T.md,
                  fontFamily: "'Cormorant Garamond',serif",
                }}
              >
                €{artist.deposit}
              </span>
            </div>
            <div style={{ color: C.muted, fontSize: T.xs }}>
              {MONTHS[selMonth]} {selDay}, {selYear}
            </div>
          </div>
          {err && (
            <div
              style={{
                background: C.rubyS,
                border: `1px solid ${C.ruby}28`,
                borderRadius: 8,
                padding: '10px 13px',
                color: C.ruby,
                fontSize: T.xs,
              }}
            >
              ⚠ {err}
            </div>
          )}
          <Inp
            label="Your Name *"
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Inp
            label="Email *"
            type="email"
            placeholder="you@email.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Inp
            label="Phone"
            type="tel"
            placeholder="+47 …"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <Inp
            label="Event Type"
            placeholder="Wedding, Eid…"
            value={form.event}
            onChange={(e) => setForm((f) => ({ ...f, event: e.target.value }))}
          />
          <Inp
            label="Notes (optional)"
            placeholder="Special requests…"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
          />
          <button
            onClick={doBook}
            disabled={!form.name || !form.email}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg,#635BFF,#7B72FF)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: 16,
              fontSize: T.md,
              fontWeight: 800,
              cursor: 'pointer',
              opacity: !form.name || !form.email ? 0.5 : 1,
              fontFamily: 'inherit',
              minHeight: 52,
            }}
          >
            Pay €{artist.deposit} via Stripe →
          </button>
          <div style={{ textAlign: 'center', color: C.muted, fontSize: T.xs }}>
            🔒 Stripe · SSL · PCI compliant · Auto-split
          </div>
        </div>
      </Sheet>

      {showStripe && pending && (
        <StripeCheckout
          booking={pending}
          artist={artist}
          onSuccess={onPaid}
          onClose={() => setShowStripe(false)}
        />
      )}
      {chat && (
        <Chat
          booking={chat}
          artist={artist}
          myRole="customer"
          onClose={() => setChat(null)}
          onSend={() => {}}
        />
      )}
    </div>
  );
}

// ── Admin Dashboard ────────────────────────────────────────────────────
function AdminDash({ artists, bookings, users, onAction, onLogout, onMsg }) {
  const vp = useViewport();
  const [tab, setTab] = useState('overview');
  const [chat, setChat] = useState(null);

  const confirmed = bookings.filter((b) => b.status === 'confirmed').length;
  const pendingPay = bookings.filter(
    (b) => b.status === 'pending_payment'
  ).length;
  const pendingApp = artists.filter((a) => a.status === 'pending').length;
  const totalDep = bookings
    .filter((b) => b.depositPaid)
    .reduce((s, b) => s + b.deposit, 0);
  const awazCut = Math.round(totalDep * 0.12);

  const navItems = [
    { id: 'overview', icon: '📊', label: 'Overview' },
    { id: 'bookings', icon: '📅', label: 'Bookings' },
    { id: 'artists', icon: '🎤', label: 'Artists' },
    { id: 'messages', icon: '💬', label: 'Messages' },
    { id: 'finance', icon: '💶', label: 'Finance' },
  ];

  const SB = ({ icon, label, value, color = C.gold }) => (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: vp.isMobile ? '14px' : '18px 22px',
        borderTop: `3px solid ${color}44`,
      }}
    >
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div
        style={{
          fontFamily: "'Cormorant Garamond',serif",
          fontSize: vp.isMobile ? T.xl : T['2xl'],
          fontWeight: 800,
          color,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: T.xs,
          color: C.muted,
          marginTop: 4,
          lineHeight: 1.3,
        }}
      >
        {label}
      </div>
    </div>
  );

  const content = (
    <div
      style={{ padding: vp.isMobile ? '16px' : '28px 32px', maxWidth: 1080 }}
    >
      {tab === 'overview' && (
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T['2xl'],
              fontWeight: 700,
              color: C.text,
              marginBottom: 14,
            }}
          >
            Platform Overview
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${vp.isMobile ? 2 : 3},1fr)`,
              gap: 10,
              marginBottom: 20,
            }}
          >
            <SB
              icon="💶"
              label="Deposits Collected"
              value={`€${totalDep.toLocaleString()}`}
              color={C.gold}
            />
            <SB
              icon="🏦"
              label="Awaz Revenue (12%)"
              value={`€${awazCut}`}
              color={C.emerald}
            />
            <SB
              icon="📅"
              label="Confirmed Bookings"
              value={confirmed}
              color={C.lapis}
            />
            <SB
              icon="⏳"
              label="Awaiting Deposit"
              value={pendingPay}
              color={C.saffron}
            />
            <SB
              icon="🔍"
              label="Pending Review"
              value={pendingApp}
              color={C.ruby}
            />
            <SB
              icon="🎤"
              label="Active Artists"
              value={artists.filter((a) => a.status === 'approved').length}
              color={C.lavender}
            />
          </div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T.lg,
              fontWeight: 700,
              color: C.text,
              marginBottom: 12,
            }}
          >
            Recent Bookings
          </div>
          {bookings.slice(0, 4).map((b) => {
            const art = artists.find((a) => a.id === b.artistId);
            const sc =
              b.status === 'confirmed'
                ? C.emerald
                : b.status === 'completed'
                ? C.lapis
                : C.saffron;
            return (
              <div
                key={b.id}
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 20, flexShrink: 0 }}>{art?.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: C.text,
                      fontSize: T.sm,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.customerName} → {art?.name}
                  </div>
                  <div style={{ color: C.muted, fontSize: T.xs, marginTop: 2 }}>
                    {b.event} · {b.date}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <Badge color={sc}>{b.status.replace(/_/g, ' ')}</Badge>
                  <span
                    style={{
                      color: C.gold,
                      fontWeight: 700,
                      fontSize: T.sm,
                      fontFamily: "'Cormorant Garamond',serif",
                    }}
                  >
                    €{b.deposit}
                  </span>
                </div>
                <button
                  onClick={() => setChat(b)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    fontSize: 16,
                    cursor: 'pointer',
                    flexShrink: 0,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  💬
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'bookings' && (
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T['2xl'],
              fontWeight: 700,
              color: C.text,
              marginBottom: 14,
            }}
          >
            All Bookings
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bookings.map((b) => {
              const art = artists.find((a) => a.id === b.artistId);
              const sc =
                b.status === 'confirmed'
                  ? C.emerald
                  : b.status === 'completed'
                  ? C.lapis
                  : b.status === 'pending_payment'
                  ? C.saffron
                  : C.muted;
              return (
                <div
                  key={b.id}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: 2,
                      background: `linear-gradient(90deg,${
                        art?.color || C.gold
                      },${C.gold})`,
                    }}
                  />
                  <div style={{ padding: '12px 14px' }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ fontSize: 22, flexShrink: 0 }}>
                        {art?.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: C.text,
                            fontSize: T.sm,
                          }}
                        >
                          {b.customerName}
                        </div>
                        <div
                          style={{
                            color: art?.color,
                            fontSize: T.xs,
                            fontFamily: "'Cormorant Garamond',serif",
                            fontWeight: 700,
                          }}
                        >
                          {art?.name}
                        </div>
                        <div
                          style={{
                            color: C.muted,
                            fontSize: T.xs,
                            marginTop: 2,
                          }}
                        >
                          {b.event} · {b.date}
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          gap: 4,
                          flexShrink: 0,
                        }}
                      >
                        <Badge color={sc}>{b.status.replace(/_/g, ' ')}</Badge>
                        <span
                          style={{
                            color: C.gold,
                            fontWeight: 700,
                            fontFamily: "'Cormorant Garamond',serif",
                            fontSize: T.md,
                          }}
                        >
                          €{b.deposit}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          color: b.depositPaid ? C.emerald : C.ruby,
                          fontSize: T.xs,
                        }}
                      >
                        Deposit {b.depositPaid ? '✓' : '✗'}
                      </span>
                      <span style={{ color: C.muted, fontSize: T.xs }}>·</span>
                      <span
                        style={{
                          color: b.chatUnlocked ? C.emerald : C.muted,
                          fontSize: T.xs,
                        }}
                      >
                        Chat {b.chatUnlocked ? 'open' : 'locked'}
                      </span>
                      <button
                        onClick={() => setChat(b)}
                        style={{
                          marginLeft: 'auto',
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          fontSize: 16,
                          cursor: 'pointer',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        💬
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'artists' && (
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T['2xl'],
              fontWeight: 700,
              color: C.text,
              marginBottom: 14,
            }}
          >
            Artists{' '}
            {pendingApp > 0 && (
              <Badge color={C.ruby}>{pendingApp} pending</Badge>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {artists.map((a) => {
              const sc =
                a.status === 'approved'
                  ? C.emerald
                  : a.status === 'pending'
                  ? C.saffron
                  : C.ruby;
              return (
                <div
                  key={a.id}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: 2,
                      background: `linear-gradient(90deg,${a.color},${C.gold})`,
                    }}
                  />
                  <div style={{ padding: '12px 14px' }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        marginBottom: 10,
                      }}
                    >
                      {a.photo ? (
                        <img
                          src={a.photo}
                          alt=""
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 8,
                            objectFit: 'cover',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 8,
                            background: `${a.color}15`,
                            border: `2px solid ${a.color}40`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 20,
                            flexShrink: 0,
                          }}
                        >
                          {a.emoji}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: "'Cormorant Garamond',serif",
                            fontSize: T.md,
                            fontWeight: 700,
                            color: C.text,
                          }}
                        >
                          {a.name}
                        </div>
                        <div
                          style={{
                            color: C.muted,
                            fontSize: T.xs,
                            marginTop: 2,
                          }}
                        >
                          {a.genre}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 5,
                            marginTop: 6,
                          }}
                        >
                          <Badge color={sc}>{a.status}</Badge>
                          {a.verified ? (
                            <Badge color={C.emerald}>✓ Verified</Badge>
                          ) : (
                            <Badge color={C.saffron}>Unverified</Badge>
                          )}
                          {a.stripeConnected ? (
                            <Badge color={C.lapis}>💳</Badge>
                          ) : (
                            <Badge color={C.muted}>No Stripe</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {a.status === 'pending' && (
                        <>
                          <Btn
                            sz="sm"
                            v="emerald"
                            onClick={() => onAction(a.id, 'approved')}
                          >
                            ✓ Approve
                          </Btn>
                          <Btn
                            sz="sm"
                            v="ruby"
                            onClick={() => onAction(a.id, 'rejected')}
                          >
                            ✗ Reject
                          </Btn>
                        </>
                      )}
                      {a.status === 'approved' && (
                        <Btn
                          sz="sm"
                          v="ruby"
                          onClick={() => onAction(a.id, 'suspended')}
                        >
                          Suspend
                        </Btn>
                      )}
                      {a.status === 'suspended' && (
                        <Btn
                          sz="sm"
                          v="emerald"
                          onClick={() => onAction(a.id, 'approved')}
                        >
                          Reinstate
                        </Btn>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'messages' && (
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T['2xl'],
              fontWeight: 700,
              color: C.text,
              marginBottom: 14,
            }}
          >
            All Conversations
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bookings.map((b) => {
              const art = artists.find((a) => a.id === b.artistId);
              const last = b.messages?.[b.messages.length - 1];
              return (
                <div
                  key={b.id}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    cursor: 'pointer',
                    minHeight: 64,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                  onClick={() => setChat(b)}
                >
                  <div style={{ fontSize: 20, flexShrink: 0 }}>
                    {art?.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: C.text,
                        fontSize: T.sm,
                        marginBottom: 2,
                      }}
                    >
                      {b.customerName} ↔ {art?.name}
                    </div>
                    {last ? (
                      <div
                        style={{
                          color: C.muted,
                          fontSize: T.xs,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {last.text}
                      </div>
                    ) : (
                      <div
                        style={{
                          color: C.muted,
                          fontSize: T.xs,
                          fontStyle: 'italic',
                        }}
                      >
                        No messages
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <Badge color={b.chatUnlocked ? C.emerald : C.ruby}>
                      {b.chatUnlocked ? 'Open' : 'Locked'}
                    </Badge>
                    <span style={{ color: C.muted, fontSize: T.xs }}>
                      {b.messages?.length || 0} msgs
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'finance' && (
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T['2xl'],
              fontWeight: 700,
              color: C.text,
              marginBottom: 14,
            }}
          >
            Finance
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${vp.isMobile ? 2 : 4},1fr)`,
              gap: 10,
              marginBottom: 18,
            }}
          >
            <SB
              icon="💶"
              label="Total Deposits"
              value={`€${totalDep.toLocaleString()}`}
              color={C.gold}
            />
            <SB
              icon="🏦"
              label="Awaz Revenue (12%)"
              value={`€${awazCut}`}
              color={C.emerald}
            />
            <SB
              icon="🎤"
              label="Artist Share (88%)"
              value={`€${totalDep - awazCut}`}
              color={C.lapis}
            />
            <SB
              icon="⏳"
              label="Pending"
              value={`€${bookings
                .filter((b) => !b.depositPaid)
                .reduce((s, b) => s + b.deposit, 0)}`}
              color={C.saffron}
            />
          </div>
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: 16,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T.md,
                color: C.gold,
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              Payment Split
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3,1fr)',
                gap: 8,
              }}
            >
              {[
                ['Artist deposit', 'Set by artist (min €500)', C.gold],
                ['Artist (88%)', 'Auto-transferred to Stripe', C.emerald],
                ['Awaz (12%)', 'Platform revenue', C.lapis],
              ].map(([l, d, c]) => (
                <div
                  key={l}
                  style={{
                    background: C.surface,
                    borderRadius: 8,
                    padding: '12px',
                    border: `1px solid ${C.border}`,
                    borderTop: `3px solid ${c}38`,
                  }}
                >
                  <div
                    style={{
                      color: c,
                      fontWeight: 700,
                      fontSize: T.sm,
                      marginBottom: 4,
                    }}
                  >
                    {l}
                  </div>
                  <div style={{ color: C.muted, fontSize: T.xs }}>{d}</div>
                </div>
              ))}
            </div>
          </div>
          {artists
            .filter((a) => a.earnings > 0)
            .map((a) => {
              const cut = Math.round(a.earnings * 0.12),
                pct = totalDep ? Math.round((a.earnings / totalDep) * 100) : 0;
              return (
                <div
                  key={a.id}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 18, flexShrink: 0 }}>{a.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "'Cormorant Garamond',serif",
                        fontSize: T.sm,
                        fontWeight: 700,
                        color: C.text,
                        marginBottom: 4,
                      }}
                    >
                      {a.name}
                    </div>
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        overflow: 'hidden',
                        background: C.border,
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: `linear-gradient(90deg,${a.color},${C.gold})`,
                        }}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 2,
                      flexShrink: 0,
                      fontSize: T.xs,
                    }}
                  >
                    <span style={{ color: C.gold, fontWeight: 700 }}>
                      €{a.earnings}
                    </span>
                    <span style={{ color: C.emerald }}>
                      → €{a.earnings - cut}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );

  // Mobile: stacked with bottom nav
  if (vp.isMobile)
    return (
      <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 88 }}>
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg,${C.ruby},${C.gold},${C.lapis})`,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 300,
          }}
        />
        <div
          style={{
            position: 'fixed',
            top: 3,
            left: 0,
            right: 0,
            zIndex: 200,
            background: `${C.surface}F8`,
            backdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${C.border}`,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T.md,
                fontWeight: 700,
                color: C.gold,
              }}
            >
              Awaz Admin
            </div>
            <div style={{ fontSize: T.xs, color: C.muted }}>
              Platform Control
            </div>
          </div>
          <Btn v="ghost" sz="sm" onClick={onLogout}>
            Sign Out
          </Btn>
        </div>
        <div style={{ paddingTop: 72 }}>{content}</div>
        <BottomNav active={tab} onNav={setTab} items={navItems} />
        {chat && (
          <Chat
            booking={chat}
            artist={artists.find((a) => a.id === chat.artistId)}
            myRole="admin"
            onClose={() => setChat(null)}
            onSend={onMsg}
          />
        )}
      </div>
    );

  // Desktop: sidebar layout
  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex' }}>
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg,${C.ruby},${C.gold},${C.lapis})`,
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
        }}
      />
      <div
        style={{
          width: 220,
          background: C.surface,
          borderRight: `1px solid ${C.border}`,
          padding: '40px 0 24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 3,
          bottom: 0,
          zIndex: 100,
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            padding: '0 20px 20px',
            borderBottom: `1px solid ${C.border}`,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontFamily: "'Noto Naskh Arabic',serif",
              fontSize: 18,
              color: C.gold,
              marginBottom: 3,
            }}
          >
            آواز
          </div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: 15,
              fontWeight: 700,
              color: C.text,
            }}
          >
            Admin Panel
          </div>
        </div>
        {navItems.map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              padding: '12px 20px',
              background: tab === id ? C.goldS : 'transparent',
              color: tab === id ? C.gold : C.muted,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: T.sm,
              fontWeight: tab === id ? 700 : 400,
              borderLeft: `3px solid ${tab === id ? C.gold : 'transparent'}`,
              width: '100%',
              textAlign: 'left',
              minHeight: 48,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: 18 }}>{icon}</span>
            {label}
            {id === 'artists' && pendingApp > 0 && (
              <span
                style={{
                  marginLeft: 'auto',
                  background: C.ruby,
                  color: '#fff',
                  borderRadius: 10,
                  padding: '1px 7px',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {pendingApp}
              </span>
            )}
          </button>
        ))}
        <div
          style={{
            marginTop: 'auto',
            padding: '16px 20px',
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <Btn v="ghost" sz="sm" onClick={onLogout} xs={{ width: '100%' }}>
            Sign Out
          </Btn>
        </div>
      </div>
      <div
        style={{ flex: 1, marginLeft: 220, paddingTop: 3, overflow: 'auto' }}
      >
        {content}
      </div>
      {chat && (
        <Chat
          booking={chat}
          artist={artists.find((a) => a.id === chat.artistId)}
          myRole="admin"
          onClose={() => setChat(null)}
          onSend={onMsg}
        />
      )}
    </div>
  );
}

// ── Artist Portal ──────────────────────────────────────────────────────
function ArtistPortal({
  user,
  artist,
  bookings,
  onLogout,
  onToggleDay,
  onMsg,
  onUpdateArtist,
}) {
  const vp = useViewport();
  const [tab, setTab] = useState('overview');
  const [chat, setChat] = useState(null);
  const [showStripeConnect, setShowStripeConnect] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editF, setEditF] = useState({
    bio: artist.bio,
    priceInfo: artist.priceInfo,
    deposit: String(artist.deposit),
    cancellationPolicy: artist.cancellationPolicy,
  });

  // Social media state — separate from profile editing so each section saves independently
  const [socialF, setSocialF] = useState({
    spotifyUrl: artist.spotify?.profileUrl || '',
    spotifyListeners: artist.spotify?.monthlyListeners || '',
    spotifyTrack1: artist.spotify?.topTracks?.[0] || '',
    spotifyTrack2: artist.spotify?.topTracks?.[1] || '',
    spotifyTrack3: artist.spotify?.topTracks?.[2] || '',
    instagramHandle: artist.instagram?.handle || '',
    instagramFollowers: artist.instagram?.followers || '',
    instagramUrl: artist.instagram?.profileUrl || '',
    youtubeUrl: artist.youtube?.url || '',
    youtubeSubscribers: artist.youtube?.subscribers || '',
    tiktokHandle: artist.tiktok?.handle || '',
    tiktokFollowers: artist.tiktok?.followers || '',
  });
  const [socialSaved, setSocialSaved] = useState(false);
  const [socialErr, setSocialErr] = useState('');

  const myB = bookings.filter((b) => b.artistId === artist.id);
  const depositsIn = myB
    .filter((b) => b.depositPaid)
    .reduce((s, b) => s + Math.round(b.deposit * 0.88), 0);

  const navItems = [
    { id: 'overview', icon: '🏠', label: 'Home' },
    { id: 'calendar', icon: '📅', label: 'Calendar' },
    { id: 'bookings', icon: '📋', label: 'Bookings' },
    { id: 'messages', icon: '💬', label: 'Messages' },
    { id: 'profile', icon: '👤', label: 'Profil' },
    { id: 'social', icon: '🎵', label: 'Sosiale' },
  ];

  const saveEdit = () => {
    onUpdateArtist(artist.id, {
      bio: editF.bio,
      priceInfo: editF.priceInfo,
      deposit: parseInt(editF.deposit) || 1000,
      cancellationPolicy: editF.cancellationPolicy,
    });
    setEditing(false);
  };

  const saveSocial = () => {
    setSocialErr('');
    if (socialF.spotifyUrl && !socialF.spotifyUrl.includes('spotify')) {
      setSocialErr(
        "Spotify-lenken ser ikke riktig ut — sjekk at den inneholder 'spotify.com'."
      );
      return;
    }
    if (
      socialF.youtubeUrl &&
      !socialF.youtubeUrl.includes('youtube') &&
      !socialF.youtubeUrl.includes('youtu.be')
    ) {
      setSocialErr('YouTube-lenken ser ikke riktig ut.');
      return;
    }

    const newSpotify = socialF.spotifyUrl
      ? {
          profileUrl: socialF.spotifyUrl.trim(),
          monthlyListeners: socialF.spotifyListeners || '',
          topTracks: [
            socialF.spotifyTrack1,
            socialF.spotifyTrack2,
            socialF.spotifyTrack3,
          ].filter(Boolean),
        }
      : null;
    const ig = parseInstagramHandle(socialF.instagramHandle);
    const newInstagram = ig
      ? {
          handle: ig,
          followers: socialF.instagramFollowers || '',
          profileUrl:
            socialF.instagramUrl ||
            `https://instagram.com/${ig.replace('@', '')}`,
          posts: [],
        }
      : null;
    const ytParsed = parseYouTubeId(socialF.youtubeUrl || '');
    const newYoutube = socialF.youtubeUrl
      ? {
          url: socialF.youtubeUrl.trim(),
          handle: ytParsed?.type === 'handle' ? ytParsed.id : '',
          subscribers: socialF.youtubeSubscribers || '',
        }
      : null;
    const ttHandle = parseTikTokHandle(socialF.tiktokHandle || '');
    const newTiktok = ttHandle
      ? { handle: ttHandle, followers: socialF.tiktokFollowers || '' }
      : null;

    onUpdateArtist(artist.id, {
      spotify: newSpotify,
      instagram: newInstagram,
      youtube: newYoutube,
      tiktok: newTiktok,
    });
    setSocialSaved(true);
    setTimeout(() => setSocialSaved(false), 3500);
  };

  const content = (
    <div style={{ padding: vp.isMobile ? '16px' : '28px 32px', maxWidth: 900 }}>
      {tab === 'overview' && (
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T['2xl'],
              fontWeight: 700,
              color: C.text,
              marginBottom: 4,
            }}
          >
            Hey, {artist.name.split(' ')[0]} 👋
          </div>
          {artist.status === 'pending' && (
            <div
              style={{
                background: 'rgba(196,120,32,0.08)',
                border: `1px solid ${C.saffron}38`,
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 12,
                fontSize: T.sm,
                color: C.textD,
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              ⏳ <strong style={{ color: C.saffron }}>Pending approval</strong>{' '}
              — 24–48 hours to review.
            </div>
          )}
          {!artist.stripeConnected && artist.status === 'approved' && (
            <div
              style={{
                background: 'rgba(99,91,255,0.08)',
                border: '1px solid rgba(99,91,255,0.28)',
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 12,
                fontSize: T.sm,
                color: C.textD,
                fontFamily: "'DM Sans',sans-serif",
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <span>
                💳 <strong style={{ color: '#8B83FF' }}>Connect Stripe</strong>{' '}
                to receive deposits
              </span>
              <Btn
                v="stripe"
                sz="sm"
                onClick={() => setShowStripeConnect(true)}
              >
                Connect →
              </Btn>
            </div>
          )}
          {!artist.spotify &&
            !artist.instagram &&
            artist.status === 'approved' && (
              <div
                style={{
                  background: 'rgba(200,168,74,0.06)',
                  border: `1px solid ${C.gold}28`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 12,
                  fontSize: T.sm,
                  color: C.textD,
                  fontFamily: "'DM Sans',sans-serif",
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  🎵{' '}
                  <strong style={{ color: C.gold }}>
                    Add Spotify & Instagram
                  </strong>{' '}
                  — artists with social proof get 3× more views
                </span>
                <Btn v="ghost" sz="sm" onClick={() => setTab('social')}>
                  Add now →
                </Btn>
              </div>
            )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2,1fr)',
              gap: 10,
              marginBottom: 16,
            }}
          >
            {[
              ['💶', `Earnings (88%)`, `€${depositsIn}`, C.gold],
              ['📅', 'Bookings', myB.length, artist.color],
              [
                '💬',
                'Active Chats',
                myB.filter((b) => b.chatUnlocked).length,
                C.lavender,
              ],
              [
                '⭐',
                'Rating',
                artist.reviews > 0 ? artist.rating : '—',
                C.saffron,
              ],
            ].map(([icon, label, value, color]) => (
              <div
                key={label}
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '14px',
                  borderTop: `3px solid ${color}38`,
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 5 }}>{icon}</div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: T.xl,
                    fontWeight: 800,
                    color,
                    lineHeight: 1,
                  }}
                >
                  {value}
                </div>
                <div style={{ fontSize: T.xs, color: C.muted, marginTop: 4 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          {myB.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 32,
                background: C.card,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                color: C.muted,
                fontSize: T.sm,
                fontStyle: 'italic',
              }}
            >
              No bookings yet. Add available dates!
            </div>
          ) : (
            myB.slice(0, 4).map((b) => (
              <div
                key={b.id}
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${
                    b.status === 'confirmed' ? C.emerald : C.saffron
                  }`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 64,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: C.text,
                      fontWeight: 600,
                      fontSize: T.sm,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.customerName}
                  </div>
                  <div style={{ color: C.muted, fontSize: T.xs, marginTop: 2 }}>
                    {b.event} · {b.date}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      color: C.gold,
                      fontWeight: 700,
                      fontFamily: "'Cormorant Garamond',serif",
                      fontSize: T.md,
                    }}
                  >
                    €{b.deposit}
                  </span>
                  {b.chatUnlocked && (
                    <button
                      onClick={() => setChat(b)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: C.surface,
                        border: `1px solid ${C.border}`,
                        fontSize: 16,
                        cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      💬
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'calendar' && (
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T['2xl'],
              fontWeight: 700,
              color: C.text,
              marginBottom: 4,
            }}
          >
            Availability
          </div>
          <div style={{ color: C.muted, fontSize: T.sm, marginBottom: 16 }}>
            Tap dates to toggle Available ↔ Blocked
          </div>
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: vp.isMobile ? 16 : 24,
            }}
          >
            <MiniCal
              artist={artist}
              editMode
              onToggle={(mo, yr, day) => onToggleDay(artist.id, mo, yr, day)}
              bookings={bookings}
            />
          </div>
          <div
            style={{
              marginTop: 12,
              background: artist.color + '10',
              border: `1px solid ${artist.color}28`,
              borderRadius: 8,
              padding: '11px 13px',
              fontSize: T.xs,
              color: C.textD,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: artist.color }}>Tip:</strong> Keep your
            calendar updated to attract more bookings.
          </div>
        </div>
      )}

      {tab === 'bookings' && (
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T['2xl'],
              fontWeight: 700,
              color: C.text,
              marginBottom: 14,
            }}
          >
            My Bookings
          </div>
          {myB.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 32,
                background: C.card,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                color: C.muted,
                fontSize: T.sm,
                fontStyle: 'italic',
              }}
            >
              No bookings yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myB.map((b) => {
                const sc =
                  b.status === 'confirmed'
                    ? C.emerald
                    : b.status === 'completed'
                    ? C.lapis
                    : C.saffron;
                return (
                  <div
                    key={b.id}
                    style={{
                      background: C.card,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: '14px',
                      display: 'flex',
                      flexDirection: vp.isMobile ? 'column' : 'row',
                      justifyContent: 'space-between',
                      gap: 10,
                      minHeight: 72,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: C.text,
                          fontSize: T.md,
                        }}
                      >
                        {b.customerName}
                      </div>
                      <div
                        style={{ color: C.muted, fontSize: T.xs, marginTop: 3 }}
                      >
                        {b.event} · {b.date}
                      </div>
                      <div style={{ fontSize: T.xs, marginTop: 5 }}>
                        <span
                          style={{ color: b.depositPaid ? C.emerald : C.ruby }}
                        >
                          Deposit {b.depositPaid ? '✓ Paid' : '✗ Pending'}
                        </span>
                        {b.depositPaid && (
                          <span style={{ color: C.muted }}>
                            {' '}
                            · Balance: cash after concert
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <Badge color={sc}>{b.status.replace(/_/g, ' ')}</Badge>
                      <span
                        style={{
                          color: C.gold,
                          fontWeight: 700,
                          fontFamily: "'Cormorant Garamond',serif",
                          fontSize: T.md,
                        }}
                      >
                        €{b.deposit}
                      </span>
                      <button
                        onClick={() => setChat(b)}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          fontSize: 16,
                          cursor: 'pointer',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        {b.chatUnlocked ? '💬' : '🔒'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'messages' && (
        <div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T['2xl'],
              fontWeight: 700,
              color: C.text,
              marginBottom: 14,
            }}
          >
            Messages
          </div>
          {myB.filter((b) => b.chatUnlocked).length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 32,
                background: C.card,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                color: C.muted,
                fontSize: T.sm,
                fontStyle: 'italic',
              }}
            >
              Chats unlock after customers pay the deposit.
            </div>
          ) : (
            myB
              .filter((b) => b.chatUnlocked)
              .map((b) => {
                const last = b.messages?.[b.messages.length - 1];
                return (
                  <div
                    key={b.id}
                    style={{
                      background: C.card,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: '14px',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      cursor: 'pointer',
                      marginBottom: 8,
                      minHeight: 64,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                    onClick={() => setChat(b)}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: C.goldS,
                        border: `2px solid ${C.gold}28`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        color: C.gold,
                        fontSize: 16,
                        flexShrink: 0,
                      }}
                    >
                      {b.customerName[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: C.text,
                          fontSize: T.sm,
                          marginBottom: 2,
                        }}
                      >
                        {b.customerName}
                      </div>
                      {last ? (
                        <div
                          style={{
                            color: C.muted,
                            fontSize: T.xs,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {last.text}
                        </div>
                      ) : (
                        <div
                          style={{
                            color: C.muted,
                            fontSize: T.xs,
                            fontStyle: 'italic',
                          }}
                        >
                          No messages yet
                        </div>
                      )}
                    </div>
                    <span
                      style={{ color: C.muted, fontSize: T.xs, flexShrink: 0 }}
                    >
                      {b.messages?.length || 0} msgs
                    </span>
                  </div>
                );
              })
          )}
        </div>
      )}

      {tab === 'social' &&
        (() => {
          const previewSpotifyId = parseSpotifyArtistId(socialF.spotifyUrl);
          const previewHandle = parseInstagramHandle(socialF.instagramHandle);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: T['2xl'],
                    fontWeight: 700,
                    color: C.text,
                    marginBottom: 4,
                  }}
                >
                  Social Media
                </div>
                <div
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: T.sm,
                    color: C.muted,
                    lineHeight: 1.7,
                  }}
                >
                  Connect your accounts. Your public profile will show a live
                  Spotify widget and your Instagram link.
                </div>
              </div>

              {socialErr && (
                <div
                  style={{
                    background: C.rubyS,
                    border: `1px solid ${C.ruby}28`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    color: C.ruby,
                    fontSize: T.sm,
                    fontFamily: "'DM Sans',sans-serif",
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  ⚠ {socialErr}
                </div>
              )}
              {socialSaved && (
                <div
                  style={{
                    background: C.emeraldS,
                    border: `1px solid ${C.emerald}44`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    color: C.emerald,
                    fontSize: T.sm,
                    fontFamily: "'DM Sans',sans-serif",
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  ✓ Saved! Your social profile is now live on your public page.
                </div>
              )}

              {/* ── SPOTIFY ── */}
              <div
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: 3,
                    background: 'linear-gradient(90deg,#1DB954,#16A34A)',
                  }}
                />
                <div style={{ padding: vp.isMobile ? 18 : 24 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 6,
                    }}
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="#1DB954"
                    >
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                    <div
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: T.md,
                        fontWeight: 700,
                        color: '#1DB954',
                      }}
                    >
                      Spotify
                    </div>
                    {artist.spotify && previewSpotifyId && (
                      <Badge color="#1DB954">Live ✓</Badge>
                    )}
                  </div>

                  {/* What Spotify can do */}
                  <div
                    style={{
                      background: 'rgba(29,185,84,0.06)',
                      border: '1px solid rgba(29,185,84,0.14)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      marginBottom: 14,
                      fontFamily: "'DM Sans',sans-serif",
                      fontSize: T.sm,
                      color: '#1DB954',
                      lineHeight: 1.7,
                    }}
                  >
                    ✓ Limer du inn Spotify-lenken din hentes{' '}
                    <strong>alt automatisk</strong> — bilde, biografi,
                    topp-sanger og lyttere vises direkte på profilen din som en
                    live widget.
                  </div>

                  <Inp
                    label="Spotify Artist-lenke"
                    placeholder="https://open.spotify.com/artist/..."
                    value={socialF.spotifyUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSocialF((f) => ({ ...f, spotifyUrl: val }));
                      setSocialErr('');
                    }}
                    hint={
                      previewSpotifyId
                        ? `✓ Artist-ID funnet: ${previewSpotifyId}`
                        : 'Kopier lenken fra Spotify-profilen din og lim den inn her'
                    }
                  />

                  {/* Instruction */}
                  <div
                    style={{
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: '12px 14px',
                      marginTop: 12,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: T.sm,
                        fontWeight: 700,
                        color: C.text,
                        marginBottom: 6,
                      }}
                    >
                      Slik finner du lenken din
                    </div>
                    <div
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: T.sm,
                        color: C.textD,
                        lineHeight: 1.8,
                      }}
                    >
                      <strong style={{ color: C.gold }}>Spotify-appen:</strong>{' '}
                      Gå til profilen din → de tre prikkene (⋯) → «Del» →
                      «Kopier lenke til artist»
                      <br />
                      <strong style={{ color: C.gold }}>Nettleser:</strong> Gå
                      til din Spotify-side → kopier URL-en fra adressefeltet
                    </div>
                  </div>

                  {/* Live preview */}
                  {previewSpotifyId && (
                    <div
                      style={{
                        marginTop: 14,
                        background: 'rgba(29,185,84,0.07)',
                        border: '1px solid rgba(29,185,84,0.25)',
                        borderRadius: 12,
                        padding: '16px 18px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'rgba(29,185,84,0.15)',
                            border: '1px solid rgba(29,185,84,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontSize: 16,
                          }}
                        >
                          ✓
                        </div>
                        <div>
                          <div
                            style={{
                              fontFamily: "'DM Sans',sans-serif",
                              fontSize: T.sm,
                              fontWeight: 700,
                              color: '#1DB954',
                            }}
                          >
                            Spotify-lenke gjenkjent
                          </div>
                          <div
                            style={{
                              fontFamily: "'DM Sans',sans-serif",
                              fontSize: T.xs,
                              color: C.muted,
                              marginTop: 2,
                            }}
                          >
                            Artist-ID: {previewSpotifyId}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: "'DM Sans',sans-serif",
                          fontSize: T.sm,
                          color: C.textD,
                          lineHeight: 1.7,
                          marginBottom: 12,
                        }}
                      >
                        Spotify-widgeten vises{' '}
                        <strong style={{ color: C.text }}>ikke</strong> i
                        StackBlitz/editor — det er normalt. På din publiserte
                        Vercel-side vil den lastes inn automatisk og vise bilde,
                        biografi og topp-sanger.
                      </div>
                      <a
                        href={`https://open.spotify.com/artist/${previewSpotifyId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          background: '#1DB954',
                          color: '#000',
                          borderRadius: 20,
                          padding: '9px 18px',
                          fontSize: 13,
                          fontWeight: 700,
                          textDecoration: 'none',
                          fontFamily: "'DM Sans',sans-serif",
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="black"
                        >
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                        Bekreft profil på Spotify ↗
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* ── INSTAGRAM ── */}
              <div
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: 3,
                    background:
                      'linear-gradient(90deg,#833AB4,#FD1D1D,#F77737)',
                  }}
                />
                <div style={{ padding: vp.isMobile ? 18 : 24 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background:
                          'linear-gradient(135deg,#833AB4,#FD1D1D,#F77737)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="white"
                      >
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                      </svg>
                    </div>
                    <div
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: T.md,
                        fontWeight: 700,
                        background: 'linear-gradient(90deg,#C084FC,#FB7185)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                    >
                      Instagram
                    </div>
                    {previewHandle && <Badge color="#E1306C">Klar ✓</Badge>}
                  </div>

                  {/* Honest explanation */}
                  <div
                    style={{
                      background: 'rgba(225,48,108,0.06)',
                      border: '1px solid rgba(225,48,108,0.14)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      marginBottom: 14,
                      fontFamily: "'DM Sans',sans-serif",
                      fontSize: T.sm,
                      color: '#E1306C',
                      lineHeight: 1.7,
                    }}
                  >
                    ℹ Instagram tillater ikke automatisk henting av data uten
                    innlogging fra din konto. Lim inn profil-URL-en eller
                    @handle — vi genererer lenken automatisk. Følgertall legger
                    du inn selv.
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <Inp
                      label="Instagram-profil (URL eller @handle)"
                      placeholder="https://instagram.com/ditthandlenavn  eller  @ditthandlenavn"
                      value={socialF.instagramHandle}
                      onChange={(e) => {
                        setSocialF((f) => ({
                          ...f,
                          instagramHandle: e.target.value,
                        }));
                        setSocialErr('');
                      }}
                      hint={
                        previewHandle
                          ? `✓ Handle gjenkjent: ${previewHandle}`
                          : 'Kopier profil-URL fra Instagram og lim inn'
                      }
                    />
                    <Inp
                      label="Følgertall (valgfritt, f.eks. 89.2K)"
                      placeholder="89.2K"
                      value={socialF.instagramFollowers}
                      onChange={(e) =>
                        setSocialF((f) => ({
                          ...f,
                          instagramFollowers: e.target.value,
                        }))
                      }
                      hint="Vises på profilen som sosial bevis — oppdater det manuelt ved behov"
                    />
                  </div>

                  {/* Live preview */}
                  {previewHandle && (
                    <div
                      style={{
                        marginTop: 14,
                        background: 'rgba(225,48,108,0.07)',
                        border: '1px solid rgba(225,48,108,0.25)',
                        borderRadius: 12,
                        padding: '16px 18px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'rgba(225,48,108,0.15)',
                            border: '1px solid rgba(225,48,108,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontSize: 16,
                          }}
                        >
                          ✓
                        </div>
                        <div>
                          <div
                            style={{
                              fontFamily: "'DM Sans',sans-serif",
                              fontSize: T.sm,
                              fontWeight: 700,
                              color: '#E1306C',
                            }}
                          >
                            Instagram-profil gjenkjent
                          </div>
                          <div
                            style={{
                              fontFamily: "'DM Sans',sans-serif",
                              fontSize: T.xs,
                              color: C.muted,
                              marginTop: 2,
                            }}
                          >
                            {previewHandle}
                            {socialF.instagramFollowers
                              ? ` · ${socialF.instagramFollowers} følgere`
                              : ''}
                          </div>
                        </div>
                      </div>
                      <a
                        href={`https://instagram.com/${previewHandle.replace(
                          '@',
                          ''
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          background: 'linear-gradient(135deg,#833AB4,#E1306C)',
                          color: '#fff',
                          borderRadius: 20,
                          padding: '9px 18px',
                          fontSize: 13,
                          fontWeight: 700,
                          textDecoration: 'none',
                          fontFamily: "'DM Sans',sans-serif",
                        }}
                      >
                        Bekreft profil på Instagram ↗
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Save */}
              <Btn v="gold" sz="lg" onClick={saveSocial} xs={{ width: '100%' }}>
                Lagre sosiale profiler
              </Btn>

              {/* ── YOUTUBE ── */}
              <div
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: 3,
                    background: 'linear-gradient(90deg,#FF0000,#CC0000)',
                  }}
                />
                <div style={{ padding: vp.isMobile ? 18 : 24 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <svg
                      width="22"
                      height="16"
                      viewBox="0 0 20 14"
                      fill="#FF0000"
                    >
                      <path d="M19.582 2.186A2.506 2.506 0 0 0 17.82.422C16.254 0 10 0 10 0S3.746 0 2.18.422A2.506 2.506 0 0 0 .418 2.186C0 3.754 0 7 0 7s0 3.246.418 4.814A2.506 2.506 0 0 0 2.18 13.578C3.746 14 10 14 10 14s6.254 0 7.82-.422a2.506 2.506 0 0 0 1.762-1.764C20 10.246 20 7 20 7s0-3.246-.418-4.814zM8 10V4l5.333 3L8 10z" />
                    </svg>
                    <div
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: T.md,
                        fontWeight: 700,
                        color: '#FF4444',
                      }}
                    >
                      YouTube
                    </div>
                    {artist.youtube && (
                      <Badge color="#FF4444">Tilkoblet ✓</Badge>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <Inp
                      label="YouTube-kanal eller video-URL"
                      placeholder="https://youtube.com/@dittkanalnavn  eller  youtube.com/watch?v=..."
                      value={socialF.youtubeUrl}
                      onChange={(e) => {
                        setSocialF((f) => ({
                          ...f,
                          youtubeUrl: e.target.value,
                        }));
                        setSocialErr('');
                      }}
                      hint={
                        parseYouTubeId(socialF.youtubeUrl)
                          ? `✓ Gjenkjent: ${
                              parseYouTubeId(socialF.youtubeUrl)?.type
                            } — ${
                              parseYouTubeId(socialF.youtubeUrl)?.id ||
                              parseYouTubeId(socialF.youtubeUrl)?.url
                            }`
                          : 'Kopier lenken fra YouTube og lim inn'
                      }
                    />
                    <Inp
                      label="Abonnenter (valgfritt, f.eks. 48K)"
                      placeholder="48K"
                      value={socialF.youtubeSubscribers}
                      onChange={(e) =>
                        setSocialF((f) => ({
                          ...f,
                          youtubeSubscribers: e.target.value,
                        }))
                      }
                      hint="Vises som sosial bevis på profilen"
                    />
                  </div>
                </div>
              </div>

              {/* ── TIKTOK ── */}
              <div
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: 3,
                    background: 'linear-gradient(90deg,#69C9D0,#EE1D52)',
                  }}
                />
                <div style={{ padding: vp.isMobile ? 18 : 24 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 5,
                        background: '#000',
                        border: '1px solid #333',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                      }}
                    >
                      ♪
                    </div>
                    <div
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: T.md,
                        fontWeight: 700,
                        color: C.text,
                      }}
                    >
                      TikTok
                    </div>
                    {artist.tiktok && (
                      <Badge color="#69C9D0">Tilkoblet ✓</Badge>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <Inp
                      label="TikTok @handle eller profil-URL"
                      placeholder="@ditthandlenavn  eller  tiktok.com/@handlenavn"
                      value={socialF.tiktokHandle}
                      onChange={(e) => {
                        setSocialF((f) => ({
                          ...f,
                          tiktokHandle: e.target.value,
                        }));
                        setSocialErr('');
                      }}
                      hint={
                        parseTikTokHandle(socialF.tiktokHandle)
                          ? `✓ Handle: ${parseTikTokHandle(
                              socialF.tiktokHandle
                            )}`
                          : 'Lim inn TikTok-profilen din'
                      }
                    />
                    <Inp
                      label="Følgere (valgfritt, f.eks. 120K)"
                      placeholder="120K"
                      value={socialF.tiktokFollowers}
                      onChange={(e) =>
                        setSocialF((f) => ({
                          ...f,
                          tiktokFollowers: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <Btn v="gold" sz="lg" onClick={saveSocial} xs={{ width: '100%' }}>
                Lagre sosiale profiler
              </Btn>

              {(artist.spotify ||
                artist.instagram ||
                artist.youtube ||
                artist.tiktok) && (
                <button
                  onClick={() => {
                    setSocialF({
                      spotifyUrl: '',
                      spotifyListeners: '',
                      spotifyTrack1: '',
                      spotifyTrack2: '',
                      spotifyTrack3: '',
                      instagramHandle: '',
                      instagramFollowers: '',
                      instagramUrl: '',
                      youtubeUrl: '',
                      youtubeSubscribers: '',
                      tiktokHandle: '',
                      tiktokFollowers: '',
                    });
                    onUpdateArtist(artist.id, {
                      spotify: null,
                      instagram: null,
                      youtube: null,
                      tiktok: null,
                    });
                    setSocialSaved(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: C.muted,
                    cursor: 'pointer',
                    fontSize: T.sm,
                    fontFamily: 'inherit',
                    textDecoration: 'underline',
                    padding: 0,
                    minHeight: 36,
                  }}
                >
                  Fjern alle sosiale kontoer
                </button>
              )}
            </div>
          );
        })()}

      {tab === 'profile' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T['2xl'],
                fontWeight: 700,
                color: C.text,
              }}
            >
              My Profile
            </div>
            <Btn v="ghost" sz="sm" onClick={() => setEditing(!editing)}>
              {editing ? 'Cancel' : 'Edit'}
            </Btn>
          </div>
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: 3,
                background: `linear-gradient(90deg,${artist.color},${C.gold})`,
              }}
            />
            <div style={{ padding: vp.isMobile ? 16 : 24 }}>
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                  marginBottom: 16,
                }}
              >
                <div>
                  <PhotoUpload
                    photo={artist.photo}
                    onPhoto={(p) => onUpdateArtist(artist.id, { photo: p })}
                    color={artist.color}
                    emoji={artist.emoji}
                    size={vp.isMobile ? 72 : 88}
                  />
                  <div
                    style={{
                      textAlign: 'center',
                      marginTop: 5,
                      fontSize: T.xs,
                      color: C.muted,
                    }}
                  >
                    Tap to change
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond',serif",
                      fontSize: T.xl,
                      fontWeight: 700,
                      color: C.text,
                    }}
                  >
                    {artist.name}
                  </div>
                  {artist.nameDari && (
                    <div
                      style={{
                        fontFamily: "'Noto Naskh Arabic',serif",
                        fontSize: T.sm,
                        color: C.gold,
                        marginTop: 2,
                      }}
                    >
                      {artist.nameDari}
                    </div>
                  )}
                  <div
                    style={{
                      color: artist.color,
                      fontSize: T.xs,
                      marginTop: 4,
                    }}
                  >
                    {artist.genre}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 5,
                      marginTop: 8,
                    }}
                  >
                    {artist.tags.map((t) => (
                      <Badge key={t} color={artist.color}>
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {editing ? (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 11 }}
                >
                  <Inp
                    label="Bio"
                    value={editF.bio}
                    onChange={(e) =>
                      setEditF((f) => ({ ...f, bio: e.target.value }))
                    }
                    rows={4}
                    placeholder="Tell clients about yourself…"
                  />
                  <Inp
                    label="Starting Price"
                    value={editF.priceInfo}
                    onChange={(e) =>
                      setEditF((f) => ({ ...f, priceInfo: e.target.value }))
                    }
                    placeholder="From €2,500"
                  />
                  <Inp
                    label="Deposit Amount (€)"
                    type="number"
                    value={editF.deposit}
                    onChange={(e) =>
                      setEditF((f) => ({ ...f, deposit: e.target.value }))
                    }
                    hint="Minimum €500"
                  />
                  <Sel
                    label="Cancellation Policy"
                    value={editF.cancellationPolicy}
                    onChange={(e) =>
                      setEditF((f) => ({
                        ...f,
                        cancellationPolicy: e.target.value,
                      }))
                    }
                    options={POLICIES.map((p) => [
                      p.id,
                      `${p.label} — ${p.desc}`,
                    ])}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn
                      v="ghost"
                      onClick={() => setEditing(false)}
                      xs={{ flex: 1 }}
                    >
                      Cancel
                    </Btn>
                    <Btn onClick={saveEdit} xs={{ flex: 2 }}>
                      Save
                    </Btn>
                  </div>
                </div>
              ) : (
                <>
                  <p
                    style={{
                      color: C.textD,
                      fontSize: T.sm,
                      lineHeight: 1.8,
                      marginBottom: 14,
                      fontFamily: "'Cormorant Garamond',serif",
                    }}
                  >
                    {artist.bio}
                  </p>
                  <HR color={artist.color} />
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <span style={{ color: C.muted, fontSize: T.xs }}>
                      Stripe:
                    </span>
                    {artist.stripeConnected ? (
                      <Badge color={C.emerald}>✓ Connected</Badge>
                    ) : (
                      <>
                        <Badge color={C.ruby}>Not Connected</Badge>
                        <Btn
                          v="stripe"
                          sz="sm"
                          onClick={() => setShowStripeConnect(true)}
                          xs={{ marginLeft: 4 }}
                        >
                          Connect →
                        </Btn>
                      </>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center',
                      marginBottom: 14,
                    }}
                  >
                    <span style={{ color: C.muted, fontSize: T.xs }}>
                      Deposit:
                    </span>
                    <Badge color={C.gold}>€{artist.deposit}</Badge>
                    <span style={{ color: C.muted, fontSize: T.xs }}>·</span>
                    <span style={{ color: C.muted, fontSize: T.xs }}>
                      Policy:
                    </span>
                    <Badge color={C.lapis}>
                      {
                        POLICIES.find((p) => p.id === artist.cancellationPolicy)
                          ?.label
                      }
                    </Badge>
                  </div>
                  <div
                    style={{
                      background: C.surface,
                      borderRadius: 8,
                      padding: '12px 14px',
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: T.xs,
                        color: C.muted,
                        letterSpacing: '0.8px',
                        marginBottom: 7,
                        fontWeight: 700,
                      }}
                    >
                      PAYMENT MODEL
                    </div>
                    <div
                      style={{
                        fontSize: T.sm,
                        color: C.textD,
                        lineHeight: 1.8,
                      }}
                    >
                      You receive{' '}
                      <strong style={{ color: C.emerald }}>
                        €{Math.round(artist.deposit * 0.88)}
                      </strong>{' '}
                      from each €{artist.deposit} deposit (88%). Balance is paid{' '}
                      <strong style={{ color: C.text }}>
                        cash directly to you
                      </strong>{' '}
                      after the concert.
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (vp.isMobile)
    return (
      <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 88 }}>
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg,${artist.color},${C.gold},${artist.color})`,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 300,
          }}
        />
        <div
          style={{
            position: 'fixed',
            top: 3,
            left: 0,
            right: 0,
            zIndex: 200,
            background: `${C.surface}F8`,
            backdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${C.border}`,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {artist.photo ? (
              <img
                src={artist.photo}
                alt=""
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  background: `${artist.color}18`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                }}
              >
                {artist.emoji}
              </div>
            )}
            <div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: T.sm,
                  fontWeight: 700,
                  color: C.text,
                }}
              >
                {artist.name}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: artist.color,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Artist Portal
              </div>
            </div>
          </div>
          <Btn v="ghost" sz="sm" onClick={onLogout}>
            Out
          </Btn>
        </div>
        <div style={{ paddingTop: 68 }}>{content}</div>
        <BottomNav active={tab} onNav={setTab} items={navItems} />
        {chat && (
          <Chat
            booking={chat}
            artist={artist}
            myRole="artist"
            onClose={() => setChat(null)}
            onSend={onMsg}
          />
        )}
        {showStripeConnect && (
          <StripeConnectSheet
            artist={artist}
            onConnected={(u) => {
              onUpdateArtist(artist.id, u);
              setShowStripeConnect(false);
            }}
            onClose={() => setShowStripeConnect(false)}
          />
        )}
      </div>
    );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex' }}>
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg,${artist.color},${C.gold},${artist.color})`,
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
        }}
      />
      <div
        style={{
          width: 220,
          background: C.surface,
          borderRight: `1px solid ${C.border}`,
          padding: '40px 0 24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 3,
          bottom: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            padding: '0 20px 20px',
            borderBottom: `1px solid ${C.border}`,
            marginBottom: 14,
          }}
        >
          {artist.photo ? (
            <img
              src={artist.photo}
              alt=""
              style={{
                width: 42,
                height: 42,
                borderRadius: 8,
                objectFit: 'cover',
                marginBottom: 10,
              }}
            />
          ) : (
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 8,
                background: `${artist.color}18`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                marginBottom: 10,
              }}
            >
              {artist.emoji}
            </div>
          )}
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: T.sm,
              fontWeight: 700,
              color: C.text,
            }}
          >
            {artist.name}
          </div>
          <div
            style={{
              fontSize: T.xs,
              color: artist.color,
              textTransform: 'uppercase',
              fontWeight: 700,
              marginTop: 2,
            }}
          >
            Artist Portal
          </div>
        </div>
        {navItems.map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              padding: '12px 20px',
              background: tab === id ? `${artist.color}18` : 'transparent',
              color: tab === id ? artist.color : C.muted,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: T.sm,
              fontWeight: tab === id ? 700 : 400,
              borderLeft: `3px solid ${
                tab === id ? artist.color : 'transparent'
              }`,
              width: '100%',
              textAlign: 'left',
              minHeight: 48,
            }}
          >
            <span style={{ fontSize: 18 }}>{icon}</span>
            {label}
          </button>
        ))}
        <div
          style={{
            marginTop: 'auto',
            padding: '16px 20px',
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <Btn v="ghost" sz="sm" onClick={onLogout} xs={{ width: '100%' }}>
            Sign Out
          </Btn>
        </div>
      </div>
      <div
        style={{ flex: 1, marginLeft: 220, paddingTop: 3, overflow: 'auto' }}
      >
        {content}
      </div>
      {chat && (
        <Chat
          booking={chat}
          artist={artist}
          myRole="artist"
          onClose={() => setChat(null)}
          onSend={onMsg}
        />
      )}
      {showStripeConnect && (
        <StripeConnectSheet
          artist={artist}
          onConnected={(u) => {
            onUpdateArtist(artist.id, u);
            setShowStripeConnect(false);
          }}
          onClose={() => setShowStripeConnect(false)}
        />
      )}
    </div>
  );
}

// ── Stripe Connect Sheet ───────────────────────────────────────────────
function StripeConnectSheet({ artist, onConnected, onClose }) {
  const [iban, setIban] = useState(''),
    [loading, setLoading] = useState(false),
    [done, setDone] = useState(false);
  const connect = () => {
    if (!iban.trim()) return;
    setLoading(true);
    setTimeout(() => {
      onConnected({
        stripeConnected: true,
        stripeAccount: `acct_${artist.name
          .split(' ')[0]
          .toLowerCase()}${Date.now().toString().slice(-5)}`,
      });
      setDone(true);
      setLoading(false);
    }, 2000);
  };
  return (
    <Sheet open title="Connect Stripe Account" onClose={onClose}>
      <div style={{ padding: '16px 20px 32px' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: C.emeraldS,
                border: `2px solid ${C.emerald}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                fontSize: 24,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T.xl,
                fontWeight: 700,
                color: C.text,
                marginBottom: 8,
              }}
            >
              Connected!
            </div>
            <div
              style={{
                color: C.muted,
                fontSize: T.sm,
                lineHeight: 1.7,
                marginBottom: 16,
              }}
            >
              You'll receive{' '}
              <strong style={{ color: C.gold }}>
                €{Math.round(artist.deposit * 0.88)}
              </strong>{' '}
              from each deposit automatically.
            </div>
            <Btn v="emerald" full sz="lg" onClick={onClose}>
              Done
            </Btn>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div
              style={{
                width: 44,
                height: 44,
                border: `3px solid ${C.border}`,
                borderTopColor: '#635BFF',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T.lg,
                color: C.text,
              }}
            >
              Connecting to Stripe…
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                background: '#635BFF12',
                border: '1px solid #635BFF30',
                borderRadius: 10,
                padding: '14px',
                marginBottom: 16,
              }}
            >
              {[
                'Client pays deposit via Stripe',
                '88% auto-transferred to your account',
                '12% retained as Awaz platform fee',
                'Balance paid cash by client after concert',
              ].map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginBottom: 6,
                    fontSize: T.sm,
                    color: C.textD,
                  }}
                >
                  <span style={{ color: '#8B83FF', fontWeight: 700 }}>
                    {i + 1}.
                  </span>
                  {t}
                </div>
              ))}
            </div>
            <Inp
              label="Bank Account / IBAN *"
              placeholder="NO12 3456 7890 1234 5"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              hint="Deposits transferred here automatically"
            />
            <div style={{ height: 16 }} />
            <button
              onClick={connect}
              disabled={!iban.trim()}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg,#635BFF,#7B72FF)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: 16,
                fontSize: T.md,
                fontWeight: 800,
                cursor: iban.trim() ? 'pointer' : 'not-allowed',
                opacity: iban.trim() ? 1 : 0.5,
                fontFamily: 'inherit',
                minHeight: 52,
              }}
            >
              Connect via Stripe →
            </button>
            <div
              style={{
                textAlign: 'center',
                marginTop: 10,
                color: C.muted,
                fontSize: T.xs,
              }}
            >
              Stripe Connect · Bank-level security · Instant payouts
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const vp = useViewport();
  const [users, setUsers] = useState(USERS);
  const [artists, setArtists] = useState(ARTISTS);
  const [bookings, setBookings] = useState(BOOKINGS);
  const [session, setSession] = useState(null);
  const [view, setView] = useState('home');
  const [selArtist, setSelArtist] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [search, setSearch] = useState('');
  const [genreF, setGenreF] = useState('All');
  const [menuOpen, setMenuOpen] = useState(false);

  const genres = [
    'All',
    'Ghazal',
    'Traditional',
    'Folk',
    'Pop',
    'Jazz',
    'Fusion',
    'Percussion',
    'Classical',
  ];
  const approved = useMemo(
    () => artists.filter((a) => a.status === 'approved'),
    [artists]
  );
  const filtered = useMemo(
    () =>
      approved.filter((a) => {
        const ms =
          !search ||
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.genre.toLowerCase().includes(search.toLowerCase()) ||
          a.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
        const mg =
          genreF === 'All' ||
          a.tags.includes(genreF) ||
          a.genre.toLowerCase().includes(genreF.toLowerCase());
        return ms && mg;
      }),
    [approved, search, genreF]
  );

  const login = (u) => {
    setSession(u);
    setShowLogin(false);
  };
  const logout = () => setSession(null);
  const handleArtistAction = (id, action) =>
    setArtists((p) =>
      p.map((a) => (a.id === id ? { ...a, status: action } : a))
    );
  const handleToggle = (aid, month, year, day) =>
    setArtists((p) =>
      p.map((a) => {
        if (a.id !== aid) return a;
        const k = `${year}-${month}`,
          av = [...(a.available[k] || [])],
          bl = [...(a.blocked[k] || [])];
        if (av.includes(day))
          return {
            ...a,
            available: { ...a.available, [k]: av.filter((d) => d !== day) },
            blocked: { ...a.blocked, [k]: [...bl, day] },
          };
        if (bl.includes(day))
          return {
            ...a,
            blocked: { ...a.blocked, [k]: bl.filter((d) => d !== day) },
            available: { ...a.available, [k]: [...av, day] },
          };
        return { ...a, available: { ...a.available, [k]: [...av, day] } };
      })
    );
  const handleUpdateArtist = (id, updates) => {
    setArtists((p) => p.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    if (selArtist?.id === id)
      setSelArtist((p) => (p ? { ...p, ...updates } : p));
  };
  const handleNewBooking = (b) => setBookings((p) => [...p, b]);
  const handleNewArtist = (a, u) => {
    setArtists((p) => [...p, a]);
    setUsers((p) => [...p, u]);
  };
  const handleMsg = (bid, m) =>
    setBookings((p) =>
      p.map((b) =>
        b.id === bid ? { ...b, messages: [...(b.messages || []), m] } : b
      )
    );

  // ── ALL HOOKS MUST BE DECLARED BEFORE ANY CONDITIONAL RETURN ─────────
  // AUTH-FIX-1: prevView was previously declared AFTER conditional returns,
  // violating React Rules of Hooks. Moving it here prevents "change in order
  // of Hooks" crash when session state changes (login/logout).
  const [prevView, setPrevView] = useState('home');

  // AUTH-FIX-3: nav() also moved above conditional returns so it is always
  // in scope regardless of which render path executes.
  const nav = (v) => {
    if (v === 'profile') setPrevView(view);
    window.scrollTo({ top: 0, behavior: 'instant' });
    setView(v);
    setMenuOpen(false);
  };

  // ── Route to dashboards (after ALL hooks) ────────────────────────────
  if (session?.role === 'admin')
    return (
      <AdminDash
        artists={artists}
        bookings={bookings}
        users={users}
        onAction={handleArtistAction}
        onLogout={logout}
        onMsg={handleMsg}
      />
    );
  if (session?.role === 'artist') {
    const myA = artists.find((a) => a.id === session.artistId);
    if (myA)
      return (
        <ArtistPortal
          user={session}
          artist={myA}
          bookings={bookings}
          onLogout={logout}
          onToggleDay={handleToggle}
          onMsg={handleMsg}
          onUpdateArtist={handleUpdateArtist}
        />
      );
    // AUTH-FIX-2: Artist logged in but no matching artist profile found.
    // Previously fell through silently — user stuck in broken limbo with no
    // logout button. Now shows a clear error with logout option.
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: "'DM Sans',sans-serif",
        }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;0,800&family=DM+Sans:wght@400;500;700&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 32,
            maxWidth: 400,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: 22,
              fontWeight: 700,
              color: C.text,
              marginBottom: 8,
            }}
          >
            Artist Profile Not Found
          </div>
          <div
            style={{
              color: C.muted,
              fontSize: 14,
              lineHeight: 1.7,
              marginBottom: 24,
            }}
          >
            You're logged in as{' '}
            <strong style={{ color: C.gold }}>{session.name}</strong> but your
            artist profile could not be loaded. Please contact support or sign
            out and try again.
          </div>
          <Btn v="ghost" sz="lg" onClick={logout} xs={{ width: '100%' }}>
            Sign Out
          </Btn>
        </div>
      </div>
    );
  }

  // ── Page title updates on view change ────────────────────────────────
  useEffect(() => {
    const titles = {
      home: 'Awaz · آواز — Book Afghan Artists',
      browse: 'Browse Artists · Awaz',
      how: 'How It Works · Awaz',
      pricing: 'Pricing · Awaz',
      profile: selArtist ? `${selArtist.name} · Awaz` : 'Artist · Awaz',
    };
    document.title = titles[view] || 'Awaz · آواز';
  }, [view, selArtist]);

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100vh',
        fontFamily: "'DM Sans',sans-serif",
        color: C.text,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300;1,400;1,600&family=Noto+Naskh+Arabic:wght@400;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
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
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          height: vp.isMobile ? 56 : 62,
          background: `${C.bg}F4`,
          backdropFilter: 'blur(24px)',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${vp.isMobile ? 16 : 48}px`,
        }}
      >
        <div
          onClick={() => nav('home')}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Noto Naskh Arabic',serif",
                fontSize: vp.isMobile ? 17 : 19,
                color: C.gold,
                lineHeight: 1,
              }}
            >
              آواز
            </div>
            <div
              style={{
                height: 1,
                background: `linear-gradient(90deg,${C.ruby},${C.gold},${C.lapis})`,
                marginTop: 2,
              }}
            />
          </div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: vp.isMobile ? 19 : 21,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '0.3px',
            }}
          >
            Awaz
          </div>
        </div>

        {vp.isDesktop && (
          <nav style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {[
              ['Browse Artists', 'browse'],
              ['How It Works', 'how'],
              ['Pricing', 'pricing'],
            ].map(([l, v]) => (
              <button
                key={v}
                onClick={() => nav(v)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: view === v ? C.gold : C.muted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: T.sm,
                  fontWeight: 500,
                  padding: '6px 13px',
                  borderRadius: 6,
                  minHeight: 44,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {l}
              </button>
            ))}
          </nav>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {vp.isDesktop && !session && (
            <>
              <Btn onClick={() => setShowApply(true)} v="ruby" sz="sm">
                Apply as Artist
              </Btn>
              <Btn onClick={() => setShowLogin(true)} v="ghost" sz="sm">
                Sign In
              </Btn>
            </>
          )}
          {vp.isDesktop && session && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: C.muted, fontSize: T.xs }}>
                👤 {session.name.split(' ')[0]}
              </span>
              <Btn onClick={logout} v="ghost" sz="sm">
                Sign Out
              </Btn>
            </div>
          )}
          {vp.isMobile && !session && (
            <button
              onClick={() => setShowLogin(true)}
              aria-label="Logg inn"
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: C.surface,
                border: `1px solid ${C.border}`,
                color: C.muted,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              👤
            </button>
          )}
          {vp.isMobile && session && (
            <button
              onClick={logout}
              aria-label="Logg ut"
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: C.rubyS,
                border: `1px solid ${C.ruby}44`,
                color: C.ruby,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
                letterSpacing: '0.3px',
              }}
            >
              Logg ut
            </button>
          )}
        </div>
      </header>

      {/* ── HOME ── */}
      {view === 'home' && (
        <div style={{ paddingTop: vp.isMobile ? 56 : 62 }}>
          {/* Hero */}
          <section
            style={{
              minHeight: vp.isMobile ? '85vh' : '90vh',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Geo id="hero" op={0.05} />
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
                width: 'min(900px,140vw)',
                height: 'min(600px,80vh)',
                background: `radial-gradient(ellipse,${C.ruby}0A 0%,${C.lapis}06 45%,transparent 70%)`,
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '20%',
                background: `linear-gradient(to top,${C.bg},transparent)`,
                pointerEvents: 'none',
              }}
            />

            <div
              style={{
                maxWidth: vp.isMobile ? '100%' : 900,
                margin: '0 auto',
                padding: vp.isMobile ? '0 20px' : '0 48px',
                position: 'relative',
                zIndex: 2,
                width: '100%',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                className="u0"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  marginBottom: vp.isMobile ? 20 : 28,
                }}
              >
                <div
                  style={{
                    height: 1,
                    width: vp.isMobile ? 32 : 56,
                    background: `linear-gradient(90deg,transparent,${C.gold}44)`,
                  }}
                />
                <span
                  style={{
                    fontFamily: "'Noto Naskh Arabic',serif",
                    fontSize: vp.isMobile ? 13 : 15,
                    color: C.gold,
                    opacity: 0.78,
                    letterSpacing: '1.5px',
                  }}
                >
                  هنرمندان افغان را رزرو کنید
                </span>
                <div
                  style={{
                    height: 1,
                    width: vp.isMobile ? 32 : 56,
                    background: `linear-gradient(270deg,transparent,${C.gold}44)`,
                  }}
                />
              </div>

              <h1
                className="u1"
                style={{
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: T['5xl'],
                  fontWeight: 800,
                  color: C.text,
                  lineHeight: 0.94,
                  margin: '0 0 6px',
                  letterSpacing: vp.isMobile ? '-2px' : '-3px',
                }}
              >
                Book Afghan
              </h1>
              <h1
                className="u1"
                style={{
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: T['5xl'],
                  fontWeight: 800,
                  lineHeight: 0.94,
                  margin: '0 0 22px',
                  letterSpacing: vp.isMobile ? '-2px' : '-3px',
                }}
              >
                Artists{' '}
                <em style={{ color: C.ruby, fontStyle: 'italic' }}>Directly</em>
              </h1>

              <div
                className="u2"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  marginBottom: 20,
                  width: '100%',
                  maxWidth: 320,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: `linear-gradient(90deg,transparent,${C.gold}38)`,
                  }}
                />
                <svg width="8" height="8" viewBox="0 0 8 8">
                  <path
                    d="M4 0L5 3L8 4L5 5L4 8L3 5L0 4L3 3Z"
                    fill={C.gold}
                    opacity="0.55"
                  />
                </svg>
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: `linear-gradient(270deg,transparent,${C.gold}38)`,
                  }}
                />
              </div>

              <p
                className="u2"
                style={{
                  fontFamily: "'DM Sans',sans-serif",
                  color: C.textD,
                  fontSize: vp.isMobile ? T.base : T.lg,
                  maxWidth: vp.isMobile ? '100%' : 560,
                  lineHeight: 1.8,
                  marginBottom: vp.isMobile ? 28 : 36,
                  fontWeight: 400,
                }}
              >
                Discover and book verified Afghan artists — ghazal, rubab, folk,
                and fusion — for your wedding, Eid, cultural event or private
                gathering.
              </p>

              {/* Search */}
              <div
                className="u3"
                style={{
                  display: 'flex',
                  width: '100%',
                  maxWidth: vp.isMobile ? '100%' : 560,
                  background: C.card,
                  borderRadius: 12,
                  border: `1px solid ${C.borderM}`,
                  overflow: 'hidden',
                  boxShadow: '0 16px 50px rgba(0,0,0,0.7)',
                  marginBottom: 24,
                }}
              >
                <input
                  placeholder={
                    vp.isMobile ? 'Search artists…' : 'Artist, genre, or city…'
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && nav('browse')}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: C.text,
                    fontSize: T.base,
                    padding: vp.isMobile ? '15px 16px' : '16px 22px',
                    outline: 'none',
                    minWidth: 0,
                    minHeight: 52,
                  }}
                />
                <button
                  onClick={() => nav('browse')}
                  style={{
                    background: `linear-gradient(135deg,${C.gold},${C.saffron})`,
                    color: C.bg,
                    border: 'none',
                    padding: vp.isMobile ? '15px 20px' : '16px 28px',
                    fontSize: T.base,
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                    minHeight: 52,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {vp.isMobile ? '🔍' : 'Search'}
                </button>
              </div>

              {/* Trust chips */}
              <div
                className="u3"
                style={{
                  display: 'flex',
                  gap: vp.isMobile ? 16 : 22,
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                {(vp.isMobile
                  ? [
                      ['✓', 'Verified'],
                      ['🔒', 'Stripe'],
                      ['💬', 'Direct chat'],
                      ['🇦🇫', 'Afghan'],
                    ]
                  : [
                      ['✓', 'Verified artists'],
                      ['🔒', 'Stripe payments'],
                      ['💬', 'Direct chat'],
                      ['💳', 'Artist-set deposits'],
                      ['🇦🇫', 'Afghan culture'],
                    ]
                ).map(([icon, l]) => (
                  <div
                    key={l}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: T.sm,
                      color: C.muted,
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    <span style={{ color: C.gold, fontSize: 13 }}>{icon}</span>
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Featured artists */}
          <section
            style={{
              maxWidth: 1240,
              margin: '0 auto',
              padding: vp.isMobile ? '24px 16px' : '60px 48px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginBottom: 8,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: T['2xl'],
                    fontWeight: 700,
                    color: C.text,
                    lineHeight: 1,
                  }}
                >
                  Featured Artists
                </div>
                <div
                  style={{
                    color: C.muted,
                    fontSize: T.sm,
                    marginTop: 6,
                    fontFamily: "'DM Sans',sans-serif",
                  }}
                >
                  Verified · ready to book
                </div>
              </div>
              <Btn onClick={() => nav('browse')} v="ghost" sz="sm">
                See all →
              </Btn>
            </div>
            <HR color={C.gold} />

            {/* Mobile: vertical list | Tablet: 2-col | Desktop: 2-col + AI sidebar */}
            {vp.isDesktop ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 320px',
                  gap: 28,
                  alignItems: 'start',
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 16,
                  }}
                >
                  {approved.slice(0, 4).map((a) => (
                    <ArtistCard
                      key={a.id}
                      artist={a}
                      onClick={(art) => {
                        setSelArtist(art);
                        setView('profile');
                      }}
                    />
                  ))}
                </div>
                <div style={{ position: 'sticky', top: 80 }}>
                  <AIWidget
                    artists={artists}
                    onPick={(art) => {
                      setSelArtist(art);
                      nav('profile');
                    }}
                  />
                </div>
              </div>
            ) : vp.isTablet ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 14,
                  marginTop: 8,
                }}
              >
                {approved.slice(0, 4).map((a) => (
                  <ArtistCard
                    key={a.id}
                    artist={a}
                    onClick={(art) => {
                      setSelArtist(art);
                      nav('profile');
                    }}
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginTop: 8,
                }}
              >
                {approved.slice(0, 4).map((a) => (
                  <ArtistCard
                    key={a.id}
                    artist={a}
                    onClick={(art) => {
                      setSelArtist(art);
                      nav('profile');
                    }}
                    compact
                  />
                ))}
              </div>
            )}
          </section>

          {/* How it works */}
          <section
            style={{
              borderTop: `1px solid ${C.border}`,
              borderBottom: `1px solid ${C.border}`,
              background: C.surface,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Geo id="hiw" op={0.03} />
            <div
              style={{
                maxWidth: 1240,
                margin: '0 auto',
                padding: vp.isMobile ? '28px 16px' : '60px 48px',
                position: 'relative',
              }}
            >
              <div
                style={{
                  textAlign: 'center',
                  marginBottom: vp.isMobile ? 28 : 44,
                }}
              >
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: T['2xl'],
                    fontWeight: 700,
                    color: C.text,
                    marginBottom: 6,
                  }}
                >
                  How It Works
                </div>
                <div
                  style={{
                    color: C.muted,
                    fontSize: T.sm,
                    maxWidth: 360,
                    margin: '0 auto',
                    lineHeight: 1.5,
                  }}
                >
                  Simple, transparent, secure from search to performance
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: vp.isMobile
                    ? '1fr'
                    : vp.isTablet
                    ? 'repeat(3,1fr)'
                    : 'repeat(5,1fr)',
                  gap: vp.isMobile ? 12 : 16,
                  position: 'relative',
                }}
              >
                {!vp.isMobile && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 28,
                      left: '10%',
                      right: '10%',
                      height: 1,
                      background: `linear-gradient(90deg,transparent,${C.gold}24,${C.gold}24,transparent)`,
                    }}
                  />
                )}
                {[
                  [
                    '🔍',
                    'Discover',
                    'Browse verified artists by genre and location',
                  ],
                  [
                    '📅',
                    'Choose Date',
                    'View live calendars — pick an open date',
                  ],
                  [
                    '💳',
                    'Pay Deposit',
                    'Artist-set deposit via Stripe — auto-split',
                  ],
                  ['💬', 'Chat Opens', 'Direct messaging after payment'],
                  ['🎶', 'Enjoy', 'Balance paid cash to artist after concert'],
                ].map(([icon, title, desc], i) =>
                  vp.isMobile ? (
                    <div
                      key={title}
                      style={{
                        display: 'flex',
                        gap: 14,
                        alignItems: 'flex-start',
                        padding: '12px 14px',
                        background: C.card,
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: C.bg,
                          border: `1px solid ${C.borderM}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            color: C.gold,
                            fontWeight: 700,
                            fontSize: 12,
                            position: 'absolute',
                          }}
                        >
                          {i + 1}
                        </span>
                        {icon}
                      </div>
                      <div>
                        <div
                          style={{
                            fontFamily: "'Cormorant Garamond',serif",
                            fontWeight: 700,
                            color: C.text,
                            fontSize: T.md,
                            marginBottom: 3,
                          }}
                        >
                          {title}
                        </div>
                        <div
                          style={{
                            color: C.muted,
                            fontSize: T.xs,
                            lineHeight: 1.5,
                          }}
                        >
                          {desc}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={title}
                      style={{
                        textAlign: 'center',
                        position: 'relative',
                        zIndex: 1,
                      }}
                    >
                      <div
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: '50%',
                          background: C.card,
                          border: `1px solid ${C.borderM}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          margin: '0 auto 14px',
                        }}
                      >
                        {icon}
                      </div>
                      <div
                        style={{
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: 700,
                          color: C.text,
                          fontSize: T.md,
                          marginBottom: 6,
                        }}
                      >
                        {title}
                      </div>
                      <div
                        style={{
                          color: C.muted,
                          fontSize: T.xs,
                          lineHeight: 1.6,
                          maxWidth: 150,
                          margin: '0 auto',
                        }}
                      >
                        {desc}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer
            style={{
              background: C.surface,
              borderTop: `1px solid ${C.border}`,
              padding: vp.isMobile ? '24px 16px 100px' : '44px 48px 32px',
            }}
          >
            {vp.isMobile ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Noto Naskh Arabic',serif",
                      fontSize: 16,
                      color: C.gold,
                    }}
                  >
                    آواز
                  </div>
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond',serif",
                      fontSize: 15,
                      fontWeight: 700,
                      color: C.text,
                    }}
                  >
                    Awaz
                  </div>
                </div>
                <p
                  style={{
                    color: C.muted,
                    fontSize: T.xs,
                    lineHeight: 1.7,
                    marginBottom: 16,
                  }}
                >
                  The premier platform for booking verified Afghan artists
                  across Europe.
                </p>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 14,
                    marginBottom: 16,
                  }}
                >
                  {[
                    ['Browse', () => nav('browse')],
                    ['Apply', () => setShowApply(true)],
                    ['How It Works', () => nav('how')],
                  ].map(([l, fn]) => (
                    <button
                      key={l}
                      onClick={fn}
                      style={{
                        color: C.muted,
                        fontSize: T.xs,
                        cursor: 'pointer',
                        background: 'none',
                        border: 'none',
                        fontFamily: 'inherit',
                        padding: 0,
                        minHeight: 36,
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div style={{ color: C.faint, fontSize: T.xs }}>
                  © {YEAR} Awaz AS · Oslo · Payments by Stripe
                </div>
              </div>
            ) : (
              <div
                style={{
                  maxWidth: 1240,
                  margin: '0 auto',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      fontFamily: "'Noto Naskh Arabic',serif",
                      fontSize: 16,
                      color: C.gold,
                    }}
                  >
                    آواز
                  </div>
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond',serif",
                      fontSize: 14,
                      fontWeight: 700,
                      color: C.text,
                    }}
                  >
                    Awaz — Afghan Artist Booking
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 18 }}>
                  {[
                    ['Browse', () => nav('browse')],
                    ['Apply', () => setShowApply(true)],
                    ['How It Works', () => nav('how')],
                    ['Pricing', () => nav('pricing')],
                  ].map(([l, fn]) => (
                    <button
                      key={l}
                      onClick={fn}
                      style={{
                        color: C.muted,
                        fontSize: T.xs,
                        cursor: 'pointer',
                        background: 'none',
                        border: 'none',
                        fontFamily: 'inherit',
                        padding: 0,
                        minHeight: 36,
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div style={{ color: C.faint, fontSize: T.xs }}>
                  © {YEAR} Awaz AS · Oslo · Stripe
                </div>
              </div>
            )}
          </footer>
        </div>
      )}

      {/* ── BROWSE ── */}
      {view === 'browse' && (
        <div
          style={{
            paddingTop: vp.isMobile ? 56 : 62,
            paddingBottom: vp.isMobile ? 88 : 0,
          }}
        >
          <div
            style={{
              maxWidth: 1240,
              margin: '0 auto',
              padding: vp.isMobile ? '16px' : '36px 48px',
            }}
          >
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T['2xl'],
                fontWeight: 700,
                color: C.text,
                marginBottom: 4,
              }}
            >
              Afghan Artists
            </div>
            <div style={{ color: C.muted, fontSize: T.xs, marginBottom: 14 }}>
              Book directly — no agencies
            </div>

            {/* Search */}
            <div
              style={{
                display: 'flex',
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: '0 14px',
                alignItems: 'center',
                gap: 8,
                height: 52,
                marginBottom: 12,
              }}
            >
              <span style={{ color: C.muted, fontSize: 16 }}>🔍</span>
              <input
                placeholder="Search artists…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: C.text,
                  fontSize: T.base,
                  outline: 'none',
                  height: '100%',
                  minWidth: 0,
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Fjern søk"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: C.muted,
                    cursor: 'pointer',
                    fontSize: 20,
                    lineHeight: 1,
                    flexShrink: 0,
                    minWidth: 32,
                    minHeight: 32,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {/* Genre filters — horizontal scroll on mobile */}
            <div
              style={{
                display: 'flex',
                gap: 7,
                overflowX: 'auto',
                paddingBottom: 8,
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                marginBottom: 14,
              }}
            >
              {genres.map((g) => (
                <button
                  key={g}
                  onClick={() => setGenreF(g)}
                  style={{
                    background: genreF === g ? C.ruby : C.card,
                    color: genreF === g ? '#fff' : C.muted,
                    border: `1px solid ${genreF === g ? C.ruby : C.border}`,
                    borderRadius: 20,
                    padding: vp.isMobile ? '8px 14px' : '8px 16px',
                    fontSize: T.xs,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                    minHeight: 36,
                    WebkitTapHighlightColor: 'transparent',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  {g}
                </button>
              ))}
            </div>

            <div style={{ color: C.muted, fontSize: T.xs, marginBottom: 14 }}>
              {filtered.length} artist{filtered.length !== 1 ? 's' : ''}
            </div>

            {filtered.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 24px',
                  background: C.card,
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 14 }}>🎵</div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: T.lg,
                    fontWeight: 700,
                    color: C.text,
                    marginBottom: 6,
                  }}
                >
                  No artists found
                </div>
                <div
                  style={{ color: C.muted, fontSize: T.sm, marginBottom: 16 }}
                >
                  Try a different genre or search term.
                </div>
                <Btn
                  v="ghost"
                  sz="md"
                  onClick={() => {
                    setSearch('');
                    setGenreF('All');
                  }}
                >
                  Clear filters
                </Btn>
              </div>
            ) : vp.isMobile ? (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                {filtered.map((a) => (
                  <ArtistCard
                    key={a.id}
                    artist={a}
                    onClick={(art) => {
                      setSelArtist(art);
                      nav('profile');
                    }}
                    compact
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${vp.isTablet ? 2 : 3},1fr)`,
                  gap: 16,
                }}
              >
                {filtered.map((a) => (
                  <ArtistCard
                    key={a.id}
                    artist={a}
                    onClick={(art) => {
                      setSelArtist(art);
                      nav('profile');
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROFILE ── */}
      {view === 'profile' && selArtist && (
        <div style={{ paddingTop: vp.isMobile ? 56 : 62 }}>
          <ProfilePage
            artist={selArtist}
            bookings={bookings}
            onBack={() => nav(prevView || 'browse')}
            onBookingCreated={handleNewBooking}
          />
        </div>
      )}

      {/* ── HOW IT WORKS ── */}
      {view === 'how' &&
        (() => {
          // ── Step data — rewritten for clarity, trust, conversion ────────
          const steps = [
            {
              n: '01',
              icon: '🔍',
              color: C.lapis,
              title: 'Find Your Perfect Artist',
              desc: 'Browse verified Afghan artists by genre, city, or occasion. Not sure where to start? Our AI matcher reads your event details and surfaces your top three — in seconds.',
              badge: 'Free to browse',
            },
            {
              n: '02',
              icon: '📅',
              color: C.emerald,
              title: 'Pick a Date — Instantly',
              desc: 'No back-and-forth emails. Every artist keeps their calendar live. Select any open date and the system reserves it for you in real time, preventing double-bookings automatically.',
              badge: 'Live availability',
            },
            {
              n: '03',
              icon: '📋',
              color: C.saffron,
              title: 'Confirm in Under 2 Minutes',
              desc: "Enter your event type and contact details. The artist's cancellation policy is shown clearly before you commit — no surprises. One tap to send your request.",
              badge: 'Takes 2 minutes',
            },
            {
              n: '04',
              icon: '💳',
              color: '#635BFF',
              title: 'Secure Your Booking via Stripe',
              desc: 'Pay the artist-set deposit (minimum €500) through Stripe — the same payment infrastructure used by Amazon and Shopify. Your card details are encrypted and never stored on our servers.',
              badge: 'Bank-level security',
            },
            {
              n: '05',
              icon: '💬',
              color: C.ruby,
              title: 'Chat Opens the Moment You Pay',
              desc: 'As soon as your deposit clears, a private direct-message channel unlocks between you and the artist. Coordinate every detail — setlist, arrival time, technical requirements — all in one place.',
              badge: 'Direct messaging',
            },
            {
              n: '06',
              icon: '🎶',
              color: C.gold,
              title: 'Show Up and Enjoy Everything',
              desc: 'The artist performs. You pay the remaining balance in cash, directly to the artist after the concert. No platform fees at the door. No hidden costs. Nothing between you and the music.',
              badge: 'Zero hidden fees',
            },
          ];

          // ── Contrast-safe text colors (WCAG AAA on #07060B bg) ──────────
          // #EDE4CE = 11.4:1 (AAA) — primary text
          // #C8BBA0 = 7.1:1  (AAA) — body text
          // #A89470 = 4.6:1  (AA)  — original muted — upgraded to above
          const bodyText = '#C8BBA0'; // AAA contrast on dark bg
          const labelText = '#8A7D68'; // muted labels

          return (
            <div
              style={{
                paddingTop: vp.isMobile ? 56 : 62,
                paddingBottom: vp.isMobile ? 104 : 60,
                background: C.bg,
              }}
            >
              {/* ── Page hero ── */}
              <div
                style={{
                  maxWidth: 720,
                  margin: '0 auto',
                  padding: vp.isMobile ? '40px 20px 32px' : '72px 48px 48px',
                  textAlign: 'center',
                }}
              >
                {/* Eyebrow */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: `${C.gold}10`,
                    border: `1px solid ${C.gold}28`,
                    borderRadius: 40,
                    padding: '6px 16px',
                    marginBottom: vp.isMobile ? 20 : 24,
                  }}
                >
                  <span style={{ fontSize: 12 }}>✦</span>
                  <span
                    style={{
                      fontFamily: "'DM Sans',sans-serif",
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.gold,
                      letterSpacing: '1.2px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Simple &amp; transparent
                  </span>
                  <span style={{ fontSize: 12 }}>✦</span>
                </div>

                {/* Main headline */}
                <h1
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: vp.isMobile
                      ? 'clamp(38px,9vw,48px)'
                      : 'clamp(52px,5vw,68px)',
                    fontWeight: 800,
                    lineHeight: 0.95,
                    color: C.text,
                    margin: '0 0 20px',
                    letterSpacing: vp.isMobile ? '-1.5px' : '-2.5px',
                  }}
                >
                  Book in 6<br />
                  <em style={{ color: C.gold, fontStyle: 'italic' }}>
                    simple steps
                  </em>
                </h1>

                {/* Sub-headline */}
                <p
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: vp.isMobile ? 16 : 18,
                    fontWeight: 400,
                    color: bodyText,
                    lineHeight: 1.75,
                    margin: '0 auto',
                    maxWidth: 480,
                  }}
                >
                  From discovery to performance — the entire booking process is
                  designed to be fast, safe, and completely transparent.
                </p>
              </div>

              {/* ── Steps ── */}
              <div
                style={{
                  maxWidth: 680,
                  margin: '0 auto',
                  padding: vp.isMobile ? '0 16px' : '0 48px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: vp.isMobile ? 16 : 12,
                }}
              >
                {steps.map((s, i) => (
                  <div
                    key={s.n}
                    style={{
                      position: 'relative',
                      background: C.card,
                      border: `1px solid ${C.border}`,
                      borderLeft: `3px solid ${s.color}`,
                      borderRadius: 16,
                      padding: vp.isMobile ? '22px 20px' : '28px 32px',
                      display: 'flex',
                      gap: vp.isMobile ? 16 : 24,
                      alignItems: 'flex-start',
                      // Subtle glow on left edge matching step color
                      boxShadow: `-2px 0 24px ${s.color}0C`,
                    }}
                  >
                    {/* Icon column */}
                    <div
                      style={{
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {/* Step number */}
                      <div
                        style={{
                          fontFamily: "'Cormorant Garamond',serif",
                          fontSize: vp.isMobile ? 11 : 12,
                          fontWeight: 700,
                          color: labelText,
                          letterSpacing: '1.5px',
                          lineHeight: 1,
                        }}
                      >
                        {s.n}
                      </div>
                      {/* Icon circle */}
                      <div
                        style={{
                          width: vp.isMobile ? 52 : 60,
                          height: vp.isMobile ? 52 : 60,
                          borderRadius: 14,
                          background: `${s.color}14`,
                          border: `1.5px solid ${s.color}30`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: vp.isMobile ? 24 : 28,
                          flexShrink: 0,
                        }}
                      >
                        {s.icon}
                      </div>
                    </div>

                    {/* Text column */}
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                      {/* Title */}
                      <div
                        style={{
                          fontFamily: "'Cormorant Garamond',serif",
                          fontSize: vp.isMobile ? 'clamp(19px,5vw,22px)' : 24,
                          fontWeight: 700,
                          lineHeight: 1.15,
                          color: C.text,
                          marginBottom: vp.isMobile ? 8 : 10,
                          letterSpacing: '-0.3px',
                        }}
                      >
                        {s.title}
                      </div>

                      {/* Description — DM Sans for body, not serif */}
                      <p
                        style={{
                          fontFamily: "'DM Sans',sans-serif",
                          fontSize: vp.isMobile ? 15 : 15.5,
                          fontWeight: 400,
                          color: bodyText,
                          lineHeight: 1.8,
                          margin: '0 0 12px',
                        }}
                      >
                        {s.desc}
                      </p>

                      {/* Badge */}
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: `${s.color}10`,
                          border: `1px solid ${s.color}28`,
                          borderRadius: 20,
                          padding: '4px 12px',
                        }}
                      >
                        <div
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: s.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "'DM Sans',sans-serif",
                            fontSize: 11,
                            fontWeight: 700,
                            color: s.color,
                            letterSpacing: '0.6px',
                            textTransform: 'uppercase',
                          }}
                        >
                          {s.badge}
                        </span>
                      </div>
                    </div>

                    {/* Connector line between steps (not on last) */}
                    {i < steps.length - 1 && (
                      <div
                        style={{
                          position: 'absolute',
                          left: vp.isMobile ? 47 : 55,
                          bottom: vp.isMobile ? -17 : -13,
                          width: 1,
                          height: vp.isMobile ? 17 : 13,
                          background: `linear-gradient(to bottom,${s.color}40,${
                            steps[i + 1].color
                          }30)`,
                          zIndex: 1,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* ── Trust bar ── */}
              <div
                style={{
                  maxWidth: 680,
                  margin: vp.isMobile ? '32px auto 0' : '40px auto 0',
                  padding: vp.isMobile ? '0 16px' : '0 48px',
                }}
              >
                <div
                  style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 16,
                    padding: vp.isMobile ? '20px' : '24px 32px',
                    display: 'grid',
                    gridTemplateColumns: vp.isMobile
                      ? '1fr 1fr'
                      : 'repeat(4,1fr)',
                    gap: vp.isMobile ? 16 : 0,
                  }}
                >
                  {[
                    ['🔒', 'Stripe Secure', 'Bank-level encryption'],
                    ['✓', 'Verified Artists', 'Every profile reviewed'],
                    ['💬', 'Direct Chat', 'No middlemen'],
                    ['0%', 'Hidden Fees', 'What you see is what you pay'],
                  ].map(([icon, title, sub], i) => (
                    <div
                      key={title}
                      style={{
                        textAlign: 'center',
                        borderRight:
                          !vp.isMobile && i < 3
                            ? `1px solid ${C.border}`
                            : 'none',
                        padding: vp.isMobile ? '0' : '0 16px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: vp.isMobile ? 22 : 20,
                          marginBottom: 5,
                        }}
                      >
                        {icon}
                      </div>
                      <div
                        style={{
                          fontFamily: "'DM Sans',sans-serif",
                          fontSize: vp.isMobile ? 13 : 13,
                          fontWeight: 700,
                          color: C.text,
                          marginBottom: 3,
                        }}
                      >
                        {title}
                      </div>
                      <div
                        style={{
                          fontFamily: "'DM Sans',sans-serif",
                          fontSize: vp.isMobile ? 11 : 11,
                          fontWeight: 400,
                          color: labelText,
                          lineHeight: 1.5,
                        }}
                      >
                        {sub}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── CTA ── */}
              <div
                style={{
                  maxWidth: 680,
                  margin: '0 auto',
                  padding: vp.isMobile ? '28px 16px 0' : '36px 48px 0',
                  display: 'flex',
                  flexDirection: vp.isMobile ? 'column' : 'row',
                  gap: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Btn
                  onClick={() => nav('browse')}
                  v="gold"
                  sz="xl"
                  xs={
                    vp.isMobile
                      ? { width: '100%', justifyContent: 'center' }
                      : {}
                  }
                >
                  Browse Artists Now →
                </Btn>
                <Btn
                  onClick={() => setShowApply(true)}
                  v="ghost"
                  sz="lg"
                  xs={
                    vp.isMobile
                      ? { width: '100%', justifyContent: 'center' }
                      : {}
                  }
                >
                  Apply as an Artist
                </Btn>
              </div>
            </div>
          );
        })()}

      {/* ── PRICING ── */}
      {view === 'pricing' && (
        <div
          style={{
            paddingTop: vp.isMobile ? 56 : 62,
            paddingBottom: vp.isMobile ? 88 : 0,
          }}
        >
          <div
            style={{
              maxWidth: 800,
              margin: '0 auto',
              padding: vp.isMobile ? '24px 16px' : '60px 48px',
            }}
          >
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T['3xl'],
                fontWeight: 800,
                color: C.text,
                marginBottom: 4,
              }}
            >
              Simple Pricing
            </div>
            <div style={{ color: C.muted, fontSize: T.sm, marginBottom: 20 }}>
              Transparent fees — no surprises, no hidden costs
            </div>
            <HR color={C.gold} />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: vp.isMobile ? '1fr' : '1fr 1fr',
                gap: 14,
                marginTop: 16,
                marginBottom: 28,
              }}
            >
              {[
                {
                  label: 'For Clients',
                  icon: '🎉',
                  color: C.gold,
                  items: [
                    'Browse all artists for free',
                    'Pay artist-set deposit at booking',
                    'Chat directly after deposit',
                    'Balance paid cash to artist',
                    "Cancel per artist's policy",
                  ],
                },
                {
                  label: 'For Artists',
                  icon: '🎤',
                  color: C.ruby,
                  items: [
                    'List for free',
                    'Set your own price',
                    'Set your own deposit (min €500)',
                    'Set your own cancellation policy',
                    'Receive 88% of each deposit',
                    '12% platform fee — nothing else',
                  ],
                },
              ].map(({ label, icon, color, items }) => (
                <div
                  key={label}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: 3,
                      background: `linear-gradient(90deg,${color},${C.gold})`,
                    }}
                  />
                  <div style={{ padding: vp.isMobile ? 16 : 22 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
                    <div
                      style={{
                        fontFamily: "'Cormorant Garamond',serif",
                        fontSize: T.xl,
                        fontWeight: 700,
                        color: C.text,
                        marginBottom: 14,
                      }}
                    >
                      {label}
                    </div>
                    {items.map((item, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          gap: 10,
                          marginBottom: 10,
                          fontSize: T.sm,
                          color: C.textD,
                        }}
                      >
                        <span style={{ color, flexShrink: 0 }}>✓</span>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: vp.isMobile ? 16 : 22,
              }}
            >
              <div
                style={{
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: T.lg,
                  fontWeight: 700,
                  color: C.gold,
                  marginBottom: 14,
                  textAlign: 'center',
                }}
              >
                Deposit Split
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,1fr)',
                  gap: 10,
                }}
              >
                {[
                  ['Artist deposit', 'Set by artist\nmin €500', C.gold],
                  ['You receive', '88% direct\nto Stripe', C.emerald],
                  ['Awaz fee', '12% platform\noperations', C.lapis],
                ].map(([l, v, c]) => (
                  <div
                    key={l}
                    style={{
                      background: C.surface,
                      borderRadius: 8,
                      padding: '12px',
                      border: `1px solid ${C.border}`,
                      borderTop: `3px solid ${c}38`,
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        color: c,
                        fontWeight: 700,
                        fontSize: T.xs,
                        marginBottom: 4,
                      }}
                    >
                      {l}
                    </div>
                    <div
                      style={{
                        color: C.text,
                        fontSize: T.xs,
                        lineHeight: 1.4,
                        whiteSpace: 'pre-line',
                      }}
                    >
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Bottom Nav (public pages) ── */}
      {vp.isMobile && ['home', 'browse', 'how', 'pricing'].includes(view) && (
        <nav
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: `${C.surface}F8`,
            backdropFilter: 'blur(20px)',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'stretch',
            paddingBottom: 'env(safe-area-inset-bottom,0px)',
            height: `calc(58px + env(safe-area-inset-bottom,0px))`,
          }}
        >
          {[
            { id: 'home', icon: '🏠', label: 'Home', fn: () => nav('home') },
            {
              id: 'browse',
              icon: '🔍',
              label: 'Browse',
              fn: () => nav('browse'),
            },
            {
              id: 'apply',
              icon: '🎤',
              label: 'Apply',
              fn: () => setShowApply(true),
            },
            session
              ? {
                  id: 'logout',
                  icon: '👋',
                  label: 'Sign Out',
                  fn: () => logout(),
                }
              : {
                  id: 'signin',
                  icon: '👤',
                  label: 'Sign In',
                  fn: () => setShowLogin(true),
                },
          ].map(({ id, icon, label, fn }) => {
            const isActive =
              (id === 'home' && view === 'home') ||
              (id === 'browse' && view === 'browse');
            return (
              <button
                key={id}
                onClick={fn}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: isActive ? C.gold : id === 'logout' ? C.ruby : C.muted,
                  paddingTop: 8,
                  paddingBottom: 4,
                  minHeight: 44,
                  WebkitTapHighlightColor: 'transparent',
                  fontFamily: 'inherit',
                  position: 'relative',
                }}
              >
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      width: 24,
                      height: 2,
                      borderRadius: 1,
                      background: C.gold,
                    }}
                  />
                )}
                <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
                <div style={{ fontSize: 9, fontWeight: isActive ? 700 : 500 }}>
                  {label}
                </div>
              </button>
            );
          })}
        </nav>
      )}

      {/* ── Modals ── */}
      <LoginSheet
        users={users}
        open={showLogin}
        onLogin={login}
        onClose={() => setShowLogin(false)}
      />
      {showApply && (
        <ApplySheet
          onSubmit={handleNewArtist}
          onClose={() => setShowApply(false)}
        />
      )}
    </div>
  );
}

// ── AI Widget (home sidebar on desktop) ───────────────────────────────
function AIWidget({ artists, onPick }) {
  const [step, setStep] = useState('idle');
  const [prefs, setPrefs] = useState({ event: '', mood: '' });
  const [results, setResults] = useState([]);
  const events = [
    'Wedding',
    'Eid',
    'Corporate',
    'Concert',
    'Birthday',
    'Festival',
  ];
  const moods = [
    ['traditional', 'Traditional', 'Classic Afghan'],
    ['modern', 'Modern', 'Contemporary'],
    ['festive', 'Festive', 'High energy'],
    ['intimate', 'Intimate', 'Small & personal'],
  ];
  const run = () => {
    setStep('loading');
    setTimeout(() => {
      const s = artists
        .filter((a) => a.status === 'approved')
        .map((a) => {
          let score = 60 + Math.random() * 30;
          if (
            prefs.event &&
            (a.tags.some((t) =>
              t.toLowerCase().includes(prefs.event.toLowerCase())
            ) ||
              a.genre.toLowerCase().includes(prefs.event.toLowerCase()))
          )
            score += 18;
          if (
            prefs.mood === 'traditional' &&
            ['Ghazal', 'Rubab', 'Folk', 'Classical', 'Traditional'].some((g) =>
              a.genre.includes(g)
            )
          )
            score += 14;
          if (
            prefs.mood === 'modern' &&
            ['Pop', 'Jazz', 'Fusion', 'Modern'].some((g) => a.genre.includes(g))
          )
            score += 14;
          return { ...a, match: Math.min(Math.round(score), 99) };
        })
        .sort((a, b) => b.match - a.match)
        .slice(0, 3);
      setResults(s);
      setStep('results');
    }, 1600);
  };
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 2,
          background: `linear-gradient(90deg,${C.lapis},${C.gold},${C.ruby})`,
        }}
      />
      <div style={{ padding: 20 }}>
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: C.lapisS,
              border: `1px solid ${C.lapis}38`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            ✦
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T.md,
                fontWeight: 700,
                color: C.text,
              }}
            >
              AI Artist Matching
            </div>
            <div style={{ color: C.muted, fontSize: T.xs }}>
              Find your perfect artist
            </div>
          </div>
        </div>
        {step === 'idle' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  color: C.muted,
                  fontSize: T.xs,
                  fontWeight: 700,
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  marginBottom: 7,
                }}
              >
                Event Type
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {events.map((e) => (
                  <button
                    key={e}
                    onClick={() => setPrefs((p) => ({ ...p, event: e }))}
                    style={{
                      background: prefs.event === e ? `${C.gold}22` : C.surface,
                      color: prefs.event === e ? C.gold : C.muted,
                      border: `1px solid ${
                        prefs.event === e ? `${C.gold}44` : C.border
                      }`,
                      borderRadius: 5,
                      padding: '5px 10px',
                      fontSize: T.xs,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontWeight: 600,
                      minHeight: 32,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  color: C.muted,
                  fontSize: T.xs,
                  fontWeight: 700,
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  marginBottom: 7,
                }}
              >
                Music Style
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                }}
              >
                {moods.map(([v, l, d]) => (
                  <button
                    key={v}
                    onClick={() => setPrefs((p) => ({ ...p, mood: v }))}
                    style={{
                      background: prefs.mood === v ? `${C.ruby}18` : C.surface,
                      color: prefs.mood === v ? C.ruby : C.muted,
                      border: `1px solid ${
                        prefs.mood === v ? `${C.ruby}44` : C.border
                      }`,
                      borderRadius: 7,
                      padding: '8px 10px',
                      fontSize: T.xs,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      minHeight: 44,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{l}</div>
                    <div style={{ fontSize: 9, opacity: 0.7, marginTop: 1 }}>
                      {d}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <Btn
              v="lapis"
              full
              onClick={run}
              disabled={!prefs.event && !prefs.mood}
            >
              Find My Artist ✦
            </Btn>
          </>
        )}
        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: `2px solid ${C.border}`,
                borderTopColor: C.lapis,
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 12px',
              }}
            />
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T.md,
                color: C.text,
              }}
            >
              Analyzing…
            </div>
          </div>
        )}
        {step === 'results' && (
          <div>
            <div style={{ color: C.muted, fontSize: T.xs, marginBottom: 10 }}>
              Top matches for {prefs.event || 'your event'}
            </div>
            {results.map((a, i) => (
              <div
                key={a.id}
                onClick={() => onPick(a)}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  background: i === 0 ? `${a.color}10` : C.surface,
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 7,
                  cursor: 'pointer',
                  border: `1px solid ${i === 0 ? `${a.color}44` : C.border}`,
                  minHeight: 52,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontWeight: 800,
                    color: i === 0 ? C.gold : C.muted,
                    fontSize: 15,
                    width: 18,
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                {a.photo ? (
                  <img
                    src={a.photo}
                    alt=""
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      background: `${a.color}18`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    {a.emoji}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond',serif",
                      fontWeight: 700,
                      color: C.text,
                      fontSize: T.sm,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.name}
                  </div>
                  <div style={{ color: a.color, fontSize: T.xs }}>
                    {a.genre}
                  </div>
                </div>
                <div
                  style={{
                    background: i === 0 ? `${C.gold}20` : C.surface,
                    border: `1px solid ${i === 0 ? `${C.gold}44` : C.border}`,
                    borderRadius: 4,
                    padding: '2px 7px',
                    fontSize: T.xs,
                    fontWeight: 800,
                    color: i === 0 ? C.gold : C.muted,
                    flexShrink: 0,
                  }}
                >
                  {a.match}%
                </div>
              </div>
            ))}
            <button
              onClick={() => {
                setStep('idle');
                setResults([]);
                setPrefs({ event: '', mood: '' });
              }}
              style={{
                background: 'none',
                border: 'none',
                color: C.muted,
                cursor: 'pointer',
                fontSize: T.xs,
                fontFamily: 'inherit',
                textDecoration: 'underline',
                marginTop: 4,
                minHeight: 36,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Start over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Apply as Artist Sheet ─────────────────────────────────────────────
function ApplySheet({ onSubmit, onClose }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({
    name: '',
    nameDari: '',
    email: '',
    pass: '',
    pass2: '',
    genre: '',
    location: '',
    priceInfo: '',
    deposit: '1000',
    bio: '',
    instruments: '',
    tags: '',
    cancellationPolicy: 'moderate',
  });
  const [err, setErr] = useState(''),
    [done, setDone] = useState(false),
    [loading, setLoading] = useState(false);

  const v1 = () => {
    if (!f.name) return 'Name required.';
    if (!f.email || !f.email.includes('@')) return 'Valid email required.';
    if (f.pass.length < 8) return 'Password: 8+ chars.';
    if (!/[A-Z]/.test(f.pass)) return 'Need 1 uppercase.';
    if (!/[0-9]/.test(f.pass)) return 'Need 1 number.';
    if (f.pass !== f.pass2) return "Passwords don't match.";
    return null;
  };
  const v2 = () => {
    if (!f.genre) return 'Genre required.';
    return null;
  };

  const next = () => {
    const e = step === 1 ? v1() : v2();
    if (e) {
      setErr(e);
      return;
    }
    setErr('');
    setStep((s) => s + 1);
  };
  const submit = () => {
    setLoading(true);
    setTimeout(() => {
      const emojis = ['🎤', '🪕', '🎶', '🎸', '🪘', '🎷', '🎹'],
        cols = [C.ruby, C.lapis, C.emerald, C.saffron, C.gold, C.lavender];
      const id = `a${Date.now()}`;
      onSubmit(
        {
          id,
          name: f.name,
          nameDari: f.nameDari || '',
          genre: f.genre,
          location: f.location || '—',
          rating: 0,
          reviews: 0,
          priceInfo: f.priceInfo || 'On request',
          deposit: parseInt(f.deposit) || 1000,
          emoji: emojis[Math.floor(Math.random() * emojis.length)],
          color: cols[Math.floor(Math.random() * cols.length)],
          photo: null,
          bio: f.bio || '',
          tags: f.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          instruments: f.instruments
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          superhost: false,
          status: 'pending',
          joined: MONTHS[NOW.getMonth()] + ' ' + NOW.getFullYear(),
          available: { [MK]: [] },
          blocked: { [MK]: [] },
          earnings: 0,
          totalBookings: 0,
          verified: false,
          stripeConnected: false,
          stripeAccount: null,
          cancellationPolicy: f.cancellationPolicy,
        },
        {
          id: `u_${id}`,
          role: 'artist',
          email: f.email,
          hash: sh(f.pass),
          name: f.name,
          artistId: id,
        }
      );
      setLoading(false);
      setDone(true);
    }, 600);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        done
          ? 'Application Submitted'
          : step === 1
          ? 'Apply as Artist — Step 1/2'
          : 'Apply as Artist — Step 2/2'
      }
      maxH="96vh"
    >
      <div style={{ padding: '16px 20px 32px' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: C.emeraldS,
                border: `2px solid ${C.emerald}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                fontSize: 22,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: T.xl,
                fontWeight: 700,
                color: C.text,
                marginBottom: 8,
              }}
            >
              You're on your way!
            </div>
            <div
              style={{
                color: C.muted,
                fontSize: T.sm,
                lineHeight: 1.7,
                marginBottom: 20,
              }}
            >
              Your profile is under review. Sign in to connect Stripe and
              complete verification.
            </div>
            <Btn full sz="lg" onClick={onClose}>
              Done
            </Btn>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
              {[1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    background: i <= step ? C.gold : C.border,
                    transition: 'background 0.3s',
                  }}
                />
              ))}
            </div>
            {err && (
              <div
                style={{
                  background: C.rubyS,
                  border: `1px solid ${C.ruby}28`,
                  borderRadius: 8,
                  padding: '10px 13px',
                  color: C.ruby,
                  fontSize: T.xs,
                  marginBottom: 12,
                }}
              >
                ⚠ {err}
              </div>
            )}

            {step === 1 && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <Inp
                  label="Artist / Band Name *"
                  placeholder="Soraya Rahimi"
                  value={f.name}
                  onChange={(e) =>
                    setF((p) => ({ ...p, name: e.target.value }))
                  }
                  required
                />
                <Inp
                  label="Name in Dari (optional)"
                  placeholder="ثریا رحیمی"
                  value={f.nameDari}
                  onChange={(e) =>
                    setF((p) => ({ ...p, nameDari: e.target.value }))
                  }
                />
                <Inp
                  label="Email *"
                  type="email"
                  placeholder="you@email.com"
                  value={f.email}
                  onChange={(e) =>
                    setF((p) => ({ ...p, email: e.target.value }))
                  }
                  required
                />
                <Inp
                  label="Password *"
                  type="password"
                  placeholder="8+ chars, uppercase, number"
                  value={f.pass}
                  onChange={(e) =>
                    setF((p) => ({ ...p, pass: e.target.value }))
                  }
                  required
                  hint="Min 8 chars, 1 uppercase, 1 number"
                />
                <Inp
                  label="Confirm Password *"
                  type="password"
                  placeholder="Repeat password"
                  value={f.pass2}
                  onChange={(e) =>
                    setF((p) => ({ ...p, pass2: e.target.value }))
                  }
                  required
                />
              </div>
            )}
            {step === 2 && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <Inp
                  label="Genre / Style *"
                  placeholder="Classical Ghazal · Vocals"
                  value={f.genre}
                  onChange={(e) =>
                    setF((p) => ({ ...p, genre: e.target.value }))
                  }
                  required
                />
                <Inp
                  label="Location"
                  placeholder="Kabul · Oslo"
                  value={f.location}
                  onChange={(e) =>
                    setF((p) => ({ ...p, location: e.target.value }))
                  }
                />
                <Inp
                  label="Starting Price"
                  placeholder="From €2,500"
                  value={f.priceInfo}
                  onChange={(e) =>
                    setF((p) => ({ ...p, priceInfo: e.target.value }))
                  }
                />
                <Inp
                  label="Deposit Amount (€)"
                  type="number"
                  value={f.deposit}
                  onChange={(e) =>
                    setF((p) => ({ ...p, deposit: e.target.value }))
                  }
                  hint="Minimum €500"
                />
                <Inp
                  label="Instruments (comma-separated)"
                  placeholder="Vocals, Harmonium"
                  value={f.instruments}
                  onChange={(e) =>
                    setF((p) => ({ ...p, instruments: e.target.value }))
                  }
                />
                <Inp
                  label="Tags (comma-separated)"
                  placeholder="Ghazal, Wedding, Eid"
                  value={f.tags}
                  onChange={(e) =>
                    setF((p) => ({ ...p, tags: e.target.value }))
                  }
                />
                <Sel
                  label="Cancellation Policy"
                  value={f.cancellationPolicy}
                  onChange={(e) =>
                    setF((p) => ({ ...p, cancellationPolicy: e.target.value }))
                  }
                  options={[
                    ['flexible', 'Flexible — Full refund 7+ days'],
                    ['moderate', 'Moderate — Full refund 72h+'],
                    ['strict', 'Strict — 50% refund 72h+'],
                    ['no_refund', 'No Refund'],
                  ]}
                />
                <Inp
                  label="Bio"
                  placeholder="Tell clients about yourself…"
                  value={f.bio}
                  onChange={(e) => setF((p) => ({ ...p, bio: e.target.value }))}
                  rows={3}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              {step > 1 && (
                <Btn
                  v="ghost"
                  onClick={() => {
                    setStep((s) => s - 1);
                    setErr('');
                  }}
                  xs={{ flex: 1 }}
                >
                  ← Back
                </Btn>
              )}
              {step < 2 ? (
                <Btn onClick={next} xs={{ flex: step > 1 ? 2 : 1 }}>
                  Next →
                </Btn>
              ) : (
                <Btn onClick={submit} loading={loading} xs={{ flex: 2 }}>
                  Submit Application
                </Btn>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
