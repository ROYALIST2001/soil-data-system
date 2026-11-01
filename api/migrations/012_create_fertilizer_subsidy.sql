-- The fertilizer subsidy: government money paid to farmers towards the cost
-- of fertilizer.
--
-- HOW THIS DIFFERS FROM THE DISASTER RELIEF, which it otherwise resembles.
--
-- Relief ends when an officer marks the money paid, and the system simply
-- believes them. For a subsidy that is not good enough: the whole point of
-- this feature is that the FARMER can say the money never arrived.
--
-- So the farmer is an actor in this workflow, not just the subject of it.
-- They confirm receipt, or they raise a dispute, and those are the only two
-- moves anybody but an officer can make. That is the part worth building
-- carefully, because it is the part that makes the payment accountable to
-- the person it was meant for.

-- ---------- 1. THE ROUND ----------
--
-- A subsidy is announced for a season, not offered permanently. Declaring a
-- round first gives the scheme a budget period, a deadline, and a total that
-- somebody can be asked about afterwards.

CREATE TABLE subsidy_rounds (
    round_id SERIAL PRIMARY KEY,

    -- A human name, like "Maha season 2026/27 fertilizer subsidy".
    name TEXT NOT NULL,

    -- Sri Lanka has two cultivation seasons. Almost every agricultural
    -- figure in the country is reported against one of them, so a subsidy
    -- that did not record which season it belonged to would be hard to
    -- compare with anything.
    season TEXT NOT NULL,

    opens_on  DATE NOT NULL,
    closes_on DATE NOT NULL,

    description TEXT NOT NULL DEFAULT '',

    -- OPEN   - farmers may still apply
    -- CLOSED - the window has passed. Applications already made carry on
    --          through approval and payment; no new ones are accepted.
    status TEXT NOT NULL DEFAULT 'OPEN',

    -- ON DELETE RESTRICT, not CASCADE: removing an officer account must
    -- never erase the record of a scheme they announced.
    declared_by INTEGER NOT NULL
                REFERENCES farmers(farmer_id) ON DELETE RESTRICT,

    declared_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE subsidy_rounds
    ADD CONSTRAINT subsidy_rounds_season_check
    CHECK (season IN ('MAHA', 'YALA'));

ALTER TABLE subsidy_rounds
    ADD CONSTRAINT subsidy_rounds_status_check
    CHECK (status IN ('OPEN', 'CLOSED'));

ALTER TABLE subsidy_rounds
    ADD CONSTRAINT subsidy_rounds_dates_check
    CHECK (closes_on >= opens_on);

-- ---------- 2. WHO IT COVERS ----------
--
-- A subsidy round may be limited to particular divisions - a scheme for a
-- drought-hit area, say. Listing them makes eligibility checkable rather
-- than a matter of opinion.

CREATE TABLE subsidy_round_divisions (
    round_id    INTEGER NOT NULL
                REFERENCES subsidy_rounds(round_id) ON DELETE CASCADE,

    gn_division TEXT NOT NULL,

    PRIMARY KEY (round_id, gn_division)
);

-- ---------- 3. HOW MUCH PER HECTARE ----------
--
-- The same reasoning as the disaster rates: a published figure per crop
-- means the amount is WORKED OUT rather than decided, so two farmers
-- growing the same half hectare of rice receive the same money and anybody
-- can check the arithmetic.
--
-- A crop with no rate is simply not covered by that round.

CREATE TABLE subsidy_round_rates (
    round_id         INTEGER NOT NULL
                     REFERENCES subsidy_rounds(round_id) ON DELETE CASCADE,

    crop             TEXT NOT NULL,

    -- Rupees per hectare. NUMERIC, never a floating point type: this is
    -- money the government is paying, and floats do not add up exactly.
    rate_per_hectare NUMERIC(12, 2) NOT NULL CHECK (rate_per_hectare > 0),

    PRIMARY KEY (round_id, crop)
);

-- ---------- 4. THE APPLICATION ----------

CREATE TABLE subsidy_applications (
    application_id SERIAL PRIMARY KEY,

    round_id INTEGER NOT NULL
             REFERENCES subsidy_rounds(round_id) ON DELETE RESTRICT,

    farmer_id    INTEGER NOT NULL
                 REFERENCES farmers(farmer_id) ON DELETE RESTRICT,
    land_id      INTEGER NOT NULL
                 REFERENCES lands(land_id) ON DELETE RESTRICT,
    land_crop_id INTEGER NOT NULL
                 REFERENCES land_crops(land_crop_id) ON DELETE RESTRICT,

    -- The registered size of that crop, copied at the moment of applying.
    --
    -- WHY COPY IT RATHER THAN LOOK IT UP LATER? Because the farmer may
    -- change their registered area afterwards, and the amount already paid
    -- must stay explainable against what was true when it was approved.
    area_ha DOUBLE PRECISION NOT NULL CHECK (area_ha > 0),

    -- Worked out at approval from area x the round's rate for this crop.
    -- NULL until then.
    amount_lkr NUMERIC(12, 2) CHECK (amount_lkr >= 0),

    farmer_note TEXT NOT NULL DEFAULT '',

    -- THE JOURNEY:
    --
    --   SUBMITTED  the farmer has applied
    --   APPROVED   the GN officer confirmed they qualify
    --   SENT       the department has released the money
    --   RECEIVED   the FARMER confirmed it arrived
    --   DISPUTED   the FARMER says it never arrived
    --   RESOLVED   the department settled a dispute
    --   REJECTED   turned down
    --
    -- The last four matter. Everything up to SENT is the government talking
    -- to itself; RECEIVED and DISPUTED are the farmer answering back, and
    -- without them "paid" means only that somebody ticked a box.
    status TEXT NOT NULL DEFAULT 'SUBMITTED',

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE subsidy_applications
    ADD CONSTRAINT subsidy_applications_status_check
    CHECK (status IN ('SUBMITTED', 'APPROVED', 'SENT', 'RECEIVED',
                      'DISPUTED', 'RESOLVED', 'REJECTED'));

-- ONE APPLICATION PER CROP PER ROUND.
--
-- Without this a farmer could apply four times for the same half hectare of
-- rice in the same season, and each application would look reasonable on its
-- own. The database refuses it outright, which is safer than hoping every
-- code path remembers to check.
ALTER TABLE subsidy_applications
    ADD CONSTRAINT subsidy_applications_one_per_crop_per_round
    UNIQUE (round_id, land_crop_id);

-- ---------- 5. THE AUDIT TRAIL ----------
--
-- One row every time an application changes hands, INCLUDING the farmer's
-- own confirmation or complaint. A dispute that left no record would be
-- worth nothing to the farmer who raised it.
--
-- Nothing in the code updates or deletes from this table.

CREATE TABLE subsidy_events (
    subsidy_event_id SERIAL PRIMARY KEY,

    application_id INTEGER NOT NULL
                   REFERENCES subsidy_applications(application_id)
                   ON DELETE CASCADE,

    -- Who acted. This may be a FARMER as well as an officer, which is what
    -- makes this workflow different from the relief one.
    actor_id INTEGER NOT NULL
             REFERENCES farmers(farmer_id) ON DELETE RESTRICT,

    from_status TEXT NOT NULL,
    to_status   TEXT NOT NULL,

    -- Why. Required on every rejection, on every dispute, and on resolving
    -- one. A decision about somebody's money with no reason attached is not
    -- a decision anybody can question later.
    note TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- INDEXES ----------
--
-- Each one backs a question a real screen asks on every load.

-- "my applications", on the farmer's phone
CREATE INDEX idx_subsidy_farmer
    ON subsidy_applications(farmer_id, created_at DESC);

-- "what is waiting for me" - the officer queues, and the dispute queue
CREATE INDEX idx_subsidy_status
    ON subsidy_applications(status, created_at);

-- "what has this round cost", for the department total
CREATE INDEX idx_subsidy_round
    ON subsidy_applications(round_id, status);

-- the history of one application
CREATE INDEX idx_subsidy_events_application
    ON subsidy_events(application_id, created_at DESC);

-- "which rounds is this division part of", asked by every farmer opening
-- the subsidy screen
CREATE INDEX idx_subsidy_round_divisions_division
    ON subsidy_round_divisions(gn_division);
