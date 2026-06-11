import { hash, token, verify } from "@atlas/auth"
import { from } from "@atlas/db"
import { halt, type Conn } from "@atlas/server"
import { config } from "../config/index.ts"
import { db, sql } from "../db/index.ts"
import { api_tokens, users, type ApiToken, type User } from "../schema/index.ts"

const WEEK = 60 * 60 * 24 * 7

export const ALL_SCOPES = ["read", "deploy", "logs", "secrets", "destroy", "sandbox"] as const
export type Scope = (typeof ALL_SCOPES)[number]

export type AuthClaims = {
  uid: number
  email: string
  role: string
  // scoped API tokens carry these; JWT sessions have full power
  scopes?: string[]
  app?: string | null
}

// Register a user. Invite-only: the FIRST registrant bootstraps the platform
// owner (no invite needed); everyone after must present a valid invite code.
export async function register(
  email: string,
  password: string,
  inviteCode?: string,
): Promise<User> {
  const normEmail = email.trim().toLowerCase()
  const existing = await db.all<User>(from(users).limit(1))
  const bootstrap = existing.length === 0

  let role = "owner"
  if (!bootstrap) {
    if (!inviteCode) throw new Error("an invite is required to register")
    const { checkInvite } = await import("../invites/index.ts")
    const res = await checkInvite(inviteCode, normEmail)
    if (!res.ok) throw new Error(res.error)
    role = res.role
  }

  const password_hash = await hash(password)
  const rows = await db.all<User>(
    from(users)
      .insert({ email: normEmail, password: password_hash, role })
      .returning("id", "email", "role", "created_at"),
  )
  const user = rows[0]

  if (!bootstrap && inviteCode) {
    const { acceptInvite } = await import("../invites/index.ts")
    await acceptInvite(inviteCode, Number(user.id))
  }
  return user
}

// Verify credentials, returning a signed JWT or null.
export async function authenticate(email: string, password: string): Promise<string | null> {
  const u = await db.one<User>(from(users).where((q) => q("email").equals(email)))
  if (!u) return null
  if (!(await verify(password, u.password))) return null
  const claims: AuthClaims = { uid: Number(u.id), email: u.email, role: u.role }
  return token.sign(claims, config.authSecret, { expiresIn: WEEK })
}

function bearer(c: Conn): string | null {
  const h = c.request.headers.get("authorization") ?? ""
  return h.startsWith("Bearer ") ? h.slice(7) : null
}

function sha256(s: string): string {
  return new Bun.CryptoHasher("sha256").update(s).digest("hex")
}

async function claimsFromApiToken(t: string): Promise<AuthClaims | null> {
  const row = await db.one<ApiToken>(
    from(api_tokens).where((q) => q("token_hash").equals(sha256(t))),
  )
  if (!row) return null
  sql`UPDATE api_tokens SET last_used_at = now() WHERE id = ${row.id}`.catch(() => {})
  const u = await db.one<User>(from(users).where((q) => q("id").equals(row.user_id)))
  if (!u) return null
  return {
    uid: Number(u.id),
    email: u.email,
    role: "token",
    scopes: row.scopes.split(",").map((s) => s.trim()),
    app: row.app_name,
  }
}

// Pipe: accept a session JWT or a scoped `wess_` API token; attach claims.
export async function requireAuth(c: Conn): Promise<Conn> {
  const t = bearer(c)
  if (!t) return halt(c, 401, { error: "missing bearer token" })
  if (t.startsWith("wess_")) {
    const claims = await claimsFromApiToken(t)
    if (!claims) return halt(c, 401, { error: "invalid token" })
    return { ...c, assigns: { ...c.assigns, auth: claims } }
  }
  try {
    const claims = (await token.verify(t, config.authSecret)) as AuthClaims
    return { ...c, assigns: { ...c.assigns, auth: claims } }
  } catch {
    return halt(c, 401, { error: "invalid token" })
  }
}

// Scope + app gate. JWT sessions pass everything; API tokens must carry the
// scope and (when app-bound) match the app. Returns a halted Conn or null.
export function deny(c: Conn, scope: Scope, appName?: string): Conn | null {
  const claims = c.assigns.auth as AuthClaims | undefined
  if (!claims) return halt(c, 401, { error: "unauthenticated" })
  if (!claims.scopes) return null // full session
  if (!claims.scopes.includes(scope))
    return halt(c, 403, { error: `token lacks "${scope}" scope` })
  if (claims.app && appName && claims.app !== appName)
    return halt(c, 403, { error: `token is scoped to app "${claims.app}"` })
  if (claims.app && !appName)
    return halt(c, 403, { error: "app-scoped token cannot access platform-wide resources" })
  return null
}

// Pipe: require a full (non-token) owner session.
export async function requireOwner(c: Conn): Promise<Conn> {
  const next = await requireAuth(c)
  if (next.halted) return next
  const claims = next.assigns.auth as AuthClaims
  if (claims.role !== "owner") return halt(next, 403, { error: "owner only" })
  return next
}

// Remove a member account (owner-only, enforced at the route). Their apps'
// owner_id is set NULL by the FK; the owner can then reclaim or destroy them.
export async function removeUser(id: number): Promise<void> {
  await db.execute(from(users).where((q) => q("id").equals(id)).del())
}

export async function changePassword(
  userId: number,
  current: string,
  next: string,
): Promise<{ ok: boolean; error?: string }> {
  const u = await db.one<User>(from(users).where((q) => q("id").equals(userId)))
  if (!u) return { ok: false, error: "user not found" }
  if (!(await verify(current, u.password))) return { ok: false, error: "current password is incorrect" }
  if (next.length < 8) return { ok: false, error: "new password must be at least 8 characters" }
  const password = await hash(next)
  await db.execute(from(users).where((q) => q("id").equals(userId)).update({ password }))
  return { ok: true }
}

// ---- API token management (owner sessions only) ----

export async function createApiToken(
  userId: number,
  name: string,
  scopes: string[],
  appName?: string | null,
): Promise<{ token: string; id: string }> {
  const bad = scopes.filter((s) => !ALL_SCOPES.includes(s as Scope))
  if (bad.length) throw new Error(`unknown scope(s): ${bad.join(", ")} (valid: ${ALL_SCOPES.join(", ")})`)
  const secret = `wess_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`
  const rows = await db.all<ApiToken>(
    from(api_tokens)
      .insert({
        user_id: userId,
        name,
        token_hash: sha256(secret),
        app_name: appName ?? null,
        scopes: scopes.join(","),
      })
      .returning("id"),
  )
  return { token: secret, id: String(rows[0].id) }
}

export async function listApiTokens(userId: number) {
  const rows = await db.all<ApiToken>(
    from(api_tokens).where((q) => q("user_id").equals(userId)).orderBy("created_at", "DESC"),
  )
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    app: t.app_name,
    scopes: t.scopes,
    created_at: t.created_at,
    last_used_at: t.last_used_at,
  }))
}

export async function revokeApiToken(userId: number, id: string): Promise<void> {
  await db.execute(
    from(api_tokens).where((q) => q("user_id").equals(userId)).where((q) => q("id").equals(id)).del(),
  )
}
