import { defineConfig, env } from "@atlas/config"

export const config = defineConfig({
  port: env("PORT", { parse: Number, default: "4000" }),
  host: env("HOST", { default: "127.0.0.1" }),

  // controlplane DB — direct :5432 (provisioning needs CREATE DATABASE)
  databaseUrl: env("DATABASE_URL", {
    default: "postgres://controlplane@127.0.0.1:5432/controlplane",
  }),

  // JWT signing secret for tower's own auth
  authSecret: env("AUTH_SECRET", { default: "dev-insecure-change-me" }),

  // shared secret for host-local service calls (edge resolve, git hook deploy)
  internalToken: env("INTERNAL_TOKEN", { default: "dev-internal-token" }),

  // platform state on disk
  gitRoot: env("GIT_ROOT", { default: "/var/lib/tower/git" }),
  logsDir: env("LOGS_DIR", { default: "/var/lib/tower/logs" }),
  appsFile: env("APPS_FILE", { default: "/var/lib/tower/apps.json" }),

  // firecracker-containerd
  containerdAddress: env("CONTAINERD_ADDRESS", {
    default: "/run/firecracker-containerd/containerd.sock",
  }),
  snapshotter: env("SNAPSHOTTER", { default: "devmapper" }),
  fcRuntime: env("FC_RUNTIME", { default: "aws.firecracker" }),

  // platform networking
  gatewayIp: env("GATEWAY_IP", { default: "172.20.0.1" }),
  pgbouncerPort: env("PGBOUNCER_PORT", { parse: Number, default: "6432" }),
  baseDomain: env("BASE_DOMAIN", { default: "wess.dev" }),
})
