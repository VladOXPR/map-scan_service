import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageBracket,
  createTracker,
  routeTemplate,
  sanitizeProperties,
  screenName,
  type PostHogAdapter,
  type TrackerConfig,
  type TrackerStorage,
} from "../src/analytics";

class MemoryStorage implements TrackerStorage {
  data = new Map<string, string>();
  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

type Call = { url: string; body: any; token: string | null };

type HarnessOptions = Partial<TrackerConfig> & {
  /** Status for each `/events` call in order; other calls get 200. */
  statuses?: number[];
  respond?: (call: Call) => number;
  clock?: { t: number };
};

function harness(overrides: HarnessOptions = {}) {
  const { statuses = [], respond, clock: givenClock, ...config } = overrides;
  const calls: Call[] = [];
  const clock = givenClock ?? { t: Date.parse("2026-10-21T15:00:00Z") };
  const storage = (config.storage as MemoryStorage) ?? new MemoryStorage();
  let token: string | null = null;
  let n = 0;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const auth = headers.Authorization ?? null;
    const call = { url, body: JSON.parse(String(init.body)), token: auth ? auth.replace("Bearer ", "") : null };
    calls.push(call);
    let status = 200;
    if (respond) status = respond(call);
    else if (url.endsWith("/events") && statuses.length) status = statuses.shift() as number;
    return { status } as Response;
  }) as unknown as typeof fetch;

  const tracker = createTracker({
    platform: "ios",
    endpoint: (kind) => `https://api.test/app/analytics/${kind}`,
    fetch: fakeFetch,
    getToken: () => token,
    now: () => clock.t,
    randomUUID: () => {
      n += 1;
      return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    },
    flushIntervalMs: 0,
    ...config,
    storage,
  });
  return {
    tracker,
    calls,
    storage,
    clock,
    setToken: (value: string | null) => {
      token = value;
    },
    events: () => calls.filter((c) => c.url.endsWith("/events")).flatMap((c) => c.body.events),
  };
}

test("events are queued, batched per session and sent with sentAt", async () => {
  const h = harness();
  await h.tracker.start();
  h.tracker.track("map_loaded", { stations: 12 });
  h.tracker.track("station_pin_tapped", { stationId: "abc" });
  await h.tracker.flush();

  const sessionCall = h.calls.find((c) => c.url.endsWith("/session"));
  assert.ok(sessionCall, "the session is opened with its start time");
  assert.equal(sessionCall.body.source, "organic");
  assert.ok(sessionCall.body.startedAt);

  const batch = h.calls.find((c) => c.url.endsWith("/events"));
  assert.ok(batch);
  assert.equal(batch.body.deviceId, h.tracker.getDeviceId());
  assert.equal(batch.body.sessionId, h.tracker.getSessionId());
  assert.ok(batch.body.sentAt);
  assert.deepEqual(
    batch.body.events.map((e: any) => e.name),
    ["app_opened", "map_loaded", "station_pin_tapped"]
  );
  assert.equal(batch.body.events[1].properties.stations, 12);
  assert.equal(batch.body.events[1].properties.platform, "ios");
  assert.equal(batch.body.events[1].properties.isAuthenticated, false);
});

test("the queue survives a restart and is not resent once delivered", async () => {
  const storage = new MemoryStorage();
  const first = harness({ storage, statuses: [503] });
  await first.tracker.start();
  first.tracker.track("map_loaded");
  await first.tracker.flush();
  const persisted = JSON.parse(storage.data.get("cuub.analytics.queue") ?? "[]");
  assert.ok(
    persisted.some((item: any) => item.name === "map_loaded"),
    "the 503 kept the batch in the persisted queue"
  );
  const deviceId = first.tracker.getDeviceId();

  const second = harness({ storage, clock: { t: first.clock.t + 1000 } });
  await second.tracker.start();
  assert.equal(second.tracker.getDeviceId(), deviceId, "the install id is stable");
  await second.tracker.flush();
  const names = second.events().map((e: any) => e.name);
  assert.ok(names.includes("map_loaded"), "the event queued before the restart is delivered");

  await second.tracker.flush();
  const after = second.events().length;
  await second.tracker.flush();
  assert.equal(second.events().length, after, "delivered events are removed from the queue");
});

test("a rejected batch is dropped, a server error is retried with backoff", async () => {
  const h = harness({ statuses: [400] });
  await h.tracker.start();
  h.tracker.track("map_loaded");
  await h.tracker.flush();
  await h.tracker.flush();
  assert.equal(h.calls.filter((c) => c.url.endsWith("/events")).length, 1, "400 is not retried");

  const r = harness({ statuses: [500] });
  await r.tracker.start();
  r.tracker.track("map_loaded");
  await r.tracker.flush();
  await r.tracker.flush();
  assert.equal(r.calls.filter((c) => c.url.endsWith("/events")).length, 1, "backoff holds the retry");
  r.clock.t += 3_000;
  await r.tracker.flush();
  assert.equal(r.calls.filter((c) => c.url.endsWith("/events")).length, 2, "retried after backoff");
});

test("unknown names never reach the queue, and properties are trimmed to the server limits", async () => {
  const errors: string[] = [];
  const h = harness({ onError: (error) => errors.push(String(error)) });
  await h.tracker.start();
  (h.tracker.track as (name: string) => void)("made_up_event");
  const many: Record<string, number | string> = { latitude: 41.9, phone: "+13125550199", firstName: "Ana" };
  for (let i = 0; i < 40; i += 1) many[`k${i}`] = i;
  h.tracker.track("map_loaded", many);
  await h.tracker.flush();

  assert.ok(errors.some((e) => e.includes("made_up_event")));
  const event = h.events().find((e: any) => e.name === "map_loaded");
  assert.ok(event);
  assert.equal(Object.keys(event.properties).length, 32);
  assert.equal(event.properties.latitude, undefined);
  assert.equal(event.properties.phone, undefined);
  assert.equal(event.properties.firstName, undefined);
  assert.equal(event.properties.k0, 0, "the event's own keys win over context");
});

test("signed-in events carry the token; anonymous ones never do", async () => {
  const posthog = recorder();
  const h = harness({ posthog: () => posthog });
  await h.tracker.start();
  h.tracker.track("phone_viewed", {});
  h.setToken("jwt-1");
  await h.tracker.identify("user-1", { membership: "none", ageBracket: "25-34" });
  h.tracker.track("profile_viewed", { trigger: "signup" });
  await h.tracker.flush();

  const identify = h.calls.find((c) => c.url.endsWith("/identify"));
  assert.ok(identify);
  assert.equal(identify.token, "jwt-1");
  assert.equal(identify.body.deviceId, h.tracker.getDeviceId());
  assert.equal(identify.body.sessionId, h.tracker.getSessionId());

  const batches = h.calls.filter((c) => c.url.endsWith("/events"));
  const anon = batches.find((c) => c.body.events.some((e: any) => e.name === "phone_viewed"));
  const signed = batches.find((c) => c.body.events.some((e: any) => e.name === "profile_viewed"));
  assert.equal(anon?.token, null);
  assert.equal(signed?.token, "jwt-1");
  assert.equal(signed?.body.isAuthenticated, true);

  assert.deepEqual(posthog.identified, [["user-1", { platform: "ios", membership: "none", age_bracket: "25-34" }]]);
  assert.equal(posthog.captured[0][1].cuub_device_id, h.tracker.getDeviceId());
});

test("an expired token resends the batch anonymously instead of losing it", async () => {
  const h = harness({ respond: (call) => (call.token === "expired" && call.url.endsWith("/events") ? 401 : 200) });
  await h.tracker.start();
  h.setToken("expired");
  await h.tracker.identify("user-1");
  h.tracker.track("map_loaded");
  await h.tracker.flush();

  const tries = h.calls.filter(
    (c) => c.url.endsWith("/events") && c.body.events.some((e: any) => e.name === "map_loaded")
  );
  assert.deepEqual(
    tries.map((c) => c.token),
    ["expired", null],
    "the 401 is retried once without the token"
  );
});

test("logout flushes the signed-in session, closes it and resets PostHog", async () => {
  const posthog = recorder();
  const h = harness({ posthog: () => posthog });
  await h.tracker.start();
  h.setToken("jwt-1");
  await h.tracker.identify("user-1");
  const sessionBefore = h.tracker.getSessionId();
  h.tracker.track("logout");
  await h.tracker.reset();
  h.setToken(null);

  const closing = h.calls.filter((c) => c.url.endsWith("/session") && c.body.endReason);
  assert.equal(closing.length, 1);
  assert.equal(closing[0].body.sessionId, sessionBefore);
  assert.equal(closing[0].token, "jwt-1");
  assert.equal(posthog.resets, 1);
  assert.equal(h.tracker.getUserId(), null);

  h.tracker.track("map_loaded");
  await h.tracker.flush();
  const after = h.calls.filter((c) => c.url.endsWith("/events")).pop();
  assert.notEqual(after?.body.sessionId, sessionBefore, "the next person starts a new session");
  assert.equal(after?.token, null);
});

test("a long background ends the session as abandoned and the next foreground starts a new one", async () => {
  const h = harness();
  await h.tracker.start();
  const first = h.tracker.getSessionId();
  h.tracker.background();
  h.clock.t += 31 * 60_000;
  h.tracker.foreground();
  await h.tracker.flush();

  assert.notEqual(h.tracker.getSessionId(), first);
  const ended = h.events().find((e: any) => e.name === "session_ended");
  assert.equal(ended?.properties.reason, "abandoned");
  const close = h.calls.find((c) => c.url.endsWith("/session") && c.body.sessionId === first && c.body.endReason);
  assert.equal(close?.body.endReason, "abandoned");
});

test("a short background resumes the same session; a converted session ends as converted", async () => {
  const h = harness();
  await h.tracker.start();
  const first = h.tracker.getSessionId();
  h.tracker.background();
  h.clock.t += 5 * 60_000;
  h.tracker.foreground();
  assert.equal(h.tracker.getSessionId(), first);

  h.tracker.markConverted();
  h.tracker.background();
  h.clock.t += 45 * 60_000;
  h.tracker.foreground();
  await h.tracker.flush();
  const close = h.calls.find((c) => c.url.endsWith("/session") && c.body.sessionId === first && c.body.endReason);
  assert.equal(close?.body.endReason, "converted");
});

test("a push or QR open sets the source of the session it starts", async () => {
  const h = harness();
  await h.tracker.start();
  h.tracker.deeplink({ url: "https://go.cuub.tech/s/7K3M9XQA?wv=abc", source: "qr_scan", stationCode: "7K3M9XQA" });
  await h.tracker.flush();
  const open = h.calls.find((c) => c.url.endsWith("/session") && c.body.startedAt);
  assert.equal(open?.body.source, "qr_scan");
  const link = h.events().find((e: any) => e.name === "deeplink_opened");
  assert.equal(link?.properties.path, "/s/:code");
  assert.equal(link?.properties.hasWebVisitor, true);
  assert.equal(link?.properties.stationCode, "7K3M9XQA");
});

test("screen views carry the previous screen and the time spent on it", async () => {
  const h = harness();
  await h.tracker.start();
  h.tracker.screen("/");
  h.clock.t += 4_000;
  h.tracker.screen("/s/7K3M9XQA");
  h.tracker.screen("/s/7K3M9XQA");
  await h.tracker.flush();
  const views = h.events().filter((e: any) => e.name === "screen_viewed");
  assert.equal(views.length, 2, "repeat views of the same screen are ignored");
  assert.equal(views[1].properties.screen, "/s/:code");
  assert.equal(views[1].properties.prevScreen, "/");
  assert.equal(views[1].properties.prevScreenMs, 4_000);
});

test("twenty queued events trigger a flush without waiting for the timer", async () => {
  const h = harness();
  await h.tracker.start();
  for (let i = 0; i < 20; i += 1) h.tracker.track("map_retry_tapped");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(h.calls.some((c) => c.url.endsWith("/events")));
});

test("the web hands queued anonymous events to sendBeacon when the page hides", async () => {
  const beacons: string[] = [];
  const h = harness({
    platform: "web",
    sendBeacon: (url, body) => {
      beacons.push(`${url} ${JSON.parse(body).events?.length ?? "session"}`);
      return true;
    },
  });
  await h.tracker.start();
  h.tracker.track("page_viewed", { path: "/" });
  h.tracker.background();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(beacons.some((b) => b.includes("/events")));
  assert.equal(h.calls.filter((c) => c.url.endsWith("/events")).length, 0);
});

test("route and screen templates hide ids, codes and serials", () => {
  assert.equal(routeTemplate("/app/rentals/4f1c2d3e-1111-4222-8333-444455556666?x=1"), "/app/rentals/:id");
  assert.equal(routeTemplate("/app/stations/by-code/7K3M9XQA"), "/app/stations/by-code/:code");
  assert.equal(routeTemplate("/stations/by-manufacture/CUBT062510000026"), "/stations/by-manufacture/:serial");
  assert.equal(routeTemplate("https://platform.cuub.tech/app/me"), "/app/me");
  assert.equal(screenName("/(app)/s/7K3M9XQA"), "/s/:code");
  assert.equal(screenName("/settings"), "/settings");
});

test("sanitizeProperties keeps flat values and drops the rest", () => {
  const out = sanitizeProperties({ a: 1, b: "x".repeat(500), c: Number.NaN, d: { nested: true } as never, e: null });
  assert.equal(out.a, 1);
  assert.equal((out.b as string).length, 200);
  assert.equal("c" in out, false);
  assert.equal("d" in out, false);
  assert.equal(out.e, null);
});

test("ageBracket buckets ages and never returns under 13", () => {
  const now = new Date("2026-10-21T00:00:00Z");
  assert.equal(ageBracket("2013-10-22", now), null);
  assert.equal(ageBracket("2013-10-21", now), "13-17");
  assert.equal(ageBracket("1995-01-01", now), "25-34");
  assert.equal(ageBracket("1960-05-05", now), "55+");
  assert.equal(ageBracket("not a date", now), null);
});

function recorder(): PostHogAdapter & {
  captured: Array<[string, Record<string, unknown>]>;
  identified: Array<[string, Record<string, unknown> | undefined]>;
  resets: number;
} {
  const state = {
    captured: [] as Array<[string, Record<string, unknown>]>,
    identified: [] as Array<[string, Record<string, unknown> | undefined]>,
    resets: 0,
    capture(event: string, properties?: Record<string, unknown>) {
      state.captured.push([event, properties ?? {}]);
    },
    identify(id: string, properties?: Record<string, unknown>) {
      state.identified.push([id, properties]);
    },
    reset() {
      state.resets += 1;
    },
  };
  return state;
}
