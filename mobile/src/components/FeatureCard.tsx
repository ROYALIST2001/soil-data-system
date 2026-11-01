import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon, { IconName } from "./Icon";
import { colors } from "../theme";

export default function FeatureCard({ icon, title, description, onPress }: {
  icon: IconName; title: string; description: string; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={description} onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={styles.icon}><Icon name={icon} size={25} /></View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 20, padding: 18,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  icon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700", color: colors.forest, marginBottom: 5 },
  description: { fontSize: 13, lineHeight: 19, color: colors.secondary },
});
