"""Download simplified NSDI polygons and link only unambiguous DCS catalog names."""
import collections
import concurrent.futures
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "internal/soilmap/data"
SOURCE = "https://gisapps.nsdi.gov.lk/server/rest/services/Srilanka/Boundaries/MapServer/1"
FIELDS = "objectid,gnd_name,gnd_name_census,district_name,ds_division_name"


def normalize(value):
    result = re.sub("[^a-z0-9]", "", (value or "").lower())
    return "moneragala" if result == "monaragala" else result


def query(**params):
    url = SOURCE + "/query?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                result = json.load(response)
            if "error" in result:
                raise RuntimeError(result["error"])
            return result
        except Exception:
            if attempt == 3:
                raise
            time.sleep(attempt + 1)


def main():
    catalog_file = ROOT / "internal/locationcatalog/data/gn_divisions.json"
    catalog = json.loads(catalog_file.read_text(encoding="utf-8"))["divisions"]
    scoped, local = collections.defaultdict(list), collections.defaultdict(list)
    districts = {}
    for division in catalog:
        district = normalize(division["district"])
        scoped[(district, normalize(division["ds_division"]), normalize(division["name"]))].append(division)
        local[(district, normalize(division["name"]))].append(division)
        districts[district] = division["district_code"]

    count = query(where="1=1", returnCountOnly="true", f="json")["count"]

    def page(offset):
        return query(where="1=1", outFields=FIELDS, returnGeometry="true", outSR=4326,
                     maxAllowableOffset=0.00015, geometryPrecision=5, orderByFields="objectid",
                     resultOffset=offset, resultRecordCount=500, f="geojson")["features"]

    features = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for batch in pool.map(page, range(0, count, 500)):
            features.extend(batch)
    if len(features) != count or len({f["properties"]["objectid"] for f in features}) != count:
        raise RuntimeError("Incomplete or overlapping NSDI pagination; no files written")

    # A district-only fallback also has to be unique in the boundary dataset.
    source_names = collections.defaultdict(set)
    for feature in features:
        p = feature["properties"]
        for name in (p["gnd_name"], p["gnd_name_census"]):
            source_names[(normalize(p["district_name"]), normalize(name))].add(p["objectid"])

    grouped = collections.defaultdict(list)
    unmatched = []
    for feature in features:
        p = feature["properties"]
        district = normalize(p["district_name"])
        candidates = []
        for name in (p["gnd_name_census"], p["gnd_name"]):
            candidates = scoped.get((district, normalize(p["ds_division_name"]), normalize(name)), [])
            if len(candidates) == 1:
                break
        if len(candidates) != 1:
            for name in (p["gnd_name_census"], p["gnd_name"]):
                key = (district, normalize(name))
                candidates = local.get(key, []) if len(source_names[key]) == 1 else []
                if len(candidates) == 1:
                    break
        division = candidates[0] if len(candidates) == 1 else None
        geometry = feature.get("geometry")
        if not geometry or geometry["type"] not in ("Polygon", "MultiPolygon"):
            raise RuntimeError("Missing or unsupported GN geometry")
        clean = {"type": "Feature", "geometry": geometry, "properties": {
            "boundary_id": p["objectid"], "code": division["code"] if division else "",
            "name": division["name"] if division else p["gnd_name"],
            "district_code": districts[district], "district": p["district_name"].title(),
            "ds_division": p["ds_division_name"].title(),
        }}
        grouped[districts[district]].append(clean)
        if not division:
            unmatched.append({k: p[k] for k in ("objectid", "gnd_name", "district_name", "ds_division_name")})

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for district, items in sorted(grouped.items()):
        payload = json.dumps({"type": "FeatureCollection", "features": items}, separators=(",", ":")).encode()
        (OUTPUT / (district + ".geojson.gz")).write_bytes(gzip.compress(payload, mtime=0))
    manifest = {
        "source": SOURCE, "retrieved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "simplification_degrees": 0.00015, "coordinate_precision": 5,
        "catalog_sha256": hashlib.sha256(catalog_file.read_bytes()).hexdigest(),
        "boundary_count": count, "matched_boundaries": count - len(unmatched),
        "unmatched_boundaries": unmatched,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {count} polygons in {len(grouped)} districts; {len(unmatched)} names left unlinked.")


if __name__ == "__main__":
    main()
