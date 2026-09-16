import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";

// The values this component accepts from outside.
interface InputFieldProps {
  label: string;                          // the text above the box
  value: string;                          // what to show inside the box
  onChangeText: (text: string) => void;   // a function to call when typing
  numeric?: boolean;                      // the ? means this is OPTIONAL
}

export default function InputField({
  label,
  value,
  onChangeText,
  numeric = false, // this value is used if the prop is not given
}: InputFieldProps) {

  return (
    <View style={styles.container}>
      {/* Remember: in React Native, ALL text must be inside a Text tag. */}
      <Text style={styles.label}>{label}</Text>

      <TextInput
        style={styles.input}
        value={value}                 // the SCREEN owns this value
        onChangeText={onChangeText}   // tell the screen when it changes
        // Show the number keypad for number fields.
        // This makes typing much easier for the farmer.
        keyboardType={numeric ? "numeric" : "default"}
      />
    </View>
  );
}

// Styles in React Native look like CSS, but written as an object.
// Note: backgroundColor, not background-color. No dashes allowed.
const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  label: { fontSize: 14, marginBottom: 4, color: "#333" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 10,
    fontSize: 16,
  },
});
