import { get, halt, json, parseJson, pipe, pipeline, post, type Conn } from "@atlas/server"
import { deployApp, resolveApp } from "../../apps/index.ts"
import { config } from "../../config/index.ts"

// Host-local callers only (edge resolver, git build hook). Two checks:
// the shared token, and absence of x-forwarded-host (the edge always sets it,
// so its presence means the request came through the public proxy).
function internalOnly(c: Conn): Conn | null {
  if (c.request.headers.get("x-forwarded-host")) return halt(c, 404, { error: "not found" })
  if (c.request.headers.get("x-internal-token") !== config.internalToken)
    return halt(c, 401, { error: "unauthorized" })
  return null
}

export const internalRoutes = [
  get(
    "/api/internal/resolve/:name",
    pipe(async (c) => {
      const denied = internalOnly(c)
      if (denied) return denied
      const target = await resolveApp(c.params.name)
      if (!target) return halt(c, 404, { error: "no running machine" })
      return json(c, 200, target)
    }),
  ),

  post(
    "/api/internal/deploy",
    pipeline(parseJson)(async (c) => {
      const denied = internalOnly(c)
      if (denied) return denied
      const { app, image, port } = (c.body ?? {}) as { app?: string; image?: string; port?: number }
      if (!app || !image) return halt(c, 400, { error: "app and image required" })
      try {
        const result = await deployApp(app, image, port)
        return json(c, 200, result)
      } catch (e) {
        return halt(c, 400, { error: (e as Error).message })
      }
    }),
  ),
]
