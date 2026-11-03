import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";

interface Props {
  text: string;
  width: number;
  color: string;
}

function AndroidMessageText({ text, width, color }: Props) {
  const { fontScale } = useWindowDimensions();
  const [contentHeight, setContentHeight] = useState(0);
  const height = Math.max(Math.ceil(24 * fontScale) + 4, contentHeight);

  // Android 15+ can paint more lines than RN Text's separate measurement
  // reports (react-native#57957). EditText's content-size event comes from
  // the actual rendered layout, including fallback fonts used for Sinhala.
  // Keep it read-only and let the conversation handle touches and scrolling.
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      pointerEvents="none"
      style={{ width, minHeight: height }}
    >
      <TextInput
        accessible={false}
        importantForAccessibility="no"
        focusable={false}
        editable={false}
        showSoftInputOnFocus={false}
        caretHidden
        contextMenuHidden
        multiline
        scrollEnabled={false}
        underlineColorAndroid="transparent"
        value={text}
        onContentSizeChange={(event) => {
          const measuredHeight = event.nativeEvent.contentSize.height;
          if (Number.isFinite(measuredHeight) && measuredHeight > 0) {
            setContentHeight(Math.ceil(measuredHeight) + 2);
          }
        }}
        style={[styles.text, { width, height, color }]}
      />
    </View>
  );
}

export default function ChatMessageText(props: Props) {
  const { fontScale } = useWindowDimensions();

  if (Platform.OS === "android") {
    // A different width or accessibility font size needs a fresh native layout.
    return <AndroidMessageText key={`${props.width}:${fontScale}`} {...props} />;
  }

  return <Text style={[styles.text, { width: props.width, color: props.color }]}>{props.text}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontSize: 15,
    paddingHorizontal: 0,
    paddingVertical: 2,
    margin: 0,
    borderWidth: 0,
    flexShrink: 0,
    includeFontPadding: true,
    textAlignVertical: "top",
    backgroundColor: "transparent",
  },
});
