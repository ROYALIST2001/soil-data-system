import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import InputField from "../components/InputField";
import AppButton from "../components/AppButton";
import Icon from "../components/Icon";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, ui } from "../theme";
import { useAuth } from "../hooks/useAuth";

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { login, status, errorMessage } = useAuth();

  const [nic, setNic] = useState("");
  const [password, setPassword] = useState("");

  const busy = status === "loading";

  function handleLogin() {
    // The server checks everything properly. This only stops a pointless
    // network trip when the farmer has not typed anything at all.
    if (!nic.trim() || !password) {
      return;
    }
    login({ nic: nic.trim(), password });
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.brandMark}><Icon name="sprout" size={25} color={colors.lime} /></View>
            <View><Text style={styles.brandName}>Soil Data System</Text><Text style={styles.brandCaption}>ROOTED IN YOUR GROWTH</Text></View>
          </View>
          <View style={styles.hero}>
            <View style={styles.heroArt}><Icon name="sprout" size={150} color="#557C5B" strokeWidth={1.2} /></View>
            <Text style={styles.eyebrow}>FROM THE GROUND UP</Text>
            <Text style={styles.heroTitle}>Good things{`\n`}start with soil.</Text>
            <Text style={styles.heroText}>Know your land. Nourish your crops.{`\n`}Grow a healthier tomorrow.</Text>
          </View>
          <View style={styles.form}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Your land. Your progress. All in one place.</Text>
            <InputField label="NIC number" value={nic} onChangeText={setNic} autoCapitalize="characters" placeholder="Enter your NIC number" />
            <InputField label="Password" value={password} onChangeText={setPassword} secure autoCapitalize="none" placeholder="Enter your password" />
            {errorMessage && <View style={styles.errorBox}><Text style={styles.errorText}>{errorMessage}</Text></View>}
            <AppButton title="Log in" onPress={handleLogin} loading={busy} disabled={!nic.trim() || !password} icon="arrow" style={{ marginTop: 4 }} />
          </View>
          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate("Signup")} disabled={busy} accessibilityRole="button">
            <Text style={styles.linkText}>New to Soil Data? <Text style={styles.linkStrong}>Create an account</Text></Text>
          </TouchableOpacity>
          <View style={styles.footer}><Icon name="sprout" size={16} /><Text style={styles.footerText}>Growing better, together.</Text></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, padding: 22, paddingTop: 18, paddingBottom: 24 },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 },
  brandMark: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 17, fontWeight: "700", color: colors.forest },
  brandCaption: { fontSize: 8, fontWeight: "700", letterSpacing: 1.8, color: colors.muted, marginTop: 5 },
  hero: { backgroundColor: colors.forest, borderRadius: 26, padding: 24, marginBottom: 22, overflow: "hidden" },
  heroArt: { position: "absolute", right: -26, bottom: -12, opacity: 0.45 },
  eyebrow: { color: colors.lime, fontSize: 9, fontWeight: "700", letterSpacing: 1.8, marginBottom: 14 },
  heroTitle: { color: colors.surface, fontSize: 34, lineHeight: 40, fontWeight: "700", letterSpacing: -1 },
  heroText: { color: "#D4E3D2", fontSize: 12, lineHeight: 20, marginTop: 15 },
  form: { ...ui.card, padding: 22, marginBottom: 0 },
  title: { color: colors.forest, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: colors.secondary, marginTop: 7, marginBottom: 22, lineHeight: 19 },
  linkRow: { minHeight: 48, justifyContent: "center", alignItems: "center", marginTop: 10 },
  linkText: { color: colors.secondary, fontSize: 12, textAlign: "center" },
  linkStrong: { color: colors.primary, fontWeight: "700" },
  errorBox: { backgroundColor: colors.dangerSurface, padding: 12, borderRadius: 12, marginBottom: 14 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  footer: { flexDirection: "row", gap: 7, justifyContent: "center", alignItems: "center", paddingTop: 18 },
  footerText: { color: colors.muted, fontSize: 11 },
});
