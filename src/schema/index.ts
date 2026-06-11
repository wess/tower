import { defineSchema, column, type RowOf } from "@atlas/db"

// Column keys are snake_case to match the Postgres columns 1:1 (the query
// builder emits keys verbatim, and Postgres folds unquoted idents to lower).

export const apps = defineSchema("apps", {
  id: column.uuid().primaryKey(),
  name: column.text().unique(),
  image: column.text().nullable(),
  status: column.text().default("created"),
  owner_id: column.integer().ref("users", "id").nullable(),
  created_at: column.timestamp(),
  updated_at: column.timestamp(),
})
export type App = RowOf<typeof apps>

export const machines = defineSchema("machines", {
  id: column.uuid().primaryKey(),
  app_id: column.uuid().ref("apps", "id"),
  vm_id: column.text().nullable(),
  ip: column.text().nullable(),
  image: column.text(),
  state: column.text().default("creating"),
  port: column.integer().default(8080),
  created_at: column.timestamp(),
  updated_at: column.timestamp(),
})
export type Machine = RowOf<typeof machines>

export const secrets = defineSchema("secrets", {
  id: column.uuid().primaryKey(),
  app_id: column.uuid().ref("apps", "id"),
  name: column.text(),
  value: column.text(),
  created_at: column.timestamp(),
})
export type Secret = RowOf<typeof secrets>

export const tenant_databases = defineSchema("tenant_databases", {
  id: column.uuid().primaryKey(),
  app_id: column.uuid().ref("apps", "id"),
  db_name: column.text(),
  db_role: column.text(),
  created_at: column.timestamp(),
})
export type TenantDatabase = RowOf<typeof tenant_databases>

export const events = defineSchema("events", {
  id: column.bigint().primaryKey(),
  app_id: column.uuid().nullable(),
  kind: column.text(),
  data: column.json<Record<string, unknown>>(),
  created_at: column.timestamp(),
})
export type Event = RowOf<typeof events>

export const users = defineSchema("users", {
  id: column.serial().primaryKey(),
  email: column.text().unique(),
  password: column.text(),
  role: column.text().default("member"), // first registrant becomes "owner"
  created_at: column.timestamp(),
})
export type User = RowOf<typeof users>

export const api_tokens = defineSchema("api_tokens", {
  id: column.uuid().primaryKey(),
  user_id: column.integer().ref("users", "id"),
  name: column.text(),
  token_hash: column.text().unique(),
  app_name: column.text().nullable(),
  scopes: column.text(),
  created_at: column.timestamp(),
  last_used_at: column.timestamp().nullable(),
})
export type ApiToken = RowOf<typeof api_tokens>

export const ai_providers = defineSchema("ai_providers", {
  id: column.uuid().primaryKey(),
  name: column.text().unique(),
  kind: column.text(),
  base_url: column.text().nullable(),
  api_key: column.text().nullable(),
  default_model: column.text(),
  enabled: column.boolean().default(true),
  created_at: column.timestamp(),
})
export type AiProvider = RowOf<typeof ai_providers>

export const app_ai = defineSchema("app_ai", {
  id: column.uuid().primaryKey(),
  app_id: column.uuid().ref("apps", "id"),
  provider_id: column.uuid().ref("ai_providers", "id"),
  model: column.text().nullable(),
  gateway_key: column.text().unique(),
  created_at: column.timestamp(),
})
export type AppAi = RowOf<typeof app_ai>

// Invite-only registration: a member mints an invite (single-use code), shares
// the link, and the recipient registers against it. invited_by/accepted_by tie
// the social graph together; role is what the new account is granted.
export const invites = defineSchema("invites", {
  id: column.uuid().primaryKey(),
  code: column.text().unique(),
  email: column.text().nullable(), // optional: restrict/pre-fill the recipient
  role: column.text().default("member"),
  invited_by: column.integer().ref("users", "id"),
  accepted_by: column.integer().ref("users", "id").nullable(),
  accepted_at: column.timestamp().nullable(),
  expires_at: column.timestamp().nullable(),
  created_at: column.timestamp(),
})
export type Invite = RowOf<typeof invites>

export const sessions = defineSchema("sessions", {
  id: column.text().primaryKey(),
  user_id: column.integer().ref("users", "id"),
  ip: column.text().nullable(),
  user_agent: column.text().nullable(),
  created_at: column.timestamp(),
  last_used_at: column.timestamp().nullable(),
  expires_at: column.timestamp(),
  revoked_at: column.timestamp().nullable(),
})
export type Session = RowOf<typeof sessions>
