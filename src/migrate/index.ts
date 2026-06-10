import { migrate } from "@atlas/migrate"
import { db } from "../db/index.ts"

const cmd = process.argv[2] ?? "up"
const dir = "./migrations"

await migrate.ensureTable(db)

if (cmd === "up") {
  const applied = await migrate.up(db, dir)
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "nothing to apply")
} else if (cmd === "down") {
  const rolled = await migrate.down(db, dir)
  console.log(rolled ? `rolled back: ${rolled}` : "nothing to roll back")
} else if (cmd === "status") {
  const status = await migrate.status(db, dir)
  for (const m of status) console.log(`${m.appliedAt ? "[x]" : "[ ]"} ${m.name}`)
} else {
  console.error(`unknown command: ${cmd} (use up | down | status)`)
  process.exitCode = 1
}

await db.close()
