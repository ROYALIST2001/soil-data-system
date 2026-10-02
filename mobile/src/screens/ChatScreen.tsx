import React, { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";

import { useChat } from "../hooks/useChat";
import { useAppSelector, useAppDispatch } from "../store";
import { clearChat } from "../store/chatSlice";
import { DisplayMessage } from "../types/chat";

// Turn internal tool names into PLAIN ENGLISH.
//
// NEVER show a user an internal name. Same rule as "Cluster 0"
// in Phase 7: if a word will do, use the word.
const TOOL_LABELS: Record<string, string> = {
  get_soil_history: "your soil history",
  get_fertilizer_advice: "fertilizer advice",
  get_region_info: "regional soil data",
  get_weather: "weather",
};

// Starter questions.
//
// WHY? A blank chat screen is intimidating. A farmer may not know
// what to ask. These teach what the advisor can do, and each one
// demonstrates a DIFFERENT tool.
const SUGGESTIONS = [
  "How is my soil doing?",
  "What fertilizer do I need and how much?",
  "Is my soil problem common in this area?",
];

// One message bubble.
function MessageBubble({ message }: { message: DisplayMessage }) {
  const isFarmer = message.from === "farmer";

  // Turn the tool names into a readable list.
  const toolText =
    message.toolsUsed && message.toolsUsed.length > 0
      ? message.toolsUsed
          .map((t) => TOOL_LABELS[t] || t)
          .filter((v, i, a) => a.indexOf(v) === i)   // remove duplicates
          .join(", ")
      : null;

  return (
    <View style={[styles.row, isFarmer ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.bubble, isFarmer ? styles.bubbleFarmer : styles.bubbleAdvisor]}>
        <Text style={isFarmer ? styles.textFarmer : styles.textAdvisor}>
          {message.text}
        </Text>

        {/* Show which tools were used.
            WHY? So the farmer can SEE the answer came from THEIR data.
            It builds trust, and it is not a black box. */}
        {toolText && (
          <Text style={styles.toolNote}>Based on: {toolText}</Text>
        )}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const [text, setText] = useState("");
  const dispatch = useAppDispatch();
  const { send } = useChat();

  const status = useAppSelector((s) => s.chat.status);
  const messages = useAppSelector((s) => s.chat.messages);
  const errorMessage = useAppSelector((s) => s.chat.errorMessage);
  const lastReading = useAppSelector((s) => s.reading.result);

  // A REF gives us direct access to the ScrollView,
  // so we can tell it to scroll.
  //
  // useState holds DATA. A ref holds a THING.
  const scrollRef = useRef<ScrollView>(null);

  const isThinking = status === "thinking";

  function handleSend(message?: string) {
    const toSend = message || text;
    if (!toSend.trim() || isThinking) return;

    send(toSend);
    setText("");
  }

  // ---------- No soil reading yet ----------
  //
  // The tools need a field to look at. Explain kindly,
  // and give the next step.
  if (!lastReading) {
    return (
      <View style={styles.centre}>
        <Text style={styles.emptyTitle}>No soil test yet</Text>
        <Text style={styles.emptyText}>
          The advisor needs your soil data to give real answers.
          Go to the Test tab and submit a reading first.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      // Android and iOS handle keyboards differently.
      // This one line covers both. Without it, the keyboard
      // COVERS the input box and the app feels broken.
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      {/* ---------- The message list ---------- */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messages}
        // Scroll to the bottom whenever a message is added.
        // Without this, the user has to scroll down every time.
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.length === 0 && (
          <View style={styles.welcomeBox}>
            <Text style={styles.welcomeTitle}>Ask about your soil</Text>

            <Text style={styles.welcomeText}>
              I can look at your real soil readings and give advice
              for your field.
            </Text>

            {SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.suggestion}
                onPress={() => handleSend(s)}
              >
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {/* The thinking bubble.
            ALWAYS show that something is happening. Otherwise the
            user assumes the app is broken and taps Send again. */}
        {isThinking && (
          <View style={[styles.row, styles.rowLeft]}>
            <View style={[styles.bubble, styles.bubbleAdvisor, styles.thinking]}>
              <ActivityIndicator size="small" color="#40916c" />
              <Text style={styles.thinkingText}>Checking your data...</Text>
            </View>
          </View>
        )}

        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}
      </ScrollView>

      {/* ---------- The input bar ---------- */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Ask about your soil..."
          placeholderTextColor="#adb5bd"
          multiline
          maxLength={500}
        />

        <TouchableOpacity
          style={[styles.sendButton, (isThinking || !text.trim()) && styles.sendDisabled]}
          onPress={() => handleSend()}
          // DISABLED while thinking, so the user cannot send twice.
          disabled={isThinking || !text.trim()}
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>

      {/* Start over. Only shown once a conversation exists. */}
      {messages.length > 0 && (
        <TouchableOpacity
          style={styles.clearButton}
          onPress={() => dispatch(clearChat())}
        >
          <Text style={styles.clearText}>Start a new conversation</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centre: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30 },

  messages: { padding: 14, paddingBottom: 20 },

  row: { flexDirection: "row", marginBottom: 10 },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },

  bubble: { maxWidth: "82%", padding: 11, borderRadius: 14 },

  // Farmer on the RIGHT, green. Advisor on the LEFT, grey.
  // Different sides mean your eye tells who said what INSTANTLY,
  // without reading. Every chat app does this. Do not invent
  // something new - users already know this pattern.
  bubbleFarmer: { backgroundColor: "#40916c", borderBottomRightRadius: 4 },
  bubbleAdvisor: { backgroundColor: "#f1f3f5", borderBottomLeftRadius: 4 },

  textFarmer: { color: "#fff", fontSize: 15, lineHeight: 21 },
  textAdvisor: { color: "#212529", fontSize: 15, lineHeight: 21 },

  toolNote: {
    fontSize: 11, color: "#868e96", marginTop: 7,
    paddingTop: 5, borderTopWidth: 1, borderTopColor: "#dee2e6",
    fontStyle: "italic",
  },

  thinking: { flexDirection: "row", alignItems: "center" },
  thinkingText: { marginLeft: 8, color: "#495057", fontSize: 14 },

  welcomeBox: { padding: 8, marginBottom: 10 },
  welcomeTitle: { fontSize: 18, fontWeight: "bold", color: "#1b4332", marginBottom: 6 },
  welcomeText: { fontSize: 14, color: "#495057", marginBottom: 16, lineHeight: 20 },

  suggestion: {
    backgroundColor: "#d8f3dc", padding: 12,
    borderRadius: 10, marginBottom: 8,
  },
  suggestionText: { color: "#1b4332", fontSize: 14 },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end",
    padding: 10, borderTopWidth: 1, borderTopColor: "#dee2e6",
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: "#ced4da",
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 15, maxHeight: 100, color: "#212529",
  },
  sendButton: {
    backgroundColor: "#1b4332", paddingHorizontal: 18,
    paddingVertical: 11, borderRadius: 20, marginLeft: 8,
  },
  sendDisabled: { backgroundColor: "#adb5bd" },
  sendText: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  clearButton: { alignItems: "center", paddingVertical: 8 },
  clearText: { color: "#868e96", fontSize: 12 },

  errorBox: {
    backgroundColor: "#ffe8cc", padding: 11, borderRadius: 8,
    borderLeftWidth: 4, borderLeftColor: "#e8842c", marginTop: 6,
  },
  errorText: { color: "#495057", fontSize: 13, lineHeight: 19 },

  emptyTitle: { fontSize: 18, fontWeight: "bold", color: "#1b4332", marginBottom: 8 },
  emptyText: { color: "#868e96", fontSize: 14, textAlign: "center", lineHeight: 20 },
});
