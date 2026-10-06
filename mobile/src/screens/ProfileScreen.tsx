import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
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
    <ScrollView contentContainerStyle={styles.container}>

      <Text style={styles.name}>{farmer.full_name}</Text>
      <Text style={styles.caption}>Farmer #{farmer.farmer_id}</Text>

      <View style={styles.card}>
        <DetailRow label="NIC Number" value={farmer.nic} />
        <DetailRow label="Grama Niladhari Division" value={farmer.gn_division} />
        <DetailRow label="Mobile" value={farmer.mobile} />
        <DetailRow label="Email" value={farmer.email} />
      </View>

      <Text style={styles.note}>
        Farmer #{farmer.farmer_id} is the id the database created for you.
        Your land, soil tests and harvests will all be linked to it.
      </Text>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 24 },
  centre: { flex: 1, justifyContent: "center", alignItems: "center" },

  name: { fontSize: 22, fontWeight: "bold", color: "#1b4332" },
  caption: { fontSize: 13, color: "#868e96", marginTop: 2, marginBottom: 18 },

  card: {
    backgroundColor: "#f8f9fa", borderRadius: 10,
    padding: 4, marginBottom: 16,
  },

  row: {
    paddingVertical: 11, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: "#e9ecef",
  },
  rowLabel: { fontSize: 12, color: "#868e96", marginBottom: 3 },
  rowValue: { fontSize: 15, color: "#212529" },

  note: {
    fontSize: 12, color: "#868e96",
    lineHeight: 18, marginBottom: 24,
  },

  logoutButton: {
    borderWidth: 1, borderColor: "#e8842c", borderRadius: 8,
    paddingVertical: 13, alignItems: "center",
  },
  logoutText: { color: "#e8842c", fontSize: 15, fontWeight: "bold" },
});
