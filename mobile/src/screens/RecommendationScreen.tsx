import React from "react";
import { View, Text, Button, ScrollView, StyleSheet } from "react-native";

import { useAppSelector, useAppDispatch } from "../store";
import { resetRecommendation } from "../store/recommendationSlice";
import { resetReading } from "../store/readingSlice";

// One product box. Used three times.
//
// DESIGN RULE: the most important information should be
// the most VISIBLE. So the "kg to buy" number is the biggest thing.
function ProductBox({
  name,
  fullName,
  total,
  perHa,
}: {
  name: string;
  fullName: string;
  total: number;
  perHa: number;
}) {
  // If the amount is zero, show it greyed out.
  // HIDING it would confuse the farmer - they would think
  // the app forgot something.
  const isZero = total <= 0;

  return (
    <View style={[styles.productBox, isZero && styles.productBoxZero]}>
      <Text style={styles.productName}>{name}</Text>
      <Text style={styles.productFullName}>{fullName}</Text>

      {/* THE BIGGEST NUMBER ON THE SCREEN. This is what they buy. */}
      <Text style={[styles.productAmount, isZero && styles.productAmountZero]}>
        {total.toFixed(1)} kg
      </Text>

      <Text style={styles.productRate}>
        {perHa.toFixed(1)} kg per hectare
      </Text>
    </View>
  );
}

export default function RecommendationScreen() {
  const dispatch = useAppDispatch();
  const rec = useAppSelector((state) => state.recommendation.result);

  // Safety check. Should never happen, but it costs nothing.
  if (!rec) {
    return null;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Fertilizer Recommendation</Text>

      {/* ---------- Context ---------- */}
      <View style={styles.contextBox}>
        <Text style={styles.contextText}>
          {rec.crop} · {rec.stage} stage · {rec.zone} zone
        </Text>
        <Text style={styles.contextText}>
          Field size: {rec.area_ha} hectares
        </Text>
      </View>

      {/* ---------- THE MAIN ANSWER ---------- */}
      <Text style={styles.sectionTitle}>What to buy for your field</Text>

      <ProductBox
        name="Urea"
        fullName="46% Nitrogen"
        total={rec.urea_total}
        perHa={rec.urea_per_ha}
      />

      <ProductBox
        name="DAP"
        fullName="18% N, 46% Phosphate"
        total={rec.dap_total}
        perHa={rec.dap_per_ha}
      />

      <ProductBox
        name="MOP"
        fullName="60% Potash"
        total={rec.mop_total}
        perHa={rec.mop_per_ha}
      />

      {/* ---------- Notes ----------
          These explain anything unusual, for example
          "no urea needed because DAP already supplies enough". */}
      {rec.notes.length > 0 && (
        <View style={styles.notesBox}>
          {rec.notes.map((note, i) => (
            <Text key={i} style={styles.noteText}>
              • {note}
            </Text>
          ))}
        </View>
      )}

      {/* ---------- Technical detail ----------
          SMALL, because a farmer does not need this.
          But an agricultural officer can use it to CHECK our
          chemistry, and your report can show it. */}
      <Text style={styles.sectionTitle}>Nutrient need (technical)</Text>
      <View style={styles.technicalBox}>
        <Text style={styles.technicalRow}>
          Nitrogen (N): {rec.need_n_per_ha} kg per hectare
        </Text>
        <Text style={styles.technicalRow}>
          Phosphorus (P): {rec.need_p_per_ha} kg per hectare
        </Text>
        <Text style={styles.technicalRow}>
          Potassium (K): {rec.need_k_per_ha} kg per hectare
        </Text>
        <Text style={styles.technicalNote}>
          Predicted by: {rec.predictor}
        </Text>
      </View>

      {/* ---------- Buttons ---------- */}
      <View style={styles.buttonRow}>
        <Button
          title="Back to Reading"
          onPress={() => dispatch(resetRecommendation())}
        />
      </View>

      <View style={styles.buttonRow}>
        <Button
          title="Enter Another Reading"
          onPress={() => {
            // Clear BOTH slices, so the app starts fresh.
            dispatch(resetRecommendation());
            dispatch(resetReading());
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16, color: "#1b4332" },

  contextBox: {
    backgroundColor: "#f1f3f5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  contextText: { fontSize: 14, color: "#495057", marginBottom: 2 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1b4332",
    marginTop: 8,
    marginBottom: 10,
  },

  // The product boxes. Green, because this is the good news.
  productBox: {
    backgroundColor: "#d8f3dc",
    borderWidth: 2,
    borderColor: "#40916c",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  productBoxZero: {
    backgroundColor: "#f1f3f5",
    borderColor: "#adb5bd",
  },
  productName: { fontSize: 17, fontWeight: "bold", color: "#1b4332" },
  productFullName: { fontSize: 12, color: "#495057", marginBottom: 6 },

  // THE BIGGEST TEXT ON THE SCREEN.
  productAmount: { fontSize: 30, fontWeight: "bold", color: "#1b4332" },
  productAmountZero: { color: "#868e96" },

  productRate: { fontSize: 13, color: "#495057", marginTop: 2 },

  notesBox: {
    backgroundColor: "#fff9db",
    borderLeftWidth: 4,
    borderLeftColor: "#e8842c",
    padding: 12,
    borderRadius: 6,
    marginTop: 6,
    marginBottom: 10,
  },
  noteText: { fontSize: 13, color: "#495057", lineHeight: 19, marginBottom: 4 },

  technicalBox: {
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  technicalRow: { fontSize: 13, color: "#495057", marginBottom: 3 },
  technicalNote: { fontSize: 11, color: "#868e96", marginTop: 6 },

  buttonRow: { marginTop: 10 },
});
