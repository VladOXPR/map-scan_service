import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StationMap } from '@/components/map/StationMap';
import type { CameraFitRequest } from '@/components/map/StationMap';
import { StationBottomSheet } from '@/components/sheets/StationBottomSheet';
import { AccountModal } from '@/components/overlays/AccountModal';
import { LocationDeniedBanner } from '@/components/overlays/LocationDeniedBanner';
import {
  FindChargerBar,
  ProfileButton,
  SupportButton,
} from '@/components/overlays/MapChrome';
import { EmptyState, LoadingState, Text } from '@/components/ui';
import { authErrorMessage, deleteAccount } from '@/features/auth/api';
import { isAuthFailure } from '@/lib/apiClient';
import { useNearbyStations } from '@/features/stations/hooks';
import { useLocationPermission } from '@/features/location/hooks';
import { getSupportPhoneE164 } from '@/lib/config';
import { useAuthStore } from '@/store/authStore';
import { useMapStore } from '@/store/mapStore';
import { distanceMiles, formatDistance } from '@/lib/distance';
import type { Coordinates, Station } from '@/types/station';
import { colors, spacing } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const [accountOpen, setAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  /** Pin highlight — cleared as soon as the sheet starts closing. */
  const [pinSelectedId, setPinSelectedId] = useState<string | null>(null);
  const [cameraFit, setCameraFit] = useState<CameraFitRequest | null>(null);
  const cameraFitToken = useRef(0);
  const {
    data: stations = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useNearbyStations();
  const {
    permission,
    prompted,
    coords,
    requestPermission,
    loadCurrentPosition,
  } = useLocationPermission();

  const selectedStation = useMapStore((s) => s.selectedStation);
  const sheetIndex = useMapStore((s) => s.sheetIndex);
  const selectStation = useMapStore((s) => s.selectStation);
  const clearSelection = useMapStore((s) => s.clearSelection);
  const setSheetIndex = useMapStore((s) => s.setSheetIndex);

  const sheetOpen = sheetIndex >= 0;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Returning sessions that never saw the post-signup system prompt.
      if (!prompted) {
        await requestPermission();
        if (cancelled) return;
      }
      await loadCurrentPosition();
    })();
    return () => {
      cancelled = true;
    };
  }, [prompted, requestPermission, loadCurrentPosition]);

  /**
   * Shared open path for map taps + Nearest.
   * Sheet snap runs first so pin-press feels as instant as the button.
   */
  const openStation = useCallback(
    (
      station: Station,
      options?: { cameraFit?: CameraFitRequest | null },
    ) => {
      // Sheet first — identical path for map MarkerView + Nearest button.
      sheetRef.current?.snapToIndex(0);
      selectStation(station);
      setPinSelectedId(station.id);

      if (options && 'cameraFit' in options) {
        setCameraFit(options.cameraFit ?? null);
      } else {
        setCameraFit((prev) => (prev == null ? prev : null));
      }
    },
    [selectStation],
  );

  const onDeselect = useCallback(() => {
    setCameraFit(null);
    setPinSelectedId(null);
    setSheetIndex(-1);
    clearSelection();
    sheetRef.current?.close();
  }, [clearSelection, setSheetIndex]);

  const onSheetAnimate = useCallback(
    (_fromIndex: number, toIndex: number) => {
      setSheetIndex(toIndex);
      if (toIndex < 0) {
        setCameraFit(null);
        setPinSelectedId(null);
      }
    },
    [setSheetIndex],
  );

  const onSheetChange = useCallback(
    (index: number) => {
      setSheetIndex(index);
      if (index < 0) {
        setCameraFit(null);
        setPinSelectedId(null);
        clearSelection();
      }
    },
    [clearSelection, setSheetIndex],
  );

  const nearestStation = useMemo(() => {
    const candidates = stations.filter(
      (s) => s.locationInactive !== true && s.online !== false,
    );
    if (!candidates.length) return null;
    if (!coords) return candidates[0];
    return [...candidates].sort(
      (a, b) =>
        distanceMiles(coords, a) - distanceMiles(coords, b),
    )[0];
  }, [coords, stations]);

  const nearestDistanceLabel = useMemo(() => {
    if (!nearestStation || !coords) return null;
    const miles = distanceMiles(coords, {
      latitude: nearestStation.latitude,
      longitude: nearestStation.longitude,
    });
    if (miles < 0.1) return formatDistance(miles);
    return `${miles.toFixed(1)} mi`;
  }, [coords, nearestStation]);

  const onFindNearest = () => {
    if (!nearestStation) return;
    cameraFitToken.current += 1;
    const to: Coordinates = {
      latitude: nearestStation.latitude,
      longitude: nearestStation.longitude,
    };
    openStation(nearestStation, {
      cameraFit: {
        token: cameraFitToken.current,
        from: coords,
        to,
      },
    });
  };

  const onSupport = () => {
    const phone = getSupportPhoneE164();
    void Linking.openURL(
      `sms:${phone}&body=${encodeURIComponent(
        'Hi CUUB Support, I need help with a station.',
      )}`,
    );
  };

  const onLogout = async () => {
    setAccountOpen(false);
    await signOut();
    router.replace('/(auth)/phone');
  };

  const onDeleteAccount = async () => {
    const token = session?.token;
    if (!token) {
      await onLogout();
      return;
    }
    setDeletingAccount(true);
    try {
      await deleteAccount(token);
      setAccountOpen(false);
      await signOut();
      router.replace('/(auth)/phone');
    } catch (error) {
      if (isAuthFailure(error)) {
        setAccountOpen(false);
        await signOut();
        router.replace('/(auth)/phone');
        return;
      }
      Alert.alert(
        'Couldn’t delete account',
        authErrorMessage(
          error,
          'Account deletion is temporarily unavailable. Try again later or contact support.',
        ),
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const onPrimaryAction = (station: Station) => {
    const url = `https://maps.apple.com/?daddr=${station.latitude},${station.longitude}`;
    Alert.alert(station.name, 'Open directions to this station?', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Open Maps',
        onPress: () => {
          void Linking.openURL(url);
        },
      },
    ]);
  };

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return (
      <EmptyState
        title="Couldn't load stations"
        description="Check your connection and try again."
        actionLabel={isFetching ? 'Loading…' : 'Retry'}
        onAction={() => {
          void refetch();
        }}
      />
    );
  }

  const showEmptyStations = !isLoading && !isError && stations.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StationMap
        stations={stations}
        userCoords={coords}
        selectedStationId={pinSelectedId}
        onSelectStation={openStation}
        onDeselect={onDeselect}
        cameraFit={cameraFit}
      />

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + spacing[2],
          paddingHorizontal: spacing[5],
          zIndex: 15,
        }}
      >
        <LocationDeniedBanner visible={permission === 'denied'} />
      </View>

      {showEmptyStations ? (
        <View style={styles.emptyBanner} pointerEvents="box-none">
          <View style={styles.emptyCard}>
            <Text variant="subtitle">No stations nearby yet</Text>
            <Text muted variant="caption" style={styles.emptyCopy}>
              Check your connection or try again as the CUUB network expands.
            </Text>
            <Text
              variant="caption"
              color={colors.primary}
              onPress={() => {
                void refetch();
              }}
            >
              {isFetching ? 'Loading…' : 'Retry'}
            </Text>
          </View>
        </View>
      ) : null}

      {!sheetOpen ? (
        <>
          <ProfileButton onPress={() => setAccountOpen(true)} />
          <SupportButton onPress={onSupport} />
          <FindChargerBar
            onPress={onFindNearest}
            distanceLabel={nearestDistanceLabel}
          />
        </>
      ) : null}

      <AccountModal
        visible={accountOpen}
        phone={session?.user.phone ?? ''}
        deleting={deletingAccount}
        onClose={() => setAccountOpen(false)}
        onLogout={() => {
          void onLogout();
        }}
        onDeleteAccount={() => {
          void onDeleteAccount();
        }}
      />

      <StationBottomSheet
        ref={sheetRef}
        station={selectedStation}
        userCoords={coords}
        onClose={clearSelection}
        onChangeIndex={onSheetChange}
        onAnimate={onSheetAnimate}
        onPrimaryAction={onPrimaryAction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  emptyBanner: {
    position: 'absolute',
    left: spacing[5],
    right: spacing[5],
    bottom: 120,
    zIndex: 12,
  },
  emptyCard: {
    backgroundColor: colors.elevated,
    borderRadius: 16,
    padding: spacing[4],
    gap: spacing[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  emptyCopy: {
    lineHeight: 18,
  },
});
