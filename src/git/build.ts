// wess.dev push-to-deploy builder. Invoked by each repo's post-receive hook
// (cwd = tower root, so .env / tsconfig paths / node_modules all resolve).
// stdout+stderr stream back to the pushing git client over the sideband.
import { mkdir, rm } from "node:fs/promises"
import { config } from "../config/index.ts"

const [app, repo] = [process.argv[2], process.argv[3]]
if (!app || !repo) {
  console.error("usage: build.ts <app> <repo>")
  process.exit(1)
}

const say = (msg: string) => console.log(`-----> ${msg}`)

// keep the HTTP connection alive through quiet build steps
let lastOutput = Date.now()
const beat = setInterval(() => {
  if (Date.now() - lastOutput > 8000) {
    process.stdout.write("       ...\n")
    lastOutput = Date.now()
  }
}, 4000)

async function run(cmd: string[], opts: { quiet?: boolean } = {}): Promise<number> {
  const proc = Bun.spawn(cmd, {
    stdout: opts.quiet ? "ignore" : "inherit",
    stderr: opts.quiet ? "ignore" : "inherit",
  })
  const code = await proc.exited
  lastOutput = Date.now()
  return code
}

async function main(): Promise<number> {
  // post-receive stdin: "<old> <new> <ref>" per updated ref — take the branch head
  const lines = (await Bun.stdin.text()).trim().split("\n").filter(Boolean)
  const refLine = lines.findLast((l) => l.split(/\s+/)[2]?.startsWith("refs/heads/"))
  if (!refLine) {
    say("no branch update found; nothing to deploy")
    return 0
  }
  const [, commit, ref] = refLine.split(/\s+/)
  const branch = ref!.replace("refs/heads/", "")
  const short = commit!.slice(0, 10)

  say(`building ${app} from ${branch} (${short})`)

  const workdir = `/tmp/wessbuild-${app}-${short}`
  await rm(workdir, { recursive: true, force: true })
  await mkdir(workdir, { recursive: true })

  // export the pushed tree
  const archive = Bun.spawn(["git", `--git-dir=${repo}`, "archive", commit!], { stdout: "pipe" })
  const untar = Bun.spawn(["tar", "-x", "-C", workdir], { stdin: archive.stdout })
  if ((await untar.exited) !== 0) {
    say("failed to export source tree")
    return 1
  }

  if (!(await Bun.file(`${workdir}/Dockerfile`).exists())) {
    say("no Dockerfile found at the repo root")
    console.log("       wess.dev builds your app from a Dockerfile.")
    console.log("       Add one and push again — see https://wess.dev/docs/deploy")
    return 1
  }

  const tag = `wess.dev/${app}:${short}`
  say(`docker build → ${tag}`)
  if ((await run(["docker", "build", "-t", tag, workdir])) !== 0) {
    say("build failed")
    return 1
  }

  say("importing image into the platform")
  const tar = `/tmp/wessimg-${app}-${short}.tar`
  if ((await run(["docker", "save", "-o", tar, tag], { quiet: true })) !== 0) {
    say("image export failed")
    return 1
  }
  const imported = await run(
    ["firecracker-ctr", "--address", config.containerdAddress, "images", "import", tar],
    { quiet: true },
  )
  await rm(tar, { force: true })
  if (imported !== 0) {
    say("image import failed")
    return 1
  }

  say("deploying")
  const res = await fetch("http://127.0.0.1:4000/api/internal/deploy", {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": config.internalToken },
    body: JSON.stringify({ app, image: tag }),
  })
  lastOutput = Date.now()
  if (!res.ok) {
    const err = await res.text()
    say(`deploy failed: ${err}`)
    return 1
  }
  const out = (await res.json()) as { machine?: { vm_id?: string } }

  await rm(workdir, { recursive: true, force: true })
  say(`✓ ${app} is live`)
  console.log(`       https://${app}.${config.baseDomain}`)
  console.log(`       machine ${out.machine?.vm_id ?? "?"} · logs: wess logs ${app}`)
  return 0
}

const code = await main().catch((e) => {
  say(`error: ${(e as Error).message}`)
  return 1
})
clearInterval(beat)
process.exit(code)
