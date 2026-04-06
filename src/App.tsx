<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Awaz · آواز — Platform Specification</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{--ink:#0E0B07;--ink2:#2C2417;--ink3:#5C4E38;--muted:#8A7A62;--rule:#D4C9B4;--cream:#FAF8F3;--parchment:#F5F0E6;--gold:#8A6910;--gold-lt:#B08A18;--ruby:#8B1E2A;--lapis:#1A3F7C;--emerald:#145E3C;--saffron:#7A4400;--stripe:#4B44CC;--gold-bg:rgba(138,105,16,0.07);--ruby-bg:rgba(139,30,42,0.06);--lapis-bg:rgba(26,63,124,0.06)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--cream);color:var(--ink);font-family:'DM Sans',sans-serif;font-size:15px;line-height:1.75;-webkit-font-smoothing:antialiased}
.shell{display:flex;min-height:100vh}
nav{width:256px;flex-shrink:0;position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--ink);color:#EDE4CE;padding:28px 0 40px;font-size:12px}
@media(max-width:900px){nav{display:none}}
main{flex:1;min-width:0}
.nav-logo{padding:0 22px 24px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:18px}
.nav-logo .ar{font-family:'Noto Naskh Arabic',serif;font-size:20px;color:#C8A84A}
.nav-logo .la{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700;color:#EDE4CE;margin-top:2px}
.nav-logo .su{font-size:9px;color:#5C5040;text-transform:uppercase;letter-spacing:2px;margin-top:4px}
.nav-sec{padding:5px 22px 2px;font-size:9px;color:#4A4238;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;margin-top:14px}
.nav-a{display:flex;align-items:center;gap:8px;padding:8px 22px;color:#7A6D5A;text-decoration:none;font-size:12px;transition:all .15s;border-left:2px solid transparent}
.nav-a:hover{color:#C8A84A;background:rgba(200,168,74,0.06);border-left-color:#C8A84A}
.nav-a .n{font-family:'DM Mono',monospace;font-size:10px;color:#3A3428;width:15px;flex-shrink:0}
.cover{background:var(--ink);color:#EDE4CE;min-height:96vh;display:flex;flex-direction:column;justify-content:flex-end;padding:80px 60px 72px;position:relative;overflow:hidden}
@media(max-width:700px){.cover{padding:60px 24px 56px}}
.cover-geo{position:absolute;inset:0;opacity:.04;background-image:radial-gradient(circle at 20% 80%,#C8A84A 0%,transparent 50%),radial-gradient(circle at 80% 20%,#A82C38 0%,transparent 50%)}
.cover-pat{position:absolute;inset:0;opacity:.03;background-image:repeating-linear-gradient(45deg,#C8A84A 0,#C8A84A 1px,transparent 0,transparent 50%);background-size:28px 28px}
.cover-rule{height:3px;background:linear-gradient(90deg,#A82C38,#C8A84A,#1E4E8C);width:72px;margin-bottom:36px}
.cover-kicker{font-size:11px;color:#5C5040;letter-spacing:3px;text-transform:uppercase;margin-bottom:18px;font-family:'DM Mono',monospace}
.cover-title{font-family:'Cormorant Garamond',serif;font-size:clamp(46px,8vw,84px);font-weight:700;line-height:.9;color:#EDE4CE;letter-spacing:-2px;margin-bottom:8px}
.cover-title em{color:#C8A84A;font-style:italic}
.cover-ar{font-family:'Noto Naskh Arabic',serif;font-size:clamp(26px,4vw,38px);color:rgba(200,168,74,.55);margin-bottom:28px;direction:rtl}
.cover-desc{font-size:15px;color:#C8BBA0;max-width:540px;line-height:1.8;margin-bottom:44px}
.cover-meta{display:flex;gap:36px;flex-wrap:wrap}
.cm .lbl{font-size:9px;color:#4A4238;text-transform:uppercase;letter-spacing:2px;margin-bottom:3px}
.cm .val{font-size:13px;color:#7A6D5A;font-family:'DM Mono',monospace}
.sec{max-width:840px;margin:0 auto;padding:72px 56px;border-bottom:1px solid var(--rule)}
@media(max-width:700px){.sec{padding:48px 22px}}
.sec:last-child{border-bottom:none}
.sec-num{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:2px;margin-bottom:10px}
.sec-title{font-family:'Cormorant Garamond',serif;font-size:clamp(30px,5vw,46px);font-weight:700;line-height:1.05;color:var(--ink);margin-bottom:8px;letter-spacing:-.5px}
.sec-title em{color:var(--gold);font-style:italic}
.sec-sub{font-size:13px;color:var(--muted);margin-bottom:40px;padding-bottom:24px;border-bottom:1px solid var(--rule)}
h2{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:700;color:var(--ink);margin:38px 0 11px;padding-bottom:5px;border-bottom:2px solid var(--rule)}
h2:first-child{margin-top:0}
h3{font-size:11px;font-weight:700;color:var(--ink2);text-transform:uppercase;letter-spacing:1.2px;margin:24px 0 8px}
p{color:var(--ink2);margin-bottom:13px;line-height:1.85}
p:last-child{margin-bottom:0}
strong{color:var(--ink);font-weight:700}
.lp{background:var(--parchment);border:1px solid var(--rule);border-left:3px solid var(--gold);border-radius:4px;padding:22px 26px;margin-bottom:28px;font-size:13px;color:var(--muted);line-height:1.9}
.la{margin-bottom:32px;padding-bottom:32px;border-bottom:1px solid var(--rule)}
.la:last-child{border-bottom:none}
.a-num{font-family:'DM Mono',monospace;font-size:10px;font-weight:500;color:var(--gold);letter-spacing:1px;margin-bottom:5px}
.a-title{font-family:'Cormorant Garamond',serif;font-size:19px;font-weight:700;color:var(--ink);margin-bottom:12px}
.a-body{font-size:13.5px;color:var(--ink2);line-height:1.9}
.a-body ol,.a-body ul{padding-left:18px;margin:8px 0}
.a-body li{margin-bottom:7px}
.cb{border-radius:6px;padding:16px 20px;margin:18px 0;font-size:13.5px;border:1px solid;line-height:1.8}
.cb-g{background:var(--gold-bg);border-color:rgba(138,105,16,.22);color:var(--ink2)}
.cb-r{background:var(--ruby-bg);border-color:rgba(139,30,42,.22);color:var(--ink2)}
.cb-b{background:var(--lapis-bg);border-color:rgba(26,63,124,.22);color:var(--ink2)}
.cb-t{font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
.cb-g .cb-t{color:var(--gold)}.cb-r .cb-t{color:var(--ruby)}.cb-b .cb-t{color:var(--lapis)}
pre{background:var(--ink);color:#C8BBA0;border-radius:8px;padding:18px 22px;font-family:'DM Mono',monospace;font-size:11.5px;line-height:1.7;overflow-x:auto;margin:18px 0}
code{font-family:'DM Mono',monospace;font-size:11.5px;background:var(--parchment);padding:2px 5px;border-radius:3px;color:var(--ruby)}
table{width:100%;border-collapse:collapse;margin:18px 0;font-size:13px}
th{background:var(--ink);color:#C8A84A;font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:1.5px;text-transform:uppercase;padding:9px 13px;text-align:left}
td{padding:9px 13px;border-bottom:1px solid var(--rule);color:var(--ink2);vertical-align:top}
tr:nth-child(even) td{background:var(--parchment)}
.t-m{font-family:'DM Mono',monospace;font-size:11px;color:var(--gold)}
.t-b{font-weight:700;color:var(--ink)}
.flow{display:flex;flex-direction:column;margin:24px 0}
.fs{display:flex;gap:14px;align-items:flex-start;padding:14px 18px;border:1px solid var(--rule);border-bottom:none;background:#fff}
.fs:first-child{border-radius:8px 8px 0 0}
.fs:last-child{border-radius:0 0 8px 8px;border-bottom:1px solid var(--rule)}
.fn{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;font-size:10px;font-weight:700;background:var(--ink);color:#C8A84A}
.ft{font-weight:700;font-size:12.5px;color:var(--ink);margin-bottom:3px}
.fb{font-size:11.5px;color:var(--muted);line-height:1.7}
.fbg{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:9px;margin-left:7px;font-family:'DM Mono',monospace;letter-spacing:.5px;vertical-align:middle}
.bg-bl{background:rgba(139,30,42,.1);color:var(--ruby)}
.bg-wn{background:rgba(122,68,0,.1);color:var(--saffron)}
.bg-ok{background:rgba(20,94,60,.1);color:var(--emerald)}
.bg-ai{background:rgba(26,63,124,.1);color:var(--lapis)}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin:24px 0}
.metric{background:#fff;border:1px solid var(--rule);border-radius:8px;padding:18px;border-top:3px solid var(--gold)}
.metric.r{border-top-color:var(--ruby)}.metric.l{border-top-color:var(--lapis)}.metric.s{border-top-color:var(--saffron)}
.mv{font-family:'Cormorant Garamond',serif;font-size:34px;font-weight:700;color:var(--ink);line-height:1;margin-bottom:5px}
.ml{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;font-weight:600}
.ms{font-size:11.5px;color:var(--ink3);margin-top:3px;line-height:1.5}
.pitch{background:var(--ink);color:#EDE4CE;border-radius:12px;padding:44px 48px;margin:28px 0;position:relative;overflow:hidden}
.pitch::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#A82C38,#C8A84A,#1E4E8C)}
@media(max-width:700px){.pitch{padding:28px 22px}}
.pitch .ar{font-family:'Noto Naskh Arabic',serif;font-size:28px;color:rgba(200,168,74,.45);margin-bottom:16px}
.ph{font-family:'Cormorant Garamond',serif;font-size:clamp(26px,5vw,44px);font-weight:700;line-height:1.05;color:#EDE4CE;margin-bottom:16px;letter-spacing:-.5px}
.ph em{color:#C8A84A;font-style:italic}
.pb{font-size:14px;color:#C8BBA0;line-height:1.85;margin-bottom:28px}
.ptags{display:flex;flex-wrap:wrap;gap:7px}
.ptag{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;padding:4px 11px;border-radius:3px;border:1px solid rgba(200,168,74,.28);color:#C8A84A;font-family:'DM Mono',monospace}
.ac{background:#fff;border:1px solid var(--rule);border-radius:8px;overflow:hidden;margin-bottom:14px}
.ach{background:var(--parchment);padding:12px 18px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--rule)}
.aci{font-size:18px}.act{font-weight:700;font-size:13.5px;color:var(--ink)}
.acb{font-size:10px;font-weight:700;font-family:'DM Mono',monospace;padding:2px 7px;border-radius:9px;background:var(--gold-bg);color:var(--gold);letter-spacing:.5px}
.acd{padding:18px;font-size:13px;color:var(--ink2);line-height:1.8}
.acd ul{padding-left:16px}.acd li{margin-bottom:6px}
.dbt{margin-bottom:24px;border:1px solid var(--rule);border-radius:8px;overflow:hidden}
.dbh{background:var(--ink);padding:11px 16px;display:flex;align-items:center;gap:9px}
.dbn{font-family:'DM Mono',monospace;font-size:13px;color:#C8A84A;font-weight:500}
.dbd{font-size:11px;color:#4A4238}
.sig{background:var(--ink);color:#EDE4CE;padding:52px;text-align:center}
@media(max-width:700px){.sig{padding:36px 22px}}
.sig .ar{font-family:'Noto Naskh Arabic',serif;font-size:44px;color:#C8A84A;margin-bottom:10px}
.sig .tl{font-family:'Cormorant Garamond',serif;font-size:18px;color:#7A6D5A;font-style:italic}
.sig .yr{font-family:'DM Mono',monospace;font-size:10px;color:#3A3428;margin-top:18px;letter-spacing:2px}
ul{padding-left:18px;margin:10px 0}li{margin-bottom:6px;color:var(--ink2);line-height:1.85}
</style>
</head>
<body>
<div class="shell">

<nav>
  <div class="nav-logo">
    <div class="ar">آواز</div>
    <div class="la">Awaz</div>
    <div class="su">Platform Spec · 2025</div>
  </div>
  <div class="nav-sec">Legal</div>
  <a href="#terms" class="nav-a"><span class="n">01</span>User Terms</a>
  <a href="#policy" class="nav-a"><span class="n">03</span>Comm. Policy</a>
  <div class="nav-sec">System</div>
  <a href="#monitoring" class="nav-a"><span class="n">02</span>Chat Monitoring AI</a>
  <a href="#admin" class="nav-a"><span class="n">07</span>Admin Functions</a>
  <div class="nav-sec">Business</div>
  <a href="#pitch" class="nav-a"><span class="n">04</span>Pitch Text</a>
  <a href="#investor" class="nav-a"><span class="n">05</span>Investor Brief</a>
  <div class="nav-sec">Technical</div>
  <a href="#techspec" class="nav-a"><span class="n">06</span>Tech Specification</a>
</nav>

<main>

<div class="cover">
  <div class="cover-geo"></div>
  <div class="cover-pat"></div>
  <div class="cover-rule"></div>
  <div class="cover-kicker">Confidential · Internal Documentation · 2025</div>
  <div class="cover-title">Awaz<br><em>Platform</em></div>
  <div class="cover-ar">آواز — صدای هنرمندان افغان</div>
  <div class="cover-desc">Complete platform specification: legal terms, AI moderation, communication policy, investor materials, technical architecture and admin systems — authored to the standard of a senior legal, product and engineering team.</div>
  <div class="cover-meta">
    <div class="cm"><div class="lbl">Version</div><div class="val">2.0 — 2025</div></div>
    <div class="cm"><div class="lbl">Entity</div><div class="val">Awaz AS · Oslo</div></div>
    <div class="cm"><div class="lbl">Classification</div><div class="val">Confidential</div></div>
    <div class="cm"><div class="lbl">Sections</div><div class="val">7 Deliverables</div></div>
  </div>
</div>

<!-- 01 USER TERMS -->
<section class="sec" id="terms">
<div class="sec-num">01 — LEGAL</div>
<h1 class="sec-title">Brukervilkår for<br><em>Awaz-plattformen</em></h1>
<div class="sec-sub">Juridisk bindende for alle registrerte brukere, artister og administratorer. Sist revidert 2025. Gjelder fra øyeblikket du registrerer konto.</div>

<div class="lp"><strong>Awaz AS</strong>, org.nr. [REGISTRERT], med forretningsadresse i Oslo, Norge («Awaz», «vi», «oss»), driver plattformen Awaz via awaz.no og tilhørende applikasjoner. Ved registrering eller bruk aksepterer du disse vilkårene i sin helhet. Norsk rett gjelder. Verneting: Oslo tingrett.</div>

<div class="la">
<div class="a-num">§ 1</div><div class="a-title">Definisjoner</div>
<div class="a-body"><ul>
<li><strong>«Plattformen»</strong>: Awaz-nettstedet, mobilapper og alle tilknyttede tjenester.</li>
<li><strong>«Kommunikasjonskanalen»</strong>: Den interne meldingstjenesten på plattformen — den <em>eneste</em> tillatte kanalen mellom partene etter en bestilling er initiert.</li>
<li><strong>«Ekstern kontaktinformasjon»</strong>: Telefonnummer, e-postadresser, brukernavn på sosiale medier, direktemeldingstjenester (WhatsApp, Telegram, Snapchat, Signal m.fl.), fysiske adresser, nettadresser utenfor plattformen, og enhver annen identifikator som muliggjør kommunikasjon utenfor Awaz.</li>
<li><strong>«Depositum»</strong>: Beløpet betalt via Stripe ved bestillingsbekreftelse.</li>
</ul></div>
</div>

<div class="la">
<div class="a-num">§ 2</div><div class="a-title">Aksept og binding</div>
<div class="a-body"><p>Enhver bruk av plattformen — inkludert browsing, registrering, forespørsel eller bruk av meldingsfunksjonen — utgjør full aksept av disse vilkårene. Awaz forbeholder seg retten til å endre vilkårene med 14 dagers varsel. Fortsatt bruk etter varselet utgjør aksept av de oppdaterte vilkårene.</p></div>
</div>

<div class="la">
<div class="a-num">§ 3 — KRITISK</div><div class="a-title">Kommunikasjonskrav — All kontakt via plattformen</div>
<div class="a-body">
<div class="cb cb-r"><div class="cb-t">⚠ Absolutt forbud</div>All kommunikasjon mellom kunder og artister som er initiert gjennom Awaz er <strong>eksklusivt og utelukkende tillatt via Awaz sin interne kommunikasjonskanal</strong>. Dette er en kjernebetingelse og kan ikke fravikes.</div>
<p>Det er uttrykkelig <strong>forbudt</strong> å:</p>
<ol>
<li>Dele, etterspørre eller forsøke å innhente ekstern kontaktinformasjon, herunder telefonnummer, e-postadresser, brukernavn på sosiale medier eller kontaktopplysninger på direktemeldingsplattformer.</li>
<li>Bruke kryptert, forkledd eller indirekte kommunikasjon for å omgå plattformens filtre — herunder skrivestiler som «ni-ti-seks-to», «9_two_4», tall skrevet med bokstaver, eller siffer adskilt med mellomrom/tegn.</li>
<li>Oppgi kontaktinformasjon via bilder, QR-koder, lydfiler eller andre medieformater.</li>
<li>Instruere en tredjepart om å videreformidle kontaktinformasjon.</li>
<li>Avtale betaling, vederlag, arrangement eller kontrakt utenfor plattformen for tjenester opprinnelig initiert gjennom Awaz («omgåelse av plattformen»).</li>
<li>Etablere forretningsforbindelser utenfor plattformen basert på kontakt initiert gjennom Awaz, i en periode på 24 måneder etter første kontakt.</li>
</ol>
<p>Awaz benytter automatiserte overvåkings- og filtreringssystemer som identifiserer og logger forsøk på deling av ekstern kontaktinformasjon, inkludert maskerte forsøk. Bruker erkjenner at alle meldinger på plattformen er underlagt slik overvåking.</p>
</div>
</div>

<div class="la">
<div class="a-num">§ 4</div><div class="a-title">Konsekvenser ved brudd på kommunikasjonsreglene</div>
<div class="a-body">
<p>Awaz opererer etter et trestegsprinsipp, gradert etter alvorlighetsgrad og gjentakelse:</p>
<table>
<thead><tr><th>Nivå</th><th>Utløser</th><th>Konsekvens</th><th>Varighet</th></tr></thead>
<tbody>
<tr><td class="t-b">1 — Advarsel</td><td>Første brudd, lav risikopoeng (&lt;75)</td><td>Automatisk varsel, meldingen blokkert</td><td>Permanent merknad</td></tr>
<tr><td class="t-b">2 — Suspensjon</td><td>Gjentakende brudd eller høy risiko (≥75)</td><td>Kontosuspensjon, aktive bestillinger fryses</td><td>7–30 dager</td></tr>
<tr><td class="t-b">3 — Utestengelse</td><td>Tre eller flere brudd, alvorlig omgåelse</td><td>Permanent stenging, depositum tilbakeholdes</td><td>Permanent</td></tr>
</tbody>
</table>
<div class="cb cb-b"><div class="cb-t">Konvensjonalgebyr ved omgåelse</div>Dersom en bruker inngår avtale utenfor plattformen i strid med §&nbsp;3 nr.&nbsp;6, plikter vedkommende å betale Awaz et konvensjonalgebyr tilsvarende <strong>12% av estimert vederlag</strong>, minimum NOK 2&nbsp;500.</div>
</div>
</div>

<div class="la">
<div class="a-num">§ 5</div><div class="a-title">Betalinger og depositum</div>
<div class="a-body"><p>Alle betalingstransaksjoner knyttet til bestillinger fra Awaz skal gjennomføres via plattformens Stripe-integrasjon. Det er forbudt å gjennomføre betaling utenfor plattformen.</p>
<ul>
<li>Awaz AS mottar 12% av innbetalt depositum som plattformgebyr.</li>
<li>88% overføres til artisten via Stripe Connect.</li>
<li>Balansen utbetales kontant direkte til artisten etter opptredenen.</li>
</ul></div>
</div>

<div class="la">
<div class="a-num">§ 6</div><div class="a-title">Artisters forpliktelser og kvalitetssikring</div>
<div class="a-body"><ul>
<li>Artister bekrefter at all profilinformasjon er sannferdig, nøyaktig og oppdatert.</li>
<li>Artister forplikter seg til å besvare bestillingsforespørsler innen <strong>48 timer</strong>.</li>
<li>Avbestilling fra artists side mindre enn 7 dager før avtalt opptreden utløser full refusjon av depositum til kunden, pluss kompensasjon (minimum NOK 500).</li>
<li>Awaz kan suspendere profiler basert på klager, vilkårsbrudd eller kvalitetssvikt.</li>
</ul></div>
</div>

<div class="la">
<div class="a-num">§ 7</div><div class="a-title">Personvern og databehandling</div>
<div class="a-body"><p>Awaz behandler personopplysninger i henhold til GDPR og norsk personopplysningslov. Data lagres på EU-baserte servere (Supabase, Frankfurt). Awaz selger ikke personopplysninger til tredjeparter. Alle meldinger lagres kryptert og aksesseres kun av administratorer for modererings- eller juridiske formål. Brukere har rett til innsyn, retting og sletting (GDPR art. 15–17).</p></div>
</div>

<div class="la">
<div class="a-num">§ 8</div><div class="a-title">Ansvarsbegrensning</div>
<div class="a-body"><p>Awaz AS er en markedsplassoperatør og er ikke part i avtalen mellom kunde og artist. Awaz er ikke ansvarlig for opptredenens innhold, kvalitet eller gjennomføring. Awaz sitt totale erstatningsansvar overfor en enkelt bruker er begrenset til det plattformgebyr Awaz har mottatt i tilknytning til den aktuelle bestillingen.</p></div>
</div>
</section>

<!-- 02 MONITORING -->
<section class="sec" id="monitoring">
<div class="sec-num">02 — SYSTEM DESIGN</div>
<h1 class="sec-title">ContentGuard:<br><em>Chat Monitoring</em> AI</h1>
<div class="sec-sub">AI-drevet sanntidssystem for deteksjon av kontaktinformasjon. Arkitektur, flytdiagram, mønstergjenkjenning og automatiserte reaksjoner.</div>

<div class="cb cb-g"><div class="cb-t">Designprinsipp</div>ContentGuard er bygget etter <strong>multi-lag forsvar</strong> — klientsiden gir øyeblikkelig feedback, serversiden er autoritativ og kan ikke omgås, AI-laget fanger det regelbaserte mønstre alene ikke håndterer. Ingen enkelt feil kan kompromittere systemet.</div>

<h2>Flytdiagram — Meldingsbehandling</h2>
<div class="flow">
<div class="fs"><div class="fn">1</div><div><div class="ft">Bruker skriver melding (klient)</div><div class="fb">Debounced klient-sjekk (50ms) mot lette regex. Treff → live advarsel i input-feltet. Melding kan fortsatt sendes. <span class="fbg bg-wn">WARN</span></div></div></div>
<div class="fs"><div class="fn">2</div><div><div class="ft">Melding sendes til Supabase</div><div class="fb">INSERT til messages-tabellen via Row Level Security. Kun avsender kan skrive til egne bookinger. Edge Function trigger aktiveres. <span class="fbg bg-ok">PASS</span></div></div></div>
<div class="fs"><div class="fn">3</div><div><div class="ft">Edge Function: ContentGuard (Deno)</div><div class="fb">Kjøres synkront. Tre deteksjonsmoduler aktiveres parallelt: RegexEngine · ObfuscationDetector · AIClassifier.</div></div></div>
<div class="fs"><div class="fn">4</div><div><div class="ft">RegexEngine — Direkte mønstre</div><div class="fb">18 regex-mønstre. Scoring: telefon +45, e-post +50, URL +35, social handle +25, direktemeldingstjeneste +50. Resultat: risikopoeng 0–100.</div></div></div>
<div class="fs"><div class="fn">5</div><div><div class="ft">ObfuscationDetector — Maskerte forsøk</div><div class="fb">Ordmønsteranalyse: tall skrevet med bokstaver, tegnseparerte siffer, "ring meg", "finn meg på", "kontakt meg via". Scorer 0–50 tillegg.</div></div></div>
<div class="fs"><div class="fn">6</div><div><div class="ft">AIClassifier — Claude Sonnet API <span class="fbg bg-ai">AI</span></div><div class="fb">Kalles KUN dersom RegexEngine-poeng er 20–60 (tvilsonen). Prompt ber Claude klassifisere som SAFE / SUSPICIOUS / VIOLATION med begrunnelse og score-tillegg.</div></div></div>
<div class="fs"><div class="fn">7</div><div><div class="ft">Beslutningsmotor</div><div class="fb">
Totalpoeng &lt;50 → <span class="fbg bg-ok">ALLOW</span> leveres normalt.<br>
Poeng 50–74 → <span class="fbg bg-wn">FLAG+WARN</span> leveres med advarsel, flagges i admin-dashboard.<br>
Poeng ≥75 → <span class="fbg bg-bl">BLOCK</span> blokkert, bruker varsles, admin-notifikasjon sendes.<br>
Poeng ≥90 → <span class="fbg bg-bl">BLOCK+SUSPEND</span> violation_count økes, suspensjon vurderes automatisk.
</div></div></div>
<div class="fs"><div class="fn">8</div><div><div class="ft">Logging og admin-varsling</div><div class="fb">Brudd logges i violations-tabellen. admin_notifications INSERT. Originaltekst bevares kryptert for revisjon. Brukerkonto oppdateres.</div></div></div>
<div class="fs"><div class="fn">9</div><div><div class="ft">Svar til klient via Supabase Realtime</div><div class="fb">Klienten mottar status via WebSocket. Blokkert melding erstattes med: «⚠ Meldingen din inneholdt informasjon som ikke er tillatt på Awaz. Se brukervilkår §3.»</div></div></div>
</div>

<h2>Deteksjonsmønstre — Implementasjon</h2>
<pre>// ContentGuard — contentguard.ts (Supabase Edge Function, Deno)

const PATTERNS = {
  phone: [
    /(\+?47[\s\-.]?)?[0-9]{3}[\s\-.]?[0-9]{2}[\s\-.]?[0-9]{3}/g,  // Norwegian
    /(\+|00)[1-9][0-9]{6,14}/g,                                      // International
    /\b\d{4}[\s\-.]?\d{3}[\s\-.]?\d{3}\b/g,                        // Generic format
    /\(\d{2,4}\)[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g,                    // (country) style
  ],
  email: [
    /[a-zA-Z0-9._%+\-]+\s*@\s*[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    /[a-zA-Z0-9._%+\-]+\s*\[at\]\s*[a-zA-Z0-9.\-]+/gi,
    /[a-zA-Z0-9._%+\-]+\s*\(at\)\s*[a-zA-Z0-9.\-]+/gi,
  ],
  social: [
    /instagram\.com\/[^\s/]+/gi,
    /t\.me\/[^\s/]+/gi,
    /wa\.me\/\d+/gi,
    /snapchat\.com\/[^\s/]+/gi,
    /(https?:\/\/|www\.)[^\s]{3,}/gi,
  ],
  messaging: [
    /\b(whatsapp|telegram|signal|snapchat|viber)\b/gi,
    /\b(dm\s*me|direct\s*message\s*me|message\s*me\s*on)\b/gi,
    /\b(add\s*me\s*on|find\s*me\s*on|contact\s*me\s*(on|via|at))\b/gi,
    /\b(call\s*me|text\s*me|reach\s*me|ring\s*me)\b/gi,
    /\bring\s*(meg|mi|meg\s*på)\b/gi,  // Norwegian variants
  ],
  obfuscated: [
    /\b((zero|one|two|three|four|five|six|seven|eight|nine)[\s\-,.]{1,3}){3,}/gi,
    /(\d+[\s\-]+[a-z]+[\s\-]+\d+){2,}/gi,
    /(\d[\s]{1,3}){5,}\d/g,           // "9 9 9 9 9 8" digit-space sequences
  ],
};
const SCORES = { phone:45, email:50, social:35, messaging:40, obfuscated:35 };

export async function analyzeMessage(text: string): Promise&lt;AnalysisResult&gt; {
  let score = 0;
  const violations: string[] = [];
  for (const [type, patterns] of Object.entries(PATTERNS)) {
    for (const p of patterns) {
      if (p.test(text)) {
        score += SCORES[type as keyof typeof SCORES] || 20;
        violations.push(type);
        p.lastIndex = 0;
        break;
      }
    }
  }
  if (score >= 20 && score &lt; 60) {
    const aiAdd = await classifyWithClaude(text);
    score += aiAdd;
    if (aiAdd > 0) violations.push('ai_flagged');
  }
  return {
    score: Math.min(score, 100), violations,
    action: score >= 90 ? 'block_suspend'
          : score >= 75 ? 'block_notify'
          : score >= 50 ? 'flag_warn' : 'allow',
  };
}</pre>

<h2>Admin-varslingssystem</h2>
<table>
<thead><tr><th>Felt</th><th>Innhold</th><th>Formål</th></tr></thead>
<tbody>
<tr><td class="t-m">user_id</td><td>UUID til bruker</td><td>Kontooppslag og historikk</td></tr>
<tr><td class="t-m">violation_type</td><td>phone / email / social / obfuscated / ai_flagged</td><td>Klassifisering og statistikk</td></tr>
<tr><td class="t-m">risk_score</td><td>0–100</td><td>Alvorlighetsvurdering og prioritering</td></tr>
<tr><td class="t-m">content_original</td><td>Kryptert originaltekst (AES-256)</td><td>Revisjon og juridisk dokumentasjon</td></tr>
<tr><td class="t-m">booking_id</td><td>Tilknyttet bestilling</td><td>Kontekst og sporbarhet</td></tr>
<tr><td class="t-m">action_taken</td><td>Auto-handling utført</td><td>Audit trail</td></tr>
<tr><td class="t-m">severity</td><td>medium / high / critical</td><td>Admin-prioritering</td></tr>
</tbody>
</table>
</section>

<!-- 03 POLICY -->
<section class="sec" id="policy">
<div class="sec-num">03 — LEGAL</div>
<h1 class="sec-title">Kommunikasjonspolicy og<br><em>Informasjonshåndtering</em></h1>
<div class="sec-sub">Juridisk bindende policy for kommunikasjon, datahåndtering, sikkerhetsroller og ansvar. Supplerer Brukervilkårene.</div>

<div class="la">
<div class="a-num">POLICY 1.0</div><div class="a-title">Kommunikasjonskontroll og kanaler</div>
<div class="a-body">
<p><strong>1.1 Eksklusivitetsklausul.</strong> Awaz-plattformen er den eksklusive kommunikasjonskanalen for all korrespondanse mellom kunder og artister etter kontaktinitiering via plattformen — inkludert prisforhandlinger, avtaleinngåelse, logistikk, setlisteforespørsler og arrangementplanlegging.</p>
<p><strong>1.2 Tillatelige kommunikasjonsmetoder.</strong> Meldinger via plattformens innebygde chat (opplåst etter depositumbetaling), prisforespørsler via plattformens forespørselsskjema rettet mot eier, og kommunikasjon med Awaz-administrator via plattformens kontaktfunksjon.</p>
<p><strong>1.3 Automatisert overvåking.</strong> All kommunikasjon på plattformen er underlagt automatisert innholdsanalyse. Awaz AS behandler slik overvåking i henhold til GDPR. Brukere informeres om dette ved registrering.</p>
<p><strong>1.4 Chatopplåsing.</strong> Direktemeldinger mellom kunde og artist låses utelukkende opp etter bekreftet depositumbetaling via Stripe.</p>
</div>
</div>

<div class="la">
<div class="a-num">POLICY 2.0</div><div class="a-title">Informasjonshåndtering og datasikkerhet</div>
<div class="a-body">
<p><strong>2.1 Lagring.</strong> All brukerdata lagres kryptert i EU (Supabase, Frankfurt). Meldingsinnhold: AES-256. Betalingsdata: Stripe PCI Level 1.</p>
<table>
<thead><tr><th>Rolle</th><th>Datatilgang</th><th>Begrensning</th></tr></thead>
<tbody>
<tr><td class="t-b">Kunde</td><td>Egne bestillinger og meldinger</td><td>Ingen tilgang til andres data</td></tr>
<tr><td class="t-b">Artist</td><td>Egne bookinger, meldinger, sin profil</td><td>Ingen tilgang til kundenes finansdata</td></tr>
<tr><td class="t-b">Administrator</td><td>Alle brukerdata og meldinger (kryptert)</td><td>Kun for moderering og juridiske formål</td></tr>
<tr><td class="t-b">Stripe</td><td>Betalingsdata eksklusivt</td><td>Ingen tilgang til meldingsinnhold</td></tr>
</tbody>
</table>
<p><strong>2.2 Dataoppbevaring.</strong> Meldingslogg og transaksjonsdata oppbevares minimum 5 år (bokføringslov, juridiske krav). Profiler slettes innen 30 dager etter gyldig slettingsforespørsel, unntatt regnskapspliktige data.</p>
<p><strong>2.3 Sikkerhetsbrudd.</strong> Awaz AS varsler berørte brukere og Datatilsynet innen 72 timer ved bekreftet sikkerhetsbrudd (GDPR art. 33–34).</p>
</div>
</div>

<div class="la">
<div class="a-num">POLICY 3.0</div><div class="a-title">Sikkerhetsroller og ansvar</div>
<div class="a-body">
<p><strong>3.1 Plattformeiers ansvar.</strong> Awaz AS: infrastruktur og sikkerhet, betalingshåndtering via Stripe, moderering ved ContentGuard-varsler, behandling av klager og tvister.</p>
<p><strong>3.2 Artistens ansvar.</strong> Nøyaktighet i profil- og prisinformasjon, kvalitet på opptredener, overholdelse av skatte- og avgiftsforpliktelser.</p>
<p><strong>3.3 Kundens ansvar.</strong> Korrekte arrangementopplysninger og betaling av balansen direkte til artist.</p>
<div class="cb cb-g"><div class="cb-t">Signaturkrav for artister</div>Artister skal bekrefte å ha lest og forstått disse retningslinjene ved første innlogging etter godkjenning. Manglende bekreftelse innen 7 dager medfører suspensjon av profilen.</div>
</div>
</div>
</section>

<!-- 04 PITCH -->
<section class="sec" id="pitch">
<div class="sec-num">04 — MARKETING</div>
<h1 class="sec-title">Pitch:<br><em>Awaz</em></h1>
<div class="sec-sub">Selgende tekster for investorer, brukere og samarbeidspartnere. Tre versjoner.</div>

<h2>One-Liner (15 sekunder)</h2>
<div class="pitch">
  <div class="ar">آواز</div>
  <div class="ph">The <em>marketplace</em> for<br>Afghan artists in Europe.</div>
  <div class="pb">Verified artists. Direct booking. Secure payments. No middlemen — just culture and trust.</div>
  <div class="ptags"><span class="ptag">Afghan Diaspora</span><span class="ptag">Verified</span><span class="ptag">Stripe</span><span class="ptag">6 Languages</span><span class="ptag">AI Moderated</span></div>
</div>

<h2>Investor / User Pitch (60 sekunder)</h2>
<div class="cb cb-g">
<div class="cb-t">English version</div>
<p style="margin:0;line-height:1.9;font-size:14.5px">Four million Afghan diaspora members live in Europe. They celebrate weddings, Eid, and cultural gatherings — but finding and booking authentic Afghan artists has always meant WhatsApp groups, cash in envelopes, and zero accountability.<br><br>
<strong>Awaz changes that.</strong><br><br>
We are the Airbnb for Afghan artists — a verified, premium marketplace where clients can discover, book and pay in minutes. Every artist is manually reviewed. Every payment goes through Stripe with automatic splits. Every conversation stays on-platform. Our AI moderation protects both parties from the first message.<br><br>
For artists: a professional profile, global market pricing, direct deposits, and the infrastructure of a major label — without one. For clients: the confidence of a verified, insured, five-star booking experience for the most important days of their lives.</p>
</div>

<h2>B2B — Kulturinstitusjoner og arrangementsbyråer</h2>
<div class="cb cb-b">
<div class="cb-t">For partners</div>
<p style="margin:0;line-height:1.9;font-size:14.5px">Planning a cultural event and need verified Afghan talent? Awaz gives you direct access to Europe's most qualified Afghan artists — pre-screened and available with a click.<br><br>
Our B2B portal offers <strong>package pricing</strong>, white-label booking pages, and dedicated account management. From Oslo to Amsterdam to Berlin, we handle logistics, contracts and payments. You focus on the event.<br><br>
<strong>Request a partnership pack: awaz.no/partners</strong></p>
</div>

<h2>Taglines</h2>
<table>
<thead><tr><th>Tagline</th><th>Kontekst</th><th>Tone</th></tr></thead>
<tbody>
<tr><td><em>"The sound of Afghanistan, booked in minutes."</em></td><td>Homepage / generelt</td><td>Premium, emosjonell</td></tr>
<tr><td><em>"Verified artists. Real culture. Zero friction."</em></td><td>Investor / B2B</td><td>Teknisk, tillitsbasert</td></tr>
<tr><td><em>"Book the best — directly."</em></td><td>Mobil-annonse</td><td>Direkte, konverterende</td></tr>
<tr><td><em>"آواز — the voice of every gathering."</em></td><td>Diaspora-marked</td><td>Kulturell, autentisk</td></tr>
</tbody>
</table>
</section>

<!-- 05 INVESTOR -->
<section class="sec" id="investor">
<div class="sec-num">05 — BUSINESS</div>
<h1 class="sec-title">Investorbeskrivelse:<br><em>Awaz AS</em></h1>
<div class="sec-sub">Strategisk investeringscase. Marked, løsning, inntektsmodell, teknologi og vekstpotensial. Konfidensiell.</div>

<div class="metrics">
<div class="metric"><div class="mv">4M+</div><div class="ml">Afghansk diaspora</div><div class="ms">Europa. Primærmarkeder: NO, SE, DE, UK, NL</div></div>
<div class="metric r"><div class="mv">€2.4B</div><div class="ml">Kulturevents-marked</div><div class="ms">Estimert årlig forbruk på bryllup og arrangementer, afghansk diaspora Europa</div></div>
<div class="metric l"><div class="mv">12%</div><div class="ml">Plattformgebyr</div><div class="ms">Av innbetalt depositum per bestilling. Auto-split via Stripe Connect</div></div>
<div class="metric s"><div class="mv">0</div><div class="ml">Direkte konkurrenter</div><div class="ms">Ingen dedikerte plattformer for afghansk kulturscene i Europa</div></div>
</div>

<h2>Problemet vi løser</h2>
<p>Det afghanske diaspora-markedet i Europa betjenes nesten utelukkende gjennom uformelle nettverk: WhatsApp-grupper, muntlige anbefalinger og kontantbetalinger uten kvitteringer. Dette medfører:</p>
<ul><li><strong>Manglende tillit:</strong> Ingen verifisering av artistkvalitet eller identitet</li><li><strong>Null betalingssikkerhet:</strong> Kunder mister depositum, artister opplever no-shows</li><li><strong>Fragmentert marked:</strong> Artister uten profesjonell tilstedeværelse</li><li><strong>Prisdiskriminering:</strong> Uklare forventninger, manglende transparens</li><li><strong>Ingen skalerbarhet:</strong> Lokale nettverk begrenser artistenes geografiske rekkevidde</li></ul>

<h2>Konkurransefortrinn</h2>
<ul><li><strong>Network effects:</strong> Flere artister → bedre valg → flere kunder → høyere etterspørsel → flere artister vil registrere seg.</li><li><strong>Verifiserings-moat:</strong> Manuell godkjenning sikrer kvalitet som automatiserte plattformer ikke kan replikere raskt.</li><li><strong>Kulturell dybde:</strong> Grunnlegger har innebygd kulturell forståelse og nettverk som er umulig å kjøpe.</li><li><strong>Teknologisk infrastruktur:</strong> ContentGuard, Stripe Connect, flerspråklig plattform (6 språk inkl. Dari/Pashto) — bygget for målgruppen.</li><li><strong>First-mover advantage:</strong> Ingen sammenlignbare konkurrenter identifisert i målmarkedet.</li></ul>

<h2>Inntektsmodell</h2>
<table>
<thead><tr><th>Strøm</th><th>Mekanisme</th><th>Est. andel år 2</th></tr></thead>
<tbody>
<tr><td class="t-b">Plattformgebyr</td><td>12% av hvert depositum via Stripe</td><td>~60%</td></tr>
<tr><td class="t-b">Artist Boost</td><td>Betalt plassering i søk og featured-seksjon</td><td>~20%</td></tr>
<tr><td class="t-b">Premium Artist</td><td>Månedlig abonnement for utvidede funksjoner</td><td>~12%</td></tr>
<tr><td class="t-b">B2B API / White-label</td><td>Plattform-som-tjeneste til arrangementsbyråer</td><td>~8%</td></tr>
</tbody>
</table>

<h2>Skaleringsveikart</h2>
<table>
<thead><tr><th>Fase</th><th>Fokus</th><th>KPI</th></tr></thead>
<tbody>
<tr><td class="t-b">Fase 1 — 2025</td><td>Norge: 20 verifiserte artister, 100 bestillinger</td><td>NOK 200K ARR</td></tr>
<tr><td class="t-b">Fase 2 — 2026</td><td>Skandinavia + UK + DE: 80 artister</td><td>NOK 1.2M ARR</td></tr>
<tr><td class="t-b">Fase 3 — 2027</td><td>Pan-Europa + UAE. B2B-portal. Premium-abonnement</td><td>NOK 6M ARR</td></tr>
<tr><td class="t-b">Fase 4 — 2028+</td><td>Utvidelse til andre diaspora-kulturer (somalisk, eritreisk)</td><td>NOK 20M+ ARR</td></tr>
</tbody>
</table>

<div class="cb cb-r"><div class="cb-t">Investeringsforespørsel</div>Awaz søker NOK 1,5 millioner i pre-seed-kapital for å: (1) fullføre teknisk infrastruktur og Supabase-integrasjon, (2) ansette deltids community manager, (3) gjennomføre strukturert artist-onboarding-program, og (4) delta i diaspora-messe-arrangementer. Investeringen gir X% eierandel (fastsettes i forhandling).</div>
</section>

<!-- 06 TECH SPEC -->
<section class="sec" id="techspec">
<div class="sec-num">06 — TECHNICAL</div>
<h1 class="sec-title">Teknisk<br><em>Spesifikasjon</em></h1>
<div class="sec-sub">Arkitektur, moduldesign, databaseskjema, sikkerhet og funksjonell spesifikasjon. Grunnlag for implementasjon av et senior-utviklerteam.</div>

<h2>Systemarkitektur</h2>
<pre>┌──────────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                                │
│  React 18 + Vite · Single-file SPA · Mobile-first               │
│  6 languages: EN NO DE FR DA(Dari) PS(Pashto) · RTL auto        │
│  Dark / Light theme · WCAG AAA contrast on all text             │
└─────────────────────────┬────────────────────────────────────────┘
                          │ HTTPS + Supabase Realtime (WebSocket)
┌─────────────────────────▼────────────────────────────────────────┐
│                      BACKEND LAYER — Supabase (EU Frankfurt)     │
│  ├── PostgreSQL 15 + Row Level Security (RLS) on all tables      │
│  ├── Auth: JWT · email/password · OAuth-ready                    │
│  ├── Edge Functions (Deno): ContentGuard · Webhooks              │
│  ├── Realtime: message subscriptions (WebSocket)                 │
│  └── Storage: artist photos (max 5MB, image/*)                  │
└─────────────┬──────────────┬──────────────┬──────────────────────┘
              │              │              │
   ┌──────────▼──┐   ┌───────▼──────┐  ┌───▼──────────┐
   │  Stripe API  │   │  Claude API   │  │   Vercel CDN  │
   │  Connect     │   │  Sonnet 4     │  │   Edge Deploy │
   │  auto-split  │   │  ContentGuard │  │   Global CDN  │
   └─────────────┘   └──────────────┘  └──────────────┘</pre>

<h2>Teknologivalg</h2>
<table>
<thead><tr><th>Lag</th><th>Teknologi</th><th>Begrunnelse</th></tr></thead>
<tbody>
<tr><td class="t-b">Frontend</td><td class="t-m">React 18 + Vite</td><td>Enkel deployment, full kontroll, ingen SSR overhead</td></tr>
<tr><td class="t-b">Database</td><td class="t-m">Supabase/PostgreSQL</td><td>EU-hosting, RLS, Realtime, Auth og Storage i ett. GDPR-compliant.</td></tr>
<tr><td class="t-b">Auth</td><td class="t-m">Supabase Auth (JWT)</td><td>Innebygd, sikker, e-postverifisering, OAuth-klar</td></tr>
<tr><td class="t-b">Betalinger</td><td class="t-m">Stripe Connect</td><td>PCI Level 1, automatisk split, 135+ valutaer</td></tr>
<tr><td class="t-b">AI Moderation</td><td class="t-m">Claude Sonnet (Anthropic)</td><td>Høyest nøyaktighet for tvetydig innhold</td></tr>
<tr><td class="t-b">Hosting</td><td class="t-m">Vercel Edge Network</td><td>Global CDN, auto-deploy fra GitHub, null-konfig SSL</td></tr>
</tbody>
</table>

<h2>Databaseskjema</h2>
<div class="dbt">
<div class="dbh"><div class="dbn">profiles</div><div class="dbd">Extends auth.users — rolle, artistkobling, bruddsporing</div></div>
<table><thead><tr><th>Kolonne</th><th>Type</th><th>Default</th><th>Beskrivelse</th></tr></thead>
<tbody>
<tr><td class="t-m">id</td><td>uuid PK</td><td>—</td><td>FK → auth.users(id)</td></tr>
<tr><td class="t-m">role</td><td>text</td><td>'customer'</td><td>customer | artist | admin</td></tr>
<tr><td class="t-m">artist_id</td><td>uuid FK</td><td>null</td><td>→ artists(id)</td></tr>
<tr><td class="t-m">status</td><td>text</td><td>'active'</td><td>active | warned | suspended | banned</td></tr>
<tr><td class="t-m">violation_count</td><td>int</td><td>0</td><td>ContentGuard-bruddteller</td></tr>
</tbody></table>
</div>

<div class="dbt">
<div class="dbh"><div class="dbn">artists</div><div class="dbd">Artistprofiler med boost, landpriser og Stripe Connect</div></div>
<table><thead><tr><th>Kolonne</th><th>Type</th><th>Beskrivelse</th></tr></thead>
<tbody>
<tr><td class="t-m">id</td><td>uuid PK</td><td>gen_random_uuid()</td></tr>
<tr><td class="t-m">status</td><td>text</td><td>pending | approved | suspended | rejected</td></tr>
<tr><td class="t-m">boost_active</td><td>boolean</td><td>Aktiv annonse-løft (admin-styrt)</td></tr>
<tr><td class="t-m">boost_level</td><td>int</td><td>0=ingen, 1=standard, 2=premium, 3=featured</td></tr>
<tr><td class="t-m">boost_expires_at</td><td>timestamptz</td><td>Utløpsdato for boost</td></tr>
<tr><td class="t-m">country_pricing</td><td>jsonb</td><td>Array: [{code, price, deposit, active, currency}]</td></tr>
</tbody></table>
</div>

<div class="dbt">
<div class="dbh"><div class="dbn">messages</div><div class="dbd">Chat med ContentGuard violation tracking</div></div>
<table><thead><tr><th>Kolonne</th><th>Type</th><th>Beskrivelse</th></tr></thead>
<tbody>
<tr><td class="t-m">content</td><td>text</td><td>Eventuelt redigert ved blokkering</td></tr>
<tr><td class="t-m">content_original</td><td>text encrypted</td><td>Originaltekst bevart for revisjon (AES-256)</td></tr>
<tr><td class="t-m">is_blocked</td><td>boolean</td><td>ContentGuard blokkerte meldingen</td></tr>
<tr><td class="t-m">risk_score</td><td>int</td><td>ContentGuard-score 0–100</td></tr>
<tr><td class="t-m">violation_type</td><td>text</td><td>phone | email | social | obfuscated | ai_flagged</td></tr>
</tbody></table>
</div>

<pre>-- Additional tables (SQL)
CREATE TABLE violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  message_id uuid REFERENCES messages(id),
  violation_type text NOT NULL,
  detected_pattern text,       -- encrypted
  risk_score int,
  action_taken text,           -- warned|blocked|suspended
  admin_notified boolean DEFAULT false,
  resolved boolean DEFAULT false,
  resolved_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE artist_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid REFERENCES artists(id) UNIQUE,
  boost_level int DEFAULT 1,   -- 1=standard, 2=premium, 3=featured
  activated_by uuid REFERENCES profiles(id),
  activated_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  reason text,
  price_paid int DEFAULT 0     -- NOK/EUR paid by artist (0 = complimentary)
);

CREATE TABLE admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,          -- violation|inquiry|artist_pending|boost_expiring
  severity text DEFAULT 'medium',  -- low|medium|high|critical
  title text, body text,
  related_id uuid, related_type text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);</pre>

<h2>RLS Policies (eksempler)</h2>
<pre>-- Customers: own bookings only
CREATE POLICY "customer_own_bookings" ON bookings FOR SELECT
  USING (auth.uid() = customer_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));

-- Messages: booking participants + admin only
CREATE POLICY "message_read" ON messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM bookings b WHERE b.id = messages.booking_id AND (
      b.customer_id = auth.uid() OR
      EXISTS (SELECT 1 FROM profiles p JOIN artists a ON p.artist_id=a.id
              WHERE p.id=auth.uid() AND a.id=b.artist_id)
    )
  ) OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));</pre>

<h2>Moduloversikt — Frontend</h2>
<table>
<thead><tr><th>Modul</th><th>Funksjon</th><th>Nøkkelkomponenter</th></tr></thead>
<tbody>
<tr><td class="t-b">Auth</td><td>Registrering, innlogging, glemt passord</td><td>LoginSheet, ApplySheet</td></tr>
<tr><td class="t-b">Discovery</td><td>Søk, filtrering, AI-matching</td><td>BrowsePage, ArtistCard, AIWidget</td></tr>
<tr><td class="t-b">Booking</td><td>Dato → skjema → Stripe → chat-opplåsing</td><td>ProfilePage, MiniCal, StripeCheckout</td></tr>
<tr><td class="t-b">Chat</td><td>Post-deposit direktemelding + ContentGuard</td><td>Chat, ContentGuardClient</td></tr>
<tr><td class="t-b">Inquiry</td><td>Prisforespørsel til eier</td><td>InquiryWidget, InquirySheet</td></tr>
<tr><td class="t-b">Artist Portal</td><td>Dashboard, kalender, landprising, sosiale medier</td><td>ArtistPortal, CountryPricingTab</td></tr>
<tr><td class="t-b">Admin</td><td>Bestillinger, artister, forespørsler, økonomi, boost</td><td>AdminDash, InquiryPanel</td></tr>
<tr><td class="t-b">i18n</td><td>6 språk, RTL for Dari/Pashto</td><td>TRANSLATIONS, t(), LangSwitcher</td></tr>
<tr><td class="t-b">Theme</td><td>Dark/light, WCAG AAA kontraster</td><td>DARK/LIGHT tokens, Proxy C</td></tr>
<tr><td class="t-b">ContentGuard</td><td>Klient-side pre-check + server-side blokkering</td><td>analyzeMessage(), Edge Function</td></tr>
</tbody>
</table>
</section>

<!-- 07 ADMIN -->
<section class="sec" id="admin">
<div class="sec-num">07 — ADMIN</div>
<h1 class="sec-title">Admin-funksjoner:<br><em>Komplett spesifikasjon</em></h1>
<div class="sec-sub">Overvåking, moderering, boost-system og administrasjon. Direkte implementerbart med eksisterende kodebase.</div>

<div class="ac">
<div class="ach"><div class="aci">📊</div><div class="act">Overview</div><div class="acb">IMPLEMENTED</div></div>
<div class="acd">Sanntids-KPIer: totale deposita, Awaz-inntekt (12%), bekreftede bestillinger, artister under review, ventende forespørsler. Siste 4 bestillinger med status-badges.</div>
</div>

<div class="ac">
<div class="ach"><div class="aci">📬</div><div class="act">Inquiries — Prisforespørsler</div><div class="acb">IMPLEMENTED</div></div>
<div class="acd"><ul>
<li>Alle innkommende prisforespørsler med status (Ny / Sett / Besvart)</li>
<li>Detaljvisning: land, arrangementtype, budsjettspenn, foretrukket artist, full melding</li>
<li>Internt notisfelt (kun for admin — brukes til artistkonsultasjon)</li>
<li>Svarfunksjon: tekst som i produksjon sendes som e-post til forespørrer</li>
<li>Rød badge-teller på nav-ikonet for uleste forespørsler</li>
</ul></div>
</div>

<div class="ac">
<div class="ach"><div class="aci">🛡</div><div class="act">ContentGuard — Violations og overvåking</div><div class="acb">SPEC READY</div></div>
<div class="acd"><p><strong>Implementeringskrav:</strong></p><ul>
<li>Ny admin-fane «Violations» med liste over alle ContentGuard-hendelser</li>
<li>Hvert oppslag viser: bruker, meldingsutdrag (kryptert), type brudd, risikopoeng, status, handling utført</li>
<li>Admin kan: eskalere sanksjon, frikjenne brudd (false positive), suspendere konto, sende advarsel</li>
<li>Filter: etter type (phone/email/social/ai), alvorlighet (high/critical), status (ubehandlet/løst)</li>
<li>Kritisk-badge (rød pulserende) ved brudd ≥ 90</li>
<li>CSV-eksport av violation-log for juridisk dokumentasjon</li>
</ul></div>
</div>

<div class="ac">
<div class="ach"><div class="aci">🎤</div><div class="act">Artist Management</div><div class="acb">IMPLEMENTED</div></div>
<div class="acd"><ul>
<li>Alle artister med status (Pending / Approved / Suspended / Rejected)</li>
<li>Handlingsknapper: Godkjenn ✓, Avslå ✗, Suspender, Gjenopprett</li>
<li>Verifiserings- og Stripe Connect-status per artist</li>
<li>Antall ventende søknader som rød badge på nav-ikon</li>
</ul></div>
</div>

<h2>Artist Boost — Annonse-løft</h2>
<div class="cb cb-g"><div class="cb-t">Formål</div>Boost-systemet gir admin full kontroll over hvem som vises fremst i søk og på forsiden. Kan brukes som insentiv for betalende artister, del av velkomstpakker, eller for å fremme kulturelt viktige arrangementer.</div>

<div class="ac">
<div class="ach"><div class="aci">⚡</div><div class="act">Boost Administration</div><div class="acb">SPEC READY</div></div>
<div class="acd">
<table>
<thead><tr><th>Nivå</th><th>Visning</th><th>Søkeposisjon</th><th>Anbefalt pris</th></tr></thead>
<tbody>
<tr><td class="t-b">1 — Standard</td><td>Gullborder på artistkort</td><td>Topp 5 i sjangerkategori</td><td>NOK 299/mnd</td></tr>
<tr><td class="t-b">2 — Premium</td><td>«Featured»-badge + høyere oppsett</td><td>Topp 3 i alle kategorier</td><td>NOK 699/mnd</td></tr>
<tr><td class="t-b">3 — Featured</td><td>«Artist of the Month» på forsiden</td><td>#1 forsiden, uthevet søk</td><td>NOK 1 499/mnd</td></tr>
</tbody>
</table>
<p><strong>Admin-grensesnitt (implementeringskrav):</strong></p>
<ul>
<li>«Boost»-knapp per artist i Artist-fanen → åpner Boost-skjema</li>
<li>Skjema-felter: Boost-nivå (1/2/3), Startdato, Utløpsdato, Intern begrunnelse, Betalt beløp (0 = gratis)</li>
<li>Aktive boosts: nedtelling til utløp + fornyelse/avslutning-knapper</li>
<li>Boost-historikk: alle tidligere boosts med dato, nivå, aktivert av</li>
</ul>
<pre style="margin-top:12px">// Søkealgoritme med boost-sortering
const sortArtists = (artists) =>
  artists.sort((a, b) => {
    if (a.boost_level !== b.boost_level)
      return (b.boost_level || 0) - (a.boost_level || 0);
    if (a.superhost !== b.superhost) return b.superhost ? 1 : -1;
    const wA = a.rating * Math.log10(a.reviews + 1);
    const wB = b.rating * Math.log10(b.reviews + 1);
    return wB - wA;
  });</pre>
</div>
</div>

<h2>Admin-notifikasjonsprioritering</h2>
<table>
<thead><tr><th>Hendelse</th><th>Severity</th><th>Auto-handling</th><th>Admin-handling</th></tr></thead>
<tbody>
<tr><td class="t-b">ContentGuard score ≥ 90</td><td style="color:var(--ruby);font-weight:700">CRITICAL</td><td>Blokkert + konto flagget</td><td>Suspender / frikjenn</td></tr>
<tr><td class="t-b">ContentGuard score 75–89</td><td style="color:var(--saffron);font-weight:700">HIGH</td><td>Blokkert + brukervarsel</td><td>Gjennomgå innen 24t</td></tr>
<tr><td class="t-b">Ny prisforespørsel</td><td style="color:var(--lapis);font-weight:700">MEDIUM</td><td>Varsel til admin</td><td>Svar innen 24t</td></tr>
<tr><td class="t-b">Ny artist-søknad</td><td style="color:var(--lapis);font-weight:700">MEDIUM</td><td>Varsel til admin</td><td>Gjennomgå innen 48t</td></tr>
<tr><td class="t-b">Boost utløper om 3 dager</td><td style="color:var(--muted);font-weight:700">LOW</td><td>Auto-varsel til admin</td><td>Forny / la utløpe</td></tr>
</tbody>
</table>
</section>

<div class="sig">
  <div class="ar">آواز</div>
  <div class="tl">"The voice of every gathering."</div>
  <div class="yr">AWAZ AS &middot; OSLO &middot; 2025 &middot; CONFIDENTIAL</div>
</div>

</main>
</div>
</body>
</html>
