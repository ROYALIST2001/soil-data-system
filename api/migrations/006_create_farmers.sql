-- Table: farmers (one account for one real person).
--
-- WHY THIS TABLE EXISTS:
-- Until now the system stored WHERE a soil test came from, but never WHO
-- sent it. Land, crops, harvests and yield forecasts all have to belong to
-- somebody, so the farmer account is the foundation everything else sits on.
--
-- THE NIC IS THE LOGIN NAME.
-- Every Sri Lankan already has a National Identity Card number, it is unique
-- to one person by law, and a farmer will not forget it. That makes it a
-- better login name than an email address, which many farmers rarely use.

CREATE TABLE farmers (
    -- SERIAL PRIMARY KEY means the DATABASE makes the unique id itself
    -- (1, 2, 3...). We never calculate it in Go. Same as reading_id
    -- and anchor_id already do.
    farmer_id     SERIAL PRIMARY KEY,

    -- The National Identity Card number. This is the login name.
    --
    -- UNIQUE is doing real work here: it is the database itself refusing
    -- a second account on the same NIC. Even if our Go check had a bug,
    -- or two people pressed Sign Up at the same instant, the database
    -- still says no. Never trust only the application layer.
    --
    -- UNIQUE also creates an index for free, so logging in by NIC is fast
    -- without us adding one.
    nic           TEXT NOT NULL UNIQUE,

    full_name     TEXT NOT NULL,

    -- The Grama Niladhari division: the smallest administrative area in
    -- Sri Lanka, below the district. It is how a farmer actually describes
    -- where they live, and later it lets an officer find farmers at a much
    -- finer level than the district.
    gn_division   TEXT NOT NULL,

    mobile        TEXT NOT NULL,

    -- Email is NOT unique on purpose. Families often share one address,
    -- and refusing the second person would be wrong.
    email         TEXT NOT NULL,

    -- The password is NEVER stored. This holds a bcrypt HASH of it.
    --
    -- A hash cannot be turned back into the password. So if this database
    -- is ever stolen, the passwords are still not readable. This is not
    -- optional care, it is the minimum standard.
    password_hash TEXT NOT NULL,

    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
