import { colors, ui } from "../theme";
import React, { useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { useAnalytics } from "../hooks/useAnalytics";
import { useAppSelector } from "../store";

const CLUSTER_COLORS = [
  colors.warning, colors.primary, "#c92a2a", "#1971c2", "#9c36b5", "#f59f00",
];

export default function ClustersScreen() {
  const { fetchClusters } = useAnalytics();

  const status = useAppSelector((s) => s.analytics.clusterStatus);
  const clusters = useAppSelector((s) => s.analytics.clusters);
  const message = useAppSelector((s) => s.analytics.clusterMessage);

  useFocusEffect(
    useCallback(() => {
      fetchClusters();
    }, [])
  );

  return (
    <ScrollView style={ui.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Regional Soil Groups</Text>

      {status === "loading" && (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} />
      )}

      {/* Not enough districts. A CALM explanation, not a red error. */}
      {status === "not_enough_data" && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Not enough data yet</Text>
          <Text style={styles.infoText}>{message}</Text>
          <Text style={styles.infoText}>
            Grouping needs soil readings from at least 4 different districts.
          </Text>
        </View>
      )}

      {status === "error" && <Text style={styles.error}>{message}</Text>}

      {status === "success" && clusters && (
        <>
          {/* ---------- The quality summary ---------- */}
          <View style={styles.qualityBox}>
            <Text style={styles.qualityTitle}>
              {clusters.chosen_k} soil groups found
            </Text>
            <Text style={styles.qualityText}>
              Quality: {clusters.quality}
            </Text>
            <Text style={styles.qualitySmall}>
              Silhouette score: {clusters.silhouette_score} · Elbow method
              suggested K = {clusters.elbow_k}
            </Text>
          </View>

          {/* ---------- Each group ---------- */}
          {clusters.clusters.map((c) => (
            <View
              key={c.cluster_id}
              style={[
                styles.clusterBox,
                { borderLeftColor: CLUSTER_COLORS[c.cluster_id % CLUSTER_COLORS.length] },
              ]}
            >
              <Text style={styles.clusterTitle}>{c.description}</Text>
              <Text style={styles.clusterCount}>
                {c.district_count} district{c.district_count === 1 ? "" : "s"}
              </Text>
              <Text style={styles.clusterNames}>
                {c.district_names.join(", ")}
              </Text>

              <View style={styles.centreRow}>
                <Text style={styles.centreText}>
                  Average: N {c.centre_n} · P {c.centre_p} · K {c.centre_k} · pH {c.centre_ph}
                </Text>
              </View>
            </View>
          ))}

          {/* ---------- The elbow data, for your report ---------- */}
          <Text style={styles.sectionTitle}>How K was chosen</Text>
          <View style={styles.evalBox}>
            <Text style={styles.evalHeader}>K    Inertia    Silhouette</Text>
            {clusters.evaluations.map((e) => (
              <Text
                key={e.k}
                style={[
                  styles.evalRow,
                  e.k === clusters.chosen_k && styles.evalRowChosen,
                ]}
              >
                {e.k}    {e.inertia.toFixed(2)}      {e.silhouette.toFixed(3)}
                {e.k === clusters.chosen_k ? "   <- chosen" : ""}
              </Text>
            ))}
            <Text style={styles.evalNote}>
              Lower inertia means tighter groups. Higher silhouette means
              better separated groups. We choose the K with the best silhouette.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: "700", color: colors.forest, marginBottom: 16 },

  qualityBox: {
    backgroundColor: colors.sage, padding: 12,
    borderRadius: 14, marginBottom: 18,
  },
  qualityTitle: { fontSize: 16, fontWeight: "700", color: colors.forest },
  qualityText: { fontSize: 13, color: colors.primary, marginTop: 2 },
  qualitySmall: { fontSize: 11, color: colors.secondary, marginTop: 4 },

  clusterBox: {
    backgroundColor: colors.surface, padding: 12,
    borderRadius: 14, marginBottom: 12,
    borderLeftWidth: 5,
  },
  clusterTitle: { fontSize: 15, fontWeight: "700", color: colors.forest },
  clusterCount: { fontSize: 12, color: colors.muted, marginTop: 2 },
  clusterNames: { fontSize: 13, color: colors.secondary, marginTop: 6 },
  centreRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  centreText: { fontSize: 11, color: colors.muted },

  sectionTitle: {
    fontSize: 15, fontWeight: "700",
    color: colors.forest, marginTop: 14, marginBottom: 8,
  },
  evalBox: { backgroundColor: colors.sage, padding: 12, borderRadius: 14 },
  evalHeader: { fontSize: 12, fontWeight: "700", color: colors.forest, marginBottom: 4 },
  evalRow: { fontSize: 12, color: colors.secondary, marginBottom: 2 },
  evalRowChosen: { fontWeight: "700", color: colors.forest },
  evalNote: { fontSize: 11, color: colors.muted, marginTop: 8, lineHeight: 16 },

  infoBox: {
    backgroundColor: "#fff9db", padding: 14, borderRadius: 14,
    borderLeftWidth: 4, borderLeftColor: colors.warning,
  },
  infoTitle: { fontSize: 15, fontWeight: "700", color: colors.forest, marginBottom: 6 },
  infoText: { fontSize: 13, color: colors.secondary, lineHeight: 19, marginBottom: 4 },

  error: { color: colors.danger, marginTop: 20, fontSize: 13 },
});
