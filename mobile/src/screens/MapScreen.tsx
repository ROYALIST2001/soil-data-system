import { colors } from "../theme";
import React, { useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useFocusEffect } from "@react-navigation/native";

import { useAnalytics } from "../hooks/useAnalytics";
import { useAppSelector } from "../store";

// One colour per cluster.
//
// WHY COLOUR? Because the human eye finds patterns in colour
// INSTANTLY. A table of 25 districts takes a minute to read.
// A coloured map takes one second.
const CLUSTER_COLORS = [
  colors.warning, // orange
  colors.primary, // green
  "#c92a2a", // red
  "#1971c2", // blue
  "#9c36b5", // purple
  "#f59f00", // yellow
];

// Sri Lanka, centred.
//
// DELTA = how much of the world to show.
//   0.05 is about 5.5 km
//   3.5  is about 385 km  <-- all of Sri Lanka
// SMALLER delta means MORE zoomed in.
const SRI_LANKA = {
  latitude: 7.8731,
  longitude: 80.7718,
  latitudeDelta: 3.5,
  longitudeDelta: 3.0,
};

export default function MapScreen() {
  const { fetchClusters } = useAnalytics();

  const status = useAppSelector((s) => s.analytics.clusterStatus);
  const clusters = useAppSelector((s) => s.analytics.clusters);
  const lastReading = useAppSelector((s) => s.reading.result);

  // Refresh every time you switch to this tab.
  useFocusEffect(
    useCallback(() => {
      fetchClusters();
    }, [])
  );

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={SRI_LANKA}>

        {/* The farmer's own reading, if there is one. */}
        {lastReading && (
          <Marker
            coordinate={{
              latitude: lastReading.raw_lat,
              longitude: lastReading.raw_lng,
            }}
            title="My field"
            description={`pH ${lastReading.ph} · ${lastReading.crop}`}
            pinColor={colors.forest}
          />
        )}
      </MapView>

      {/* ---------- The legend, floating over the map ---------- */}
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Soil Groups</Text>

        {status === "loading" && (
          <ActivityIndicator size="small" color={colors.primary} />
        )}

        {status === "not_enough_data" && (
          <Text style={styles.legendNote}>
            Not enough districts have data yet for grouping.
          </Text>
        )}

        {status === "success" && clusters && (
          <>
            {clusters.clusters.map((c) => (
              <View key={c.cluster_id} style={styles.legendRow}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: CLUSTER_COLORS[c.cluster_id % CLUSTER_COLORS.length] },
                  ]}
                />
                <Text style={styles.legendText} numberOfLines={1}>
                  {c.description} ({c.district_count})
                </Text>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  // The legend FLOATS over the map.
  // position: "absolute" takes it out of the normal layout.
  legend: {
    position: "absolute",
    bottom: 20,
    left: 12,
    right: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 18,
    padding: 12,
  },
  legendTitle: {
    fontSize: 14, fontWeight: "700",
    color: colors.forest, marginBottom: 6,
  },
  legendRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  swatch: { width: 14, height: 14, borderRadius: 3, marginRight: 8 },
  legendText: { fontSize: 12, color: colors.secondary, flex: 1 },
  legendNote: { fontSize: 12, color: colors.muted },
});
