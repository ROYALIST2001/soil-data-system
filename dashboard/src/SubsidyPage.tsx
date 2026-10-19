import { useEffect, useState } from "react";
import * as api from "./api";
import { formatMoney } from "./ClaimsPage";
import { SubsidyPill } from "./SubsidiesPage";
import type { SubsidyDetail } from "./types";

interface Props {
  applicationId: number;
  isDepartment: boolean;
  onBack: () => void;
}

// ONE SUBSIDY APPLICATION, and the decision an officer has to make about it.
//
// Which actions appear depends on both the stage and the role. The server
// decides this too and would refuse anything else, but offering a button
// that cannot work is its own kind of lie.
export default function SubsidyPage({
  applicationId,
  isDepartment,
  onBack,
}: Props) {
  const [detail, setDetail] = useState<SubsidyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;

    api
      .getSubsidy(applicationId)
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
  }, [applicationId]);

  async function run(
    step: "approve" | "send" | "reject" | "resolve",
    message: string
  ) {
    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      const updated = await api.subsidyStep(applicationId, step, note);
      setDetail(updated);
      setNote("");
      setSuccess(message);
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

  const a = detail.application;

  // What this officer may do at this stage.
  const canApprove = !isDepartment && a.status === "SUBMITTED";
  const canReject =
    (!isDepartment && a.status === "SUBMITTED") ||
    (isDepartment && a.status === "APPROVED");
  const canSend =
    isDepartment && (a.status === "APPROVED" || a.status === "DISPUTED");
  const canResolve = isDepartment && a.status === "DISPUTED";

  const nothingToDo = !canApprove && !canReject && !canSend && !canResolve;

  // What the money WOULD be, before the officer commits to it.
  const preview =
    a.amount_lkr ??
    (a.rate_per_hectare !== null ? a.area_ha * a.rate_per_hectare : null);

  return (
    <div className="page">
      <button className="ghost" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Back to applications
      </button>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* The farmer's complaint, right at the top where it cannot be
          missed. Everything else on this screen is secondary while this
          is true. */}
      {a.status === "DISPUTED" && (
        <div className="error">
          <strong>{a.farmer_name} says this money never reached them.</strong>
          <br />
          {detail.history.find((h) => h.to_status === "DISPUTED")?.note}
        </div>
      )}

      <div className="card">
        <h2>
          Application #{a.application_id} <SubsidyPill status={a.status} />
        </h2>
        <p className="sub">
          {a.round_name} · {a.season} season
        </p>

        <div className="two-col">
          <div>
            <div className="kv">
              <span className="k">Farmer</span>
              <span><strong>{a.farmer_name}</strong></span>
            </div>
            <div className="kv">
              <span className="k">Division</span><span>{a.gn_division}</span>
            </div>
            {a.farmer_phone && (
              <div className="kv">
                <span className="k">Mobile</span><span>{a.farmer_phone}</span>
              </div>
            )}
            <div className="kv">
              <span className="k">Land</span><span>{a.land_name}</span>
            </div>
            <div className="kv">
              <span className="k">Crop</span><span>{a.crop}</span>
            </div>
          </div>

          <div>
            <div className="kv">
              <span className="k">Registered area</span>
              <span><strong>{a.area_ha.toFixed(2)} ha</strong></span>
            </div>
            <div className="kv">
              <span className="k">Rate for this crop</span>
              <span>
                {a.rate_per_hectare === null
                  ? "—"
                  : `${formatMoney(a.rate_per_hectare)} per ha`}
              </span>
            </div>
            <div className="kv">
              <span className="k">
                {a.amount_lkr === null ? "Would come to" : "Amount"}
              </span>
              <span><strong>{formatMoney(preview)}</strong></span>
            </div>
          </div>
        </div>

        {a.farmer_note && (
          <div style={{ marginTop: 16, padding: 12, background: "#f8f9fa",
                        borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
            <strong>What the farmer wrote:</strong> {a.farmer_note}
          </div>
        )}
      </div>

      {/* ---------- THE ACTIONS ---------- */}
      {!nothingToDo && (
        <div className="card">
          <h2>
            {canApprove
              ? "Approve this application"
              : canResolve
              ? "Settle this dispute"
              : "Send the money"}
          </h2>

          <p className="sub">
            {canApprove ? (
              <>
                The amount is worked out from the registered area and the
                round's rate — nobody types it. This would come to{" "}
                <strong>{formatMoney(preview)}</strong>.
              </>
            ) : canResolve ? (
              <>
                Either send the money again, or close this with an
                explanation. Whichever you choose, the farmer sees what you
                wrote.
              </>
            ) : (
              <>
                Release <strong>{formatMoney(a.amount_lkr)}</strong> to this
                farmer. They will be asked to confirm it arrived.
              </>
            )}
          </p>

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="note">
              Note{canReject || canResolve ? " (required to reject or settle)" : " (optional)"}
            </label>
            <input
              id="note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                canResolve
                  ? "e.g. Bank details were wrong, corrected and re-sent"
                  : "e.g. Checked against the registered land"
              }
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {canApprove && (
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run("approve", "Approved. It now goes to the department.")
                }
              >
                Approve {formatMoney(preview)}
              </button>
            )}

            {canSend && (
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run(
                    "send",
                    a.status === "DISPUTED"
                      ? "Sent again. The farmer will be asked to confirm."
                      : "Money sent. The farmer will be asked to confirm."
                  )
                }
              >
                {a.status === "DISPUTED"
                  ? `Send again ${formatMoney(a.amount_lkr)}`
                  : `Send ${formatMoney(a.amount_lkr)}`}
              </button>
            )}

            {canResolve && (
              <button
                className="ghost"
                disabled={busy}
                onClick={() =>
                  run("resolve", "Dispute settled. The farmer will see why.")
                }
              >
                Close with an explanation
              </button>
            )}

            {canReject && (
              <button
                className="ghost"
                style={{ color: "#c92a2a", borderColor: "#ffc9c9" }}
                disabled={busy}
                onClick={() =>
                  run("reject", "Rejected. The farmer will see your reason.")
                }
              >
                Reject
              </button>
            )}
          </div>
        </div>
      )}

      {nothingToDo && (
        <div className="card">
          <p className="sub" style={{ margin: 0 }}>
            {a.status === "RECEIVED"
              ? "Finished. The farmer has confirmed the money arrived."
              : a.status === "SENT"
              ? "The money has been sent. Waiting for the farmer to confirm it arrived."
              : a.status === "RESOLVED"
              ? "This dispute was settled. See the history below."
              : a.status === "REJECTED"
              ? "This application was rejected. See the history below for the reason."
              : isDepartment
              ? "This application is waiting for the division officer."
              : "This application is with the department now."}
          </p>
        </div>
      )}

      <div className="card">
        <h2>History</h2>
        <p className="sub">
          Every step, with who took it. Steps marked{" "}
          <span className="by-farmer">farmer</span> were taken by the farmer
          themselves — that is what makes the payment accountable to them.
        </p>

        {detail.history.length === 0 ? (
          <div className="empty">
            The farmer has applied and nothing has happened yet.
          </div>
        ) : (
          <ul className="history">
            {detail.history.map((h) => (
              <li key={h.subsidy_event_id}>
                <SubsidyPill status={h.from_status} /> →{" "}
                <SubsidyPill status={h.to_status} />
                <br />
                <span style={{ color: "#868e96" }}>
                  {h.actor_name}
                  {h.actor_role === "FARMER" && (
                    <span className="by-farmer">farmer</span>
                  )}{" "}
                  · {new Date(h.created_at).toLocaleString()}
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
