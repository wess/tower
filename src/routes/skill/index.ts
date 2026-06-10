import { get, pipe, putHeader, redirect, text } from "@atlas/server"

// A Claude Code / agent skill that teaches the full wess.dev deploy lifecycle.
// Served at /skill/SKILL.md (human/agent readable) and /skill.md (alias).
const SKILL = `---
name: deploy-to-wess
description: Deploy any app to wess.dev — detect the stack, write a Dockerfile, create the app, push to deploy, and debug failures with the doctor. Use when the user asks to deploy, ship, or host a project on wess.dev.
---

# Deploying to wess.dev

wess.dev runs apps as isolated microVMs. You deploy by pushing a git repo (built from a Dockerfile) or by deploying a prebuilt image. Every app gets \`https://<name>.wess.dev\`, a Postgres database (\`DATABASE_URL\`, pgvector-enabled), secrets, and logs.

## Prerequisites
1. The CLI: \`curl -fsSL https://wess.dev/install.sh | sh\` (installs \`wess\`).
2. Auth: \`wess login\` (or set \`WESS_TOKEN\` to a scoped token).
3. Every \`wess\` command accepts \`--json\` — use it to parse results programmatically.

## The deploy flow

### 1. Pick an app name
Lowercase letters and digits, 3–31 chars. \`wess create <name>\`.

### 2. Ensure a Dockerfile exists at the repo root
The app MUST listen on the \`PORT\` env var (default 8080). Examples:

Bun:
\`\`\`dockerfile
FROM oven/bun:alpine
WORKDIR /app
COPY . .
RUN bun install
CMD ["bun", "server.ts"]
\`\`\`

Node:
\`\`\`dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
CMD ["node", "server.js"]
\`\`\`

Python:
\`\`\`dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["python", "main.py"]
\`\`\`

Make sure the server binds \`0.0.0.0\` and reads \`process.env.PORT\` / \`os.environ["PORT"]\`.

### 3. Deploy
\`\`\`bash
wess git <name>            # adds a 'wess' git remote
git add -A && git commit -m "deploy" && git push wess main
\`\`\`
The build streams to your terminal. On success the app is live at \`https://<name>.wess.dev\`.

Alternatively, a prebuilt image: \`wess deploy <name> --image <ref> --port <p>\`.

### 4. Verify and debug
\`\`\`bash
wess status <name> --json
wess doctor <name> --json   # structured: machine, port, database, logs
wess logs <name> -f
\`\`\`
If \`doctor\` reports \`port: nothing listening\`, the app isn't binding \`$PORT\` — fix the server and push again. If \`machine: not running\`, check \`wess logs\` for a crash.

## Databases
\`DATABASE_URL\` is injected automatically on first deploy. pgvector is available: run \`CREATE EXTENSION IF NOT EXISTS vector\` and store embeddings.

## AI
If the owner attaches a provider, \`AI_GATEWAY_URL\` / \`AI_GATEWAY_KEY\` / \`AI_MODEL\` are injected. Call the provider-agnostic gateway:
\`\`\`
POST $AI_GATEWAY_URL/chat
Authorization: Bearer $AI_GATEWAY_KEY
{ "messages": [{"role":"user","content":"hi"}] }
\`\`\`
Never hardcode a model-provider key in the app — use the gateway.

## Secrets
\`wess secrets set <name> KEY value\` — applied on the next deploy.

## Reference
- llms.txt: https://wess.dev/llms.txt
- OpenAPI: https://wess.dev/openapi.json
- Docs: https://wess.dev/docs
`

const PLUGIN_JSON = JSON.stringify(
  {
    name: "wess-dev",
    version: "1.0.0",
    description: "Deploy apps to wess.dev — push-to-deploy, doctor, sandbox.",
    skills: ["./skills/deploy-to-wess/SKILL.md"],
    homepage: "https://wess.dev",
  },
  null,
  2,
)

const md = (c: Parameters<typeof text>[0], body: string) =>
  putHeader(text(c, 200, body), "content-type", "text/markdown; charset=utf-8")

export const skillRoutes = [
  get("/skill/SKILL.md", pipe((c) => md(c, SKILL))),
  get("/skill.md", pipe((c) => md(c, SKILL))),
  get("/skill/plugin.json", pipe((c) => md(c, PLUGIN_JSON))),
  get("/skill/install", pipe((c) =>
    putHeader(
      text(
        c,
        200,
        `#!/bin/sh
# Install the wess.dev Claude Code skill into the current project
set -e
mkdir -p .claude/skills/deploy-to-wess
curl -fsSL https://wess.dev/skill/SKILL.md -o .claude/skills/deploy-to-wess/SKILL.md
echo "✓ installed skill: .claude/skills/deploy-to-wess/SKILL.md"
echo "  open Claude Code here and say: deploy this to wess.dev"
`,
      ),
      "content-type",
      "text/x-shellscript",
    ),
  )),
  get("/skill", pipe((c) => redirect(c, "/skill/SKILL.md"))),
]
