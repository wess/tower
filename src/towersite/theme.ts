// Tower site design tokens. Nord palette (shared brand with wess.dev) but a
// distinct, terminal/infra voice: Space Grotesk display + JetBrains Mono.

export const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>`

export const vars = `
  --n0:#2e3440; --n1:#3b4252; --n2:#434c5e; --n3:#4c566a;
  --n4:#d8dee9; --n5:#e5e9f0; --n6:#eceff4; --muted:#9aa7bd;
  --frost1:#8fbcbb; --frost2:#88c0d0; --frost3:#81a1c1; --frost4:#5e81ac;
  --green:#a3be8c; --yellow:#ebcb8b; --red:#bf616a; --orange:#d08770; --purple:#b48ead;
  --accent:#88c0d0; --accent2:#8fbcbb; --line:#3b4252; --line2:#434c5e;
  --display:"Space Grotesk",system-ui,sans-serif; --sans:"Inter",system-ui,sans-serif; --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
`

export const base = `
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{background:var(--n0);color:var(--n6);font-family:var(--sans);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased;
    background-image:radial-gradient(rgba(136,192,208,.05) 0.7px,transparent 0.7px);background-size:28px 28px}
  a{color:var(--accent);text-decoration:none} a:hover{color:var(--frost1)}
  ::selection{background:rgba(136,192,208,.28);color:var(--n6)}
  code,kbd,pre{font-family:var(--mono)}
  ::-webkit-scrollbar{width:11px;height:11px} ::-webkit-scrollbar-track{background:var(--n0)}
  ::-webkit-scrollbar-thumb{background:var(--n3);border:3px solid var(--n0);border-radius:7px}
  .wrap{max-width:1080px;margin:0 auto;padding:0 clamp(20px,5vw,40px)}
`

// stacked-block tower glyph (matches the wess.dev "powered by Tower" mark)
export const glyph = (size = 26) =>
  `<svg width="${size}" height="${Math.round((size * 15) / 13)}" viewBox="0 0 13 15" fill="none" aria-hidden="true"><rect x="2" y="9" width="9" height="5" rx="1" fill="#88c0d0"/><rect x="3.5" y="5" width="6" height="4" rx="1" fill="#d8dee9"/><rect x="5" y="1" width="3" height="4" rx="1" fill="#d8dee9"/></svg>`

// shared site chrome
export const header = (active: "home" | "docs") => `
<header class="site-top"><div class="wrap topbar">
  <a class="logo" href="/">${glyph(22)}<span>Tower</span></a>
  <nav>
    <a href="/docs" class="${active === "docs" ? "on" : ""}">Docs</a>
    <a href="/docs/quickstart">Quick start</a>
    <a href="https://github.com/wess/tower">GitHub</a>
  </nav>
</div></header>`

export const footer = () => `
<footer class="site-foot"><div class="wrap footrow">
  <div class="fl"><a class="logo" href="/">${glyph(20)}<span>Tower</span></a><p>Your own PaaS. Your own metal.</p></div>
  <div class="fr">
    <a href="/docs">Docs</a><a href="/docs/quickstart">Quick start</a><a href="https://github.com/wess/tower">GitHub</a><a href="https://github.com/wess/tower/blob/main/LICENSE">Apache&nbsp;2.0</a>
  </div>
</div></footer>`

export const page = (title: string, bodyClass: string, inner: string, extraCss = "") => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<meta name="description" content="Tower — a self-hostable, Fly.io-style PaaS. Push your code and it boots as an isolated Firecracker microVM with a database and AI gateway built in."/>
${FONTS}
<style>:root{${vars}} ${base} ${CHROME_CSS} ${extraCss}</style>
</head><body class="${bodyClass}">${inner}</body></html>`

const CHROME_CSS = `
  .site-top{position:sticky;top:0;z-index:30;background:rgba(46,52,64,.82);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
  .topbar{display:flex;align-items:center;justify-content:space-between;height:62px}
  .logo{display:flex;align-items:center;gap:9px;font-family:var(--display);font-weight:700;font-size:19px;color:var(--n6);letter-spacing:-.01em}
  .logo:hover{color:var(--n6)}
  .site-top nav{display:flex;align-items:center;gap:26px;font-size:14.5px;font-weight:500}
  .site-top nav a{color:var(--muted)} .site-top nav a:hover,.site-top nav a.on{color:var(--accent)}
  .site-foot{border-top:1px solid var(--line);margin-top:80px;padding:38px 0}
  .footrow{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap}
  .footrow .fl p{color:var(--muted);font-size:13.5px;margin-top:8px}
  .footrow .fr{display:flex;gap:22px;flex-wrap:wrap;font-size:14px} .footrow .fr a{color:var(--muted)} .footrow .fr a:hover{color:var(--accent)}
  @media(max-width:560px){ .site-top nav{gap:16px;font-size:13.5px} .topbar{height:56px} }
`
