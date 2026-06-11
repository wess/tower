import { footer, header, page } from "./theme.ts"

const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const code = (body: string, label = "shell") =>
  `<figure class="snip"><figcaption>${esc(label)}</figcaption><pre>${esc(body.trim())}</pre></figure>`
const p = (s: string) => `<p>${s}</p>`
const h2 = (s: string) => `<h2 id="${s.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${esc(s)}</h2>`
const note = (s: string) => `<div class="note">${s}</div>`
const ul = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`

type Doc = { title: string; nav: string; body: string }

export const ORDER = ["index", "quickstart", "deploy", "databases", "ai", "sandbox", "cli", "tenancy", "architecture"]

const DOCS: Record<string, Doc> = {
  index: {
    title: "Overview",
    nav: "Overview",
    body: `
${p(`<b>Tower</b> is a self-hostable, Fly.io-style PaaS. Push your code and it boots as an isolated Firecracker microVM — with a dedicated database, vectors, and a multi-provider AI gateway wired up for you. It's invite-only and multi-tenant, so you can host friends, family, or a team on infrastructure you own.`)}
${h2("What you get")}
${ul([
  "<b>Git push-to-deploy</b> — build a root <code>Dockerfile</code> straight from <code>git push</code>, with the build log streamed live.",
  "<b>microVM isolation</b> — every app runs its own kernel under Firecracker, safe for untrusted code.",
  "<b>A database per app</b> — dedicated Postgres + <code>pgvector</code>, injected as <code>DATABASE_URL</code>.",
  "<b>One AI gateway</b> — Anthropic, OpenAI, or Ollama behind a single endpoint; swap without redeploy.",
  "<b>Invite-only multi-tenant</b> — per-member isolation, on hardware you control.",
])}
${note(`New here? Jump to the <a href="/docs/quickstart">Quick start</a> — you'll be live in about four commands.`)}`,
  },

  quickstart: {
    title: "Quick start",
    nav: "Quick start",
    body: `
${p(`Tower ships a single CLI binary, <code>wess</code>, that talks to your deployment (the reference deployment is <code>wess.dev</code>).`)}
${h2("1. Install")}
${code(`curl -fsSL https://wess.dev/install.sh | sh`)}
${p(`Point the CLI at your own deployment with the <code>WESS_API</code> environment variable (default <code>https://wess.dev</code>).`)}
${h2("2. Log in")}
${code(`wess login
# or non-interactively:
wess login -e you@example.com -p 'your-password'`)}
${p(`Your token is saved to <code>~/.wess/token</code>.`)}
${h2("3. Create an app")}
${p(`App names are lowercase letters and digits, 3–31 characters (no hyphens).`)}
${code(`wess create blog`)}
${h2("4. Deploy")}
${p(`<b>Push with git</b> — your repo needs a root <code>Dockerfile</code>:`)}
${code(`wess init blog                            # scaffolds server.ts, Dockerfile, AGENTS.md
git init && git add -A && git commit -m "init"
wess git blog                             # adds a \`wess\` git remote
git push wess main                        # builds + deploys, log streams live`, "your project")}
${p(`<b>Or deploy a prebuilt image:</b>`)}
${code(`wess deploy blog --image ghcr.io/you/blog:latest --port 8080`)}
${h2("5. You're live")}
${code(`wess status blog        # machines, database, URL
wess open blog          # opens https://blog.wess.dev
wess logs blog -f       # follow logs`)}
${note(`Every app gets a dedicated Postgres database on first deploy — the connection string is already in its environment as <code>DATABASE_URL</code>.`)}`,
  },

  deploy: {
    title: "Deploying",
    nav: "Deploy",
    body: `
${p(`There are two ways to ship: build from source with <code>git push</code>, or deploy a prebuilt image.`)}
${h2("Git push")}
${p(`Each app is a bare git repo on the platform. Add it as a remote, then every push builds your root <code>Dockerfile</code> into an image and boots it as a microVM — you watch the build live in your terminal.`)}
${code(`FROM oven/bun:alpine
WORKDIR /app
COPY . .
RUN bun install
CMD ["bun", "run", "src/server.ts"]`, "Dockerfile")}
${p(`Your app should listen on the <code>PORT</code> environment variable (Tower sets it; default <code>8080</code>).`)}
${code(`Bun.serve({ port: Number(process.env.PORT ?? 8080), fetch })`, "src/server.ts")}
${h2("Prebuilt image")}
${code(`wess deploy blog --image ghcr.io/you/blog:latest --port 8080`)}
${p(`The <code>--port</code> sticks and is reused on later deploys.`)}
${h2("Rolling redeploys")}
${p(`Every deploy is rolling: a new machine boots with your new build, the app's status flips to it, and the previous machine is retired. The app's URL never changes.`)}`,
  },

  databases: {
    title: "Databases",
    nav: "Databases",
    body: `
${p(`On an app's first deploy, Tower provisions a dedicated Postgres role and database — owned by that role, with <code>CONNECT</code> revoked from <code>PUBLIC</code> — and injects the connection string as the app's <code>DATABASE_URL</code> secret. Connections are pooled through PgBouncer.`)}
${code(`const sql = new Bun.SQL(process.env.DATABASE_URL)
const rows = await sql\`select now()\``, "src/server.ts")}
${h2("Vectors")}
${p(`Tenant databases ship with the <code>pgvector</code> extension, so you can store and query embeddings for search and RAG without any setup.`)}
${code(`CREATE TABLE docs (id bigserial primary key, embedding vector(1536));`, "psql")}`,
  },

  ai: {
    title: "AI gateway",
    nav: "AI gateway",
    body: `
${p(`Attach a provider to an app and it gets a single endpoint plus an opaque <code>aigw_…</code> key — it never holds a raw provider API key.`)}
${code(`wess ai blog anthropic -m claude-opus-4-8
wess ai blog openai
wess ai blog ollama`)}
${p(`Attaching injects <code>AI_GATEWAY_URL</code>, <code>AI_GATEWAY_KEY</code>, <code>AI_MODEL</code>, and <code>AI_PROVIDER</code> into the VM. The gateway resolves the key to the current provider and model at request time, so you can swap providers without a redeploy.`)}
${h2("Providers")}
${p(`Anthropic, OpenAI, or Ollama (server or cloud). Any OpenAI-compatible base also works — Groq, Together, OpenRouter, vLLM, and friends.`)}`,
  },

  sandbox: {
    title: "Sandbox",
    nav: "Sandbox",
    body: `
${p(`Run untrusted code in a throwaway Firecracker microVM. Tower captures stdout, stderr, exit code, and elapsed time, then destroys the VM.`)}
${code(`wess sandbox python ./script.py
wess sandbox bun ./task.ts`)}
${p(`Supports <code>python</code>, <code>node</code>, <code>bun</code>, and <code>bash</code>. Default timeout is 30s, capped at 120s.`)}`,
  },

  cli: {
    title: "CLI reference",
    nav: "CLI reference",
    body: `
${p(`Install: <code>curl -fsSL https://wess.dev/install.sh | sh</code>. Add <code>--json</code> to any command for machine-readable output.`)}
${h2("Apps")}
${code(`wess apps                         # list your apps
wess create <name>               # create an app
wess deploy <name> --image <ref> [--port N]
wess git <name>                  # add a \`wess\` git remote (run inside the repo)
wess status <name>               # url, image, database, machines
wess logs <name> [-f] [-n N]     # show / follow logs
wess open <name>                 # open in your browser
wess destroy <name>              # destroy app, machines, and database (asks to confirm)`)}
${h2("Secrets")}
${code(`wess secrets set <app> KEY VALUE
wess secrets list <app>
wess secrets unset <app> KEY`)}
${h2("AI, sandbox, doctor")}
${code(`wess ai <app> <anthropic|openai|ollama> [-m model]
wess sandbox <python|node|bun|bash> <file>
wess doctor <app> [-x]           # health report (-x adds an AI explanation)
wess init <name>                 # scaffold a starter project`)}
${h2("Tokens (owner)")}
${code(`wess token create <name> --scopes read,deploy [--app <app>]
wess token list
wess token revoke <id>`)}
${note(`The <code>wess token</code> CLI requires an owner session. Members create and manage their own tokens in the web console under <b>Settings</b>.`)}`,
  },

  tenancy: {
    title: "Multi-tenant & invites",
    nav: "Multi-tenant",
    body: `
${p(`Tower is invite-only and tenant-isolated by design.`)}
${h2("Bootstrap")}
${p(`The first person to register becomes the platform <b>owner</b> — no invite required. Every registration after that needs a valid invite code, or it's rejected.`)}
${h2("Invites")}
${p(`Every authenticated member — owner included — can mint invite links from the console. Codes are single-use and can be locked to a specific email. Share the link and the recipient registers against it:`)}
${code(`https://wess.dev/admin/register?code=<code>`, "invite link")}
${p(`Anyone you invite can also invite others.`)}
${h2("Isolation")}
${ul([
  "<b>Members</b> see and manage only their own apps, databases, env vars, tokens, and the invites they created.",
  "<b>The owner</b> sees everything — all apps, all members, tenant databases, AI providers, and the platform events feed.",
  "App ownership is enforced across the API, the console, and <code>git push</code> — you can't reach another member's app.",
])}
${h2("Member management")}
${p(`The owner can revoke any invite and remove members (their apps' ownership is released for the owner to reclaim or destroy). Members can revoke only their own pending invites.`)}`,
  },

  architecture: {
    title: "Architecture",
    nav: "Architecture",
    body: `
${p(`Tower is a <b>Bun + TypeScript</b> control plane.`)}
${ul([
  "<b>Compute</b> — app images boot as Firecracker microVMs via <code>firecracker-ctr</code> on the <code>aws.firecracker</code> runtime, one machine per app, each under a transient systemd unit.",
  "<b>Data</b> — a shared Postgres cluster with a dedicated database + role provisioned per app, pooled through PgBouncer.",
  "<b>Edge</b> — wildcard subdomain routing with per-host Let's Encrypt certificates issued on the fly, pointing <code>https://&lt;name&gt;.your-host</code> at the app's current machine.",
  "<b>Console</b> — a server-rendered admin for the owner/member dashboard, invites, databases, and AI provider config.",
])}
${note(`Tower is open source under the Apache License 2.0.`)}`,
  },
}

const DOCS_CSS = `
  .docs{display:grid;grid-template-columns:210px 1fr;gap:clamp(28px,5vw,56px);padding:clamp(28px,5vw,48px) 0}
  .side{position:sticky;top:84px;align-self:start}
  .side .cap{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin-bottom:12px}
  .side a{display:block;color:var(--muted);font-size:14.5px;padding:7px 0 7px 14px;border-left:2px solid var(--line2);transition:.12s}
  .side a:hover{color:var(--accent)} .side a.on{color:var(--n6);font-weight:600;border-left-color:var(--accent)}
  main.doc{min-width:0}
  main.doc h1{font-family:var(--display);font-weight:700;font-size:clamp(30px,4.4vw,42px);letter-spacing:-.02em;margin-bottom:20px}
  main.doc h2{font-family:var(--display);font-size:21px;font-weight:600;margin:36px 0 12px;letter-spacing:-.01em;scroll-margin-top:80px}
  main.doc p{margin:0 0 15px;color:var(--n4);max-width:68ch;overflow-wrap:break-word} main.doc p b{color:var(--n6)}
  main.doc ul{margin:0 0 16px;padding-left:20px;color:var(--n4);max-width:68ch} main.doc li{margin:6px 0}
  main.doc code{font-family:var(--mono);font-size:.88em;background:var(--n2);border:1px solid var(--line2);padding:1px 6px;border-radius:5px;color:var(--frost1);overflow-wrap:anywhere}
  .snip{margin:16px 0 22px;border:1px solid var(--line2);background:#272c36;border-radius:11px;overflow:hidden}
  .snip figcaption{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);padding:9px 16px;border-bottom:1px solid var(--line);background:#2b303b}
  .snip pre{padding:16px 18px;font-family:var(--mono);font-size:13px;line-height:1.8;overflow-x:auto;color:var(--n4)}
  .snip pre code{background:none;border:none;padding:0;color:inherit}
  .note{border-left:3px solid var(--accent);background:rgba(136,192,208,.08);padding:13px 17px;margin:20px 0;border-radius:0 9px 9px 0;color:var(--n4);font-size:14.5px;max-width:68ch}
  .pager{display:flex;justify-content:space-between;margin-top:48px;padding-top:22px;border-top:1px solid var(--line);font-size:14.5px}
  @media(max-width:760px){
    .docs{grid-template-columns:1fr;gap:18px}
    .side{position:static;display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;border-bottom:1px solid var(--line);padding-bottom:10px}
    .side .cap{display:none}
    .side a{flex:0 0 auto;border-left:none;border-bottom:2px solid transparent;padding:7px 12px;white-space:nowrap}
    .side a.on{border-left:none;border-bottom-color:var(--accent)}
  }
`

export function renderDoc(slug: string): string {
  const doc = DOCS[slug] ?? DOCS.index
  const realSlug = DOCS[slug] ? slug : "index"
  const nav = ORDER.map((s) => {
    const href = s === "index" ? "/docs" : `/docs/${s}`
    return `<a href="${href}" class="${s === realSlug ? "on" : ""}">${esc(DOCS[s]!.nav)}</a>`
  }).join("")
  const i = ORDER.indexOf(realSlug)
  const prev = i > 0 ? ORDER[i - 1] : null
  const next = i < ORDER.length - 1 ? ORDER[i + 1] : null
  const link = (s: string) => (s === "index" ? "/docs" : `/docs/${s}`)
  const pager = `<div class="pager">
    <span>${prev ? `<a href="${link(prev)}">← ${esc(DOCS[prev]!.nav)}</a>` : ""}</span>
    <span>${next ? `<a href="${link(next)}">${esc(DOCS[next]!.nav)} →</a>` : ""}</span>
  </div>`

  const inner = `${header("docs")}
<div class="wrap docs">
  <aside class="side"><div class="cap">Documentation</div>${nav}</aside>
  <main class="doc"><h1>${esc(doc.title)}</h1>${doc.body}${pager}</main>
</div>
${footer()}`
  return page(`${doc.title} · Tower docs`, "docs", inner, DOCS_CSS)
}
