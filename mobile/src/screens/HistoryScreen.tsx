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

      if (level === "field" && lastReading.anchor_id) {
        fetchHistory("field", { anchorId: lastReading.anchor_id });

      } else if (level === "area") {
        fetchHistory("area", {
          lat: lastReading.raw_lat,
          lng: lastReading.raw_lng,
        });

      } else if (level === "district" && lastReading.district_id) {
        fetchHistory("district", { districtId: lastReading.district_id });
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
    <ScrollView contentContainerStyle={styles.container}>
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
              {l === "field" ? "My Field" : l === "area" ? "My Area" : "District"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {status === "loading" && (
        <ActivityIndicator size="large" color="#40916c" style={{ marginTop: 30 }} />
      )}

      {status === "error" && <Text style={styles.error}>{error}</Text>}

      {status === "success" && history && (
        <>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>{history.label}</Text>
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
                points={history.points} valueKey="ph" color="#e8842c"
              />
              <SoilChart
                title="Nitrogen" unit="mg/kg"
                points={history.points} valueKey="n" color="#40916c"
              />
              <SoilChart
                title="Phosphorus" unit="mg/kg"
                points={history.points} valueKey="p" color="#1b4332"
              />
              <SoilChart
                title="Potassium" unit="mg/kg"
                points={history.points} valueKey="k" color="#2d6a4f"
              />
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 50, paddingBottom: 40 },
  centre: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30 },

  title: { fontSize: 22, fontWeight: "bold", color: "#1b4332", marginBottom: 16 },

  tabRow: { flexDirection: "row", marginBottom: 16 },
  tab: {
    flex: 1, paddingVertical: 9, alignItems: "center",
    borderBottomWidth: 2, borderBottomColor: "#dee2e6",
  },
  tabActive: { borderBottomColor: "#40916c" },
  tabText: { fontSize: 13, color: "#868e96" },
  tabTextActive: { color: "#1b4332", fontWeight: "bold" },

  infoBox: {
    backgroundColor: "#f1f3f5", padding: 10,
    borderRadius: 8, marginBottom: 18,
  },
  infoLabel: { fontSize: 14, fontWeight: "bold", color: "#1b4332" },
  infoCount: { fontSize: 12, color: "#495057", marginTop: 2 },

  emptyBox: {
    padding: 24, backgroundColor: "#f8f9fa",
    borderRadius: 8, alignItems: "center",
  },
  emptyTitle: { fontSize: 17, fontWeight: "bold", color: "#1b4332", marginBottom: 8 },
  emptyText: { color: "#868e96", fontSize: 13, textAlign: "center", lineHeight: 19 },

  error: { color: "red", marginTop: 20, fontSize: 13 },
});
