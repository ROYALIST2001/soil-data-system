import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from "react-native";

import InputField from "./InputField";
import SelectField from "./SelectField";
import { CROPS } from "../constants/vocabulary";
import { NewLandCrop } from "../types/land";

// ONE form, used by TWO screens: the first-time registration and the
// "add another land" screen.
//
// WHY A COMPONENT AND NOT TWO COPIES. The rule about crop sizes fitting
// inside the land lives in here. Two copies would mean two places to fix it,
// and sooner or later only one of them would get fixed.

interface LandFormProps {
  // The division to start with, usually the farmer's own from signup.
  defaultDivision: string;

  // True while the server is saving.
  saving: boolean;

  // The server's message, if the save failed.
  serverError: string | null;

  // Called when the farmer presses Save. Returns true if it worked.
  onSave: (
    name: string,
    gnDivision: string,
    sizeHa: number,
    crops: NewLandCrop[]
  ) => Promise<boolean>;

  // What to do once a land has been saved.
  onSaved: () => void;

  saveLabel?: string;
}

// Show a crop's proper name instead of the lowercase key.
function cropLabel(value: string): string {
  const found = CROPS.find((c) => c.value === value);
  return found ? found.label : value;
}

export default function LandForm({
  defaultDivision,
  saving,
  serverError,
  onSave,
  onSaved,
  saveLabel = "Save Land",
}: LandFormProps) {

  const [name, setName] = useState("");
  const [division, setDivision] = useState(defaultDivision);
  const [size, setSize] = useState("");

  // The crop being typed right now, before it is added to the list.
  const [cropChoice, setCropChoice] = useState("rice");
  const [cropSize, setCropSize] = useState("");

  // The crops added so far. This is the list that will be sent.
  const [crops, setCrops] = useState<NewLandCrop[]>([]);

  const [localError, setLocalError] = useState<string | null>(null);

  // How much of the land is already taken by the crops in the list.
  const landSize = parseFloat(size);
  const usedSize = crops.reduce((sum, c) => sum + c.size_ha, 0);

  // Number.isFinite is false for NaN, which is what parseFloat gives for an
  // empty or half-typed box. Without this check the free space would show
  // as NaN while the farmer is still typing.
  const freeSize = Number.isFinite(landSize) ? landSize - usedSize : 0;

  function handleAddCrop() {
    setLocalError(null);

    const value = parseFloat(cropSize);

    if (!Number.isFinite(landSize) || landSize <= 0) {
      setLocalError("Please enter the land size first.");
      return;
    }

    if (!Number.isFinite(value) || value <= 0) {
      setLocalError("Please enter the size for this crop.");
      return;
    }

    // The same crop twice would make "how much rice is grown here"
    // ambiguous, so it is one row per crop with the total size.
    if (crops.some((c) => c.crop === cropChoice)) {
      setLocalError(
        `${cropLabel(cropChoice)} is already on this land. ` +
        `Remove it first to change the size.`
      );
      return;
    }

    // THE RULE THAT MATTERS: the crops cannot cover more ground than the
    // land has. The server checks this too - this copy exists only so the
    // farmer finds out immediately instead of after a round trip.
    if (usedSize + value > landSize + 0.000001) {
      setLocalError(
        `Only ${freeSize.toFixed(2)} hectares are left on this land.`
      );
      return;
    }

    setCrops([...crops, { crop: cropChoice, size_ha: value }]);
    setCropSize("");
  }

  function handleRemoveCrop(crop: string) {
    setCrops(crops.filter((c) => c.crop !== crop));
  }

  async function handleSave() {
    setLocalError(null);

    if (!name.trim()) {
      setLocalError("Please give this land a name.");
      return;
    }
    if (!division.trim()) {
      setLocalError("Please enter the Grama Niladhari division.");
      return;
    }
    if (!Number.isFinite(landSize) || landSize <= 0) {
      setLocalError("Please enter the land size in hectares.");
      return;
    }
    if (crops.length === 0) {
      setLocalError("Please add at least one crop to this land.");
      return;
    }

    const ok = await onSave(name.trim(), division.trim(), landSize, crops);

    if (ok) {
      // Empty the form, so "add another land" starts clean.
      setName("");
      setSize("");
      setCrops([]);
      setCropSize("");
      onSaved();
    }
  }

  // Our own message first, then the server's.
  const message = localError ?? serverError;

  return (
    <View>
      <InputField
        label="Land Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        placeholder="e.g. Home paddy"
      />
      <Text style={styles.hint}>
        Your own name for this land, so you can tell your lands apart.
      </Text>

      <InputField
        label="Grama Niladhari Division"
        value={division}
        onChangeText={setDivision}
        autoCapitalize="words"
      />

      <InputField
        label="Land Size — hectares"
        value={size}
        onChangeText={setSize}
        numeric
      />
      <Text style={styles.hint}>
        1 hectare is about 2.5 acres.
      </Text>

      {/* ---------- THE CROPS ---------- */}
      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Crops on this land</Text>
      <Text style={styles.sectionNote}>
        Add every crop you grow here, with the size of each one.
      </Text>

      {crops.length === 0 ? (
        <Text style={styles.empty}>No crops added yet.</Text>
      ) : (
        crops.map((c) => (
          <View key={c.crop} style={styles.cropRow}>
            <Text style={styles.cropName}>{cropLabel(c.crop)}</Text>
            <Text style={styles.cropSize}>{c.size_ha.toFixed(2)} ha</Text>

            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemoveCrop(c.crop)}
            >
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Only worth showing once there is a land size to compare against. */}
      {Number.isFinite(landSize) && landSize > 0 && (
        <Text style={styles.freeNote}>
          {usedSize.toFixed(2)} of {landSize.toFixed(2)} hectares used
          {freeSize > 0 ? ` — ${freeSize.toFixed(2)} ha free` : ""}
        </Text>
      )}

      <View style={styles.addBox}>
        <SelectField
          label="Crop"
          value={cropChoice}
          options={CROPS}
          onSelect={setCropChoice}
        />

        <InputField
          label="Size of this crop — hectares"
          value={cropSize}
          onChangeText={setCropSize}
          numeric
        />

        <TouchableOpacity style={styles.addButton} onPress={handleAddCrop}>
          <Text style={styles.addButtonText}>+ Add this crop</Text>
        </TouchableOpacity>
      </View>

      {message && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveText}>{saveLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 12, color: "#868e96",
    marginTop: -8, marginBottom: 12,
  },

  divider: {
    height: 1, backgroundColor: "#dee2e6",
    marginTop: 10, marginBottom: 18,
  },

  sectionTitle: {
    fontSize: 17, fontWeight: "bold",
    color: "#1b4332", marginBottom: 4,
  },
  sectionNote: {
    fontSize: 13, color: "#495057",
    marginBottom: 14, lineHeight: 19,
  },

  empty: {
    fontSize: 13, color: "#868e96",
    fontStyle: "italic", marginBottom: 10,
  },

  cropRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#f1f3f5", borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
  },
  cropName: { flex: 1, fontSize: 15, color: "#212529" },
  cropSize: { fontSize: 14, color: "#40916c", fontWeight: "bold" },
  removeButton: { marginLeft: 14 },
  removeText: { fontSize: 13, color: "#e8842c" },

  freeNote: {
    fontSize: 12, color: "#868e96",
    marginTop: 4, marginBottom: 14,
  },

  addBox: {
    backgroundColor: "#f8f9fa", borderRadius: 10,
    padding: 14, marginBottom: 16,
  },
  addButton: {
    backgroundColor: "#40916c", paddingVertical: 11,
    borderRadius: 8, alignItems: "center",
  },
  addButtonText: { color: "#fff", fontSize: 14, fontWeight: "bold" },

  saveButton: {
    backgroundColor: "#1b4332", paddingVertical: 14,
    borderRadius: 8, alignItems: "center", marginTop: 4,
  },
  saveDisabled: { backgroundColor: "#adb5bd" },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  errorBox: {
    backgroundColor: "#ffe8cc", padding: 11, borderRadius: 8,
    borderLeftWidth: 4, borderLeftColor: "#e8842c", marginBottom: 10,
  },
  errorText: { color: "#495057", fontSize: 13, lineHeight: 19 },
});
