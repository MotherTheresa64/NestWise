CREATE TABLE foods (
 id uuid PRIMARY KEY,
 household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 data jsonb NOT NULL
);
CREATE INDEX foods_household ON foods(household_id);
CREATE TRIGGER foods_change AFTER INSERT OR UPDATE OR DELETE ON foods FOR EACH ROW EXECUTE FUNCTION record_household_change();
CREATE TABLE erased_foods (
 household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 food_id uuid NOT NULL, PRIMARY KEY(household_id,food_id)
);
