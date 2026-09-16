import React from "react";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";

import { store, useAppSelector } from "./src/store";
import SoilEntryScreen from "./src/screens/SoilEntryScreen";
import ResultScreen from "./src/screens/ResultScreen";

// This component chooses which screen to show.
// It MUST be a separate component, because useAppSelector
// only works INSIDE the Provider below.
function AppContent() {
  const status = useAppSelector((state) => state.reading.status);

  // Simple navigation for two screens.
  // In Phase 7 we will add React Navigation for more screens.
  if (status === "success") {
    return <ResultScreen />;
  }
  return <SoilEntryScreen />;
}

export default function App() {
  return (
    // Provider gives every screen inside it access to the store.
    // Without this, useAppSelector would not work.
    <Provider store={store}>
      <AppContent />
      <StatusBar style="auto" />
    </Provider>
  );
}
