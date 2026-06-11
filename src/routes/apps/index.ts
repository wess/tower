import { del, get, halt, json, parseJson, pipeline, post, type Conn } from "@atlas/server"
import { deny, requireAuth, type AuthClaims, type Scope } from "../../auth/index.ts"
import {
  appLogs,
  canAccessApp,
  createApp,
  deployApp,
  destroyApp,
  getApp,
  getAppDetail,
  listAppsForUser,
  listSecretNames,
  setSecret,
  unsetSecret,
} from "../../apps/index.ts"

// Token-scope gate + ownership gate for an existing app. 404 (not 403) when the
// caller doesn't own it, so members can't probe for other users' app names.
async function denyApp(c: Conn, scope: Scope, name: string): Promise<Conn | null> {
  const blocked = deny(c, scope, name)
  if (blocked) return blocked
  const claims = c.assigns.auth as AuthClaims
  if (!(await canAccessApp(name, claims.uid, claims.role === "owner")))
    return halt(c, 404, { error: "not found" })
  return null
}

export const appRoutes = [
  get(
    "/api/apps",
    pipeline(requireAuth)(async (c) => {
      const blocked = deny(c, "read")
      if (blocked) return blocked
      const claims = c.assigns.auth as AuthClaims
      return json(c, 200, { apps: await listAppsForUser(claims.uid, claims.role === "owner") })
    }),
  ),

  post(
    "/api/apps",
    pipeline(requireAuth, parseJson)(async (c) => {
      const { name, image } = (c.body ?? {}) as { name?: string; image?: string }
      if (!name) return halt(c, 400, { error: "name required" })
      const blocked = deny(c, "deploy", name)
      if (blocked) return blocked
      const claims = c.assigns.auth as AuthClaims
      try {
        return json(c, 201, { app: await createApp(name, claims.uid, image) })
      } catch (e) {
        return halt(c, 400, { error: (e as Error).message })
      }
    }),
  ),

  get(
    "/api/apps/:name",
    pipeline(requireAuth)(async (c) => {
      const blocked = await denyApp(c, "read", c.params.name)
      if (blocked) return blocked
      const detail = await getAppDetail(c.params.name)
      if (!detail) return halt(c, 404, { error: "not found" })
      return json(c, 200, detail)
    }),
  ),

  get(
    "/api/apps/:name/logs",
    pipeline(requireAuth)(async (c) => {
      const blocked = await denyApp(c, "logs", c.params.name)
      if (blocked) return blocked
      const lines = Math.min(Number(c.query.lines) || 200, 2000)
      const logs = await appLogs(c.params.name, lines)
      if (logs === null) return halt(c, 404, { error: "not found" })
      return json(c, 200, { logs })
    }),
  ),

  post(
    "/api/apps/:name/deploy",
    pipeline(requireAuth, parseJson)(async (c) => {
      const blocked = await denyApp(c, "deploy", c.params.name)
      if (blocked) return blocked
      const { image, port } = (c.body ?? {}) as { image?: string; port?: number }
      if (!image) return halt(c, 400, { error: "image required" })
      try {
        return json(c, 200, await deployApp(c.params.name, image, port))
      } catch (e) {
        return halt(c, 400, { error: (e as Error).message })
      }
    }),
  ),

  get(
    "/api/apps/:name/secrets",
    pipeline(requireAuth)(async (c) => {
      const blocked = await denyApp(c, "secrets", c.params.name)
      if (blocked) return blocked
      const app = await getApp(c.params.name)
      if (!app) return halt(c, 404, { error: "not found" })
      return json(c, 200, { secrets: await listSecretNames(app.id) })
    }),
  ),

  post(
    "/api/apps/:name/secrets",
    pipeline(requireAuth, parseJson)(async (c) => {
      const blocked = await denyApp(c, "secrets", c.params.name)
      if (blocked) return blocked
      const app = await getApp(c.params.name)
      if (!app) return halt(c, 404, { error: "not found" })
      const { name, value } = (c.body ?? {}) as { name?: string; value?: string }
      if (!name || value === undefined) return halt(c, 400, { error: "name and value required" })
      await setSecret(app.id, name, value)
      return json(c, 200, { ok: true })
    }),
  ),

  del(
    "/api/apps/:name/secrets/:key",
    pipeline(requireAuth)(async (c) => {
      const blocked = await denyApp(c, "secrets", c.params.name)
      if (blocked) return blocked
      const app = await getApp(c.params.name)
      if (!app) return halt(c, 404, { error: "not found" })
      await unsetSecret(app.id, c.params.key)
      return json(c, 200, { ok: true })
    }),
  ),

  del(
    "/api/apps/:name",
    pipeline(requireAuth)(async (c) => {
      const blocked = await denyApp(c, "destroy", c.params.name)
      if (blocked) return blocked
      await destroyApp(c.params.name)
      return json(c, 200, { ok: true })
    }),
  ),
]
