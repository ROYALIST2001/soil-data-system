-- Add the agro-ecological zone to each district.
--
-- Sri Lanka has three zones with very different soil chemistry:
--   wet          - southwest, heavy rain, acidic soil
--   dry          - north/east/southeast, low rain, alkaline soil
--   intermediate - between the two
--
-- The zone is stored HERE, not in readings, because a district's zone
-- never changes. This is normalization: one fact, one place.

ALTER TABLE districts
    ADD COLUMN zone TEXT NOT NULL DEFAULT 'intermediate';

-- A CHECK constraint makes the database refuse any other word.
-- This is the database acting as our last safety net.
ALTER TABLE districts
    ADD CONSTRAINT districts_zone_check
    CHECK (zone IN ('wet', 'dry', 'intermediate'));

-- ---------- WET ZONE (9 districts) ----------
UPDATE districts SET zone = 'wet' WHERE name IN (
    'Colombo', 'Gampaha', 'Kalutara',
    'Kandy', 'Nuwara Eliya',
    'Galle', 'Matara',
    'Ratnapura', 'Kegalle'
);

-- ---------- DRY ZONE (13 districts) ----------
UPDATE districts SET zone = 'dry' WHERE name IN (
    'Hambantota',
    'Jaffna', 'Kilinochchi', 'Mannar', 'Vavuniya', 'Mullaitivu',
    'Batticaloa', 'Ampara', 'Trincomalee',
    'Puttalam', 'Anuradhapura', 'Polonnaruwa',
    'Monaragala'
);

-- ---------- INTERMEDIATE ZONE (3 districts) ----------
UPDATE districts SET zone = 'intermediate' WHERE name IN (
    'Matale', 'Kurunegala', 'Badulla'
);
