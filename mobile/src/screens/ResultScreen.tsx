import React from "react";
import { View, Text, Button, ScrollView, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { useAppSelector, useAppDispatch } from "../store";
import { resetReading } from "../store/readingSlice";
import { useRecommendation } from "../hooks/useRecommendation";

// Decide what quality warning to show.
function getQualityMessage(flag: string) {
  if (flag === "QUARANTINED") {
    return {
      show: true,
      color: "#c92a2a",
      background: "#ffe3e3",
      title: "This reading looks wrong",
      text:
        "The values changed very sharply compared to your last test at this field. " +
        "Please check that you typed them correctly. " +
        "This reading is saved, but no fertilizer advice can be given from it.",
    };
  }

  if (flag === "FLAGGED") {
    return {
      show: true,
      color: "#e8842c",
      background: "#ffe8cc",
      title: "This reading looks unusual",
      text:
        "The values changed more than expected since your last test at this field. " +
        "If you added lime or fertilizer recently, this may be correct. " +
        "This reading is saved, but no fertilizer advice can be given from it.",
    };
  }

  return { show: false, color: "", background: "", title: "", text: "" };
}

export default function ResultScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const reading = useAppSelector((state) => state.reading.result);

  // NEW: the recommendation state and hook.
  const recStatus = useAppSelector((state) => state.recommendation.status);
  const recMessage = useAppSelector((state) => state.recommendation.message);
  const { fetchRecommendation } = useRecommendation();

  if (!reading) {
    return null;
  }

  const quality = getQualityMessage(reading.quality_flag);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Reading Saved</Text>

      <Text style={styles.row}>Reading ID: {reading.reading_id}</Text>
      <Text style={styles.row}>
        Location: {reading.raw_lat.toFixed(5)}, {reading.raw_lng.toFixed(5)}
      </Text>
      <Text style={styles.row}>
        Field (anchor): {reading.anchor_id ?? "not matched"}
      </Text>
      <Text style={styles.row}>
        District ID: {reading.district_id ?? "outside all districts"}
      </Text>
      <Text style={styles.row}>Zone: {reading.zone}</Text>
      <Text style={styles.row}>
        Soil: N {reading.n} | P {reading.p} | K {reading.k} | pH {reading.ph}
      </Text>
      <Text style={styles.row}>Crop: {reading.crop}</Text>

      {/* Quality warning, if any. */}
      {quality.show && (
        <View
          style={[
            styles.warningBox,
            { backgroundColor: quality.background, borderColor: quality.color },
          ]}
        >
          <Text style={[styles.warningTitle, { color: quality.color }]}>
            {quality.title}
          </Text>
          <Text style={styles.warningText}>{quality.text}</Text>
        </View>
      )}

      {/* ---------- NEW: the recommendation button ----------
          ONLY shown if the reading passed the quality check.
          Showing a button that ALWAYS fails is bad design. */}
      {reading.quality_flag === "OK" && (
        <View style={styles.buttonRow}>
          <Button
            title={
              recStatus === "loading"
                ? "Getting advice..."
                : "Get Fertilizer Recommendation"
            }
            onPress={async () => {
              await fetchRecommendation(reading.reading_id);
              navigation.navigate("Recommendation");
            }}
            disabled={recStatus === "loading"}
          />
        </View>
      )}

      {/* The reading was flagged. Calm ORANGE, not a red crash. */}
      {recStatus === "flagged" && (
        <View style={styles.flaggedBox}>
          <Text style={styles.flaggedText}>{recMessage}</Text>
        </View>
      )}

      {/* A real error. Red. */}
      {recStatus === "error" && (
        <Text style={styles.error}>{recMessage}</Text>
      )}

      <View style={styles.buttonRow}>
        <Button
          title="Enter Another Reading"
          onPress={() => {
            dispatch(resetReading());
            navigation.navigate("SoilEntry");
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  row: { fontSize: 16, marginBottom: 8 },
  buttonRow: { marginTop: 16 },

  warningBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
  },
  warningTitle: { fontSize: 15, fontWeight: "bold", marginBottom: 6 },
  warningText: { fontSize: 13, color: "#333", lineHeight: 19 },

  flaggedBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#ffe8cc",
    borderLeftWidth: 4,
    borderLeftColor: "#e8842c",
  },
  flaggedText: { fontSize: 13, color: "#495057", lineHeight: 19 },

  error: { color: "red", marginTop: 14, fontSize: 13 },
});
