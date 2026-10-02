-- Store what the Data-Quality Agent said about a flagged reading.
--
-- WHY STORE IT?
--   - The farmer sees the explanation again when they reopen the reading
--   - We do not pay for a second API call
--   - An authority can review every case where the agent disagreed
--     with the rules, which is a useful signal

ALTER TABLE readings
    ADD COLUMN agent_note TEXT;

-- The agent's OWN verdict. We RECORD it, but quality_flag (from the
-- deterministic rules) still decides what is excluded from analysis.
--
-- If these two DISAGREE, that is useful - a human should look.
ALTER TABLE readings
    ADD COLUMN agent_verdict TEXT;
