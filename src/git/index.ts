import { token } from "@atlas/auth"
import { get, halt, pipe, post, putHeader, stream, type Conn } from "@atlas/server"
import { mkdir } from "node:fs/promises"
import { authenticate, type AuthClaims } from "../auth/index.ts"
import { canAccessApp, getApp } from "../apps/index.ts"
import { config } from "../config/index.ts"

const SERVICES = new Set(["git-upload-pack", "git-receive-pack"])

function repoPath(app: string): string {
  return `${config.gitRoot}/${app}.git`
}

// One-time bare-repo setup with a post-receive hook that builds + deploys.
async function ensureRepo(app: string): Promise<string> {
  const path = repoPath(app)
  if (!(await Bun.file(`${path}/HEAD`).exists())) {
    await mkdir(path, { recursive: true })
    await Bun.spawn(["git", "init", "--bare", "--initial-branch=main", path], {
      stdout: "ignore",
      stderr: "ignore",
    }).exited
    const hook = `#!/bin/bash
# wess.dev push-to-deploy — runs inside git receive-pack; output streams to the client
REPO="$PWD"
APP="$(basename "$REPO" .git)"
unset GIT_DIR
cd ${process.cwd()}
exec /usr/local/bin/bun src/git/build.ts "$APP" "$REPO"
`
    await Bun.write(`${path}/hooks/post-receive`, hook)
    await Bun.spawn(["chmod", "+x", `${path}/hooks/post-receive`]).exited
  }
  return path
}

// HTTP Basic against tower users (email + password) → the caller's claims.
async function gitAuth(c: Conn): Promise<AuthClaims | null> {
  const h = c.request.headers.get("authorization") ?? ""
  if (!h.startsWith("Basic ")) return null
  try {
    const [email, ...rest] = atob(h.slice(6)).split(":")
    const password = rest.join(":")
    if (!email || !password) return null
    const t = await authenticate(email, password)
    if (!t) return null
    return (await token.verify(t, config.authSecret)) as AuthClaims
  } catch {
    return null
  }
}

function unauthorized(c: Conn): Conn {
  return halt(putHeader(c, "www-authenticate", 'Basic realm="wess.dev"'), 401, "auth required")
}

// Authenticate + authorize the caller for this repo's app. Members reach only
// their own apps; the platform owner reaches any. Returns the app name or a
// halted Conn to short-circuit the route.
async function repoGate(c: Conn, missing: string): Promise<{ app: string } | { halt: Conn }> {
  const claims = await gitAuth(c)
  if (!claims) return { halt: unauthorized(c) }
  const app = appName(c.params.repo)
  if (!(await getApp(app))) return { halt: halt(c, 404, missing) }
  if (!(await canAccessApp(app, claims.uid, claims.role === "owner")))
    return { halt: halt(c, 403, `you don't have access to "${app}"`) }
  return { app }
}

function appName(repo: string): string {
  return repo.endsWith(".git") ? repo.slice(0, -4) : repo
}

// request body, transparently gunzipped when the git client compresses it
function requestBody(c: Conn): ReadableStream<Uint8Array> | null {
  const body = c.request.body
  if (!body) return null
  const enc = c.request.headers.get("content-encoding") ?? ""
  return enc.includes("gzip") ? body.pipeThrough(new DecompressionStream("gzip")) : body
}

function pktLine(s: string): string {
  return (s.length + 4).toString(16).padStart(4, "0") + s
}

async function runService(
  service: string,
  repo: string,
  input: ReadableStream<Uint8Array> | null,
  advertise: boolean,
): Promise<ReadableStream<Uint8Array>> {
  const sub = service.replace(/^git-/, "")
  const args = advertise
    ? ["git", sub, "--stateless-rpc", "--advertise-refs", repo]
    : ["git", sub, "--stateless-rpc", repo]
  const proc = Bun.spawn(args, { stdin: "pipe", stdout: "pipe", stderr: "inherit" })

  if (input) {
    ;(async () => {
      try {
        for await (const chunk of input) proc.stdin.write(chunk)
      } finally {
        proc.stdin.end()
      }
    })()
  } else {
    proc.stdin.end()
  }
  return proc.stdout
}

function gitHeaders(c: Conn, type: string): Conn {
  let out = putHeader(c, "content-type", type)
  out = putHeader(out, "cache-control", "no-cache, max-age=0, must-revalidate")
  return out
}

export const gitRoutes = [
  // ref advertisement (both push and clone start here)
  get(
    "/git/:repo/info/refs",
    pipe(async (c) => {
      const service = c.query.service ?? ""
      if (!SERVICES.has(service)) return halt(c, 400, "smart http only")
      const gate = await repoGate(c, `no such app "${appName(c.params.repo)}" — run: wess create ${appName(c.params.repo)}`)
      if ("halt" in gate) return gate.halt
      const repo = await ensureRepo(gate.app)

      const refs = await runService(service, repo, null, true)
      const header = new TextEncoder().encode(pktLine(`# service=${service}\n`) + "0000")
      const composed = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(header)
          for await (const chunk of refs) controller.enqueue(chunk)
          controller.close()
        },
      })
      return stream(gitHeaders(c, `application/x-${service}-advertisement`), 200, composed)
    }),
  ),

  // push (receive-pack) — the post-receive hook streams build output back
  post(
    "/git/:repo/git-receive-pack",
    pipe(async (c) => {
      const gate = await repoGate(c, "no such app")
      if ("halt" in gate) return gate.halt
      const repo = await ensureRepo(gate.app)
      const out = await runService("git-receive-pack", repo, requestBody(c), false)
      return stream(gitHeaders(c, "application/x-git-receive-pack-result"), 200, out)
    }),
  ),

  // clone/fetch (upload-pack)
  post(
    "/git/:repo/git-upload-pack",
    pipe(async (c) => {
      const gate = await repoGate(c, "no such app")
      if ("halt" in gate) return gate.halt
      const repo = await ensureRepo(gate.app)
      const out = await runService("git-upload-pack", repo, requestBody(c), false)
      return stream(gitHeaders(c, "application/x-git-upload-pack-result"), 200, out)
    }),
  ),
]
