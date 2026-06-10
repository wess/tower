import { get, json, pipe } from "@atlas/server"

export const healthRoutes = [
  get("/health", pipe((c) => json(c, 200, { status: "ok", service: "tower" }))),
]
