import React from "react";
import {
  ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Text,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import LandForm from "../components/LandForm";
import { useAuth } from "../hooks/useAuth";
import { useLands } from "../hooks/useLands";

// Registering one more land, from the My Lands tab.
//
// The form itself is the SAME component the first-time setup screen uses.
// Only what happens afterwards differs: there, the farmer is asked whether
// they have another land; here, we simply go back to the list.
export default function AddLandScreen() {
  const navigation = useNavigation<any>();
  const { farmer } = useAuth();
  const { saving, errorMessage, addLand } = useLands();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>

        <Text style={styles.intro}>
          Add another piece of land and the crops you grow on it.
        </Text>

        <LandForm
          defaultDivision={farmer?.gn_division ?? ""}
          saving={saving}
          serverError={errorMessage}
          onSave={addLand}
          // The land is already in the store by the time this runs, so the
          // list behind us is correct the moment we land on it.
          onSaved={() => navigation.goBack()}
        />

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  container: { padding: 20, paddingTop: 20, paddingBottom: 40 },
  intro: {
    fontSize: 14, color: "#495057",
    marginBottom: 18, lineHeight: 20,
  },
});
