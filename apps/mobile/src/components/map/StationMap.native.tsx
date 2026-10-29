import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import {
  Camera,
  CircleLayer,
  Images,
  LineLayer,
  MapView,
  MarkerView,
  ShapeSource,
  SymbolLayer,
  UserLocation,
  type MapState,
} from '@rnmapbox/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Station, Coordinates } from '@/types/station';
import { configureMapbox, getMapboxTokenStatus } from '@/lib/mapbox';
import { fetchWalkingRoute } from '@/features/map/fetchWalkingRoute';
import { lineStringToGradientSegments } from '@/features/map/routeGradient';
import { map as mapTokens, colors } from '@/theme';
import { stationsToGeoJSON } from '@cuub/core';
import { MAP_BRAND_BLUE, STATION_ICONS } from './stationIcons';
import { StationMarker } from './StationMarker';
import { Text } from '@/components/ui';

/** Single source for map tilt — always `mapTokens.tilt` (53°). */
const tilt = mapTokens.tilt;

/** RN hit-targets only when zoomed in — so cluster taps can expand first. */
const HIT_TARGET_MIN_ZOOM = 14.5;
export type CameraFitRequest = {
  /** Bump to re-run the same fit (e.g. tapping Nearest again). */
  token: number;
  /** Shown on the left (user). */
  from: Coordinates | null;
  /** Shown on the right (station). */
  to: Coordinates;
  /**
   * Pan only — keep current zoom/heading/pitch.
   * Used when tapping a non-nearest station pin.
   */
  preserveZoom?: boolean;
};

type StationMapProps = {
  stations: Station[];
  userCoords: Coordinates | null;
  /** Show the Mapbox puck once iOS location is granted (even before coords resolve). */
  showUserLocation?: boolean;
  /**
   * When false (e.g. welcome overlay), hold the home intro.
   * Flipping to true starts the user → network zoom.
   */
  introEnabled?: boolean;
  selectedStationId?: string | null;
  onSelectStation: (station: Station) => void;
  onDeselect?: () => void;
  cameraTarget?: Coordinates | null;
  cameraZoom?: number;
  /** Fit camera with user left / station right (Nearest CUUB). */
  cameraFit?: CameraFitRequest | null;
};

const PUCK_FILL = '#1F69E1';
const PITCH_MAP = { circlePitchAlignment: 'map' as const };
const PULSE_BEAT_MS = 1800;
const PULSE_CORE = 11;
const PULSE_SPREAD = 22;
const NO_TRANS = { duration: 0, delay: 0 };

function MapAlignedUserPuck({
  coordinate,
}: {
  coordinate: [number, number];
}) {
  const [pulse, setPulse] = useState({ beat: 0, t: 0 });

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - started;
      setPulse({
        beat: Math.floor(elapsed / PULSE_BEAT_MS),
        t: (elapsed % PULSE_BEAT_MS) / PULSE_BEAT_MS,
      });
    }, 50);
    return () => clearInterval(id);
  }, []);

  const pulseStyle = (layerBeat: 0 | 1) => {
    const active = pulse.beat % 2 === layerBeat;
    if (!active) {
      return {
        ...PITCH_MAP,
        circleRadius: PULSE_CORE + PULSE_SPREAD,
        circleColor: PUCK_FILL,
        circleOpacity: 0,
        circleRadiusTransition: NO_TRANS,
        circleOpacityTransition: NO_TRANS,
      };
    }

    const t = pulse.t;
    const snap = t < 0.06;
    return {
      ...PITCH_MAP,
      circleRadius: PULSE_CORE + t * PULSE_SPREAD,
      circleColor: PUCK_FILL,
      circleOpacity: 0.42 * (1 - t),
      circleRadiusTransition: snap ? NO_TRANS : { duration: 80, delay: 0 },
      circleOpacityTransition: snap ? NO_TRANS : { duration: 80, delay: 0 },
    };
  };

  const lng = coordinate[0];
  const lat = coordinate[1];
  const shape = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [lng, lat] },
        },
      ],
    };
  }, [lng, lat]);

  if (shape.features.length === 0) return null;

  // Insert under stations via belowLayerID — avoids aboveLayerID races when
  // the route mounts/unmounts.
  return (
    <ShapeSource id="cuub-user-puck" shape={shape}>
      <CircleLayer
        id="cuubPuckPulseA"
        belowLayerID="clusters"
        style={pulseStyle(0)}
      />
      <CircleLayer
        id="cuubPuckPulseB"
        aboveLayerID="cuubPuckPulseA"
        style={pulseStyle(1)}
      />
      <CircleLayer
        id="cuubPuckCore"
        aboveLayerID="cuubPuckPulseB"
        style={{
          ...PITCH_MAP,
          circleRadius: 11,
          circleColor: '#000000',
          circleStrokeColor: '#FFFFFF',
          circleStrokeWidth: 3,
        }}
      />
    </ShapeSource>
  );
}

function boundsForUserAndNetwork(
  userCoords: Coordinates | null,
  stations: Station[],
): { ne: [number, number]; sw: [number, number] } | null {
  if (!userCoords && !stations.length) return null;

  let minLat = userCoords?.latitude ?? stations[0]!.latitude;
  let maxLat = minLat;
  let minLng = userCoords?.longitude ?? stations[0]!.longitude;
  let maxLng = minLng;

  if (userCoords) {
    minLat = maxLat = userCoords.latitude;
    minLng = maxLng = userCoords.longitude;
  }

  for (const station of stations) {
    minLat = Math.min(minLat, station.latitude);
    maxLat = Math.max(maxLat, station.latitude);
    minLng = Math.min(minLng, station.longitude);
    maxLng = Math.max(maxLng, station.longitude);
  }

  const pad = 0.002;
  if (maxLat - minLat < pad) {
    minLat -= pad / 2;
    maxLat += pad / 2;
  }
  if (maxLng - minLng < pad) {
    minLng -= pad / 2;
    maxLng += pad / 2;
  }

  return {
    ne: [maxLng, maxLat],
    sw: [minLng, minLat],
  };
}

function networkOverviewPadding(insetTop: number) {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  return {
    paddingTop: Math.max(insetTop, 12) + 72,
    paddingBottom: Math.max(Math.round(screenH * 0.22), 120),
    paddingLeft: Math.max(Math.round(screenW * 0.08), 40),
    paddingRight: Math.max(Math.round(screenW * 0.08), 40),
  };
}

const FALLBACK_CENTER: Coordinates = {
  latitude: mapTokens.defaultCenter.latitude,
  longitude: mapTokens.defaultCenter.longitude,
};

const EARTH_RADIUS_M = 6371000;
/** Avoid over-zooming when user and station are nearly on top of each other. */
const MIN_FIT_DISTANCE_M = 80;

const TOKEN_MESSAGES = {
  missing:
    'Add EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to your .env file, then restart with npx expo start -c.',
  placeholder:
    'Your .env still has the placeholder token (pk.your_mapbox...). Replace it with your real Mapbox public token, save the file, then restart Metro.',
  invalid:
    'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN looks invalid. It should start with pk. and be a full Mapbox public token.',
} as const;

function toRad(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians: number) {
  return (radians * 180) / Math.PI;
}

/** Compass bearing from `from` → `to`, degrees clockwise from north. */
function bearingDegrees(from: Coordinates, to: Coordinates): number {
  const φ1 = toRad(from.latitude);
  const φ2 = toRad(to.latitude);
  const Δλ = toRad(to.longitude - from.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function distanceMeters(from: Coordinates, to: Coordinates): number {
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Zoom so `distanceMeters` spans a centered slice of the horizontal content width. */
function zoomForHorizontalSpan(
  spanMeters: number,
  latitude: number,
  availableWidthPx: number,
): number {
  // ~42% of width → breathing room vs edge-to-edge framing.
  const usableWidth = Math.max(availableWidthPx * 0.42, 120);
  const metersPerPixel = Math.max(spanMeters, MIN_FIT_DISTANCE_M) / usableWidth;
  const zoom = Math.log2(
    (156543.03392 * Math.cos(toRad(latitude))) / metersPerPixel,
  );
  return Math.max(3, Math.min(17, zoom));
}

export function StationMap({
  stations,
  userCoords,
  showUserLocation = false,
  introEnabled = true,
  selectedStationId,
  onSelectStation,
  onDeselect,
  cameraTarget,
  cameraZoom,
  cameraFit,
}: StationMapProps) {
  const cameraRef = useRef<Camera>(null);
  const shapeRef = useRef<ShapeSource>(null);
  const handledPressRef = useRef(false);
  const hitTargetsEnabledRef = useRef(false);
  /** One-shot home intro: user-centered → network overview. */
  const introPlayedRef = useRef(false);
  /** True after the initial center-on-user frame (zoom-out may still be pending). */
  const introCenteredRef = useRef(false);
  /** Live camera — used so locate/pan stops don't let Mapbox invent zoom/heading/pitch. */
  const liveCameraRef = useRef<{ zoom: number; heading: number }>({
    zoom: mapTokens.defaultZoom,
    heading: 0,
  });
  const insets = useSafeAreaInsets();
  const tokenStatus = getMapboxTokenStatus();
  const [routeLine, setRouteLine] =
    useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
  const [hitTargetsEnabled, setHitTargetsEnabled] = useState(false);
  const [livePuck, setLivePuck] = useState<[number, number] | null>(null);

  const routeGradient = useMemo(
    () => (routeLine ? lineStringToGradientSegments(routeLine) : null),
    [routeLine],
  );

  const geojson = useMemo(
    () => stationsToGeoJSON(stations, selectedStationId ?? null),
    [stations, selectedStationId],
  );

  useEffect(() => {
    configureMapbox();
  }, []);

  useEffect(() => {
    if (!selectedStationId) return;
    introPlayedRef.current = true;
    introCenteredRef.current = true;
  }, [selectedStationId]);

  useEffect(() => {
    if (!cameraFit?.from) {
      setRouteLine(null);
      return;
    }

    let cancelled = false;
    const from = cameraFit.from;
    const to = cameraFit.to;

    void (async () => {
      const feature = await fetchWalkingRoute(from, to);
      if (cancelled) return;
      setRouteLine(feature);
    })();

    return () => {
      cancelled = true;
    };
  }, [cameraFit]);

  useEffect(() => {
    if (!cameraFit) return;

    introPlayedRef.current = true;
    introCenteredRef.current = true;

    const station = cameraFit.to;
    const user = cameraFit.from;
    const { width: screenW, height: screenH } = Dimensions.get('window');
    // Keep pins in the map area above the ~48% station sheet.
    const paddingTop = Math.max(insets.top, 12) + 56;
    const paddingBottom = Math.round(screenH * 0.52);
    const paddingX = 72;
    const padding = {
      paddingTop,
      paddingBottom,
      paddingLeft: paddingX,
      paddingRight: paddingX,
    };

    // Pin tap (non-nearest): pan only so the station sits above the sheet.
    if (cameraFit.preserveZoom || !user) {
      if (cameraFit.preserveZoom) {
        const { zoom, heading } = liveCameraRef.current;
        cameraRef.current?.setCamera({
          centerCoordinate: [station.longitude, station.latitude],
          zoomLevel: zoom,
          heading,
          pitch: tilt,
          padding,
          animationDuration: 650,
          animationMode: 'easeTo',
        });
        return;
      }

      cameraRef.current?.setCamera({
        centerCoordinate: [station.longitude, station.latitude],
        zoomLevel: mapTokens.stationZoom,
        heading: 0,
        pitch: tilt,
        padding,
        animationDuration: 650,
        animationMode: 'flyTo',
      });
      return;
    }

    // Rotate so user→station points screen-right → user left, station right.
    const heading = (bearingDegrees(user, station) - 90 + 360) % 360;
    const mid = {
      latitude: (user.latitude + station.latitude) / 2,
      longitude: (user.longitude + station.longitude) / 2,
    };
    const zoom = zoomForHorizontalSpan(
      distanceMeters(user, station),
      mid.latitude,
      screenW - paddingX * 2,
    );

    cameraRef.current?.setCamera({
      centerCoordinate: [mid.longitude, mid.latitude],
      zoomLevel: zoom,
      heading,
      pitch: tilt,
      padding,
      animationDuration: 650,
      animationMode: 'flyTo',
    });
  }, [cameraFit, insets.top]);

  useEffect(() => {
    if (!cameraTarget) return;
    // Locate: pan to puck only — keep zoom/heading, always `tilt`.
    const { zoom, heading } = liveCameraRef.current;
    cameraRef.current?.setCamera({
      centerCoordinate: [cameraTarget.longitude, cameraTarget.latitude],
      zoomLevel: cameraZoom ?? zoom,
      heading,
      pitch: tilt,
      padding: {
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
      },
      animationDuration: 650,
      animationMode: 'easeTo',
    });
  }, [cameraTarget, cameraZoom]);

  // Hold/reset intro while welcome (or similar) covers the map.
  useEffect(() => {
    if (!introEnabled) {
      introPlayedRef.current = false;
      introCenteredRef.current = false;
    }
  }, [introEnabled]);

  /**
   * Home load: frame the puck first, then after 1s fly out so the user +
   * whole station network fit the viewport.
   * Waits for `introEnabled` so login welcome doesn't hide the animation.
   * Zoom-out is only marked complete when it fires — so a stations refetch
   * mid-timer can reschedule instead of skipping the fly-out forever.
   */
  useEffect(() => {
    if (!introEnabled) return;
    if (introPlayedRef.current) return;
    if (!userCoords || !stations.length) return;
    if (cameraFit) return;

    const padding = networkOverviewPadding(insets.top);

    if (!introCenteredRef.current) {
      introCenteredRef.current = true;
      cameraRef.current?.setCamera({
        centerCoordinate: [userCoords.longitude, userCoords.latitude],
        zoomLevel: mapTokens.stationZoom,
        pitch: tilt,
        heading: 0,
        animationDuration: 0,
        animationMode: 'moveTo',
      });
    }

    const timer = setTimeout(() => {
      const bounds = boundsForUserAndNetwork(userCoords, stations);
      if (!bounds) return;

      introPlayedRef.current = true;
      cameraRef.current?.setCamera({
        bounds,
        padding,
        pitch: tilt,
        heading: 0,
        animationDuration: 1400,
        animationMode: 'flyTo',
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [introEnabled, userCoords, stations, cameraFit, insets.top]);

  const defaultCenter = useMemo(() => {
    const c = userCoords ?? FALLBACK_CENTER;
    return [c.longitude, c.latitude] as [number, number];
  }, [userCoords]);

  const onSelectStationRef = useRef(onSelectStation);
  onSelectStationRef.current = onSelectStation;

  const stationsByIdRef = useRef<Map<string, Station>>(new Map());
  const stationsById = useMemo(() => {
    const map = new Map<string, Station>();
    for (const station of stations) {
      map.set(String(station.id), station);
    }
    return map;
  }, [stations]);
  stationsByIdRef.current = stationsById;

  const markHandled = useCallback(() => {
    handledPressRef.current = true;
    // Mapbox may still deliver MapView onPress after a marker tap.
    setTimeout(() => {
      handledPressRef.current = false;
    }, 120);
  }, []);

  const expandCluster = useCallback(async (feature: GeoJSON.Feature) => {
    try {
      const zoom = await shapeRef.current?.getClusterExpansionZoom(feature);
      const geometry = feature.geometry;
      const coords =
        geometry && 'coordinates' in geometry ? geometry.coordinates : null;
      if (
        Array.isArray(coords) &&
        typeof coords[0] === 'number' &&
        typeof coords[1] === 'number' &&
        zoom != null
      ) {
        cameraRef.current?.setCamera({
          centerCoordinate: [coords[0], coords[1]],
          zoomLevel: zoom,
          pitch: tilt,
          animationDuration: 400,
          animationMode: 'easeTo',
        });
      }
    } catch {
      // Ignore expansion errors; map stays put.
    }
  }, []);

  const onShapePress = useCallback(
    (event: { features: GeoJSON.Feature[] }) => {
      const feature = event.features?.[0];
      const props = feature?.properties;
      if (!props) return;

      // Cluster → always expand (MarkerViews are off / out of the way at this zoom).
      if (props.cluster && props.cluster_id != null) {
        markHandled();
        void expandCluster(feature);
        return;
      }

      // Unclustered via Mapbox only when RN hit-targets are disabled (zoomed out).
      if (hitTargetsEnabledRef.current) return;

      const station = stationsByIdRef.current.get(String(props.id));
      if (station) {
        markHandled();
        onSelectStationRef.current(station);
      }
    },
    [expandCluster, markHandled],
  );

  const onStationPress = useCallback(
    (station: Station) => {
      markHandled();
      onSelectStationRef.current(station);
    },
    [markHandled],
  );

  const onMapPress = useCallback(() => {
    if (handledPressRef.current) return;
    onDeselect?.();
  }, [onDeselect]);

  const onCameraChanged = useCallback((state: MapState) => {
    liveCameraRef.current = {
      zoom: state.properties.zoom,
      heading: state.properties.heading,
    };
    const enabled = state.properties.zoom >= HIT_TARGET_MIN_ZOOM;
    if (enabled === hitTargetsEnabledRef.current) return;
    hitTargetsEnabledRef.current = enabled;
    setHitTargetsEnabled(enabled);
  }, []);

  const stationHitTargets = useMemo(() => {
    if (!hitTargetsEnabled) return null;
    return stations.map((station) => (
      <MarkerView
        key={station.id}
        coordinate={[station.longitude, station.latitude]}
        anchor={{ x: 0.5, y: 0.5 }}
        allowOverlap
        allowOverlapWithPuck
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={station.name}
          // onPress (not onPressIn): ignores drags that start on a pin.
          onPress={() => onStationPress(station)}
          hitSlop={4}
          style={styles.stationHit}
        />
      </MarkerView>
    ));
  }, [hitTargetsEnabled, onStationPress, stations]);

  if (!tokenStatus.ok) {
    return (
      <View style={[styles.fill, styles.fallback]}>
        <Text variant="title" center>
          Mapbox token required
        </Text>
        <Text muted center style={{ marginTop: 8, paddingHorizontal: 24 }}>
          {TOKEN_MESSAGES[tokenStatus.reason]}
        </Text>
        <View style={styles.pinPreview}>
          {stations.slice(0, 3).map((station) => (
            <StationMarker
              key={station.id}
              available={station.batteriesAvailable}
              selected={station.id === selectedStationId}
              onPress={() => onSelectStation(station)}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <MapView
      style={styles.fill}
      styleURL={mapTokens.styleURL}
      logoEnabled
      attributionEnabled
      compassEnabled={false}
      scaleBarEnabled={false}
      pitchEnabled={false}
      onPress={onMapPress}
      onCameraChanged={onCameraChanged}
    >
      <Camera
        ref={cameraRef}
        defaultSettings={{
          centerCoordinate: defaultCenter,
          // Start close on the puck; intro effect flies out to the network.
          zoomLevel: userCoords
            ? mapTokens.stationZoom
            : mapTokens.defaultZoom,
          pitch: tilt,
          heading: 0,
        }}
      />

      <Images images={STATION_ICONS} />

      {showUserLocation ? (
        <UserLocation
          visible={false}
          animated
          onUpdate={(location) => {
            setLivePuck([
              location.coords.longitude,
              location.coords.latitude,
            ]);
          }}
        />
      ) : null}

      {/*
        Stations first (stable anchor). Then puck below clusters. Then route
        below puck. Final stack: path → puck → stations/clusters.
        Nearest pin uses the same unclustered-point layer as every other pin.
      */}
      <ShapeSource
        ref={shapeRef}
        id="stations"
        shape={geojson}
        cluster
        clusterRadius={25}
        clusterMaxZoomLevel={22}
        onPress={onShapePress}
        hitbox={{ width: 44, height: 44 }}
      >
        <CircleLayer
          id="clusters"
          filter={['has', 'point_count']}
          style={{
            circleColor: MAP_BRAND_BLUE,
            circleRadius: [
              'step',
              ['get', 'point_count'],
              15,
              3,
              20,
              5,
              25,
            ],
            circleStrokeWidth: 3,
            circleStrokeColor: '#ffffff',
            circleStrokeOpacity: 1,
          }}
        />
        <SymbolLayer
          id="cluster-count"
          filter={['has', 'point_count']}
          style={{
            textField: ['to-string', ['get', 'point_count']],
            textSize: ['step', ['get', 'point_count'], 14, 10, 16, 30, 18],
            textColor: '#ffffff',
            textHaloColor: '#ffffff',
            textHaloWidth: 1,
            textAllowOverlap: true,
            textIgnorePlacement: true,
          }}
        />
        <CircleLayer
          id="unclustered-circle"
          filter={[
            'all',
            ['!', ['has', 'point_count']],
            ['==', ['get', 'dimmed'], 0],
          ]}
          style={{
            circleRadius: ['case', ['==', ['get', 'selected'], 1], 14, 12],
            circleColor: '#ffffff',
            circleOpacity: 1,
            circleStrokeWidth: 2,
            circleStrokeColor: MAP_BRAND_BLUE,
            circleStrokeOpacity: 1,
          }}
        />
        <SymbolLayer
          id="unclustered-point"
          filter={['!', ['has', 'point_count']]}
          style={{
            iconImage: [
              'match',
              [
                'min',
                6,
                ['to-number', ['coalesce', ['get', 'filled_slots'], 6]],
              ],
              0,
              'station-icon-0',
              1,
              'station-icon-1',
              2,
              'station-icon-2',
              3,
              'station-icon-3',
              4,
              'station-icon-4',
              5,
              'station-icon-5',
              6,
              'station-icon-6',
              'station-icon-6',
            ],
            iconSize: ['case', ['==', ['get', 'selected'], 1], 1.2, 1],
            iconOpacity: ['case', ['==', ['get', 'dimmed'], 1], 0.5, 1],
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconAnchor: 'center',
          }}
        />
      </ShapeSource>

      {showUserLocation && (livePuck || userCoords) ? (
        <MapAlignedUserPuck
          coordinate={
            livePuck ?? [userCoords!.longitude, userCoords!.latitude]
          }
        />
      ) : null}

      {routeLine && routeGradient ? (
        <ShapeSource id="nearest-route" shape={routeGradient}>
          <LineLayer
            id="nearest-route-line"
            belowLayerID={
              showUserLocation && (livePuck || userCoords)
                ? 'cuubPuckPulseA'
                : 'clusters'
            }
            style={{
              lineCap: 'round',
              lineJoin: 'round',
              lineWidth: 9,
              lineColor: ['get', 'color'],
            }}
          />
        </ShapeSource>
      ) : null}

      {/* RN press targets — same touch path as the Nearest button (not Mapbox hit-test). */}
      {stationHitTargets}
    </MapView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fallback: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinPreview: {
    marginTop: 28,
    flexDirection: 'row',
    gap: 20,
  },
  stationHit: {
    width: 48,
    height: 48,
  },
});
