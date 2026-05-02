import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { MapScreen } from "@/features/map-view/MapScreen";
import { ScanModal } from "@/features/scan/ScanModal";

const RESERVED = new Set(["map", "blank", "api", "_next"]);

export default function StickerRoute() {
  const { sticker_id } = useLocalSearchParams<{ sticker_id: string }>();
  const stickerId = typeof sticker_id === "string" ? sticker_id : null;

  if (!stickerId || RESERVED.has(stickerId) || stickerId.includes(".")) {
    return <MapScreen variant="full" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <MapScreen variant="full" stickerId={stickerId} />
      <ScanModal stickerId={stickerId} />
    </View>
  );
}
