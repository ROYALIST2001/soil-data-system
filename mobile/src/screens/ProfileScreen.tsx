import { colors, ui } from "../theme";
import Icon from "../components/Icon";
import AppButton from "../components/AppButton";
import React from "react";
import {
  View, Text, ScrollView, StyleSheet, Alert,
} from "react-native";

import { useAuth } from "../hooks/useAuth";

// One line of the farmer's details.
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { farmer, logout } = useAuth();

  // Cannot happen - this screen only exists once logged in - but TypeScript
  // does not know that, and a guard is cheaper than a crash.
  if (!farmer) {
    return (
      <View style={styles.centre}>
        <Text style={styles.rowLabel}>Not logged in.</Text>
      </View>
    );
  }

  function handleLogout() {
    // ASK FIRST. Logging out is easy to tap by mistake, and on this screen
    // it sits right under the farmer's own details.
    Alert.alert(
      "Log out?",
      "You will need your NIC number and password to get back in.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: () => logout() },
      ]
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

      <View style={styles.profileHeader}>
        <View style={styles.avatar}><Text style={styles.initials}>{farmer.full_name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("")}</Text></View>
        <Text style={styles.name}>{farmer.full_name}</Text>
        <View style={styles.farmerBadge}><Icon name="sprout" size={14} /><Text style={styles.caption}>Farmer · {farmer.gn_division}</Text></View>
      </View>
      <Text style={ui.section}>Personal details</Text>

      <View style={styles.card}>
        <DetailRow label="NIC Number" value={farmer.nic} />
        <DetailRow label="Grama Niladhari Division" value={farmer.gn_division} />
        <DetailRow label="Mobile" value={farmer.mobile} />
        <DetailRow label="Email" value={farmer.email} />
      </View>

      <Text style={styles.note}>
        Your details help connect your land, soil tests, and farmer support services.
      </Text>

      <AppButton title="Log out" onPress={handleLogout} variant="secondary" icon="logout" />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profileHeader: { alignItems: "center", paddingVertical: 18, marginBottom: 26 },
  avatar: { width: 84, height: 84, borderRadius: 28, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  initials: { color: colors.lime, fontSize: 29, fontWeight: "700" },
  farmerBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.sage, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 13, marginTop: 13 },
  container: { padding: 20, paddingTop: 24 },
  centre: { flex: 1, justifyContent: "center", alignItems: "center" },

  name: { fontSize: 26, fontWeight: "700", color: colors.forest },
  caption: { fontSize: 11, color: colors.primary, flexShrink: 1 },

  card: {
    backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    padding: 8, marginBottom: 16,
  },

  row: {
    paddingVertical: 16, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 12, color: colors.muted, marginBottom: 3 },
  rowValue: { fontSize: 15, color: colors.text },

  note: {
    fontSize: 12, color: colors.muted,
    lineHeight: 18, marginBottom: 24,
  },

  logoutButton: {
    borderWidth: 1, borderColor: colors.warning, borderRadius: 14,
    paddingVertical: 13, alignItems: "center",
  },
  logoutText: { color: colors.warning, fontSize: 15, fontWeight: "700" },
});
