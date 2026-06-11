import { from } from "@atlas/db"
import { db, sql } from "../db/index.ts"
import { invites, users, type Invite, type User } from "../schema/index.ts"

const DAY = 1000 * 60 * 60 * 24

function genCode(): string {
  return `inv_${crypto.randomUUID().replaceAll("-", "")}`
}

export type InviteState = "pending" | "accepted" | "expired"

export function inviteState(inv: Invite): InviteState {
  if (inv.accepted_at) return "accepted"
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return "expired"
  return "pending"
}

// Mint a single-use invite. Members and the owner can both invite.
export async function createInvite(
  invitedBy: number,
  opts: { email?: string | null; role?: string; expiresInDays?: number } = {},
): Promise<Invite> {
  const email = opts.email?.trim().toLowerCase() || null
  const role = opts.role === "owner" ? "owner" : "member"
  const expires_at = opts.expiresInDays ? new Date(Date.now() + opts.expiresInDays * DAY) : null
  const rows = await db.all<Invite>(
    from(invites)
      .insert({ code: genCode(), email, role, invited_by: invitedBy, expires_at })
      .returning("id", "code", "email", "role", "invited_by", "expires_at", "created_at"),
  )
  return rows[0]
}

export async function getInvite(code: string): Promise<Invite | null> {
  return db.one<Invite>(from(invites).where((q) => q("code").equals(code)))
}

// Validate an invite for a registering email. Returns the role to grant or an error.
export async function checkInvite(
  code: string,
  email: string,
): Promise<{ ok: true; role: string; invite: Invite } | { ok: false; error: string }> {
  const inv = await getInvite(code)
  if (!inv) return { ok: false, error: "invite not found" }
  const state = inviteState(inv)
  if (state === "accepted") return { ok: false, error: "this invite has already been used" }
  if (state === "expired") return { ok: false, error: "this invite has expired" }
  if (inv.email && inv.email !== email.trim().toLowerCase())
    return { ok: false, error: `this invite is reserved for ${inv.email}` }
  return { ok: true, role: inv.role, invite: inv }
}

export async function acceptInvite(code: string, userId: number): Promise<void> {
  await db.execute(
    from(invites)
      .where((q) => q("code").equals(code))
      .update({ accepted_by: userId, accepted_at: new Date() }),
  )
}

export async function revokeInvite(id: string, userId: number, isOwner: boolean): Promise<void> {
  // owners can delete any invite (clearing history too); members can only revoke
  // their own still-pending ones
  if (isOwner) {
    await db.execute(from(invites).where((q) => q("id").equals(id)).del())
    return
  }
  await db.execute(
    from(invites)
      .where((q) => q("id").equals(id))
      .where((q) => q("accepted_at").isNull())
      .where((q) => q("invited_by").equals(userId))
      .del(),
  )
}

export type InviteRow = {
  id: string
  code: string
  email: string | null
  role: string
  state: InviteState
  invited_by_email: string
  accepted_by_email: string | null
  created_at: Date
  expires_at: Date | null
}

// Invites for the members list. Owners see all; members see only the ones they sent.
export async function listInvites(userId: number, isOwner: boolean): Promise<InviteRow[]> {
  const rows: any[] = isOwner
    ? await sql`
        SELECT i.*, u.email AS invited_by_email, a.email AS accepted_by_email
        FROM invites i
        JOIN users u ON u.id = i.invited_by
        LEFT JOIN users a ON a.id = i.accepted_by
        ORDER BY i.created_at DESC`
    : await sql`
        SELECT i.*, u.email AS invited_by_email, a.email AS accepted_by_email
        FROM invites i
        JOIN users u ON u.id = i.invited_by
        LEFT JOIN users a ON a.id = i.accepted_by
        WHERE i.invited_by = ${userId}
        ORDER BY i.created_at DESC`
  return rows.map((i) => ({
    id: i.id,
    code: i.code,
    email: i.email,
    role: i.role,
    state: inviteState(i as Invite),
    invited_by_email: i.invited_by_email,
    accepted_by_email: i.accepted_by_email,
    created_at: i.created_at,
    expires_at: i.expires_at,
  }))
}

// All members (owner-only view).
export async function listMembers(): Promise<Pick<User, "id" | "email" | "role" | "created_at">[]> {
  return db.all<User>(from(users).orderBy("created_at", "ASC"))
}
