import assert from "node:assert/strict";
import test from "node:test";
import { BANDORI_SERVER_CODES } from "../src/lib/bandori-server.ts";
import { parseServiceStatusResponse, SERVICE_STATUS_SERVICES } from "../src/lib/service-status.ts";

const timestamp = "2026-09-10T06:00:00.000Z";
function response() {
  return {
    success: true,
    data: { hhwxBandoriBackend: Object.fromEntries(SERVICE_STATUS_SERVICES.map((service) => [
      service, Object.fromEntries(BANDORI_SERVER_CODES.map((server) => [
        server, { status: "operational", observedAt: timestamp },
      ])),
    ])) },
    meta: { checkedAt: timestamp },
  };
}

test("public status preserves all regions and keeps the update reason on its originating region", () => {
  const payload = response();
  for (const entry of Object.values(payload.data.hhwxBandoriBackend.assetsBuilder)) entry.status = "error";
  payload.data.hhwxBandoriBackend.assetsBuilder.en.reasonCode = "update_required";
  payload.data.hhwxBandoriBackend.cutoffTracker.cn.status = "maintenance";
  payload.data.hhwxBandoriBackend.userFetcher.tw = { status: null, observedAt: null };
  const snapshot = parseServiceStatusResponse(payload);
  assert.deepEqual(snapshot, { data: payload.data, meta: payload.meta });
  assert.equal(snapshot.data.hhwxBandoriBackend.assetsBuilder.jp.reasonCode, undefined);
});

test("unknown reasons and fields never become user-facing explanations", () => {
  const payload = response();
  const entries = payload.data.hhwxBandoriBackend.assetsBuilder;
  entries.en = { status: "error", observedAt: timestamp, reasonCode: "internal_detail", message: "private detail" };
  entries.jp.reasonCode = "update_required";
  const snapshot = parseServiceStatusResponse(payload);
  assert.deepEqual(snapshot.data.hhwxBandoriBackend.assetsBuilder.en, { status: "error", observedAt: timestamp });
  assert.equal(snapshot.data.hhwxBandoriBackend.assetsBuilder.jp.reasonCode, undefined);
});

test("initial unconfirmed snapshots are valid", () => {
  const payload = response();
  payload.meta.checkedAt = null;
  for (const entries of Object.values(payload.data.hhwxBandoriBackend)) {
    for (const server of BANDORI_SERVER_CODES) entries[server] = { status: null, observedAt: null };
  }
  assert.deepEqual(parseServiceStatusResponse(payload), { data: payload.data, meta: payload.meta });
});

test("failed, malformed and incomplete responses reject rather than fabricating service states", () => {
  for (const payload of [null, [], {}, { success: false, error: { message: "internal detail" } }]) {
    assert.throws(() => parseServiceStatusResponse(payload));
  }
  const mutations = [
    (p) => { delete p.data.hhwxBandoriBackend.assetsBuilder; },
    (p) => { delete p.data.hhwxBandoriBackend.userFetcher.en; },
    (p) => { p.data.hhwxBandoriBackend.userFetcher.en.status = "unexpected"; },
    (p) => { p.data.hhwxBandoriBackend.userFetcher.en.observedAt = "invalid"; },
    (p) => { p.meta.checkedAt = "invalid"; },
    (p) => { delete p.meta; },
  ];
  for (const mutate of mutations) {
    const payload = response();
    mutate(payload);
    assert.throws(() => parseServiceStatusResponse(payload));
  }
});
