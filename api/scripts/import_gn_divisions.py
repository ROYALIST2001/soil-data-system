"""Refresh the official DCS GN catalog; uses only Python's standard library."""
import argparse
import collections
from datetime import date
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

SOURCE_URL = "https://www.statistics.gov.lk/qlink/AdminDivCodes_Excel"
OUTPUT = Path(__file__).resolve().parents[1] / "internal/locationcatalog/data/gn_divisions.json"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def convert(content):
    with zipfile.ZipFile(io.BytesIO(content)) as workbook:
        strings = ["".join(item.itertext()) for item in ET.fromstring(workbook.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        rows = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml")).findall("s:sheetData/s:row", NS)
        divisions = []
        for row in rows[1:]:
            cells = {}
            for cell in row.findall("s:c", NS):
                value = cell.find("s:v", NS)
                value = value.text if value is not None else ""
                if cell.get("t") == "s" and value:
                    value = strings[int(value)]
                cells["".join(char for char in cell.get("r") if char.isalpha())] = " ".join(value.split())
            code = cells.get("B", "")
            if not code:
                continue
            if len(code) != 7 or not code.isdigit() or not all(cells.get(key) for key in ("F", "H", "K")):
                raise ValueError(f"Invalid GN row {row.get('r')}")
            divisions.append({"code": code, "name": cells["K"], "district_code": code[:2],
                              "district": cells["F"], "ds_division": cells["H"]})
        if len({item["code"] for item in divisions}) != len(divisions):
            raise ValueError("Duplicate GN codes in source workbook")
        if len({item["district_code"] for item in divisions}) != 25 or len(divisions) < 14000:
            raise ValueError("Incomplete nationwide workbook")
        modified = ET.fromstring(workbook.read("docProps/core.xml")).find("{http://purl.org/dc/terms/}modified")
        # Preserve existing name-based matching for globally unique GN names.
        # Duplicate names include their official code and location in the value.
        counts = collections.Counter(item["name"].casefold() for item in divisions)
        for item in divisions:
            item["value"] = item["name"] if counts[item["name"].casefold()] == 1 else (
                f"{item['name']} ({item['ds_division']}, {item['district']}) [{item['code']}]"
            )
        return {"source_url": SOURCE_URL, "source_sha256": hashlib.sha256(content).hexdigest(),
                "retrieved_date": date.today().isoformat(), "workbook_modified": modified.text if modified is not None else None,
                "divisions": sorted(divisions, key=lambda item: item["code"])}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Use an already-downloaded official XLSX")
    args = parser.parse_args()
    content = args.source.read_bytes() if args.source else urllib.request.urlopen(SOURCE_URL, timeout=45).read()
    catalog = convert(content)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(catalog['divisions'])} official GN divisions to {OUTPUT}")
