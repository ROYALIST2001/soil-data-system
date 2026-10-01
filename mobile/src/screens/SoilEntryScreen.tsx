import React, { useState } from "react";
import { View, Text, Button, ScrollView, StyleSheet, Alert } from "react-native";

import InputField from "../components/InputField";
import SelectField from "../components/SelectField";
import { CROPS, STAGES, MAX_YIELD } from "../constants/vocabulary";
import { useLocation } from "../hooks/useLocation";
import { useSubmitReading } from "../hooks/useSubmitReading";
import { useAppSelector } from "../store";
import { NewReading } from "../types/reading";

export default function SoilEntryScreen() {

  // ---------- FORM STATE ----------
  // Numbers are kept as TEXT while typing. We convert at submit time.
  const [n, setN] = useState("");
  const [p, setP] = useState("");
  const [k, setK] = useState("");
  const [ph, setPh] = useState("");
  const [targetYield, setTargetYield] = useState("");
  const [area, setArea] = useState("");

  // CHANGED: crop and stage are now chosen from a list, not typed.
  // The starting values must be real keys from vocabulary.ts.
  const [crop, setCrop] = useState("rice");
  const [stage, setStage] = useState("vegetative");

  // ---------- LOCATION STATE ----------
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // ---------- LOGIC LAYER ----------
  const { getCurrentLocation, loading: locating, error: locationError } = useLocation();
  const { submit } = useSubmitReading();

  // ---------- READ FROM THE STORE ----------
  const status = useAppSelector((state) => state.reading.status);
  const submitError = useAppSelector((state) => state.reading.error);

  // The maximum yield for whichever crop is chosen right now.
  // This is read during render, so it updates automatically
  // when the farmer picks a different crop.
  const maxYieldForCrop = MAX_YIELD[crop];

  // ---------- BUTTON 1: capture the location ----------
  async function handleGetLocation() {
    const coords = await getCurrentLocation();
    if (coords) {
      setLat(coords.lat);
      setLng(coords.lng);
    }
  }

  // ---------- BUTTON 2: send everything to the API ----------
  async function handleSubmit() {
    if (lat === null || lng === null) {
      Alert.alert("Location needed", "Please capture your location first.");
      return;
    }

    const reading: NewReading = {
      raw_lat: lat,
      raw_lng: lng,
      n: parseFloat(n),
      p: parseFloat(p),
      k: parseFloat(k),
      ph: parseFloat(ph),
      crop: crop,     // always a valid key, because it came from the list
      stage: stage,   // same
      target_yield: parseFloat(targetYield),
      area: parseFloat(area),
    };

    await submit(reading);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Soil Data Entry</Text>

      {/* CHANGED: units are now shown on every number field. */}
      <InputField label="Nitrogen (N) — mg/kg" value={n} onChangeText={setN} numeric />
      <InputField label="Phosphorus (P) — mg/kg" value={p} onChangeText={setP} numeric />
      <InputField label="Potassium (K) — mg/kg" value={k} onChangeText={setK} numeric />
      <InputField label="pH" value={ph} onChangeText={setPh} numeric />

      {/* CHANGED: dropdowns instead of text boxes.
          Now a wrong word is IMPOSSIBLE, not just caught later. */}
      <SelectField label="Crop" value={crop} options={CROPS} onSelect={setCrop} />
      <SelectField label="Growth Stage" value={stage} options={STAGES} onSelect={setStage} />

      <InputField
        label="Target Yield — tonnes per hectare"
        value={targetYield}
        onChangeText={setTargetYield}
        numeric
      />
      {/* A helpful hint. The Go server enforces the real limit. */}
      <Text style={styles.hint}>
        Maximum for this crop: {maxYieldForCrop} tonnes per hectare
      </Text>

      <InputField label="Field Area — hectares" value={area} onChangeText={setArea} numeric />

      <View style={styles.buttonRow}>
        <Button
          title={locating ? "Getting location..." : "Get My Location"}
          onPress={handleGetLocation}
        />
      </View>

      {lat !== null && lng !== null && (
        <Text style={styles.info}>
          Location captured: {lat.toFixed(5)}, {lng.toFixed(5)}
        </Text>
      )}

      {locationError && <Text style={styles.error}>{locationError}</Text>}

      <View style={styles.buttonRow}>
        <Button
          title={status === "loading" ? "Saving..." : "Submit Reading"}
          onPress={handleSubmit}
          disabled={status === "loading"}
        />
      </View>

      {submitError && <Text style={styles.error}>{submitError}</Text>}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  buttonRow: { marginVertical: 10 },
  info: { color: "green", marginVertical: 6 },
  error: { color: "red", marginVertical: 6 },
  hint: { fontSize: 12, color: "#666", marginTop: -6, marginBottom: 12 },
});
