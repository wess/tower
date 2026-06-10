CREATE TABLE apps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text UNIQUE NOT NULL,
  image      text,
  status     text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE machines (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  vm_id      text,
  ip         text,
  image      text NOT NULL,
  state      text NOT NULL DEFAULT 'creating',
  port       integer NOT NULL DEFAULT 8080,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX machines_app_id_idx ON machines(app_id);

CREATE TABLE secrets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name       text NOT NULL,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, name)
);

CREATE TABLE tenant_databases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     uuid NOT NULL UNIQUE REFERENCES apps(id) ON DELETE CASCADE,
  db_name    text NOT NULL,
  db_role    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id         bigserial PRIMARY KEY,
  app_id     uuid REFERENCES apps(id) ON DELETE SET NULL,
  kind       text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_app_id_idx ON events(app_id);
