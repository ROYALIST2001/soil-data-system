import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform,
} from "react-native";

import InputField from "../components/InputField";
import SelectField from "../components/SelectField";
import { CROPS, Option } from "../constants/vocabulary";
import { useSubsidy } from "../hooks/useSubsidy";
import { useLands } from "../hooks/useLands";
import { SubsidyApplication, SubsidyRound } from "../types/subsidy";

function cropLabel(value: string): string {
  const found = CROPS.find((c) => c.value === value);
  return found ? found.label : value;
}

function money(value: number | null): string {
  if (value === null) return "—";
  return "Rs " + value.toLocaleString("en-LK");
}

// WHAT EACH STAGE MEANS TO THE FARMER.
//
// "APPROVED" tells a farmer nothing about whether they have been paid.
// Saying where their money actually is, in a sentence, is the difference
// between a screen that informs and one that merely reports.
const STATUS_TEXT: Record<string, { title: string; detail: string }> = {
  SUBMITTED: {
    title: "Waiting for the officer",
    detail: "Your Grama Niladhari officer will check your application.",
  },
  APPROVED: {
    title: "Approved, waiting for the money",
    detail: "The department will send the money to you.",
  },
  SENT: {
    title: "Money has been sent",
    detail: "Please tell us below whether it reached you.",
  },
  RECEIVED: {
    title: "Received",
    detail: "You confirmed the money arrived. This is finished.",
  },
  DISPUTED: {
    title: "You reported it did not arrive",
    detail: "The department is looking into it.",
  },
  RESOLVED: {
    title: "The department has answered",
    detail: "See their reply below.",
  },
  REJECTED: {
    title: "Not approved",
    detail: "See the reason below.",
  },
};

const STATUS_COLOUR: Record<string, string> = {
  SUBMITTED: "#1864ab",
  APPROVED: "#a07800",
  SENT: "#5f3dc4",
  RECEIVED: "#2b8a3e",
  DISPUTED: "#c92a2a",
  RESOLVED: "#1b4332",
  REJECTED: "#495057",
};

export default function SubsidyScreen() {
  const { lands } = useLands();
  const {
    rounds, applications, loading, saving, errorMessage,
    reload, apply, confirmReceived, dispute, clearError,
  } = useSubsidy();

  const [openFor, setOpenFor] = useState<SubsidyRound | null>(null);
  const [landCropId, setLandCropId] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // The dispute form, open for one application at a time.
  const [disputeFor, setDisputeFor] = useState<number | null>(null);
  const [disputeNote, setDisputeNote] = useState("");

  // Which of this farmer's crops the round covers and they have not already
  // applied for. Offering a crop that would be refused only wastes their
  // time filling in a form.
  function applicableCrops(round: SubsidyRound): Option[] {
    const covered = new Set(round.rates.map((r) => r.crop));
    const already = new Set(
      applications
        .filter((a) => a.round_id === round.round_id)
        .map((a) => a.land_crop_id)
    );

    const options: Option[] = [];

    for (const land of lands) {
      for (const c of land.crops) {
        if (!covered.has(c.crop)) continue;
        if (already.has(c.land_crop_id)) continue;

        const rate = round.rates.find((r) => r.crop === c.crop);
        const worth = rate ? ` → ${money(rate.rate_per_hectare * c.size_ha)}` : "";

        options.push({
          value: String(c.land_crop_id),
          label: `${cropLabel(c.crop)} ${c.size_ha.toFixed(2)} ha${worth}`,
        });
      }
    }

    return options;
  }

  function openForm(round: SubsidyRound) {
    const options = applicableCrops(round);

    setOpenFor(round);
    setLandCropId(options.length > 0 ? options[0].value : "");
    setNote("");
    setLocalError(null);
    clearError();
  }

  async function send() {
    setLocalError(null);
    if (!openFor) return;

    if (!landCropId) {
      setLocalError("Please choose which crop you are applying for.");
      return;
    }

    const ok = await apply(
      openFor.round_id, parseInt(landCropId, 10), note.trim()
    );
    if (ok) setOpenFor(null);
  }

  function askConfirm(app: SubsidyApplication) {
    // ASK FIRST. Confirming receipt closes the application, and a farmer who
    // taps it by mistake loses their way of reporting a problem.
    Alert.alert(
      "Did the money arrive?",
      `Confirm that you received ${money(app.amount_lkr)}.`,
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Yes, I received it",
          onPress: () => confirmReceived(app.application_id),
        },
      ]
    );
  }

  async function sendDispute(app: SubsidyApplication) {
    const ok = await dispute(app.application_id, disputeNote.trim());
    if (ok) {
      setDisputeFor(null);
      setDisputeNote("");
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
        <Text style={styles.title}>Fertilizer Subsidy</Text>
        <Text style={styles.subtitle}>
          The government pays part of the cost of fertilizer. Apply while a
          round is open for your area, and tell us whether the money reaches
          you.
        </Text>

        {message && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        {/* ---------- OPEN ROUNDS ---------- */}
        <Text style={styles.sectionTitle}>Open for applications</Text>

        {rounds.length === 0 ? (
          <Text style={styles.empty}>
            No subsidy round is open for your area right now.
          </Text>
        ) : (
          rounds.map((r) => {
            const options = applicableCrops(r);

            return (
              <View key={r.round_id} style={styles.roundCard}>
                <Text style={styles.roundName}>{r.name}</Text>
                <Text style={styles.roundMeta}>
                  {r.season} season · closes {r.closes_on}
                </Text>

                {r.description ? (
                  <Text style={styles.roundDesc}>{r.description}</Text>
                ) : null}

                <Text style={styles.rates}>
                  {r.rates
                    .map(
                      (x) =>
                        `${cropLabel(x.crop)} ${money(x.rate_per_hectare)}/ha`
                    )
                    .join("  ·  ")}
                </Text>

                {openFor?.round_id === r.round_id ? (
                  <View style={styles.form}>
                    {options.length === 0 ? (
                      <Text style={styles.empty}>
                        You have already applied for every crop this round
                        covers, or you grow none of them.
                      </Text>
                    ) : (
                      <>
                        <SelectField
                          label="Which crop?"
                          value={landCropId}
                          options={options}
                          onSelect={setLandCropId}
                        />

                        <InputField
                          label="Anything to add (optional)"
                          value={note}
                          onChangeText={setNote}
                          placeholder="e.g. Planting in the first week"
                        />

                        <TouchableOpacity
                          style={[styles.primaryButton, saving && styles.disabled]}
                          onPress={send}
                          disabled={saving}
                        >
                          {saving ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text style={styles.primaryText}>
                              Send my application
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
                    style={styles.applyButton}
                    onPress={() => openForm(r)}
                  >
                    <Text style={styles.applyButtonText}>
                      Apply for this subsidy
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {/* ---------- MY APPLICATIONS ---------- */}
        <Text style={[styles.sectionTitle, { marginTop: 26 }]}>
          My applications
        </Text>

        {applications.length === 0 ? (
          <Text style={styles.empty}>You have not applied for anything.</Text>
        ) : (
          applications.map((a) => {
            const meaning = STATUS_TEXT[a.status] ?? {
              title: a.status,
              detail: "",
            };

            return (
              <View key={a.application_id} style={styles.appCard}>
                <Text style={styles.appRound}>{a.round_name}</Text>

                <Text
                  style={[
                    styles.appStatus,
                    { color: STATUS_COLOUR[a.status] ?? "#495057" },
                  ]}
                >
                  {meaning.title}
                </Text>
                <Text style={styles.appDetail}>{meaning.detail}</Text>

                <View style={styles.appRow}>
                  <Text style={styles.appKey}>Crop</Text>
                  <Text style={styles.appValue}>
                    {cropLabel(a.crop)} · {a.area_ha.toFixed(2)} ha
                  </Text>
                </View>

                {a.amount_lkr !== null && (
                  <View style={styles.amountBox}>
                    <Text style={styles.amountLabel}>Subsidy</Text>
                    <Text style={styles.amountValue}>
                      {money(a.amount_lkr)}
                    </Text>
                  </View>
                )}

                {/* ---------- THE FARMER'S OWN TWO ACTIONS ----------
                    Only once the department says the money has been sent.
                    Until then there is nothing for the farmer to confirm. */}
                {a.status === "SENT" && (
                  <View style={styles.actionBox}>
                    <Text style={styles.actionPrompt}>
                      Did {money(a.amount_lkr)} reach you?
                    </Text>

                    <TouchableOpacity
                      style={[styles.yesButton, saving && styles.disabled]}
                      onPress={() => askConfirm(a)}
                      disabled={saving}
                    >
                      <Text style={styles.yesText}>Yes, I received it</Text>
                    </TouchableOpacity>

                    {disputeFor === a.application_id ? (
                      <View style={{ marginTop: 12 }}>
                        <InputField
                          label="What happened?"
                          value={disputeNote}
                          onChangeText={setDisputeNote}
                          placeholder="e.g. Nothing came to my bank account"
                        />
                        <Text style={styles.hint}>
                          Please write at least 10 characters. The department
                          will read this.
                        </Text>

                        <TouchableOpacity
                          style={[styles.noButton, saving && styles.disabled]}
                          onPress={() => sendDispute(a)}
                          disabled={saving}
                        >
                          {saving ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text style={styles.noText}>
                              Report to the department
                            </Text>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.cancel}
                          onPress={() => setDisputeFor(null)}
                        >
                          <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.noLink}
                        onPress={() => {
                          setDisputeFor(a.application_id);
                          setDisputeNote("");
                          clearError();
                        }}
                      >
                        <Text style={styles.noLinkText}>
                          No, I did not receive it
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })
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

  roundCard: {
    borderWidth: 1, borderColor: "#dee2e6",
    borderRadius: 10, padding: 14, marginBottom: 12,
  },
  roundName: { fontSize: 16, fontWeight: "bold", color: "#212529" },
  roundMeta: { fontSize: 12, color: "#868e96", marginTop: 3 },
  roundDesc: { fontSize: 13, color: "#495057", marginTop: 8, lineHeight: 19 },
  rates: { fontSize: 12, color: "#40916c", marginTop: 8, lineHeight: 18 },

  applyButton: {
    backgroundColor: "#1b4332", borderRadius: 8,
    paddingVertical: 12, alignItems: "center", marginTop: 12,
  },
  applyButtonText: { color: "#fff", fontSize: 14, fontWeight: "bold" },

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

  appCard: {
    backgroundColor: "#f8f9fa", borderRadius: 10,
    padding: 14, marginBottom: 12,
  },
  appRound: { fontSize: 13, color: "#868e96", marginBottom: 6 },
  appStatus: { fontSize: 16, fontWeight: "bold" },
  appDetail: {
    fontSize: 13, color: "#495057",
    marginTop: 3, marginBottom: 12, lineHeight: 19,
  },
  appRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 5,
  },
  appKey: { fontSize: 13, color: "#868e96" },
  appValue: { fontSize: 14, color: "#212529", fontWeight: "500" },

  amountBox: {
    backgroundColor: "#d8f3dc", borderRadius: 8,
    padding: 12, marginTop: 10, alignItems: "center",
  },
  amountLabel: { fontSize: 12, color: "#1b4332" },
  amountValue: {
    fontSize: 22, fontWeight: "bold",
    color: "#1b4332", marginTop: 2,
  },

  actionBox: {
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: "#dee2e6",
  },
  actionPrompt: {
    fontSize: 14, fontWeight: "bold",
    color: "#212529", marginBottom: 10,
  },
  yesButton: {
    backgroundColor: "#2b8a3e", borderRadius: 8,
    paddingVertical: 13, alignItems: "center",
  },
  yesText: { color: "#fff", fontSize: 15, fontWeight: "bold" },

  noLink: { alignItems: "center", paddingVertical: 12 },
  noLinkText: { color: "#c92a2a", fontSize: 14, fontWeight: "bold" },

  noButton: {
    backgroundColor: "#c92a2a", borderRadius: 8,
    paddingVertical: 13, alignItems: "center",
  },
  noText: { color: "#fff", fontSize: 15, fontWeight: "bold" },

  errorBox: {
    backgroundColor: "#ffe8cc", padding: 11, borderRadius: 8,
    borderLeftWidth: 4, borderLeftColor: "#e8842c", marginBottom: 14,
  },
  errorText: { color: "#495057", fontSize: 13, lineHeight: 19 },
});
