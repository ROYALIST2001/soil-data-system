import { useEffect, useState } from "react";
import * as api from "./api";
import SortableTable, { type Column } from "./SortableTable";
import type { Claim, ClaimStatus, DisasterEvent } from "./types";

// THE CLAIM QUEUE.
//
// Both officers use this page, but it means different things to each.
// A division officer opens it to find claims waiting to be checked on the
// ground. The department opens it to find verified claims waiting for money.
//
// So the tab it STARTS on differs by role: there is no point showing the
// department a queue of work that is not theirs.

interface Props {
  isDepartment: boolean;
  onOpenClaim: (claimId: number) => void;
}

// Money, written the way a Sri Lankan form would write it.
export function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return "Rs " + value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`flag claim-${status}`}>{status}</span>;
}

const TABS: { key: ClaimStatus | ""; label: string }[] = [
  { key: "SUBMITTED", label: "Waiting to verify" },
  { key: "VERIFIED", label: "Waiting for money" },
  { key: "APPROVED", label: "Ready to collect" },
  { key: "PAID", label: "Paid" },
  { key: "REJECTED", label: "Rejected" },
  { key: "", label: "All" },
];

export default function ClaimsPage({ isDepartment, onOpenClaim }: Props) {
  // The department's job starts at VERIFIED; the division officer's at
  // SUBMITTED. Land each of them on their own work.
  const [tab, setTab] = useState<ClaimStatus | "">(
    isDepartment ? "VERIFIED" : "SUBMITTED"
  );

  const [claims, setClaims] = useState<Claim[]>([]);
  const [events, setEvents] = useState<DisasterEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [c, e] = await Promise.all([
          api.getClaims(tab),
          api.getDisasters(),
        ]);
        if (cancelled) return;
        setClaims(c);
        setEvents(e);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const columns: Column<Claim>[] = [
    {
      key: "farmer",
      label: "Farmer",
      render: (c) => (
        <>
          <strong>{c.farmer_name}</strong>
          <div style={{ fontSize: 12, color: "#868e96" }}>{c.gn_division}</div>
        </>
      ),
      sortValue: (c) => c.farmer_name,
    },
    {
      key: "disaster",
      label: "Disaster",
      render: (c) => c.event_name,
      sortValue: (c) => c.event_name,
    },
    {
      key: "crop",
      label: "Crop",
      render: (c) => (
        <>
          {c.crop}
          <div style={{ fontSize: 12, color: "#868e96" }}>{c.land_name}</div>
        </>
      ),
      sortValue: (c) => c.crop,
    },
    {
      key: "claimed",
      label: "Claimed",
      numeric: true,
      render: (c) => `${c.claimed_area_ha.toFixed(2)} ha`,
      sortValue: (c) => c.claimed_area_ha,
    },
    {
      key: "verified",
      label: "Verified",
      numeric: true,
      // Shown in orange when the officer confirmed LESS than was claimed,
      // because that is the row somebody may ask about later.
      render: (c) =>
        c.verified_area_ha === null ? (
          <span style={{ color: "#adb5bd" }}>—</span>
        ) : (
          <span
            className={
              c.verified_area_ha < c.claimed_area_ha ? "changed" : undefined
            }
          >
            {c.verified_area_ha.toFixed(2)} ha
          </span>
        ),
      sortValue: (c) => c.verified_area_ha ?? -1,
    },
    {
      key: "amount",
      label: "Amount",
      numeric: true,
      render: (c) => formatMoney(c.amount_lkr),
      sortValue: (c) => c.amount_lkr ?? -1,
    },
    {
      key: "status",
      label: "Status",
      render: (c) => <StatusPill status={c.status} />,
      sortValue: (c) => c.status,
    },
    {
      key: "date",
      label: "Submitted",
      render: (c) => new Date(c.created_at).toLocaleDateString(),
      sortValue: (c) => c.created_at,
    },
  ];

  const openEvents = events.filter((e) => e.status === "OPEN").length;
  const totalPaid = events.reduce((sum, e) => sum + e.total_amount, 0);

  return (
    <div className="page">
      {error && <div className="error">{error}</div>}

      <div className="stats">
        <div className="stat">
          <div className="value">{openEvents}</div>
          <div className="label">Disasters open for claims</div>
        </div>
        <div className="stat">
          <div className="value">{claims.length}</div>
          <div className="label">Claims in this list</div>
        </div>
        <div className="stat">
          <div className="value" style={{ fontSize: 19 }}>
            {formatMoney(totalPaid)}
          </div>
          <div className="label">Approved across all disasters</div>
        </div>
      </div>

      <div className="card">
        <h2>Compensation claims</h2>
        <p className="sub">
          {isDepartment
            ? "Verified claims are waiting for you to release the money."
            : "Claims from your division waiting to be checked on the ground."}
        </p>

        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key || "all"}
              className={tab === t.key ? "tab tab-on" : "tab"}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <SortableTable
            columns={columns}
            rows={claims}
            rowKey={(c) => c.claim_id}
            onRowClick={(c) => onOpenClaim(c.claim_id)}
            initialSort="date"
            emptyMessage="Nothing in this list."
          />
        )}
      </div>
    </div>
  );
}
