import assert from "node:assert/strict";
import test from "node:test";
import {
  claimAmbientBrowserAudioSession,
  createMusicPlaybackBrowserAudioSession,
  resetBrowserAudioSessionPolicy,
} from "../src/lib/browser-audio-session.ts";

test("music playback keeps priority over temporary ambient sounds", (context) => {
  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const audioSession = { type: "auto" };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { audioSession },
  });
  context.after(() => {
    resetBrowserAudioSessionPolicy();
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
  });

  const releaseAmbientSession = claimAmbientBrowserAudioSession();
  const musicSession = createMusicPlaybackBrowserAudioSession();
  assert.equal(audioSession.type, "ambient");

  musicSession.setActive(true);
  assert.equal(audioSession.type, "playback");

  releaseAmbientSession();
  assert.equal(audioSession.type, "playback");

  musicSession.setActive(false);
  assert.equal(audioSession.type, "auto");
});

test("playback owners cannot release each other's session", (context) => {
  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const audioSession = { type: "auto" };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { audioSession },
  });
  context.after(() => {
    resetBrowserAudioSessionPolicy();
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
  });

  const first = createMusicPlaybackBrowserAudioSession();
  const second = createMusicPlaybackBrowserAudioSession();
  first.setActive(true);
  second.setActive(true);
  first.release();
  assert.equal(audioSession.type, "playback");
  second.setActive(false);
  assert.equal(audioSession.type, "auto");
});

test("ambient claims restore the automatic session after the final release", (context) => {
  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const audioSession = { type: "auto" };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { audioSession },
  });
  context.after(() => {
    resetBrowserAudioSessionPolicy();
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
  });

  const releaseFirst = claimAmbientBrowserAudioSession();
  const releaseSecond = claimAmbientBrowserAudioSession();
  assert.equal(audioSession.type, "ambient");

  releaseFirst();
  assert.equal(audioSession.type, "ambient");

  releaseSecond();
  assert.equal(audioSession.type, "auto");
});
