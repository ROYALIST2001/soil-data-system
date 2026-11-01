import { colors, ui } from "../theme";
import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import InputField from "../components/InputField";
import SelectField from "../components/SelectField";
import { CROPS } from "../constants/vocabulary";
import { useLands } from "../hooks/useLands";

// Adding ONE crop to a land that already exists.
export default function AddCropScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const landId: number = route.params?.landId;
  const landName: string = route.params?.landName ?? "this land";

  const { lands, saving, errorMessage, addCropToLand } = useLands();

  // Read the land out of the store rather than passing its numbers through
  // navigation. The store is the single source of truth, so this stays
  // correct even if the land changed since the previous screen drew.
  const land = lands.find((l) => l.land_id === landId);

  const used = land
    ? land.crops.reduce((sum, c) => sum + c.size_ha, 0)
    : 0;
  const free = land ? land.size_ha - used : 0;

  // Offer only the crops that are NOT already on this land.
  //
  // Stopping a duplicate by not offering it is better than letting the
  // farmer pick it and then showing an error.
  const available = CROPS.filter(
    (option) => !land?.crops.some((c) => c.crop === option.value)
  );

  const [crop, setCrop] = useState(available[0]?.value ?? "rice");
  const [size, setSize] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleAdd() {
    setLocalError(null);

    const value = parseFloat(size);

    if (!Number.isFinite(value) || value <= 0) {
      setLocalError("Please enter the size for this crop.");
      return;
    }

    if (value > free + 0.000001) {
      setLocalError(
        `Only ${free.toFixed(2)} hectares are free on this land.`
      );
      return;
    }

    const ok = await addCropToLand(landId, crop, value);
    if (ok) {
      navigation.goBack();
    }
  }

  if (!land) {
    return (
      <View style={styles.centre}>
        <Text style={styles.note}>That land was not found.</Text>
      </View>
    );
  }

  if (available.length === 0) {
    return (
      <View style={styles.centre}>
        <Text style={styles.note}>
          Every crop the system knows is already on this land.
        </Text>
      </View>
    );
  }

  const message = localError ?? errorMessage;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView style={ui.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <Text style={styles.title}>Add a crop</Text>
        <Text style={styles.subtitle}>
          On {landName}. {free.toFixed(2)} of {land.size_ha.toFixed(2)}
          {" "}hectares are still free.
        </Text>

        <SelectField
          label="Crop"
          value={crop}
          options={available}
          onSelect={setCrop}
        />

        <InputField
          label="Size — hectares"
          value={size}
          onChangeText={setSize}
          numeric
        />

        {message && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleAdd}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.buttonText}>Add Crop</Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingTop: 24 },
  centre: {
    flex: 1, justifyContent: "center",
    alignItems: "center", padding: 30,
  },

  title: { fontSize: 20, fontWeight: "700", color: colors.forest },
  subtitle: {
    fontSize: 13, color: colors.muted,
    marginTop: 4, marginBottom: 20, lineHeight: 19,
  },
  note: { fontSize: 14, color: colors.muted, textAlign: "center" },

  button: { minHeight: 52,
    backgroundColor: colors.forest, paddingVertical: 14,
    borderRadius: 14, alignItems: "center", marginTop: 6,
  },
  buttonDisabled: { backgroundColor: colors.disabled },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: "700" },

  errorBox: {
    backgroundColor: colors.warningSurface, padding: 11, borderRadius: 14,
    borderLeftWidth: 4, borderLeftColor: colors.warning, marginBottom: 10,
  },
  errorText: { color: colors.secondary, fontSize: 13, lineHeight: 19 },
});
