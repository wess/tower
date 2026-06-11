import { from } from "@atlas/db"
import { token } from "@atlas/auth"
import { get, parseForm, pipe, pipeline, post, redirect, type Conn } from "@atlas/server"
import {
  ALL_SCOPES,
  authenticate,
  changePassword,
  createApiToken,
  listApiTokens,
  register,
  removeUser,
  type AuthClaims,
} from "../../auth/index.ts"
import { listProviders, upsertProvider } from "../../ai/index.ts"
import { createApp, listAppsForUser } from "../../apps/index.ts"
import { createInvite, getInvite, inviteState, listInvites, listMembers, revokeInvite } from "../../invites/index.ts"
import { config } from "../../config/index.ts"
import { db } from "../../db/index.ts"
import { events, machines, tenant_databases, users } from "../../schema/index.ts"
import { escapeHtml, html, readCookies, setCookie } from "../../web/html.ts"
import { baseCss, FONTS, themeVars } from "../../web/theme.ts"

const COOKIE = "tower_session"

// Any authenticated user (owner or member). Used to gate the console — members
// manage their own apps and can invite, the owner additionally sees everything.
export async function session(c: Conn): Promise<AuthClaims | null> {
  const t = readCookies(c)[COOKIE]
  if (!t) return null
  try {
    return (await token.verify(t, config.authSecret)) as AuthClaims
  } catch {
    return null
  }
}

export async function owner(c: Conn): Promise<AuthClaims | null> {
  const claims = await session(c)
  return claims && claims.role === "owner" ? claims : null
}

const isOwner = (c: AuthClaims) => c.role === "owner"


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
  .tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
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
  form.inline{display:inline-flex;gap:7px;align-items:center;margin:0;flex-wrap:wrap}
  .toolbar{display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap}

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
  .login .alt{margin-top:18px;font-size:13px;color:var(--muted);text-align:center}

  /* mobile */
  @media(max-width:560px){
    .top{padding:14px 18px}
    .brand{font-size:18px} .brand .sub,.brand .pw{display:none}
    details.menu summary{max-width:58vw;overflow:hidden;white-space:nowrap}
    .wrap{padding:24px 18px}
    h2{margin:32px 0 14px}
    .stats .s{padding:18px 18px 16px} .stats .n{font-size:32px}
    .panel{width:min(80vw,236px)}
    .card .ch h3{font-size:19px}
    input.copy{min-width:0}
  }

  /* copyable invite link */
  input.copy{font-family:var(--mono);font-size:12.5px;color:var(--accent);background:var(--bg);border:1px solid var(--line-2);border-radius:7px;padding:7px 10px;width:100%;min-width:260px;cursor:pointer}
  input.copy:focus{outline:none;border-color:var(--accent)}
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
  const inner = !rows.length
    ? `<table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody><tr><td colspan="${cols.length}" class="empty">Nothing here yet.</td></tr></tbody></table>`
    : `<table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`
  // scroll-wrap so wide tables scroll horizontally on phones instead of overflowing
  return `<div class="tw">${inner}</div>`
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

// Invite-acceptance page. Reached via /admin/register?code=… from an invite link.
function registerPage(opts: {
  code: string
  email?: string | null
  error?: string
  invalid?: boolean
}): string {
  if (opts.invalid)
    return `${head("Invite")}<body><div class="login">
<div class="brand" style="font-family:var(--serif);font-weight:900;letter-spacing:-.02em">wess<b style="color:var(--accent)">.</b>dev</div>
<h1>Invite needed</h1><p>wess.dev is invite-only. ${escapeHtml(opts.error ?? "This invite link is invalid, expired, or already used.")}</p>
<div class="alt">Already have an account? <a href="/admin/login">Sign in</a>.</div>
</div></body></html>`
  return `${head("Accept invite")}<body><div class="login">
<div class="brand" style="font-family:var(--serif);font-weight:900;letter-spacing:-.02em">wess<b style="color:var(--accent)">.</b>dev</div>
<h1>Create your account</h1><p>You've been invited to wess.dev — powered by Tower.</p>
${opts.error ? `<div class="msg">${escapeHtml(opts.error)}</div>` : ""}
<form method="post" action="/admin/register">
<input type="hidden" name="code" value="${escapeHtml(opts.code)}"/>
<div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(opts.email ?? "")}" ${opts.email ? "readonly" : "autofocus"}/></div>
<div class="field"><label>Password</label><input name="password" type="password" placeholder="at least 8 characters" autocomplete="new-password"/></div>
<button class="btn">Create account</button></form>
<div class="alt">Already have an account? <a href="/admin/login">Sign in</a>.</div>
</div></body></html>`
}

const when = (d: unknown) =>
  escapeHtml(new Date(d as string).toISOString().slice(0, 16).replace("T", " "))

// The members + invites card. Everyone can invite; owners see all invites and
// the member roster, members see only the invites they sent.
async function membersSection(claims: AuthClaims): Promise<string> {
  const owner = isOwner(claims)
  const invites = await listInvites(claims.uid, owner)
  const link = (code: string) => `https://${config.baseDomain}/admin/register?code=${code}`

  const inviteRows = invites.map((i) => {
    const status =
      i.state === "accepted"
        ? `<span class="dot">accepted${i.accepted_by_email ? ` · ${escapeHtml(i.accepted_by_email)}` : ""}</span>`
        : i.state === "expired"
          ? `<span class="dot idle">expired</span>`
          : `<span class="dot idle">pending</span>`
    const linkCell =
      i.state === "pending"
        ? `<input class="copy" readonly onclick="this.select()" value="${escapeHtml(link(i.code))}"/>`
        : `<span class="empty">—</span>`
    const cols = [
      linkCell,
      i.email ? escapeHtml(i.email) : `<span class="empty">anyone with link</span>`,
      status,
    ]
    if (owner) cols.push(escapeHtml(i.invited_by_email))
    const canAct = i.state === "pending" || owner
    cols.push(
      canAct
        ? `<form class="inline" method="post" action="/admin/invites/${escapeHtml(i.id)}/revoke"><button class="btn sm ghost">${i.state === "pending" ? "revoke" : "remove"}</button></form>`
        : "",
    )
    return cols
  })
  const inviteCols = owner ? ["Invite link", "For", "Status", "Invited by", ""] : ["Invite link", "For", "Status", ""]

  let memberCard = ""
  if (owner) {
    const memberRows = (await listMembers()).map((u) => {
      const removable = u.role !== "owner" && Number(u.id) !== claims.uid
      return [
        escapeHtml(u.email),
        escapeHtml(u.role),
        when(u.created_at),
        removable
          ? `<form class="inline" method="post" action="/admin/members/${u.id}/remove" onsubmit="return confirm('Remove ${escapeHtml(u.email)}? Their apps will be left without an owner.')"><button class="btn sm danger">remove</button></form>`
          : `<span class="empty">—</span>`,
      ]
    })
    memberCard = `<div class="card" style="margin-top:22px">
        <div class="ch"><h3>Members</h3><p>Everyone with an account on wess.dev.</p></div>
        ${table(["Email", "Role", "Joined", ""], memberRows)}
      </div>`
  }

  return `<h2>Members &amp; invites</h2>
<div class="card">
  <div class="ch"><h3>Invite someone</h3><p>wess.dev is invite-only. Create an invite link and share it with a friend — anyone you invite can also invite others.</p></div>
  <form method="post" action="/admin/invites">
    <div class="formgrid two">
      <div class="fld"><label>Email <span style="text-transform:none;font-weight:400">(optional — lock the invite to one address)</span></label><input name="email" type="email" placeholder="friend@example.com"/></div>
      <div class="fld" style="display:flex;align-items:flex-end"><button class="btn">Create invite link</button></div>
    </div>
  </form>
  <div class="subhead">Invites</div>
  ${table(inviteCols, inviteRows)}
</div>
${memberCard}`
}

async function dashboard(claims: AuthClaims): Promise<string> {
  const owner = isOwner(claims)
  const apps = await listAppsForUser(claims.uid, owner)
  const ms = owner ? await db.all(from(machines).orderBy("created_at", "DESC")) : []
  const tds = owner ? await db.all(from(tenant_databases)) : []
  const evs = owner ? await db.all(from(events).orderBy("created_at", "DESC").limit(12)) : []
  const memberCount = (await listMembers()).length

  const statDefs: [string, number][] = owner
    ? [["Apps", apps.length], ["Machines", ms.length], ["Databases", tds.length], ["Members", memberCount]]
    : [["Your apps", apps.length], ["Members", memberCount]]
  const stats = statDefs
    .map(([l, n]) => `<div class="s"><div class="n">${n}</div><div class="l">${l}</div></div>`)
    .join("")

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
  const tRows = tds.map((t: any) => [`<span class="mono">${escapeHtml(t.db_name)}</span>`, escapeHtml(t.db_role)])
  const eRows = evs.map((e: any) => [escapeHtml(e.kind), when(e.created_at)])

  const ownerSections = owner
    ? `<h2>Machines</h2>${table(["Machine", "Address", "State", "Image"], mRows)}
<h2>Databases</h2>${table(["Database", "Role"], tRows)}
<h2>Recent activity</h2>${table(["Event", "When"], eRows)}`
    : ""

  return `${head("Dashboard")}<body>${topbar(claims)}<div class="wrap">
<h1 class="page">Dashboard</h1>
<div class="page-sub">${owner ? "Everything running on wess.dev, at a glance." : "Your apps on wess.dev."}</div>
<div class="stats">${stats}</div>
<h2>Apps</h2>
<div class="toolbar"><form class="inline" method="post" action="/admin/apps"><input name="name" placeholder="new app name" style="width:200px;max-width:100%"/><button class="btn sm">Create app</button></form></div>
${table(["Name", "Image", "Status", "Actions"], appRows)}
${await membersSection(claims)}
${ownerSections}
</div></body></html>`
}

async function settingsPage(
  claims: AuthClaims,
  msg?: string,
  ok?: boolean,
  newToken?: string,
): Promise<string> {
  const owner = isOwner(claims)
  const u = await db.one<any>(from(users).where((q) => q("id").equals(claims.uid)))
  const joined = u ? new Date(u.created_at).toISOString().slice(0, 10) : "—"
  const providers = owner ? await listProviders() : []
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

  const aiCard = owner
    ? `<div class="card">
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
</script>`
    : ""

  return `${head("Settings")}<body>${topbar(claims)}<div class="wrap">
<h1 class="page">Settings</h1>
<div class="page-sub">Your account${owner ? ", AI providers," : ""} and access tokens.</div>
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

${aiCard}

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
      const claims = await session(c)
      if (!claims) return redirect(c, "/admin/login")
      return html(c, 200, await dashboard(claims))
    }),
  ),

  get(
    "/admin/settings",
    pipe(async (c) => {
      const claims = await session(c)
      if (!claims) return redirect(c, "/admin/login")
      return html(c, 200, await settingsPage(claims))
    }),
  ),

  post(
    "/admin/settings/password",
    pipeline(parseForm)(async (c) => {
      const claims = await session(c)
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
      const claims = await session(c)
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
      const claims = await session(c)
      if (!claims) return redirect(c, "/admin/login")
      const { revokeApiToken } = await import("../../auth/index.ts")
      await revokeApiToken(claims.uid, c.params.id)
      return redirect(c, "/admin/settings")
    }),
  ),

  // ---- invite-only registration ----
  get(
    "/admin/register",
    pipe(async (c) => {
      const code = c.query.code ?? ""
      const inv = code ? await getInvite(code) : null
      if (!inv || inviteState(inv) !== "pending")
        return html(c, 200, registerPage({ code, invalid: true }))
      return html(c, 200, registerPage({ code, email: inv.email }))
    }),
  ),

  post(
    "/admin/register",
    pipeline(parseForm)(async (c) => {
      const b = (c.body ?? {}) as { email?: string; password?: string; code?: string }
      const code = b.code ?? ""
      if (!b.email || !b.password)
        return html(c, 400, registerPage({ code, email: b.email, error: "Email and password are required." }))
      try {
        await register(b.email, b.password, code)
        const t = await authenticate(b.email, b.password)
        if (!t) return html(c, 500, registerPage({ code, email: b.email, error: "Could not sign you in." }))
        return redirect(setCookie(c, COOKIE, t, { maxAge: 60 * 60 * 24 * 7 }), "/admin")
      } catch (e) {
        return html(c, 400, registerPage({ code, email: b.email, error: (e as Error).message }))
      }
    }),
  ),

  // any member can mint an invite; owner or inviter can revoke
  post(
    "/admin/invites",
    pipeline(parseForm)(async (c) => {
      const claims = await session(c)
      if (!claims) return redirect(c, "/admin/login")
      const { email } = (c.body ?? {}) as { email?: string }
      await createInvite(claims.uid, { email: email || null })
      return redirect(c, "/admin")
    }),
  ),

  post(
    "/admin/invites/:id/revoke",
    pipe(async (c) => {
      const claims = await session(c)
      if (!claims) return redirect(c, "/admin/login")
      await revokeInvite(c.params.id, claims.uid, isOwner(claims))
      return redirect(c, "/admin")
    }),
  ),

  // owner-only member removal (can't remove yourself)
  post(
    "/admin/members/:id/remove",
    pipe(async (c) => {
      const claims = await owner(c)
      if (!claims) return redirect(c, "/admin/login")
      const id = Number(c.params.id)
      if (id && id !== claims.uid) await removeUser(id)
      return redirect(c, "/admin")
    }),
  ),

  post(
    "/admin/apps",
    pipeline(parseForm)(async (c) => {
      const claims = await session(c)
      if (!claims) return redirect(c, "/admin/login")
      const { name } = (c.body ?? {}) as { name?: string }
      if (name) await createApp(name, claims.uid).catch(() => {})
      return redirect(c, "/admin")
    }),
  ),
]
