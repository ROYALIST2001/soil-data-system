import { useEffect, useState } from "react";
import * as api from "./api";
import { formatMoney } from "./ClaimsPage";
import type { DisasterEvent, DivisionSummary, EventRate } from "./types";

// DECLARING A DISASTER, and seeing what each one has cost.
//
// Only the department may declare. A division officer opens this page to see
// which disasters affect their area and what the rates are, which is what
// they need when a farmer asks them why an amount is what it is.

interface Props {
  isDepartment: boolean;
}

const DISASTER_TYPES = [
  "FLOOD", "DROUGHT", "LANDSLIDE", "CYCLONE", "PEST", "OTHER",
];

const CROPS = [
  "rice", "maize", "tea", "coconut", "banana",
  "chilli", "potato", "cabbage", "tomato", "bigonion",
];

// Today as YYYY-MM-DD, for the date boxes.
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DisastersPage({ isDepartment }: Props) {
  const [events, setEvents] = useState<DisasterEvent[]>([]);
  const [divisions, setDivisions] = useState<DivisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);

  // The form.
  const [name, setName] = useState("");
  const [type, setType] = useState("FLOOD");
  const [startedOn, setStartedOn] = useState(today());
  const [endedOn, setEndedOn] = useState(today());
  const [description, setDescription] = useState("");
  const [chosenDivisions, setChosenDivisions] = useState<string[]>([]);
  const [rates, setRates] = useState<EventRate[]>([]);

  // The rate being added right now.
  const [rateCrop, setRateCrop] = useState("rice");
  const [rateValue, setRateValue] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [e, d] = await Promise.all([
        api.getDisasters(),
        api.getDivisions(),
      ]);
      setEvents(e);
      setDivisions(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleDivision(division: string) {
    setChosenDivisions((current) =>
      current.includes(division)
        ? current.filter((d) => d !== division)
        : [...current, division]
    );
  }

  function addRate() {
    const value = parseFloat(rateValue);

    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a rate above zero.");
      return;
    }
    if (rates.some((r) => r.crop === rateCrop)) {
      setError(`${rateCrop} already has a rate. Remove it first to change.`);
      return;
    }

    setError(null);
    setRates([...rates, { crop: rateCrop, rate_per_hectare: value }]);
    setRateValue("");
  }

  async function declare() {
    setError(null);
    setSuccess(null);

    // The server checks all of this again. These messages exist so the
    // officer finds out immediately rather than after a round trip.
    if (chosenDivisions.length === 0) {
      setError("Choose at least one affected division.");
      return;
    }
    if (rates.length === 0) {
      setError("Set a compensation rate for at least one crop.");
      return;
    }

    setBusy(true);

    try {
      await api.declareDisaster({
        name,
        disaster_type: type,
        started_on: startedOn,
        ended_on: endedOn,
        description,
        divisions: chosenDivisions,
        rates,
      });

      setSuccess("Disaster declared. Farmers in those divisions can claim now.");
      setShowForm(false);
      setName("");
      setDescription("");
      setChosenDivisions([]);
      setRates([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not declare.");
    } finally {
      setBusy(false);
    }
  }

  async function close(eventId: number) {
    if (
      !window.confirm(
        "Close this disaster? Farmers will no longer be able to submit new " +
        "claims. Claims already made will carry on as normal."
      )
    ) {
      return;
    }

    try {
      await api.closeDisaster(eventId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close.");
    }
  }

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="page">
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="card">
        <h2>Declared disasters</h2>
        <p className="sub">
          A farmer can only claim against a disaster that has been declared
          here, and only if their division is in the affected list. That is
          what makes a claim checkable.
        </p>

        {isDepartment && !showForm && (
          <button className="primary" onClick={() => setShowForm(true)}>
            + Declare a disaster
          </button>
        )}

        {events.length === 0 ? (
          <div className="empty">No disasters have been declared.</div>
        ) : (
          <div style={{ marginTop: 16 }}>
            {events.map((e) => (
              <div key={e.event_id} className="event-card">
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      {e.name}{" "}
                      <span className={`flag claim-${e.status === "OPEN" ? "SUBMITTED" : "PAID"}`}>
                        {e.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#868e96", marginTop: 3 }}>
                      {e.disaster_type} · {e.started_on} to {e.ended_on} ·
                      declared by {e.declared_by_name}
                    </div>
                  </div>

                  {isDepartment && e.status === "OPEN" && (
                    <button className="ghost" onClick={() => close(e.event_id)}>
                      Close for claims
                    </button>
                  )}
                </div>

                {e.description && (
                  <p style={{ fontSize: 13, margin: "10px 0 0" }}>
                    {e.description}
                  </p>
                )}

                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <strong>Divisions:</strong> {e.divisions.join(", ")}
                </div>

                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <strong>Rates:</strong>{" "}
                  {e.rates
                    .map((r) => `${r.crop} ${formatMoney(r.rate_per_hectare)}/ha`)
                    .join(" · ")}
                </div>

                <div style={{ marginTop: 10, fontSize: 13, color: "#40916c" }}>
                  {e.claim_count} claim{e.claim_count === 1 ? "" : "s"} ·{" "}
                  {formatMoney(e.total_amount)} approved
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- THE DECLARATION FORM ---------- */}
      {isDepartment && showForm && (
        <div className="card">
          <h2>Declare a disaster</h2>
          <p className="sub">
            Setting the rate per hectare here is what decides every payment
            under this scheme. Nobody types an amount per farmer, so two
            farmers who lost the same half hectare receive the same money.
          </p>

          <div className="controls">
            <div className="field" style={{ flex: 1, minWidth: 320 }}>
              <label htmlFor="dname">Name</label>
              <input
                id="dname"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Flood - Kurunegala - October 2026"
              />
            </div>

            <div className="field">
              <label htmlFor="dtype">Type</label>
              <select
                id="dtype"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {DISASTER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="dstart">Started on</label>
              <input
                id="dstart"
                type="date"
                value={startedOn}
                onChange={(e) => setStartedOn(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="dend">Ended on</label>
              <input
                id="dend"
                type="date"
                value={endedOn}
                onChange={(e) => setEndedOn(e.target.value)}
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="ddesc">What happened (optional)</label>
            <textarea
              id="ddesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Heavy rain, Deduru Oya overflowed its banks"
            />
          </div>

          <h3 style={{ fontSize: 15, color: "#1b4332", margin: "0 0 4px" }}>
            Affected divisions
          </h3>
          <p className="sub">
            Farmers outside these divisions cannot claim.
          </p>

          <div className="chips">
            {divisions.length === 0 ? (
              <span className="sub">
                No divisions have registered farmers yet.
              </span>
            ) : (
              divisions.map((d) => (
                <button
                  key={d.division}
                  className={
                    chosenDivisions.includes(d.division)
                      ? "chip chip-on"
                      : "chip"
                  }
                  onClick={() => toggleDivision(d.division)}
                >
                  {d.division} ({d.farmer_count})
                </button>
              ))
            )}
          </div>

          <h3 style={{ fontSize: 15, color: "#1b4332", margin: "18px 0 4px" }}>
            Compensation rates
          </h3>
          <p className="sub">
            Rupees per hectare lost. A crop with no rate cannot be claimed for.
          </p>

          {rates.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {rates.map((r) => (
                <div key={r.crop} className="rate-row">
                  <span style={{ flex: 1 }}>{r.crop}</span>
                  <span style={{ color: "#40916c", fontWeight: 700 }}>
                    {formatMoney(r.rate_per_hectare)} / ha
                  </span>
                  <button
                    className="link-danger"
                    onClick={() =>
                      setRates(rates.filter((x) => x.crop !== r.crop))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="controls">
            <div className="field">
              <label htmlFor="rcrop">Crop</label>
              <select
                id="rcrop"
                value={rateCrop}
                onChange={(e) => setRateCrop(e.target.value)}
              >
                {CROPS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="rvalue">Rupees per hectare</label>
              <input
                id="rvalue"
                type="number"
                step="any"
                style={{ width: 170 }}
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
                placeholder="150000"
              />
            </div>

            <button className="ghost" onClick={addRate}>+ Add rate</button>
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
            <button className="primary" onClick={declare} disabled={busy}>
              {busy ? "Declaring..." : "Declare disaster"}
            </button>
            <button className="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
