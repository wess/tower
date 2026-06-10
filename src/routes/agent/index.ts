import { get, json, pipe, putHeader, text } from "@atlas/server"

const txt = (c: Parameters<typeof text>[0], body: string) =>
  putHeader(text(c, 200, body), "content-type", "text/plain; charset=utf-8")

const LLMS = `# wess.dev

> wess.dev is a self-hosted application platform. Push code (git) or a container image and it runs as an isolated microVM with a Postgres database, a vector store (pgvector), secrets, logs, and an optional AI gateway. It is AI-native: agent-scoped tokens, a structured doctor endpoint, an ephemeral code-execution sandbox, and a provider-agnostic AI gateway (Anthropic, OpenAI, Ollama server/cloud, and any OpenAI-compatible endpoint).

## For agents
- Install CLI: \`curl -fsSL https://wess.dev/install.sh | sh\` → \`wess\`
- Every command takes \`--json\` for machine-readable output.
- Auth: \`wess login\`, or a scoped token in the \`Authorization: Bearer wess_...\` header (scopes: read, deploy, logs, secrets, destroy, sandbox).
- API base: https://wess.dev — see /openapi.json
- Agent conventions for a repo: /AGENTS.md

## Deploy
- \`wess create <app>\` then \`git push wess main\` (needs a Dockerfile; app listens on \$PORT) or \`wess deploy <app> --image <ref> [--port N]\`
- Every app: https://<app>.wess.dev (TLS automatic), a Postgres DB (\$DATABASE_URL, pgvector-enabled), injected secrets.

## Docs
- Getting started: /docs
- Deploy with git: /docs/deploy
- CLI reference: /docs/cli
- AI & gateway: /docs/ai
- Sandbox: /docs/sandbox
- Tokens & scopes: /docs/tokens
- Databases (+ pgvector): /docs/databases
- API reference: /docs/api
`

const AGENTS = `# AGENTS.md — deploying this app to wess.dev

This project deploys to wess.dev (a microVM app platform).

## Deploy
- Requires a \`Dockerfile\` at the repo root.
- The app MUST listen on the port in the \`PORT\` env var (default 8080).
- Deploy by pushing: \`git push wess main\` (add the remote with \`wess git <app>\`).
- The app is then live at \`https://<app>.wess.dev\`.

## Environment provided at runtime
- \`PORT\` — the port to listen on.
- \`DATABASE_URL\` — a dedicated Postgres database (pgvector available: \`CREATE EXTENSION IF NOT EXISTS vector\`).
- \`AI_GATEWAY_URL\`, \`AI_GATEWAY_KEY\`, \`AI_MODEL\` — present only if an AI provider is attached. POST \`{messages|prompt,[model],[stream]}\` to \`\$AI_GATEWAY_URL/chat\` with \`Authorization: Bearer \$AI_GATEWAY_KEY\`. Never put a raw model-provider key in the app.
- Any secrets set via \`wess secrets set <app> KEY VALUE\`.

## Useful CLI (all support --json)
- \`wess status <app>\` — machines, db, url
- \`wess logs <app> [-f]\` — app logs
- \`wess doctor <app>\` — structured health diagnosis
- \`wess sandbox <runtime> <file>\` — run code in a throwaway microVM
`

const OPENAPI = {
  openapi: "3.0.3",
  info: { title: "wess.dev API", version: "1.0.0", description: "Self-hosted microVM app platform. Bearer auth: a session JWT or a scoped wess_ token." },
  servers: [{ url: "https://wess.dev" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
  },
  security: [{ bearer: [] }],
  paths: {
    "/api/login": { post: { summary: "Get a session token", security: [], requestBody: { content: { "application/json": { schema: { type: "object", properties: { email: { type: "string" }, password: { type: "string" } }, required: ["email", "password"] } } } }, responses: { "200": { description: "token" } } } },
    "/api/apps": {
      get: { summary: "List apps (scope: read)", responses: { "200": { description: "apps" } } },
      post: { summary: "Create app (scope: deploy)", requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, image: { type: "string" } }, required: ["name"] } } } }, responses: { "201": { description: "app" } } },
    },
    "/api/apps/{name}": {
      get: { summary: "App detail (scope: read)", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "detail" } } },
      delete: { summary: "Destroy app (scope: destroy)", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" } } },
    },
    "/api/apps/{name}/deploy": { post: { summary: "Deploy image (scope: deploy)", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { image: { type: "string" }, port: { type: "integer" } }, required: ["image"] } } } }, responses: { "200": { description: "machine" } } } },
    "/api/apps/{name}/logs": { get: { summary: "Logs (scope: logs)", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }, { name: "lines", in: "query", schema: { type: "integer" } }], responses: { "200": { description: "logs" } } } },
    "/api/apps/{name}/doctor": { get: { summary: "Structured diagnosis (scope: read)", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }, { name: "explain", in: "query", schema: { type: "string", enum: ["1"] } }], responses: { "200": { description: "diagnosis" } } } },
    "/api/apps/{name}/secrets": {
      get: { summary: "List secret names (scope: secrets)", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "names" } } },
      post: { summary: "Set secret (scope: secrets)", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } }, required: ["name", "value"] } } } }, responses: { "200": { description: "ok" } } },
    },
    "/api/sandbox": { post: { summary: "Run code in an ephemeral microVM (scope: sandbox)", requestBody: { content: { "application/json": { schema: { type: "object", properties: { runtime: { type: "string", enum: ["python", "node", "bun", "bash"] }, code: { type: "string" }, timeoutMs: { type: "integer" } }, required: ["runtime", "code"] } } } }, responses: { "200": { description: "stdout/stderr/exitCode" } } } },
    "/api/sandbox/runtimes": { get: { summary: "List sandbox runtimes", responses: { "200": { description: "runtimes" } } } },
    "/api/tokens": {
      get: { summary: "List scoped API tokens (owner)", responses: { "200": { description: "tokens + scopes" } } },
      post: { summary: "Create a scoped API token (owner)", requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, scopes: { type: "array", items: { type: "string", enum: ["read", "deploy", "logs", "secrets", "destroy", "sandbox"] } }, app: { type: "string" } }, required: ["name", "scopes"] } } } }, responses: { "201": { description: "token (shown once)" } } },
    },
    "/api/tokens/{id}": { delete: { summary: "Revoke a token (owner)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" } } } },
    "/api/ai/providers": {
      get: { summary: "List AI providers (owner)", responses: { "200": { description: "providers" } } },
      post: { summary: "Add/update an AI provider (owner)", requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, kind: { type: "string", enum: ["anthropic", "openai", "ollama"] }, baseUrl: { type: "string" }, apiKey: { type: "string" }, defaultModel: { type: "string" } }, required: ["name", "kind", "defaultModel"] } } } }, responses: { "200": { description: "ok" } } },
    },
    "/api/ai/providers/{name}": { delete: { summary: "Remove an AI provider (owner)", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" } } } },
    "/api/apps/{name}/ai": { post: { summary: "Attach an AI provider to an app (owner)", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { provider: { type: "string" }, model: { type: "string" } }, required: ["provider"] } } } }, responses: { "200": { description: "gateway_key" } } } },
    "/api/apps/{name}/secrets/{key}": { delete: { summary: "Unset a secret (scope: secrets)", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }, { name: "key", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" } } } },
    "/ai/chat": { post: { summary: "Provider-agnostic chat (auth: app gateway key)", requestBody: { content: { "application/json": { schema: { type: "object", properties: { messages: { type: "array" }, prompt: { type: "string" }, model: { type: "string" }, stream: { type: "boolean" } } } } } }, responses: { "200": { description: "completion" } } } },
  },
}

export const agentRoutes = [
  get("/llms.txt", pipe((c) => txt(c, LLMS))),
  get("/AGENTS.md", pipe((c) => txt(c, AGENTS))),
  get("/openapi.json", pipe((c) => json(c, 200, OPENAPI))),
]
