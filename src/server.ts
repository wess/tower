import { serve } from "@atlas/server"
import { migrate } from "@atlas/migrate"
import { mkdir } from "node:fs/promises"
import { writeAppsFile } from "./apps/index.ts"
import { config } from "./config/index.ts"
import { db } from "./db/index.ts"
import { gitRoutes } from "./git/index.ts"
import { adminRoutes } from "./routes/admin/index.ts"
import { agentRoutes } from "./routes/agent/index.ts"
import { aiRoutes } from "./routes/ai/index.ts"
import { appDetailRoutes } from "./routes/appdetail/index.ts"
import { appRoutes } from "./routes/apps/index.ts"
import { authRoutes } from "./routes/auth/index.ts"
import { dlRoutes } from "./routes/dl/index.ts"
import { docsRoutes } from "./routes/docs/index.ts"
import { healthRoutes } from "./routes/health/index.ts"
import { internalRoutes } from "./routes/internal/index.ts"
import { landingRoutes } from "./routes/landing/index.ts"
import { platformRoutes } from "./routes/platform/index.ts"
import { skillRoutes } from "./routes/skill/index.ts"

await mkdir(config.gitRoot, { recursive: true })
await mkdir(config.logsDir, { recursive: true })
await mkdir(`${process.cwd()}/public/dl`, { recursive: true })

// Apply pending migrations on boot. The service runs as root and can read .env
// for the real DATABASE_URL, so a deploy + restart self-migrates. Non-fatal: a
// local boot without the control-plane DB just logs and serves anyway.
try {
  await migrate.ensureTable(db)
  const applied = await migrate.up(db, "./migrations")
  if (applied.length) console.log(`migrations applied: ${applied.join(", ")}`)
} catch (e) {
  console.error(`migrate-on-boot skipped: ${(e as Error).message}`)
}

await writeAppsFile().catch(() => {})

serve({
  port: config.port,
  hostname: config.host,
  routes: [
    ...landingRoutes,
    ...healthRoutes,
    ...docsRoutes,
    ...dlRoutes,
    ...agentRoutes,
    ...skillRoutes,
    ...authRoutes,
    ...appRoutes,
    ...platformRoutes,
    ...aiRoutes,
    ...internalRoutes,
    ...gitRoutes,
    ...appDetailRoutes,
    ...adminRoutes,
  ],
})

console.log(`tower control plane on http://${config.host}:${config.port}`)
