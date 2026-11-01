import React, { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, KeyboardTypeOptions,
} from "react-native";
import { colors } from "../theme";

// The values this component accepts from outside.
interface InputFieldProps {
  label: string;                          // the text above the box
  value: string;                          // what to show inside the box
  onChangeText: (text: string) => void;   // a function to call when typing
  numeric?: boolean;                      // the ? means this is OPTIONAL

  // ---------- NEW in Phase 9, for the login and signup forms ----------
  //
  // All OPTIONAL, so every screen written before this still works exactly
  // as it did. Adding to a shared component means never breaking what
  // already uses it.

  // Hide what is typed, for passwords.
  secure?: boolean;

  // Pick the right phone keyboard, for example the @ keyboard for email
  // or the number pad for a mobile number. Overrides numeric when given.
  keyboard?: KeyboardTypeOptions;

  // Phones capitalise the first letter by default, which is wrong for an
  // email address or a NIC number.
  autoCapitalize?: "none" | "sentences" | "words" | "characters";

  // Faint example text shown while the box is empty.
  placeholder?: string;
}

export default function InputField({
  label,
  value,
  onChangeText,
  numeric = false, // this value is used if the prop is not given
  secure = false,
  keyboard,
  autoCapitalize,
  placeholder,
}: InputFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {/* Remember: in React Native, ALL text must be inside a Text tag. */}
      <Text style={styles.label}>{label}</Text>

      <TextInput
        style={[styles.input, focused && styles.focused]}
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={colors.primary}
        value={value}                 // the SCREEN owns this value
        onChangeText={onChangeText}   // tell the screen when it changes
        // Show the number keypad for number fields.
        // This makes typing much easier for the farmer.
        keyboardType={keyboard ?? (numeric ? "numeric" : "default")}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        // Password managers and autocorrect fight with NIC numbers and
        // passwords, so they are off whenever the text is hidden.
        autoCorrect={!secure}
      />
    </View>
  );
}

// Styles in React Native look like CSS, but written as an object.
// Note: backgroundColor, not background-color. No dashes allowed.
const styles = StyleSheet.create({
  container: { marginBottom: 17 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8, color: colors.secondary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    paddingHorizontal: 15,
    paddingVertical: 14,
    minHeight: 52,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  focused: { borderColor: colors.primary, backgroundColor: colors.surface },
});
