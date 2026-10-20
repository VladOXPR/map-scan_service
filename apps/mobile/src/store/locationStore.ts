import { create } from 'zustand';
import { getItem, setItem } from '@/lib/storage';
import type { Coordinates } from '@/types/station';

const LOCATION_PROMPTED_KEY = 'cuub.location.prompted';

type PermissionStatus = 'undetermined' | 'granted' | 'denied';

type LocationState = {
  permission: PermissionStatus;
  prompted: boolean;
  coords: Coordinates | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPermission: (permission: PermissionStatus) => void;
  setPrompted: (prompted: boolean) => Promise<void>;
  setCoords: (coords: Coordinates | null) => void;
};

export const useLocationStore = create<LocationState>((set) => ({
  permission: 'undetermined',
  prompted: false,
  coords: null,
  hydrated: false,
  hydrate: async () => {
    const prompted = (await getItem(LOCATION_PROMPTED_KEY)) === '1';
    set({ prompted, hydrated: true });
  },
  setPermission: (permission) => set({ permission }),
  setPrompted: async (prompted) => {
    await setItem(LOCATION_PROMPTED_KEY, prompted ? '1' : '0');
    set({ prompted });
  },
  setCoords: (coords) => set({ coords }),
}));
