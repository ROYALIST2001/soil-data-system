import { useEffect, useState } from "react";
import * as api from "./api";
import { FlagPill } from "./SortableTable";
import type { ReadingDetail } from "./types";

interface Props {
  readingId: number;
  onBack: () => void;
}

// THE CORRECTION SCREEN.
//
// Where a division officer checks a reading and, if the farmer got something
// wrong, fixes it.
//
// The farmer's original numbers are shown next to the current ones at all
// times. The officer should never be able to forget that they are changing
// somebody else's submission rather than editing a spreadsheet.

const FIELDS = [
  { key: "n", label: "Nitrogen (N)", unit: "mg/kg" },
  { key: "p", label: "Phosphorus (P)", unit: "mg/kg" },
  { key: "k", label: "Potassium (K)", unit: "mg/kg" },
  { key: "ph", label: "pH", unit: "" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

export default function ReadingPage({ readingId, onBack }: Props) {
  const [detail, setDetail] = useState<ReadingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // What the officer has typed. Strings, not numbers, because a half-typed
  // "6." is not a number yet and converting too early makes the box fight
  // the person using it.
  const [values, setValues] = useState<Record<FieldKey, string>>({
    n: "", p: "", k: "", ph: "",
  });
  const [reason, setReason] = useState("");

  const [flag, setFlag] = useState("");
  const [flagReason, setFlagReason] = useState("");

  function load() {
    api
      .getReading(readingId)
      .then((d) => {
        setDetail(d);
        setValues({
          n: String(d.reading.n),
          p: String(d.reading.p),
          k: String(d.reading.k),
          ph: String(d.reading.ph),
        });
        setFlag(d.reading.quality_flag);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load.")
      );
  }

  useEffect(load, [readingId]);

  async function handleCorrect(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;

    setError(null);
    setSuccess(null);
    setBusy(true);

    // Send ONLY what actually changed.
    //
    // Sending every field would record four corrections when the officer
    // altered one, and the audit trail would be full of "nitrogen 45 to 45".
    const changed: { n?: number; p?: number; k?: number; ph?: number } = {};

    for (const f of FIELDS) {
      const typed = parseFloat(values[f.key]);
      if (Number.isFinite(typed) && typed !== detail.reading[f.key]) {
        changed[f.key] = typed;
      }
    }

    if (Object.keys(changed).length === 0) {
      setError("Nothing was changed.");
      setBusy(false);
      return;
    }

    try {
      const updated = await api.correctReading(readingId, changed, reason);
      setDetail(updated);
      setReason("");
      setSuccess("Correction saved. The farmer's original values are kept.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFlag(e: React.FormEvent) {
    e.preventDefault();

    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      const updated = await api.flagReading(readingId, flag, flagReason);
      setDetail(updated);
      setFlagReason("");
      setSuccess("Quality flag updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <div className="page">
        {error ? <div className="error">{error}</div> : <div className="loading">Loading...</div>}
        <button className="ghost" onClick={onBack}>Back</button>
      </div>
    );
  }

  const r = detail.reading;

  const originals: Record<FieldKey, number> = {
    n: detail.original_n,
    p: detail.original_p,
    k: detail.original_k,
    ph: detail.original_ph,
  };

  return (
    <div className="page">
      <button className="ghost" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="card">
        <h2>Reading #{r.reading_id}</h2>
        <p className="sub">
          {r.farmer_name || "unassigned"}
          {r.gn_division && ` · ${r.gn_division}`} · {r.land_name || "no land"}{" "}
          · {new Date(r.created_at).toLocaleString()}
        </p>

        <div className="two-col">
          <div>
            <div className="kv">
              <span className="k">Crop</span><span>{r.crop}</span>
            </div>
            <div className="kv">
              <span className="k">Growth stage</span><span>{r.stage}</span>
            </div>
            <div className="kv">
              <span className="k">Area</span>
              <span>{r.area.toFixed(2)} ha</span>
            </div>
          </div>

          <div>
            <div className="kv">
              <span className="k">Quality rules decided</span>
              <span><FlagPill flag={detail.rule_flag} /></span>
            </div>
            <div className="kv">
              <span className="k">Officer override</span>
              <span>
                {detail.officer_flag
                  ? <FlagPill flag={detail.officer_flag} />
                  : <span style={{ color: "#adb5bd" }}>none</span>}
              </span>
            </div>
            <div className="kv">
              <span className="k">In force</span>
              <span><FlagPill flag={r.quality_flag} /></span>
            </div>
          </div>
        </div>

        {/* The Phase 8 agent's explanation, when it ran. An officer judging
            whether a reading is really wrong should see the reasoning that
            was already written for the farmer. */}
        {r.agent_note && (
          <div style={{ marginTop: 16, padding: 12, background: "#f8f9fa",
                        borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
            <strong>Automatic quality note:</strong> {r.agent_note}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Correct the values</h2>
        <p className="sub">
          The farmer's original entry is never deleted. Your change is stored
          beside it with your name and your reason.
        </p>

        <form onSubmit={handleCorrect}>
          <div className="controls">
            {FIELDS.map((f) => {
              const original = originals[f.key];
              const current = r[f.key];
              const wasCorrected = original !== current;

              return (
                <div className="field" key={f.key}>
                  <label htmlFor={f.key}>
                    {f.label} {f.unit && `— ${f.unit}`}
                  </label>
                  <input
                    id={f.key}
                    type="number"
                    step="any"
                    style={{ width: 130 }}
                    value={values[f.key]}
                    onChange={(e) =>
                      setValues({ ...values, [f.key]: e.target.value })
                    }
                  />
                  <span style={{ fontSize: 11, color: "#868e96" }}>
                    farmer entered {original}
                    {wasCorrected && (
                      <span className="changed"> · corrected</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="reason">
              Why are you correcting this? (at least 10 characters)
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Farmer mistyped nitrogen, lab report says 180"
            />
          </div>

          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save correction"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Quality flag</h2>
        <p className="sub">
          The rules decided <FlagPill flag={detail.rule_flag} />. You can
          overrule that. The rules' own decision is kept, so it stays possible
          to tell what the system thought and what a person decided.
        </p>

        <form onSubmit={handleFlag}>
          <div className="controls">
            <div className="field">
              <label htmlFor="flag">Set flag to</label>
              <select
                id="flag"
                value={flag}
                onChange={(e) => setFlag(e.target.value)}
              >
                <option value="OK">OK — usable</option>
                <option value="FLAGGED">FLAGGED — doubtful</option>
                <option value="QUARANTINED">QUARANTINED — do not use</option>
              </select>
            </div>

            <div className="field" style={{ flex: 1, minWidth: 280 }}>
              <label htmlFor="flagReason">Reason (at least 10 characters)</label>
              <input
                id="flagReason"
                type="text"
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="e.g. Values do not match the lab report"
              />
            </div>

            <button className="primary" type="submit" disabled={busy}>
              Update flag
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>History</h2>
        <p className="sub">
          Every change ever made to this reading. Nothing here can be edited
          or deleted.
        </p>

        {detail.corrections.length === 0 ? (
          <div className="empty">
            This reading is exactly as the farmer submitted it.
          </div>
        ) : (
          <ul className="history">
            {detail.corrections.map((c) => (
              <li key={c.correction_id}>
                <strong>{c.field_name}</strong>{" "}
                {c.old_value ?? "—"} → <strong>{c.new_value}</strong>
                <br />
                <span style={{ color: "#868e96" }}>
                  {c.officer_name} · {new Date(c.created_at).toLocaleString()}
                </span>
                <br />
                <em>{c.reason}</em>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
