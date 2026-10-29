import {
  MAX_EVENTS_PER_BATCH,
  isAnalyticsEventName,
  type AnalyticsEventName,
  type AnalyticsPlatform,
  type DeeplinkSource,
  type EventProperties,
  type MembershipStatus,
  type PermissionKind,
  type PermissionResult,
  type PropertiesFor,
  type PropertyValue,
  type SessionEndReason,
  type SessionSource,
} from "./events";
import { routeTemplate, sanitizeProperties, screenName } from "./properties";

export interface TrackerStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** The subset of posthog-react-native / posthog-js the tracker drives. */
export interface PostHogAdapter {
  capture(event: string, properties?: Record<string, unknown>): unknown;
  identify(distinctId: string, properties?: Record<string, unknown>): unknown;
  reset(): unknown;
  register?(properties: Record<string, unknown>): unknown;
  screen?(name: string, properties?: Record<string, unknown>): unknown;
  flush?(): unknown;
}

/** Read on every event; whatever is unknown is left out. */
export interface TrackerContext {
  appVersion?: string | null;
  build?: string | null;
  os?: string | null;
  osVersion?: string | null;
  locale?: string | null;
  timezone?: string | null;
  network?: string | null;
  membership?: MembershipStatus | null;
  /** Precision 6 at most, and only while location permission is granted. */
  geohash?: string | null;
  hasLocationPermission?: boolean | null;
}

/** PostHog person properties. Name, phone and date of birth are never sent. */
export interface PersonTraits {
  signupDate?: string | null;
  membership?: MembershipStatus | null;
  ageBracket?: string | null;
}

export type IngestKind = "device" | "session" | "events" | "identify";

export interface TrackerConfig {
  platform: AnalyticsPlatform;
  /** URL per ingest call. The web points these at its same-origin proxy so sendBeacon works. */
  endpoint: (kind: IngestKind) => string;
  /** Queue and session state. */
  storage: TrackerStorage;
  /** Install id. On iOS the Keychain usually survives a reinstall. Defaults to `storage`. */
  idStorage?: TrackerStorage;
  /** Current app-user JWT, or null while anonymous. */
  getToken?: () => string | null;
  context?: () => TrackerContext;
  /** Built once the install id is known, so PostHog's anonymous distinct_id is the deviceId. */
  posthog?: (deviceId: string) => PostHogAdapter | null | Promise<PostHogAdapter | null>;
  /** IDFV or Android ID; the server keeps only a peppered hash. */
  hardwareHint?: () => Promise<string | null>;
  fetch?: typeof fetch;
  sendBeacon?: (url: string, body: string) => boolean;
  randomUUID?: () => string;
  now?: () => number;
  flushIntervalMs?: number;
  flushAt?: number;
  maxQueueSize?: number;
  sessionIdleMs?: number;
  onError?: (error: unknown, where: string) => void;
}

export interface Tracker {
  start(): Promise<void>;
  getDeviceId(): string | null;
  getSessionId(): string | null;
  getUserId(): string | null;
  getWebVisitorId(): string | null;
  track<N extends AnalyticsEventName>(
    name: N,
    properties?: PropertiesFor<N>,
    options?: { locationId?: string | null }
  ): void;
  screen(pathname: string, properties?: EventProperties): void;
  deeplink(input: { url: string; source: DeeplinkSource; stationCode?: string | null }): void;
  push(kind: "received" | "opened", properties?: EventProperties): void;
  permission(kind: PermissionKind, phase: "prompted" | "result", result?: PermissionResult): void;
  apiError(info: { method: string; path: string; status: number; latencyMs: number; errorCode?: string | null }): void;
  error(error: unknown, info?: { fatal?: boolean; source?: string }): void;
  setSessionSource(source: SessionSource): void;
  markConverted(): void;
  identify(userId: string, traits?: PersonTraits): Promise<void>;
  updatePerson(traits: PersonTraits): void;
  reset(): Promise<void>;
  linkWebVisitor(webVisitorId: string): Promise<void>;
  foreground(): void;
  background(): void;
  flush(options?: { beacon?: boolean }): Promise<void>;
  shutdown(): void;
}

type QueuedEvent = {
  kind: "event";
  eventId: string;
  name: AnalyticsEventName;
  occurredAt: string;
  sessionId: string;
  userId: string | null;
  source: SessionSource;
  hasLocationPermission: boolean | null;
  locationId?: string | null;
  properties: Record<string, PropertyValue>;
};

type QueuedSession = {
  kind: "session";
  /** Session open and close items share the session id; this keeps them apart. */
  itemId: string;
  sessionId: string;
  userId: string | null;
  source: SessionSource;
  hasLocationPermission: boolean | null;
  startedAt?: string;
  endedAt?: string;
  endReason?: SessionEndReason;
};

type QueueItem = QueuedEvent | QueuedSession;

type SessionState = {
  sessionId: string;
  startedAt: number;
  lastActiveAt: number;
  backgroundedAt: number | null;
  foregroundedAt: number;
  source: SessionSource;
  converted: boolean;
};

type SendOutcome = "ok" | "drop" | "retry";

const KEYS = {
  deviceId: "cuub.analytics.deviceId",
  queue: "cuub.analytics.queue",
  session: "cuub.analytics.session",
  userId: "cuub.analytics.userId",
  webVisitorId: "cuub.analytics.webVisitorId",
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BEACON_BATCH = 20;
const MAX_BACKOFF_MS = 5 * 60_000;
const NEXT_SOURCE_TTL_MS = 10_000;

const DEEPLINK_SESSION_SOURCE: Record<DeeplinkSource, SessionSource> = {
  qr_scan: "qr_scan",
  universal_link: "deeplink",
  push: "notification",
  web_handoff: "web_handoff",
};

/** RFC 4122 v4; falls back to getRandomValues / Math.random where randomUUID is missing (Hermes). */
export function defaultUUID(): string {
  const cryptoLike = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoLike && typeof cryptoLike.randomUUID === "function") return cryptoLike.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoLike && typeof cryptoLike.getRandomValues === "function") cryptoLike.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function defaultTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function classify(status: number): SendOutcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  return "drop";
}

export function createTracker(config: TrackerConfig): Tracker {
  const now = config.now ?? (() => Date.now());
  const uuid = config.randomUUID ?? defaultUUID;
  const fetchImpl = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const idStorage = config.idStorage ?? config.storage;
  const flushAt = config.flushAt ?? 20;
  const maxQueue = config.maxQueueSize ?? 1000;
  const idleMs = config.sessionIdleMs ?? 30 * 60_000;
  const flushIntervalMs = config.flushIntervalMs ?? 10_000;
  const report = (error: unknown, where: string) => config.onError?.(error, where);
  /** PostHog SDK calls may throw or return a rejecting promise; neither may break tracking. */
  const safely = (fn: () => unknown, where: string) => {
    try {
      const result = fn();
      if (result && typeof (result as Promise<unknown>).catch === "function") {
        (result as Promise<unknown>).catch((error) => report(error, where));
      }
    } catch (error) {
      report(error, where);
    }
  };

  let deviceId: string | null = null;
  let userId: string | null = null;
  let webVisitorId: string | null = null;
  let session: SessionState | null = null;
  let queue: QueueItem[] = [];
  let posthog: PostHogAdapter | null = null;
  let screenState: { name: string; since: number } | null = null;
  let prevScreen: string | null = null;
  let nextSource: { source: SessionSource; at: number } | null = null;
  let pending: Array<() => void> = [];
  let ready = false;
  let starting: Promise<void> | null = null;
  let flushing: Promise<void> | null = null;
  let retryAt = 0;
  let failures = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let writeChain: Promise<void> = Promise.resolve();

  function write(key: string, value: string, store: TrackerStorage = config.storage): Promise<void> {
    writeChain = writeChain
      .then(() => store.setItem(key, value))
      .catch((error) => report(error, "storage"));
    return writeChain;
  }

  function persistQueueSoon(): void {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void write(KEYS.queue, JSON.stringify(queue));
    }, 250);
  }

  function persistNow(): Promise<void> {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    void write(KEYS.queue, JSON.stringify(queue));
    if (session) void write(KEYS.session, JSON.stringify(session));
    return writeChain;
  }

  function persistSession(): void {
    if (session) void write(KEYS.session, JSON.stringify(session));
  }

  function context(): TrackerContext {
    try {
      return config.context?.() ?? {};
    } catch (error) {
      report(error, "context");
      return {};
    }
  }

  function enqueue(item: QueueItem): void {
    queue.push(item);
    if (queue.length > maxQueue) {
      const overflow = queue.length - maxQueue;
      let dropped = 0;
      queue = queue.filter((entry) => {
        if (dropped < overflow && entry.kind === "event") {
          dropped += 1;
          return false;
        }
        return true;
      });
    }
    persistQueueSoon();
  }

  function takeNextSource(): SessionSource | null {
    if (!nextSource) return null;
    const fresh = now() - nextSource.at <= NEXT_SOURCE_TTL_MS;
    const source = fresh ? nextSource.source : null;
    nextSource = null;
    return source;
  }

  function openSession(at: number, source: SessionSource): void {
    session = {
      sessionId: uuid(),
      startedAt: at,
      lastActiveAt: at,
      backgroundedAt: null,
      foregroundedAt: at,
      source,
      converted: false,
    };
    enqueue({
      kind: "session",
      itemId: uuid(),
      sessionId: session.sessionId,
      userId,
      source,
      hasLocationPermission: context().hasLocationPermission ?? null,
      startedAt: new Date(at).toISOString(),
    });
    persistSession();
  }

  function closeSession(at: number, reason: SessionEndReason): void {
    if (!session) return;
    const closing = session;
    const endedAt = Math.max(at, closing.startedAt);
    enqueue({
      kind: "event",
      eventId: uuid(),
      name: "session_ended",
      occurredAt: new Date(endedAt).toISOString(),
      sessionId: closing.sessionId,
      userId,
      source: closing.source,
      hasLocationPermission: context().hasLocationPermission ?? null,
      properties: sanitizeProperties({ reason, durationMs: endedAt - closing.startedAt }),
    });
    enqueue({
      kind: "session",
      itemId: uuid(),
      sessionId: closing.sessionId,
      userId,
      source: closing.source,
      hasLocationPermission: context().hasLocationPermission ?? null,
      endedAt: new Date(endedAt).toISOString(),
      endReason: reason,
    });
    session = null;
  }

  /** Rolls the session over after a long idle stretch in the foreground. */
  function activeSession(at: number): SessionState {
    if (session && session.backgroundedAt === null && at - session.lastActiveAt > idleMs) {
      closeSession(session.lastActiveAt, session.converted ? "converted" : "idle");
    }
    if (!session) openSession(at, takeNextSource() ?? "organic");
    const current = session as unknown as SessionState;
    current.lastActiveAt = at;
    return current;
  }

  function baseContext(ctx: TrackerContext): EventProperties {
    return {
      platform: config.platform,
      appVersion: ctx.appVersion ?? undefined,
      build: ctx.build ?? undefined,
      os: ctx.os ?? undefined,
      osVersion: ctx.osVersion ?? undefined,
      locale: ctx.locale ?? undefined,
      timezone: ctx.timezone ?? defaultTimezone() ?? undefined,
      network: ctx.network ?? undefined,
      screen: screenState?.name,
      prevScreen: prevScreen ?? undefined,
      isAuthenticated: Boolean(userId),
      membership: ctx.membership ?? undefined,
      geohash: ctx.hasLocationPermission === false ? undefined : ctx.geohash?.slice(0, 6) ?? undefined,
    };
  }

  function record(name: AnalyticsEventName, properties: EventProperties | undefined, locationId?: string | null): void {
    const at = now();
    const current = activeSession(at);
    const ctx = context();
    const merged = sanitizeProperties(properties, baseContext(ctx));
    enqueue({
      kind: "event",
      eventId: uuid(),
      name,
      occurredAt: new Date(at).toISOString(),
      sessionId: current.sessionId,
      userId,
      source: current.source,
      hasLocationPermission: ctx.hasLocationPermission ?? null,
      locationId: locationId && UUID_RE.test(locationId) ? locationId : undefined,
      properties: merged,
    });
    persistSession();

    safely(
      () => posthog?.capture(name, { ...merged, cuub_device_id: deviceId, cuub_session_id: current.sessionId }),
      "posthog"
    );

    const queuedEvents = queue.reduce((count, item) => count + (item.kind === "event" ? 1 : 0), 0);
    if (queuedEvents >= flushAt) void flush();
  }

  function whenReady(fn: () => void): void {
    if (ready) fn();
    else pending.push(fn);
  }

  function track<N extends AnalyticsEventName>(
    name: N,
    properties?: PropertiesFor<N>,
    options: { locationId?: string | null } = {}
  ): void {
    if (!isAnalyticsEventName(name)) {
      report(new Error(`Unknown analytics event "${name}"`), "track");
      return;
    }
    whenReady(() => record(name, properties as EventProperties | undefined, options.locationId));
  }

  async function post(url: string, body: unknown, token: string | null): Promise<number> {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return response.status;
  }

  function sessionBody(item: QueuedSession): Record<string, unknown> {
    return {
      sessionId: item.sessionId,
      deviceId,
      source: item.source,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
      endReason: item.endReason,
      hasLocationPermission: item.hasLocationPermission ?? undefined,
      isAuthenticated: Boolean(item.userId),
    };
  }

  function eventsBody(batch: QueuedEvent[]): Record<string, unknown> {
    const head = batch[0];
    return {
      deviceId,
      sessionId: head.sessionId,
      source: head.source,
      hasLocationPermission: batch[batch.length - 1].hasLocationPermission ?? undefined,
      isAuthenticated: Boolean(head.userId),
      sentAt: new Date(now()).toISOString(),
      events: batch.map((event) => ({
        eventId: event.eventId,
        name: event.name,
        occurredAt: event.occurredAt,
        locationId: event.locationId ?? undefined,
        properties: event.properties,
      })),
    };
  }

  async function send(batch: QueueItem[], beacon: boolean): Promise<SendOutcome> {
    const head = batch[0];
    const kind: IngestKind = head.kind === "session" ? "session" : "events";
    const body = head.kind === "session" ? sessionBody(head) : eventsBody(batch as QueuedEvent[]);
    const url = config.endpoint(kind);
    const token = head.userId && head.userId === userId ? config.getToken?.() ?? null : null;

    if (beacon && !token && config.sendBeacon) {
      try {
        if (config.sendBeacon(url, JSON.stringify(body))) return "ok";
      } catch (error) {
        report(error, "beacon");
      }
    }

    try {
      let status = await post(url, body, token);
      // An expired token must not lose the batch; the next identify backfills it.
      if (token && (status === 401 || status === 403)) status = await post(url, body, null);
      return classify(status);
    } catch (error) {
      report(error, "flush");
      return "retry";
    }
  }

  function nextBatch(beacon: boolean): QueueItem[] {
    const head = queue[0];
    if (!head) return [];
    if (head.kind === "session") return [head];
    const limit = beacon ? BEACON_BATCH : MAX_EVENTS_PER_BATCH;
    const batch: QueueItem[] = [];
    for (const item of queue) {
      if (item.kind !== "event" || item.sessionId !== head.sessionId || item.userId !== head.userId) break;
      batch.push(item);
      if (batch.length >= limit) break;
    }
    return batch;
  }

  async function runFlush(beacon: boolean): Promise<void> {
    if (!ready || !deviceId) return;
    if (!beacon && now() < retryAt) return;
    while (queue.length > 0) {
      const batch = nextBatch(beacon);
      const outcome = await send(batch, beacon);
      if (outcome === "retry") {
        failures += 1;
        retryAt = now() + Math.min(MAX_BACKOFF_MS, 2_000 * 2 ** (failures - 1));
        break;
      }
      if (outcome === "drop") report(new Error(`Analytics batch rejected (${batch.length} items)`), "flush");
      failures = 0;
      retryAt = 0;
      const sent = new Set(batch);
      queue = queue.filter((item) => !sent.has(item));
    }
    await persistNow();
  }

  function flush(options: { beacon?: boolean } = {}): Promise<void> {
    if (flushing) return flushing;
    flushing = runFlush(Boolean(options.beacon)).finally(() => {
      flushing = null;
    });
    return flushing;
  }

  async function postDirect(kind: IngestKind, body: Record<string, unknown>, token: string | null): Promise<void> {
    try {
      const status = await post(config.endpoint(kind), body, token);
      if (classify(status) !== "ok") report(new Error(`Analytics ${kind} returned ${status}`), kind);
    } catch (error) {
      report(error, kind);
    }
  }

  async function hardwareHint(): Promise<string | null> {
    try {
      return (await config.hardwareHint?.()) ?? null;
    } catch {
      return null;
    }
  }

  async function registerDevice(): Promise<void> {
    const ctx = context();
    await postDirect(
      "device",
      {
        deviceId,
        platform: config.platform,
        appVersion: ctx.appVersion ?? undefined,
        osVersion: ctx.osVersion ?? undefined,
        locale: ctx.locale ?? undefined,
        hardwareHint: (await hardwareHint()) ?? undefined,
        webVisitorId: webVisitorId ?? undefined,
      },
      config.getToken?.() ?? null
    );
  }

  async function start(): Promise<void> {
    if (starting) return starting;
    starting = (async () => {
      try {
        const [storedId, storedQueue, storedSession, storedUser, storedVisitor] = await Promise.all([
          idStorage.getItem(KEYS.deviceId),
          config.storage.getItem(KEYS.queue),
          config.storage.getItem(KEYS.session),
          config.storage.getItem(KEYS.userId),
          config.storage.getItem(KEYS.webVisitorId),
        ]);
        deviceId = storedId && UUID_RE.test(storedId) ? storedId.toLowerCase() : uuid();
        if (deviceId !== storedId) void write(KEYS.deviceId, deviceId, idStorage);
        const restored = safeParse<QueueItem[]>(storedQueue);
        queue = [...(Array.isArray(restored) ? restored : []), ...queue];
        session = safeParse<SessionState>(storedSession);
        userId = storedUser || null;
        webVisitorId = storedVisitor || null;
      } catch (error) {
        report(error, "start");
        deviceId = deviceId ?? uuid();
      }

      try {
        posthog = (await config.posthog?.(deviceId)) ?? null;
        safely(() => posthog?.register?.({ cuub_device_id: deviceId, platform: config.platform }), "posthog");
      } catch (error) {
        report(error, "posthog");
      }

      const at = now();
      if (session) {
        const lastSeen = session.backgroundedAt ?? session.lastActiveAt;
        if (at - lastSeen > idleMs) {
          closeSession(lastSeen, session.converted ? "converted" : "abandoned");
        } else {
          session.backgroundedAt = null;
          session.foregroundedAt = at;
        }
      }
      ready = true;
      record("app_opened", { coldStart: true });

      const queued = pending;
      pending = [];
      for (const fn of queued) fn();

      if (flushIntervalMs > 0 && !timer) {
        timer = setInterval(() => void flush(), flushIntervalMs);
        (timer as { unref?: () => void }).unref?.();
      }
      void registerDevice();
    })();
    return starting;
  }

  function setSessionSource(source: SessionSource): void {
    whenReady(() => {
      const open = session
        ? queue.find(
            (item): item is QueuedSession =>
              item.kind === "session" && item.sessionId === session!.sessionId && Boolean(item.startedAt)
          )
        : undefined;
      if (session && open) {
        session.source = source;
        for (const item of queue) if (item.sessionId === session.sessionId) item.source = source;
        persistSession();
        persistQueueSoon();
      } else {
        nextSource = { source, at: now() };
      }
    });
  }

  function personProperties(traits: PersonTraits): Record<string, unknown> {
    const props: Record<string, unknown> = { platform: config.platform };
    if (traits.signupDate !== undefined) props.signup_date = traits.signupDate;
    if (traits.membership !== undefined) props.membership = traits.membership;
    if (traits.ageBracket !== undefined) props.age_bracket = traits.ageBracket;
    return props;
  }

  async function identify(nextUserId: string, traits: PersonTraits = {}): Promise<void> {
    await start();
    if (userId && userId !== nextUserId) await reset();
    userId = nextUserId;
    void write(KEYS.userId, nextUserId);
    safely(() => posthog?.identify(nextUserId, personProperties(traits)), "posthog");
    const token = config.getToken?.() ?? null;
    if (!token) return;
    await postDirect(
      "identify",
      {
        deviceId,
        sessionId: session?.sessionId,
        webVisitorId: webVisitorId ?? undefined,
        platform: config.platform,
        hardwareHint: (await hardwareHint()) ?? undefined,
      },
      token
    );
  }

  function updatePerson(traits: PersonTraits): void {
    if (!userId) return;
    const current = userId;
    safely(() => posthog?.identify(current, personProperties(traits)), "posthog");
  }

  /** Call before the auth token is cleared, so queued signed-in events still carry it. */
  async function reset(): Promise<void> {
    await start();
    if (session) closeSession(now(), session.converted ? "converted" : "abandoned");
    await flush();
    userId = null;
    void write(KEYS.userId, "");
    safely(() => posthog?.reset(), "posthog");
    safely(() => posthog?.register?.({ cuub_device_id: deviceId, platform: config.platform }), "posthog");
    await persistNow();
  }

  async function linkWebVisitor(id: string): Promise<void> {
    await start();
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id) || id === webVisitorId) return;
    webVisitorId = id;
    void write(KEYS.webVisitorId, id);
    await registerDevice();
    if (userId) {
      const token = config.getToken?.() ?? null;
      if (token) {
        await postDirect(
          "identify",
          { deviceId, sessionId: session?.sessionId, webVisitorId: id, platform: config.platform },
          token
        );
      }
    }
  }

  function foreground(): void {
    whenReady(() => {
      const at = now();
      const resumed = session;
      if (resumed && resumed.backgroundedAt === null) return;
      let newSession = !resumed;
      if (resumed && resumed.backgroundedAt !== null) {
        if (at - resumed.backgroundedAt > idleMs) {
          closeSession(resumed.backgroundedAt, resumed.converted ? "converted" : "abandoned");
          newSession = true;
        } else {
          resumed.backgroundedAt = null;
          resumed.foregroundedAt = at;
          nextSource = null;
        }
      }
      record("app_foregrounded", { newSession });
      if (session) session.foregroundedAt = at;
    });
  }

  function background(): void {
    whenReady(() => {
      if (!session || session.backgroundedAt !== null) return;
      const at = now();
      record("app_backgrounded", { foregroundMs: at - session.foregroundedAt });
      if (session) session.backgroundedAt = at;
      persistSession();
      void flush({ beacon: true });
      safely(() => posthog?.flush?.(), "posthog");
    });
  }

  return {
    start,
    getDeviceId: () => deviceId,
    getSessionId: () => session?.sessionId ?? null,
    getUserId: () => userId,
    getWebVisitorId: () => webVisitorId,
    track,
    screen(pathname, properties) {
      whenReady(() => {
        const name = screenName(pathname);
        if (screenState?.name === name) return;
        const at = now();
        const previous = screenState;
        prevScreen = previous?.name ?? null;
        screenState = { name, since: at };
        record("screen_viewed", {
          ...properties,
          screen: name,
          prevScreen: previous?.name,
          prevScreenMs: previous ? at - previous.since : undefined,
        });
        safely(() => posthog?.screen?.(name), "posthog");
      });
    },
    deeplink({ url, source, stationCode }) {
      setSessionSource(DEEPLINK_SESSION_SOURCE[source]);
      let hasWebVisitor = false;
      try {
        hasWebVisitor = new URL(url).searchParams.has("wv");
      } catch {
        hasWebVisitor = false;
      }
      track("deeplink_opened", {
        source,
        path: routeTemplate(url),
        stationCode: stationCode ?? undefined,
        hasWebVisitor,
      });
    },
    push(kind, properties) {
      if (kind === "opened") setSessionSource("notification");
      track(kind === "opened" ? "notification_opened" : "push_received", properties);
    },
    permission(kind, phase, result) {
      if (phase === "prompted") track("permission_prompted", { permission: kind });
      else track("permission_result", { permission: kind, result: result ?? "undetermined" });
    },
    apiError({ method, path, status, latencyMs, errorCode }) {
      track("api_error", {
        method: method.toUpperCase(),
        route: routeTemplate(path),
        status,
        latencyMs: Math.round(latencyMs),
        errorCode: errorCode ?? undefined,
      });
    },
    error(error, info = {}) {
      const err = error instanceof Error ? error : new Error(String(error));
      track("js_error", {
        errorName: err.name,
        message: err.message,
        fatal: Boolean(info.fatal),
        source: info.source,
      });
      if (info.fatal) void persistNow();
    },
    setSessionSource,
    markConverted() {
      whenReady(() => {
        if (!session) return;
        session.converted = true;
        persistSession();
      });
    },
    identify,
    updatePerson,
    reset,
    linkWebVisitor,
    foreground,
    background,
    flush,
    shutdown() {
      if (timer) clearInterval(timer);
      timer = null;
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = null;
    },
  };
}
