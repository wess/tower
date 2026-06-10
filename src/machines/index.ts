import { readdir } from "node:fs/promises"
import { config } from "../config/index.ts"

const CNI_DIR = "/var/lib/cni/networks/fcnet"

type Spawned = { ok: boolean; stdout: string; stderr: string; code: number }

async function ctr(args: string[]): Promise<Spawned> {
  const proc = Bun.spawn(
    ["firecracker-ctr", "--address", config.containerdAddress, ...args],
    { stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  return { ok: code === 0, stdout, stderr, code }
}

async function allocatedIps(): Promise<Set<string>> {
  try {
    const files = await readdir(CNI_DIR)
    return new Set(files.filter((f) => /^\d/.test(f)))
  } catch {
    return new Set()
  }
}

export async function imageExists(ref: string): Promise<boolean> {
  const res = await ctr(["images", "ls", "-q"])
  return res.ok && res.stdout.split("\n").some((l) => l.trim() === ref)
}

// serialize machine creation so before/after IP diffing is unambiguous
let chain: Promise<unknown> = Promise.resolve()
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn)
  chain = next.catch(() => {})
  return next
}

export type RunSpec = {
  name: string // container id (validated app-machine id)
  image: string
  env?: Record<string, string>
  command?: string[]
}

export type Machine = { vmId: string; ip: string | null }

export async function runMachine(spec: RunSpec): Promise<Machine> {
  return serialize(async () => {
    // pull only when the image isn't already in the content store
    // (git-pushed builds are imported locally and have no registry to pull from)
    if (!(await imageExists(spec.image))) {
      const pull = await ctr(["image", "pull", "--snapshotter", config.snapshotter, spec.image])
      if (!pull.ok) throw new Error(`pull failed: ${pull.stderr.trim() || pull.stdout.trim()}`)
    }

    const before = await allocatedIps()

    // Run ATTACHED inside a transient systemd unit: the aws.firecracker shim
    // ignores --log-uri, so the attached ctr process is our log pump, with
    // stdout/stderr appended to the machine's log file. systemd-run puts it
    // outside tower's cgroup so tower restarts never kill running machines.
    const log = `${config.logsDir}/${spec.name}.log`
    const envArgs = Object.entries(spec.env ?? {}).flatMap(([k, v]) => ["--env", `${k}=${v}`])
    const args = [
      "systemd-run",
      `--unit=wess-${spec.name}`,
      "--collect",
      `--property=StandardOutput=append:${log}`,
      `--property=StandardError=append:${log}`,
      "firecracker-ctr",
      "--address",
      config.containerdAddress,
      "run",
      "--snapshotter",
      config.snapshotter,
      "--runtime",
      config.fcRuntime,
      "--net-host",
      ...envArgs,
      spec.image,
      spec.name,
      ...(spec.command ?? []),
    ]
    const res = await Bun.spawn(args, { stdout: "pipe", stderr: "pipe" })
    if ((await res.exited) !== 0) {
      const err = await new Response(res.stderr).text()
      throw new Error(`run failed: ${err.trim()}`)
    }

    // wait for the task to actually be RUNNING (not just for the CNI IP, which
    // appears early in boot) AND capture its allocated IP
    let ip: string | null = null
    let running = false
    for (let i = 0; i < 60 && !running; i++) {
      await Bun.sleep(500)
      if (!ip) {
        const fresh = [...(await allocatedIps())].filter((x) => !before.has(x))
        if (fresh.length) ip = fresh.sort().at(-1) ?? null
      }
      const tasks = await listMachines()
      if (tasks.includes(spec.name)) running = true
      // if the transient unit died, the boot failed — bail early with logs
      if (!running) {
        const unit = await Bun.spawn(["systemctl", "is-active", `wess-${spec.name}`], { stdout: "pipe", stderr: "ignore" })
        const state = (await new Response(unit.stdout).text()).trim()
        if (state === "failed" || state === "inactive") break
      }
    }
    if (!running) {
      Bun.spawn(["systemctl", "stop", `wess-${spec.name}`], { stdout: "ignore", stderr: "ignore" })
      const tail = await machineLogs(spec.name, 12)
      throw new Error(`machine did not come up${tail ? `:\n${tail.slice(-400)}` : " (no logs captured)"}`)
    }
    return { vmId: spec.name, ip }
  })
}

export async function stopMachine(name: string): Promise<void> {
  await ctr(["task", "kill", "-s", "SIGKILL", name])
}

export async function destroyMachine(name: string, ip?: string | null): Promise<void> {
  await ctr(["task", "kill", "-s", "SIGKILL", name])
  await Bun.sleep(500)
  await ctr(["task", "rm", name])
  await ctr(["container", "rm", name])
  // reap the transient log-pump unit (ctr usually exits with the task)
  await Bun.spawn(["systemctl", "stop", `wess-${name}`], { stdout: "ignore", stderr: "ignore" }).exited
  if (ip) await gcIp(ip)
}

// free a leaked host-local allocation
async function gcIp(ip: string): Promise<void> {
  try {
    await Bun.spawn(["rm", "-f", `${CNI_DIR}/${ip}`]).exited
  } catch {
    /* best-effort */
  }
}

export async function listMachines(): Promise<string[]> {
  const res = await ctr(["task", "ls"])
  return res.stdout
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(/\s+/)[0])
    .filter(Boolean)
}

// GC any host-local IP allocations with no matching running container
export async function gcOrphanIps(): Promise<string[]> {
  const running = new Set(await listMachines())
  const freed: string[] = []
  let files: string[] = []
  try {
    files = (await readdir(CNI_DIR)).filter((f) => /^\d/.test(f))
  } catch {
    return freed
  }
  // CNI files are keyed by VM UUID, not our names — only GC when nothing runs
  if (running.size === 0) {
    for (const ip of files) {
      await gcIp(ip)
      freed.push(ip)
    }
  }
  return freed
}

export async function machineLogs(name: string, lines = 200): Promise<string> {
  const file = Bun.file(`${config.logsDir}/${name}.log`)
  if (!(await file.exists())) return ""
  const text = await file.text()
  const all = text.split("\n")
  return all.slice(Math.max(0, all.length - lines)).join("\n")
}
