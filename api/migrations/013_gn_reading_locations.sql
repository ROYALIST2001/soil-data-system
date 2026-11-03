-- Also applied at API startup so existing database volumes are upgraded.
ALTER TABLE readings ALTER COLUMN raw_lat DROP NOT NULL;
ALTER TABLE readings ALTER COLUMN raw_lng DROP NOT NULL;
ALTER TABLE readings ADD COLUMN IF NOT EXISTS location_source TEXT NOT NULL DEFAULT 'gps';
ALTER TABLE readings ADD COLUMN IF NOT EXISTS gn_division_code TEXT;
CREATE INDEX IF NOT EXISTS readings_gn_division ON readings(gn_division_code);
CREATE INDEX IF NOT EXISTS readings_land_history ON readings(land_id, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'readings_location_source_check'
      AND conrelid = 'readings'::regclass) THEN
    ALTER TABLE readings ADD CONSTRAINT readings_location_source_check CHECK (
      (location_source = 'gps' AND raw_lat IS NOT NULL AND raw_lng IS NOT NULL) OR
      (location_source = 'gn_division' AND raw_lat IS NULL AND raw_lng IS NULL
        AND gn_division_code IS NOT NULL)
    );
  END IF;
END $$;
