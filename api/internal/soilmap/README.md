# GN division soil map

Boundaries: [Sri Lanka NSDI GN Division layer](https://gisapps.nsdi.gov.lk/server/rest/services/Srilanka/Boundaries/MapServer/1).
Downloaded on 3 November 2026. The source currently contains **14,051 boundary
features across 25 districts**. See `data/manifest.json` for the exact retrieval
time, catalog checksum and unlinked names. Retrieval date is not a claim that
the boundaries incorporate every subsequent administrative change.

Refresh with `python api/scripts/import_gn_boundaries.py`. The standard-library
importer checks pagination and unique object IDs, preserves Polygon/MultiPolygon
geometry and holes, simplifies at 0.00015 degrees, and stores district-level gzip
files. Clients load one district at a time. Names are matched against the newer
DCS catalog using district and DS scope; a district-only name match is allowed
only when it is unique in both sources. Punctuation/case normalization and the
Monaragala/Moneragala district spelling are explicit. There is no fuzzy matching.
**664 boundary names remain unlinked** and are displayed without attributed soil
values. Differences between the datasets are never silently guessed.

Leaflet 1.9.4 JS/CSS are bundled with their BSD license in `assets/`, so the map
doesn't depend on a JavaScript CDN or Google Maps credentials. Background tiles
come directly from OpenStreetMap, with visible attribution; network access is
needed for those tiles. Boundaries and readings remain usable if tiles fail.

Map colours compare pH/N/P/K averages within the selected district. They are not
an overall crop suitability rating. Only accepted readings contribute, using
officer-corrected values when available. The UI shows sample count, latest test
date, limited-data notices and empty divisions. Public map responses contain
aggregate values and public boundaries, without farmer identities or GPS points.

GPS capture is retained behind `ENABLE_FIELD_LOCATION_CAPTURE` in the mobile
app and disabled by default. GN-mode readings store NULL coordinates, no GPS
anchor and the verified land's GN code as a snapshot. Land histories and quality
checks use land IDs. Existing GPS submissions remain supported, and GN-only
readings are excluded from the officer's exact-point map.

Migration 013 is idempotent and also runs after catalog initialization at API
startup, upgrading existing database volumes. Historical GN backfill links only
unambiguous saved land values and doesn't rewrite an existing snapshot.
