import { get, halt, json, parseJson, pipeline, post } from "@atlas/server"
import { authenticate, register, requireAuth } from "../../auth/index.ts"

type Creds = { email?: string; password?: string }

export const authRoutes = [
  post(
    "/api/register",
    pipeline(parseJson)(async (c) => {
      const { email, password } = (c.body ?? {}) as Creds
      if (!email || !password) return halt(c, 400, { error: "email and password required" })
      try {
        const user = await register(email, password)
        const token = await authenticate(email, password)
        return json(c, 201, {
          user: { id: user.id, email: user.email, role: user.role },
          token,
        })
      } catch (e) {
        return halt(c, 409, { error: "email already registered" })
      }
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
