-- Table: lands (one piece of ground belonging to one farmer).
--
-- WHY A SEPARATE TABLE AND NOT COLUMNS ON farmers?
-- Because a farmer can own MANY lands. The moment one thing can have many
-- of another thing, the "many" side needs its own table. Columns like
-- land1_name, land2_name would cap the farmer at a number we invented and
-- make every query miserable.

CREATE TABLE lands (
    land_id     SERIAL PRIMARY KEY,

    -- WHO OWNS IT.
    --
    -- REFERENCES means the database itself refuses a land whose farmer does
    -- not exist. A land with no owner is meaningless, so we make it
    -- impossible rather than hoping the code never does it.
    --
    -- ON DELETE CASCADE: if a farmer is ever deleted, their lands go with
    -- them. Without this, deleting a farmer would either fail or leave
    -- lands pointing at nobody.
    farmer_id   INTEGER NOT NULL
                REFERENCES farmers(farmer_id) ON DELETE CASCADE,

    -- The farmer's own name for this land, like "Home paddy" or
    -- "Land near the tank". They choose it, so they can tell their own
    -- lands apart in a list.
    name        TEXT NOT NULL,

    -- Where the land is. Pre-filled from the farmer's own division in the
    -- app, but editable, because a farmer may own land in another division.
    gn_division TEXT NOT NULL,

    -- Size in HECTARES, matching the rest of the system. The fertilizer
    -- recommendation and every analytics query already work in hectares,
    -- so storing acres here would mean converting at every single use.
    --
    -- CHECK (size_ha > 0) is the database refusing nonsense. A land of
    -- zero or negative size cannot exist, so it must not be storable.
    size_ha     DOUBLE PRECISION NOT NULL CHECK (size_ha > 0),

    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: land_crops (one crop grown on part of one land).
--
-- The SAME reasoning one level down: one land grows many crops, so the
-- crops need their own table.

CREATE TABLE land_crops (
    land_crop_id SERIAL PRIMARY KEY,

    land_id      INTEGER NOT NULL
                 REFERENCES lands(land_id) ON DELETE CASCADE,

    -- One of the 10 crop keys the system knows, in lowercase.
    --
    -- This MUST match model.AllowedCrops in Go and the words the model was
    -- trained on. The app only ever offers that list, and the Go service
    -- checks it again, because a check that only lives in the app can be
    -- skipped by anyone calling the API directly.
    crop         TEXT NOT NULL,

    size_ha      DOUBLE PRECISION NOT NULL CHECK (size_ha > 0),

    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),

    -- The same crop twice on one land makes no sense, and it would make
    -- "how much rice does this farmer grow" ambiguous. If a farmer plants
    -- more rice, they change the size of the row that is already there.
    UNIQUE (land_id, crop)
);

-- ---------- INDEXES ----------
--
-- Both of these columns are used to LOOK THINGS UP, not just to store them.
-- Every time the app opens we ask "which lands belong to this farmer" and
-- "which crops are on this land". Without an index Postgres reads the whole
-- table each time. See 004_add_indexes.sql for the same reasoning.

CREATE INDEX idx_lands_farmer ON lands(farmer_id);
CREATE INDEX idx_land_crops_land ON land_crops(land_id);
