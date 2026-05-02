import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { openSupportSms } from "@/lib/support";

export interface SupportButtonProps {
  stickerId?: string | null;
  bottom?: number;
}

export function SupportButton({ stickerId, bottom = 20 }: SupportButtonProps) {
  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        style={styles.button}
        onPress={() => openSupportSms(stickerId)}
      >
        <Text style={styles.text}>Text Support</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 20,
    bottom: 20,
  } as ViewStyle,
  button: {
    backgroundColor: "#000",
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
