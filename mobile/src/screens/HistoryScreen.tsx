import { colors, ui } from "../theme";
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import SoilChart from "../components/SoilChart";
import { useAnalytics } from "../hooks/useAnalytics";
import { useAppSelector } from "../store";

type Level = "field" | "area" | "district";

export default function HistoryScreen() {
  const [level, setLevel] = useState<Level>("field");

  const { fetchHistory } = useAnalytics();

  const status = useAppSelector((s) => s.analytics.historyStatus);
  const history = useAppSelector((s) => s.analytics.history);
  const error = useAppSelector((s) => s.analytics.historyError);

  // We need the last reading, to know WHICH field and district to show.
  const lastReading = useAppSelector((s) => s.reading.result);

  // useFocusEffect runs EVERY TIME you switch to this tab.
  //
  // WHY not useEffect? Because with tabs the screen STAYS ALIVE.
  // With useEffect it would fetch once and then show STALE data
  // after you submit a new reading.
  useFocusEffect(
    useCallback(() => {
      if (!lastReading) return;

      if (level === "field" && lastReading.land_id) {
        fetchHistory("land", { landId: lastReading.land_id });
      } else if (level === "field" && lastReading.anchor_id) {
        fetchHistory("field", { anchorId: lastReading.anchor_id });

      } else if (level === "area" && lastReading.gn_division_code) {
        fetchHistory("gn_division", { code: lastReading.gn_division_code });
      } else if (level === "area" && lastReading.raw_lat !== null && lastReading.raw_lng !== null) {
        fetchHistory("area", {
          lat: lastReading.raw_lat,
          lng: lastReading.raw_lng,
        });

      } else if (level === "district" && lastReading.district_id) {
        fetchHistory("district", { districtId: lastReading.district_id });
      } else {
        fetchHistory("field", {});
      }
    }, [level, lastReading])
  );

  // No reading submitted yet.
  if (!lastReading) {
    return (
      <View style={styles.centre}>
        <Text style={styles.emptyTitle}>No readings yet</Text>
        <Text style={styles.emptyText}>
          Go to the Test tab and submit a soil reading.
          Your history will appear here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Soil Trends</Text>

      {/* ---------- The three zoom levels ---------- */}
      <View style={styles.tabRow}>
        {(["field", "area", "district"] as Level[]).map((l) => (
          <TouchableOpacity
            key={l}
            style={[styles.tab, level === l && styles.tabActive]}
            onPress={() => setLevel(l)}
          >
            <Text style={[styles.tabText, level === l && styles.tabTextActive]}>
              {l === "field" ? "My Land" : l === "area" ? (lastReading.gn_division_code ? "GN Division" : "My Area") : "District"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {status === "loading" && (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} />
      )}

      {status === "error" && <Text style={styles.error}>{error}</Text>}

      {status === "success" && history && (
        <>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>{level === "field" ? "Your land" : history.label}</Text>
            {/* ALWAYS show the count. An average of 200 readings is
                trustworthy. An average of 1 is not. */}
            <Text style={styles.infoCount}>
              Based on {history.total_readings} reading
              {history.total_readings === 1 ? "" : "s"}
            </Text>
          </View>

          {history.points.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                No readings yet at this level. Submit more soil tests
                to build your history.
              </Text>
            </View>
          ) : (
            <>
              {/* FOUR SEPARATE CHARTS, not one combined.
                  WHY? Their ranges are completely different.
                  K goes to 320, pH only to 9. On one chart the
                  pH line would be a FLAT LINE at the bottom. */}
              <SoilChart
                title="Soil pH" unit="pH scale"
                points={history.points} valueKey="ph" color={colors.warning}
              />
              <SoilChart
                title="Nitrogen" unit="mg/kg"
                points={history.points} valueKey="n" color={colors.primary}
              />
              <SoilChart
                title="Phosphorus" unit="mg/kg"
                points={history.points} valueKey="p" color={colors.forest}
              />
              <SoilChart
                title="Potassium" unit="mg/kg"
                points={history.points} valueKey="k" color={colors.primary}
              />
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 20, paddingBottom: 40 },
  centre: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30 },

  title: { fontSize: 26, fontWeight: "700", color: colors.forest, marginBottom: 16 },

  tabRow: { flexDirection: "row", marginBottom: 20, backgroundColor: colors.sage, padding: 4, borderRadius: 15 },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 11,
  },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontSize: 13, color: colors.muted },
  tabTextActive: { color: colors.forest, fontWeight: "700" },

  infoBox: {
    backgroundColor: colors.sage, padding: 10,
    borderRadius: 14, marginBottom: 18,
  },
  infoLabel: { fontSize: 14, fontWeight: "700", color: colors.forest },
  infoCount: { fontSize: 12, color: colors.secondary, marginTop: 2 },

  emptyBox: {
    padding: 24, backgroundColor: colors.surface,
    borderRadius: 14, alignItems: "center",
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.forest, marginBottom: 8 },
  emptyText: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },

  error: { color: colors.danger, marginTop: 20, fontSize: 13 },
});
