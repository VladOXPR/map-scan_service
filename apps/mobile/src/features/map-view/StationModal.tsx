import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Station } from "@cuub/shared";
import { openDirectionsTo } from "@/lib/directions";

export interface StationModalProps {
  station: Station | null;
  onClose: () => void;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

/** Bottom location sheet — absolute overlay (no RN Modal). */
export function StationModal({ station, onClose }: StationModalProps) {
  if (!station) return null;

  const isInactive = station.inactive === true;
  const isOffline = !isInactive && station.online === false;
  const showSlots =
    !isOffline &&
    !isInactive &&
    (hasValue(station.filled_slots) || hasValue(station.open_slots));

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{station.title || "Title"}</Text>
          {(isInactive || isOffline) && (
            <Text style={styles.offline}>Offline</Text>
          )}
          {showSlots && (
            <View style={styles.slots}>
              <View style={styles.slotInfo}>
                <View style={[styles.slotIcon, styles.slotIconFilled]} />
                <Text style={styles.slotText}>
                  <Text style={styles.slotNumber}>
                    {hasValue(station.filled_slots)
                      ? String(station.filled_slots)
                      : 0}
                  </Text>
                  {"  "}Filled Slots
                </Text>
              </View>
              <View style={styles.slotInfo}>
                <View style={[styles.slotIcon, styles.slotIconOpen]} />
                <Text style={styles.slotText}>
                  <Text style={styles.slotNumber}>
                    {hasValue(station.open_slots)
                      ? String(station.open_slots)
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
          onPress={() =>
            openDirectionsTo(station.latitude, station.longitude)
          }
        >
          <Text style={styles.directionsText}>Get Directions</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 100,
    elevation: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#000",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 20,
    elevation: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "600", flex: 1 },
  offline: {
    color: "#c7c7c7",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
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
