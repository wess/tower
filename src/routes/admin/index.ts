import { from } from "@atlas/db"
import { token } from "@atlas/auth"
import { get, parseForm, pipe, pipeline, post, redirect, type Conn } from "@atlas/server"
import {
  ALL_SCOPES,
  authenticate,
  changePassword,
  createApiToken,
  listApiTokens,
  type AuthClaims,
} from "../../auth/index.ts"
import { listProviders, upsertProvider } from "../../ai/index.ts"
import { createApp, deployApp, destroyApp, listApps } from "../../apps/index.ts"
import { config } from "../../config/index.ts"
import { db } from "../../db/index.ts"
import { events, machines, tenant_databases, users } from "../../schema/index.ts"
import { escapeHtml, html, readCookies, setCookie } from "../../web/html.ts"
import { baseCss, FONTS, themeVars } from "../../web/theme.ts"

const COOKIE = "tower_session"

export async function owner(c: Conn): Promise<AuthClaims | null> {
  const t = readCookies(c)[COOKIE]
  if (!t) return null
  try {
    const claims = (await token.verify(t, config.authSecret)) as AuthClaims
    return claims.role === "owner" ? claims : null
  } catch {
    return null
  }
}


const styles = `
  :root{${themeVars}}
  ${baseCss}
  body{font-size:15px;line-height:1.5}
  .top{display:flex;align-items:center;justify-content:space-between;padding:18px clamp(20px,5vw,52px);border-bottom:1px solid var(--line);background:var(--bg-1)}
  .brand{font-family:var(--serif);font-weight:900;font-size:21px;letter-spacing:-.02em;color:var(--fg)}
  .brand b{color:var(--accent)} .brand .sub{color:var(--muted);font-weight:400;font-family:var(--sans);font-size:13px;margin-left:8px}
  .brand .pw{color:var(--muted);font-weight:600;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;margin-left:6px}
  .wrap{max-width:1080px;margin:0 auto;padding:clamp(28px,5vw,52px) clamp(20px,5vw,52px)}
  h1.page{font-family:var(--serif);font-size:clamp(30px,5vw,46px);font-weight:900;letter-spacing:-.025em;margin-bottom:6px;color:var(--fg)}
  .page-sub{color:var(--muted);margin-bottom:36px;font-size:15px}
  h2{font-family:var(--serif);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.14em;color:var(--fg-2);margin:44px 0 16px;padding-bottom:8px;border-bottom:1px solid var(--line)}

  /* user menu */
  details.menu{position:relative} details.menu summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:9px;padding:6px 12px;border:1px solid var(--line-2);border-radius:8px;font-weight:500;font-size:14px;color:var(--fg-2)}
  details.menu summary:hover{border-color:var(--accent)}
  details.menu summary::-webkit-details-marker{display:none}
  details.menu summary .av{width:24px;height:24px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;font-weight:700;font-size:12px}
  details.menu summary .ca{color:var(--muted);font-size:11px}
  .panel{position:absolute;right:0;top:calc(100% + 8px);width:236px;background:var(--bg-1);border:1px solid var(--line-2);border-radius:10px;box-shadow:0 12px 32px -8px rgba(0,0,0,.5);z-index:20;overflow:hidden}
  .panel .who{padding:14px 16px;border-bottom:1px solid var(--line)} .panel .who b{display:block;font-size:14px;color:var(--fg)} .panel .who span{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);font-weight:600}
  .panel a,.panel button{display:block;width:100%;text-align:left;padding:11px 16px;font:inherit;font-size:14px;background:none;border:none;border-top:1px solid var(--line);cursor:pointer;color:var(--fg-2)}
  .panel a:first-of-type{border-top:none} .panel a:hover,.panel button:hover{background:var(--bg-2);color:var(--accent)}

  /* stat row */
  .stats{display:flex;flex-wrap:wrap;background:var(--bg-1);border:1px solid var(--line-2);border-radius:14px;overflow:hidden}
  .stats .s{flex:1;min-width:120px;padding:22px 24px 20px;border-right:1px solid var(--line)}
  .stats .s:last-child{border-right:none}
  .stats .n{font-family:var(--serif);font-size:40px;font-weight:600;line-height:1;letter-spacing:-.02em;color:var(--fg)}
  .stats .l{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-top:7px}

  /* tables */
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:14px;color:var(--fg-2)}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:600}
  td .mono,a.mono{font-family:var(--mono);font-size:13px;color:var(--accent)}
  .dot{display:inline-flex;align-items:center;gap:7px;font-size:13px} .dot::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--green)}
  .dot.idle::before{background:var(--muted)}
  .empty{color:var(--muted);font-style:italic}

  /* forms / buttons */
  input,select,textarea{font:inherit;background:var(--bg);border:1px solid var(--line-2);color:var(--fg);padding:10px 12px;border-radius:8px;width:100%}
  input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent)}
  input::placeholder{color:var(--bg-3)}
  .btn{font:inherit;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;border:none;cursor:pointer;background:var(--accent);color:var(--on-accent);transition:filter .12s,transform .12s}
  .btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
  .btn.sm{padding:7px 13px;font-size:13px}
  .btn.ghost{background:transparent;color:var(--fg-2);border:1px solid var(--line-2)} .btn.ghost:hover{border-color:var(--accent);color:var(--accent);filter:none}
  .btn.danger{background:transparent;color:var(--red);border:1px solid color-mix(in srgb,var(--red) 45%,transparent)} .btn.danger:hover{background:color-mix(in srgb,var(--red) 14%,transparent);filter:none}
  form.inline{display:inline-flex;gap:7px;align-items:center;margin:0}
  .toolbar{display:flex;gap:10px;align-items:center;margin-bottom:8px}

  /* settings */
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:stretch}
  @media(max-width:720px){.grid2{grid-template-columns:1fr}}
  .field{margin-bottom:16px} .field label{display:block;font-size:13px;color:var(--fg-2);margin-bottom:6px;font-weight:500}
  .kv{display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid var(--line);font-size:14px;color:var(--fg-2)} .kv .k{color:var(--muted)}
  .note{padding:12px 16px;border-left:2px solid var(--accent);background:var(--bg-2);border-radius:0 8px 8px 0;font-size:13.5px;color:var(--fg-2);margin-bottom:18px}
  .msg{padding:11px 15px;border:1px solid var(--accent);background:var(--accent-soft);color:var(--accent);border-radius:8px;font-size:14px;margin-bottom:20px;font-weight:500}
  .msg.ok{border-color:var(--green);color:var(--green);background:color-mix(in srgb,var(--green) 12%,transparent)}

  /* cards */
  .card{background:var(--bg-1);border:1px solid var(--line-2);border-radius:14px;padding:clamp(20px,3vw,28px);margin-bottom:22px}
  .card .ch{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
  .card .ch h3{font-family:var(--serif);font-size:21px;font-weight:600;letter-spacing:-.015em;color:var(--fg)}
  .card .ch p{color:var(--muted);font-size:13.5px;max-width:46ch;line-height:1.5}
  .card table{margin-top:0}
  .card th:first-child,.card td:first-child{padding-left:0} .card th:last-child,.card td:last-child{padding-right:0;text-align:right}
  .card .kv:last-child{border-bottom:none}
  .subhead{font-size:11.5px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:600;margin:24px 0 14px;padding-top:20px;border-top:1px solid var(--line)}
  .formgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px;align-items:end}
  .formgrid.two{grid-template-columns:1fr 1fr}
  @media(max-width:560px){.formgrid,.formgrid.two{grid-template-columns:1fr}}
  .fld label{display:block;font-size:11.5px;color:var(--muted);font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}
  .formfoot{margin-top:18px;display:flex;justify-content:flex-end;gap:10px}
  .hint{color:var(--muted);font-size:13px;margin-top:14px;line-height:1.5;max-width:60ch}
  .scopes{display:flex;flex-wrap:wrap;gap:8px}
  .chip{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border:1px solid var(--line-2);border-radius:999px;font-size:13px;cursor:pointer;user-select:none;transition:.12s;color:var(--fg-2)}
  .chip input{width:auto;margin:0} .chip:has(input:checked){border-color:var(--accent);background:var(--accent-soft);color:var(--accent);font-weight:600}
  .tokenbox{display:flex;align-items:center;gap:14px;background:#272c36;border:1px solid var(--line-2);color:var(--fg);border-radius:11px;padding:14px 18px;margin-bottom:20px;flex-wrap:wrap}
  .tokenbox .lbl{color:var(--accent);font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:600;white-space:nowrap}
  .tokenbox code{font-family:var(--mono);font-size:13px;word-break:break-all;color:var(--fg)}

  /* login */
  .login{max-width:380px;margin:14vh auto;padding:0 24px}
  .login .brand{font-size:30px;margin-bottom:4px} .login h1{font-family:var(--serif);font-size:24px;font-weight:600;margin:18px 0 4px;color:var(--fg)} .login p{color:var(--muted);font-size:14px;margin-bottom:24px}
  .login .field{margin-bottom:14px} .login .btn{width:100%;justify-content:center;padding:12px}
`

export function head(title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)} · wess.dev</title>${FONTS}<style>${styles}</style></head>`
}

export function topbar(claims: AuthClaims): string {
  const initial = escapeHtml(claims.email[0]?.toUpperCase() ?? "?")
  return `<div class="top">
<div class="brand">wess<b>.</b>dev<span class="sub">console</span><span class="pw">· powered by Tower</span></div>
<details class="menu"><summary><span class="av">${initial}</span>${escapeHtml(claims.email)}<span class="ca">▾</span></summary>
<div class="panel">
<div class="who"><b>${escapeHtml(claims.email)}</b><span>${escapeHtml(claims.role)}</span></div>
<a href="/admin">Dashboard</a>
<a href="/admin/settings">Settings</a>
<a href="/">View site</a>
<form method="post" action="/admin/logout"><button>Sign out</button></form>
</div></details></div>`
}

export function table(cols: string[], rows: string[][]): string {
  if (!rows.length)
    return `<table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody><tr><td colspan="${cols.length}" class="empty">Nothing here yet.</td></tr></tbody></table>`
  return `<table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`
}

function loginPage(error?: string): string {
  return `${head("Sign in")}<body><div class="login">
<div class="brand" style="font-family:var(--serif);font-weight:900;letter-spacing:-.02em">wess<b style="color:var(--accent)">.</b>dev</div>
<h1>Sign in</h1><p>Console — powered by Tower.</p>
${error ? `<div class="msg">${escapeHtml(error)}</div>` : ""}
<form method="post" action="/admin/login">
<div class="field"><label>Email</label><input name="email" type="email" autofocus/></div>
<div class="field"><label>Password</label><input name="password" type="password"/></div>
<button class="btn">Sign in</button></form></div></body></html>`
}

async function dashboard(claims: AuthClaims): Promise<string> {
  const apps = await listApps()
  const ms = await db.all(from(machines).orderBy("created_at", "DESC"))
  const us = await db.all(from(users).orderBy("created_at", "DESC"))
  const tds = await db.all(from(tenant_databases))
  const evs = await db.all(from(events).orderBy("created_at", "DESC").limit(12))

  const stats = [
    ["Apps", apps.length],
    ["Machines", ms.length],
    ["Databases", tds.length],
    ["Users", us.length],
  ]
    .map(([l, n]) => `<div class="s"><div class="n">${n}</div><div class="l">${l}</div></div>`)
    .join("")

  const when = (d: unknown) => escapeHtml(new Date(d as string).toISOString().slice(0, 16).replace("T", " "))

  const appRows = apps.map((a: any) => [
    `<a class="mono" href="/admin/apps/${escapeHtml(a.name)}">${escapeHtml(a.name)}</a>`,
    a.image ? escapeHtml(a.image) : `<span class="empty">—</span>`,
    `<span class="dot${a.status === "running" ? "" : " idle"}">${escapeHtml(a.status)}</span>`,
    `<a class="btn sm ghost" href="/admin/apps/${escapeHtml(a.name)}">Manage →</a>`,
  ])
  const mRows = ms.map((m: any) => [
    `<span class="mono">${escapeHtml(m.vm_id ?? "—")}</span>`,
    m.ip ? escapeHtml(m.ip) : "—",
    `<span class="dot${m.state === "running" ? "" : " idle"}">${escapeHtml(m.state)}</span>`,
    escapeHtml(m.image),
  ])
  const uRows = us.map((u: any) => [escapeHtml(u.email), escapeHtml(u.role), when(u.created_at)])
  const tRows = tds.map((t: any) => [`<span class="mono">${escapeHtml(t.db_name)}</span>`, escapeHtml(t.db_role)])
  const eRows = evs.map((e: any) => [escapeHtml(e.kind), when(e.created_at)])

  return `${head("Dashboard")}<body>${topbar(claims)}<div class="wrap">
<h1 class="page">Dashboard</h1>
<div class="page-sub">Everything running on wess.dev, at a glance.</div>
<div class="stats">${stats}</div>
<h2>Apps</h2>
<div class="toolbar"><form class="inline" method="post" action="/admin/apps"><input name="name" placeholder="new app name" style="width:200px"/><button class="btn sm">Create app</button></form></div>
${table(["Name", "Image", "Status", "Actions"], appRows)}
<h2>Machines</h2>${table(["Machine", "Address", "State", "Image"], mRows)}
<h2>Databases</h2>${table(["Database", "Role"], tRows)}
<h2>Users</h2>${table(["Email", "Role", "Joined"], uRows)}
<h2>Recent activity</h2>${table(["Event", "When"], eRows)}
</div></body></html>`
}

async function settingsPage(
  claims: AuthClaims,
  msg?: string,
  ok?: boolean,
  newToken?: string,
): Promise<string> {
  const u = await db.one<any>(from(users).where((q) => q("id").equals(claims.uid)))
  const joined = u ? new Date(u.created_at).toISOString().slice(0, 10) : "—"
  const providers = await listProviders()
  const tokens = await listApiTokens(claims.uid)

  const providerRows = providers.map((p) => [
    `<code>${escapeHtml(p.name)}</code>`,
    escapeHtml(p.kind),
    p.base_url ? `<code>${escapeHtml(p.base_url)}</code>` : "—",
    `<code>${escapeHtml(p.default_model)}</code>`,
    p.api_key ? "✓ key" : p.kind === "ollama" ? "—" : "<span style='color:var(--yellow)'>no key</span>",
  ])
  const tokenRows = tokens.map((t) => [
    escapeHtml(t.name),
    `<code>${escapeHtml(t.scopes)}</code>`,
    t.app ? escapeHtml(t.app) : "all",
    `<form class="inline" method="post" action="/admin/settings/token/${escapeHtml(t.id)}/revoke"><button class="btn sm ghost">revoke</button></form>`,
  ])
  const scopeChips = ALL_SCOPES.map(
    (s) => `<label class="chip"><input type="checkbox" name="scope_${s}" ${s === "read" ? "checked" : ""}/>${s}</label>`,
  ).join("")

  return `${head("Settings")}<body>${topbar(claims)}<div class="wrap">
<h1 class="page">Settings</h1>
<div class="page-sub">Your account, AI providers, and access tokens.</div>
${msg ? `<div class="msg${ok ? " ok" : ""}">${escapeHtml(msg)}</div>` : ""}
${newToken ? `<div class="tokenbox"><span class="lbl">new token · shown once</span><code>${escapeHtml(newToken)}</code></div>` : ""}

<div class="grid2">
  <div class="card">
    <div class="ch"><h3>Account</h3></div>
    <div class="kv"><span class="k">Email</span><span>${escapeHtml(claims.email)}</span></div>
    <div class="kv"><span class="k">Role</span><span>${escapeHtml(claims.role)}</span></div>
    <div class="kv"><span class="k">Member since</span><span>${escapeHtml(joined)}</span></div>
  </div>
  <div class="card">
    <div class="ch"><h3>Change password</h3></div>
    <form method="post" action="/admin/settings/password">
      <div class="field"><label>Current password</label><input type="password" name="current" autocomplete="current-password"/></div>
      <div class="field"><label>New password</label><input type="password" name="next" placeholder="at least 8 characters" autocomplete="new-password"/></div>
      <div class="formfoot"><button class="btn">Update password</button></div>
    </form>
  </div>
</div>

<div class="card">
  <div class="ch">
    <h3>AI providers</h3>
    <p>Anthropic, OpenAI, Ollama (server or cloud), or any OpenAI-compatible endpoint. Apps call one gateway — switch providers here without redeploying their code.</p>
  </div>
  ${table(["Name", "Kind", "Base URL", "Default model", "Key"], providerRows)}
  <div class="subhead">Add a provider</div>
  <form method="post" action="/admin/settings/provider">
    <div class="formgrid">
      <div class="fld"><label>Kind</label>
        <select name="kind" id="pkind" onchange="pkind()">
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama (server / cloud)</option>
        </select>
      </div>
      <div class="fld"><label>Name</label><input name="name" id="p-name" placeholder="anthropic"/></div>
      <div class="fld"><label>Default model</label><input name="defaultModel" id="p-model" placeholder="claude-opus-4-8"/></div>
      <div class="fld" id="w-base"><label id="l-base">Base URL</label><input name="baseUrl" id="p-base" placeholder=""/></div>
      <div class="fld" id="w-key"><label id="l-key">API key</label><input name="apiKey" id="p-key" type="password" placeholder="sk-…"/></div>
    </div>
    <p class="hint" id="p-hint"></p>
    <div class="formfoot"><button class="btn">Save provider</button></div>
  </form>
</div>
<script>
(function(){
  var CFG = {
    anthropic: { base:false, model:"claude-opus-4-8", namePh:"anthropic",
      keyLabel:"API key", keyPh:"sk-ant-…",
      hint:"Anthropic only needs a name and an API key." },
    openai: { base:true, model:"gpt-4o", namePh:"openai",
      baseLabel:"Base URL", baseOptional:true, basePh:"leave blank for api.openai.com",
      keyLabel:"API key", keyPh:"sk-…",
      hint:"OpenAI needs a name and an API key. Add a Base URL only for OpenAI-compatible providers (Groq, Together, vLLM…)." },
    ollama: { base:true, model:"llama3.2", namePh:"localollama",
      baseLabel:"URL", baseOptional:false, basePh:"http://127.0.0.1:11434   ·   https://ollama.com",
      keyLabel:"API key", keyOptional:true, keyPh:"only for Ollama Cloud / auth-proxied",
      hint:"Ollama: name, default model, and the server URL. The API key is optional — set it for Ollama Cloud or a key-protected server." }
  };
  function el(id){ return document.getElementById(id); }
  window.pkind = function(){
    var c = CFG[el("pkind").value];
    el("w-base").style.display = c.base ? "" : "none";
    if (c.base){
      el("l-base").innerHTML = c.baseLabel + (c.baseOptional ? ' <span style="text-transform:none;font-weight:400;color:var(--muted)">(optional)</span>' : "");
      el("p-base").placeholder = c.basePh;
    }
    el("l-key").innerHTML = c.keyLabel + (c.keyOptional ? ' <span style="text-transform:none;font-weight:400;color:var(--muted)">(optional)</span>' : "");
    el("p-key").placeholder = c.keyPh;
    el("p-model").value = c.model;
    el("p-name").placeholder = c.namePh;
    el("p-hint").textContent = c.hint;
  };
  pkind();
})();
</script>

<div class="card">
  <div class="ch">
    <h3>API tokens</h3>
    <p>Scoped tokens for automation and AI agents. Limit each to specific actions, and optionally to a single app.</p>
  </div>
  ${table(["Name", "Scopes", "App", ""], tokenRows)}
  <div class="subhead">Create a token</div>
  <form method="post" action="/admin/settings/token">
    <div class="formgrid two">
      <div class="fld"><label>Name</label><input name="name" placeholder="deploybot"/></div>
      <div class="fld"><label>App <span style="text-transform:none;font-weight:400">(optional — limit to one app)</span></label><input name="app" placeholder="blog"/></div>
    </div>
    <div class="fld" style="margin-top:18px"><label>Scopes</label><div class="scopes">${scopeChips}</div></div>
    <div class="formfoot"><button class="btn">Create token</button></div>
  </form>
</div>
</div></body></html>`
}

export const adminRoutes = [
  get("/admin/login", pipe((c) => html(c, 200, loginPage()))),

  post(
    "/admin/login",
    pipeline(parseForm)(async (c) => {
      const { email, password } = (c.body ?? {}) as { email?: string; password?: string }
      if (!email || !password) return html(c, 400, loginPage("Email and password required."))
      const t = await authenticate(email, password)
      if (!t) return html(c, 401, loginPage("Invalid credentials."))
      const claims = (await token.verify(t, config.authSecret)) as AuthClaims
      if (claims.role !== "owner") return html(c, 403, loginPage("Owner access only."))
      return redirect(setCookie(c, COOKIE, t, { maxAge: 60 * 60 * 24 * 7 }), "/admin")
    }),
  ),

  post(
    "/admin/logout",
    pipe((c) => redirect(setCookie(c, COOKIE, "", { clear: true }), "/admin/login")),
  ),

  get(
    "/admin",
    pipe(async (c) => {
      const claims = await owner(c)
      if (!claims) return redirect(c, "/admin/login")
      return html(c, 200, await dashboard(claims))
    }),
  ),

  get(
    "/admin/settings",
    pipe(async (c) => {
      const claims = await owner(c)
      if (!claims) return redirect(c, "/admin/login")
      return html(c, 200, await settingsPage(claims))
    }),
  ),

  post(
    "/admin/settings/password",
    pipeline(parseForm)(async (c) => {
      const claims = await owner(c)
      if (!claims) return redirect(c, "/admin/login")
      const { current, next } = (c.body ?? {}) as { current?: string; next?: string }
      if (!current || !next)
        return html(c, 400, await settingsPage(claims, "Both fields are required.", false))
      const res = await changePassword(claims.uid, current, next)
      return html(
        c,
        res.ok ? 200 : 400,
        await settingsPage(claims, res.ok ? "Password updated." : res.error ?? "Could not update.", res.ok),
      )
    }),
  ),

  post(
    "/admin/settings/provider",
    pipeline(parseForm)(async (c) => {
      const claims = await owner(c)
      if (!claims) return redirect(c, "/admin/login")
      const b = (c.body ?? {}) as Record<string, string>
      try {
        await upsertProvider({
          name: b.name,
          kind: b.kind,
          baseUrl: b.baseUrl || null,
          apiKey: b.apiKey || null,
          defaultModel: b.defaultModel,
        })
        return html(c, 200, await settingsPage(claims, `provider "${b.name}" saved`, true))
      } catch (e) {
        return html(c, 400, await settingsPage(claims, (e as Error).message, false))
      }
    }),
  ),

  post(
    "/admin/settings/token",
    pipeline(parseForm)(async (c) => {
      const claims = await owner(c)
      if (!claims) return redirect(c, "/admin/login")
      const b = (c.body ?? {}) as Record<string, string>
      const scopes = ALL_SCOPES.filter((s) => b[`scope_${s}`])
      if (!b.name || !scopes.length)
        return html(c, 400, await settingsPage(claims, "name and at least one scope required", false))
      try {
        const t = await createApiToken(claims.uid, b.name, scopes, b.app || null)
        return html(c, 200, await settingsPage(claims, undefined, true, t.token))
      } catch (e) {
        return html(c, 400, await settingsPage(claims, (e as Error).message, false))
      }
    }),
  ),

  post(
    "/admin/settings/token/:id/revoke",
    pipe(async (c) => {
      const claims = await owner(c)
      if (!claims) return redirect(c, "/admin/login")
      const { revokeApiToken } = await import("../../auth/index.ts")
      await revokeApiToken(claims.uid, c.params.id)
      return redirect(c, "/admin/settings")
    }),
  ),

  post(
    "/admin/apps",
    pipeline(parseForm)(async (c) => {
      if (!(await owner(c))) return redirect(c, "/admin/login")
      const { name } = (c.body ?? {}) as { name?: string }
      if (name) await createApp(name).catch(() => {})
      return redirect(c, "/admin")
    }),
  ),
]
