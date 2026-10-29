import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_STORE_URL,
  buildStationUrl,
  detectStorePlatform,
  normalizeStationCode,
  parseInstallReferrer,
  parseStationLink,
  playStoreUrl,
  storeUrlFor,
} from "../src/links";

const hosts = ["go.cuub.tech"];

test("station codes normalise Crockford look-alikes and reject bad input", () => {
  assert.equal(normalizeStationCode("7k3m-9xqa"), "7K3M9XQA");
  assert.equal(normalizeStationCode("O1IL2345"), "01112345");
  assert.equal(normalizeStationCode("SHORT"), null);
  assert.equal(normalizeStationCode("7K3M9XQU"), null);
});

test("parseStationLink accepts the https link, the app scheme and a bare code", () => {
  assert.deepEqual(parseStationLink("https://go.cuub.tech/s/7K3M9XQA", hosts), {
    code: "7K3M9XQA",
    webVisitorId: null,
  });
  assert.deepEqual(parseStationLink("cuub://s/7k3m9xqa", hosts), {
    code: "7K3M9XQA",
    webVisitorId: null,
  });
  assert.equal(parseStationLink("7K3M9XQA", hosts)?.code, "7K3M9XQA");
  assert.equal(
    parseStationLink("https://go.cuub.tech/s/7K3M9XQA?wv=abc12345-0000", hosts)?.webVisitorId,
    "abc12345-0000"
  );
});

test("parseStationLink refuses other hosts, http and other paths", () => {
  assert.equal(parseStationLink("https://evil.example/s/7K3M9XQA", hosts), null);
  assert.equal(parseStationLink("http://go.cuub.tech/s/7K3M9XQA", hosts), null);
  assert.equal(parseStationLink("https://go.cuub.tech/x/7K3M9XQA", hosts), null);
});

test("buildStationUrl round-trips through parseStationLink", () => {
  const url = buildStationUrl("https://go.cuub.tech/", "7K3M9XQA", { webVisitorId: "visitor-123" });
  assert.equal(url, "https://go.cuub.tech/s/7K3M9XQA?wv=visitor-123");
  assert.deepEqual(parseStationLink(url, hosts), { code: "7K3M9XQA", webVisitorId: "visitor-123" });
});

test("store links pick the store by OS and carry the handoff referrer to Play", () => {
  assert.equal(detectStorePlatform("Mozilla (iPhone; CPU iPhone OS 18_0)"), "ios");
  assert.equal(detectStorePlatform("Mozilla (Linux; Android 15)"), "android");
  assert.equal(detectStorePlatform("Mozilla (Windows NT 10.0)"), "other");
  assert.equal(storeUrlFor("ios", { webVisitorId: "v" }), APP_STORE_URL);
  assert.equal(
    playStoreUrl("visitor-123"),
    "https://play.google.com/store/apps/details?id=com.cuub.user&referrer=wv%3Dvisitor-123"
  );
  assert.equal(parseInstallReferrer("wv=visitor-123&utm_source=web"), "visitor-123");
  assert.equal(parseInstallReferrer("utm_source=google-play"), null);
});
