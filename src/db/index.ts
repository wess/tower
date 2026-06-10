import { connect } from "@atlas/db"
import { SQL } from "bun"
import { config } from "../config/index.ts"

// shared controlplane connection (pooled). Provisioning that issues
// CREATE DATABASE/ROLE opens its own short-lived connections — see ../postgres.
export const db = connect({
  driver: "postgres",
  url: config.databaseUrl,
  pool: 5,
})

// raw Bun.SQL handle for queries the builder doesn't cleanly express (upserts)
export const sql = new SQL(config.databaseUrl)
