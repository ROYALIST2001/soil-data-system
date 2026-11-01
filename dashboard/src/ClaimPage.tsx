import { useEffect, useState } from "react";
import * as api from "./api";
import { StatusPill, formatMoney } from "./ClaimsPage";
import type { ClaimDetail } from "./types";

interface Props {
  claimId: number;
  isDepartment: boolean;
  onBack: () => void;
}

// ONE CLAIM, and the decision an officer has to make about it.
//
// Which buttons appear depends on BOTH the claim's stage and the officer's
// role. The server decides this too and would refuse anything else - but
// showing a button that cannot work is its own kind of lie, so the screen
// offers only what this person can actually do right now.
export default function ClaimPage({ claimId, isDepartment, onBack }: Props) {
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [verifiedArea, setVerifiedArea] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;

    api
      .getClaim(claimId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        // Start the box at what the farmer claimed. The common case is that
        // the officer agrees, and pre-filling saves them retyping it.
        setVerifiedArea(String(d.claim.claimed_area_ha));
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [claimId]);

  async function run(
    step: "verify" | "approve" | "reject" | "pay",
    body: { note: string; verified_area_ha?: number }
  ) {
    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      const updated = await api.claimStep(claimId, step, body);
      setDetail(updated);
      setNote("");
      setSuccess(
        step === "verify" ? "Verified. It now goes to the department."
          : step === "approve" ? "Approved. The farmer can collect the money."
          : step === "reject" ? "Rejected. The farmer will see your reason."
          : "Marked as collected."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <div className="page">
        {error ? (
          <div className="error">{error}</div>
        ) : (
          <div className="loading">Loading...</div>
        )}
        <button className="ghost" onClick={onBack}>Back</button>
      </div>
    );
  }

  const c = detail.claim;

  // What this officer may do, at this stage.
  const canVerify = !isDepartment && c.status === "SUBMITTED";
  const canReject =
    (!isDepartment && c.status === "SUBMITTED") ||
    (isDepartment && c.status === "VERIFIED");
  const canApprove = isDepartment && c.status === "VERIFIED";
  const canPay = isDepartment && c.status === "APPROVED";

  const nothingToDo = !canVerify && !canReject && !canApprove && !canPay;

  // What the money WOULD be, shown before the department commits to it.
  const typedArea = parseFloat(verifiedArea);
  const preview =
    c.rate_per_hectare !== null && c.verified_area_ha !== null
      ? c.verified_area_ha * c.rate_per_hectare
      : null;

  return (
    <div className="page">
      <button className="ghost" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Back to claims
      </button>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="card">
        <h2>
          Claim #{c.claim_id} <StatusPill status={c.status} />
        </h2>
        <p className="sub">{c.event_name}</p>

        <div className="two-col">
          <div>
            <div className="kv">
              <span className="k">Farmer</span>
              <span><strong>{c.farmer_name}</strong></span>
            </div>
            <div className="kv">
              <span className="k">Division</span><span>{c.gn_division}</span>
            </div>
            {c.farmer_phone && (
              <div className="kv">
                <span className="k">Mobile</span><span>{c.farmer_phone}</span>
              </div>
            )}
            <div className="kv">
              <span className="k">Land</span><span>{c.land_name}</span>
            </div>
            <div className="kv">
              <span className="k">Crop</span><span>{c.crop}</span>
            </div>
          </div>

          <div>
            <div className="kv">
              <span className="k">Registered area</span>
              <span>{c.registered_area_ha.toFixed(2)} ha</span>
            </div>
            <div className="kv">
              <span className="k">Claimed as lost</span>
              <span><strong>{c.claimed_area_ha.toFixed(2)} ha</strong></span>
            </div>
            <div className="kv">
              <span className="k">Verified lost</span>
              <span className={
                c.verified_area_ha !== null &&
                c.verified_area_ha < c.claimed_area_ha ? "changed" : undefined
              }>
                {c.verified_area_ha === null
                  ? "not yet checked"
                  : `${c.verified_area_ha.toFixed(2)} ha`}
              </span>
            </div>
            <div className="kv">
              <span className="k">Rate for this crop</span>
              <span>
                {c.rate_per_hectare === null
                  ? "—"
                  : `${formatMoney(c.rate_per_hectare)} per ha`}
              </span>
            </div>
            <div className="kv">
              <span className="k">Amount</span>
              <span><strong>{formatMoney(c.amount_lkr)}</strong></span>
            </div>
          </div>
        </div>

        {c.farmer_note && (
          <div style={{ marginTop: 16, padding: 12, background: "#f8f9fa",
                        borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
            <strong>What the farmer wrote:</strong> {c.farmer_note}
          </div>
        )}
      </div>

      {/* ---------- VERIFY, for the division officer ---------- */}
      {canVerify && (
        <div className="card">
          <h2>Check the loss</h2>
          <p className="sub">
            Enter how much you actually found was lost. You may confirm less
            than the farmer claimed, but not more. If you reduce it, say why —
            the farmer will see your reason.
          </p>

          <div className="controls">
            <div className="field">
              <label htmlFor="area">Verified area lost — hectares</label>
              <input
                id="area"
                type="number"
                step="any"
                style={{ width: 150 }}
                value={verifiedArea}
                onChange={(e) => setVerifiedArea(e.target.value)}
              />
              <span style={{ fontSize: 11, color: "#868e96" }}>
                farmer claimed {c.claimed_area_ha.toFixed(2)} ha
              </span>
            </div>

            <div className="field" style={{ flex: 1, minWidth: 320 }}>
              <label htmlFor="note">What you found</label>
              <input
                id="note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Visited 14 October, lower 1.2 ha were under water"
              />
            </div>
          </div>

          {/* Show the money this verification would lead to, before the
              officer commits to it. */}
          {Number.isFinite(typedArea) && c.rate_per_hectare !== null && (
            <p className="sub" style={{ marginBottom: 14 }}>
              This would come to{" "}
              <strong>{formatMoney(typedArea * c.rate_per_hectare)}</strong>{" "}
              once the department approves it.
            </p>
          )}

          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run("verify", {
                note,
                verified_area_ha: parseFloat(verifiedArea),
              })
            }
          >
            {busy ? "Saving..." : "Confirm this loss"}
          </button>
        </div>
      )}

      {/* ---------- APPROVE, for the department ---------- */}
      {canApprove && (
        <div className="card">
          <h2>Release the money</h2>
          <p className="sub">
            The division officer confirmed{" "}
            <strong>{c.verified_area_ha?.toFixed(2)} hectares</strong>. At{" "}
            {formatMoney(c.rate_per_hectare)} per hectare that comes to{" "}
            <strong>{formatMoney(preview)}</strong>. The amount is worked out
            from the rate — nobody types it.
          </p>

          <div className="controls">
            <div className="field" style={{ flex: 1, minWidth: 320 }}>
              <label htmlFor="anote">Note (optional)</label>
              <input
                id="anote"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Approved under the October flood relief scheme"
              />
            </div>

            <button
              className="primary"
              disabled={busy}
              onClick={() => run("approve", { note })}
            >
              Approve {formatMoney(preview)}
            </button>
          </div>
        </div>
      )}

      {/* ---------- PAID ---------- */}
      {canPay && (
        <div className="card">
          <h2>Mark as collected</h2>
          <p className="sub">
            Record that the farmer has received{" "}
            <strong>{formatMoney(c.amount_lkr)}</strong>.
          </p>

          <div className="controls">
            <div className="field" style={{ flex: 1, minWidth: 320 }}>
              <label htmlFor="pnote">Where and how (optional)</label>
              <input
                id="pnote"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Collected at the divisional secretariat"
              />
            </div>

            <button
              className="primary"
              disabled={busy}
              onClick={() => run("pay", { note })}
            >
              Mark as collected
            </button>
          </div>
        </div>
      )}

      {/* ---------- REJECT ---------- */}
      {canReject && (
        <div className="card">
          <h2>Reject this claim</h2>
          <p className="sub">
            A reason is required, and the farmer will see it. If the problem
            is something they can fix, say so — they can claim again.
          </p>

          <div className="controls">
            <div className="field" style={{ flex: 1, minWidth: 320 }}>
              <label htmlFor="rnote">Reason (at least 10 characters)</label>
              <input
                id="rnote"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. This field was not affected by the flood"
              />
            </div>

            <button
              className="ghost"
              style={{ color: "#c92a2a", borderColor: "#ffc9c9" }}
              disabled={busy}
              onClick={() => run("reject", { note })}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {nothingToDo && (
        <div className="card">
          <p className="sub" style={{ margin: 0 }}>
            {c.status === "PAID"
              ? "This claim is finished. The farmer has collected the money."
              : c.status === "REJECTED"
              ? "This claim was rejected. See the history below for the reason."
              : isDepartment
              ? "This claim is waiting for the division officer to check it."
              : "This claim is with the department now."}
          </p>
        </div>
      )}

      <div className="card">
        <h2>History</h2>
        <p className="sub">
          Every step, with who took it. Nothing here can be edited or deleted.
        </p>

        {detail.history.length === 0 ? (
          <div className="empty">
            The farmer has submitted this and nothing has happened yet.
          </div>
        ) : (
          <ul className="history">
            {detail.history.map((h) => (
              <li key={h.claim_event_id}>
                <StatusPill status={h.from_status} /> →{" "}
                <StatusPill status={h.to_status} />
                <br />
                <span style={{ color: "#868e96" }}>
                  {h.actor_name} · {new Date(h.created_at).toLocaleString()}
                </span>
                {h.note && (
                  <>
                    <br />
                    <em>{h.note}</em>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
