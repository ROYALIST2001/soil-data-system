import { useState } from "react";
import * as api from "./api";
import type { Account } from "./types";

interface Props {
  onLoggedIn: (account: Account) => void;
}

// ONE login screen for both dashboards.
//
// The officer does not choose which dashboard to open - their ROLE decides,
// and the role comes from the server. A screen where you pick "I am a
// department officer" would be no security at all.
export default function LoginPage({ onLoggedIn }: Props) {
  const [nic, setNic] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    // A form submits and reloads the page by default, which would throw away
    // everything we just did.
    e.preventDefault();

    setError(null);
    setBusy(true);

    try {
      const result = await api.login(nic.trim().toUpperCase(), password);

      // A FARMER has a perfectly valid login, but no business here. Say so
      // plainly rather than letting them in to a dashboard full of empty
      // tables and 403s.
      if (result.farmer.role === "FARMER") {
        setError(
          "This is the officer dashboard. Farmer accounts should use the " +
          "mobile app."
        );
        setBusy(false);
        return;
      }

      api.setToken(result.token);
      onLoggedIn(result.farmer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log in.");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={handleSubmit}>
        <h1>Soil Data System</h1>
        <p className="sub">Agriculture officer sign in</p>

        {error && <div className="error">{error}</div>}

        <div className="field">
          <label htmlFor="nic">NIC Number</label>
          <input
            id="nic"
            type="text"
            value={nic}
            onChange={(e) => setNic(e.target.value)}
            autoCapitalize="characters"
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          className="primary"
          type="submit"
          disabled={busy || !nic.trim() || !password}
        >
          {busy ? "Signing in..." : "Sign In"}
        </button>

        <p className="hint">
          Demonstration accounts:
          <br />
          <strong>DEPT0000001</strong> / dept1234 — department
          <br />
          <strong>GNO00000001</strong> / gn1234 — Gettuwana division
        </p>
      </form>
    </div>
  );
}
