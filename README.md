# Tower

**Your own PaaS. Your own metal. Live in seconds.**

Tower is a self-hostable, Fly.io-style platform you run on your own bare metal. Push your code and it boots as an isolated Firecracker microVM — a dedicated database, vectors, and a multi-provider AI gateway wired up automatically, with TLS and private networking handled for you. It's invite-only and multi-tenant, so you can host your friends, family, or a team on infrastructure you own. [wess.dev](https://wess.dev) runs on it.

## Why Tower

- **Git push-to-deploy.** Each app is a bare git repo. Push a commit with a root `Dockerfile` and Tower builds the image, imports it, and ships it — straight from `git push`, with the build log streamed back to your terminal live.
- **Real microVM isolation.** Every app boots its own image as a Firecracker microVM with its own kernel — hardware-isolated, not a shared-kernel container — so you can safely host untrusted code and other people's apps.
- **A database in every app.** First deploy provisions a dedicated Postgres role + database, revokes `CONNECT` from `PUBLIC`, and injects the connection string as the app's `DATABASE_URL`. Tenant databases ship with the `pgvector` extension for embeddings and RAG.
- **One AI gateway, swappable backends.** Attach Anthropic, OpenAI, or Ollama to an app and it gets a single endpoint. The app only ever holds an opaque `aigw_…` key — re-point the provider or model without a redeploy, and the app never holds a raw provider API key.
- **Invite-only, multi-tenant.** The first registrant becomes owner; after that, registration requires an invite. Every member gets their own isolated apps and subdomains on hardware you control.
- **Runs on your own hardware.** Point a wildcard DNS at the edge, and Tower issues per-host Let's Encrypt certificates on the fly. No cloud bill, no vendor, no servers to babysit — just your box.

## Quick start

Tower ships a single CLI binary, `wess`, that talks to your deployment (the reference deployment is `wess.dev`).

**1. Install**

```sh
curl -fsSL https://wess.dev/install.sh | sh
```

This downloads the per-platform binary to `wess`. Point the CLI at your own deployment with the `WESS_API` environment variable (default `https://wess.dev`).

**2. Log in**

```sh
wess login
```

You'll be prompted for your email and password (password input is hidden on a TTY). You can also pass them directly:

```sh
wess login -e you@example.com -p 'your-password'
```

Your token is saved to `~/.wess/token`.

**3. Create an app**

App names are lowercase letters and digits, 3–31 characters (no hyphens).

```sh
wess create myapp
```

**4a. Deploy with git push (build from a Dockerfile)**

Scaffold a starter project, commit it, add the `wess` remote, and push. Your repo needs a root `Dockerfile`.

```sh
wess init myapp                          # scaffolds server.ts, Dockerfile, AGENTS.md
git init && git add -A && git commit -m "init"
wess git myapp                           # adds a `wess` git remote
git push wess main                       # builds, imports, and deploys — log streams live
```

**4b. Deploy a prebuilt image**

```sh
wess deploy myapp --image ghcr.io/you/myapp:latest --port 8080
```

Either way, the app's `DATABASE_URL` (and any secrets) are injected into the VM's environment on every deploy — your dedicated Postgres database is provisioned automatically on first deploy.

**5. You're live**

```sh
wess status myapp        # machines, database, URL
wess open myapp          # opens https://myapp.wess.dev
wess logs myapp -f       # follow logs (-n sets line count, default 200)
```

> Add `--json` to any command for machine-readable output.

## Features

### Deploy

Two paths to production: `git push` to build a root `Dockerfile`, or `wess deploy --image <ref>` for a prebuilt image (with a sticky `--port`). Redeploys are rolling — a new machine boots and the app's image/status update before the previous machine is destroyed. Every app is served at `https://<name>.wess.dev`, with the edge router pointing the subdomain at the current running machine.

### Databases

On an app's first deploy, Tower provisions a dedicated Postgres role and database (`app_<name>`, owned by that role, `CONNECT` revoked from `PUBLIC`), stores the connection string as the app's `DATABASE_URL` secret, and routes connections through PgBouncer. Tenant databases ship with `pgvector` for storing embeddings.

### AI gateway

```sh
wess ai myapp anthropic -m claude-opus-4-8
wess ai myapp openai
wess ai myapp ollama
```

Attaching a provider mints a gateway key and injects `AI_GATEWAY_URL`, `AI_GATEWAY_KEY`, `AI_MODEL`, and `AI_PROVIDER` into the VM. The app's single endpoint routes to whichever backend the owner configured — Anthropic, OpenAI, or Ollama (server or cloud), with OpenAI-compatible bases also covering Groq, Together, OpenRouter, and vLLM. The gateway resolves the key to the current provider and model at request time, so the owner can swap providers without a redeploy and the app never holds a real provider API key.

### Sandbox

```sh
wess sandbox python ./script.py
wess sandbox bun ./task.ts
```

Runs untrusted `python` / `node` / `bun` / `bash` code in a throwaway Firecracker microVM, captures stdout, stderr, exit code, and elapsed time, then destroys the VM. Default timeout is 30s, capped at 120s.

### Tokens

```sh
wess token create ci --scopes read,deploy --app myapp
wess token list
wess token revoke <id>
```

Mint scoped API tokens from `read`, `deploy`, `logs`, `secrets`, `destroy`, and `sandbox`, optionally bound to a single app with `--app` — so an agent or CI job can do exactly what you granted and nothing more. App-scoped tokens are rejected from platform-wide resources. The `wess token` CLI requires an owner session; members create and manage their own tokens in the web console under **Settings**.

### Secrets

```sh
wess secrets set myapp STRIPE_KEY sk_live_xxx
wess secrets list myapp
wess secrets unset myapp STRIPE_KEY
```

Secrets are snapshotted into the VM's environment at deploy time.

### Doctor

```sh
wess doctor myapp          # structured pass/fail health report
wess doctor myapp -x       # add a one-line AI explanation of failures
```

Runs ordered health checks — app status, machine running state, TCP reachability of the app's port, database pooler reachability, AI attachment, and recent-log error scanning — and returns a structured report.

### More

- `wess apps` — list your apps.
- `wess destroy myapp` — destroys app, machines, and database (prompts you to retype the app name to confirm).

App names must match `^[a-z][a-z0-9]{2,30}$` (a set of names is reserved), and each app runs one machine.

## Multi-tenant & invites

Tower is invite-only and tenant-isolated by design.

- **Bootstrap.** The first person to register becomes the platform **owner** — no invite required. Every registration after that requires a valid invite code, or it's rejected with `an invite is required to register`.
- **Roles.** There are two roles, `owner` and `member`. Invites grant `member` access.
- **Anyone can invite.** Every authenticated member — owner included — can mint invite links. Codes are `inv_<uuid>`, single-use, and can be locked to a specific email. Invite links look like `https://wess.dev/admin/register?code=<code>`. As the console puts it: *anyone you invite can also invite others.*
- **Per-member isolation.** Members see only their own apps, their own API tokens, and the invites they created. The owner sees everything — all apps, all members, tenant databases, the AI providers card, and the platform events feed.
- **Revoke asymmetry.** The owner can revoke any invite, including accepted history. A member can revoke only their own still-pending invites.
- **Member removal.** Owner-only; you can't remove yourself. When a member is removed, their apps' ownership is released so the owner can reclaim or destroy them.

Sessions use a one-week `tower_session` cookie JWT in the console; the API accepts either a session JWT or a `wess_`-prefixed scoped token. Owner-only actions require a full, non-token owner session.

## Architecture

Tower is a Bun + TypeScript control plane. Deploys boot app images as Firecracker microVMs (via `firecracker-ctr` on the `aws.firecracker` runtime, each under a transient systemd unit), one machine per app. State and tenant data live in a shared Postgres cluster, with a dedicated database and role provisioned per app and connections pooled through PgBouncer. An edge layer handles wildcard subdomain routing and issues per-host Let's Encrypt certificates on the fly, pointing `https://<name>.wess.dev` at the app's current running machine. A server-rendered admin console provides the owner/member dashboard, invites, and provider configuration.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
