import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, StyleProp, ViewStyle } from "react-native";
import Icon, { IconName } from "./Icon";
import { colors } from "../theme";

export default function AppButton({ title, onPress, loading = false, disabled = false, variant = "primary", icon, style }: {
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean;
  variant?: "primary" | "secondary"; icon?: IconName; style?: StyleProp<ViewStyle>;
}) {
  const secondary = variant === "secondary";
  const foreground = secondary ? colors.primary : colors.surface;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, pressed && styles.pressed,
        (disabled || loading) && styles.disabled, style]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : icon ? <Icon name={icon} size={20} color={foreground} /> : null}
      <Text style={[styles.label, { color: foreground }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 54, paddingVertical: 15, paddingHorizontal: 20, borderRadius: 15, backgroundColor: colors.primary,
    flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  secondary: { backgroundColor: colors.sage, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
  label: { fontSize: 15, fontWeight: "700", textAlign: "center", flexShrink: 1 },
});
