import { type Message } from "@atlas/ai"
import { del, get, halt, json, parseJson, pipe, pipeline, post, putHeader, stream } from "@atlas/server"
import { requireOwner } from "../../auth/index.ts"
import {
  attachAi,
  deleteProvider,
  listProviders,
  resolveGateway,
  upsertProvider,
} from "../../ai/index.ts"

// ---- the gateway: provider-agnostic chat for deployed apps ----
// Apps POST {messages,[model],[stream]} with their AI_GATEWAY_KEY; tower routes
// to whichever provider (Anthropic / OpenAI / Ollama server|cloud / compatible)
// the owner attached — the app never holds a real provider key.
export const aiRoutes = [
  post(
    "/ai/chat",
    pipeline(parseJson)(async (c) => {
      const key = (c.request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
      if (!key.startsWith("aigw_")) return halt(c, 401, { error: "missing gateway key" })
      const resolved = await resolveGateway(key)
      if (!resolved) return halt(c, 401, { error: "invalid or disabled gateway key" })

      const body = (c.body ?? {}) as {
        messages?: Message[]
        prompt?: string
        model?: string
        stream?: boolean
        temperature?: number
        maxTokens?: number
      }
      const messages: Message[] = body.messages ??
        (body.prompt ? [{ role: "user", content: body.prompt }] : [])
      if (!messages.length) return halt(c, 400, { error: "messages or prompt required" })

      const opts = {
        messages,
        model: body.model ?? resolved.model,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
      }

      try {
        if (body.stream) {
          const sse = streamToSse(resolved.provider.chatStream(opts))
          let out = putHeader(c, "content-type", "text/event-stream")
          out = putHeader(out, "cache-control", "no-cache")
          return stream(out, 200, sse as unknown as ReadableStream)
        }
        const res = await resolved.provider.chat(opts)
        return json(c, 200, {
          provider: resolved.providerName,
          model: res.model,
          content: res.content,
          usage: res.usage,
        })
      } catch (e) {
        return halt(c, 502, { error: `provider error: ${(e as Error).message}` })
      }
    }),
  ),

  // ---- owner provider management ----
  get(
    "/api/ai/providers",
    pipe(async (c) => {
      const d = await requireOwner(c)
      if (d.halted) return d
      const providers = (await listProviders()).map((p) => ({
        name: p.name,
        kind: p.kind,
        base_url: p.base_url,
        default_model: p.default_model,
        enabled: p.enabled,
        has_key: !!p.api_key,
      }))
      return json(d, 200, { providers })
    }),
  ),

  post(
    "/api/ai/providers",
    pipeline(parseJson)(async (c) => {
      const d = await requireOwner(c)
      if (d.halted) return d
      const b = (d.body ?? {}) as {
        name?: string
        kind?: string
        baseUrl?: string
        apiKey?: string
        defaultModel?: string
      }
      if (!b.name || !b.kind || !b.defaultModel)
        return halt(d, 400, { error: "name, kind, defaultModel required" })
      try {
        await upsertProvider({
          name: b.name,
          kind: b.kind,
          baseUrl: b.baseUrl,
          apiKey: b.apiKey,
          defaultModel: b.defaultModel,
        })
        return json(d, 200, { ok: true })
      } catch (e) {
        return halt(d, 400, { error: (e as Error).message })
      }
    }),
  ),

  del(
    "/api/ai/providers/:name",
    pipe(async (c) => {
      const d = await requireOwner(c)
      if (d.halted) return d
      await deleteProvider(c.params.name)
      return json(d, 200, { ok: true })
    }),
  ),

  post(
    "/api/apps/:name/ai",
    pipeline(parseJson)(async (c) => {
      const d = await requireOwner(c)
      if (d.halted) return d
      const b = (d.body ?? {}) as { provider?: string; model?: string }
      if (!b.provider) return halt(d, 400, { error: "provider required" })
      try {
        const r = await attachAi(c.params.name, b.provider, b.model)
        return json(d, 200, { ok: true, gateway_key: r.gatewayKey })
      } catch (e) {
        return halt(d, 400, { error: (e as Error).message })
      }
    }),
  ),
]
