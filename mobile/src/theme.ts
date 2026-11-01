import { StyleSheet } from "react-native";

export const colors = {
  forest: "#173F2D",
  primary: "#24734A",
  primaryPressed: "#195B38",
  sage: "#E8F1E5",
  lime: "#D9EDA9",
  background: "#F5F7F2",
  surface: "#FFFFFF",
  text: "#223B2C",
  secondary: "#536657",
  muted: "#627263",
  border: "#DEE7DB",
  disabled: "#C2CFC0",
  warning: "#956016",
  warningSurface: "#FFF4DE",
  danger: "#B43D3D",
  dangerSurface: "#FCEDED",
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 22, paddingBottom: 36 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 11, fontWeight: "700", letterSpacing: 1.8,
    color: colors.primary, marginBottom: 8,
  },
  title: { fontSize: 28, fontWeight: "700", color: colors.forest, letterSpacing: -0.7 },
  subtitle: { fontSize: 14, lineHeight: 22, color: colors.secondary, marginTop: 8, marginBottom: 24 },
  section: { fontSize: 17, fontWeight: "700", color: colors.forest, marginBottom: 16 },
});
