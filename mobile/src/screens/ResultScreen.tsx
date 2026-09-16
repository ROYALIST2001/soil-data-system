import React from "react";
import { View, Text, Button, StyleSheet } from "react-native";

import { useAppSelector, useAppDispatch } from "../store";
import { resetReading } from "../store/readingSlice";

// Decide what warning to show, based on the quality flag.
// We keep this OUT of the screen body, so the screen stays easy to read.
function getQualityMessage(flag: string) {
  if (flag === "QUARANTINED") {
    return {
      show: true,
      color: "#c92a2a", // red
      background: "#ffe3e3",
      title: "This reading looks wrong",
      text:
        "The values changed very sharply compared to your last test at this field. " +
        "Please check that you typed them correctly. " +
        "This reading is saved, but it will not be used in the graphs until it is reviewed.",
    };
  }

  if (flag === "FLAGGED") {
    return {
      show: true,
      color: "#e8842c", // orange
      background: "#ffe8cc",
      title: "This reading looks unusual",
      text:
        "The values changed more than expected since your last test at this field. " +
        "If you added lime or fertilizer recently, this may be correct. " +
        "This reading is saved, but it will not be used in the graphs until it is reviewed.",
    };
  }

  // Flag is OK. Show nothing.
  return { show: false, color: "", background: "", title: "", text: "" };
}

export default function ResultScreen() {
  const dispatch = useAppDispatch();

  // Read the saved reading from the store.
  const reading = useAppSelector((state) => state.reading.result);

  // Safety check. If there is nothing, draw nothing.
  if (!reading) {
    return null;
  }

  // Work out the warning, if any.
  const quality = getQualityMessage(reading.quality_flag);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reading Saved</Text>

      <Text style={styles.row}>Reading ID: {reading.reading_id}</Text>

      <Text style={styles.row}>
        Location: {reading.raw_lat.toFixed(5)}, {reading.raw_lng.toFixed(5)}
      </Text>

      {/* These two lines prove the location brain worked. */}
      <Text style={styles.row}>
        Field (anchor): {reading.anchor_id ?? "not matched"}
      </Text>
      <Text style={styles.row}>
        District ID: {reading.district_id ?? "outside all districts"}
      </Text>

      <Text style={styles.row}>
        Soil: N {reading.n} | P {reading.p} | K {reading.k} | pH {reading.ph}
      </Text>
      <Text style={styles.row}>Crop: {reading.crop}</Text>

      {/* NEW: show a clear warning box if the reading was flagged.
          The && means: if quality.show is false, draw nothing. */}
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

      <View style={styles.buttonRow}>
        <Button
          title="Enter Another Reading"
          onPress={() => dispatch(resetReading())}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  row: { fontSize: 16, marginBottom: 8 },
  buttonRow: { marginTop: 20 },

  // The warning box.
  warningBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
  },
  warningTitle: { fontSize: 15, fontWeight: "bold", marginBottom: 6 },
  warningText: { fontSize: 13, color: "#333", lineHeight: 19 },
});
