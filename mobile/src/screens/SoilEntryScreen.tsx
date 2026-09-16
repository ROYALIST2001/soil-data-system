import React, { useState } from "react";
import { View, Text, Button, ScrollView, StyleSheet, Alert } from "react-native";

import InputField from "../components/InputField";
import { useLocation } from "../hooks/useLocation";
import { useSubmitReading } from "../hooks/useSubmitReading";
import { useAppSelector } from "../store";
import { NewReading } from "../types/reading";

export default function SoilEntryScreen() {

  // ---------- FORM STATE ----------
  // These are TEXT, not numbers. TextInput always gives text.
  // We convert to numbers only at submit time, using parseFloat.
  // Why? Because while typing, "6." is not a valid number yet.
  const [n, setN] = useState("");
  const [p, setP] = useState("");
  const [k, setK] = useState("");
  const [ph, setPh] = useState("");
  const [crop, setCrop] = useState("Rice");
  const [stage, setStage] = useState("vegetative");
  const [targetYield, setTargetYield] = useState("");
  const [area, setArea] = useState("");

  // ---------- LOCATION STATE ----------
  // null means "not captured yet".
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // ---------- LOGIC LAYER ----------
  // "loading: locating" RENAMES loading to locating,
  // because we have two different loading states in this screen.
  const { getCurrentLocation, loading: locating, error: locationError } = useLocation();
  const { submit } = useSubmitReading();

  // ---------- READ FROM THE STORE ----------
  // When these values change, this screen redraws automatically.
  const status = useAppSelector((state) => state.reading.status);
  const submitError = useAppSelector((state) => state.reading.error);

  // ---------- BUTTON 1: capture the location ----------
  async function handleGetLocation() {
    const coords = await getCurrentLocation();

    // If it worked, save the two numbers.
    // If it failed, the hook already set an error message.
    if (coords) {
      setLat(coords.lat);
      setLng(coords.lng);
    }
  }

  // ---------- BUTTON 2: send everything to the API ----------
  async function handleSubmit() {

    // The location is required. Stop if we do not have it.
    if (lat === null || lng === null) {
      Alert.alert("Location needed", "Please capture your location first.");
      return;
    }

    // NOW we turn the text values into numbers.
    const reading: NewReading = {
      raw_lat: lat,
      raw_lng: lng,
      n: parseFloat(n),
      p: parseFloat(p),
      k: parseFloat(k),
      ph: parseFloat(ph),
      crop: crop,
      stage: stage,
      target_yield: parseFloat(targetYield),
      area: parseFloat(area),
    };

    // Hand it to the logic layer. The screen's job is finished.
    await submit(reading);
  }

  return (
    // ScrollView lets the user scroll, because the form is long.
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Soil Data Entry</Text>

      {/* The SAME component used 8 times, with different props. */}
      <InputField label="Nitrogen (N)" value={n} onChangeText={setN} numeric />
      <InputField label="Phosphorus (P)" value={p} onChangeText={setP} numeric />
      <InputField label="Potassium (K)" value={k} onChangeText={setK} numeric />
      <InputField label="pH" value={ph} onChangeText={setPh} numeric />
      <InputField label="Crop" value={crop} onChangeText={setCrop} />
      <InputField label="Growth Stage" value={stage} onChangeText={setStage} />
      <InputField label="Target Yield (t)" value={targetYield} onChangeText={setTargetYield} numeric />
      <InputField label="Field Area (ha)" value={area} onChangeText={setArea} numeric />

      <View style={styles.buttonRow}>
        <Button
          title={locating ? "Getting location..." : "Get My Location"}
          onPress={handleGetLocation}
        />
      </View>

      {/* Show this ONLY if we have coordinates.
          The && means: if the left side is false, draw nothing. */}
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
          // Disabled while saving, so the user cannot press twice
          // and create two readings by mistake.
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
});
