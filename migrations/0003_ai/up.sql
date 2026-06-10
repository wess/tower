-- scoped API tokens for agents/automation
CREATE TABLE api_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  token_hash text UNIQUE NOT NULL,
  app_name   text,                       -- null = all apps
  scopes     text NOT NULL,              -- csv: read,deploy,logs,secrets,destroy,sandbox
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- AI providers configured by the owner (anthropic | openai | ollama)
CREATE TABLE ai_providers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text UNIQUE NOT NULL,    -- e.g. "anthropic", "localollama", "groq"
  kind          text NOT NULL,           -- anthropic | openai | ollama
  base_url      text,                    -- openai/ollama custom endpoints (Ollama cloud/server, Groq, ...)
  api_key       text,
  default_model text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- per-app AI attachment (like the database attach)
CREATE TABLE app_ai (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      uuid NOT NULL UNIQUE REFERENCES apps(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  model       text,                      -- override of provider default
  gateway_key text UNIQUE NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
