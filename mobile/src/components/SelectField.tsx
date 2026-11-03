import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Modal, FlatList, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Option } from "../constants/vocabulary";
import Icon from "./Icon";
import { colors } from "../theme";

interface SelectFieldProps {
  label: string;
  value: string;
  options: (Option & { searchText?: string })[];
  onSelect: (value: string) => void;
  searchable?: boolean;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
}

export default function SelectField({ label, value, options, onSelect, searchable = false, disabled = false,
  placeholder = "Choose an option", searchPlaceholder = "Type to narrow the list" }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const insets = useSafeAreaInsets();
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return options.filter((option) => (option.searchText ?? option.label).toLowerCase().split("\n").some((term) => term.startsWith(query)));
  }, [options, search]);
  const unavailable = disabled || !options.length;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={[styles.button, unavailable && styles.disabled]} onPress={() => { setSearch(""); setOpen(true); }} disabled={unavailable}
        accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityState={{ expanded: open, disabled: unavailable }}>
        <Text style={[styles.buttonText, !selected && styles.placeholder]}>{selected?.label ?? placeholder}</Text>
        <Icon name="chevronDown" size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close options" accessibilityRole="button" />
          <View style={[styles.sheet, searchable && styles.searchSheet, { paddingBottom: Math.max(insets.bottom, 18) }]} accessibilityViewIsModal>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} style={styles.close} accessibilityRole="button" accessibilityLabel="Close options">
                <Icon name="close" size={20} />
              </Pressable>
            </View>
            {searchable && <>
              <TextInput value={search} onChangeText={setSearch} style={styles.searchInput}
                placeholder={searchPlaceholder} placeholderTextColor={colors.muted}
                autoCorrect={false} autoCapitalize="none" accessibilityLabel={`Search ${label}`} />
              <Text style={styles.resultCount} accessibilityLiveRegion="polite">{filtered.length} matches</Text>
            </>}
            <FlatList data={filtered} keyExtractor={(option) => option.value} keyboardShouldPersistTaps="handled"
              style={styles.list} initialNumToRender={15} keyboardDismissMode="on-drag"
              ListEmptyComponent={<Text style={styles.empty}>No matches. Try a different spelling.</Text>}
              renderItem={({ item: option }) => {
                const chosen = option.value === value;
                return (
                  <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: chosen }}
                    style={[styles.option, chosen && styles.optionChosen]} onPress={() => { onSelect(option.value); setOpen(false); }}>
                    <Text style={[styles.optionText, chosen && styles.optionTextChosen]}>{option.label}</Text>
                    {chosen && <Icon name="check" size={21} />}
                  </Pressable>
                );
              }} />
          </View>
        </KeyboardAvoidingView>
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
  disabled: { opacity: 0.6 },
  searchSheet: { height: "78%" },
  list: { flexGrow: 0, flexShrink: 1 },
  searchInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 13, fontSize: 15, color: colors.text, backgroundColor: colors.background, minHeight: 48 },
  resultCount: { fontSize: 12, color: colors.secondary, marginVertical: 10 },
  empty: { color: colors.secondary, paddingVertical: 20, lineHeight: 21 },
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
