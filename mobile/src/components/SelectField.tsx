import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Option } from "../constants/vocabulary";

interface SelectFieldProps {
  label: string;
  value: string;              // the CURRENT value (lowercase)
  options: Option[];          // the list to choose from
  onSelect: (value: string) => void;
}

export default function SelectField({
  label,
  value,
  options,
  onSelect,
}: SelectFieldProps) {
  // Is the popup showing? This is the ONLY state this component owns.
  const [open, setOpen] = useState(false);

  // Find the label for the current value, so we can show a nice word
  // instead of the lowercase key.
  const selected = options.find((o) => o.value === value);
  const shownText = selected ? selected.label : "Tap to choose";

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      {/* The button that opens the popup. */}
      <TouchableOpacity style={styles.button} onPress={() => setOpen(true)}>
        <Text style={selected ? styles.buttonText : styles.placeholder}>
          {shownText}
        </Text>
        <Text style={styles.arrow}>▼</Text>
      </TouchableOpacity>

      {/* The popup. A Modal draws ON TOP of everything else. */}
      <Modal
        visible={open}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setOpen(false)} // Android back button
      >
        {/* Tapping the dark background closes the popup. */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>

            <ScrollView>
              {options.map((option) => {
                const isChosen = option.value === value;

                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.option, isChosen && styles.optionChosen]}
                    onPress={() => {
                      onSelect(option.value); // tell the screen
                      setOpen(false);          // close the popup
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isChosen && styles.optionTextChosen,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isChosen && <Text style={styles.tick}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  label: { fontSize: 14, marginBottom: 4, color: "#333" },

  button: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  buttonText: { fontSize: 16, color: "#000" },
  placeholder: { fontSize: 16, color: "#999" },
  arrow: { fontSize: 12, color: "#666" },

  // The dark see-through background behind the popup.
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },

  // The white box holding the options.
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    maxHeight: "70%",
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#1b4332",
  },

  option: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionChosen: { backgroundColor: "#d8f3dc" },
  optionText: { fontSize: 16, color: "#333" },
  optionTextChosen: { fontWeight: "bold", color: "#1b4332" },
  tick: { fontSize: 16, color: "#40916c", fontWeight: "bold" },
});
