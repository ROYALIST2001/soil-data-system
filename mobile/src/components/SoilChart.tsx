import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { LineChart } from "react-native-chart-kit";

import { HistoryPoint } from "../types/analytics";

interface SoilChartProps {
  title: string;
  unit: string;
  points: HistoryPoint[];
  valueKey: "n" | "p" | "k" | "ph";
  color: string;
}

// Work out the trend, and turn it into a WORD.
//
// WHY? A chart shows the SHAPE. But a farmer wants to know:
// is this good or bad? A word answers that.
function getTrend(points: HistoryPoint[], key: string): string {
  if (points.length < 2) {
    return "Not enough readings to show a trend yet";
  }

  const first = (points[0] as any)[key];
  const last = (points[points.length - 1] as any)[key];
  const change = last - first;

  // Less than 5% change counts as stable.
  if (Math.abs(change) < first * 0.05) {
    return "Stable - little change over time";
  }

  // pH gets SPECIAL words, because acidic and alkaline
  // mean something specific to a farmer.
  if (key === "ph") {
    return change < 0
      ? `Becoming more acidic (down ${Math.abs(change).toFixed(1)})`
      : `Becoming more alkaline (up ${change.toFixed(1)})`;
  }

  return change < 0
    ? `Falling (down ${Math.abs(change).toFixed(1)})`
    : `Rising (up ${change.toFixed(1)})`;
}

export default function SoilChart({
  title,
  unit,
  points,
  valueKey,
  color,
}: SoilChartProps) {

  // No data. Show a MESSAGE, not an empty chart.
  // An empty chart looks BROKEN. A message explains.
  if (points.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>No data for {title} yet</Text>
      </View>
    );
  }

  // Pull out just the numbers we want to draw.
  const values = points.map((p) => (p as any)[valueKey] as number);

  // Build short date labels like "11 Jul".
  const labels = points.map((p) => {
    const d = new Date(p.date);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });

  // With 12 points, 12 labels would OVERLAP and become unreadable.
  // So we show only every third one.
  const step = Math.max(1, Math.ceil(labels.length / 4));
  const shownLabels = labels.map((l, i) => (i % step === 0 ? l : ""));

  const trend = getTrend(points, valueKey);

  // Chart width: the screen, minus the page padding.
  const chartWidth = Dimensions.get("window").width - 40;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {title} <Text style={styles.unit}>({unit})</Text>
      </Text>

      <LineChart
        data={{
          labels: shownLabels,
          datasets: [{ data: values, color: () => color, strokeWidth: 2 }],
        }}
        width={chartWidth}
        height={180}
        // The chart library needs colours as FUNCTIONS,
        // so it can fade them for gridlines.
        chartConfig={{
          backgroundColor: "#ffffff",
          backgroundGradientFrom: "#ffffff",
          backgroundGradientTo: "#ffffff",
          decimalPlaces: 1,
          color: (opacity = 1) => `rgba(64, 145, 108, ${opacity})`,
          labelColor: () => "#495057",
          propsForDots: { r: "4", strokeWidth: "2", stroke: color },
        }}
        bezier={false}   // straight lines. Curves can HIDE a sharp change.
        style={styles.chart}
      />

      <Text style={styles.trend}>{trend}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  title: { fontSize: 15, fontWeight: "bold", color: "#1b4332", marginBottom: 6 },
  unit: { fontSize: 12, fontWeight: "normal", color: "#868e96" },
  chart: { borderRadius: 8 },
  trend: { fontSize: 12, color: "#495057", marginTop: 4, fontStyle: "italic" },

  emptyBox: {
    padding: 20,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginBottom: 16,
    alignItems: "center",
  },
  emptyText: { color: "#868e96", fontSize: 13 },
});
