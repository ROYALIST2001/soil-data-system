import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform,
} from "react-native";

import InputField from "../components/InputField";
import SelectField from "../components/SelectField";
import { CROPS, Option } from "../constants/vocabulary";
import { useRelief } from "../hooks/useRelief";
import { useLands } from "../hooks/useLands";
import { Claim, DisasterEvent } from "../types/relief";

function cropLabel(value: string): string {
  const found = CROPS.find((c) => c.value === value);
  return found ? found.label : value;
}

function money(value: number | null): string {
  if (value === null) return "—";
  return "Rs " + value.toLocaleString("en-LK");
}

// What each stage MEANS to the farmer.
//
// "VERIFIED" tells a farmer nothing. "The officer has checked your land"
// tells them exactly where their money is. The internal word is for the
// system; the sentence is for the person waiting.
const STATUS_TEXT: Record<string, { title: string; detail: string }> = {
  SUBMITTED: {
    title: "Waiting for the officer",
    detail: "Your Grama Niladhari officer will come and check your land.",
  },
  VERIFIED: {
    title: "Checked, waiting for the department",
    detail: "The officer confirmed your loss. The department is now deciding.",
  },
  APPROVED: {
    title: "Money approved",
    detail: "Go to your divisional secretariat to collect it.",
  },
  PAID: {
    title: "Collected",
    detail: "This claim is finished.",
  },
  REJECTED: {
    title: "Not accepted",
    detail: "See the reason below.",
  },
};

const STATUS_COLOUR: Record<string, string> = {
  SUBMITTED: "#1864ab",
  VERIFIED: "#1b4332",
  APPROVED: "#a07800",
  PAID: "#2b8a3e",
  REJECTED: "#c92a2a",
};

// ---------- ONE CLAIM ----------
function ClaimCard({ claim }: { claim: Claim }) {
  const meaning = STATUS_TEXT[claim.status] ?? {
    title: claim.status,
    detail: "",
  };

  const reduced =
    claim.verified_area_ha !== null &&
    claim.verified_area_ha < claim.claimed_area_ha;

  return (
    <View style={styles.claimCard}>
      <Text style={styles.claimEvent}>{claim.event_name}</Text>

      <Text
        style={[
          styles.claimStatus,
          { color: STATUS_COLOUR[claim.status] ?? "#495057" },
        ]}
      >
        {meaning.title}
      </Text>
      <Text style={styles.claimDetail}>{meaning.detail}</Text>

      <View style={styles.claimRow}>
        <Text style={styles.claimKey}>Crop</Text>
        <Text style={styles.claimValue}>{cropLabel(claim.crop)}</Text>
      </View>

      <View style={styles.claimRow}>
        <Text style={styles.claimKey}>You said was lost</Text>
        <Text style={styles.claimValue}>
          {claim.claimed_area_ha.toFixed(2)} ha
        </Text>
      </View>

      {claim.verified_area_ha !== null && (
        <View style={styles.claimRow}>
          <Text style={styles.claimKey}>Officer confirmed</Text>
          <Text
            style={[styles.claimValue, reduced && { color: "#e8842c" }]}
          >
            {claim.verified_area_ha.toFixed(2)} ha
          </Text>
        </View>
      )}

      {claim.amount_lkr !== null && (
        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Compensation</Text>
          <Text style={styles.amountValue}>{money(claim.amount_lkr)}</Text>
        </View>
      )}
    </View>
  );
}

// ---------- THE SCREEN ----------
export default function ReliefScreen() {
  const { lands } = useLands();
  const {
    disasters, claims, loading, saving, errorMessage,
    reload, claim, clearError,
  } = useRelief();

  // Which disaster the farmer is claiming against. null = form closed.
  const [openFor, setOpenFor] = useState<DisasterEvent | null>(null);

  const [landCropId, setLandCropId] = useState("");
  const [area, setArea] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Which of the farmer's crops this scheme actually covers.
  //
  // Offering a crop with no rate would mean letting them fill in a whole
  // form only to be told at the end that it was never possible.
  function claimableCrops(event: DisasterEvent): Option[] {
    const covered = new Set(event.rates.map((r) => r.crop));
    const alreadyClaimed = new Set(
      claims
        .filter((c) => c.event_id === event.event_id)
        .map((c) => c.land_crop_id)
    );

    const options: Option[] = [];

    for (const land of lands) {
      for (const c of land.crops) {
        if (!covered.has(c.crop)) continue;
        if (alreadyClaimed.has(c.land_crop_id)) continue;

        options.push({
          value: String(c.land_crop_id),
          label: `${cropLabel(c.crop)} — ${c.size_ha.toFixed(2)} ha, ${land.name}`,
        });
      }
    }

    return options;
  }

  function openForm(event: DisasterEvent) {
    const options = claimableCrops(event);

    setOpenFor(event);
    setLandCropId(options.length > 0 ? options[0].value : "");
    setArea("");
    setNote("");
    setLocalError(null);
    clearError();
  }

  async function send() {
    setLocalError(null);

    if (!openFor) return;

    const value = parseFloat(area);

    if (!landCropId) {
      setLocalError("Please choose which crop was lost.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setLocalError("Please enter how much was lost, in hectares.");
      return;
    }

    const ok = await claim(
      openFor.event_id, parseInt(landCropId, 10), value, note.trim()
    );

    if (ok) {
      setOpenFor(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color="#1b4332" />
      </View>
    );
  }

  const message = localError ?? errorMessage;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} />
        }
      >
        <Text style={styles.title}>Disaster Relief</Text>
        <Text style={styles.subtitle}>
          If a flood or other disaster destroys your crop, the government may
          pay compensation. You can only claim when a disaster has been
          declared for your area.
        </Text>

        {message && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        {/* ---------- WHAT CAN BE CLAIMED ---------- */}
        <Text style={styles.sectionTitle}>Open for claims</Text>

        {disasters.length === 0 ? (
          <Text style={styles.empty}>
            No disaster has been declared for your area. That is good news.
          </Text>
        ) : (
          disasters.map((d) => {
            const options = claimableCrops(d);

            return (
              <View key={d.event_id} style={styles.eventCard}>
                <Text style={styles.eventName}>{d.name}</Text>
                <Text style={styles.eventMeta}>
                  {d.disaster_type} · {d.started_on} to {d.ended_on}
                </Text>

                {d.description ? (
                  <Text style={styles.eventDesc}>{d.description}</Text>
                ) : null}

                <Text style={styles.rates}>
                  {d.rates
                    .map(
                      (r) =>
                        `${cropLabel(r.crop)} ${money(r.rate_per_hectare)}/ha`
                    )
                    .join("  ·  ")}
                </Text>

                {openFor?.event_id === d.event_id ? (
                  // ---------- THE CLAIM FORM ----------
                  <View style={styles.form}>
                    {options.length === 0 ? (
                      <Text style={styles.empty}>
                        You have already claimed for every crop this scheme
                        covers, or you grow none of them.
                      </Text>
                    ) : (
                      <>
                        <SelectField
                          label="Which crop was lost?"
                          value={landCropId}
                          options={options}
                          onSelect={setLandCropId}
                        />

                        <InputField
                          label="How much was lost — hectares"
                          value={area}
                          onChangeText={setArea}
                          numeric
                        />
                        <Text style={styles.hint}>
                          You cannot claim for more than you registered.
                        </Text>

                        <InputField
                          label="What happened (optional)"
                          value={note}
                          onChangeText={setNote}
                          placeholder="e.g. Water stood for three days"
                        />

                        <TouchableOpacity
                          style={[
                            styles.primaryButton,
                            saving && styles.disabled,
                          ]}
                          onPress={send}
                          disabled={saving}
                        >
                          {saving ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text style={styles.primaryText}>
                              Send my claim
                            </Text>
                          )}
                        </TouchableOpacity>
                      </>
                    )}

                    <TouchableOpacity
                      style={styles.cancel}
                      onPress={() => setOpenFor(null)}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.claimButton}
                    onPress={() => openForm(d)}
                  >
                    <Text style={styles.claimButtonText}>
                      Claim for a lost crop
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {/* ---------- MY CLAIMS ---------- */}
        <Text style={[styles.sectionTitle, { marginTop: 26 }]}>
          My claims
        </Text>

        {claims.length === 0 ? (
          <Text style={styles.empty}>You have not made any claims.</Text>
        ) : (
          claims.map((c) => <ClaimCard key={c.claim_id} claim={c} />)
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  container: { padding: 18, paddingTop: 22, paddingBottom: 46 },
  centre: { flex: 1, justifyContent: "center", alignItems: "center" },

  title: { fontSize: 22, fontWeight: "bold", color: "#1b4332" },
  subtitle: {
    fontSize: 13, color: "#495057",
    marginTop: 4, marginBottom: 20, lineHeight: 19,
  },

  sectionTitle: {
    fontSize: 16, fontWeight: "bold",
    color: "#1b4332", marginBottom: 10,
  },
  empty: {
    fontSize: 13, color: "#868e96",
    fontStyle: "italic", marginBottom: 12, lineHeight: 19,
  },
  hint: {
    fontSize: 12, color: "#868e96",
    marginTop: -8, marginBottom: 12,
  },

  eventCard: {
    borderWidth: 1, borderColor: "#dee2e6",
    borderRadius: 10, padding: 14, marginBottom: 12,
  },
  eventName: { fontSize: 16, fontWeight: "bold", color: "#212529" },
  eventMeta: { fontSize: 12, color: "#868e96", marginTop: 3 },
  eventDesc: { fontSize: 13, color: "#495057", marginTop: 8, lineHeight: 19 },
  rates: { fontSize: 12, color: "#40916c", marginTop: 8, lineHeight: 18 },

  claimButton: {
    backgroundColor: "#1b4332", borderRadius: 8,
    paddingVertical: 12, alignItems: "center", marginTop: 12,
  },
  claimButtonText: { color: "#fff", fontSize: 14, fontWeight: "bold" },

  form: {
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: "#dee2e6",
  },
  primaryButton: {
    backgroundColor: "#1b4332", borderRadius: 8,
    paddingVertical: 13, alignItems: "center", marginTop: 4,
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  disabled: { backgroundColor: "#adb5bd" },
  cancel: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: "#868e96", fontSize: 13 },

  claimCard: {
    backgroundColor: "#f8f9fa", borderRadius: 10,
    padding: 14, marginBottom: 12,
  },
  claimEvent: { fontSize: 13, color: "#868e96", marginBottom: 6 },
  claimStatus: { fontSize: 16, fontWeight: "bold" },
  claimDetail: {
    fontSize: 13, color: "#495057",
    marginTop: 3, marginBottom: 12, lineHeight: 19,
  },
  claimRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 5,
  },
  claimKey: { fontSize: 13, color: "#868e96" },
  claimValue: { fontSize: 14, color: "#212529", fontWeight: "500" },

  amountBox: {
    backgroundColor: "#d8f3dc", borderRadius: 8,
    padding: 12, marginTop: 10, alignItems: "center",
  },
  amountLabel: { fontSize: 12, color: "#1b4332" },
  amountValue: {
    fontSize: 22, fontWeight: "bold",
    color: "#1b4332", marginTop: 2,
  },

  errorBox: {
    backgroundColor: "#ffe8cc", padding: 11, borderRadius: 8,
    borderLeftWidth: 4, borderLeftColor: "#e8842c", marginBottom: 14,
  },
  errorText: { color: "#495057", fontSize: 13, lineHeight: 19 },
});
