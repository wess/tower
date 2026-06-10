import { cli, command, flag } from "@atlas/cli"
import { homedir, platform } from "node:os"
import { join } from "node:path"
import readline from "node:readline"

const API = process.env.WESS_API ?? "https://wess.dev"
const TOKEN_FILE = join(homedir(), ".wess", "token")

async function loadToken(): Promise<string> {
  if (process.env.WESS_TOKEN) return process.env.WESS_TOKEN
  try {
    return (await Bun.file(TOKEN_FILE).text()).trim()
  } catch {
    return ""
  }
}

// piped stdin is buffered whole up-front: per-question readers lose lines to
// readahead (first reader swallows the rest of the pipe when it closes)
let pipedLines: string[] | null = null

async function ask(label: string): Promise<string> {
  if (!process.stdin.isTTY) {
    if (!pipedLines) pipedLines = (await Bun.stdin.text()).split("\n")
    process.stdout.write(label)
    const line = (pipedLines.shift() ?? "").trim()
    process.stdout.write("\n")
    return line
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(label, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// hidden input on real terminals; falls back to a plain prompt when piped
function askHidden(label: string): Promise<string> {
  if (!process.stdin.isTTY) return ask(label)
  return new Promise((resolve) => {
    const stdin = process.stdin
    stdin.setRawMode(true)
    stdin.resume()
    process.stdout.write(label)
    let buf = ""
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off("data", onData)
          process.stdout.write("\n")
          resolve(buf)
          return
        }
        if (ch === "\u0003") {
          // ctrl-c
          stdin.setRawMode(false)
          process.stdout.write("\n")
          process.exit(130)
        }
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1)
        else buf += ch
      }
    }
    stdin.on("data", onData)
  })
}

// global --json: any command emits machine-readable output for agents
const JSON_OUT = process.argv.includes("--json")
function emit(obj: unknown, human: () => void): void {
  if (JSON_OUT) console.log(JSON.stringify(obj))
  else human()
}

async function api(method: string, path: string, body?: unknown, auth = true): Promise<any> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (auth) {
    const t = await loadToken()
    if (!t) {
      if (JSON_OUT) console.log(JSON.stringify({ error: "not logged in" }))
      else console.error("not logged in — run: wess login")
      process.exit(1)
    }
    headers.authorization = `Bearer ${t}`
  }
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    const msg = `cannot reach ${API} (network error)`
    if (JSON_OUT) console.log(JSON.stringify({ error: msg }))
    else console.error(msg)
    process.exit(1)
  }
  const text = await res.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok) {
    if (JSON_OUT) console.log(JSON.stringify({ error: data?.error ?? data, status: res.status }))
    else console.error(`error ${res.status}:`, data?.error ?? data)
    process.exit(1)
  }
  return data
}

function age(d: string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 90) return `${s}s`
  if (s < 5400) return `${Math.floor(s / 60)}m`
  if (s < 129600) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

cli("wess", [
  command("login", {
    description: "Sign in to wess.dev",
    flags: { email: flag("e", { type: "string" }), password: flag("p", { type: "string" }) },
    run: async ({ flags }) => {
      const email = (flags.email as string) || (await ask("email: "))
      const password = (flags.password as string) || (await askHidden("password: "))
      const data = await api("POST", "/api/login", { email, password }, false)
      await Bun.write(TOKEN_FILE, data.token)
      console.log(`✓ logged in as ${email}`)
    },
  }),

  command("apps", {
    description: "List your apps",
    run: async () => {
      const { apps } = await api("GET", "/api/apps")
      emit({ apps }, () => {
        if (!apps.length) return console.log("no apps yet — run: wess create <name>")
        const w = Math.max(...apps.map((a: any) => a.name.length), 4)
        console.log(`${"NAME".padEnd(w)}  ${"STATUS".padEnd(8)}  ${"AGE".padEnd(5)}  IMAGE`)
        for (const a of apps)
          console.log(`${a.name.padEnd(w)}  ${a.status.padEnd(8)}  ${age(a.created_at).padEnd(5)}  ${a.image ?? "—"}`)
      })
    },
  }),

  command("doctor", {
    description: "Diagnose an app's health (structured)",
    args: ["name"],
    flags: { explain: flag("x", { type: "boolean", description: "AI one-line explanation" }) },
    run: async ({ args, flags }) => {
      const d = await api("GET", `/api/apps/${args[0]}/doctor${flags.explain ? "?explain=1" : ""}`)
      emit(d, () => {
        console.log(`${args[0]}: ${d.healthy ? "✓ healthy" : "✗ unhealthy"}`)
        for (const c of d.checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail.replace(/\n/g, "\n      ")}`)
        if (d.explanation) console.log(`\n  → ${d.explanation}`)
      })
    },
  }),

  command("sandbox", {
    description: "Run a code file in a throwaway microVM (runtimes: python|node|bun|bash)",
    args: ["runtime", "file"],
    run: async ({ args }) => {
      const code = await Bun.file(args[1]).text()
      const r = await api("POST", "/api/sandbox", { runtime: args[0], code })
      emit(r, () => {
        if (r.stdout) process.stdout.write(r.stdout)
        if (r.stderr) process.stderr.write(r.stderr)
        console.error(`\n[exit ${r.exitCode} · ${r.ms}ms · ${r.runtime} microVM]`)
      })
    },
  }),

  command("token", {
    description: "Manage scoped API tokens (token create <name> --scopes a,b [--app x] | list | revoke <id>)",
    args: ["action", "arg"],
    flags: { scopes: flag("s", { type: "string" }), app: flag("a", { type: "string" }) },
    run: async ({ args, flags }) => {
      const [action, arg] = args
      if (action === "create") {
        const scopes = String(flags.scopes ?? "read").split(",").map((s) => s.trim())
        const r = await api("POST", "/api/tokens", { name: arg, scopes, app: flags.app })
        emit(r, () => {
          console.log(`✓ token "${arg}" (${scopes.join(",")}${flags.app ? `, app=${flags.app}` : ""})`)
          console.log(`  ${r.token}`)
          console.log("  store it now — it won't be shown again")
        })
      } else if (action === "list") {
        const { tokens } = await api("GET", "/api/tokens")
        emit({ tokens }, () => {
          if (!tokens.length) return console.log("no tokens")
          for (const t of tokens) console.log(`${t.id}  ${t.name}  [${t.scopes}]${t.app ? ` app=${t.app}` : ""}`)
        })
      } else if (action === "revoke") {
        await api("DELETE", `/api/tokens/${arg}`)
        emit({ ok: true }, () => console.log(`✓ revoked ${arg}`))
      } else {
        console.log("usage: wess token create <name> --scopes read,deploy [--app x] | list | revoke <id>")
      }
    },
  }),

  command("ai", {
    description: "Attach an AI provider to an app: ai <app> <provider> [--model m]",
    args: ["app", "provider"],
    flags: { model: flag("m", { type: "string" }) },
    run: async ({ args, flags }) => {
      const r = await api("POST", `/api/apps/${args[0]}/ai`, { provider: args[1], model: flags.model })
      emit(r, () => {
        console.log(`✓ ${args[1]} attached to ${args[0]}`)
        console.log("  redeploy to inject AI_GATEWAY_URL / AI_GATEWAY_KEY / AI_MODEL")
      })
    },
  }),

  command("create", {
    description: "Create an app",
    args: ["name"],
    run: async ({ args }) => {
      const { app } = await api("POST", "/api/apps", { name: args[0] })
      emit({ app }, () => {
        console.log(`✓ created ${app.name}`)
        console.log(`  deploy with git:   git remote add wess ${API}/git/${app.name}.git && git push wess main`)
        console.log(`  or from an image:  wess deploy ${app.name} --image <ref>`)
      })
    },
  }),

  command("deploy", {
    description: "Deploy an app from a container image",
    args: ["name"],
    flags: {
      image: flag("i", { type: "string", description: "container image ref" }),
      port: flag("p", { type: "number", description: "port your app listens on" }),
    },
    run: async ({ args, flags }) => {
      if (!flags.image) {
        console.error("an image is required: wess deploy <app> --image <ref>")
        console.error(`deploying from source? push with git instead — see ${API}/docs/deploy`)
        process.exit(1)
      }
      console.log(`deploying ${args[0]}…`)
      const r = await api("POST", `/api/apps/${args[0]}/deploy`, {
        image: flags.image,
        port: flags.port || undefined,
      })
      console.log(`✓ live at https://${args[0]}.wess.dev  (machine ${r.machine.vm_id})`)
    },
  }),

  command("status", {
    description: "Show an app's machines, database, and URL",
    args: ["name"],
    run: async ({ args }) => {
      const d = await api("GET", `/api/apps/${args[0]}`)
      emit(d, () => {
        console.log(`app:       ${d.app.name} (${d.app.status})`)
        console.log(`url:       ${d.url}`)
        console.log(`image:     ${d.app.image ?? "—"}`)
        console.log(`database:  ${d.database.attached ? d.database.name : "not attached yet"}`)
        if (!d.machines.length) return console.log("machines:  none")
        console.log("machines:")
        for (const m of d.machines)
          console.log(`  ${m.vm_id}  ${m.state}  ${m.ip ?? "—"}:${m.port}  up ${age(m.created_at)}`)
      })
    },
  }),

  command("init", {
    description: "Scaffold a new app in the current directory (--template ai|web)",
    args: ["name"],
    flags: { template: flag("t", { type: "string", default: "web" }) },
    run: async ({ args, flags }) => {
      const name = args[0]
      const ai = flags.template === "ai"
      const server = ai
        ? `// ${name} — AI app on wess.dev. The gateway is provider-agnostic
// (Anthropic / OpenAI / Ollama) — attach one with: wess ai ${name} <provider>
const GW = process.env.AI_GATEWAY_URL, KEY = process.env.AI_GATEWAY_KEY

Bun.serve({
  port: Number(process.env.PORT ?? 8080),
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname !== "/") return new Response("ok")
    if (!GW) return Response.json({ error: "no AI attached — run: wess ai ${name} <provider>" }, { status: 503 })
    const r = await fetch(GW + "/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
      body: JSON.stringify({ prompt: url.searchParams.get("q") ?? "Say hello from wess.dev" }),
    })
    return new Response(await r.text(), { headers: { "content-type": "application/json" } })
  },
})
console.log("${name} up on", process.env.PORT)`
        : `Bun.serve({
  port: Number(process.env.PORT ?? 8080),
  fetch() { return Response.json({ app: "${name}", db: !!process.env.DATABASE_URL }) },
})
console.log("${name} up on", process.env.PORT)`
      const dockerfile = `FROM oven/bun:alpine\nWORKDIR /app\nCOPY . .\nRUN bun install\nCMD ["bun", "server.ts"]`
      await Bun.write("server.ts", server)
      await Bun.write("Dockerfile", dockerfile)
      await Bun.write("AGENTS.md", `# ${name}\nDeploys to wess.dev. \`wess create ${name}\` then \`git push wess main\`. Listens on $PORT.${ai ? " AI via $AI_GATEWAY_URL." : ""}\n`)
      emit({ created: ["server.ts", "Dockerfile", "AGENTS.md"], template: flags.template }, () => {
        console.log(`✓ scaffolded ${flags.template} app "${name}"`)
        console.log("  next: wess create " + name + " && wess git " + name + " && git init && git add -A && git commit -m init && git push wess main")
        if (ai) console.log("  then: wess ai " + name + " <provider>   (anthropic | openai | ollama)")
      })
    },
  }),

  command("logs", {
    description: "Show an app's logs",
    args: ["name"],
    flags: {
      follow: flag("f", { type: "boolean", description: "keep streaming" }),
      lines: flag("n", { type: "number", description: "number of lines", default: 200 }),
    },
    run: async ({ args, flags }) => {
      let last = ""
      const fetchLogs = async () => {
        const { logs } = await api("GET", `/api/apps/${args[0]}/logs?lines=${flags.lines ?? 200}`)
        if (logs && logs !== last) {
          const fresh = logs.startsWith(last) ? logs.slice(last.length) : logs
          if (fresh.trim()) process.stdout.write(fresh.endsWith("\n") ? fresh : fresh + "\n")
          last = logs
        }
      }
      await fetchLogs()
      if (flags.follow) {
        while (true) {
          await Bun.sleep(2000)
          await fetchLogs()
        }
      }
    },
  }),

  command("secrets", {
    description: "Manage app secrets (injected as env vars on deploy)",
    args: ["action", "app", "key", "value"],
    run: async ({ args }) => {
      const [action, app, key, value] = args
      if (action === "list" && app) {
        const { secrets } = await api("GET", `/api/apps/${app}/secrets`)
        if (!secrets.length) return console.log("no secrets set")
        for (const s of secrets) console.log(s.name)
        return
      }
      if (action === "set" && app && key && value !== undefined) {
        await api("POST", `/api/apps/${app}/secrets`, { name: key, value })
        console.log(`✓ ${key} set — applies on next deploy`)
        return
      }
      if (action === "unset" && app && key) {
        await api("DELETE", `/api/apps/${app}/secrets/${key}`)
        console.log(`✓ ${key} removed — applies on next deploy`)
        return
      }
      console.log("usage: wess secrets list <app> | set <app> KEY VALUE | unset <app> KEY")
    },
  }),

  command("git", {
    description: "Connect the current repo to an app (adds a 'wess' remote)",
    args: ["name"],
    run: async ({ args }) => {
      const url = `${API}/git/${args[0]}.git`
      const inRepo = (await Bun.spawn(["git", "rev-parse", "--git-dir"], { stdout: "ignore", stderr: "ignore" }).exited) === 0
      if (inRepo) {
        await Bun.spawn(["git", "remote", "remove", "wess"], { stdout: "ignore", stderr: "ignore" }).exited
        await Bun.spawn(["git", "remote", "add", "wess", url]).exited
        console.log(`✓ remote added: wess → ${url}`)
        console.log("  deploy with: git push wess main")
      } else {
        console.log(`remote url: ${url}`)
        console.log(`add it with: git remote add wess ${url}`)
      }
      console.log("  (sign in with your wess.dev email + password when git asks)")
    },
  }),

  command("destroy", {
    description: "Destroy an app, its machines, and its database",
    args: ["name"],
    run: async ({ args }) => {
      const answer = await ask(`destroy ${args[0]} and ALL its data? type the app name to confirm: `)
      if (answer !== args[0]) return console.log("aborted")
      await api("DELETE", `/api/apps/${args[0]}`)
      console.log(`✓ destroyed ${args[0]}`)
    },
  }),

  command("open", {
    description: "Open an app in the browser",
    args: ["name"],
    run: async ({ args }) => {
      const url = `https://${args[0]}.wess.dev`
      const opener = platform() === "darwin" ? "open" : "xdg-open"
      Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" })
      console.log(url)
    },
  }),
])
