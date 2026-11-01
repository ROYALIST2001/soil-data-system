import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppSelector } from "../store";
import FeatureCard from "../components/FeatureCard";
import SoilMetrics from "../components/SoilMetrics";
import Icon from "../components/Icon";
import { colors, ui } from "../theme";

export default function InsightsScreen() {
  const navigation = useNavigation<any>();
  const reading = useAppSelector((state) => state.reading.result);
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Text style={ui.eyebrow}>KNOW YOUR LAND</Text>
      <Text style={ui.title}>A little insight.{"\n"}Better decisions.</Text>
      <Text style={ui.subtitle}>Follow your soil over time and see the bigger picture around your field.</Text>
      {reading ? (
        <View style={ui.card}>
          <View style={styles.heading}><Icon name="flask" size={19} /><Text style={styles.label}>Your latest soil test</Text></View>
          <Text style={styles.meta}>{reading.crop} · {new Date(reading.created_at).toLocaleDateString()}</Text>
          <SoilMetrics reading={reading} />
        </View>
      ) : (
        <View style={ui.card}><Text style={styles.label}>Your soil story starts with a test.</Text>
          <Text style={styles.meta}>Submit a reading in the Test tab to see your field's insights here.</Text></View>
      )}
      <Text style={[ui.section, { marginTop: 10 }]}>Explore your soil</Text>
      <FeatureCard icon="chart" title="Soil trends" description="See how nutrients and pH change over time." onPress={() => navigation.navigate("Trends")} />
      <FeatureCard icon="map" title="Soil map" description="Find your field and explore regional soil groups." onPress={() => navigation.navigate("Map")} />
      <FeatureCard icon="layers" title="Regional patterns" description="Discover districts with similar soil conditions." onPress={() => navigation.navigate("Regions")} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { color: colors.forest, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.secondary, fontSize: 12, marginTop: 8, lineHeight: 19, textTransform: "capitalize" },
});
