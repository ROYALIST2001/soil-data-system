import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";

import InputField from "../components/InputField";
import AppButton from "../components/AppButton";
import Icon from "../components/Icon";
import { colors, ui } from "../theme";
import SelectField from "../components/SelectField";
import { CROPS, STAGES, MAX_YIELD, Option } from "../constants/vocabulary";
import { useLocation } from "../hooks/useLocation";
import { useSubmitReading } from "../hooks/useSubmitReading";
import { useLands } from "../hooks/useLands";
import { useAuth } from "../hooks/useAuth";
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

  // Who is sending this reading. Phase 10 links every reading to its farmer.
  const { farmer } = useAuth();

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

    if (!farmer) {
      Alert.alert("Not logged in", "Please log in again.");
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

      // NEW in Phase 10: the reading now knows whose it is.
      farmer_id: farmer.farmer_id,
      land_id: selectedLand.land_id,
      land_crop_id: selectedCrop.land_crop_id,
    };

    const saved = await submit(reading);

    // Move to the result screen.
    // With React Navigation we NAVIGATE, instead of relying
    // on the store status to swap screens.
    if (saved) navigation.navigate("Result");
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
    <ScrollView style={ui.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.greeting}>Hello, {farmer?.full_name.split(" ")[0] ?? "farmer"}</Text>
      <View style={styles.hero}>
        <View style={styles.heroArt}><Icon name="sprout" size={120} color="#729875" strokeWidth={1.2} /></View>
        <View style={styles.heroBadge}><View style={styles.dot} /><Text style={styles.heroBadgeText}>A HEALTHIER HARVEST</Text></View>
        <Text style={styles.heroTitle}>Good soil.{`\n`}Great possibilities.</Text>
        <Text style={styles.heroText}>A few readings today. Better decisions{`\n`}for your next growing season.</Text>
      </View>
      <View style={styles.intro}><Text style={ui.section}>Start a soil test</Text><Text style={styles.introNote}>Three simple steps</Text></View>
      <View style={ui.card}>
        <View style={styles.sectionHead}><Text style={styles.step}>01</Text><Text style={styles.sectionTitle}>Choose your field</Text><Icon name="field" size={21} /></View>
        <SelectField label="Land" value={String(selectedLand?.land_id ?? "")} options={lands.map((l) => ({ value: String(l.land_id), label: `${l.name} · ${l.size_ha.toFixed(2)} ha` }))} onSelect={handleLandChange} />
        {cropOptions.length > 0 ? <>
          <SelectField label="Crop on this land" value={landCropId} options={cropOptions} onSelect={setLandCropId} />
          <View style={styles.areaNote}><Icon name="sprout" size={16} /><Text style={styles.areaText}>Advice for your {area.toFixed(2)} hectare crop area</Text></View>
        </> : <Text style={styles.error}>This land has no crops yet. Add one in the Lands tab.</Text>}
      </View>
      <View style={ui.card}>
        <View style={styles.sectionHead}><Text style={styles.step}>02</Text><Text style={styles.sectionTitle}>Your soil readings</Text><Icon name="flask" size={21} /></View>
        <Text style={styles.sectionHint}>Enter the values from your soil test.</Text>
        <View style={styles.inputRow}>
          <View style={styles.inputColumn}><InputField label="Nitrogen (mg/kg)" value={n} onChangeText={setN} numeric placeholder="e.g. 40" /></View>
          <View style={styles.inputColumn}><InputField label="Phosphorus (mg/kg)" value={p} onChangeText={setP} numeric placeholder="e.g. 20" /></View>
        </View>
        <View style={styles.inputRow}>
          <View style={styles.inputColumn}><InputField label="Potassium (mg/kg)" value={k} onChangeText={setK} numeric placeholder="e.g. 80" /></View>
          <View style={styles.inputColumn}><InputField label="Soil pH (0–14)" value={ph} onChangeText={setPh} numeric placeholder="e.g. 6.5" /></View>
        </View>
      </View>
      <View style={ui.card}>
        <View style={styles.sectionHead}><Text style={styles.step}>03</Text><Text style={styles.sectionTitle}>Growth & location</Text><Icon name="location" size={21} /></View>
        <SelectField label="Growth stage" value={stage} options={STAGES} onSelect={setStage} />
        <InputField label="Target yield (tonnes per hectare)" value={targetYield} onChangeText={setTargetYield} numeric placeholder="Your expected yield" />
        {maxYieldForCrop !== undefined && <Text style={styles.hint}>Up to {maxYieldForCrop} tonnes per hectare for this crop.</Text>}
        <AppButton title={locating ? "Finding your field..." : lat !== null ? "Update field location" : "Capture field location"} onPress={handleGetLocation} loading={locating} variant="secondary" icon="location" />
        {lat !== null && lng !== null && <View style={styles.locationNote}><Icon name="check" size={17} /><Text style={styles.areaText}>Location captured · {lat.toFixed(4)}, {lng.toFixed(4)}</Text></View>}
        {locationError && <Text style={styles.error}>{locationError}</Text>}
      </View>
      {submitError && <View style={styles.errorBox}><Text style={styles.error}>{submitError}</Text></View>}
      <AppButton title="Save soil test" onPress={handleSubmit} loading={status === "loading"} disabled={cropOptions.length === 0} icon="arrow" />
      <Text style={styles.footer}>Your reading helps you understand and care for your land.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 8, paddingBottom: 32 },
  greeting: { fontSize: 13, color: colors.secondary, marginBottom: 14 },
  hero: { backgroundColor: colors.forest, borderRadius: 25, padding: 23, marginBottom: 26, overflow: "hidden" },
  heroArt: { position: "absolute", right: -18, bottom: 8, opacity: 0.35 },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 14 },
  dot: { width: 6, height: 6, backgroundColor: colors.lime, borderRadius: 3 },
  heroBadgeText: { color: colors.lime, fontSize: 9, letterSpacing: 1.5, fontWeight: "700" },
  heroTitle: { fontSize: 31, lineHeight: 37, fontWeight: "700", color: colors.surface, letterSpacing: -0.9 },
  heroText: { color: "#D2E1CE", fontSize: 12, lineHeight: 20, marginTop: 13 },
  intro: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  introNote: { fontSize: 11, color: colors.muted },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  step: { fontSize: 11, fontWeight: "700", color: colors.primary, backgroundColor: colors.sage, padding: 8, borderRadius: 10, overflow: "hidden" },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.forest },
  sectionHint: { fontSize: 12, color: colors.secondary, marginTop: -8, marginBottom: 18 },
  inputRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 12 },
  inputColumn: { flexGrow: 1, flexBasis: 130 },
  areaNote: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.sage, padding: 11, borderRadius: 10 },
  areaText: { fontSize: 11, color: colors.primary, flexShrink: 1, lineHeight: 17 },
  locationNote: { flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 12 },
  hint: { fontSize: 11, color: colors.muted, marginTop: -7, marginBottom: 18, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20, marginTop: 5 },
  errorBox: { backgroundColor: colors.dangerSurface, padding: 14, borderRadius: 14, marginBottom: 14 },
  footer: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 16 },
  centre: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30, backgroundColor: colors.background },
  emptyTitle: { fontSize: 22, fontWeight: "700", color: colors.forest, marginBottom: 8 },
  emptyText: { color: colors.secondary, fontSize: 14, textAlign: "center", lineHeight: 22 },
});
