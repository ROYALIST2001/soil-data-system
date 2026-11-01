import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import InputField from "../components/InputField";
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>

        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          Your details let the system keep your soil tests together and
          give advice for your own land.
        </Text>

        <InputField
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

        <InputField
          label="Grama Niladhari Division"
          value={gnDivision}
          onChangeText={setGnDivision}
          autoCapitalize="words"
          placeholder="e.g. Thalawa North"
        />

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

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  container: { padding: 24, paddingTop: 30, paddingBottom: 40 },

  title: {
    fontSize: 24, fontWeight: "bold",
    color: "#1b4332", marginBottom: 6,
  },
  subtitle: {
    fontSize: 14, color: "#495057",
    marginBottom: 22, lineHeight: 20,
  },

  hint: {
    fontSize: 12, color: "#868e96",
    marginTop: -8, marginBottom: 12,
  },

  button: {
    backgroundColor: "#1b4332", paddingVertical: 14,
    borderRadius: 8, alignItems: "center", marginTop: 10,
  },
  buttonDisabled: { backgroundColor: "#adb5bd" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  linkRow: { alignItems: "center", paddingVertical: 16 },
  linkText: { color: "#40916c", fontSize: 14, fontWeight: "bold" },

  errorBox: {
    backgroundColor: "#ffe8cc", padding: 11, borderRadius: 8,
    borderLeftWidth: 4, borderLeftColor: "#e8842c", marginBottom: 6,
  },
  errorText: { color: "#495057", fontSize: 13, lineHeight: 19 },
});
