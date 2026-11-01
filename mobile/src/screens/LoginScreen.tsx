import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import InputField from "../components/InputField";
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>

        <Text style={styles.title}>Soil Data System</Text>
        <Text style={styles.subtitle}>
          Log in with your NIC number to continue.
        </Text>

        <InputField
          label="NIC Number"
          value={nic}
          onChangeText={setNic}
          // A NIC is digits with a capital V or X. Auto-capitalising the
          // whole box means the farmer can type "v" and it still works,
          // which matches what the server expects.
          autoCapitalize="characters"
          placeholder="871234567V"
        />

        <InputField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secure
          autoCapitalize="none"
        />

        {/* The server's own message appears here: a wrong password, or a
            connection problem. We never replace it with something vaguer. */}
        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={handleLogin}
          // Disabled while busy, so the farmer cannot send two logins.
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => navigation.navigate("Signup")}
          disabled={busy}
        >
          <Text style={styles.linkText}>
            New here? Create an account
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  container: { padding: 24, paddingTop: 80 },

  title: {
    fontSize: 26, fontWeight: "bold",
    color: "#1b4332", marginBottom: 6,
  },
  subtitle: {
    fontSize: 14, color: "#495057",
    marginBottom: 26, lineHeight: 20,
  },

  button: {
    backgroundColor: "#1b4332", paddingVertical: 14,
    borderRadius: 8, alignItems: "center", marginTop: 10,
  },
  buttonDisabled: { backgroundColor: "#adb5bd" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  linkRow: { alignItems: "center", paddingVertical: 18 },
  linkText: { color: "#40916c", fontSize: 14, fontWeight: "bold" },

  errorBox: {
    backgroundColor: "#ffe8cc", padding: 11, borderRadius: 8,
    borderLeftWidth: 4, borderLeftColor: "#e8842c", marginBottom: 6,
  },
  errorText: { color: "#495057", fontSize: 13, lineHeight: 19 },
});
