import React from "react";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";

import { store } from "./src/store";
import AppNavigator from "./src/navigation/AppNavigator";

// Look how much SIMPLER this file is now.
//
// Before: an if-chain choosing screens by store status.
// Now: React Navigation handles it all.
//
// This is what happens when you move a job into the right place.
export default function App() {
  return (
    <Provider store={store}>
      <AppNavigator />
      <StatusBar style="light" />
    </Provider>
  );
}
