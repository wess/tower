import { get, pipe } from "@atlas/server"
import { html } from "../../web/html.ts"
import { FONTS, themeVars } from "../../web/theme.ts"

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>wess.dev — deploy your apps in seconds</title>
<meta name="description" content="Push your code and wess.dev runs it — fast, isolated, and ready to scale. No servers to manage. Powered by Tower." />
${FONTS}
<style>
  :root{${themeVars}}
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  body{background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:17px;line-height:1.5;
    background-image:radial-gradient(rgba(136,192,208,.06) 0.7px,transparent 0.7px);background-size:26px 26px;background-position:-13px -13px}
  a{color:inherit;text-decoration:none}
  ::selection{background:rgba(136,192,208,.3);color:var(--fg)}
  .wrap{max-width:1160px;margin:0 auto;padding:0 clamp(20px,5vw,56px)}

  /* header */
  header{display:flex;align-items:center;justify-content:space-between;padding:26px 0;border-bottom:1px solid var(--line)}
  .brand{font-family:var(--serif);font-weight:900;font-size:23px;letter-spacing:-.02em}
  .brand b{color:var(--accent)}
  nav{display:flex;align-items:center;gap:30px;font-size:14px;font-weight:500}
  nav a{color:var(--ink-soft);transition:color .15s} nav a:hover{color:var(--accent)}
  .powered{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:7px}
  .powered svg{display:block}

  /* hero */
  .hero{padding:clamp(64px,11vw,128px) 0 clamp(40px,7vw,84px);max-width:920px}
  .eyebrow{font-size:12.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent-deep);font-weight:600;margin-bottom:30px}
  h1{font-family:var(--serif);font-weight:900;font-size:clamp(44px,8.5vw,104px);line-height:.96;letter-spacing:-.03em}
  h1 em{font-style:italic;font-weight:600;color:var(--accent)}
  .lede{font-size:clamp(18px,2.3vw,23px);line-height:1.45;color:var(--ink-soft);max-width:610px;margin-top:clamp(26px,3vw,38px)}
  .lede b{color:var(--ink);font-weight:600}
  .cta{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:40px}
  .btn{font-family:var(--sans);font-weight:600;font-size:15.5px;padding:14px 26px;border-radius:2px;transition:transform .14s cubic-bezier(.2,.8,.2,1),background .15s}
  .btn{border-radius:8px}
  .btn.primary{background:var(--accent);color:var(--on-accent)}
  .btn.primary:hover{transform:translateY(-2px);filter:brightness(1.08)}
  .btn.ghost{color:var(--fg-2);border-bottom:2px solid var(--accent-deep);border-radius:0;padding:14px 4px}
  .btn.ghost:hover{color:var(--accent);border-color:var(--accent)}

  /* swiss metadata strip */
  .strip{display:flex;flex-wrap:wrap;gap:8px 30px;padding:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);
    font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600}
  .strip span{display:flex;align-items:center;gap:9px}
  .strip span::before{content:"";width:5px;height:5px;background:var(--accent);border-radius:50%}

  /* feature ledger */
  .ledger{padding:clamp(40px,6vw,72px) 0}
  .row{display:grid;grid-template-columns:64px 1fr;gap:clamp(16px,4vw,56px);padding:30px 0;border-bottom:1px solid var(--line);align-items:start}
  .row:first-child{border-top:1px solid var(--line)}
  .row .no{font-family:var(--serif);font-size:30px;font-weight:600;font-style:italic;color:var(--accent)}
  .row .body{display:grid;grid-template-columns:minmax(220px,1fr) 1.4fr;gap:clamp(12px,3vw,48px);align-items:baseline}
  .row h3{font-family:var(--serif);font-size:clamp(22px,2.6vw,30px);font-weight:600;letter-spacing:-.015em;line-height:1.1}
  .row p{color:var(--ink-soft);font-size:16px;line-height:1.55;max-width:46ch}

  /* deploy specimen */
  .specimen{margin:clamp(20px,5vw,64px) 0 clamp(60px,8vw,96px);border:1px solid var(--line-2);background:var(--bg-1);border-radius:12px;
    box-shadow:0 18px 50px -20px rgba(0,0,0,.6)}
  .specimen .bar{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid var(--line);
    font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;color:var(--muted)}
  .specimen .bar .tag{color:var(--accent)}
  .specimen pre{padding:clamp(20px,4vw,34px);font-family:var(--mono);font-size:clamp(13px,1.6vw,15px);line-height:1.9;overflow-x:auto}
  .specimen .p{color:var(--accent);font-weight:700} .specimen .c{color:var(--fg)} .specimen .o{color:var(--muted)}

  /* footer */
  footer{border-top:1px solid var(--line);padding:38px 0 56px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:20px}
  .foot-brand{font-family:var(--serif);font-weight:900;font-size:38px;letter-spacing:-.03em;line-height:1}
  .foot-brand b{color:var(--accent)}
  .foot-meta{text-align:right;font-size:13px;color:var(--muted);line-height:1.7}
  .foot-meta .pw{display:inline-flex;align-items:center;gap:8px;color:var(--ink);font-weight:600;font-size:14px;margin-top:4px}

  .reveal{opacity:0;transform:translateY(14px);animation:rise .8s cubic-bezier(.16,1,.3,1) forwards}
  .d1{animation-delay:.05s}.d2{animation-delay:.13s}.d3{animation-delay:.21s}.d4{animation-delay:.29s}
  @keyframes rise{to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){.reveal{animation:none;opacity:1;transform:none}}
  @media (max-width:680px){.row .body{grid-template-columns:1fr}.row{grid-template-columns:40px 1fr}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">wess<b>.</b>dev</div>
    <nav>
      <a href="/docs">Docs</a>
      <a href="/admin">Console</a>
      <a href="https://github.com/wess">GitHub</a>
      <span class="powered">
        <svg width="13" height="15" viewBox="0 0 13 15" fill="none"><rect x="2" y="9" width="9" height="5" fill="#88c0d0"/><rect x="3.5" y="5" width="6" height="4" fill="#d8dee9"/><rect x="5" y="1" width="3" height="4" fill="#d8dee9"/></svg>
        powered by Tower
      </span>
    </nav>
  </header>

  <section class="hero">
    <div class="eyebrow reveal d1">Ship in seconds · powered by Tower</div>
    <h1 class="reveal d2">Your app, live<br/>in <em>seconds</em>.</h1>
    <p class="lede reveal d3">Push your code and wess.dev runs it — <b>fast, secure, and ready to scale</b>. No servers to manage, no infrastructure to babysit.</p>
    <div class="cta reveal d4">
      <a class="btn primary" href="/docs">Get started →</a>
      <a class="btn ghost" href="/docs/deploy">Deploy with git push</a>
    </div>
  </section>

  <div class="strip">
    <span>Deploy in seconds</span><span>Databases &amp; vectors</span><span>AI built in</span><span>Secure by default</span>
  </div>

  <section class="ledger">
    <div class="row"><div class="no">01</div><div class="body"><h3>Ship without the setup</h3><p>Push your app and it's live. No provisioning, no config files to wrangle, no infrastructure to stand up first.</p></div></div>
    <div class="row"><div class="no">02</div><div class="body"><h3>Databases, included</h3><p>Every app gets its own database the moment you deploy — wired up and ready. No setup, no connection strings to copy around.</p></div></div>
    <div class="row"><div class="no">03</div><div class="body"><h3>Secure out of the box</h3><p>Your apps run fully isolated from one another, with private networking handled for you. Nothing to configure, nothing to leak.</p></div></div>
    <div class="row"><div class="no">04</div><div class="body"><h3>Built for AI</h3><p>Attach any model — Anthropic, OpenAI, or Ollama — and your app calls one gateway. Vectors come standard, and an isolated sandbox runs untrusted code safely.</p></div></div>
  </section>

  <figure class="specimen">
    <div class="bar"><span class="tag">deploy.log</span><span>wess.dev</span></div>
<pre><span class="p">$</span> <span class="c">git push wess main</span>
<span class="o">  -----> building blog from main</span>
<span class="o">  -----> setting up your database</span>
<span class="o">  -----> starting your app</span>
<span class="o">  -----> ✓ blog is live</span>
<span class="o">         https://blog.wess.dev</span></pre>
  </figure>
</div>

<footer class="wrap">
  <div class="foot-brand">wess<b>.</b>dev</div>
  <div class="foot-meta">
    The simplest way to ship your apps.<br/>
    <span class="pw">
      <svg width="13" height="15" viewBox="0 0 13 15" fill="none"><rect x="2" y="9" width="9" height="5" fill="#88c0d0"/><rect x="3.5" y="5" width="6" height="4" fill="#d8dee9"/><rect x="5" y="1" width="3" height="4" fill="#d8dee9"/></svg>
      powered by Tower
    </span>
  </div>
</footer>
</body>
</html>`

export const landingRoutes = [get("/", pipe((c) => html(c, 200, PAGE)))]
