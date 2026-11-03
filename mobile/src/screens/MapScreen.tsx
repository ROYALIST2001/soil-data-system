import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { useFocusEffect } from "@react-navigation/native";
import { API_BASE_URL } from "../config";
import { colors } from "../theme";
import AppButton from "../components/AppButton";
import SelectField from "../components/SelectField";
import { useAppSelector } from "../store";

export default function MapScreen() {
  const lands = useAppSelector((s) => s.land.lands);
  const lastReading = useAppSelector((s) => s.reading.result);
  const [landId, setLandId] = useState(lastReading?.land_id ?? lands[0]?.land_id);
  const [failed, setFailed] = useState(false);
  const webRef = useRef<WebView>(null);
  const hasFocused = useRef(false);
  const land = lands.find((item) => item.land_id === landId) ?? lands[0];
  const division = land?.gn_division ?? lastReading?.gn_division_code ?? "";
  const uri = `${API_BASE_URL}/soil-map/?division=${encodeURIComponent(division)}`;

  useFocusEffect(useCallback(() => {
    // Refresh averages after another test, including when this tab stays mounted.
    if (hasFocused.current) webRef.current?.reload();
    hasFocused.current = true;
  }, []));

  return (
    <View style={styles.container}>
      {lands.length > 0 && <View style={styles.landPicker}>
        <SelectField label="Focus on your land's division" value={String(land?.land_id ?? "")}
          options={lands.map((item) => ({ value: String(item.land_id), label: item.name }))}
          onSelect={(value) => { setFailed(false); setLandId(Number(value)); }} />
      </View>}
      {failed ? <View style={styles.error}>
        <Text style={styles.title}>The map could not be loaded</Text>
        <Text style={styles.message}>Check your connection to the soil server and try again.</Text>
        <AppButton title="Retry map" onPress={() => setFailed(false)} />
      </View> : <WebView
        key={uri}
        ref={webRef}
        source={{ uri }}
        style={styles.map}
        originWhitelist={[API_BASE_URL]}
        onShouldStartLoadWithRequest={(request) => request.url.startsWith(`${API_BASE_URL}/soil-map/`)}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled={false}
        startInLoadingState
        renderLoading={() => <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.message}>Loading soil map…</Text></View>}
        onError={() => setFailed(true)}
        onHttpError={(event) => { if (event.nativeEvent.url === uri) setFailed(true); }}
      />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  landPicker: { paddingHorizontal: 14, paddingTop: 10, backgroundColor: colors.surface },
  map: { flex: 1, backgroundColor: colors.background },
  loading: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  error: { flex: 1, justifyContent: "center", padding: 25, gap: 14 },
  title: { fontSize: 18, fontWeight: "700", color: colors.forest },
  message: { fontSize: 13, color: colors.secondary, marginTop: 12, lineHeight: 21 },
});
