import { get, halt, pipe } from "@atlas/server"
import { html } from "../../web/html.ts"
import { FONTS, themeVars } from "../../web/theme.ts"

// ---------- content helpers ----------
const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

const code = (body: string, label = "terminal") =>
  `<figure class="snip"><figcaption>${esc(label)}</figcaption><pre>${esc(body.trim())}</pre></figure>`

const p = (s: string) => `<p>${s}</p>`
const h2 = (s: string) => `<h2>${esc(s)}</h2>`
const note = (s: string) => `<div class="note">${s}</div>`
const tbl = (head: string[], rows: string[][]) =>
  `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`

type Page = { title: string; nav: string; body: string }

// ---------- pages ----------
const PAGES: Record<string, Page> = {
  index: {
    title: "Getting started",
    nav: "Getting started",
    body: `
${p(`Welcome to <b>wess.dev</b> — push your code and it's live. This guide takes you from nothing to a deployed app in about two minutes.`)}
${h2("1. Install the CLI")}
${code(`curl -fsSL https://wess.dev/install.sh | sh`)}
${p(`This installs the <code>wess</code> command for macOS or Linux. Verify with <code>wess --help</code>.`)}
${h2("2. Sign in")}
${code(`wess login`)}
${p(`Use the email and password for your wess.dev account. Your session is saved locally, so you only do this once per machine.`)}
${h2("3. Create an app")}
${code(`wess create myapp`)}
${p(`App names are lowercase letters and digits (3–31 characters). Your app's home on the internet is reserved immediately: <code>https://myapp.wess.dev</code>.`)}
${h2("4. Deploy")}
${p(`There are two ways to get code running. Pick whichever fits your project:`)}
${p(`<b>Push with git</b> (build from source — most projects want this):`)}
${code(`git remote add wess https://wess.dev/git/myapp.git
git push wess main`, "your project")}
${p(`Your repo needs a <code>Dockerfile</code> at the root — that's how wess.dev knows how to build your app. The build runs while you push and you watch it live in your terminal. See <a href="/docs/deploy">Deploying with git</a>.`)}
${p(`<b>Deploy a prebuilt image</b> (already published to a registry):`)}
${code(`wess deploy myapp --image docker.io/library/nginx:alpine --port 80`)}
${h2("5. You're live")}
${code(`wess open myapp        # opens https://myapp.wess.dev
wess status myapp      # machines, database, url
wess logs myapp -f     # follow your app's logs`)}
${note(`Every app gets its own <a href="/docs/databases">database</a> on first deploy — the connection string is already in your app's environment as <code>DATABASE_URL</code>.`)}
`,
  },

  deploy: {
    title: "Deploying with git",
    nav: "Deploy with git",
    body: `
${p(`wess.dev is a git remote. Add it to your repo once, then every <code>git push</code> builds and ships your app — you watch the whole thing happen in your terminal.`)}
${h2("Connect your repo")}
${code(`wess git myapp
# or by hand:
git remote add wess https://wess.dev/git/myapp.git`, "your project")}
${p(`The app must exist first (<code>wess create myapp</code>). When git asks for credentials, use your wess.dev email and password.`)}
${h2("Add a Dockerfile")}
${p(`Builds are driven by a <code>Dockerfile</code> at the root of your repo. It can be as small as this:`)}
${code(`FROM oven/bun:alpine
WORKDIR /app
COPY . .
RUN bun install
CMD ["bun", "server.ts"]`, "Dockerfile")}
${p(`Any language works — if it builds in Docker, it runs on wess.dev.`)}
${h2("Listen on PORT")}
${p(`Your app should listen on the <code>PORT</code> environment variable (we set it for you, default <code>8080</code>). In Bun, that's:`)}
${code(`Bun.serve({ port: Number(process.env.PORT ?? 8080), fetch })`, "server.ts")}
${h2("Push")}
${code(`git push wess main`)}
${p(`What you'll see, live:`)}
${code(`-----> building myapp from main (a1b2c3d4e5)
-----> docker build → wess.dev/myapp:a1b2c3d4e5
       ...build output...
-----> importing image into the platform
-----> deploying
-----> ✓ myapp is live
       https://myapp.wess.dev`, "git push output")}
${h2("Redeploys")}
${p(`Every push deploys fresh: a new machine starts with your new build, traffic moves to it, and the old machine is retired. Your app's URL never changes.`)}
${note(`Pushes are rejected politely if the repo has no Dockerfile — add one and push again. Branch doesn't matter: whatever branch you push, its latest commit is what deploys.`)}
`,
  },

  cli: {
    title: "CLI reference",
    nav: "CLI reference",
    body: `
${p(`Everything on wess.dev can be driven from the <code>wess</code> command. Install: <code>curl -fsSL https://wess.dev/install.sh | sh</code>`)}
${h2("Commands")}
${tbl(
      ["Command", "What it does"],
      [
        [`<code>wess login</code>`, `Sign in (flags: <code>-e email -p password</code>, or interactive)`],
        [`<code>wess apps</code>`, `List your apps with status and age`],
        [`<code>wess create &lt;name&gt;</code>`, `Create an app and reserve <code>name.wess.dev</code>`],
        [`<code>wess deploy &lt;name&gt; --image &lt;ref&gt; [--port N]</code>`, `Deploy a prebuilt container image`],
        [`<code>wess git &lt;name&gt;</code>`, `Add the app as a git remote named <code>wess</code> in the current repo`],
        [`<code>wess status &lt;name&gt;</code>`, `URL, image, database, and machines for an app`],
        [`<code>wess logs &lt;name&gt; [-f] [-n N]</code>`, `Show (or follow) app logs`],
        [`<code>wess secrets list &lt;app&gt;</code>`, `List secret names`],
        [`<code>wess secrets set &lt;app&gt; KEY VALUE</code>`, `Set a secret (applies on next deploy)`],
        [`<code>wess secrets unset &lt;app&gt; KEY</code>`, `Remove a secret`],
        [`<code>wess open &lt;name&gt;</code>`, `Open the app in your browser`],
        [`<code>wess destroy &lt;name&gt;</code>`, `Destroy an app, its machines, and its database (asks you to type the app name to confirm)`],
      ],
    )}
${h2("Environment")}
${tbl(
      ["Variable", "Meaning"],
      [
        [`<code>WESS_API</code>`, `API base (default <code>https://wess.dev</code>)`],
        [`<code>WESS_TOKEN</code>`, `Auth token override (otherwise <code>~/.wess/token</code>)`],
      ],
    )}
${note(`The CLI is a single static binary — no runtime needed. Re-run the installer any time to update.`)}
`,
  },

  apps: {
    title: "Apps & machines",
    nav: "Apps & machines",
    body: `
${p(`An <b>app</b> is the unit you deploy and the URL your users visit. A <b>machine</b> is the isolated virtual machine your app's current build runs in.`)}
${h2("URLs")}
${p(`Every app is served at <code>https://&lt;name&gt;.wess.dev</code> with TLS handled for you — certificates are issued automatically the first time the app exists.`)}
${h2("The lifecycle")}
${code(`wess create blog        # reserve the name + url
git push wess main      # build + deploy (or: wess deploy --image)
wess status blog        # see what's running
wess destroy blog       # tear everything down`)}
${p(`On every deploy, a fresh machine boots with the new build, the URL switches to it, and the previous machine is retired. Machines are disposable; the app — its name, URL, database, and secrets — persists across deploys.`)}
${h2("Ports")}
${p(`Your app should listen on the <code>PORT</code> environment variable (default <code>8080</code>). Deploying an image that listens on a fixed port instead? Tell us once with <code>--port</code>:`)}
${code(`wess deploy web --image nginx:alpine --port 80`)}
${p(`The port sticks for future deploys of that app.`)}
${h2("Isolation")}
${p(`Every machine is a real virtual machine with its own kernel — not a container sharing the host. Apps can't see each other, can't reach each other's machines, and can't touch the platform. It's the same isolation model the big clouds use for untrusted code.`)}
`,
  },

  databases: {
    title: "Databases",
    nav: "Databases",
    body: `
${p(`Every app gets its own Postgres database — created automatically on first deploy, no setup, no add-ons to buy.`)}
${h2("How it works")}
${p(`On your app's first deploy, wess.dev provisions a dedicated database and a dedicated role that owns it, then injects the connection string into your app's environment:`)}
${code(`DATABASE_URL=postgres://…  # already set inside your app`, "environment")}
${p(`Read it like any other env var:`)}
${code(`import { SQL } from "bun"
const sql = new SQL(process.env.DATABASE_URL!)
const [row] = await sql\`SELECT 1 AS ok\``, "bun example")}
${h2("Good to know")}
${tbl(
      ["", ""],
      [
        [`<b>Isolation</b>`, `Your role can only reach your database. Other apps can't connect to it, ever.`],
        [`<b>Pooling</b>`, `Connections are pooled at the platform level — open what you need, it's handled.`],
        [`<b>Backups</b>`, `The platform takes nightly backups with point-in-time recovery.`],
        [`<b>Lifecycle</b>`, `The database lives as long as the app. <code>wess destroy</code> removes it with the app — permanently.`],
      ],
    )}
${h2("Vectors (pgvector)")}
${p(`Every database ships with <b>pgvector</b> — store embeddings for search and RAG with no add-on:`)}
${code(`CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE docs (id bigserial primary key, embedding vector(1536), body text);
-- nearest neighbours:
SELECT body FROM docs ORDER BY embedding <-> $1 LIMIT 5;`, "SQL")}
${p(`Pair it with the <a href="/docs/ai">AI gateway</a> to generate embeddings and you have a full RAG stack on one platform.`)}
${note(`Need to inspect your data? <code>wess secrets list &lt;app&gt;</code> shows that <code>DATABASE_URL</code> is set; ask the platform owner for external access — direct connections from outside aren't exposed by default.`)}
`,
  },

  secrets: {
    title: "Secrets",
    nav: "Secrets",
    body: `
${p(`Secrets are private key/value pairs injected into your app as environment variables on each deploy. API keys, tokens, feature flags — anything you don't want in the repo. They're stored in the platform's database, never in your code or build.`)}
${h2("Managing secrets")}
${code(`wess secrets set blog STRIPE_KEY sk_live_abc123
wess secrets list blog
wess secrets unset blog STRIPE_KEY`)}
${h2("When they apply")}
${p(`Secrets are snapshotted into the machine at deploy time. Setting or removing one doesn't restart anything — it takes effect on your <b>next deploy</b>:`)}
${code(`wess secrets set blog FLAG on
git commit --allow-empty -m "apply secrets" && git push wess main`)}
${h2("Reserved names")}
${p(`<code>DATABASE_URL</code> and <code>PORT</code> are set by the platform. You can override <code>DATABASE_URL</code> with your own value if you're pointing at an external database — your value wins.`)}
`,
  },

  logs: {
    title: "Logs",
    nav: "Logs",
    body: `
${p(`Everything your app writes to stdout and stderr is captured per machine and available instantly.`)}
${h2("Reading logs")}
${code(`wess logs blog            # last 200 lines
wess logs blog -n 500     # more history
wess logs blog -f         # follow live`)}
${p(`Logs follow the <b>current</b> machine — after a deploy, you're reading the new build's output.`)}
${h2("Tips")}
${p(`Log to stdout, not files: anything written to standard output is captured automatically; files inside the machine are discarded when it's retired. Structured lines (JSON or key=value) make later filtering easier.`)}
`,
  },

  images: {
    title: "Images & ports",
    nav: "Images & ports",
    body: `
${p(`Don't want to build from source? Any public container image deploys directly.`)}
${h2("Deploy an image")}
${code(`wess deploy web --image docker.io/library/nginx:alpine --port 80`)}
${p(`Use the full image reference, registry included. The image is pulled, booted in a fresh machine, and served at <code>https://web.wess.dev</code>.`)}
${h2("Ports")}
${p(`wess.dev needs to know one thing: the port your app listens on.`)}
${tbl(
      ["Situation", "What to do"],
      [
        [`Your code reads <code>PORT</code>`, `Nothing — it's set to 8080 and routing matches.`],
        [`Image listens on a fixed port (nginx → 80)`, `Pass <code>--port 80</code> once; it sticks for future deploys.`],
      ],
    )}
${h2("Private registries")}
${p(`Not supported yet — push with git instead and the build happens on the platform, no registry needed.`)}
`,
  },

  ai: {
    title: "AI & the gateway",
    nav: "AI & gateway",
    body: `
${p(`wess.dev is built for AI apps. Attach a model provider to your app and we inject a <b>provider-agnostic gateway</b> — your code calls one endpoint, and the owner can switch between Anthropic, OpenAI, Ollama (server or cloud), or any OpenAI-compatible endpoint without touching your app. Your app never holds a raw provider key.`)}
${h2("Attach a provider")}
${code(`wess ai myapp anthropic            # or: openai, ollama, or any configured provider
wess deploy myapp --image ...      # redeploy to inject the gateway env`)}
${p(`The owner configures providers once in the console (Settings → AI providers): an Anthropic or OpenAI key, or an Ollama base URL (local server or Ollama Cloud), or any OpenAI-compatible base URL (Groq, Together, OpenRouter, vLLM…).`)}
${h2("Call the gateway from your app")}
${p(`Three env vars are injected when AI is attached: <code>AI_GATEWAY_URL</code>, <code>AI_GATEWAY_KEY</code>, <code>AI_MODEL</code>.`)}
${code(`const r = await fetch(process.env.AI_GATEWAY_URL + "/chat", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer " + process.env.AI_GATEWAY_KEY },
  body: JSON.stringify({ messages: [{ role: "user", content: "Summarize this." }] }),
})
const { content } = await r.json()`, "your app")}
${p(`Pass <code>"stream": true</code> for a Server-Sent Events stream. Override the model per-call with <code>"model"</code>. The same request shape works no matter which provider is behind the gateway.`)}
${h2("Vectors are built in")}
${p(`Your app's database has <a href="/docs/databases">pgvector</a> — <code>CREATE EXTENSION IF NOT EXISTS vector</code> and store embeddings for RAG. Generate embeddings through the gateway, store them in your DB, done.`)}
${h2("Scaffold an AI app")}
${code(`wess init myapp --template ai`)}
${note(`The gateway keeps provider keys on the platform, not in your app or its environment dump — so a leaked app can't leak your Anthropic/OpenAI key.`)}
`,
  },

  sandbox: {
    title: "Sandbox",
    nav: "Sandbox",
    body: `
${p(`The sandbox runs untrusted code in a <b>throwaway microVM</b> — the same hardware-isolated primitive your apps run on — then destroys it. It's built for AI agents that need to execute generated code safely.`)}
${h2("Run code")}
${code(`wess sandbox python script.py
wess sandbox bash setup.sh`)}
${p(`Runtimes: <code>python</code>, <code>node</code>, <code>bun</code>, <code>bash</code>. Each call boots a fresh VM, runs your code, captures stdout/stderr and the exit code, and tears the VM down.`)}
${h2("From the API")}
${code(`POST /api/sandbox     (Authorization: Bearer <token with 'sandbox' scope>)
{ "runtime": "python", "code": "print(40 + 2)", "timeoutMs": 30000 }
→ { "ok": true, "exitCode": 0, "stdout": "42\\n", "stderr": "", "ms": 380 }`)}
${h2("Why it's safe")}
${p(`Each execution is a separate VM with its own kernel — not a shared-kernel container. Code can't see the host, other sandboxes, or other apps. Wrap it behind a <a href="/docs/tokens">scoped token</a> with only the <code>sandbox</code> scope to hand an agent execution power and nothing else.`)}
${tbl(["", ""], [["Timeout", "default 30s, max 120s"], ["Network", "tenant-isolated (can't reach other apps or the platform)"], ["Lifetime", "destroyed the moment your code exits"]])}
`,
  },

  tokens: {
    title: "Tokens & scopes",
    nav: "Tokens & scopes",
    body: `
${p(`Scoped API tokens let you hand an automation or AI agent exactly the power it needs — and nothing more. A token can be limited to specific actions and even to a single app.`)}
${h2("Create a token")}
${code(`wess token create deploybot --scopes deploy,logs --app blog
# → wess_xxxxxxxx  (shown once)`)}
${p(`Use it by setting <code>WESS_TOKEN</code>, or send it as <code>Authorization: Bearer wess_...</code> directly to the API.`)}
${h2("Scopes")}
${tbl(["Scope", "Grants"], [
      ["<code>read</code>", "list apps, status, doctor"],
      ["<code>deploy</code>", "create apps and deploy"],
      ["<code>logs</code>", "read app logs"],
      ["<code>secrets</code>", "read/set/remove secrets"],
      ["<code>destroy</code>", "destroy apps"],
      ["<code>sandbox</code>", "run sandbox code"],
    ])}
${h2("App-binding")}
${p(`Pass <code>--app &lt;name&gt;</code> to lock a token to one app. An app-bound token can't touch other apps or platform-wide endpoints — ideal for a per-app CI deploy key or an agent working on a single project.`)}
${h2("Manage")}
${code(`wess token list
wess token revoke <id>`)}
${note(`Tokens are stored hashed — we can't show a token again after creation. Lost one? Revoke it and make a new one.`)}
`,
  },

  api: {
    title: "API & agents",
    nav: "API & agents",
    body: `
${p(`Everything in the console and CLI is a JSON API, designed to be driven by AI agents as much as humans.`)}
${h2("Machine-readable everywhere")}
${tbl(["", ""], [
      ["<code>/llms.txt</code>", "the platform, summarized for LLMs"],
      ["<code>/openapi.json</code>", "full OpenAPI 3 spec"],
      ["<code>/AGENTS.md</code>", "conventions to drop into any repo"],
      ["<code>wess &lt;cmd&gt; --json</code>", "every CLI command emits JSON"],
    ])}
${h2("Teach your agent to deploy")}
${p(`Install the wess.dev skill into any Claude Code project so an agent can deploy on its own:`)}
${code(`curl -fsSL https://wess.dev/skill/install | sh
# then in Claude Code: "deploy this to wess.dev"`)}
${p(`The skill (<a href="/skill/SKILL.md">/skill/SKILL.md</a>) teaches the whole lifecycle: detect the stack, write a Dockerfile, create the app, push to deploy, and debug with <code>wess doctor</code>.`)}
${h2("Auth")}
${p(`POST <code>/api/login</code> for a session token, or create a <a href="/docs/tokens">scoped token</a> for automation. Send it as <code>Authorization: Bearer &lt;token&gt;</code>.`)}
${h2("Errors teach")}
${p(`Every error returns <code>{"error": "..."}</code> with a message written so an agent (or human) can recover — what was wrong and what to do about it.`)}
`,
  },

  faq: {
    title: "FAQ & limits",
    nav: "FAQ & limits",
    body: `
${h2("What actually runs my app?")}
${p(`A dedicated lightweight virtual machine (Firecracker — the tech behind AWS Lambda) with its own kernel, booted fresh for every deploy. Stronger isolation than containers, with boot times you won't notice.`)}
${h2("What do I need in my repo?")}
${p(`Just a <code>Dockerfile</code> at the root. If it builds in Docker, it deploys here.`)}
${h2("How do I get HTTPS?")}
${p(`You already have it — every <code>*.wess.dev</code> app is served over TLS with automatically managed certificates.`)}
${h2("Current limits")}
${tbl(
      ["", ""],
      [
        [`Machines per app`, `1 (each deploy replaces the previous machine)`],
        [`Custom domains`, `Not yet — apps live at <code>name.wess.dev</code>`],
        [`Private registries`, `Not yet — use git push to build from source`],
        [`Persistent disk`, `Not yet — use your app's database for state`],
        [`Scale-to-zero / autoscaling`, `Not yet`],
      ],
    )}
${h2("Where do I report problems?")}
${p(`Ping the platform owner, or open an issue on <a href="https://github.com/wess">GitHub</a>.`)}
`,
  },
}

const ORDER = ["index", "deploy", "cli", "apps", "databases", "secrets", "logs", "ai", "sandbox", "tokens", "api", "images", "faq"]

// ---------- layout ----------
const CSS = `
  :root{${themeVars}}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:16px;line-height:1.65;-webkit-font-smoothing:antialiased}
  a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
  ::selection{background:rgba(136,192,208,.3);color:var(--fg)}
  .top{display:flex;align-items:center;justify-content:space-between;padding:20px clamp(20px,5vw,52px);border-bottom:1px solid var(--line)}
  .brand{font-family:var(--serif);font-weight:900;font-size:21px;letter-spacing:-.02em;color:var(--ink)}
  .brand b{color:var(--accent)} .brand .sub{color:var(--muted);font-weight:400;font-family:var(--sans);font-size:13px;margin-left:8px}
  .top nav a{color:var(--ink-soft);font-size:14px;font-weight:500;margin-left:22px} .top nav a:hover{color:var(--accent);text-decoration:none}
  .shell{display:grid;grid-template-columns:230px 1fr;gap:clamp(28px,5vw,72px);max-width:1100px;margin:0 auto;padding:clamp(28px,5vw,56px) clamp(20px,5vw,52px)}
  @media(max-width:760px){.shell{grid-template-columns:1fr}.side{position:static;border-right:none;border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:8px}}
  .side{position:sticky;top:24px;align-self:start}
  .side .cap{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);font-weight:600;margin-bottom:12px}
  .side a{display:block;color:var(--ink-soft);font-size:14.5px;padding:7px 0 7px 14px;border-left:2px solid var(--line)}
  .side a:hover{color:var(--accent);text-decoration:none}
  .side a.on{color:var(--ink);font-weight:600;border-left-color:var(--accent)}
  main h1{font-family:var(--serif);font-size:clamp(32px,5vw,46px);font-weight:900;letter-spacing:-.025em;line-height:1.05;margin-bottom:22px}
  main h2{font-family:var(--serif);font-size:22px;font-weight:600;letter-spacing:-.01em;margin:38px 0 12px}
  main p{margin:0 0 16px;color:var(--ink-soft);max-width:62ch} main p b{color:var(--ink)}
  main code{font-family:var(--mono);font-size:.86em;background:var(--bg-2);border:1px solid var(--line-2);padding:1px 5px;border-radius:4px;color:var(--accent)}
  .snip{margin:18px 0 22px;border:1px solid var(--line-2);background:var(--bg-1);border-radius:10px;box-shadow:0 14px 40px -22px rgba(0,0,0,.7);overflow:hidden}
  .snip figcaption{font-size:11px;text-transform:uppercase;letter-spacing:.12em;font-weight:600;color:var(--accent);padding:9px 16px;border-bottom:1px solid var(--line);background:var(--bg-2)}
  .snip pre{padding:16px 18px;font-family:var(--mono);font-size:13px;line-height:1.75;overflow-x:auto;color:var(--fg-2)}
  .snip pre code{background:none;border:none;padding:0;color:inherit}
  .note{border-left:3px solid var(--accent);background:var(--accent-soft);padding:14px 18px;margin:22px 0;font-size:14.5px;color:var(--ink-soft);max-width:62ch;border-radius:0 8px 8px 0}
  table{width:100%;border-collapse:collapse;margin:18px 0 24px;font-size:14.5px}
  th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:600}
  .pager{display:flex;justify-content:space-between;margin-top:48px;padding-top:22px;border-top:1px solid var(--line);font-size:14.5px}
  footer{border-top:1px solid var(--line);padding:26px clamp(20px,5vw,52px);color:var(--muted);font-size:13px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
`

function render(slug: string): string {
  const page = PAGES[slug]!
  const nav = ORDER.map((s) => {
    const href = s === "index" ? "/docs" : `/docs/${s}`
    return `<a href="${href}" class="${s === slug ? "on" : ""}">${esc(PAGES[s]!.nav)}</a>`
  }).join("")
  const i = ORDER.indexOf(slug)
  const prev = i > 0 ? ORDER[i - 1] : null
  const next = i < ORDER.length - 1 ? ORDER[i + 1] : null
  const pager = `<div class="pager">
    <span>${prev ? `<a href="${prev === "index" ? "/docs" : `/docs/${prev}`}">← ${esc(PAGES[prev]!.nav)}</a>` : ""}</span>
    <span>${next ? `<a href="/docs/${next}">${esc(PAGES[next]!.nav)} →</a>` : ""}</span>
  </div>`

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(page.title)} · wess.dev docs</title>${FONTS}<style>${CSS}</style></head>
<body>
<div class="top"><a class="brand" href="/">wess<b>.</b>dev<span class="sub">docs</span></a>
<nav><a href="/docs">Docs</a><a href="/admin">Console</a><a href="https://github.com/wess">GitHub</a></nav></div>
<div class="shell">
  <aside class="side"><div class="cap">Documentation</div>${nav}</aside>
  <main><h1>${esc(page.title)}</h1>${page.body}${pager}</main>
</div>
<footer><span>wess.dev — the simplest way to ship your apps</span><span>powered by Tower</span></footer>
</body></html>`
}

export const docsRoutes = [
  get("/docs", pipe((c) => html(c, 200, render("index")))),
  get(
    "/docs/:page",
    pipe((c) => {
      const slug = c.params.page
      if (!PAGES[slug]) return halt(c, 404, "no such page")
      return html(c, 200, render(slug))
    }),
  ),
]
