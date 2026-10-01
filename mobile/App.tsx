import React from "react";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";

import { store, useAppSelector } from "./src/store";
import SoilEntryScreen from "./src/screens/SoilEntryScreen";
import ResultScreen from "./src/screens/ResultScreen";
import RecommendationScreen from "./src/screens/RecommendationScreen";

// Chooses which screen to show, based on the store.
//
// It MUST be a separate component, because useAppSelector
// only works INSIDE the Provider below.
function AppContent() {
  const readingStatus = useAppSelector((state) => state.reading.status);
  const recStatus = useAppSelector((state) => state.recommendation.status);

  // ORDER MATTERS. We check the DEEPEST screen first.
  //
  // Simple navigation for three screens.
  // In Phase 7 we will have five, and we will add React Navigation.
  // Adding a big library for three screens is not worth it yet.
  if (recStatus === "success") {
    return <RecommendationScreen />;
  }

  if (readingStatus === "success") {
    return <ResultScreen />;
  }

  return <SoilEntryScreen />;
}

export default function App() {
  return (
    <Provider store={store}>
      <AppContent />
      <StatusBar style="auto" />
    </Provider>
  );
}
