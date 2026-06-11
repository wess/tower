import { get, halt, parseForm, pipe, pipeline, post, redirect, type Conn } from "@atlas/server"
import {
  appSecrets,
  canAccessApp,
  deployApp,
  destroyApp,
  ensureDatabase,
  getApp,
  getAppDetail,
  setSecret,
  unsetSecret,
} from "../../apps/index.ts"
import { browse, columns, dbUrlFor, listTables, runQuery } from "../../dbmgr/index.ts"
import { escapeHtml, html } from "../../web/html.ts"
import { head, session, table, topbar } from "../admin/index.ts"

const MANAGED = new Set(["DATABASE_URL", "PORT", "AI_GATEWAY_URL", "AI_GATEWAY_KEY", "AI_MODEL", "AI_PROVIDER"])

function badge(status: string): string {
  const c = status === "running" ? "var(--green)" : "var(--muted)"
  return `<span style="display:inline-flex;align-items:center;gap:7px;font-size:13px;color:${c}"><span style="width:8px;height:8px;border-radius:50%;background:${c}"></span>${escapeHtml(status)}</span>`
}

// Destructive-action modal: a native <dialog> styled in Nord that forces the
// user to type the app name before the Destroy button arms. The form is a
// real top-level form (the dialog renders outside the deploy form), so the
// POST to /destroy actually fires — the old markup nested it inside the deploy
// form, which browsers discard.
const MODAL_CSS = `<style>
  dialog.modal{border:none;padding:0;background:transparent;max-width:440px;width:calc(100% - 32px);color:var(--fg);margin:auto;inset:0}
  dialog.modal::backdrop{background:rgba(46,52,64,.74)}
  .modal-card{background:var(--bg-1);border:1px solid var(--line-2);border-radius:14px;padding:26px 26px 22px;box-shadow:0 24px 70px -20px rgba(0,0,0,.7)}
  .modal-card .ic{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--red) 20%,transparent);color:var(--red);font-size:21px;margin-bottom:14px}
  .modal-card h3{font-family:var(--serif);font-size:22px;font-weight:700;color:var(--fg);margin:0 0 8px}
  .modal-card p{color:var(--ink-soft);font-size:14px;line-height:1.55;margin:0 0 18px}
  .modal-card p b{color:var(--red);font-weight:600}
  .modal-card label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:600;margin-bottom:8px}
  .modal-card input{width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--line-2);border-radius:8px;color:var(--fg);font-family:var(--mono);font-size:14px;margin-bottom:20px}
  .modal-card input:focus{outline:none;border-color:var(--accent)}
  .modal-foot{display:flex;justify-content:flex-end;gap:10px}
  .modal-card .btn[disabled]{opacity:.45;cursor:not-allowed;filter:none;transform:none}
</style>`

function destroyModal(name: string): string {
  const e = escapeHtml(name)
  return `<dialog id="destroy-modal" class="modal" onclick="if(event.target===this)this.close()">
  <form class="modal-card" method="post" action="/admin/apps/${e}/destroy">
    <div class="ic">⚠</div>
    <h3>Destroy ${e}?</h3>
    <p>This permanently removes the app, its running machines, and its <b>database and all its data</b>. This cannot be undone.</p>
    <label>Type <span class="mono" style="color:var(--fg-2)">${e}</span> to confirm</label>
    <input name="confirm" required pattern="${e}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${e}"
           oninput="this.form.querySelector('[data-go]').disabled = this.value !== '${e}'"/>
    <div class="modal-foot">
      <button type="button" class="btn ghost" onclick="document.getElementById('destroy-modal').close()">Cancel</button>
      <button class="btn danger" data-go disabled>Destroy app</button>
    </div>
  </form>
</dialog>`
}

async function appPage(name: string, claims: any, flash?: string): Promise<string | null> {
  const detail = await getAppDetail(name)
  if (!detail) return null
  const { app, machines, url, database } = detail
  const env = await appSecrets(app.id)
  const envKeys = Object.keys(env).sort()

  const mRows = machines.map((m: any) => [
    `<span class="mono">${escapeHtml(m.vm_id ?? "—")}</span>`,
    m.ip ? `<span class="mono">${escapeHtml(m.ip)}:${m.port}</span>` : "—",
    `<span class="dot${m.state === "running" ? "" : " idle"}">${escapeHtml(m.state)}</span>`,
    `<span class="mono" style="color:var(--fg-2)">${escapeHtml(m.image)}</span>`,
  ])

  const envRows = envKeys.map((k) => {
    const managed = MANAGED.has(k)
    return [
      `<span class="mono">${escapeHtml(k)}</span>`,
      `<span class="mono" style="color:var(--muted)">${"•".repeat(Math.min(env[k].length, 16))}</span>`,
      managed
        ? `<span style="color:var(--muted);font-size:12px">managed</span>`
        : `<form class="inline" method="post" action="/admin/apps/${escapeHtml(name)}/env/${encodeURIComponent(k)}/delete"><button class="btn sm danger">remove</button></form>`,
    ]
  })

  const dbSection = database.attached
    ? `<div class="ch"><h3>Database</h3><p>A dedicated Postgres database with pgvector. Browse tables and run queries in the manager.</p></div>
       <div class="kv"><span class="k">Database</span><span class="mono">${escapeHtml(database.name ?? "")}</span></div>
       <div class="kv"><span class="k">Connection</span><span class="mono" style="color:var(--muted)">injected as DATABASE_URL</span></div>
       <div class="formfoot" style="justify-content:flex-start;margin-top:18px"><a class="btn" href="/admin/apps/${escapeHtml(name)}/db">Open database manager →</a></div>`
    : `<div class="ch"><h3>Database</h3><p>This app has no database yet. Add one and it'll be wired up as <span class="mono">DATABASE_URL</span> on the next deploy.</p></div>
       <form method="post" action="/admin/apps/${escapeHtml(name)}/db/create">
         <div class="formgrid two">
           <div class="fld"><label>Database</label><input value="${escapeHtml("app_" + name)}" disabled style="opacity:.6"/></div>
           <div class="fld" style="display:flex;align-items:flex-end"><button class="btn">Add a database</button></div>
         </div>
       </form>`

  return `${head(name)}<body>${MODAL_CSS}${topbar(claims)}<div class="wrap">
<div style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--muted);margin-bottom:10px"><a href="/admin">← Dashboard</a></div>
<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:6px">
  <h1 class="page" style="margin:0">${escapeHtml(app.name)}</h1>${badge(app.status)}
</div>
<div class="page-sub"><a class="mono" href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)} ↗</a></div>
${flash ? `<div class="msg ok">${escapeHtml(flash)}</div>` : ""}

<div class="card">
  <div class="ch"><h3>Deploy</h3><p>Push with git, or deploy a prebuilt image.</p></div>
  <div class="kv"><span class="k">Current image</span><span class="mono" style="color:var(--fg-2)">${app.image ? escapeHtml(app.image) : "—"}</span></div>
  <div class="subhead">Deploy an image</div>
  <form method="post" action="/admin/apps/${escapeHtml(name)}/deploy">
    <div class="formgrid two">
      <div class="fld"><label>Image</label><input name="image" placeholder="docker.io/library/nginx:alpine" value="${escapeHtml(app.image ?? "")}"/></div>
      <div class="fld"><label>Port <span style="text-transform:none;font-weight:400">(optional)</span></label><input name="port" placeholder="8080"/></div>
    </div>
    <div class="formfoot"><button type="button" class="btn danger" onclick="document.getElementById('destroy-modal').showModal()">Destroy app</button><button class="btn">Deploy</button></div>
  </form>
</div>

<div class="card">
  <div class="ch"><h3>Environment variables</h3><p>Injected into the app on its next deploy. Values are write-only — set a new value to change one.</p></div>
  ${table(["Key", "Value", ""], envRows)}
  <div class="subhead">Add a variable</div>
  <form method="post" action="/admin/apps/${escapeHtml(name)}/env">
    <div class="formgrid two">
      <div class="fld"><label>Key</label><input name="key" placeholder="STRIPE_KEY"/></div>
      <div class="fld"><label>Value</label><input name="value" placeholder="sk_live_…"/></div>
    </div>
    <div class="formfoot"><button class="btn">Set variable</button></div>
  </form>
</div>

<div class="card">
  ${dbSection}
</div>

${
    machines.length
      ? `<div class="card"><div class="ch"><h3>Machines</h3></div>${table(["Machine", "Address", "State", "Image"], mRows)}</div>`
      : ""
  }
</div>${destroyModal(name)}</body></html>`
}

// ---- DB manager (Ambry-style: sidebar tables + data grid + query runner) ----

const DB_CSS = `<style>
  .dbwrap{display:grid;grid-template-columns:240px 1fr;gap:0;height:calc(100vh - 61px);border-top:1px solid var(--line)}
  @media(max-width:740px){.dbwrap{grid-template-columns:1fr;height:auto}}
  .dbside{background:var(--bg-1);border-right:1px solid var(--line);overflow-y:auto;padding:14px 0}
  .dbside .dbtitle{padding:6px 18px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:600}
  .dbside a{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 18px;font-size:13px;color:var(--fg-2);font-family:var(--mono)}
  .dbside a:hover{background:var(--bg-2)} .dbside a.on{background:var(--bg-2);color:var(--accent);box-shadow:inset 2px 0 0 var(--accent)}
  .dbside a .rc{color:var(--muted);font-size:11px;font-family:var(--sans)}
  .dbmain{display:flex;flex-direction:column;min-width:0;overflow:hidden}
  .dbbar{display:flex;align-items:center;gap:12px;padding:14px 22px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .dbbar h3{font-family:var(--mono);font-size:15px;color:var(--fg)} .dbbar .meta{color:var(--muted);font-size:12.5px}
  .dbbar a.tab,.dbbar .tab{font-size:13px;color:var(--muted);padding:4px 2px;cursor:pointer} .dbbar a.tab.on{color:var(--accent);border-bottom:2px solid var(--accent)}
  .gridscroll{overflow:auto;flex:1}
  table.data{border-collapse:separate;border-spacing:0;font-family:var(--mono);font-size:12.5px;width:max-content;min-width:100%}
  table.data th{position:sticky;top:0;background:var(--bg-1);border-bottom:1px solid var(--line-2);padding:9px 14px;text-align:left;font-family:var(--sans);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);white-space:nowrap;z-index:2}
  table.data td{padding:8px 14px;border-bottom:1px solid var(--line);color:var(--fg-2);white-space:nowrap;max-width:380px;overflow:hidden;text-overflow:ellipsis}
  table.data tr:nth-child(even) td{background:rgba(0,0,0,.10)}
  table.data .rn{color:var(--muted);text-align:right;user-select:none;font-size:11px}
  .nullv{color:var(--bg-3);font-style:italic}
  .pager{display:flex;align-items:center;gap:14px;padding:11px 22px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
  .pager a{padding:4px 10px;border:1px solid var(--line-2);border-radius:6px;color:var(--fg-2)} .pager a:hover{border-color:var(--accent);color:var(--accent)}
  .qbox{padding:18px 22px;border-bottom:1px solid var(--line)}
  .qbox textarea{width:100%;min-height:96px;font-family:var(--mono);font-size:13px;line-height:1.6;resize:vertical}
  .qbox .qfoot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:12px}
  .qerr{color:var(--red);font-family:var(--mono);font-size:13px;padding:14px 22px;white-space:pre-wrap}
  .empty-c{padding:60px 22px;text-align:center;color:var(--muted)}
</style>`

function cell(v: unknown): string {
  if (v === null || v === undefined) return `<span class="nullv">null</span>`
  let s = typeof v === "object" ? JSON.stringify(v) : String(v)
  if (s.length > 200) s = s.slice(0, 200) + "…"
  return escapeHtml(s)
}

async function dbPage(name: string, claims: any, q: Record<string, string>, queryResult?: any): Promise<string | null> {
  const url = await dbUrlFor(name)
  if (!url) return null
  let tables: any[] = []
  let connErr = ""
  try {
    tables = await listTables(url)
  } catch (e) {
    connErr = (e as Error).message
  }
  const active = q.table && tables.some((t) => t.name === q.table) ? q.table : ""
  const page = Math.max(1, Number(q.page) || 1)
  const showQuery = q.view === "query" || !!queryResult

  const sideList = tables
    .map(
      (t) =>
        `<a href="/admin/apps/${escapeHtml(name)}/db?table=${encodeURIComponent(t.name)}" class="${t.name === active && !showQuery ? "on" : ""}">${escapeHtml(t.name)}<span class="rc">${t.rows.toLocaleString()}</span></a>`,
    )
    .join("")

  let main = ""
  if (showQuery) {
    const r = queryResult
    let results = ""
    if (r?.error) {
      results = `<div class="qerr">${escapeHtml(r.error)}</div>`
    } else if (r) {
      const header = r.columns.map((c: string) => `<th>${escapeHtml(c)}</th>`).join("")
      const body = r.rows
        .map((row: unknown[]) => `<tr>${row.map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`)
        .join("")
      results = `<div class="dbbar"><span class="meta">${r.rowCount} row(s) · ${r.ms}ms</span></div>
        <div class="gridscroll">${r.columns.length ? `<table class="data"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>` : `<div class="empty-c">Statement executed.</div>`}</div>`
    }
    main = `<div class="dbbar"><h3>Query</h3><a class="tab" href="/admin/apps/${escapeHtml(name)}/db">data</a><span class="tab on">query</span></div>
      <form method="post" action="/admin/apps/${escapeHtml(name)}/db/query" class="qbox">
        <textarea name="sql" placeholder="select * from ... limit 100" autofocus>${escapeHtml(q.sql ?? r?.sql ?? "")}</textarea>
        <div class="qfoot"><span class="meta" style="color:var(--muted);font-size:12px">Runs as the app's database role.</span><button class="btn">Run</button></div>
      </form>${results}`
  } else if (active) {
    const data = await browse(url, active, { page })
    const cols = await columns(url, active)
    const pkSet = new Set(cols.filter((c) => c.pk).map((c) => c.name))
    const header = data.columns
      .map((c) => `<th>${pkSet.has(c) ? "🔑 " : ""}${escapeHtml(c)}</th>`)
      .join("")
    const body = data.rows
      .map(
        (row, i) =>
          `<tr><td class="rn">${(data.page - 1) * data.pageSize + i + 1}</td>${row.map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`,
      )
      .join("")
    const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))
    const pg = (p: number) => `/admin/apps/${escapeHtml(name)}/db?table=${encodeURIComponent(active)}&page=${p}`
    main = `<div class="dbbar"><h3>${escapeHtml(active)}</h3><span class="meta">${data.total.toLocaleString()} rows</span>
        <span style="flex:1"></span><span class="tab on">data</span><a class="tab" href="/admin/apps/${escapeHtml(name)}/db?view=query">query</a></div>
      <div class="gridscroll"><table class="data"><thead><tr><th class="rn">#</th>${header}</tr></thead><tbody>${body || `<tr><td colspan="${data.columns.length + 1}" class="empty-c">No rows.</td></tr>`}</tbody></table></div>
      <div class="pager">
        ${page > 1 ? `<a href="${pg(page - 1)}">← prev</a>` : ""}
        <span>page ${page} / ${totalPages}</span>
        ${page < totalPages ? `<a href="${pg(page + 1)}">next →</a>` : ""}
        <span style="flex:1"></span><span>${data.rows.length} of ${data.total.toLocaleString()} rows</span>
      </div>`
  } else {
    main = `<div class="dbbar"><h3>Database</h3><span style="flex:1"></span><a class="tab" href="/admin/apps/${escapeHtml(name)}/db?view=query">query</a></div>
      <div class="empty-c">${connErr ? `<span class="nullv">${escapeHtml(connErr)}</span>` : tables.length ? "Select a table on the left, or run a query." : "This database is empty. Run a query to create tables."}</div>`
  }

  return `${head(`${name} · database`)}<body>${DB_CSS}${topbar(claims)}
<div style="padding:12px 22px;border-bottom:1px solid var(--line);font-size:13px;color:var(--muted)"><a href="/admin/apps/${escapeHtml(name)}">← ${escapeHtml(name)}</a> &nbsp;/&nbsp; <span class="mono" style="color:var(--fg-2)">database</span></div>
<div class="dbwrap">
  <aside class="dbside"><div class="dbtitle">Tables · ${tables.length}</div>${sideList || '<div style="padding:8px 18px;color:var(--muted);font-size:12px">no tables</div>'}</aside>
  <div class="dbmain">${main}</div>
</div></body></html>`
}

// Authenticated AND authorized for this app: members reach only their own apps;
// the owner reaches any. Unauthorized → bounced to the dashboard (no 404 leak).
async function guard(c: Conn): Promise<any> {
  const claims = await session(c)
  if (!claims) return redirect(c, "/admin/login")
  if (!(await canAccessApp(c.params.name, claims.uid, claims.role === "owner")))
    return redirect(c, "/admin")
  return claims
}

export const appDetailRoutes = [
  get(
    "/admin/apps/:name",
    pipe(async (c) => {
      const claims = await guard(c)
      if (claims.halted) return claims
      const page = await appPage(c.params.name, claims)
      return page ? html(c, 200, page) : redirect(c, "/admin")
    }),
  ),

  post(
    "/admin/apps/:name/deploy",
    pipeline(parseForm)(async (c) => {
      const claims = await guard(c)
      if (claims.halted) return claims
      const { image, port } = (c.body ?? {}) as { image?: string; port?: string }
      if (image) await deployApp(c.params.name, image, port ? Number(port) : undefined).catch(() => {})
      return redirect(c, `/admin/apps/${c.params.name}`)
    }),
  ),

  post(
    "/admin/apps/:name/destroy",
    pipe(async (c) => {
      const claims = await guard(c)
      if (claims.halted) return claims
      await destroyApp(c.params.name).catch(() => {})
      return redirect(c, "/admin")
    }),
  ),

  post(
    "/admin/apps/:name/env",
    pipeline(parseForm)(async (c) => {
      const claims = await guard(c)
      if (claims.halted) return claims
      const app = await getApp(c.params.name)
      const { key, value } = (c.body ?? {}) as { key?: string; value?: string }
      if (app && key && value !== undefined) await setSecret(app.id, key, value)
      return redirect(c, `/admin/apps/${c.params.name}`)
    }),
  ),

  post(
    "/admin/apps/:name/env/:key/delete",
    pipe(async (c) => {
      const claims = await guard(c)
      if (claims.halted) return claims
      const app = await getApp(c.params.name)
      if (app && !MANAGED.has(c.params.key)) await unsetSecret(app.id, decodeURIComponent(c.params.key))
      return redirect(c, `/admin/apps/${c.params.name}`)
    }),
  ),

  post(
    "/admin/apps/:name/db/create",
    pipe(async (c) => {
      const claims = await guard(c)
      if (claims.halted) return claims
      await ensureDatabase(c.params.name).catch(() => {})
      return redirect(c, `/admin/apps/${c.params.name}/db`)
    }),
  ),

  get(
    "/admin/apps/:name/db",
    pipe(async (c) => {
      const claims = await guard(c)
      if (claims.halted) return claims
      const page = await dbPage(c.params.name, claims, c.query)
      return page ? html(c, 200, page) : redirect(c, `/admin/apps/${c.params.name}`)
    }),
  ),

  post(
    "/admin/apps/:name/db/query",
    pipeline(parseForm)(async (c) => {
      const claims = await guard(c)
      if (claims.halted) return claims
      const url = await dbUrlFor(c.params.name)
      if (!url) return redirect(c, `/admin/apps/${c.params.name}`)
      const sql = ((c.body ?? {}) as { sql?: string }).sql ?? ""
      const result = sql.trim() ? { ...(await runQuery(url, sql)), sql } : undefined
      const page = await dbPage(c.params.name, claims, { ...c.query, view: "query", sql }, result)
      return page ? html(c, 200, page) : redirect(c, `/admin/apps/${c.params.name}`)
    }),
  ),
]
