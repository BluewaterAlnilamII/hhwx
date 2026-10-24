import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contracts from "../src/lib/api-contracts.ts";
import * as chat from "../src/lib/chat/chat-session.ts";

const userId = "c0000000-0000-4000-8000-000000000001";
const saved = (id, content = "") => ({ messageId: id, clientRequestId: id, deleted: false, nextSendAt: null,
  message: { id, clientRequestId: id, content, createdAt: new Date().toISOString(),
    author: { userId, username: "test", publicUid: 1, avatarCardId: 1, avatarCardServer: null, avatarCardTrainType: "normal" } } });
const ok = data => Response.json({ success: true, data });
const hang = signal => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));

function harness(fetch) {
  const durations = [], exports = {};
  const transports = [];
  class Client {
    listeners = {};
    constructor() { transports.push(this); }
    on(name, callback) { this.listeners[name] = callback; }
    connect() {}
    disconnect() {}
  }
  const dependencies = {
    react: { useMemo: fn => fn(), useEffect() {}, useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    centrifuge: { Centrifuge: Client }, "@/lib/supabase": { getSafeSession: async () => ({ user: { id: userId }, access_token: "fixture" }) },
    "@/lib/api-contracts": contracts, "@/lib/chat/chat-contract": { CHAT_CHANNEL: "chat:main" },
    "@/lib/chat/chat-session": chat, "@/store/useGameStore": { useGameStore: { getState: () => ({ userId }) } },
  };
  const source = ts.transpileModule(readFileSync(new URL("../src/hooks/useChatSession.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, fetch, AbortSignal: {
    any: signals => AbortSignal.any(signals),
    timeout(ms) {
      durations.push(ms);
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("timed out", "TimeoutError")), 10);
      return controller.signal;
    },
  }, require(id) { assert.ok(Object.hasOwn(dependencies, id), id); return dependencies[id]; } });
  return { session: exports.useChatSession(userId, false).session, durations, transports };
}

test("transport accepts only its issued channel and old connections still default to main", async () => {
  for (const channel of ["chat:other", undefined]) {
    const expected = channel ?? "chat:main"; let historyReads = 0;
    const h = harness(async path => {
      if (path.endsWith("/connection")) return ok({ token: "token", url: "ws://local", channel,
        viewer: { userId, canModerate: false, mutedUntil: null, nextSendAt: null } });
      historyReads++; return ok({ messages: [], nextCursor: null });
    });
    await h.session.activate();
    const callbacks = h.transports[0].listeners;
    callbacks.subscribed({ channel: "chat:wrong" });
    assert.equal(historyReads, 0);
    callbacks.subscribed({ channel: expected });
    await new Promise(setImmediate);
    assert.equal(historyReads, 1);
    const event = { type: "message.created", message: saved(userId, "scoped").message };
    callbacks.publication({ channel: "chat:wrong", data: event });
    assert.equal(h.session.getSnapshot().messages.length, 0);
    callbacks.publication({ channel: expected, data: event });
    assert.equal(h.session.getSnapshot().messages.length, 1);
    h.session.dispose();
  }
});

test("API timeout releases the text queue, preserves drafts, and retry keeps the request ID", async () => {
  const calls = []; let timeout = true;
  const h = harness(async (path, init) => {
    const body = JSON.parse(init.body); calls.push({ path, body });
    assert.equal(init.headers.Authorization, "Bearer fixture");
    return timeout ? hang(init.signal) : ok(saved(body.clientRequestId, body.content));
  });
  h.session.setDraft("first"); const first = h.session.send();
  h.session.setDraft("second"); await h.session.send(); h.session.setDraft("new draft");
  await first;
  assert.deepEqual(h.session.getSnapshot().pending.map(p => p.status), ["failed", "failed"]);
  assert.equal(calls.length, 1); assert.equal(h.session.getSnapshot().draft, "new draft");
  timeout = false; await h.session.retry(calls[0].body.clientRequestId);
  assert.equal(calls[1].body.clientRequestId, calls[0].body.clientRequestId);
  assert.deepEqual(h.durations, [30_000, 30_000]); h.session.dispose();
});

test("PUT timeout leaves the image retryable with a longer deadline and existing authorization", async () => {
  const calls = []; let timeout = true;
  const h = harness(async (path, init) => {
    calls.push(path);
    if (path === "https://upload.test/file") return timeout ? hang(init.signal) : new Response(null, { status: 200 });
    const body = JSON.parse(init.body);
    if (path.endsWith("/upload")) return ok({ url: "https://upload.test/file", headers: {}, receipt: "receipt", expiresAt: Date.now() + 3_600_000 });
    return ok(saved(body.clientRequestId));
  });
  await h.session.send([{ blob: new Blob(["image"]), width: 1, height: 1, bytes: 5, contentType: "image/png", hash: "a".repeat(64) }]);
  const pending = h.session.getSnapshot().pending[0]; assert.equal(pending.status, "failed");
  timeout = false; await h.session.retry(pending.clientRequestId);
  assert.equal(h.session.getSnapshot().pending.length, 0);
  assert.deepEqual(calls, ["/api/chat/images/upload", "https://upload.test/file", "https://upload.test/file", "/api/chat/images"]);
  assert.deepEqual(h.durations, [30_000, 300_000, 300_000, 30_000]); h.session.dispose();
});
