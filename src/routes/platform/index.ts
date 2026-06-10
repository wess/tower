import { del, get, halt, json, parseJson, pipe, pipeline, post } from "@atlas/server"
import {
  ALL_SCOPES,
  createApiToken,
  deny,
  listApiTokens,
  requireAuth,
  requireOwner,
  revokeApiToken,
  type AuthClaims,
} from "../../auth/index.ts"
import { diagnose, explain } from "../../doctor/index.ts"
import { runSandbox, SANDBOX_RUNTIMES } from "../../sandbox/index.ts"

export const platformRoutes = [
  // ---- scoped API tokens (owner sessions only) ----
  get(
    "/api/tokens",
    pipe(async (c) => {
      const d = await requireOwner(c)
      if (d.halted) return d
      const claims = d.assigns.auth as AuthClaims
      return json(d, 200, { tokens: await listApiTokens(claims.uid), scopes: ALL_SCOPES })
    }),
  ),
  post(
    "/api/tokens",
    pipeline(parseJson)(async (c) => {
      const d = await requireOwner(c)
      if (d.halted) return d
      const claims = d.assigns.auth as AuthClaims
      const b = (d.body ?? {}) as { name?: string; scopes?: string[]; app?: string }
      if (!b.name || !b.scopes?.length) return halt(d, 400, { error: "name and scopes required" })
      try {
        const t = await createApiToken(claims.uid, b.name, b.scopes, b.app)
        return json(d, 201, { token: t.token, id: t.id, note: "shown once — store it now" })
      } catch (e) {
        return halt(d, 400, { error: (e as Error).message })
      }
    }),
  ),
  del(
    "/api/tokens/:id",
    pipe(async (c) => {
      const d = await requireOwner(c)
      if (d.halted) return d
      const claims = d.assigns.auth as AuthClaims
      await revokeApiToken(claims.uid, c.params.id)
      return json(d, 200, { ok: true })
    }),
  ),

  // ---- doctor: structured diagnosis (read scope) ----
  get(
    "/api/apps/:name/doctor",
    pipeline(requireAuth)(async (c) => {
      const blocked = deny(c, "read", c.params.name)
      if (blocked) return blocked
      const diag = await diagnose(c.params.name)
      if (!diag) return halt(c, 404, { error: "not found" })
      if (c.query.explain === "1") diag.explanation = await explain(diag)
      return json(c, 200, diag)
    }),
  ),

  // ---- sandbox: ephemeral microVM code execution (sandbox scope) ----
  post(
    "/api/sandbox",
    pipeline(requireAuth, parseJson)(async (c) => {
      const blocked = deny(c, "sandbox")
      if (blocked) return blocked
      const b = (c.body ?? {}) as { runtime?: string; code?: string; timeoutMs?: number }
      if (!b.runtime || !b.code) return halt(c, 400, { error: "runtime and code required" })
      try {
        const result = await runSandbox(b.runtime, b.code, { timeoutMs: b.timeoutMs })
        return json(c, 200, result)
      } catch (e) {
        return halt(c, 400, { error: (e as Error).message })
      }
    }),
  ),
  get(
    "/api/sandbox/runtimes",
    pipeline(requireAuth)(async (c) => json(c, 200, { runtimes: SANDBOX_RUNTIMES })),
  ),
]
