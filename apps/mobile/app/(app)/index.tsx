import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useRouter, type Href } from 'expo-router';
import { StationMap } from '@/components/map/StationMap';
import type { CameraFitRequest } from '@/components/map/StationMap';
import { StationBottomSheet } from '@/components/sheets/StationBottomSheet';
import { AccountModal } from '@/components/overlays/AccountModal';
import { CreateAccountSheet } from '@/components/overlays/CreateAccountSheet';
import { LocationPermissionSheet } from '@/components/overlays/LocationPermissionSheet';
import { MapTopBlur } from '@/components/overlays/MapTopBlur';
import { WelcomeOverlay } from '@/components/overlays/WelcomeOverlay';
import {
  EnableLocationButton,
  FindChargerBar,
  ProfileButton,
  ScanButton,
  SupportButton,
} from '@/components/overlays/MapChrome';
import { ActiveRentalCard, ACTIVE_RENTAL_CARD_SPACE } from '@/components/overlays/ActiveRentalCard';
import { useActiveRental } from '@/features/rentals/hooks';
import { EmptyState, LoadingState, Text } from '@/components/ui';
import {
  authErrorMessage,
  deleteAccount,
  markPhoneDeleted,
} from '@/features/auth/api';
import { membershipPath, profileHref } from '@/features/auth/routes';
import { MembershipSection } from '@/features/billing/MembershipSection';
import { isAuthFailure } from '@/lib/apiClient';
import { useNearbyStations } from '@/features/stations/hooks';
import { useLocationPermission } from '@/features/location/hooks';
import { tracker } from '@/lib/analytics';
import { getSupportPhoneE164 } from '@/lib/config';
import { useAuthStore } from '@/store/authStore';
import { useAccountPromptStore } from '@/store/accountPromptStore';
import { useMapStore } from '@/store/mapStore';
import { useWelcomeStore } from '@/store/welcomeStore';
import { distanceMiles, formatDistance } from '@/lib/distance';
import type { Coordinates, Station } from '@/types/station';
import { colors, spacing } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const sheetRef = useRef<BottomSheet>(null);
  const didAutoPromptRef = useRef(false);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const welcomePending = useWelcomeStore((s) => s.pending);
  const clearWelcome = useWelcomeStore((s) => s.clear);
  const accountPromptHydrated = useAccountPromptStore((s) => s.hydrated);
  const accountPromptDismissed = useAccountPromptStore((s) => s.dismissed);
  const dismissAccountPrompt = useAccountPromptStore((s) => s.dismiss);
  const [accountOpen, setAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [locationRequesting, setLocationRequesting] = useState(false);
  const [accountPromptOpen, setAccountPromptOpen] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [welcomeVariant, setWelcomeVariant] = useState<'new' | 'back'>('new');
  /** Pin highlight — cleared as soon as the sheet starts closing. */
  const [pinSelectedId, setPinSelectedId] = useState<string | null>(null);
  const [cameraFit, setCameraFit] = useState<CameraFitRequest | null>(null);
  const [cameraTarget, setCameraTarget] = useState<Coordinates | null>(null);
  const cameraFitToken = useRef(0);
  const {
    data: stations = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useNearbyStations();
  const { data: activeRental } = useActiveRental();
  const {
    permission,
    coords,
    refreshPermission,
    requestPermission,
    loadCurrentPosition,
  } = useLocationPermission();

  const selectedStation = useMapStore((s) => s.selectedStation);
  const sheetIndex = useMapStore((s) => s.sheetIndex);
  const selectStation = useMapStore((s) => s.selectStation);
  const clearSelection = useMapStore((s) => s.clearSelection);
  const setSheetIndex = useMapStore((s) => s.setSheetIndex);

  const sheetOpen = sheetIndex >= 0;
  const mapLoadTrackedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (isError) {
      tracker.track('map_load_failed');
      mapLoadTrackedRef.current = false;
      return;
    }
    if (mapLoadTrackedRef.current) return;
    mapLoadTrackedRef.current = true;
    tracker.track('map_loaded', { stations: stations.length });
  }, [isLoading, isError, stations.length]);

  useEffect(() => {
    if (locationSheetOpen) tracker.track('location_sheet_shown');
  }, [locationSheetOpen]);

  useEffect(() => {
    if (accountPromptOpen) tracker.track('account_prompt_shown');
  }, [accountPromptOpen]);

  useEffect(() => {
    if (!welcomePending) return;
    setWelcomeVariant(welcomePending);
    setWelcomeVisible(true);
    clearWelcome();
  }, [welcomePending, clearWelcome]);

  const onWelcomeFinished = useCallback(() => {
    setWelcomeVisible(false);
  }, []);

  const openLocationSheet = useCallback(async () => {
    const { status } = await refreshPermission();
    if (status === 'granted') {
      await loadCurrentPosition();
      setLocationSheetOpen(false);
      return;
    }
    setLocationSheetOpen(true);
  }, [loadCurrentPosition, refreshPermission]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { status } = await refreshPermission();
      if (cancelled) return;
      if (status === 'granted') {
        await loadCurrentPosition();
        return;
      }
      // First map visit: in-app sheet only while iOS can still show its dialog.
      // Wait until welcome overlay finishes so it isn't covered.
      if (
        !didAutoPromptRef.current &&
        status === 'undetermined' &&
        !welcomeVisible &&
        !welcomePending
      ) {
        didAutoPromptRef.current = true;
        setLocationSheetOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshPermission, loadCurrentPosition, welcomeVisible, welcomePending]);

  // Optional account prompt after location is settled — never blocks the map.
  useEffect(() => {
    if (!accountPromptHydrated) return;
    if (session) return;
    if (accountPromptDismissed) return;
    if (welcomeVisible || welcomePending) return;
    if (locationSheetOpen || locationRequesting) return;
    // Let the required location Continue sheet go first on a fresh install.
    if (permission === 'undetermined') return;
    setAccountPromptOpen(true);
  }, [
    accountPromptHydrated,
    accountPromptDismissed,
    session,
    welcomeVisible,
    welcomePending,
    locationSheetOpen,
    locationRequesting,
    permission,
  ]);

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

  /**
   * Shared open path for map taps + Nearest.
   * Sheet snap runs first so pin-press feels as instant as the button.
   */
  const openStation = useCallback(
    (
      station: Station,
      options?: { cameraFit?: CameraFitRequest | null },
    ) => {
      tracker.track(
        station.locationInactive ? 'inactive_station_viewed' : 'station_sheet_opened',
        {
          entry: options && 'cameraFit' in options ? 'nearest' : 'pin',
          batteriesAvailable: station.batteriesAvailable,
          online: station.online ?? null,
        },
        { locationId: station.locationId },
      );
      // Sheet first — identical path for map MarkerView + Nearest button.
      sheetRef.current?.snapToIndex(0);
      selectStation(station);
      setPinSelectedId(station.id);
      // Don't let a prior locate-button recenter re-fire when the sheet closes.
      setCameraTarget(null);

      if (options && 'cameraFit' in options) {
        setCameraFit(options.cameraFit ?? null);
        return;
      }

      cameraFitToken.current += 1;

      // Same framing as the Nearest location button.
      if (nearestStation && station.id === nearestStation.id) {
        setCameraFit({
          token: cameraFitToken.current,
          from: coords,
          to: {
            latitude: station.latitude,
            longitude: station.longitude,
          },
        });
        return;
      }

      // Other pins: pan only — keep zoom, center above the sheet.
      setCameraFit({
        token: cameraFitToken.current,
        from: null,
        to: {
          latitude: station.latitude,
          longitude: station.longitude,
        },
        preserveZoom: true,
      });
    },
    [coords, nearestStation, selectStation],
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
        if (useMapStore.getState().selectedStation) tracker.track('station_sheet_closed');
        setCameraFit(null);
        setPinSelectedId(null);
        clearSelection();
      }
    },
    [clearSelection, setSheetIndex],
  );

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
    if (!nearestStation) {
      tracker.track('find_nearest_blocked', { reason: stations.length ? 'none_online' : 'no_stations' });
      return;
    }
    tracker.track('find_nearest_tapped', { locationShared: permission === 'granted' });
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

  const onLocatePress = () => {
    tracker.track('locate_me_tapped', { locationShared: permission === 'granted' });
    if (permission !== 'granted') {
      void openLocationSheet();
      return;
    }
    void (async () => {
      const next = await loadCurrentPosition();
      if (!next) return;
      setCameraFit(null);
      setCameraTarget({
        latitude: next.latitude,
        longitude: next.longitude,
      });
    })();
  };

  const onContinueLocation = async () => {
    tracker.track('location_permission_continue');
    setLocationRequesting(true);
    try {
      await requestPermission();
      setLocationSheetOpen(false);
    } finally {
      setLocationRequesting(false);
    }
  };

  const onSupport = () => {
    tracker.track('support_sms_tapped', { entry: 'map' });
    const phone = getSupportPhoneE164();
    void Linking.openURL(
      `sms:${phone}&body=${encodeURIComponent(
        'Hi CUUB Support, I need help with a station.',
      )}`,
    );
  };

  const onLogin = () => {
    setAccountOpen(false);
    router.push({ pathname: '/(auth)/phone', params: { entry: 'account' } });
  };

  const onAccountPromptCreate = () => {
    tracker.track('account_prompt_create');
    setAccountPromptOpen(false);
    void dismissAccountPrompt();
    router.push({ pathname: '/(auth)/phone', params: { entry: 'account_prompt' } });
  };

  const onAccountPromptNotNow = () => {
    tracker.track('account_prompt_dismissed');
    setAccountPromptOpen(false);
    void dismissAccountPrompt();
  };

  const onOpenAccount = () => {
    tracker.track('account_opened', { signedIn: Boolean(session) });
    setAccountOpen(true);
  };

  const onLogout = async () => {
    setAccountOpen(false);
    await signOut();
  };

  const onDeleteAccount = async () => {
    const token = session?.token;
    const phone = session?.user.phone;
    if (!token) {
      await onLogout();
      return;
    }
    setDeletingAccount(true);
    try {
      await deleteAccount(token);
      tracker.track('account_deleted');
      if (phone) {
        await markPhoneDeleted(phone);
      }
      setAccountOpen(false);
      await signOut({ accountDeleted: true });
    } catch (error) {
      if (isAuthFailure(error)) {
        if (phone) {
          await markPhoneDeleted(phone);
        }
        setAccountOpen(false);
        await signOut({ accountDeleted: true });
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
    const where = { locationId: station.locationId };
    tracker.track('directions_tapped', {}, where);
    Alert.alert(station.name, 'Open directions to this station?', [
      {
        text: 'Not now',
        style: 'cancel',
        onPress: () => tracker.track('directions_cancelled', {}, where),
      },
      {
        text: 'Open Maps',
        onPress: () => {
          tracker.track('directions_confirmed', {}, where);
          tracker.markConverted();
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
          tracker.track('map_retry_tapped');
          void refetch();
        }}
      />
    );
  }

  const showEmptyStations = !isLoading && !isError && stations.length === 0;
  const locationShared = permission === 'granted';
  const rentalCard = session && activeRental ? activeRental : null;
  const controlsRaise = rentalCard ? ACTIVE_RENTAL_CARD_SPACE : 0;
  // Don't run the map intro under the welcome overlay — play it after.
  const introEnabled = !welcomeVisible && welcomePending == null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StationMap
        stations={stations}
        userCoords={coords}
        showUserLocation={permission === 'granted'}
        introEnabled={introEnabled}
        selectedStationId={pinSelectedId}
        onSelectStation={openStation}
        onDeselect={onDeselect}
        cameraFit={cameraFit}
        cameraTarget={cameraTarget}
      />

      <MapTopBlur />

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
          <ProfileButton onPress={onOpenAccount} />
          {rentalCard ? <ActiveRentalCard rental={rentalCard} /> : null}
          <ScanButton
            raise={controlsRaise}
            onPress={() => router.push({ pathname: '/scan', params: { entry: 'map' } })}
          />
          <EnableLocationButton
            locationShared={locationShared}
            onPress={onLocatePress}
            raise={controlsRaise}
          />
          <SupportButton onPress={onSupport} />
          <FindChargerBar
            onPress={onFindNearest}
            distanceLabel={nearestDistanceLabel}
          />
        </>
      ) : null}

      <WelcomeOverlay
        visible={welcomeVisible}
        variant={welcomeVariant}
        onFinished={onWelcomeFinished}
      />

      <LocationPermissionSheet
        visible={locationSheetOpen}
        loading={locationRequesting}
        onContinue={() => {
          void onContinueLocation();
        }}
      />

      <CreateAccountSheet
        visible={accountPromptOpen}
        onCreateAccount={onAccountPromptCreate}
        onNotNow={onAccountPromptNotNow}
      />

      <AccountModal
        visible={accountOpen}
        signedIn={Boolean(session)}
        phone={session?.user.phone ?? ''}
        name={
          session?.user.firstName
            ? `${session.user.firstName} ${session.user.lastName ?? ''}`.trim()
            : null
        }
        profileComplete={session?.user.profileComplete ?? true}
        onCompleteProfile={() => {
          setAccountOpen(false);
          router.push(profileHref({ trigger: 'account' }));
        }}
        membership={
          <MembershipSection
            onBecomeMember={() => {
              setAccountOpen(false);
              router.push(
                (session?.user.profileComplete
                  ? membershipPath({ trigger: 'account' })
                  : profileHref({ trigger: 'account', next: membershipPath({ trigger: 'account' }) })) as Href,
              );
            }}
          />
        }
        deleting={deletingAccount}
        onClose={() => setAccountOpen(false)}
        onLogin={onLogin}
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
