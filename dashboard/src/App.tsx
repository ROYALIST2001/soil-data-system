import { useEffect, useState } from "react";
import * as api from "./api";
import LoginPage from "./LoginPage";
import DepartmentPage from "./DepartmentPage";
import FarmerPage from "./FarmerPage";
import ReadingPage from "./ReadingPage";
import ClaimsPage from "./ClaimsPage";
import ClaimPage from "./ClaimPage";
import DisastersPage from "./DisastersPage";
import SubsidiesPage from "./SubsidiesPage";
import SubsidyPage from "./SubsidyPage";
import SubsidyRoundsPage from "./SubsidyRoundsPage";
import type { Account } from "./types";

// Which screen is showing.
//
// A plain state value rather than a router. This dashboard has a handful of
// screens and no need for shareable links, so a router would be a dependency
// and a set of concepts bought for nothing.
type View =
  | { name: "farmers" }
  | { name: "farmer"; farmerId: number }
  | { name: "reading"; readingId: number }
  | { name: "claims" }
  | { name: "claim"; claimId: number }
  | { name: "disasters" }
  | { name: "subsidies" }
  | { name: "subsidy"; applicationId: number }
  | { name: "rounds" };

// The three top-level areas.
const SECTIONS = [
  { key: "farmers", label: "Farmers & Soil" },
  { key: "claims", label: "Relief Claims" },
  { key: "disasters", label: "Disasters" },
  { key: "subsidies", label: "Subsidy" },
  { key: "rounds", label: "Subsidy Rounds" },
] as const;

export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<View>({ name: "farmers" });

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
    setView({ name: "farmers" });
  }

  if (checking) {
    return <div className="loading">Loading...</div>;
  }

  if (!account) {
    return <LoginPage onLoggedIn={setAccount} />;
  }

  const isDepartment = account.role === "DEPT_OFFICER";

  // A division officer may correct soil readings and verify claims.
  // The department oversees and releases money. The server enforces both -
  // this only decides what the screen offers.
  const canCorrect = !isDepartment;

  // Which section a view belongs to, for highlighting the right tab.
  const section =
    view.name === "claims" || view.name === "claim"
      ? "claims"
      : view.name === "disasters"
      ? "disasters"
      : view.name === "subsidies" || view.name === "subsidy"
      ? "subsidies"
      : view.name === "rounds"
      ? "rounds"
      : "farmers";

  function go(key: (typeof SECTIONS)[number]["key"]) {
    setView(
      key === "claims"
        ? { name: "claims" }
        : key === "disasters"
        ? { name: "disasters" }
        : key === "subsidies"
        ? { name: "subsidies" }
        : key === "rounds"
        ? { name: "rounds" }
        : { name: "farmers" }
    );
  }

  return (
    <>
      <div className="topbar">
        <h1>Soil Data System</h1>

        <nav className="nav">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={section === s.key ? "on" : undefined}
              onClick={() => go(s.key)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <span className="who">
          {account.full_name}
          <span style={{ opacity: 0.7 }}>
            {" · "}
            {isDepartment
              ? "Department"
              : `${account.scope_division ?? "—"} division`}
          </span>
        </span>
        <button onClick={handleLogout}>Sign out</button>
      </div>

      {view.name === "farmers" && (
        <DepartmentPage
          lockedDivision={isDepartment ? null : account.scope_division}
          onOpenFarmer={(farmerId) => setView({ name: "farmer", farmerId })}
          onOpenReading={(readingId) =>
            canCorrect ? setView({ name: "reading", readingId }) : undefined
          }
        />
      )}

      {view.name === "farmer" && (
        <FarmerPage
          farmerId={view.farmerId}
          canCorrect={canCorrect}
          onBack={() => setView({ name: "farmers" })}
          onOpenReading={(readingId) => setView({ name: "reading", readingId })}
        />
      )}

      {view.name === "reading" && (
        <ReadingPage
          readingId={view.readingId}
          onBack={() => setView({ name: "farmers" })}
        />
      )}

      {view.name === "claims" && (
        <ClaimsPage
          isDepartment={isDepartment}
          onOpenClaim={(claimId) => setView({ name: "claim", claimId })}
        />
      )}

      {view.name === "claim" && (
        <ClaimPage
          claimId={view.claimId}
          isDepartment={isDepartment}
          onBack={() => setView({ name: "claims" })}
        />
      )}

      {view.name === "disasters" && (
        <DisastersPage isDepartment={isDepartment} />
      )}

      {view.name === "subsidies" && (
        <SubsidiesPage
          isDepartment={isDepartment}
          onOpen={(applicationId) => setView({ name: "subsidy", applicationId })}
        />
      )}

      {view.name === "subsidy" && (
        <SubsidyPage
          applicationId={view.applicationId}
          isDepartment={isDepartment}
          onBack={() => setView({ name: "subsidies" })}
        />
      )}

      {view.name === "rounds" && (
        <SubsidyRoundsPage isDepartment={isDepartment} />
      )}
    </>
  );
}
