import React from "react";
import { View, Text, Button, StyleSheet } from "react-native";

import { useAppSelector, useAppDispatch } from "../store";
import { resetReading } from "../store/readingSlice";

export default function ResultScreen() {
  const dispatch = useAppDispatch();

  // Read the saved reading from the store.
  // NOTHING is passed into this screen. This is the benefit of Redux.
  const reading = useAppSelector((state) => state.reading.result);

  // Safety check. If there is nothing, draw nothing.
  // return null in React means "draw nothing".
  if (!reading) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reading Saved</Text>

      <Text style={styles.row}>Reading ID: {reading.reading_id}</Text>

      <Text style={styles.row}>
        Location: {reading.raw_lat.toFixed(5)}, {reading.raw_lng.toFixed(5)}
      </Text>

      {/* These two lines PROVE the location brain worked.
          ?? means: if the left side is empty, use the right side. */}
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
      <Text style={styles.row}>Quality: {reading.quality_flag}</Text>

      <View style={styles.buttonRow}>
        {/* Reset the store. The app goes back to the entry form. */}
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
});
