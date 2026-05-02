import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { Station } from "@cuub/shared";
import { openDirectionsTo } from "@/lib/directions";

export interface StationModalProps {
  station: Station | null;
  onClose: () => void;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

export function StationModal({ station, onClose }: StationModalProps) {
  const visible = !!station;
  const showSlots =
    !!station && (hasValue(station.filled_slots) || hasValue(station.open_slots));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>{station?.title || "Title"}</Text>
            {showSlots && (
              <View style={styles.slots}>
                <View style={styles.slotInfo}>
                  <View style={[styles.slotIcon, styles.slotIconFilled]} />
                  <Text style={styles.slotText}>
                    <Text style={styles.slotNumber}>
                      {hasValue(station?.filled_slots)
                        ? String(station?.filled_slots)
                        : 0}
                    </Text>
                    {"  "}Filled Slots
                  </Text>
                </View>
                <View style={styles.slotInfo}>
                  <View style={[styles.slotIcon, styles.slotIconOpen]} />
                  <Text style={styles.slotText}>
                    <Text style={styles.slotNumber}>
                      {hasValue(station?.open_slots)
                        ? String(station?.open_slots)
                        : 0}
                    </Text>
                    {"  "}Open Slots
                  </Text>
                </View>
              </View>
            )}
          </View>

          <Pressable
            style={styles.directionsButton}
            onPress={() => {
              if (station) openDirectionsTo(station.latitude, station.longitude);
            }}
          >
            <Text style={styles.directionsText}>Get Directions</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.0)",
  },
  sheet: {
    backgroundColor: "#000",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "600", flex: 1 },
  slots: { alignItems: "flex-end", gap: 12 },
  slotInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  slotIcon: { width: 12, height: 12, borderRadius: 6 },
  slotIconFilled: { backgroundColor: "#0198FD" },
  slotIconOpen: { backgroundColor: "#808080" },
  slotText: { color: "#fff", fontSize: 14 },
  slotNumber: { fontWeight: "600" },
  directionsButton: {
    backgroundColor: "#0198FD",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  directionsText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
