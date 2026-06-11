import { footer, glyph, header, page } from "./theme.ts"

const LANDING_CSS = `
  .hero{padding:clamp(64px,11vw,120px) 0 clamp(40px,6vw,72px)}
  .hero .eyebrow{display:inline-flex;align-items:center;gap:9px;font-family:var(--mono);font-size:12.5px;letter-spacing:.06em;color:var(--accent);
    border:1px solid var(--line2);background:var(--n1);border-radius:999px;padding:6px 14px;margin-bottom:26px}
  .hero h1{font-family:var(--display);font-weight:700;font-size:clamp(40px,7vw,80px);line-height:1.02;letter-spacing:-.03em;max-width:14ch}
  .hero h1 .g{background:linear-gradient(120deg,var(--frost2),var(--frost1) 60%,var(--green));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  .hero p.lede{font-size:clamp(17px,2.1vw,21px);color:var(--n4);max-width:60ch;margin-top:24px;line-height:1.5}
  .hero p.lede b{color:var(--n6);font-weight:600}
  .cta{display:flex;gap:14px;flex-wrap:wrap;margin-top:34px}
  .btn{font-family:var(--display);font-weight:600;font-size:15.5px;padding:13px 24px;border-radius:10px;transition:transform .14s,filter .14s,border-color .14s;display:inline-flex;align-items:center;gap:9px}
  .btn.primary{background:var(--accent);color:var(--n0)} .btn.primary:hover{transform:translateY(-2px);filter:brightness(1.08);color:var(--n0)}
  .btn.ghost{border:1px solid var(--line2);color:var(--n5)} .btn.ghost:hover{border-color:var(--accent);color:var(--accent)}
  .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(28px,5vw,56px);align-items:center}
  @media(max-width:880px){.hero-grid{grid-template-columns:1fr}}

  /* terminal */
  .term{background:#272c36;border:1px solid var(--line2);border-radius:14px;overflow:hidden;box-shadow:0 24px 70px -24px rgba(0,0,0,.7)}
  .term .bar{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--line);background:#2b303b}
  .term .bar i{width:11px;height:11px;border-radius:50%;display:block}
  .term .bar .r{background:#bf616a}.term .bar .y{background:#ebcb8b}.term .bar .g{background:#a3be8c}
  .term .bar span{margin-left:8px;font-family:var(--mono);font-size:12px;color:var(--muted)}
  .term pre{margin:0;padding:18px 20px;font-family:var(--mono);font-size:13.5px;line-height:1.95;overflow-x:auto;color:var(--n4)}
  .term .p{color:var(--accent);font-weight:600} .term .c{color:var(--n6)} .term .o{color:var(--muted)} .term .ok{color:var(--green)}

  /* section */
  section.band{padding:clamp(36px,6vw,64px) 0;border-top:1px solid var(--line)}
  .band h2{font-family:var(--display);font-weight:700;font-size:clamp(26px,3.4vw,38px);letter-spacing:-.02em;margin-bottom:10px}
  .band .sub{color:var(--muted);font-size:16px;max-width:62ch;margin-bottom:34px}

  /* feature grid */
  .feats{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
  @media(max-width:820px){.feats{grid-template-columns:1fr 1fr}} @media(max-width:540px){.feats{grid-template-columns:1fr}}
  .feat{background:var(--n1);border:1px solid var(--line2);border-radius:14px;padding:22px 22px 24px;transition:border-color .15s,transform .15s}
  .feat:hover{border-color:var(--accent);transform:translateY(-3px)}
  .feat .ic{font-family:var(--mono);font-size:13px;color:var(--accent);background:rgba(136,192,208,.12);border-radius:8px;width:38px;height:38px;display:grid;place-items:center;margin-bottom:14px}
  .feat h3{font-family:var(--display);font-size:18px;font-weight:600;margin-bottom:7px;letter-spacing:-.01em}
  .feat p{color:var(--muted);font-size:14.5px;line-height:1.55}
  .feat code{color:var(--frost1);font-size:.92em}

  /* steps */
  .steps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;counter-reset:s}
  @media(max-width:820px){.steps{grid-template-columns:1fr 1fr}} @media(max-width:480px){.steps{grid-template-columns:1fr}}
  .step{border-left:2px solid var(--line2);padding:4px 0 4px 18px;position:relative}
  .step::before{counter-increment:s;content:"0" counter(s);font-family:var(--mono);font-size:12px;color:var(--accent);font-weight:600}
  .step h4{font-family:var(--display);font-size:16px;font-weight:600;margin:6px 0 5px}
  .step p{color:var(--muted);font-size:14px;line-height:1.5}
  .step code{color:var(--frost1);font-size:.9em;background:var(--n1);padding:1px 6px;border-radius:5px}

  .closing{text-align:center;padding:clamp(50px,8vw,90px) 0}
  .closing h2{font-family:var(--display);font-weight:700;font-size:clamp(28px,4.4vw,46px);letter-spacing:-.02em}
  .closing p{color:var(--muted);margin:16px auto 30px;max-width:50ch}
`

const TERMINAL = `<div class="term">
  <div class="bar"><i class="r"></i><i class="y"></i><i class="g"></i><span>deploy.sh</span></div>
<pre><span class="p">$</span> <span class="c">curl -fsSL https://wess.dev/install.sh | sh</span>
<span class="p">$</span> <span class="c">wess login</span>
<span class="p">$</span> <span class="c">wess create blog</span>
<span class="p">$</span> <span class="c">git push wess main</span>
<span class="o">  -----> building blog from main</span>
<span class="o">  -----> docker build → image ready</span>
<span class="o">  -----> provisioning database</span>
<span class="o">  -----> booting microVM</span>
<span class="ok">  -----> ✓ blog is live</span>
<span class="o">         https://blog.wess.dev</span></pre>
</div>`

const feat = (ic: string, h: string, p: string) =>
  `<div class="feat"><div class="ic">${ic}</div><h3>${h}</h3><p>${p}</p></div>`

const step = (h: string, p: string) => `<div class="step"><h4>${h}</h4><p>${p}</p></div>`

const INNER = `
${header("home")}
<main class="wrap">
  <section class="hero">
    <div class="hero-grid">
      <div>
        <span class="eyebrow">${glyph(15)} self-hosted · Apache 2.0</span>
        <h1>Your own PaaS.<br/>Your own <span class="g">metal</span>.</h1>
        <p class="lede">Tower is a self-hostable, Fly.io-style platform you run on your own hardware. Push your code and it boots as an <b>isolated Firecracker microVM</b> — a database, vectors, and an AI gateway wired up automatically.</p>
        <div class="cta">
          <a class="btn primary" href="/docs/quickstart">Get started →</a>
          <a class="btn ghost" href="/docs">Read the docs</a>
        </div>
      </div>
      ${TERMINAL}
    </div>
  </section>

  <section class="band">
    <h2>Everything an app needs, on first deploy</h2>
    <div class="sub">No provisioning, no YAML, no control panel. Push code; Tower handles the rest.</div>
    <div class="feats">
      ${feat("git", "Push to deploy", "Each app is a bare git repo. Push a commit with a root <code>Dockerfile</code> and Tower builds, imports, and ships it — build log streamed to your terminal.")}
      ${feat("vm", "microVM isolation", "Every app boots its own image as a Firecracker microVM with its own kernel — hardware-isolated, safe for untrusted code and other people's apps.")}
      ${feat("db", "A database per app", "First deploy provisions a dedicated Postgres role + database with <code>pgvector</code>, injected as <code>DATABASE_URL</code>.")}
      ${feat("ai", "AI gateway", "Attach Anthropic, OpenAI, or Ollama. One endpoint, an opaque key — swap provider or model without a redeploy.")}
      ${feat("∞", "Invite-only & multi-tenant", "Invite-only registration with per-member isolation. Host friends, family, or a team on infrastructure you own.")}
      ${feat("tls", "TLS, handled", "Point a wildcard DNS at the edge and Tower issues per-host Let's Encrypt certs on the fly. No cloud bill, no vendor.")}
    </div>
  </section>

  <section class="band">
    <h2>Live in four commands</h2>
    <div class="sub">Install the CLI, create an app, push. Your database and URL come with it.</div>
    <div class="steps">
      ${step("Install", "<code>curl -fsSL …/install.sh | sh</code> drops the <code>wess</code> binary.")}
      ${step("Create", "<code>wess create blog</code> reserves <code>blog.your-host</code>.")}
      ${step("Push", "<code>git push wess main</code> builds your Dockerfile into a microVM.")}
      ${step("Ship", "It's live — with a <code>DATABASE_URL</code> already in its env.")}
    </div>
  </section>

  <section class="closing">
    <h2>Run the platform, not the servers.</h2>
    <p>Tower is open source under Apache 2.0. Stand it up on a box you own and deploy in seconds.</p>
    <div class="cta" style="justify-content:center">
      <a class="btn primary" href="/docs/quickstart">Quick start →</a>
      <a class="btn ghost" href="https://github.com/wess/tower">View on GitHub</a>
    </div>
  </section>
</main>
${footer()}
`

export const landing = () => page("Tower — your own PaaS, on your own metal", "landing", INNER, LANDING_CSS)
