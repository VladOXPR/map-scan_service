import type {
  BatteryResponse,
  MapboxTokenResponse,
  StationsResponse,
} from "../types";

export interface CuubClientConfig {
  baseUrl?: string;
}

export class CuubClient {
  private baseUrl: string;

  constructor(config: CuubClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "").replace(/\/$/, "");
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  async getMapboxToken(): Promise<string | null> {
    const res = await fetch(this.url("/api/mapbox-token"));
    const data = (await res.json()) as MapboxTokenResponse;
    if ("token" in data && data.token) return data.token;
    return null;
  }

  async getStations(): Promise<StationsResponse> {
    const res = await fetch(this.url("/api/stations"));
    return (await res.json()) as StationsResponse;
  }

  async getBattery(stickerId: string): Promise<BatteryResponse> {
    const res = await fetch(this.url(`/api/battery/${encodeURIComponent(stickerId)}`));
    return (await res.json()) as BatteryResponse;
  }

  async createScanRecord(
    stickerId: string,
    manufactureId: string,
    stickerType: string = "type one"
  ): Promise<BatteryResponse> {
    const res = await fetch(this.url(`/api/battery/${encodeURIComponent(stickerId)}`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        manufacture_id: manufactureId,
        sticker_type: stickerType,
      },
      body: JSON.stringify({}),
    });
    return (await res.json()) as BatteryResponse;
  }

  async patchBatterySizl(
    stickerId: string,
    manufactureId: string
  ): Promise<BatteryResponse> {
    const res = await fetch(this.url(`/api/battery/${encodeURIComponent(stickerId)}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        manufacture_id: manufactureId,
      },
      body: JSON.stringify({ sizl: true }),
    });
    return (await res.json()) as BatteryResponse;
  }
}
