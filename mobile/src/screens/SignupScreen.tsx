import { colors, ui } from "../theme";
import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import InputField from "../components/InputField";
import GNDivisionField from "../components/GNDivisionField";
import AppButton from "../components/AppButton";
import Icon from "../components/Icon";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../hooks/useAuth";

export default function SignupScreen() {
  const navigation = useNavigation<any>();
  const { signup, status, errorMessage } = useAuth();

  const [fullName, setFullName] = useState("");
  const [nic, setNic] = useState("");
  const [gnDivision, setGnDivision] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // The one rule the SERVER cannot check for us.
  //
  // The server never sees the second password box, so "the two passwords
  // do not match" has to be caught here. Every OTHER rule is checked on
  // the server, because a check that only exists in the app can be
  // skipped by anyone who calls the API directly.
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = status === "loading";

  function handleSignup() {
    setLocalError(null);

    if (!gnDivision) {
      setLocalError("Please choose your district and Grama Niladhari division.");
      return;
    }

    if (password !== confirm) {
      setLocalError("The two passwords do not match.");
      return;
    }

    signup({
      nic: nic.trim(),
      full_name: fullName.trim(),
      gn_division: gnDivision.trim(),
      mobile: mobile.trim(),
      email: email.trim(),
      password,
    });
  }

  // Show our own message if there is one, otherwise the server's.
  const message = localError ?? errorMessage;

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}><KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView style={ui.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to login">
          <View style={{ transform: [{ rotate: "180deg" }] }}><Icon name="arrow" size={22} /></View><Text style={styles.backLabel}>Back to log in</Text>
        </TouchableOpacity>
        <Text style={ui.eyebrow}>LET’S GROW TOGETHER</Text>
        <Text style={styles.title}>Your next chapter{`\n`}starts here.</Text>
        <Text style={styles.subtitle}>
          Your details let the system keep your soil tests together and
          give advice for your own land.
        </Text>

        <View style={ui.card}><InputField
          label="Full Name"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />

        <InputField
          label="NIC Number"
          value={nic}
          onChangeText={setNic}
          autoCapitalize="characters"
          placeholder="871234567V or 198712345678"
        />
        <Text style={styles.hint}>
          This is how you will log in, so type it carefully.
        </Text>

        <GNDivisionField value={gnDivision} onSelect={setGnDivision} disabled={busy} />

        <InputField
          label="Mobile Number"
          value={mobile}
          onChangeText={setMobile}
          keyboard="phone-pad"
          placeholder="0771234567"
        />

        <InputField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboard="email-address"
          autoCapitalize="none"
          placeholder="name@example.com"
        />

        <InputField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secure
          autoCapitalize="none"
        />
        <Text style={styles.hint}>At least 6 characters.</Text>

        <InputField
          label="Confirm Password"
          value={confirm}
          onChangeText={setConfirm}
          secure
          autoCapitalize="none"
        />

        {message && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        <AppButton title="Create account" onPress={handleSignup} loading={busy} icon="arrow" /></View>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => navigation.goBack()}
          disabled={busy}
        >
          <Text style={styles.linkText}>
            I already have an account
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, marginBottom: 24 },
  backLabel: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, paddingTop: 30, paddingBottom: 40 },

  title: {
    fontSize: 30, fontWeight: "700",
    color: colors.forest, marginBottom: 6,
  },
  subtitle: {
    fontSize: 14, color: colors.secondary,
    marginBottom: 22, lineHeight: 20,
  },

  hint: {
    fontSize: 12, color: colors.muted,
    marginTop: -8, marginBottom: 12,
  },

  button: {
    backgroundColor: colors.forest, paddingVertical: 14,
    borderRadius: 14, alignItems: "center", marginTop: 10,
  },
  buttonDisabled: { backgroundColor: colors.disabled },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: "700" },

  linkRow: { alignItems: "center", paddingVertical: 16 },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: "700" },

  errorBox: {
    backgroundColor: colors.warningSurface, padding: 11, borderRadius: 14,
    borderLeftWidth: 4, borderLeftColor: colors.warning, marginBottom: 6,
  },
  errorText: { color: colors.secondary, fontSize: 13, lineHeight: 19 },
});
