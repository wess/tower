import { get, halt, json, parseJson, pipeline, post } from "@atlas/server"
import { authenticate, register, requireAuth } from "../../auth/index.ts"
import { createInvite, listInvites } from "../../invites/index.ts"
import type { AuthClaims } from "../../auth/index.ts"

type Creds = { email?: string; password?: string; code?: string }

export const authRoutes = [
  post(
    "/api/register",
    pipeline(parseJson)(async (c) => {
      const { email, password, code } = (c.body ?? {}) as Creds
      if (!email || !password) return halt(c, 400, { error: "email and password required" })
      try {
        const user = await register(email, password, code)
        const token = await authenticate(email, password)
        return json(c, 201, {
          user: { id: user.id, email: user.email, role: user.role },
          token,
        })
      } catch (e) {
        const msg = (e as Error).message
        const known = msg.includes("invite") || msg.includes("expired") || msg.includes("reserved")
        return halt(c, known ? 403 : 409, { error: known ? msg : "email already registered" })
      }
    }),
  ),

  // Any authenticated member can mint an invite.
  post(
    "/api/invites",
    pipeline(requireAuth, parseJson)(async (c) => {
      const claims = c.assigns.auth as AuthClaims
      const { email } = (c.body ?? {}) as { email?: string }
      const inv = await createInvite(claims.uid, { email: email ?? null })
      return json(c, 201, { invite: { code: inv.code, email: inv.email, role: inv.role } })
    }),
  ),

  get(
    "/api/invites",
    pipeline(requireAuth)(async (c) => {
      const claims = c.assigns.auth as AuthClaims
      return json(c, 200, { invites: await listInvites(claims.uid, claims.role === "owner") })
    }),
  ),

  post(
    "/api/login",
    pipeline(parseJson)(async (c) => {
      const { email, password } = (c.body ?? {}) as Creds
      if (!email || !password) return halt(c, 400, { error: "email and password required" })
      const token = await authenticate(email, password)
      if (!token) return halt(c, 401, { error: "invalid credentials" })
      return json(c, 200, { token })
    }),
  ),

  get(
    "/api/me",
    pipeline(requireAuth)(async (c) => json(c, 200, { auth: c.assigns.auth })),
  ),
]
