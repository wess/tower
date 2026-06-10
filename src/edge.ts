import { defineEdge, forward, LETSENCRYPT_PROD, proxy, type ForwardContext, type Site } from "@atlas/edge"
import { config } from "./config/index.ts"

// Public TLS front for wess.dev and every app subdomain. The app list comes
// from apps.json (maintained by tower, which restarts this service whenever an
// app is created or destroyed). Certs are issued per host over HTTP-01 — the
// wildcard DNS record points every subdomain here — and cached on disk, so
// restarts only issue certs for hosts that are new.

const TOWER = `http://127.0.0.1:${config.port}`

type Target = { ip: string; port: number; at: number }
const cache = new Map<string, Target>()

async function resolveMachine(app: string): Promise<Target | null> {
  const hit = cache.get(app)
  if (hit && Date.now() - hit.at < 3000) return hit
  try {
    const res = await fetch(`${TOWER}/api/internal/resolve/${app}`, {
      headers: { "x-internal-token": config.internalToken },
    })
    if (!res.ok) return null
    const t = (await res.json()) as { ip: string; port: number }
    const target = { ...t, at: Date.now() }
    cache.set(app, target)
    return target
  } catch {
    return null
  }
}

const downPage = (app: string) =>
  new Response(
    `<!doctype html><html><head><title>${app} · wess.dev</title><style>body{font-family:ui-sans-serif,system-ui;background:#2e3440;color:#eceff4;display:grid;place-items:center;min-height:100vh;margin:0;-webkit-font-smoothing:antialiased}div{text-align:center}h1{font-size:42px;letter-spacing:-.02em}p{color:#94a1b8}b{color:#88c0d0}</style></head><body><div><h1>${app}<b>.</b>wess.dev</h1><p>This app isn't running right now.</p></div></body></html>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  )

function appSite(name: string): Site {
  const host = `${name}.${config.baseDomain}`
  return {
    host,
    routes: [
      {
        handler: async (req: Request, ctx: ForwardContext): Promise<Response> => {
          const target = await resolveMachine(name)
          if (!target) return downPage(name)
          try {
            return await forward(
              req,
              { upstream: `http://${target.ip}:${target.port}`, preserveHost: true },
              ctx,
            )
          } catch {
            cache.delete(name)
            return downPage(name)
          }
        },
      },
    ],
  }
}

async function appList(): Promise<{ name: string }[]> {
  try {
    return (await Bun.file(config.appsFile).json()) as { name: string }[]
  } catch {
    return []
  }
}

const apps = await appList()
const sites: Site[] = [
  {
    host: config.baseDomain,
    compress: ["gzip"],
    routes: [{ handler: proxy(TOWER) }],
  },
  ...apps.map((a) => appSite(a.name)),
]

defineEdge({
  acme: {
    email: "me@wess.io",
    directoryUrl: LETSENCRYPT_PROD,
    storage: "/var/lib/tower/edge",
  },
  sites,
}).listen()

console.log(
  `wess.dev edge up — ${config.baseDomain} + ${apps.length} app host(s): ${apps.map((a) => a.name).join(", ") || "none"}`,
)
