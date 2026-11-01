-- Disaster relief: compensation for farmers who lose a crop to a flood,
-- a drought or similar.
--
-- THE SHAPE OF THE PROBLEM.
-- Public money is being paid out on the strength of something nobody can go
-- back and look at. The flood recedes, the crop is cleared, and all that
-- remains is what somebody wrote down at the time.
--
-- So every table here is built around two ideas:
--   1. a claim cannot be made for a disaster that was never declared, and
--   2. every step is recorded with who did it and when.
--
-- Nothing in this design trusts a single person's say-so.

-- ---------- 1. THE DISASTER ITSELF ----------
--
-- WHY THE DEPARTMENT DECLARES THIS FIRST.
-- If each farmer simply typed "flood" and a date, there would be nothing to
-- check a claim against, no way to tell two claims from the same flood apart
-- from two unrelated ones, and no way to stop a claim for a disaster that
-- did not happen.
--
-- Declaring the event first turns "was there a flood?" from an argument into
-- a lookup.

CREATE TABLE disaster_events (
    event_id SERIAL PRIMARY KEY,

    -- A human name, like "Flood - Kurunegala - October 2026".
    name TEXT NOT NULL,

    disaster_type TEXT NOT NULL,

    -- WHEN the disaster happened. A claim is about this period, not about
    -- the day the farmer got round to filling in the form.
    started_on DATE NOT NULL,
    ended_on   DATE NOT NULL,

    description TEXT NOT NULL DEFAULT '',

    -- OPEN   - farmers may still submit claims
    -- CLOSED - the window has passed; existing claims still finish their
    --          journey, but no new ones are accepted
    --
    -- A relief scheme that never closes is one that can be claimed against
    -- years later, when nobody can check anything.
    status TEXT NOT NULL DEFAULT 'OPEN',

    -- WHO declared it. Deliberately NOT ON DELETE CASCADE: removing an
    -- officer account must never erase the record of a disaster they
    -- declared. RESTRICT makes the database refuse such a delete.
    declared_by INTEGER NOT NULL
                REFERENCES farmers(farmer_id) ON DELETE RESTRICT,

    declared_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE disaster_events
    ADD CONSTRAINT disaster_events_type_check
    CHECK (disaster_type IN
           ('FLOOD', 'DROUGHT', 'LANDSLIDE', 'CYCLONE', 'PEST', 'OTHER'));

ALTER TABLE disaster_events
    ADD CONSTRAINT disaster_events_status_check
    CHECK (status IN ('OPEN', 'CLOSED'));

-- A disaster cannot end before it started. Obvious, and exactly the sort of
-- thing a tired person types wrongly at 2am during an actual emergency.
ALTER TABLE disaster_events
    ADD CONSTRAINT disaster_events_dates_check
    CHECK (ended_on >= started_on);

-- ---------- 2. WHICH AREAS IT AFFECTED ----------
--
-- A flood in Kurunegala is not a reason to pay a farmer in Jaffna. Listing
-- the affected divisions is what makes a claim checkable: the farmer's land
-- is either in one of them or it is not.

CREATE TABLE disaster_event_divisions (
    event_id    INTEGER NOT NULL
                REFERENCES disaster_events(event_id) ON DELETE CASCADE,

    gn_division TEXT NOT NULL,

    -- The same division cannot be listed twice for one event.
    PRIMARY KEY (event_id, gn_division)
);

-- ---------- 3. HOW MUCH PER HECTARE ----------
--
-- WHY A RATE TABLE AND NOT A TYPED AMOUNT.
--
-- If an officer typed a figure for each claim, two farmers who lost the same
-- half hectare of rice could receive different amounts, and nobody could
-- explain why. A published rate per crop means the amount is worked out
-- rather than decided, and the same rule visibly applies to everybody.
--
-- The rates belong to the EVENT, not to the system as a whole, because
-- relief is announced per disaster and the figure for one flood is not the
-- figure for the next.

CREATE TABLE disaster_event_rates (
    event_id         INTEGER NOT NULL
                     REFERENCES disaster_events(event_id) ON DELETE CASCADE,

    -- One of the 10 crop keys the system knows, in lowercase.
    crop             TEXT NOT NULL,

    -- Rupees per hectare. NUMERIC, never a floating point type.
    --
    -- Floating point cannot hold 0.1 exactly, so sums of money drift. This
    -- is money the government is paying a farmer: it has to add up.
    rate_per_hectare NUMERIC(12, 2) NOT NULL CHECK (rate_per_hectare > 0),

    PRIMARY KEY (event_id, crop)
);

-- ---------- 4. THE CLAIM ----------

CREATE TABLE claims (
    claim_id SERIAL PRIMARY KEY,

    event_id INTEGER NOT NULL
             REFERENCES disaster_events(event_id) ON DELETE RESTRICT,

    -- Who lost the crop, and exactly which crop on which land. Linking to
    -- land_crop rather than just a crop name means the claimed area can be
    -- checked against what the farmer actually registered.
    farmer_id    INTEGER NOT NULL
                 REFERENCES farmers(farmer_id) ON DELETE RESTRICT,
    land_id      INTEGER NOT NULL
                 REFERENCES lands(land_id) ON DELETE RESTRICT,
    land_crop_id INTEGER NOT NULL
                 REFERENCES land_crops(land_crop_id) ON DELETE RESTRICT,

    -- What the FARMER says was lost.
    claimed_area_ha DOUBLE PRECISION NOT NULL CHECK (claimed_area_ha > 0),

    -- What the GN OFFICER confirmed after looking. NULL until verified.
    --
    -- Kept separate from the claimed area on purpose, exactly like a
    -- corrected soil reading: both numbers survive, so it is always visible
    -- what was asked for and what was agreed.
    verified_area_ha DOUBLE PRECISION CHECK (verified_area_ha >= 0),

    -- The money, worked out at approval from verified area x rate.
    -- NULL until the department approves.
    amount_lkr NUMERIC(12, 2) CHECK (amount_lkr >= 0),

    farmer_note TEXT NOT NULL DEFAULT '',

    -- THE JOURNEY:
    --
    --   SUBMITTED  the farmer has asked
    --   VERIFIED   the GN officer confirmed the loss on the ground
    --   APPROVED   the department released the money
    --   PAID       the farmer collected it
    --   REJECTED   turned down, at either officer stage
    --
    -- Each step is taken by a DIFFERENT person. Checking the loss and
    -- releasing public money are separate jobs on purpose: it is the
    -- division between them that makes the scheme hard to abuse.
    status TEXT NOT NULL DEFAULT 'SUBMITTED',

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE claims
    ADD CONSTRAINT claims_status_check
    CHECK (status IN
           ('SUBMITTED', 'VERIFIED', 'APPROVED', 'PAID', 'REJECTED'));

-- ONE CLAIM PER CROP PER DISASTER.
--
-- Without this, a farmer could claim four times for the same half hectare of
-- rice lost in the same flood - and each claim would look perfectly
-- reasonable on its own. The database refuses it outright, which is much
-- safer than hoping every code path remembers to check.
ALTER TABLE claims
    ADD CONSTRAINT claims_one_per_crop_per_event
    UNIQUE (event_id, land_crop_id);

-- ---------- 5. THE AUDIT TRAIL ----------
--
-- One row every time a claim changes hands. This is the part that makes the
-- payment accountable rather than merely recorded.
--
-- Nothing in the code updates or deletes from this table. An audit trail
-- that can be edited is not an audit trail.

CREATE TABLE claim_events (
    claim_event_id SERIAL PRIMARY KEY,

    claim_id INTEGER NOT NULL
             REFERENCES claims(claim_id) ON DELETE CASCADE,

    -- Who acted. RESTRICT again: an officer's decisions outlive their
    -- account.
    actor_id INTEGER NOT NULL
             REFERENCES farmers(farmer_id) ON DELETE RESTRICT,

    from_status TEXT NOT NULL,
    to_status   TEXT NOT NULL,

    -- Why. Required by the service on every rejection, and on any change to
    -- the area the farmer asked for.
    note TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- INDEXES ----------
--
-- Every one of these backs a question a real screen asks on every load.

-- "my claims" on the farmer's phone
CREATE INDEX idx_claims_farmer ON claims(farmer_id, created_at DESC);

-- "what is waiting for me" - the officer queues
CREATE INDEX idx_claims_status ON claims(status, created_at);

-- "everything from this disaster", for the department's total
CREATE INDEX idx_claims_event ON claims(event_id, status);

-- the history of one claim
CREATE INDEX idx_claim_events_claim
    ON claim_events(claim_id, created_at DESC);

-- "which disasters affect this division", asked by every farmer opening
-- the claim screen
CREATE INDEX idx_event_divisions_division
    ON disaster_event_divisions(gn_division);
