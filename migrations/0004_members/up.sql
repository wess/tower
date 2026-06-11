-- Multi-tenant: each app belongs to a user. Existing apps are backfilled to the
-- platform owner (the first-registered user) so nothing is orphaned.
ALTER TABLE apps ADD COLUMN owner_id integer REFERENCES users(id) ON DELETE SET NULL;

UPDATE apps
SET owner_id = (SELECT id FROM users WHERE role = 'owner' ORDER BY id ASC LIMIT 1)
WHERE owner_id IS NULL;

CREATE INDEX apps_owner_id_idx ON apps(owner_id);

-- Invite-only registration. Each invite is a single-use code minted by a member.
CREATE TABLE invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  email       text,                                  -- null = anyone with the link
  role        text NOT NULL DEFAULT 'member',
  invited_by  integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_by integer REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invites_invited_by_idx ON invites(invited_by);
