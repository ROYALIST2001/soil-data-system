-- Indexes make the analytics queries fast.
--
-- WHAT IS AN INDEX?
-- A sorted shortcut. Like a library catalogue.
-- Without it, the database checks EVERY row.
-- With it, it jumps straight to the right ones.
--
-- WHY NOW? Because Phase 7 filters and sorts on these columns.
--
-- WHY NOT INDEX EVERYTHING? Indexes cost disk space and make
-- every INSERT slower. Index only what you actually search on.

-- ---------- For the field-level history ----------
-- A COMPOSITE index covers all three jobs of our query at once:
--   filter by anchor_id, filter by quality_flag, sort by created_at.
--
-- ORDER MATTERS: put the FILTER columns first, the SORT column last.
CREATE INDEX idx_readings_anchor_history
    ON readings (anchor_id, quality_flag, created_at);

-- ---------- For the district-level history ----------
CREATE INDEX idx_readings_district_history
    ON readings (district_id, quality_flag, created_at);

-- ---------- For the area-level history ----------
-- The grid is calculated from raw_lat and raw_lng, so we index those.
CREATE INDEX idx_readings_location
    ON readings (raw_lat, raw_lng, quality_flag);
