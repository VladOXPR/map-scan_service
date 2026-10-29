import { useQuery } from '@tanstack/react-query';
import { fetchNearbyStations, fetchStationById } from './api';

export const stationKeys = {
  all: ['stations'] as const,
  nearby: () => [...stationKeys.all, 'nearby'] as const,
  detail: (id: string) => [...stationKeys.all, 'detail', id] as const,
};

export function useNearbyStations() {
  return useQuery({
    queryKey: stationKeys.nearby(),
    queryFn: fetchNearbyStations,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useStation(id: string | undefined) {
  return useQuery({
    queryKey: stationKeys.detail(id ?? ''),
    queryFn: () => fetchStationById(id!),
    enabled: Boolean(id),
  });
}
