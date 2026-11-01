import { colors, ui } from "../theme";
import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from "react-native";

import LandForm from "../components/LandForm";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../hooks/useAuth";
import { useLands } from "../hooks/useLands";
import { useAppDispatch } from "../store";
import { setupFinished } from "../store/landSlice";
import { CROPS } from "../constants/vocabulary";

function cropLabel(value: string): string {
  const found = CROPS.find((c) => c.value === value);
  return found ? found.label : value;
}

// THE SCREEN BETWEEN LOGIN AND THE REST OF THE APP.
//
// A farmer who has just signed up has no land registered, so the fertilizer
// system has nothing to give advice about. Rather than letting them reach a
// soil test form with nothing to attach it to, we ask for their land first.
//
// They can register as many lands as they like here, and only move on when
// they press Continue.
export default function LandSetupScreen() {
  const dispatch = useAppDispatch();
  const { farmer } = useAuth();
  const { lands, saving, errorMessage, addLand } = useLands();

  // Shows the "saved" panel after each land, instead of jumping straight on.
  const [justSaved, setJustSaved] = useState(false);

  // Is the form open? Closed while the "saved" panel is showing.
  const [formOpen, setFormOpen] = useState(true);

  function handleSaved() {
    setJustSaved(true);
    setFormOpen(false);
  }

  function handleAddAnother() {
    setJustSaved(false);
    setFormOpen(true);
  }

  function handleContinue() {
    // THIS is what moves the farmer into the app. Not the land count.
    dispatch(setupFinished());
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}><KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView style={ui.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <Text style={ui.eyebrow}>MAKE YOURSELF AT HOME</Text>
        <Text style={styles.title}>Tell us about your land.</Text>
        <Text style={styles.subtitle}>
          Before you can get fertilizer advice, the system needs to know
          about your land and what you grow on it. You can add more land
          later at any time.
        </Text>

        {/* ---------- What has been saved so far ---------- */}
        {lands.length > 0 && (
          <View style={styles.savedBox}>
            <Text style={styles.savedTitle}>
              Registered so far ({lands.length})
            </Text>

            {lands.map((land) => (
              <View key={land.land_id} style={styles.savedRow}>
                <Text style={styles.savedName}>
                  {land.name} — {land.size_ha.toFixed(2)} ha
                </Text>
                <Text style={styles.savedCrops}>
                  {land.crops.map((c) => cropLabel(c.crop)).join(", ")}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ---------- The choice after saving a land ---------- */}
        {justSaved && (
          <View style={styles.choiceBox}>
            <Text style={styles.choiceTitle}>Land saved.</Text>
            <Text style={styles.choiceText}>
              Do you have another piece of land to register?
            </Text>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleAddAnother}
            >
              <Text style={styles.secondaryText}>+ Add another land</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleContinue}
            >
              <Text style={styles.primaryText}>
                No, continue to the app
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ---------- The form ---------- */}
        {formOpen && (
          <LandForm
            // Pre-fill with the division from signup. Most farmers' land is
            // in their own division, and they can change it if it is not.
            defaultDivision={farmer?.gn_division ?? ""}
            saving={saving}
            serverError={errorMessage}
            onSave={addLand}
            onSaved={handleSaved}
            saveLabel={lands.length === 0 ? "Save Land" : "Save This Land"}
          />
        )}

      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: 22, paddingTop: 20, paddingBottom: 40 },

  title: {
    fontSize: 24, fontWeight: "700",
    color: colors.forest, marginBottom: 6,
  },
  subtitle: {
    fontSize: 14, color: colors.secondary,
    marginBottom: 20, lineHeight: 20,
  },

  savedBox: {
    backgroundColor: colors.sage, borderRadius: 18,
    padding: 14, marginBottom: 18,
  },
  savedTitle: {
    fontSize: 14, fontWeight: "700",
    color: colors.forest, marginBottom: 8,
  },
  savedRow: { marginBottom: 8 },
  savedName: { fontSize: 14, color: colors.text },
  savedCrops: { fontSize: 12, color: colors.primary, marginTop: 2 },

  choiceBox: {
    borderWidth: 1, borderColor: colors.primary, borderRadius: 18,
    padding: 16, marginBottom: 20,
  },
  choiceTitle: {
    fontSize: 17, fontWeight: "700",
    color: colors.forest, marginBottom: 4,
  },
  choiceText: {
    fontSize: 14, color: colors.secondary,
    marginBottom: 14, lineHeight: 20,
  },

  secondaryButton: {
    borderWidth: 1, borderColor: colors.primary, borderRadius: 14,
    paddingVertical: 12, alignItems: "center", marginBottom: 10,
  },
  secondaryText: { color: colors.primary, fontSize: 15, fontWeight: "700" },

  primaryButton: { minHeight: 52,
    backgroundColor: colors.forest, borderRadius: 14,
    paddingVertical: 13, alignItems: "center",
  },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: "700" },
});
