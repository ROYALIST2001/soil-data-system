-- Officer corrections, without ever destroying what the farmer entered.
--
-- THE RULE THIS MIGRATION EXISTS TO ENFORCE:
-- the farmer's original numbers are never overwritten.
--
-- WHY NOT JUST UPDATE THE ROW?
-- Because then nobody can tell a correction from an original, there is no
-- way to undo a mistaken one, and there is no record of who changed what.
-- A government system that silently rewrites a citizen's submission, with
-- no trace, is not a system anybody should trust.
--
-- So a correction is stored BESIDE the original. The original columns are
-- read-only from the day the farmer submits them.

-- ---------- THE CORRECTED VALUES ----------
--
-- NULL means "not corrected". Every query that wants the value to USE reads
-- COALESCE(corrected_n, n): the correction if there is one, otherwise what
-- the farmer sent.
--
-- One column per nutrient rather than a single JSON blob, so an officer can
-- correct the pH alone and leave the rest exactly as the farmer entered it.

ALTER TABLE readings ADD COLUMN corrected_n  DOUBLE PRECISION;
ALTER TABLE readings ADD COLUMN corrected_p  DOUBLE PRECISION;
ALTER TABLE readings ADD COLUMN corrected_k  DOUBLE PRECISION;
ALTER TABLE readings ADD COLUMN corrected_ph DOUBLE PRECISION;

-- ---------- THE OFFICER'S FLAG ----------
--
-- quality_flag stays exactly as the Phase 4 rules decided. This is a
-- SEPARATE column holding a human's decision.
--
-- WHY NOT OVERWRITE quality_flag? Because then you could never answer
-- "did the rules catch this, or did a person?" - which is the only way to
-- find out whether the rules are any good. Keeping both means the rules can
-- be judged against human verdicts later.
--
-- The flag the rest of the system acts on is:
--   COALESCE(officer_flag, quality_flag)
-- A person overrules the rules, and the rules decide until one does.
ALTER TABLE readings ADD COLUMN officer_flag TEXT;

ALTER TABLE readings
    ADD CONSTRAINT readings_officer_flag_check
    CHECK (officer_flag IS NULL
           OR officer_flag IN ('OK', 'FLAGGED', 'QUARANTINED'));

-- ---------- THE AUDIT TRAIL ----------
--
-- One row per change. This is the part that makes a correction accountable
-- rather than just a different number.
--
-- Note there is no UPDATE or DELETE on this table anywhere in the code. An
-- audit trail you can edit is not an audit trail.

CREATE TABLE reading_corrections (
    correction_id SERIAL PRIMARY KEY,

    reading_id INTEGER NOT NULL
               REFERENCES readings(reading_id) ON DELETE CASCADE,

    -- WHO made the change. No ON DELETE CASCADE here on purpose: if an
    -- officer account is ever removed we must NOT silently erase the record
    -- of what they did. ON DELETE RESTRICT makes the database refuse to
    -- delete an officer who has corrections to their name.
    officer_id INTEGER NOT NULL
               REFERENCES farmers(farmer_id) ON DELETE RESTRICT,

    -- What changed. Text, so one table covers nutrients and flags alike.
    -- NULL old_value means the field had no value before.
    field_name TEXT NOT NULL,
    old_value  TEXT,
    new_value  TEXT,

    -- WHY. Required by the service, never blank. A correction without a
    -- reason is indistinguishable from tampering six months later.
    reason TEXT NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Showing the history of one reading, newest first.
CREATE INDEX idx_corrections_reading
    ON reading_corrections(reading_id, created_at DESC);

-- Showing everything one officer has changed.
CREATE INDEX idx_corrections_officer
    ON reading_corrections(officer_id, created_at DESC);
