import React, { useEffect, useRef, useState } from "react";
import { Text, Pressable, StyleSheet, View } from "react-native";
import { CatalogDistrict, getDistricts, getGNDivisions, GNDivision, resolveGNDivision } from "../api/locationApi";
import { colors } from "../theme";
import SelectField from "./SelectField";

interface Props {
  value: string;
  onSelect: (value: string) => void;
  defaultDivision?: string;
  disabled?: boolean;
}

export default function GNDivisionField({ value, onSelect, defaultDivision = "", disabled = false }: Props) {
  const [districts, setDistricts] = useState<CatalogDistrict[]>([]);
  const [district, setDistrict] = useState("");
  const [divisions, setDivisions] = useState<GNDivision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [legacyHint, setLegacyHint] = useState("");
  const userChoseDistrict = useRef(false);

  useEffect(() => {
    let active = true;
    getDistricts().then((rows) => { if (active) setDistricts(rows); })
      .catch(() => { if (active) setError("Could not load districts. Check your connection and try again."); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!defaultDivision) return;
    let active = true;
    resolveGNDivision(defaultDivision).then((division) => {
      if (active && !userChoseDistrict.current) { setDistrict(division.district_code); onSelect(division.value); }
    }).catch(() => {
      if (active && !userChoseDistrict.current) setLegacyHint(`Saved division: ${defaultDivision}. Choose its district and official GN division below.`);
    });
    return () => { active = false; };
  }, [defaultDivision, onSelect]);

  useEffect(() => {
    if (!district) return;
    let active = true;
    setLoading(true); setError(null); setDivisions([]);
    getGNDivisions(district).then((rows) => { if (active) setDivisions(rows); })
      .catch(() => { if (active) setError("Could not load GN divisions. Check your connection and try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [district, retry]);

  function changeDistrict(code: string) {
    userChoseDistrict.current = true;
    setDistrict(code); setDivisions([]); onSelect(""); setLegacyHint("");
  }

  return <View>
    {legacyHint ? <Text style={styles.note}>{legacyHint}</Text> : null}
    <SelectField label="District" value={district} onSelect={changeDistrict} searchable
      options={districts.map((row) => ({ value: row.code, label: row.name }))}
      disabled={disabled} placeholder={districts.length ? "Choose a district" : "Loading districts..."} />
    <SelectField label="Grama Niladhari Division" value={value} onSelect={onSelect} searchable
      options={divisions.map((row) => ({ value: row.value, label: `${row.name} · ${row.ds_division} · ${row.code}`, searchText: `${row.name}\n${row.code}` }))}
      disabled={disabled || !district || loading}
      placeholder={!district ? "Choose a district first" : loading ? "Loading GN divisions..." : "Choose your GN division"}
      searchPlaceholder="Type a GN name or code" />
    {error ? <View style={styles.error}>
      <Text style={styles.note}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={() => { setError(null); setRetry((count) => count + 1); }} style={styles.retry}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  note: { fontSize: 12, lineHeight: 19, color: colors.secondary, marginBottom: 10 },
  error: { marginBottom: 16 },
  retry: { padding: 10, alignSelf: "flex-start", backgroundColor: colors.sage, borderRadius: 10, minHeight: 44 },
  retryText: { color: colors.primary, fontWeight: "700" },
});
