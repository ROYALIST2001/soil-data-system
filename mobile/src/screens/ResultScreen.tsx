import { colors, ui } from "../theme";
import AppButton from "../components/AppButton";
import Icon from "../components/Icon";
import SoilMetrics from "../components/SoilMetrics";
import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { useAppSelector, useAppDispatch } from "../store";
import { resetReading } from "../store/readingSlice";
import { useRecommendation } from "../hooks/useRecommendation";

// Decide what quality warning to show.
function getQualityMessage(flag: string) {
  if (flag === "QUARANTINED") {
    return {
      show: true,
      color: "#c92a2a",
      background: "#ffe3e3",
      title: "This reading looks wrong",
      text:
        "The values changed very sharply compared to your last test at this field. " +
        "Please check that you typed them correctly. " +
        "This reading is saved, but no fertilizer advice can be given from it.",
    };
  }

  if (flag === "FLAGGED") {
    return {
      show: true,
      color: colors.warning,
      background: colors.warningSurface,
      title: "This reading looks unusual",
      text:
        "The values changed more than expected since your last test at this field. " +
        "If you added lime or fertilizer recently, this may be correct. " +
        "This reading is saved, but no fertilizer advice can be given from it.",
    };
  }

  return { show: false, color: "", background: "", title: "", text: "" };
}

export default function ResultScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const reading = useAppSelector((state) => state.reading.result);

  // NEW: the recommendation state and hook.
  const recStatus = useAppSelector((state) => state.recommendation.status);
  const recMessage = useAppSelector((state) => state.recommendation.message);
  const { fetchRecommendation } = useRecommendation();

  if (!reading) {
    return <View style={styles.empty}><Text style={styles.title}>Start with a soil test.</Text><AppButton title="Enter soil readings" onPress={() => navigation.navigate("SoilEntry")} /></View>;
  }

  const quality = getQualityMessage(reading.quality_flag);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <View style={styles.successIcon}><Icon name={quality.show ? "flask" : "check"} size={32} /></View>
      <Text style={ui.eyebrow}>{quality.show ? "SAVED FOR REVIEW" : "A STEP TOWARD HEALTHIER SOIL"}</Text>
      <Text style={styles.title}>Your soil story,{`\n`}one test richer.</Text>
      <Text style={ui.subtitle}>Your reading is saved. Here’s a look at your field.</Text>
      <View style={ui.card}>
        <View style={styles.cardHeader}><Icon name="sprout" size={23} /><Text style={styles.crop}>{reading.crop}</Text><Text style={styles.area}>{reading.area.toFixed(2)} ha</Text></View>
        <SoilMetrics reading={reading} />
        <View style={styles.details}><Text style={styles.detail}>{reading.stage} stage</Text><Text style={styles.detail}>{reading.zone || "Unassigned"} zone</Text></View>
        <View style={styles.location}><Icon name="location" size={15} /><Text style={styles.locationText}>{reading.raw_lat.toFixed(4)}, {reading.raw_lng.toFixed(4)}</Text></View>
      </View>
      {quality.show && (
        <View style={[styles.warningBox, { backgroundColor: quality.background, borderColor: quality.color }]}>
          <Text style={[styles.warningTitle, { color: quality.color }]}>{quality.title}</Text>
          <Text style={styles.warningText}>{quality.text}</Text>
          {reading.agent_note && <View style={styles.agentBox}><Text style={styles.agentLabel}>A note about your reading</Text><Text style={styles.warningText}>{reading.agent_note}</Text></View>}
        </View>
      )}
      {reading.quality_flag === "OK" && <AppButton title="See my fertilizer advice" icon="arrow" loading={recStatus === "loading"} onPress={async () => {
        await fetchRecommendation(reading.reading_id);
        navigation.navigate("Recommendation");
      }} />}
      {(recStatus === "flagged" || recStatus === "error") && <Text style={styles.error}>{recMessage}</Text>}
      <AppButton title="Take another soil test" variant="secondary" icon="plus" style={{ marginTop: 12 }} onPress={() => {
        dispatch(resetReading()); navigation.navigate("SoilEntry");
      }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: { ...ui.screen, padding: 28, justifyContent: "center", gap: 24 },
  successIcon: { width: 66, height: 66, backgroundColor: colors.sage, borderRadius: 23, justifyContent: "center", alignItems: "center", marginBottom: 25 },
  title: { color: colors.forest, fontSize: 30, lineHeight: 37, fontWeight: "700", letterSpacing: -0.8 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  crop: { flex: 1, fontSize: 19, fontWeight: "700", color: colors.forest, textTransform: "capitalize" },
  area: { fontSize: 12, color: colors.primary, backgroundColor: colors.sage, borderRadius: 8, padding: 7, overflow: "hidden" },
  details: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  detail: { fontSize: 11, color: colors.secondary, textTransform: "capitalize" },
  location: { flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15, marginTop: 16 },
  locationText: { fontSize: 11, color: colors.muted },
  warningBox: { borderRadius: 17, borderWidth: 1, padding: 18, marginBottom: 18 },
  warningTitle: { fontSize: 16, fontWeight: "700", marginBottom: 9 },
  warningText: { color: colors.secondary, fontSize: 13, lineHeight: 22 },
  agentBox: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 14, paddingTop: 14 },
  agentLabel: { color: colors.forest, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20, marginTop: 14 },
});
