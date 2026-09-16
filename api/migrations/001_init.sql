-- Table 1: districts (the 25 districts of Sri Lanka).
CREATE TABLE districts (
    district_id SERIAL PRIMARY KEY,   -- unique id, made automatically (1,2,3...)
    name        TEXT NOT NULL UNIQUE  -- district name; cannot repeat, cannot be empty
);

-- Table 2: anchors (one exact field = one fixed location point).
CREATE TABLE anchors (
    anchor_id  SERIAL PRIMARY KEY,               -- unique id for the field
    center_lat DOUBLE PRECISION NOT NULL,        -- the field's center latitude
    center_lng DOUBLE PRECISION NOT NULL,        -- the field's center longitude
    created_at TIMESTAMP NOT NULL DEFAULT NOW()  -- when this field was first seen
);

-- Table 3: readings (one soil test sent by a farmer).
CREATE TABLE readings (
    reading_id   SERIAL PRIMARY KEY,                       -- unique id for the reading

    raw_lat      DOUBLE PRECISION NOT NULL,                -- exact GPS latitude (never changed)
    raw_lng      DOUBLE PRECISION NOT NULL,                -- exact GPS longitude (never changed)

    anchor_id    INTEGER REFERENCES anchors(anchor_id),     -- link to a field (filled in Phase 3)
    district_id  INTEGER REFERENCES districts(district_id), -- link to a district (filled in Phase 3)

    n            DOUBLE PRECISION NOT NULL,                -- Nitrogen value
    p            DOUBLE PRECISION NOT NULL,                -- Phosphorus value
    k            DOUBLE PRECISION NOT NULL,                -- Potassium value
    ph           DOUBLE PRECISION NOT NULL,                -- pH value

    crop         TEXT NOT NULL,                            -- crop type (e.g. Rice)
    stage        TEXT NOT NULL,                            -- growth stage
    target_yield DOUBLE PRECISION NOT NULL,                -- target yield
    area         DOUBLE PRECISION NOT NULL,                -- field size

    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),         -- when submitted (for history)
    quality_flag TEXT NOT NULL DEFAULT 'OK'                -- result of the check (Phase 4)
);