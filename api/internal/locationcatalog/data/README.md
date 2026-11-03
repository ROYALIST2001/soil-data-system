# Official GN division catalog

Source: Sri Lanka Department of Census and Statistics,
[Administrative Division Codes](https://www.statistics.gov.lk/qlink/AdminDivCode),
[Excel download](https://www.statistics.gov.lk/qlink/AdminDivCodes_Excel).

The bundled workbook was downloaded on 3 November 2026; its embedded modification
timestamp is 27 March 2026. It contains **14,008 coded GN entries across 25 districts**.
Six blank spreadsheet rows are excluded. This is the complete coded list in that
published workbook; administrative changes after that version need a catalog refresh.
The JSON records its source SHA-256 and workbook timestamp for reproducibility.

GN identifiers are the seven-digit DCS census codes. District reference codes are
their first two digits; these are independent of the existing three demonstration
district polygons and internal district IDs used by soil analytics.

Refresh from the official source with Python (standard library only):

```powershell
python api/scripts/import_gn_divisions.py
# Or use a downloaded official workbook:
python api/scripts/import_gn_divisions.py --source C:\path\to\AdminDivCodes.xlsx
```

The API embeds the versioned JSON and installs/updates its PostgreSQL reference
tables in a transaction at startup, including on existing database volumes.
District-specific names are fetched once and searched locally in the clients;
the API also supports literal case-insensitive `q` prefix searches from one character.

Existing application records and officer scopes are preserved. Globally unique
official names retain their existing name values. Names shared by multiple GN
divisions include the DS name, district and census code in their option value,
preventing different places from being grouped together. A legacy name that is
ambiguous or absent from the official catalog requires an explicit new selection
when adding land; it is never automatically assigned to a guessed district.
