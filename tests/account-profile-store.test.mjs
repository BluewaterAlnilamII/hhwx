import assert from "node:assert/strict";
import test from "node:test";

import {
  AccountProfileRequestError,
  createAccountProfileStore,
} from "../src/lib/account-profile-store.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createProfile(overrides = {}) {
  return {
    userId: "user-1",
    publicUid: 10001,
    email: "user@example.test",
    emailVerified: true,
    username: "User",
    avatarCardId: 1,
    avatarCardServer: null,
    avatarCardTrainType: "normal",
    displayDegreeServer: 0,
    displayDegreeId: 100,
    displayDegreeEffectId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    roles: [],
    ...overrides,
  };
}

function profileResponse(profile, status = 200) {
  return new Response(JSON.stringify({
    success: true,
    data: profile,
  }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("same-user profile consumers share one request and reuse the ready value", async () => {
  const response = deferred();
  let fetchCount = 0;
  let tokenReadCount = 0;
  const store = createAccountProfileStore({
    getAccessToken: async () => {
      tokenReadCount += 1;
      return "access-token";
    },
    fetcher: async () => {
      fetchCount += 1;
      return response.promise;
    },
  });

  const first = store.getState().loadProfile("user-1");
  const second = store.getState().loadProfile("user-1");
  assert.equal(first, second);

  response.resolve(profileResponse(createProfile()));
  const profile = await first;
  assert.deepEqual(profile, createProfile());
  assert.equal(fetchCount, 1);
  assert.equal(tokenReadCount, 1);
  assert.equal(await store.getState().loadProfile("user-1"), profile);
  assert.equal(fetchCount, 1);
});

test("a profile mutation wins over an older GET response", async () => {
  const response = deferred();
  const store = createAccountProfileStore({
    getAccessToken: async () => "access-token",
    fetcher: async () => response.promise,
  });

  const staleRequest = store.getState().loadProfile("user-1");
  await Promise.resolve();
  const updatedProfile = createProfile({
    username: "Updated User",
    avatarCardId: 2212,
  });
  store.getState().setProfile(updatedProfile);

  response.resolve(profileResponse(createProfile({ username: "Stale User" })));
  await staleRequest;
  assert.deepEqual(store.getState().profile, updatedProfile);
  assert.equal(store.getState().status, "ready");
});

test("a failed force refresh retains the last-good profile", async () => {
  let attempt = 0;
  const profile = createProfile();
  const store = createAccountProfileStore({
    getAccessToken: async () => "access-token",
    fetcher: async () => {
      attempt += 1;
      if (attempt === 1) {
        return profileResponse(profile);
      }
      return new Response(JSON.stringify({
        success: false,
        error: { code: "UNAVAILABLE", message: "Unavailable" },
      }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await store.getState().loadProfile("user-1");
  await assert.rejects(
    store.getState().loadProfile("user-1", { force: true }),
    (error) => error instanceof AccountProfileRequestError && error.status === 503,
  );
  assert.deepEqual(store.getState().profile, profile);
  assert.equal(store.getState().status, "error");
});

test("clearing the store prevents an older request from restoring signed-out data", async () => {
  const response = deferred();
  const store = createAccountProfileStore({
    getAccessToken: async () => "access-token",
    fetcher: async () => response.promise,
  });

  const request = store.getState().loadProfile("user-1");
  await Promise.resolve();
  store.getState().clearProfile();
  response.resolve(profileResponse(createProfile()));
  await request;

  assert.deepEqual(store.getState(), {
    userId: null,
    profile: null,
    status: "idle",
    error: null,
    loadProfile: store.getState().loadProfile,
    setProfile: store.getState().setProfile,
    clearProfile: store.getState().clearProfile,
  });
});
