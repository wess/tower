import { from } from "@atlas/db"
import { appLogs, appMachines, getApp } from "../apps/index.ts"
import { config } from "../config/index.ts"
import { db } from "../db/index.ts"
import { listMachines } from "../machines/index.ts"
import { app_ai, tenant_databases } from "../schema/index.ts"

export type Check = { name: string; ok: boolean; detail: string }
export type Diagnosis = { app: string; healthy: boolean; checks: Check[]; explanation?: string }

function tcpOk(host: string, port: number, ms = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: boolean) => {
      if (done) return
      done = true
      resolve(v)
    }
    const timer = setTimeout(() => finish(false), ms)
    Bun.connect({
      hostname: host,
      port,
      socket: {
        open(sock) {
          clearTimeout(timer)
          sock.end()
          finish(true)
        },
        error() {
          clearTimeout(timer)
          finish(false)
        },
        connectError() {
          clearTimeout(timer)
          finish(false)
        },
        data() {},
        close() {},
      },
    }).catch(() => {
      clearTimeout(timer)
      finish(false)
    })
  })
}

export async function diagnose(name: string): Promise<Diagnosis | null> {
  const app = await getApp(name)
  if (!app) return null
  const checks: Check[] = []

  checks.push({ name: "app", ok: true, detail: `status=${app.status}, image=${app.image ?? "none"}` })

  const machines = await appMachines(app.id)
  const live = machines[0]
  if (!live) {
    checks.push({ name: "machine", ok: false, detail: "no machine — deploy with `git push wess main` or `wess deploy`" })
  } else {
    const running = new Set(await listMachines())
    const isRunning = live.vm_id ? running.has(live.vm_id) : false
    checks.push({
      name: "machine",
      ok: isRunning,
      detail: isRunning ? `${live.vm_id} running at ${live.ip}:${live.port}` : `${live.vm_id} is not running (crash on boot?)`,
    })
    if (isRunning && live.ip) {
      const reachable = await tcpOk(live.ip, Number(live.port))
      checks.push({
        name: "port",
        ok: reachable,
        detail: reachable
          ? `responding on :${live.port}`
          : `nothing listening on :${live.port} — does your app read process.env.PORT?`,
      })
    }
  }

  const tdb = await db.one<any>(from(tenant_databases).where((q) => q("app_id").equals(app.id)))
  if (tdb) {
    const reachable = await tcpOk(config.gatewayIp, config.pgbouncerPort)
    checks.push({ name: "database", ok: reachable, detail: reachable ? `${tdb.db_name} reachable via pooler` : "pooler unreachable" })
  } else {
    checks.push({ name: "database", ok: true, detail: "none attached yet (attaches on first deploy)" })
  }

  const ai = await db.one<any>(from(app_ai).where((q) => q("app_id").equals(app.id)))
  checks.push({ name: "ai", ok: true, detail: ai ? "provider attached" : "no AI provider attached" })

  const logs = (await appLogs(name, 60)) ?? ""
  const errs = logs
    .split("\n")
    .filter((l) => /\b(error|panic|fatal|exception|traceback|EADDRINUSE|cannot find|undefined)\b/i.test(l))
    .slice(-5)
  checks.push({
    name: "logs",
    ok: errs.length === 0,
    detail: errs.length ? `recent errors:\n${errs.join("\n")}` : "no obvious errors in recent logs",
  })

  return { app: name, healthy: checks.every((c) => c.ok), checks }
}

// Optional: have an owner-configured AI provider explain the failures in one line.
export async function explain(diag: Diagnosis): Promise<string | undefined> {
  if (diag.healthy) return undefined
  try {
    const { listProviders } = await import("../ai/index.ts")
    const { createProvider } = await import("@atlas/ai")
    const providers = (await listProviders()).filter((p) => p.enabled && (p.api_key || p.kind === "ollama"))
    const p = providers[0]
    if (!p) return undefined
    const provider =
      p.kind === "anthropic"
        ? createProvider({ provider: "anthropic", key: p.api_key ?? "", defaultModel: p.default_model })
        : p.kind === "ollama"
          ? createProvider({ provider: "ollama", baseUrl: p.base_url ?? "http://127.0.0.1:11434", defaultModel: p.default_model })
          : createProvider({ provider: "openai", key: p.api_key ?? "", baseUrl: p.base_url ?? undefined, defaultModel: p.default_model })
    const failing = diag.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join("\n")
    const res = await provider.chat({
      messages: [
        {
          role: "user",
          content: `An app deployed on a PaaS is unhealthy. In ONE sentence, say the most likely cause and fix. Findings:\n${failing}`,
        },
      ],
      maxTokens: 120,
    })
    return res.content.trim()
  } catch {
    return undefined
  }
}
