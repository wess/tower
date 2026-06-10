CREATE TABLE users (
  id         serial PRIMARY KEY,
  email      text UNIQUE NOT NULL,
  password   text NOT NULL,
  role       text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id           text PRIMARY KEY,
  user_id      integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
