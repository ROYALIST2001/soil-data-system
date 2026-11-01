import { useEffect, useState } from "react";
import * as api from "./api";
import SortableTable, { type Column } from "./SortableTable";
import { formatMoney } from "./ClaimsPage";
import type { SubsidyApplication, SubsidyStatus } from "./types";

// THE SUBSIDY QUEUE.
//
// Both officers use this page and it means different things to each. A
// division officer opens it to find applications waiting to be approved. The
// department opens it to find approved ones waiting for money - and, more
// urgently, farmers saying the money never arrived.

interface Props {
  isDepartment: boolean;
  onOpen: (applicationId: number) => void;
}

export function SubsidyPill({ status }: { status: string }) {
  return <span className={`flag subsidy-${status}`}>{status}</span>;
}

// WHAT EACH TAB MEANS TO THE PERSON LOOKING AT IT.
//
// "SUBMITTED" is a database value, not a job. Naming the tab after the work
// it represents is the difference between a queue somebody clears and a list
// somebody ignores.
const TABS: { key: SubsidyStatus | ""; label: string; dept?: boolean }[] = [
  { key: "SUBMITTED", label: "Waiting to approve" },
  { key: "APPROVED", label: "Waiting for money" },
  { key: "SENT", label: "Money sent" },
  { key: "DISPUTED", label: "Not received", dept: true },
  { key: "RECEIVED", label: "Confirmed by farmer" },
  { key: "RESOLVED", label: "Settled" },
  { key: "REJECTED", label: "Rejected" },
  { key: "", label: "All" },
];

export default function SubsidiesPage({ isDepartment, onOpen }: Props) {
  // Each role lands on their own work: the division officer on what needs
  // approving, the department on what needs paying.
  const [tab, setTab] = useState<SubsidyStatus | "">(
    isDepartment ? "APPROVED" : "SUBMITTED"
  );

  const [applications, setApplications] = useState<SubsidyApplication[]>([]);
  const [disputed, setDisputed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // The disputes are fetched separately from whatever tab is showing,
        // so the warning below is always current. A farmer saying they were
        // not paid should not be invisible just because somebody is looking
        // at a different list.
        const [rows, disputes] = await Promise.all([
          api.getSubsidies(tab),
          api.getSubsidies("DISPUTED"),
        ]);

        if (cancelled) return;
        setApplications(rows);
        setDisputed(disputes.length);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load.");
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

  const columns: Column<SubsidyApplication>[] = [
    {
      key: "farmer",
      label: "Farmer",
      render: (a) => (
        <>
          <strong>{a.farmer_name}</strong>
          <div style={{ fontSize: 12, color: "#868e96" }}>{a.gn_division}</div>
        </>
      ),
      sortValue: (a) => a.farmer_name,
    },
    {
      key: "round",
      label: "Round",
      render: (a) => (
        <>
          {a.round_name}
          <div style={{ fontSize: 12, color: "#868e96" }}>{a.season}</div>
        </>
      ),
      sortValue: (a) => a.round_name,
    },
    {
      key: "crop",
      label: "Crop",
      render: (a) => (
        <>
          {a.crop}
          <div style={{ fontSize: 12, color: "#868e96" }}>{a.land_name}</div>
        </>
      ),
      sortValue: (a) => a.crop,
    },
    {
      key: "area",
      label: "Area",
      numeric: true,
      render: (a) => `${a.area_ha.toFixed(2)} ha`,
      sortValue: (a) => a.area_ha,
    },
    {
      key: "amount",
      label: "Amount",
      numeric: true,
      render: (a) => formatMoney(a.amount_lkr),
      sortValue: (a) => a.amount_lkr ?? -1,
    },
    {
      key: "status",
      label: "Status",
      render: (a) => <SubsidyPill status={a.status} />,
      sortValue: (a) => a.status,
    },
    {
      key: "date",
      label: "Applied",
      render: (a) => new Date(a.created_at).toLocaleDateString(),
      sortValue: (a) => a.created_at,
    },
  ];

  const visible = TABS.filter((t) => !t.dept || isDepartment);

  return (
    <div className="page">
      {error && <div className="error">{error}</div>}

      {/* A farmer saying they were never paid is the most important thing
          this screen can tell anybody. It goes at the top, in a colour that
          is hard to scroll past, and only for the people who can act. */}
      {isDepartment && disputed > 0 && tab !== "DISPUTED" && (
        <div className="error" style={{ display: "flex", alignItems: "center" }}>
          <span style={{ flex: 1 }}>
            <strong>
              {disputed} farmer{disputed === 1 ? "" : "s"}
            </strong>{" "}
            report that the money never reached them.
          </span>
          <button className="ghost" onClick={() => setTab("DISPUTED")}>
            Look at them
          </button>
        </div>
      )}

      <div className="card">
        <h2>Fertilizer subsidy applications</h2>
        <p className="sub">
          {isDepartment
            ? "Approved applications are waiting for you to send the money. " +
              "Once sent, the farmer confirms it arrived."
            : "Applications from your division waiting to be approved."}
        </p>

        <div className="tabs">
          {visible.map((t) => (
            <button
              key={t.key || "all"}
              className={tab === t.key ? "tab tab-on" : "tab"}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === "DISPUTED" && disputed > 0 && (
                <span className="tab-count">{disputed}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <SortableTable
            columns={columns}
            rows={applications}
            rowKey={(a) => a.application_id}
            onRowClick={(a) => onOpen(a.application_id)}
            initialSort="date"
            emptyMessage="Nothing in this list."
          />
        )}
      </div>
    </div>
  );
}
