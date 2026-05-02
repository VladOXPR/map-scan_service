import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import type { BatteryData } from "@cuub/shared";
import { cuubClient } from "@/lib/cuubClient";
import { useDurationTimer } from "./useDurationTimer";

export interface ScanModalProps {
  stickerId: string;
}

export function ScanModal({ stickerId }: ScanModalProps) {
  const [battery, setBattery] = useState<BatteryData | null>(null);
  const [returned, setReturned] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await cuubClient.getBattery(stickerId);
        if (cancelled) return;
        if (result.success && result.data) {
          setBattery(result.data);
          const isReturned =
            result.data.duration &&
            String(result.data.duration).toLowerCase() === "battery returned";
          setReturned(!!isReturned);
          if (result.data.manufacture_id) {
            cuubClient
              .createScanRecord(
                stickerId,
                String(result.data.manufacture_id),
                String(result.data.type ?? "type one")
              )
              .catch((err) =>
                console.error("Error creating scan record:", err)
              );
          }
        } else {
          setBattery(null);
        }
      } catch (err) {
        console.error("Error fetching battery data:", err);
        setBattery(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stickerId]);

  const initialDuration =
    battery && !returned ? String(battery.duration ?? "00:00:00") : null;
  const duration = useDurationTimer(initialDuration, !returned && !!battery);

  if (!loaded) return null;

  const showDurationBlock = !!battery;
  const paid = battery ? `$${battery.amountPaid ?? 0}` : "$4";

  return (
    <View style={styles.modal}>
      <View style={styles.content}>
        {showDurationBlock && (
          <View style={[styles.info, styles.duration]}>
            <Text style={styles.label}>Duration</Text>
            <Text style={styles.value}>
              {returned ? "Battery returned" : duration}
            </Text>
          </View>
        )}
        <View style={[styles.info, styles.paid]}>
          <Text style={styles.label}>Paid</Text>
          <Text style={styles.value}>{paid}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#000",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  } as ViewStyle,
  content: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
  },
  info: { flexDirection: "column", gap: 8 },
  duration: { flex: 1 },
  paid: { alignItems: "flex-end" },
  label: { color: "#808080", fontSize: 14, fontWeight: "500" },
  value: { color: "#fff", fontSize: 24, fontWeight: "600" },
});
