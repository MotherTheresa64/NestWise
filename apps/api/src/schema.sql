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

ALTER TABLE households ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
ALTER TABLE children ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS sessions_id ON sessions(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at timestamptz;
CREATE TABLE IF NOT EXISTS account_tokens (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS changes (
 household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 revision bigint NOT NULL, kind text NOT NULL, entity_id uuid NOT NULL, record jsonb,
 PRIMARY KEY(household_id,revision)
);
-- Updating the household row serializes revision allocation until commit. A sequence alone
-- could expose a later revision before an earlier transaction commits, skipping changes.
CREATE OR REPLACE FUNCTION record_household_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h uuid; entity uuid; r bigint; body jsonb;
BEGIN
 h := COALESCE(NEW.household_id,OLD.household_id);
 UPDATE households SET revision=revision+1 WHERE id=h RETURNING revision INTO r;
 IF r IS NULL THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='members' THEN
   entity := COALESCE(NEW.user_id,OLD.user_id);
   IF TG_OP <> 'DELETE' THEN
     SELECT jsonb_build_object('userId',u.id,'name',u.name,'email',u.email,'role',NEW.role) INTO body FROM users u WHERE u.id=NEW.user_id;
   END IF;
 ELSE
   entity := COALESCE(NEW.id,OLD.id);
   IF TG_OP <> 'DELETE' THEN
     body := NEW.data;
     IF TG_TABLE_NAME='children' THEN
       body := body || jsonb_build_object('id',NEW.id,'householdId',h,'createdAt',NEW.created_at,'version',NEW.version);
     END IF;
   END IF;
 END IF;
 INSERT INTO changes VALUES(h,r,TG_TABLE_NAME,entity,body);
 PERFORM pg_notify('nestwise_changes',h::text);
 RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER events_change AFTER INSERT OR UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION record_household_change();
CREATE OR REPLACE TRIGGER children_change AFTER INSERT OR UPDATE OR DELETE ON children FOR EACH ROW EXECUTE FUNCTION record_household_change();
CREATE OR REPLACE TRIGGER reminders_change AFTER INSERT OR UPDATE OR DELETE ON reminders FOR EACH ROW EXECUTE FUNCTION record_household_change();
CREATE OR REPLACE TRIGGER members_change AFTER INSERT OR UPDATE OR DELETE ON members FOR EACH ROW EXECUTE FUNCTION record_household_change();
