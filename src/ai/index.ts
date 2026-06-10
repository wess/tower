import { createProvider, type AiProvider as AtlasProvider } from "@atlas/ai"
import { from } from "@atlas/db"
import { db } from "../db/index.ts"
import { getApp } from "../apps/index.ts"
import { ai_providers, app_ai, type AiProvider, type AppAi } from "../schema/index.ts"

export const PROVIDER_KINDS = ["anthropic", "openai", "ollama"] as const
export type ProviderKind = (typeof PROVIDER_KINDS)[number]

// Ollama (server or cloud) speaks an OpenAI-compatible API, so it maps onto
// @atlas/ai's openai adapter with a base_url — the same path that covers
// Groq, Together, OpenRouter, vLLM, LM Studio, etc.
// The @atlas/ai openai adapter appends "/v1/chat/completions" to the base, so
// the base must be the ROOT (no trailing slash, no trailing /vN). Normalize so
// the owner can enter the URL either way.
function rootBase(u?: string | null): string | undefined {
  if (!u) return undefined
  return u.replace(/\/+$/, "").replace(/\/v\d+$/, "") || undefined
}

function toAtlas(p: AiProvider): AtlasProvider {
  switch (p.kind) {
    case "anthropic":
      return createProvider({ provider: "anthropic", key: p.api_key ?? "", defaultModel: p.default_model })
    case "ollama":
      // A key-protected Ollama (Ollama Cloud, or a server behind an auth proxy)
      // exposes an OpenAI-compatible endpoint — route through the openai adapter
      // so the key is sent. Keyless local servers use the native Ollama adapter.
      if (p.api_key) {
        return createProvider({
          provider: "openai",
          key: p.api_key,
          baseUrl: rootBase(p.base_url) ?? "https://ollama.com",
          defaultModel: p.default_model,
        })
      }
      return createProvider({
        provider: "ollama",
        baseUrl: p.base_url ?? "http://127.0.0.1:11434",
        defaultModel: p.default_model,
      })
    default:
      // openai + every OpenAI-compatible endpoint (Groq, Together, OpenRouter, vLLM…)
      return createProvider({
        provider: "openai",
        key: p.api_key ?? "",
        baseUrl: rootBase(p.base_url),
        defaultModel: p.default_model,
      })
  }
}

export async function listProviders(): Promise<AiProvider[]> {
  return db.all<AiProvider>(from(ai_providers).orderBy("created_at", "ASC"))
}

export async function upsertProvider(input: {
  name: string
  kind: string
  baseUrl?: string | null
  apiKey?: string | null
  defaultModel: string
}): Promise<void> {
  if (!PROVIDER_KINDS.includes(input.kind as ProviderKind))
    throw new Error(`kind must be one of: ${PROVIDER_KINDS.join(", ")}`)
  const existing = await db.one<AiProvider>(from(ai_providers).where((q) => q("name").equals(input.name)))
  if (existing) {
    await db.execute(
      from(ai_providers)
        .where((q) => q("id").equals(existing.id))
        .update({
          kind: input.kind,
          base_url: input.baseUrl ?? null,
          api_key: input.apiKey ?? null,
          default_model: input.defaultModel,
        }),
    )
  } else {
    await db.execute(
      from(ai_providers).insert({
        name: input.name,
        kind: input.kind,
        base_url: input.baseUrl ?? null,
        api_key: input.apiKey ?? null,
        default_model: input.defaultModel,
      }),
    )
  }
}

export async function deleteProvider(name: string): Promise<void> {
  await db.execute(from(ai_providers).where((q) => q("name").equals(name)).del())
}

// Attach a provider to an app — mints a gateway key and injects AI_* env on deploy.
export async function attachAi(
  appName: string,
  providerName: string,
  model?: string,
): Promise<{ gatewayKey: string }> {
  const app = await getApp(appName)
  if (!app) throw new Error("app not found")
  const provider = await db.one<AiProvider>(from(ai_providers).where((q) => q("name").equals(providerName)))
  if (!provider) throw new Error(`no AI provider named "${providerName}"`)

  const gatewayKey = `aigw_${crypto.randomUUID().replaceAll("-", "")}`
  const existing = await db.one<AppAi>(from(app_ai).where((q) => q("app_id").equals(app.id)))
  if (existing) {
    await db.execute(
      from(app_ai).where((q) => q("id").equals(existing.id)).update({ provider_id: provider.id, model: model ?? null }),
    )
    return { gatewayKey: existing.gateway_key }
  }
  await db.execute(
    from(app_ai).insert({ app_id: app.id, provider_id: provider.id, model: model ?? null, gateway_key: gatewayKey }),
  )
  return { gatewayKey }
}

export async function detachAi(appName: string): Promise<void> {
  const app = await getApp(appName)
  if (!app) return
  await db.execute(from(app_ai).where((q) => q("app_id").equals(app.id)).del())
}

// resolve a gateway key → the atlas provider + model to use
export async function resolveGateway(
  key: string,
): Promise<{ provider: AtlasProvider; model?: string; providerName: string } | null> {
  const link = await db.one<AppAi>(from(app_ai).where((q) => q("gateway_key").equals(key)))
  if (!link) return null
  const provider = await db.one<AiProvider>(from(ai_providers).where((q) => q("id").equals(link.provider_id)))
  if (!provider || !provider.enabled) return null
  return {
    provider: toAtlas(provider),
    model: link.model ?? provider.default_model,
    providerName: provider.name,
  }
}

// env injected into an app that has AI attached
export async function aiEnvFor(appId: string): Promise<Record<string, string>> {
  const link = await db.one<AppAi>(from(app_ai).where((q) => q("app_id").equals(appId)))
  if (!link) return {}
  const provider = await db.one<AiProvider>(from(ai_providers).where((q) => q("id").equals(link.provider_id)))
  if (!provider) return {}
  return {
    AI_GATEWAY_URL: "http://172.20.0.1:4000/ai",
    AI_GATEWAY_KEY: link.gateway_key,
    AI_MODEL: link.model ?? provider.default_model,
    AI_PROVIDER: provider.kind,
  }
}
