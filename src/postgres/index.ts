import { SQL } from "bun"
import { config } from "../config/index.ts"

// app names map directly to Postgres role/database identifiers, so validate hard
const NAME_RE = /^[a-z][a-z0-9]{2,30}$/

export function tenantIdent(appName: string): string {
  if (!NAME_RE.test(appName)) throw new Error(`invalid app name: ${appName}`)
  return `app_${appName}`
}

export type TenantDb = {
  dbName: string
  dbRole: string
  password: string
  url: string
}

function adminSql(): SQL {
  // controlplane @ :5432 direct — provisioning DDL can't run through PgBouncer
  return new SQL(config.databaseUrl)
}

function pgbouncerAdminUrl(): string {
  const u = new URL(config.databaseUrl)
  return `postgres://${u.username}:${u.password}@127.0.0.1:${config.pgbouncerPort}/pgbouncer`
}

// Provision a tenant DB + role (validated recipe). Returns a PgBouncer URL.
export async function attachDatabase(appName: string): Promise<TenantDb> {
  const ident = tenantIdent(appName)
  const password = crypto.randomUUID().replaceAll("-", "")
  const sql = adminSql()
  try {
    await sql.unsafe(`CREATE ROLE ${ident} LOGIN PASSWORD '${password}' CONNECTION LIMIT 50`)
    await sql.unsafe(`GRANT ${ident} TO controlplane WITH SET TRUE`)
    await sql.unsafe(`CREATE DATABASE ${ident} OWNER ${ident}`)
    await sql.unsafe(`REVOKE CONNECT ON DATABASE ${ident} FROM PUBLIC`)
  } finally {
    await sql.end()
  }
  const url = `postgres://${ident}:${password}@${config.gatewayIp}:${config.pgbouncerPort}/${ident}`
  return { dbName: ident, dbRole: ident, password, url }
}

// Tear down a tenant DB + role. Clears the PgBouncer pool first (best-effort)
// so DROP DATABASE isn't blocked, then force-drops.
export async function detachDatabase(appName: string): Promise<void> {
  const ident = tenantIdent(appName)
  try {
    const pgb = new SQL(pgbouncerAdminUrl())
    await pgb.unsafe(`KILL ${ident}`)
    await pgb.end()
  } catch {
    // PgBouncer admin console is finicky over the wire; FORCE drop covers it
  }
  const sql = adminSql()
  try {
    await sql.unsafe(`DROP DATABASE IF EXISTS ${ident} WITH (FORCE)`)
    await sql.unsafe(`DROP ROLE IF EXISTS ${ident}`)
  } finally {
    await sql.end()
  }
}
