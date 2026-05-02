import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import {
  pickNearestStation,
  type Coords,
  type NearestStationView,
  type Station,
} from "@cuub/shared";
import { openDirectionsTo } from "@/lib/directions";
import { useUserLocation } from "./useUserLocation";

export interface NearestStationFeatureProps {
  stations: Station[];
  isStickerPage?: boolean;
  onCameraTarget?: (
    user: Coords,
    station: { latitude: number; longitude: number }
  ) => void;
  bottom?: number;
}

export function NearestStationFeature({
  stations,
  isStickerPage = false,
  onCameraTarget,
  bottom = 20,
}: NearestStationFeatureProps) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [card, setCard] = useState<NearestStationView | null>(null);
  const { coords, status, request } = useUserLocation();

  useEffect(() => {
    const t = setTimeout(
      () => setPromptOpen(true),
      isStickerPage ? 900 : 500
    );
    return () => clearTimeout(t);
  }, [isStickerPage]);

  useEffect(() => {
    if (!coords || stations.length === 0) return;
    const result = pickNearestStation(coords, stations);
    if (result) {
      setCard(result);
      const stationLng = parseFloat(String(result.station.longitude));
      const stationLat = parseFloat(String(result.station.latitude));
      if (Number.isFinite(stationLng) && Number.isFinite(stationLat)) {
        onCameraTarget?.(coords, { latitude: stationLat, longitude: stationLng });
      }
    }
  }, [coords, stations, onCameraTarget]);

  const handleAccept = async () => {
    setPromptOpen(false);
    await request();
  };

  return (
    <>
      <View style={[styles.triggerWrap, { bottom }]} pointerEvents="box-none">
        <Pressable style={styles.trigger} onPress={() => setPromptOpen(true)}>
          <Text style={styles.triggerText}>Find nearest station</Text>
        </Pressable>
      </View>

      <Modal
        visible={promptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPromptOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setPromptOpen(false)}
        >
          <Pressable style={styles.promptModal} onPress={() => {}}>
            <Text style={styles.promptTitle}>CUUB near you?</Text>
            <View style={styles.promptActions}>
              <Pressable
                style={[styles.promptBtn, styles.promptBtnSecondary]}
                onPress={() => setPromptOpen(false)}
              >
                <Text style={styles.promptBtnText}>Not now</Text>
              </Pressable>
              <Pressable
                style={[styles.promptBtn, styles.promptBtnPrimary]}
                onPress={handleAccept}
              >
                <Text style={styles.promptBtnText}>Find</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {card && (
        <View style={[styles.card, isStickerPage && styles.cardSticker]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>NEAREST STATION</Text>
            <Pressable onPress={() => setCard(null)}>
              <Text style={styles.cardClose}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.cardName}>
            {card.station.title || "CUUB Station"}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardDistance}>{card.distanceText}</Text>
            <View style={styles.cardSlots}>
              <View style={styles.slotRow}>
                <View style={[styles.slotDot, styles.slotDotFilled]} />
                <Text style={styles.slotNumber}>
                  {card.station.filled_slots ?? 0}
                </Text>
                <Text style={styles.slotLabel}> Filled</Text>
              </View>
              <View style={styles.slotRow}>
                <View style={[styles.slotDot, styles.slotDotOpen]} />
                <Text style={styles.slotNumber}>
                  {card.station.open_slots ?? 0}
                </Text>
                <Text style={styles.slotLabel}> Open</Text>
              </View>
            </View>
          </View>
          {card.isFar && (
            <Text style={styles.cardNote}>Nearest station is far from you</Text>
          )}
          <Pressable
            style={styles.cardDirections}
            onPress={() =>
              openDirectionsTo(card.station.latitude, card.station.longitude)
            }
          >
            <Text style={styles.cardDirectionsText}>Get Directions</Text>
          </Pressable>
        </View>
      )}

      {(status === "denied" || status === "unavailable") && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>
            Location unavailable — showing all stations.
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  triggerWrap: { position: "absolute", left: 20 } as ViewStyle,
  trigger: {
    backgroundColor: "#000",
    borderRadius: 28,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  triggerText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  promptModal: {
    width: "85%",
    maxWidth: 380,
    backgroundColor: "#000",
    borderRadius: 16,
    padding: 24,
  },
  promptTitle: { color: "#fff", fontSize: 18, fontWeight: "600", marginBottom: 20 },
  promptActions: { flexDirection: "row", gap: 10 },
  promptBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  promptBtnPrimary: { backgroundColor: "#0198FD" },
  promptBtnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  promptBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  card: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    maxWidth: 380,
    alignSelf: "center",
    backgroundColor: "#000",
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  cardSticker: { top: 290 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between" },
  cardLabel: {
    color: "#808080",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1,
  },
  cardClose: { color: "#fff", fontSize: 22, lineHeight: 22 },
  cardName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cardMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  cardDistance: { color: "#0198FD", fontSize: 13, fontWeight: "600" },
  cardSlots: { flexDirection: "row", gap: 14 },
  slotRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  slotDot: { width: 10, height: 10, borderRadius: 5 },
  slotDotFilled: { backgroundColor: "#0198FD" },
  slotDotOpen: { backgroundColor: "#808080" },
  slotNumber: { color: "#fff", fontSize: 13, fontWeight: "600" },
  slotLabel: { color: "#c7c7c7", fontSize: 12 },
  cardNote: { color: "#FFB74D", fontSize: 11 },
  cardDirections: {
    backgroundColor: "#0198FD",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  cardDirectionsText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  toast: {
    position: "absolute",
    bottom: 90,
    alignSelf: "center",
    backgroundColor: "#000",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  toastText: { color: "#fff", fontSize: 13, fontWeight: "500" },
});
