CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE TABLE IF NOT EXISTS households (
 id uuid PRIMARY KEY, name text NOT NULL, timezone text NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
 household_id uuid REFERENCES households(id) ON DELETE CASCADE,
 user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('owner','admin','caregiver','viewer')),
 PRIMARY KEY (household_id,user_id)
);
CREATE TABLE IF NOT EXISTS children (
 id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(household_id,id)
);
CREATE TABLE IF NOT EXISTS events (
 id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 data jsonb NOT NULL, version integer NOT NULL CHECK (version > 0), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_household ON events(household_id,updated_at);
CREATE TABLE IF NOT EXISTS mutation_receipts (
 household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE, mutation_id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id), input jsonb NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(household_id,mutation_id)
);
CREATE TABLE IF NOT EXISTS audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, entity_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invitations (
 id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 email text NOT NULL, role text NOT NULL CHECK(role IN ('admin','caregiver','viewer')),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
CREATE TABLE IF NOT EXISTS reminders (
 id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 data jsonb NOT NULL
);
