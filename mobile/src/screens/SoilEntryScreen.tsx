import React, { useState } from "react";
import { View, Text, Button, ScrollView, StyleSheet, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";

import InputField from "../components/InputField";
import SelectField from "../components/SelectField";
import { CROPS, STAGES, MAX_YIELD, Option } from "../constants/vocabulary";
import { useLocation } from "../hooks/useLocation";
import { useSubmitReading } from "../hooks/useSubmitReading";
import { useLands } from "../hooks/useLands";
import { useAppSelector } from "../store";
import { NewReading } from "../types/reading";

function cropLabel(value: string): string {
  const found = CROPS.find((c) => c.value === value);
  return found ? found.label : value;
}

export default function SoilEntryScreen() {
  const navigation = useNavigation<any>();

  // ---------- THE FARMER'S REGISTERED LAND ----------
  //
  // CHANGED in Phase 9: the crop and the area are no longer typed. They come
  // from the land the farmer registered.
  //
  // WHY THIS IS BETTER THAN TYPING. The area decides the total kilograms of
  // fertilizer, so a typo there is a wrong shopping list. Registering the
  // land once and reusing it means the number is the same on every test, and
  // the history for that land actually lines up.
  const { lands } = useLands();

  const [landId, setLandId] = useState<number | null>(
    lands.length > 0 ? lands[0].land_id : null
  );

  const selectedLand = lands.find((l) => l.land_id === landId) ?? lands[0];

  // The crops on the chosen land, as options for the dropdown.
  const cropOptions: Option[] = selectedLand
    ? selectedLand.crops.map((c) => ({
        value: String(c.land_crop_id),
        // Show the size too, so the farmer can see which patch this is.
        label: `${cropLabel(c.crop)} — ${c.size_ha.toFixed(2)} ha`,
      }))
    : [];

  const [landCropId, setLandCropId] = useState<string>(
    cropOptions.length > 0 ? cropOptions[0].value : ""
  );

  // The actual crop row the farmer picked.
  const selectedCrop =
    selectedLand?.crops.find((c) => String(c.land_crop_id) === landCropId) ??
    selectedLand?.crops[0];

  // ---------- FORM STATE ----------
  // Numbers are kept as TEXT while typing. We convert at submit time.
  const [n, setN] = useState("");
  const [p, setP] = useState("");
  const [k, setK] = useState("");
  const [ph, setPh] = useState("");
  const [targetYield, setTargetYield] = useState("");

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

  // The crop and area now come from the chosen land, not from text boxes.
  const crop = selectedCrop?.crop ?? "";
  const area = selectedCrop?.size_ha ?? 0;

  // The maximum yield for whichever crop is chosen right now.
  // This is read during render, so it updates automatically
  // when the farmer picks a different crop.
  const maxYieldForCrop = crop ? MAX_YIELD[crop] : undefined;

  // When the farmer switches land, the crop chosen on the OLD land is
  // meaningless. Pick the first crop on the new land instead.
  function handleLandChange(value: string) {
    const newId = parseInt(value, 10);
    setLandId(newId);

    const newLand = lands.find((l) => l.land_id === newId);
    setLandCropId(
      newLand && newLand.crops.length > 0
        ? String(newLand.crops[0].land_crop_id)
        : ""
    );
  }

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
    if (!selectedLand || !selectedCrop) {
      Alert.alert(
        "Land needed",
        "Please choose which land and crop this test is for."
      );
      return;
    }

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
      crop: crop,     // from the registered land, so always a valid key
      stage: stage,
      target_yield: parseFloat(targetYield),
      area: area,     // the registered size of this crop, not typed
    };

    await submit(reading);

    // Move to the result screen.
    // With React Navigation we NAVIGATE, instead of relying
    // on the store status to swap screens.
    navigation.navigate("Result");
  }

  // ---------- No land registered ----------
  //
  // Should not happen, because registration comes before this screen. But a
  // farmer can remove every land from the My Lands tab, and then this screen
  // has nothing to attach a test to.
  if (lands.length === 0) {
    return (
      <View style={styles.centre}>
        <Text style={styles.emptyTitle}>No land registered</Text>
        <Text style={styles.emptyText}>
          Go to the My Lands tab and register a land first. A soil test has
          to belong to a piece of land.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Soil Data Entry</Text>

      {/* NEW in Phase 9: which land, and which crop on it. */}
      <SelectField
        label="Land"
        value={String(selectedLand?.land_id ?? "")}
        options={lands.map((l) => ({
          value: String(l.land_id),
          label: `${l.name} — ${l.size_ha.toFixed(2)} ha`,
        }))}
        onSelect={handleLandChange}
      />

      {cropOptions.length > 0 ? (
        <>
          <SelectField
            label="Crop on this land"
            value={landCropId}
            options={cropOptions}
            onSelect={setLandCropId}
          />
          <Text style={styles.hint}>
            Area used for the recommendation: {area.toFixed(2)} hectares
          </Text>
        </>
      ) : (
        <Text style={styles.error}>
          This land has no crops yet. Add one in the My Lands tab.
        </Text>
      )}

      {/* CHANGED: units are now shown on every number field. */}
      <InputField label="Nitrogen (N) — mg/kg" value={n} onChangeText={setN} numeric />
      <InputField label="Phosphorus (P) — mg/kg" value={p} onChangeText={setP} numeric />
      <InputField label="Potassium (K) — mg/kg" value={k} onChangeText={setK} numeric />
      <InputField label="pH" value={ph} onChangeText={setPh} numeric />

      <SelectField label="Growth Stage" value={stage} options={STAGES} onSelect={setStage} />

      <InputField
        label="Target Yield — tonnes per hectare"
        value={targetYield}
        onChangeText={setTargetYield}
        numeric
      />
      {/* A helpful hint. The Go server enforces the real limit. */}
      {maxYieldForCrop !== undefined && (
        <Text style={styles.hint}>
          Maximum for this crop: {maxYieldForCrop} tonnes per hectare
        </Text>
      )}

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
          disabled={status === "loading" || cropOptions.length === 0}
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

  centre: {
    flex: 1, justifyContent: "center",
    alignItems: "center", padding: 30,
  },
  emptyTitle: {
    fontSize: 18, fontWeight: "bold",
    color: "#1b4332", marginBottom: 8,
  },
  emptyText: {
    color: "#868e96", fontSize: 14,
    textAlign: "center", lineHeight: 20,
  },
});
