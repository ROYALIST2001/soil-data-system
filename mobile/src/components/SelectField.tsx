import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Option } from "../constants/vocabulary";
import Icon from "./Icon";
import { colors } from "../theme";

interface SelectFieldProps {
  label: string;
  value: string;
  options: Option[];
  onSelect: (value: string) => void;
}

export default function SelectField({ label, value, options, onSelect }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const selected = options.find((option) => option.value === value);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.button} onPress={() => setOpen(true)} disabled={!options.length}
        accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label ?? "Choose an option"}`}
        accessibilityState={{ expanded: open, disabled: !options.length }}>
        <Text style={[styles.buttonText, !selected && styles.placeholder]}>{selected?.label ?? "Choose an option"}</Text>
        <Icon name="chevronDown" size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close options" accessibilityRole="button" />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} accessibilityViewIsModal>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} style={styles.close} accessibilityRole="button" accessibilityLabel="Close options">
                <Icon name="close" size={20} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((option) => {
                const chosen = option.value === value;
                return (
                  <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: chosen }}
                    style={[styles.option, chosen && styles.optionChosen]} onPress={() => { onSelect(option.value); setOpen(false); }}>
                    <Text style={[styles.optionText, chosen && styles.optionTextChosen]}>{option.label}</Text>
                    {chosen && <Icon name="check" size={21} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 17 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8, color: colors.secondary },
  button: { borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 15, minHeight: 52,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, backgroundColor: colors.background },
  buttonText: { fontSize: 15, color: colors.text, flex: 1 },
  placeholder: { color: colors.muted },
  backdrop: { flex: 1, backgroundColor: "rgba(15,38,24,0.42)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, maxHeight: "80%" },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 10 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sheetTitle: { fontSize: 19, fontWeight: "700", color: colors.forest, flex: 1 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  option: { minHeight: 54, padding: 15, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 5 },
  optionChosen: { backgroundColor: colors.sage },
  optionText: { fontSize: 15, color: colors.text, flex: 1 },
  optionTextChosen: { fontWeight: "700", color: colors.primary },
});
