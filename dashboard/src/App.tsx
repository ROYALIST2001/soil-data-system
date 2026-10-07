import { useEffect, useState } from "react";
import * as api from "./api";
import LoginPage from "./LoginPage";
import DepartmentPage from "./DepartmentPage";
import FarmerPage from "./FarmerPage";
import ReadingPage from "./ReadingPage";
import type { Account } from "./types";

// Which screen is showing.
//
// A plain state value rather than a router. This dashboard has four screens
// and no need for shareable links, so a router would be a dependency and a
// set of concepts bought for nothing.
type View =
  | { name: "list" }
  | { name: "farmer"; farmerId: number }
  | { name: "reading"; readingId: number };

export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<View>({ name: "list" });

  // ---------- Is the saved token still good? ----------
  //
  // The token lives in localStorage so a refresh does not log the officer
  // out. But a saved token may have expired, or been revoked. Rather than
  // trusting it, we ask the server who it belongs to. If it says no, we show
  // the login screen.
  useEffect(() => {
    if (!api.hasToken()) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    api
      .getMe()
      .then((a) => {
        if (!cancelled) setAccount(a);
      })
      .catch(() => {
        // Expired, revoked, or the API is down. Either way there is nothing
        // to show, and api.ts has already cleared a rejected token.
        if (!cancelled) api.setToken(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await api.logout();
    setAccount(null);
    setView({ name: "list" });
  }

  if (checking) {
    return <div className="loading">Loading...</div>;
  }

  if (!account) {
    return <LoginPage onLoggedIn={setAccount} />;
  }

  const isDivisionOfficer = account.role === "GN_OFFICER";

  // A division officer may correct readings; a department officer oversees.
  // The server enforces this too - this only decides what we offer.
  const canCorrect = isDivisionOfficer;

  return (
    <>
      <div className="topbar">
        <h1>Soil Data System</h1>
        <span style={{ fontSize: 13, opacity: 0.85 }}>
          {isDivisionOfficer
            ? `${account.scope_division ?? "—"} division`
            : "Department of Agriculture"}
        </span>

        <span className="who">{account.full_name}</span>
        <button onClick={handleLogout}>Sign out</button>
      </div>

      {view.name === "list" && (
        <DepartmentPage
          lockedDivision={isDivisionOfficer ? account.scope_division : null}
          onOpenFarmer={(farmerId) => setView({ name: "farmer", farmerId })}
          onOpenReading={(readingId) =>
            canCorrect
              ? setView({ name: "reading", readingId })
              : undefined
          }
        />
      )}

      {view.name === "farmer" && (
        <FarmerPage
          farmerId={view.farmerId}
          canCorrect={canCorrect}
          onBack={() => setView({ name: "list" })}
          onOpenReading={(readingId) => setView({ name: "reading", readingId })}
        />
      )}

      {view.name === "reading" && (
        <ReadingPage
          readingId={view.readingId}
          onBack={() => setView({ name: "list" })}
        />
      )}
    </>
  );
}
