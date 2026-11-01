import { colors, ui } from "../theme";
import AppButton from "../components/AppButton";
import Icon from "../components/Icon";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";

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
  const navigation = useNavigation<any>();
  const message = useAppSelector((state) => state.recommendation.message);
  const rec = useAppSelector((state) => state.recommendation.result);

  // Safety check. Should never happen, but it costs nothing.
  if (!rec) {
    return <View style={styles.empty}><Icon name="flask" size={38} /><Text style={styles.title}>Advice isn't available yet.</Text><Text style={styles.noteText}>{message ?? "Open a saved soil test to get fertilizer advice."}</Text><AppButton title="Back to my soil test" onPress={() => navigation.goBack()} /></View>;
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={ui.eyebrow}>NOURISH YOUR NEXT HARVEST</Text>
      <Text style={styles.title}>The right nutrients.{`\n`}For your field.</Text>

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
      <Text style={styles.sectionTitle}>Nutrients your crop needs</Text>
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
          Amounts are calculated for your registered crop area.
        </Text>
      </View>

      <AppButton title="Back to my soil test" variant="secondary" onPress={() => { dispatch(resetRecommendation()); navigation.goBack(); }} style={{ marginTop: 12 }} />
      <AppButton title="Start another test" icon="plus" onPress={() => {
        dispatch(resetRecommendation()); dispatch(resetReading()); navigation.navigate("SoilEntry");
      }} style={{ marginTop: 12 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 22, paddingTop: 18, paddingBottom: 36 },
  empty: { ...ui.screen, justifyContent: "center", padding: 28, gap: 20 },
  title: { fontSize: 29, lineHeight: 36, fontWeight: "700", marginBottom: 23, color: colors.forest, letterSpacing: -0.8 },
  contextBox: { backgroundColor: colors.forest, padding: 19, borderRadius: 19, marginBottom: 26 },
  contextText: { fontSize: 12, color: "#E1EDDB", lineHeight: 22, textTransform: "capitalize" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.forest, marginTop: 8, marginBottom: 14 },
  productBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: colors.primary, borderRadius: 19, padding: 21, marginBottom: 12 },
  productBoxZero: { backgroundColor: colors.sage, borderLeftColor: colors.disabled },
  productName: { fontSize: 17, fontWeight: "700", color: colors.forest },
  productFullName: { fontSize: 11, color: colors.secondary, marginTop: 5, marginBottom: 10 },
  productAmount: { fontSize: 34, fontWeight: "700", color: colors.primary, letterSpacing: -1 },
  productAmountZero: { color: colors.muted },
  productRate: { fontSize: 12, color: colors.secondary, marginTop: 7 },
  notesBox: { backgroundColor: colors.warningSurface, padding: 16, borderRadius: 16, marginTop: 6, marginBottom: 16 },
  noteText: { fontSize: 13, color: colors.secondary, lineHeight: 22, marginBottom: 5 },
  technicalBox: { backgroundColor: colors.surface, padding: 18, borderRadius: 17, borderWidth: 1, borderColor: colors.border, marginBottom: 14 },
  technicalRow: { fontSize: 12, color: colors.secondary, marginBottom: 8, lineHeight: 19 },
  technicalNote: { fontSize: 11, color: colors.muted, marginTop: 8, lineHeight: 18 },
});
