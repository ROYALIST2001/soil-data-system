import React, { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Linking, useWindowDimensions,
} from "react-native";

import Icon from "../components/Icon";
import { colors } from "../theme";

import { useChat } from "../hooks/useChat";
import { useAppSelector, useAppDispatch } from "../store";
import { clearChat } from "../store/chatSlice";
import { DisplayMessage } from "../types/chat";

// Turn internal tool names into PLAIN ENGLISH.
//
// NEVER show a user an internal name. Same rule as "Cluster 0"
// in Phase 7: if a word will do, use the word.
const TOOL_LABELS: Record<string, string> = {
  books: "reference books",
  sri_lankan_agriculture: "Sri Lankan agriculture websites",
  sri_lankan_web: "Sri Lankan websites",
  agriculture_web: "agriculture websites",
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

const MESSAGE_LIST_PADDING = 20;
const MIN_INPUT_HEIGHT = 52;

// One message bubble.
function MessageBubble({ message, maxWidth }: { message: DisplayMessage; maxWidth: number }) {
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
      <View style={[styles.bubble, { maxWidth }, isFarmer ? styles.bubbleFarmer : styles.bubbleAdvisor]}>
        <Text style={[styles.messageText, isFarmer ? styles.textFarmer : styles.textAdvisor]}>
          {message.text}
        </Text>

        {/* Show which tools were used.
            WHY? So the farmer can SEE the answer came from THEIR data.
            It builds trust, and it is not a black box. */}
        {toolText && (
          <Text style={styles.toolNote}>Checked: {toolText}</Text>
        )}
        {message.sources && message.sources.length > 0 && (
          <View style={styles.sources}>
            <Text style={styles.sourceHeading}>Sources / මූලාශ්‍ර</Text>
            {message.sources.map((source) => source.kind === "web" && source.url?.startsWith("https://") ? (
              <TouchableOpacity key={source.id} accessibilityRole="link" onPress={() => Linking.openURL(source.url!)} style={styles.sourceCard}>
                <Text style={styles.sourceTitle}>[{source.id}] {source.title}</Text>
                <Text style={styles.sourceDetail}>{source.url}</Text>
              </TouchableOpacity>
            ) : (
              <View key={source.id} style={styles.sourceCard}>
                <Text style={styles.sourceTitle}>[{source.id}] {source.title}</Text>
                <Text style={styles.sourceDetail}>PDF page / පිටුව {source.page}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const [text, setText] = useState("");
  const [listWidth, setListWidth] = useState(0);
  const [inputContentHeight, setInputContentHeight] = useState(MIN_INPUT_HEIGHT);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
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
  // Measure the actual chat viewport, including in split-screen/landscape. A
  // numeric bound lets native Text measure all wrapped lines inside the padding.
  const messageMaxWidth = Math.max(1, (listWidth || windowWidth) - MESSAGE_LIST_PADDING * 2) * 0.9;
  const maxInputHeight = Math.max(MIN_INPUT_HEIGHT, Math.min(160, Math.floor(windowHeight / 4)));
  const inputHeight = Math.min(maxInputHeight, Math.max(MIN_INPUT_HEIGHT, inputContentHeight));

  function handleSend(message?: string) {
    const toSend = message || text;
    if (!toSend.trim() || isThinking) return;

    send(toSend);
    setText("");
    setInputContentHeight(MIN_INPUT_HEIGHT);
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
      <View style={styles.contextBar}>
        <View style={styles.contextIcon}><Icon name="sprout" size={20} /></View>
        <View style={{ flex: 1 }}><Text style={styles.contextTitle}>Your farming research assistant</Text>
          <Text style={styles.contextDetail}>{lastReading ? `${lastReading.crop} · Your field and trusted references` : "Books first · Trusted websites next"}</Text></View>
      </View>
      {/* ---------- The message list ---------- */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        contentContainerStyle={styles.messages}
        // Scroll to the bottom whenever a message is added.
        // Without this, the user has to scroll down every time.
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.length === 0 && (
          <View style={styles.welcomeBox}>
            <View style={styles.welcomeIcon}><Icon name="chat" size={31} color={colors.lime} /></View>
            <Text style={styles.welcomeTitle}>Let’s talk soil.</Text>

            <Text style={styles.welcomeText}>
              Ask in Sinhala or English. I’ll check the reference books first, then trusted agriculture websites when needed.
            </Text>

            {SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.suggestion}
                accessibilityRole="button"
                onPress={() => handleSend(s)}
              >
                <Text style={styles.suggestionText}>{s}</Text><Icon name="arrow" size={18} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} maxWidth={messageMaxWidth} />
        ))}

        {/* The thinking bubble.
            ALWAYS show that something is happening. Otherwise the
            user assumes the app is broken and taps Send again. */}
        {isThinking && (
          <View style={[styles.row, styles.rowLeft]}>
            <View style={[styles.bubble, { maxWidth: messageMaxWidth }, styles.bubbleAdvisor, styles.thinking]}>
              <ActivityIndicator size="small" color="#40916c" />
              <Text style={styles.thinkingText}>Checking books and sources...</Text>
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
          style={[styles.input, { height: inputHeight }]}
          value={text}
          onChangeText={setText}
          placeholder="Ask about your soil..."
          placeholderTextColor={colors.muted}
          accessibilityLabel="Your question for the soil advisor"
          selectionColor={colors.primary}
          multiline
          underlineColorAndroid="transparent"
          scrollEnabled={inputHeight >= maxInputHeight}
          onContentSizeChange={(event) => setInputContentHeight(Math.ceil(event.nativeEvent.contentSize.height) + 8)}
          maxLength={500}
        />

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Send question"
          accessibilityState={{ disabled: isThinking || !text.trim() }}
          style={[styles.sendButton, (isThinking || !text.trim()) && styles.sendDisabled]}
          onPress={() => handleSend()}
          // DISABLED while thinking, so the user cannot send twice.
          disabled={isThinking || !text.trim()}
        >
          <Icon name="send" color={colors.surface} size={21} />
        </TouchableOpacity>
      </View>

      {/* Start over. Only shown once a conversation exists. */}
      {messages.length > 0 && (
        <TouchableOpacity
          style={styles.clearButton}
          accessibilityRole="button"
          disabled={isThinking}
          onPress={() => dispatch(clearChat())}
        >
          <Text style={styles.clearText}>Start a new conversation</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sources: { marginTop: 16, gap: 8, minWidth: 0, alignSelf: "stretch" },
  sourceHeading: { color: colors.forest, fontSize: 11, fontWeight: "700" },
  sourceCard: { padding: 11, borderRadius: 10, backgroundColor: colors.sage, minHeight: 44, minWidth: 0 },
  sourceTitle: { color: colors.primary, fontSize: 12, fontWeight: "600", includeFontPadding: true },
  sourceDetail: { color: colors.secondary, fontSize: 11, marginTop: 4, includeFontPadding: true },
  container: { flex: 1, backgroundColor: colors.background },
  centre: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30, backgroundColor: colors.background },
  contextBar: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  contextIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: colors.sage, justifyContent: "center", alignItems: "center" },
  contextTitle: { color: colors.forest, fontWeight: "600", fontSize: 12 },
  contextDetail: { color: colors.muted, fontSize: 10, marginTop: 5, textTransform: "capitalize" },
  messageList: { flex: 1, minHeight: 0 },
  messages: { padding: MESSAGE_LIST_PADDING, paddingBottom: 24, flexGrow: 1 },
  row: { width: "100%", marginBottom: 15 },
  rowLeft: { alignItems: "flex-start" },
  rowRight: { alignItems: "flex-end" },
  bubble: { minWidth: 0, flexShrink: 1, padding: 16, borderRadius: 20 },
  bubbleFarmer: { backgroundColor: colors.primary, borderBottomRightRadius: 5 },
  bubbleAdvisor: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 5 },
  // Natural font metrics preserve Sinhala marks and accessibility text sizes.
  // No fixed line height or line limit: bubbles expand to contain the full text.
  messageText: { fontSize: 15, flexShrink: 1, minWidth: 0, alignSelf: "stretch", includeFontPadding: true, paddingVertical: 2 },
  textFarmer: { color: colors.surface },
  textAdvisor: { color: colors.text },
  toolNote: { fontSize: 11, color: colors.primary, marginTop: 13, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, includeFontPadding: true },
  thinking: { flexDirection: "row", alignItems: "center" },
  thinkingText: { marginLeft: 9, color: colors.secondary, fontSize: 12, flexShrink: 1 },
  welcomeBox: { paddingTop: 14, marginBottom: 12 },
  welcomeIcon: { width: 67, height: 67, borderRadius: 23, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center", marginBottom: 22 },
  welcomeTitle: { fontSize: 29, fontWeight: "700", color: colors.forest, marginBottom: 10, letterSpacing: -0.7 },
  welcomeText: { fontSize: 13, color: colors.secondary, marginBottom: 24, lineHeight: 22 },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 17, borderRadius: 15, marginBottom: 10, minHeight: 58 },
  suggestionText: { color: colors.forest, fontSize: 13, flex: 1, lineHeight: 20 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 17, paddingHorizontal: 15, paddingVertical: 12, fontSize: 15, color: colors.text, textAlignVertical: "top", includeFontPadding: true },
  sendButton: { backgroundColor: colors.primary, height: 52, width: 52, alignItems: "center", justifyContent: "center", borderRadius: 17, marginLeft: 10 },
  sendDisabled: { backgroundColor: colors.disabled },
  clearButton: { alignItems: "center", paddingVertical: 13, backgroundColor: colors.surface, minHeight: 44 },
  clearText: { color: colors.secondary, fontSize: 11 },
  errorBox: { backgroundColor: colors.warningSurface, padding: 14, borderRadius: 14, marginTop: 8 },
  errorText: { color: colors.warning, fontSize: 13, lineHeight: 20 },
  emptyIcon: { width: 84, height: 84, borderRadius: 27, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  emptyTitle: { fontSize: 24, fontWeight: "700", color: colors.forest, marginBottom: 12, textAlign: "center" },
  emptyText: { color: colors.secondary, fontSize: 14, textAlign: "center", lineHeight: 23 },
});
