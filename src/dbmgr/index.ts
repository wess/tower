import { SQL } from "bun"
import { from } from "@atlas/db"
import { db } from "../db/index.ts"
import { getApp } from "../apps/index.ts"
import { secrets } from "../schema/index.ts"

// The owner manages an app's tenant database through the app's own DATABASE_URL
// (stored as a secret on first deploy) — so access is naturally scoped to that
// one database via the tenant role.
export async function dbUrlFor(appName: string): Promise<string | null> {
  const app = await getApp(appName)
  if (!app) return null
  const row = await db.one<any>(
    from(secrets).where((q) => q("app_id").equals(app.id)).where((q) => q("name").equals("DATABASE_URL")),
  )
  return row?.value ?? null
}

function open(url: string): SQL {
  return new SQL(url)
}

export type TableInfo = { name: string; type: "table" | "view"; rows: number }

export async function listTables(url: string): Promise<TableInfo[]> {
  const sql = open(url)
  try {
    const rows = (await sql.unsafe(`
      SELECT t.table_name AS name,
             CASE t.table_type WHEN 'BASE TABLE' THEN 'table' ELSE 'view' END AS type,
             COALESCE(s.n_live_tup, 0) AS rows
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
      WHERE t.table_schema = 'public'
      ORDER BY t.table_name
    `)) as any[]
    return rows.map((r) => ({ name: String(r.name), type: r.type === "view" ? "view" : "table", rows: Number(r.rows) || 0 }))
  } finally {
    await sql.end()
  }
}

export type Column = { name: string; type: string; nullable: boolean; pk: boolean; default: string | null }

export async function columns(url: string, table: string): Promise<Column[]> {
  const sql = open(url)
  try {
    const rows = (await sql`
      SELECT c.column_name AS name, c.data_type AS type, c.is_nullable AS nullable, c.column_default AS def,
        EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name
          WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_name=c.table_name AND k.column_name=c.column_name
        ) AS pk
      FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=${table}
      ORDER BY c.ordinal_position
    `) as any[]
    return rows.map((r) => ({
      name: String(r.name),
      type: String(r.type),
      nullable: r.nullable === "YES",
      pk: r.pk === true || r.pk === "t",
      default: r.def ?? null,
    }))
  } finally {
    await sql.end()
  }
}

function ident(name: string): string {
  // only allow names we got from introspection; quote defensively
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) throw new Error(`invalid identifier: ${name}`)
  return `"${name}"`
}

export type Page = { columns: string[]; rows: unknown[][]; total: number; page: number; pageSize: number }

export async function browse(
  url: string,
  table: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<Page> {
  const valid = (await listTables(url)).map((t) => t.name)
  if (!valid.includes(table)) throw new Error("no such table")
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 500)
  const offset = (page - 1) * pageSize
  const sql = open(url)
  try {
    const countRows = (await sql.unsafe(`SELECT count(*)::int AS n FROM ${ident(table)}`)) as any[]
    const total = Number(countRows[0]?.n ?? 0)
    const data = (await sql.unsafe(
      `SELECT * FROM ${ident(table)} LIMIT ${pageSize} OFFSET ${offset}`,
    )) as Record<string, unknown>[]
    const cols = data.length ? Object.keys(data[0]) : (await columns(url, table)).map((c) => c.name)
    const rows = data.map((r) => cols.map((c) => r[c]))
    return { columns: cols, rows, total, page, pageSize }
  } finally {
    await sql.end()
  }
}

export type QueryResult = { columns: string[]; rows: unknown[][]; rowCount: number; ms: number; error?: string }

export async function runQuery(url: string, query: string): Promise<QueryResult> {
  const started = Date.now()
  const sql = open(url)
  try {
    const data = (await sql.unsafe(query)) as any[]
    const arr = Array.isArray(data) ? data : []
    const cols = arr.length && typeof arr[0] === "object" && arr[0] ? Object.keys(arr[0]) : []
    const rows = arr.map((r) => (cols.length ? cols.map((c) => (r as any)[c]) : [r]))
    return { columns: cols, rows, rowCount: arr.length, ms: Date.now() - started }
  } catch (e) {
    return { columns: [], rows: [], rowCount: 0, ms: Date.now() - started, error: (e as Error).message }
  } finally {
    await sql.end()
  }
}
