import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { useLands } from "../hooks/useLands";
import { CROPS } from "../constants/vocabulary";
import { Land } from "../types/land";

function cropLabel(value: string): string {
  const found = CROPS.find((c) => c.value === value);
  return found ? found.label : value;
}

export default function MyLandsScreen() {
  const navigation = useNavigation<any>();
  const {
    lands, status, saving, errorMessage,
    reload, removeLand, removeCrop, clearError,
  } = useLands();

  // ---------- Removing a whole land ----------
  function confirmRemoveLand(land: Land) {
    // ASK FIRST. This deletes the land AND every crop on it, and there is
    // no undo. A confirmation is the only thing between a mis-tap and
    // losing data the farmer typed in.
    Alert.alert(
      `Remove ${land.name}?`,
      `This also removes the ${land.crops.length} crop(s) on it. ` +
      `This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeLand(land.land_id),
        },
      ]
    );
  }

  // ---------- Removing one crop ----------
  function confirmRemoveCrop(cropId: number, name: string) {
    Alert.alert(
      `Remove ${name}?`,
      "This crop will be taken off this land.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const ok = await removeCrop(cropId);

            // The server refuses to remove the LAST crop on a land, because
            // a land with nothing growing on it is not allowed. It sends
            // back the reason, so we show that rather than inventing our own
            // wording.
            if (!ok) {
              Alert.alert("Cannot remove", errorMessage ?? "Please try again.");
              clearError();
            }
          },
        },
      ]
    );
  }

  // ---------- Still loading ----------
  if (status === "loading" && lands.length === 0) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color="#1b4332" />
      </View>
    );
  }

  // ---------- Could not load ----------
  if (status === "error" && lands.length === 0) {
    return (
      <View style={styles.centre}>
        <Text style={styles.emptyTitle}>Could not load your lands</Text>
        <Text style={styles.emptyText}>{errorMessage}</Text>

        <TouchableOpacity style={styles.retryButton} onPress={reload}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      // Pull down to refresh. Cheap to add and it is what every farmer
      // already expects a list on a phone to do.
      refreshControl={
        <RefreshControl refreshing={status === "loading"} onRefresh={reload} />
      }
    >
      <Text style={styles.title}>My Lands</Text>
      <Text style={styles.subtitle}>
        {lands.length === 0
          ? "You have no land registered yet."
          : `${lands.length} land(s) registered.`}
      </Text>

      {lands.map((land) => {
        const used = land.crops.reduce((sum, c) => sum + c.size_ha, 0);
        const free = land.size_ha - used;

        return (
          <View key={land.land_id} style={styles.card}>

            <View style={styles.cardHead}>
              <View style={styles.cardHeadText}>
                <Text style={styles.landName}>{land.name}</Text>
                <Text style={styles.landMeta}>
                  {land.gn_division} · {land.size_ha.toFixed(2)} ha
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => confirmRemoveLand(land)}
                disabled={saving}
              >
                <Text style={styles.deleteLand}>Remove</Text>
              </TouchableOpacity>
            </View>

            {land.crops.map((c) => (
              <View key={c.land_crop_id} style={styles.cropRow}>
                <Text style={styles.cropName}>{cropLabel(c.crop)}</Text>
                <Text style={styles.cropSize}>{c.size_ha.toFixed(2)} ha</Text>

                <TouchableOpacity
                  style={styles.cropRemove}
                  onPress={() => confirmRemoveCrop(c.land_crop_id, cropLabel(c.crop))}
                  disabled={saving}
                >
                  <Text style={styles.cropRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <Text style={styles.usedNote}>
              {used.toFixed(2)} of {land.size_ha.toFixed(2)} ha planted
              {free > 0.004 ? ` — ${free.toFixed(2)} ha free` : " — full"}
            </Text>

            {/* Only offer to add a crop when there is room for one. */}
            {free > 0.004 && (
              <TouchableOpacity
                style={styles.addCropButton}
                onPress={() =>
                  navigation.navigate("AddCrop", {
                    landId: land.land_id,
                    landName: land.name,
                  })
                }
              >
                <Text style={styles.addCropText}>+ Add a crop</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={styles.addLandButton}
        onPress={() => navigation.navigate("AddLand")}
      >
        <Text style={styles.addLandText}>+ Register another land</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingTop: 22, paddingBottom: 40 },
  centre: {
    flex: 1, justifyContent: "center",
    alignItems: "center", padding: 30,
  },

  title: { fontSize: 22, fontWeight: "bold", color: "#1b4332" },
  subtitle: { fontSize: 13, color: "#868e96", marginTop: 2, marginBottom: 18 },

  card: {
    borderWidth: 1, borderColor: "#dee2e6", borderRadius: 10,
    padding: 14, marginBottom: 14,
  },

  cardHead: {
    flexDirection: "row", alignItems: "flex-start", marginBottom: 12,
  },
  cardHeadText: { flex: 1 },
  landName: { fontSize: 17, fontWeight: "bold", color: "#212529" },
  landMeta: { fontSize: 12, color: "#868e96", marginTop: 2 },
  deleteLand: { fontSize: 13, color: "#e8842c", fontWeight: "bold" },

  cropRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#f1f3f5", borderRadius: 8,
    paddingVertical: 9, paddingHorizontal: 12, marginBottom: 6,
  },
  cropName: { flex: 1, fontSize: 15, color: "#212529" },
  cropSize: { fontSize: 14, color: "#40916c", fontWeight: "bold" },
  cropRemove: { marginLeft: 14, paddingHorizontal: 4 },
  cropRemoveText: { fontSize: 15, color: "#868e96" },

  usedNote: { fontSize: 12, color: "#868e96", marginTop: 6 },

  addCropButton: { paddingVertical: 10, marginTop: 4 },
  addCropText: { color: "#40916c", fontSize: 14, fontWeight: "bold" },

  addLandButton: {
    backgroundColor: "#1b4332", borderRadius: 8,
    paddingVertical: 14, alignItems: "center", marginTop: 6,
  },
  addLandText: { color: "#fff", fontSize: 15, fontWeight: "bold" },

  emptyTitle: {
    fontSize: 17, fontWeight: "bold",
    color: "#1b4332", marginBottom: 8,
  },
  emptyText: {
    color: "#868e96", fontSize: 14,
    textAlign: "center", lineHeight: 20, marginBottom: 18,
  },

  retryButton: {
    borderWidth: 1, borderColor: "#1b4332", borderRadius: 8,
    paddingVertical: 11, paddingHorizontal: 26,
  },
  retryText: { color: "#1b4332", fontSize: 15, fontWeight: "bold" },
});
