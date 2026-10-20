import { create } from 'zustand';
import type { Station } from '@/types/station';

type MapState = {
  selectedStation: Station | null;
  sheetIndex: number;
  selectStation: (station: Station | null) => void;
  setSheetIndex: (index: number) => void;
  clearSelection: () => void;
};

export const useMapStore = create<MapState>((set) => ({
  selectedStation: null,
  sheetIndex: -1,
  selectStation: (station) =>
    set({
      selectedStation: station,
      sheetIndex: station ? 0 : -1,
    }),
  setSheetIndex: (sheetIndex) => set({ sheetIndex }),
  clearSelection: () => set({ selectedStation: null, sheetIndex: -1 }),
}));
