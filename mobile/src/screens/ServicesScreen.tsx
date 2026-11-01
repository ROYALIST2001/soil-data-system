import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../hooks/useAuth";
import FeatureCard from "../components/FeatureCard";
import Icon from "../components/Icon";
import { colors, ui } from "../theme";

export default function ServicesScreen() {
  const navigation = useNavigation<any>();
  const { farmer } = useAuth();
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Text style={ui.eyebrow}>HERE TO HELP YOU GROW</Text>
      <Text style={ui.title}>Support for every season.</Text>
      <Text style={ui.subtitle}>Your farmer services, applications, and account in one place.</Text>
      <View style={styles.profile}>
        <View style={styles.avatar}><Icon name="user" color={colors.lime} size={28} /></View>
        <View style={styles.profileCopy}>
          <Text style={styles.name}>{farmer?.full_name}</Text>
          <Text style={styles.division}>{farmer?.gn_division}</Text>
        </View>
        <Icon name="sprout" color={colors.lime} size={30} />
      </View>
      <Text style={ui.section}>Farmer services</Text>
      <FeatureCard icon="wallet" title="Fertilizer subsidy" description="Apply for support and track your payments." onPress={() => navigation.navigate("Subsidy")} />
      <FeatureCard icon="shield" title="Disaster relief" description="Find relief programmes and follow your claims." onPress={() => navigation.navigate("Relief")} />
      <FeatureCard icon="user" title="My account" description="View your farmer profile and contact details." onPress={() => navigation.navigate("Profile")} />
      <View style={styles.note}><Icon name="sprout" size={18} /><Text style={styles.noteText}>Better soil. Stronger harvests. Together.</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.forest,
    borderRadius: 22, padding: 22, marginBottom: 28 },
  avatar: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#2A513B" },
  profileCopy: { flex: 1 },
  name: { fontSize: 18, fontWeight: "700", color: colors.surface },
  division: { fontSize: 12, color: "#C3D7C4", marginTop: 6 },
  note: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 26 },
  noteText: { color: colors.secondary, fontSize: 12, flexShrink: 1 },
});
