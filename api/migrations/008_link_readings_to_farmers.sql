-- Link every soil reading to the farmer who sent it, and the land it came from.
--
-- WHY THIS WAS MISSING UNTIL NOW.
-- Until Phase 9 there were no farmers, so a reading could only be tied to a
-- place: an anchor (the exact field) and a district. That was enough to draw
-- a history graph for a patch of ground.
--
-- It is NOT enough for an officer. "Show me this farmer's soil tests" cannot
-- be answered from a GPS point, because nothing says whose point it is. Both
-- dashboards are built on exactly that question, so this is the foundation.

-- ---------- WHY ALL THREE ARE NULLABLE ----------
--
-- There are already 27 readings in this database from testing, sent before
-- accounts existed. They have no owner and never will.
--
-- We could delete them, but they are the only history the Trends and Regions
-- screens have to show. So instead the columns allow NULL, those rows stay,
-- and the dashboards show them honestly as unassigned.
--
-- Adding a NOT NULL column to a table with rows would fail anyway. Nullable
-- is both the correct choice and the only possible one.

ALTER TABLE readings
    ADD COLUMN farmer_id INTEGER REFERENCES farmers(farmer_id);

ALTER TABLE readings
    ADD COLUMN land_id INTEGER REFERENCES lands(land_id);

-- WHICH CROP on that land this test was for.
--
-- A land can grow rice on one half and maize on the other. The soil test
-- belongs to one of them, and the fertilizer advice depends on which.
ALTER TABLE readings
    ADD COLUMN land_crop_id INTEGER REFERENCES land_crops(land_crop_id);

-- ---------- INDEXES ----------
--
-- Both dashboards ask "which readings belong to this farmer" on every screen,
-- and the farmer's own history screens will too. Without an index Postgres
-- reads the whole readings table each time.
--
-- The partial index (WHERE ... IS NOT NULL) skips the unassigned rows
-- entirely, which keeps it smaller and faster. Same reasoning as the
-- quality_flag indexes in 004_add_indexes.sql.

CREATE INDEX idx_readings_farmer
    ON readings(farmer_id, created_at)
    WHERE farmer_id IS NOT NULL;

CREATE INDEX idx_readings_land
    ON readings(land_id, created_at)
    WHERE land_id IS NOT NULL;
