import { useEffect, useState } from "react";
import * as api from "./api";
import SortableTable, { FlagPill, type Column } from "./SortableTable";
import type { FarmerDetail, ReadingRow } from "./types";

interface Props {
  farmerId: number;
  canCorrect: boolean;
  onBack: () => void;
  onOpenReading: (readingId: number) => void;
}

// One farmer: who they are, what land they hold, and every soil test.
export default function FarmerPage({
  farmerId,
  canCorrect,
  onBack,
  onOpenReading,
}: Props) {

  const [detail, setDetail] = useState<FarmerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .getFarmer(farmerId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [farmerId]);

  if (error) {
    return (
      <div className="page">
        <div className="error">{error}</div>
        <button className="ghost" onClick={onBack}>
          Back to the farmer list
        </button>
      </div>
    );
  }

  if (!detail) {
    return <div className="loading">Loading...</div>;
  }

  const f = detail.farmer;

  const columns: Column<ReadingRow>[] = [
    {
      key: "date",
      label: "Date",
      render: (r) => new Date(r.created_at).toLocaleDateString(),
      sortValue: (r) => r.created_at,
    },
    { key: "land", label: "Land", render: (r) => r.land_name || "—",
      sortValue: (r) => r.land_name },
    { key: "crop", label: "Crop", render: (r) => r.crop,
      sortValue: (r) => r.crop },
    { key: "n", label: "N", numeric: true, render: (r) => r.n.toFixed(1),
      sortValue: (r) => r.n },
    { key: "p", label: "P", numeric: true, render: (r) => r.p.toFixed(1),
      sortValue: (r) => r.p },
    { key: "k", label: "K", numeric: true, render: (r) => r.k.toFixed(1),
      sortValue: (r) => r.k },
    { key: "ph", label: "pH", numeric: true, render: (r) => r.ph.toFixed(2),
      sortValue: (r) => r.ph },
    {
      key: "flag",
      label: "Quality",
      render: (r) => <FlagPill flag={r.quality_flag} />,
      sortValue: (r) => r.quality_flag,
    },
  ];

  return (
    <div className="page">
      <button className="ghost" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Back to the farmer list
      </button>

      <div className="card">
        <h2>{f.full_name}</h2>
        <p className="sub">
          Farmer #{f.farmer_id} · {f.gn_division}
        </p>

        <div className="two-col">
          <div>
            <div className="kv">
              <span className="k">NIC</span>
              <span>{f.nic}</span>
            </div>
            {/* Only shown when the server sent them, which is only to the
                officer who deals with this farmer directly. */}
            {f.mobile && (
              <div className="kv">
                <span className="k">Mobile</span>
                <span>{f.mobile}</span>
              </div>
            )}
            {f.email && (
              <div className="kv">
                <span className="k">Email</span>
                <span>{f.email}</span>
              </div>
            )}
          </div>

          <div>
            <div className="kv">
              <span className="k">Lands registered</span>
              <span>{f.land_count}</span>
            </div>
            <div className="kv">
              <span className="k">Total area</span>
              <span>{f.total_hectare.toFixed(2)} ha</span>
            </div>
            <div className="kv">
              <span className="k">Soil tests</span>
              <span>{f.reading_count}</span>
            </div>
            <div className="kv">
              <span className="k">Needing review</span>
              <span className={f.flagged_count ? "changed" : undefined}>
                {f.flagged_count}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Land and crops</h2>
        <p className="sub">What this farmer has registered.</p>

        {detail.lands.length === 0 ? (
          <div className="empty">No land registered yet.</div>
        ) : (
          detail.lands.map((land) => (
            <div key={land.land_id} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600 }}>
                {land.name}{" "}
                <span style={{ color: "#868e96", fontWeight: 400 }}>
                  — {land.size_ha.toFixed(2)} ha, {land.gn_division}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#40916c", marginTop: 3 }}>
                {land.crops.length === 0
                  ? "no crops"
                  : land.crops
                      .map((c) => `${c.crop} ${c.size_ha.toFixed(2)} ha`)
                      .join(" · ")}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Soil tests</h2>
        <p className="sub">
          {canCorrect
            ? "Click a reading to check or correct it."
            : "Corrections are made by the division officer."}
        </p>

        <SortableTable
          columns={columns}
          rows={detail.readings}
          rowKey={(r) => r.reading_id}
          onRowClick={canCorrect ? (r) => onOpenReading(r.reading_id) : undefined}
          initialSort="date"
          initialDescending
          emptyMessage="This farmer has not submitted a soil test yet."
        />
      </div>
    </div>
  );
}
