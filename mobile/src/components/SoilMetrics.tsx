import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Reading } from "../types/reading";
import { colors } from "../theme";

export default function SoilMetrics({ reading }: { reading: Reading }) {
  const values = [
    { label: "Nitrogen", symbol: "N", value: reading.n, unit: "mg/kg" },
    { label: "Phosphorus", symbol: "P", value: reading.p, unit: "mg/kg" },
    { label: "Potassium", symbol: "K", value: reading.k, unit: "mg/kg" },
    { label: "Acidity", symbol: "pH", value: reading.ph, unit: "pH scale" },
  ];
  return (
    <View style={styles.grid}>
      {values.map((item) => (
        <View key={item.symbol} style={styles.metric} accessibilityLabel={`${item.label}: ${item.value} ${item.unit}`}>
          <Text style={styles.symbol}>{item.symbol}</Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{Number(item.value.toFixed(item.symbol === "pH" ? 2 : 1))}</Text>
          <Text style={styles.unit}>{item.unit}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: 8, marginTop: 16, marginBottom: 8 },
  metric: { flex: 1, paddingVertical: 14, paddingHorizontal: 6, backgroundColor: colors.sage, borderRadius: 15, alignItems: "center" },
  symbol: { color: colors.primary, fontWeight: "700", fontSize: 12, marginBottom: 7 },
  value: { fontSize: 21, fontWeight: "700", color: colors.forest },
  unit: { fontSize: 10, color: colors.secondary, marginTop: 4 },
});
