import { useEffect, useState } from "react";
import * as api from "./api";
import SortableTable, { FlagPill, type Column } from "./SortableTable";
import SoilMap from "./SoilMap";
import type { DivisionSummary, FarmerSummary, MapPoint } from "./types";
import GNDivisionPicker from "./GNDivisionPicker";

// THE DEPARTMENT DASHBOARD.
//
// Every farmer in the country, filtered and sorted by Grama Niladhari
// division, with a map of where the soil readings came from.
//
// What it deliberately does NOT do: edit anything. A department officer
// oversees; the division officer who knows the farmer corrects. Keeping the
// two apart means a national account cannot quietly change a number in a
// village it has never visited.

interface Props {
  // A division officer uses this same page, locked to their own division.
  // The server enforces that regardless; this only decides what we show.
  lockedDivision: string | null;
  onOpenFarmer: (farmerId: number) => void;
  onOpenReading: (readingId: number) => void;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default function DepartmentPage({
  lockedDivision,
  onOpenFarmer,
  onOpenReading,
}: Props) {

  const [divisions, setDivisions] = useState<DivisionSummary[]>([]);
  const [division, setDivision] = useState(lockedDivision ?? "");
  const [farmers, setFarmers] = useState<FarmerSummary[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load everything whenever the chosen division changes.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // All three at once rather than one after another. They do not
        // depend on each other, so waiting for each in turn would make the
        // screen three times slower for no reason.
        const [d, f, p] = await Promise.all([
          api.getDivisions(),
          api.getFarmers(division),
          api.getMapPoints(division),
        ]);

        if (cancelled) return;

        setDivisions(d);
        setFarmers(f);
        setPoints(p);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load the data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [division]);

  const columns: Column<FarmerSummary>[] = [
    {
      key: "name",
      label: "Farmer",
      render: (f) => <strong>{f.full_name}</strong>,
      sortValue: (f) => f.full_name,
    },
    {
      key: "nic",
      label: "NIC",
      render: (f) => <span style={{ color: "#868e96" }}>{f.nic}</span>,
      sortValue: (f) => f.nic,
    },
    {
      key: "division",
      label: "GN Division",
      render: (f) => f.gn_division,
      sortValue: (f) => f.gn_division,
    },
    {
      key: "lands",
      label: "Lands",
      numeric: true,
      render: (f) => f.land_count,
      sortValue: (f) => f.land_count,
    },
    {
      key: "hectares",
      label: "Hectares",
      numeric: true,
      render: (f) => f.total_hectare.toFixed(2),
      sortValue: (f) => f.total_hectare,
    },
    {
      key: "readings",
      label: "Readings",
      numeric: true,
      render: (f) => f.reading_count,
      sortValue: (f) => f.reading_count,
    },
    {
      key: "flagged",
      label: "Flagged",
      numeric: true,
      // The column an officer sorts by to find who needs attention, so a
      // zero is greyed out and anything above it stands out.
      render: (f) =>
        f.flagged_count > 0 ? (
          <span style={{ color: "#e8842c", fontWeight: 700 }}>
            {f.flagged_count}
          </span>
        ) : (
          <span style={{ color: "#adb5bd" }}>0</span>
        ),
      sortValue: (f) => f.flagged_count,
    },
    {
      key: "last",
      label: "Last Test",
      render: (f) => formatDate(f.last_reading_at),
      sortValue: (f) => f.last_reading_at ?? "",
    },
  ];

  const totalHectares = farmers.reduce((sum, f) => sum + f.total_hectare, 0);
  const totalFlagged = farmers.reduce((sum, f) => sum + f.flagged_count, 0);

  return (
    <div className="page" aria-busy={loading}>
      {error && <div className="error">{error}</div>}

      <div className="stats">
        <div className="stat">
          <div className="value">{farmers.length}</div>
          <div className="label">Registered farmers</div>
        </div>
        <div className="stat">
          <div className="value">{totalHectares.toFixed(1)}</div>
          <div className="label">Hectares registered</div>
        </div>
        <div className="stat">
          <div className="value">{points.length}</div>
          <div className="label">Soil readings</div>
        </div>
        <div className="stat">
          <div className="value" style={{ color: totalFlagged ? "#e8842c" : undefined }}>
            {totalFlagged}
          </div>
          <div className="label">Readings needing review</div>
        </div>
      </div>

      <div className="card">
        <h2>Farmers</h2>
        <p className="sub">
          Click a column heading to sort. Click a farmer to see their land and
          soil tests.
        </p>

        <div className="controls">
          {lockedDivision === null ? <GNDivisionPicker values={division ? [division] : []} onChange={(values) => setDivision(values[0] ?? "")} /> : <div className="field">
            <label htmlFor="division">Grama Niladhari division</label>
            <select
              id="division"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              // A division officer cannot change this. The server would
              // ignore it anyway; disabling it avoids suggesting otherwise.
              disabled={lockedDivision !== null}
            >
              <option value="">All divisions</option>
              {divisions.map((d) => (
                <option key={d.division} value={d.division}>
                  {d.division} ({d.farmer_count})
                </option>
              ))}
            </select>
          </div>}
        </div>

        {loading ? <div className="loading">Loading farmers...</div> : <SortableTable
          columns={columns}
          rows={farmers}
          rowKey={(f) => f.farmer_id}
          onRowClick={(f) => onOpenFarmer(f.farmer_id)}
          initialSort="flagged"
          initialDescending
          emptyMessage={
            division
              ? `No farmers registered in ${division} yet.`
              : "No farmers have registered yet."
          }
        />}
      </div>

      <div className="card">
        <h2>Soil map</h2>
        <p className="sub">
          Every soil reading, coloured by its quality check. Click a dot to
          open that reading.
        </p>

        <SoilMap points={points} onPointClick={onOpenReading} />

        {points.length === 0 && (
          <div className="empty">No soil readings to show yet.</div>
        )}
      </div>

      {/* An honest note, rather than letting a thin map look like national
          coverage. */}
      <p className="hint" style={{ color: "#868e96", fontSize: 12 }}>
        Readings submitted before farmer accounts existed have no owner and
        appear without a name or division. <FlagPill flag="OK" /> means the
        quality rules accepted the reading.
      </p>
    </div>
  );
}
