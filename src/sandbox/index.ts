import { readdir } from "node:fs/promises"
import { config } from "../config/index.ts"

const CNI_DIR = "/var/lib/cni/networks/fcnet"
const RUNTIMES: Record<string, { image: string; run: (code: string) => string[] }> = {
  python: { image: "docker.io/library/python:3.12-alpine", run: (c) => ["python3", "-c", c] },
  node: { image: "docker.io/library/node:22-alpine", run: (c) => ["node", "-e", c] },
  bun: { image: "docker.io/oven/bun:alpine", run: (c) => ["bun", "-e", c] },
  bash: { image: "docker.io/library/alpine:latest", run: (c) => ["sh", "-c", c] },
}

export type SandboxResult = {
  ok: boolean
  exitCode: number
  stdout: string
  stderr: string
  ms: number
  runtime: string
}

async function ctr(args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["firecracker-ctr", "--address", config.containerdAddress, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const killer = setTimeout(() => proc.kill(9), timeoutMs)
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  clearTimeout(killer)
  return { code, stdout, stderr }
}

async function freeIp(name: string): Promise<void> {
  try {
    const files = await readdir(CNI_DIR)
    for (const f of files.filter((x) => /^\d/.test(x))) {
      const body = await Bun.file(`${CNI_DIR}/${f}`).text().catch(() => "")
      if (body.includes(name)) await Bun.spawn(["rm", "-f", `${CNI_DIR}/${f}`]).exited
    }
  } catch {
    /* best-effort */
  }
}

// Run untrusted code in a throwaway Firecracker microVM, capture output, destroy.
// This is the e2b-style primitive: hardware isolation, ~sub-second boot, no
// network by default-of-policy (the tenant nft rules still apply).
export async function runSandbox(
  runtimeName: string,
  code: string,
  opts: { timeoutMs?: number } = {},
): Promise<SandboxResult> {
  const runtime = RUNTIMES[runtimeName]
  if (!runtime) throw new Error(`unknown runtime "${runtimeName}" (have: ${Object.keys(RUNTIMES).join(", ")})`)
  const timeoutMs = Math.min(opts.timeoutMs ?? 30_000, 120_000)
  const id = `sbx${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`
  const started = Date.now()

  try {
    // pull if needed (cached after first use)
    const have = await ctr(["images", "ls", "-q"], 60_000)
    if (!have.stdout.split("\n").some((l) => l.trim() === runtime.image)) {
      const pull = await ctr(["image", "pull", "--snapshotter", config.snapshotter, runtime.image], 120_000)
      if (pull.code !== 0) throw new Error(`pull failed: ${pull.stderr.trim()}`)
    }

    const res = await ctr(
      [
        "run",
        "--snapshotter",
        config.snapshotter,
        "--runtime",
        config.fcRuntime,
        "--rm",
        "--net-host",
        runtime.image,
        id,
        ...runtime.run(code),
      ],
      timeoutMs + 5000,
    )
    return {
      ok: res.code === 0,
      exitCode: res.code,
      stdout: res.stdout,
      stderr: res.stderr,
      ms: Date.now() - started,
      runtime: runtimeName,
    }
  } finally {
    // belt-and-suspenders cleanup (--rm usually handles it)
    await ctr(["task", "kill", "-s", "SIGKILL", id], 5000).catch(() => {})
    await ctr(["task", "rm", id], 5000).catch(() => {})
    await ctr(["container", "rm", id], 5000).catch(() => {})
    await freeIp(id)
  }
}

export const SANDBOX_RUNTIMES = Object.keys(RUNTIMES)
