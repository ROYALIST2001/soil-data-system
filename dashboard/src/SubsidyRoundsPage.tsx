import { useEffect, useState } from "react";
import * as api from "./api";
import { formatMoney } from "./ClaimsPage";
import type { DivisionSummary, SubsidyRate, SubsidyRound } from "./types";

// ANNOUNCING A SUBSIDY ROUND, and seeing what each one has cost.
//
// Only the department may announce. A division officer opens this to see
// which rounds cover their area and what the rates are - which is what they
// need when a farmer asks why an amount is what it is.

interface Props {
  isDepartment: boolean;
}

const CROPS = [
  "rice", "maize", "tea", "coconut", "banana",
  "chilli", "potato", "cabbage", "tomato", "bigonion",
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function inMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

export default function SubsidyRoundsPage({ isDepartment }: Props) {
  const [rounds, setRounds] = useState<SubsidyRound[]>([]);
  const [divisions, setDivisions] = useState<DivisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // The form.
  const [name, setName] = useState("");
  const [season, setSeason] = useState("MAHA");
  const [opensOn, setOpensOn] = useState(today());
  const [closesOn, setClosesOn] = useState(inMonths(2));
  const [description, setDescription] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [rates, setRates] = useState<SubsidyRate[]>([]);
  const [rateCrop, setRateCrop] = useState("rice");
  const [rateValue, setRateValue] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([
        api.getSubsidyRounds(),
        api.getDivisions(),
      ]);
      setRounds(r);
      setDivisions(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleDivision(division: string) {
    setChosen((current) =>
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
    if (chosen.length === 0) {
      setError("Choose at least one division.");
      return;
    }
    if (rates.length === 0) {
      setError("Set a rate for at least one crop.");
      return;
    }

    setBusy(true);

    try {
      await api.declareSubsidyRound({
        name,
        season,
        opens_on: opensOn,
        closes_on: closesOn,
        description,
        divisions: chosen,
        rates,
      });

      setSuccess("Round announced. Farmers in those divisions can apply now.");
      setShowForm(false);
      setName("");
      setDescription("");
      setChosen([]);
      setRates([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not announce.");
    } finally {
      setBusy(false);
    }
  }

  async function close(roundId: number) {
    if (
      !window.confirm(
        "Close this round? Farmers will no longer be able to apply. " +
        "Applications already made carry on as normal."
      )
    ) {
      return;
    }

    try {
      await api.closeSubsidyRound(roundId);
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
        <h2>Fertilizer subsidy rounds</h2>
        <p className="sub">
          A farmer can only apply against a round announced here, and only if
          their division is in the list. The rate per hectare set here decides
          every payment in the round.
        </p>

        {isDepartment && !showForm && (
          <button className="primary" onClick={() => setShowForm(true)}>
            + Announce a round
          </button>
        )}

        {rounds.length === 0 ? (
          <div className="empty">No subsidy rounds have been announced.</div>
        ) : (
          <div style={{ marginTop: 16 }}>
            {rounds.map((r) => (
              <div key={r.round_id} className="event-card">
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      {r.name}{" "}
                      <span
                        className={`flag subsidy-${
                          r.status === "OPEN" ? "SUBMITTED" : "RECEIVED"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#868e96", marginTop: 3 }}>
                      {r.season} season · {r.opens_on} to {r.closes_on} ·
                      announced by {r.declared_by_name}
                    </div>
                  </div>

                  {isDepartment && r.status === "OPEN" && (
                    <button className="ghost" onClick={() => close(r.round_id)}>
                      Close for applications
                    </button>
                  )}
                </div>

                {r.description && (
                  <p style={{ fontSize: 13, margin: "10px 0 0" }}>
                    {r.description}
                  </p>
                )}

                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <strong>Divisions:</strong> {r.divisions.join(", ")}
                </div>

                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <strong>Rates:</strong>{" "}
                  {r.rates
                    .map(
                      (x) => `${x.crop} ${formatMoney(x.rate_per_hectare)}/ha`
                    )
                    .join(" · ")}
                </div>

                <div style={{ marginTop: 10, fontSize: 13, color: "#40916c" }}>
                  {r.application_count} application
                  {r.application_count === 1 ? "" : "s"} ·{" "}
                  {formatMoney(r.total_approved)} approved
                  {r.disputed_count > 0 && (
                    <span style={{ color: "#c92a2a", fontWeight: 700 }}>
                      {" "}· {r.disputed_count} not received
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- THE ANNOUNCEMENT FORM ---------- */}
      {isDepartment && showForm && (
        <div className="card">
          <h2>Announce a subsidy round</h2>
          <p className="sub">
            The rate per hectare decides every payment under this round. No
            officer types an amount for an individual farmer, so two farmers
            with the same half hectare of rice receive the same money.
          </p>

          <div className="controls">
            <div className="field" style={{ flex: 1, minWidth: 300 }}>
              <label htmlFor="rname">Name</label>
              <input
                id="rname"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Maha season 2026/27 fertilizer subsidy"
              />
            </div>

            <div className="field">
              <label htmlFor="rseason">Season</label>
              <select
                id="rseason"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
              >
                <option value="MAHA">Maha</option>
                <option value="YALA">Yala</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="ropens">Opens on</label>
              <input
                id="ropens"
                type="date"
                value={opensOn}
                onChange={(e) => setOpensOn(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="rcloses">Closes on</label>
              <input
                id="rcloses"
                type="date"
                value={closesOn}
                onChange={(e) => setClosesOn(e.target.value)}
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="rdesc">Notes (optional)</label>
            <textarea
              id="rdesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Urea and MOP subsidy for the main paddy season"
            />
          </div>

          <h3 style={{ fontSize: 15, color: "#1b4332", margin: "0 0 4px" }}>
            Divisions
          </h3>
          <p className="sub">Farmers outside these cannot apply.</p>

          <div className="chips">
            {divisions.length === 0 ? (
              <span className="sub">No divisions have farmers yet.</span>
            ) : (
              divisions.map((d) => (
                <button
                  key={d.division}
                  className={chosen.includes(d.division) ? "chip chip-on" : "chip"}
                  onClick={() => toggleDivision(d.division)}
                >
                  {d.division} ({d.farmer_count})
                </button>
              ))
            )}
          </div>

          <h3 style={{ fontSize: 15, color: "#1b4332", margin: "18px 0 4px" }}>
            Rates
          </h3>
          <p className="sub">
            Rupees per hectare. A crop with no rate cannot be applied for.
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
                placeholder="25000"
              />
            </div>

            <button className="ghost" onClick={addRate}>+ Add rate</button>
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
            <button className="primary" onClick={declare} disabled={busy}>
              {busy ? "Announcing..." : "Announce round"}
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
