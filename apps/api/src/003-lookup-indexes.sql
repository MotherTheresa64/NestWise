-- Foreign-key lookups used on every request (membership, session revoke, reminders, invitations).
CREATE INDEX IF NOT EXISTS members_user ON members(user_id);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS reminders_household ON reminders(household_id);
CREATE INDEX IF NOT EXISTS invitations_household ON invitations(household_id);
