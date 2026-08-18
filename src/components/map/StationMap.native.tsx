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
import { stationsToGeoJSON } from '@/features/stations/stationsToGeoJSON';
import { MAP_BRAND_BLUE, STATION_ICONS } from './stationIcons';
import { StationMarker } from './StationMarker';
import { Text } from '@/components/ui';

/** RN hit-targets only when zoomed in — so cluster taps can expand first. */
const HIT_TARGET_MIN_ZOOM = 14.5;
export type CameraFitRequest = {
  /** Bump to re-run the same fit (e.g. tapping Nearest again). */
  token: number;
  /** Shown on the left (user). */
  from: Coordinates | null;
  /** Shown on the right (station). */
  to: Coordinates;
};

type StationMapProps = {
  stations: Station[];
  userCoords: Coordinates | null;
  selectedStationId?: string | null;
  onSelectStation: (station: Station) => void;
  onDeselect?: () => void;
  cameraTarget?: Coordinates | null;
  cameraZoom?: number;
  /** Fit camera with user left / station right (Nearest CUUB). */
  cameraFit?: CameraFitRequest | null;
};

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
  const insets = useSafeAreaInsets();
  const tokenStatus = getMapboxTokenStatus();
  const [routeLine, setRouteLine] =
    useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
  const [hitTargetsEnabled, setHitTargetsEnabled] = useState(false);

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

    if (!user) {
      cameraRef.current?.setCamera({
        centerCoordinate: [station.longitude, station.latitude],
        zoomLevel: mapTokens.stationZoom,
        heading: 0,
        pitch: mapTokens.defaultPitch,
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
      pitch: mapTokens.defaultPitch,
      padding,
      animationDuration: 650,
      animationMode: 'flyTo',
    });
  }, [cameraFit, insets.top]);

  useEffect(() => {
    if (!cameraTarget || cameraFit) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [cameraTarget.longitude, cameraTarget.latitude],
      zoomLevel: cameraZoom ?? mapTokens.stationZoom,
      animationDuration: 650,
      animationMode: 'flyTo',
    });
  }, [cameraTarget, cameraZoom, cameraFit]);

  /**
   * Home load: frame the puck first, then after 1s fly out so the user +
   * whole station network fit the viewport.
   */
  useEffect(() => {
    if (introPlayedRef.current) return;
    if (!userCoords || !stations.length) return;
    if (cameraFit) return;

    introPlayedRef.current = true;

    cameraRef.current?.setCamera({
      centerCoordinate: [userCoords.longitude, userCoords.latitude],
      zoomLevel: mapTokens.stationZoom,
      pitch: mapTokens.defaultPitch,
      heading: 0,
      animationDuration: 0,
      animationMode: 'moveTo',
    });

    const { width: screenW, height: screenH } = Dimensions.get('window');
    const padding = {
      paddingTop: Math.max(insets.top, 12) + 72,
      paddingBottom: Math.max(Math.round(screenH * 0.22), 120),
      paddingLeft: Math.max(Math.round(screenW * 0.08), 40),
      paddingRight: Math.max(Math.round(screenW * 0.08), 40),
    };

    const timer = setTimeout(() => {
      let minLat = userCoords.latitude;
      let maxLat = userCoords.latitude;
      let minLng = userCoords.longitude;
      let maxLng = userCoords.longitude;
      for (const station of stations) {
        minLat = Math.min(minLat, station.latitude);
        maxLat = Math.max(maxLat, station.latitude);
        minLng = Math.min(minLng, station.longitude);
        maxLng = Math.max(maxLng, station.longitude);
      }
      // Keep fitBounds stable when everything collapses to one point.
      const pad = 0.002;
      if (maxLat - minLat < pad) {
        minLat -= pad / 2;
        maxLat += pad / 2;
      }
      if (maxLng - minLng < pad) {
        minLng -= pad / 2;
        maxLng += pad / 2;
      }

      cameraRef.current?.setCamera({
        bounds: {
          ne: [maxLng, maxLat],
          sw: [minLng, minLat],
        },
        padding,
        pitch: mapTokens.defaultPitch,
        heading: 0,
        animationDuration: 1400,
        animationMode: 'flyTo',
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [userCoords, stations, cameraFit, insets.top]);

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
          pitch: mapTokens.defaultPitch,
          heading: 0,
        }}
      />

      <Images images={STATION_ICONS} />

      {routeLine && routeGradient ? (
        <ShapeSource id="nearest-route" shape={routeGradient}>
          <LineLayer
            id="nearest-route-line"
            belowLayerID="clusters"
            style={{
              lineCap: 'round',
              lineJoin: 'round',
              lineWidth: 9,
              lineColor: ['get', 'color'],
            }}
          />
        </ShapeSource>
      ) : null}

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
            ['!', ['get', 'dimmed']],
          ]}
          style={{
            circleRadius: ['case', ['get', 'selected'], 14, 12],
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
            iconSize: ['case', ['get', 'selected'], 1.2, 1],
            iconOpacity: ['case', ['get', 'dimmed'], 0.5, 1],
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconAnchor: 'center',
          }}
        />
      </ShapeSource>

      {/* RN press targets — same touch path as the Nearest button (not Mapbox hit-test). */}
      {stationHitTargets}

      {userCoords ? (
        <UserLocation visible>
          <CircleLayer
            id="cuubUserLocationPuck"
            style={{
              circleRadius: 7,
              circleColor: '#000000',
              circleStrokeColor: '#FFFFFF',
              circleStrokeWidth: 3,
              circlePitchAlignment: 'map',
            }}
          />
        </UserLocation>
      ) : null}
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
