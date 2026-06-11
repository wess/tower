import { from } from "@atlas/db"
import { config } from "../config/index.ts"
import { db, sql } from "../db/index.ts"
import { destroyMachine, machineLogs, runMachine } from "../machines/index.ts"
import { attachDatabase, detachDatabase } from "../postgres/index.ts"
import {
  apps,
  machines,
  secrets,
  tenant_databases,
  type App,
  type Machine,
  type Secret,
} from "../schema/index.ts"

const NAME_RE = /^[a-z][a-z0-9]{2,30}$/
const RESERVED = new Set(["www", "api", "git", "admin", "docs", "dl", "mail", "smtp", "ns1", "ns2"])

export async function createApp(name: string, ownerId: number, image?: string): Promise<App> {
  if (!NAME_RE.test(name)) throw new Error("invalid app name (lowercase letters+digits, 3-31 chars)")
  if (RESERVED.has(name)) throw new Error(`"${name}" is a reserved name`)
  const rows = await db.all<App>(
    from(apps)
      .insert({ name, image: image ?? null, owner_id: ownerId })
      .returning("id", "name", "image", "status", "owner_id", "created_at", "updated_at"),
  )
  await syncEdge()
  return rows[0]
}

// All apps (platform-wide). Used by the edge site list + the owner dashboard.
export async function listApps(): Promise<App[]> {
  return db.all<App>(from(apps).orderBy("created_at", "DESC"))
}

// Apps visible to a user: the owner sees everything, members see only their own.
export async function listAppsForUser(uid: number, isOwner: boolean): Promise<App[]> {
  if (isOwner) return listApps()
  return db.all<App>(
    from(apps).where((q) => q("owner_id").equals(uid)).orderBy("created_at", "DESC"),
  )
}

export async function getApp(name: string): Promise<App | null> {
  return db.one<App>(from(apps).where((q) => q("name").equals(name)))
}

// Authorize a user against an app by name: owner role passes for any app;
// members pass only for apps they own.
export async function canAccessApp(
  name: string,
  uid: number,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true
  const app = await getApp(name)
  return !!app && Number(app.owner_id) === uid
}

export async function appMachines(appId: string): Promise<Machine[]> {
  return db.all<Machine>(
    from(machines).where((q) => q("app_id").equals(appId)).orderBy("created_at", "DESC"),
  )
}

export type AppDetail = {
  app: App
  machines: Machine[]
  url: string
  database: { attached: boolean; name?: string }
}

export async function getAppDetail(name: string): Promise<AppDetail | null> {
  const app = await getApp(name)
  if (!app) return null
  const ms = await appMachines(app.id)
  const tdb = await db.one<any>(from(tenant_databases).where((q) => q("app_id").equals(app.id)))
  return {
    app,
    machines: ms,
    url: `https://${app.name}.${config.baseDomain}`,
    database: tdb ? { attached: true, name: tdb.db_name } : { attached: false },
  }
}

// newest running machine — what the edge routes traffic to
export async function resolveApp(name: string): Promise<{ ip: string; port: number } | null> {
  const app = await getApp(name)
  if (!app) return null
  const ms = await appMachines(app.id)
  const live = ms.find((m) => m.state === "running" && m.ip)
  return live?.ip ? { ip: live.ip, port: Number(live.port) || 8080 } : null
}

export async function appSecrets(appId: string): Promise<Record<string, string>> {
  const rows = await db.all<Secret>(from(secrets).where((q) => q("app_id").equals(appId)))
  return Object.fromEntries(rows.map((s) => [s.name, s.value]))
}

export async function listSecretNames(appId: string): Promise<{ name: string; created_at: Date }[]> {
  const rows = await db.all<Secret>(
    from(secrets).where((q) => q("app_id").equals(appId)).orderBy("name", "ASC"),
  )
  return rows.map((s) => ({ name: s.name, created_at: s.created_at }))
}

export async function setSecret(appId: string, name: string, value: string): Promise<void> {
  await sql`
    INSERT INTO secrets (app_id, name, value) VALUES (${appId}, ${name}, ${value})
    ON CONFLICT (app_id, name) DO UPDATE SET value = EXCLUDED.value
  `
}

export async function unsetSecret(appId: string, name: string): Promise<void> {
  await db.execute(
    from(secrets).where((q) => q("app_id").equals(appId)).where((q) => q("name").equals(name)).del(),
  )
}

async function logEvent(appId: string | null, kind: string, data: Record<string, unknown> = {}) {
  await sql`INSERT INTO events (app_id, kind, data) VALUES (${appId}, ${kind}, ${JSON.stringify(data)})`.catch(
    () => {},
  )
}

// Deploy: ensure a tenant DB (first deploy), inject secrets+PORT as env, boot a
// microVM, then retire the previous machines (rolling redeploy).
export async function deployApp(
  name: string,
  image: string,
  port?: number,
): Promise<{ app: App; machine: Machine }> {
  const app = await getApp(name)
  if (!app) throw new Error("app not found")

  await ensureDatabase(name)

  const previous = await appMachines(app.id)
  // reuse the app's current port unless the deploy specifies one
  const appPort = port ?? (previous[0] ? Number(previous[0].port) : 8080) ?? 8080

  const { aiEnvFor } = await import("../ai/index.ts")
  const env = { ...(await appSecrets(app.id)), ...(await aiEnvFor(app.id)) }
  env.PORT = String(appPort)
  const machineName = `${name}${Date.now().toString(36)}`
  const vm = await runMachine({ name: machineName, image, env })

  const rows = await db.all<Machine>(
    from(machines)
      .insert({ app_id: app.id, vm_id: vm.vmId, ip: vm.ip, image, state: "running", port: appPort })
      .returning("id", "app_id", "vm_id", "ip", "image", "state", "port", "created_at", "updated_at"),
  )
  await db.execute(
    from(apps)
      .where((q) => q("id").equals(app.id))
      .update({ image, status: "running", updated_at: new Date() }),
  )

  // retire previous machines now that the new one is live
  for (const m of previous) {
    if (m.vm_id) await destroyMachine(m.vm_id, m.ip).catch(() => {})
    await db.execute(from(machines).where((q) => q("id").equals(m.id)).del()).catch(() => {})
  }

  await logEvent(app.id, "deploy", { image, machine: vm.vmId, port: appPort })
  return { app, machine: rows[0] }
}

export async function appLogs(name: string, lines = 200): Promise<string | null> {
  const app = await getApp(name)
  if (!app) return null
  const ms = await appMachines(app.id)
  const live = ms[0]
  if (!live?.vm_id) return ""
  return machineLogs(live.vm_id, lines)
}

// Provision the app's tenant database if it doesn't have one yet (idempotent).
export async function ensureDatabase(name: string): Promise<{ created: boolean; dbName: string }> {
  const app = await getApp(name)
  if (!app) throw new Error("app not found")
  const attached = await db.one<any>(from(tenant_databases).where((q) => q("app_id").equals(app.id)))
  if (attached) return { created: false, dbName: attached.db_name }
  const tdb = await attachDatabase(name)
  await db.execute(
    from(tenant_databases).insert({ app_id: app.id, db_name: tdb.dbName, db_role: tdb.dbRole }),
  )
  await setSecret(app.id, "DATABASE_URL", tdb.url)
  return { created: true, dbName: tdb.dbName }
}

export async function destroyApp(name: string): Promise<void> {
  const app = await getApp(name)
  if (!app) return
  const mlist = await appMachines(app.id)
  for (const m of mlist) {
    if (m.vm_id) await destroyMachine(m.vm_id, m.ip).catch(() => {})
  }
  await detachDatabase(name).catch(() => {})
  await db.execute(from(apps).where((q) => q("id").equals(app.id)).del())
  // clean platform state: git repo + logs
  Bun.spawn(["rm", "-rf", `${config.gitRoot}/${name}.git`])
  Bun.spawn(["bash", "-c", `rm -f ${config.logsDir}/${name}*.log`])
  await logEvent(null, "destroy", { app: name })
  await syncEdge()
}

// Keep the edge's site list in sync: write apps.json, then restart the edge
// (delayed + detached so the API response that triggered it gets out first).
export async function writeAppsFile(): Promise<void> {
  const rows = await listApps()
  const list = rows.map((a) => ({ name: a.name }))
  await Bun.write(config.appsFile, JSON.stringify(list, null, 2))
}

async function syncEdge(): Promise<void> {
  await writeAppsFile().catch(() => {})
  setTimeout(() => {
    Bun.spawn(["systemctl", "restart", "toweredge"], { stdout: "ignore", stderr: "ignore" })
  }, 1500)
}
