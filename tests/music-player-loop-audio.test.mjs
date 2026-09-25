import assert from "node:assert/strict";
import test from "node:test";
import {
  createMusicPlayerLoopAudio,
  getMusicLoopPosition,
  primeMusicPlayerLoopAudio,
  shouldLoopMusicAtPosition,
} from "../src/lib/music-player-loop-audio.ts";

const LOOP = { startSeconds: 2, endSeconds: 6 };

test("loop clock plays the intro once and wraps only within the loop", () => {
  assert.equal(getMusicLoopPosition(0, 5, 10, LOOP, true), 5);
  assert.equal(getMusicLoopPosition(0, 6, 10, LOOP, true), 2);
  assert.equal(getMusicLoopPosition(0, 10, 10, LOOP, true), 2);
  assert.equal(getMusicLoopPosition(3, 4, 10, LOOP, false), 7);
  assert.equal(shouldLoopMusicAtPosition(true, 5, LOOP), true);
  assert.equal(shouldLoopMusicAtPosition(true, 6, LOOP), false);
});

test("late repeat and seeks past the loop end finish the tail before restarting", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const contexts = [];
  let fetchCount = 0;
  class FakeAudioContext {
    constructor() {
      this.state = "suspended";
      this.currentTime = 0;
      this.destination = {};
      this.sources = [];
      contexts.push(this);
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
    createBufferSource() {
      const source = {
        loop: false,
        connect() {},
        disconnect() {},
        start(_when, offset) { this.startedAt = offset; },
        stop() {},
      };
      this.sources.push(source);
      return source;
    }
    decodeAudioData() {
      return Promise.resolve({ duration: 10 });
    }
    close() {
      return Promise.resolve();
    }
  }
  globalThis.window = {
    AudioContext: FakeAudioContext,
    setInterval: () => 1,
    clearInterval() {},
  };
  globalThis.fetch = async () => {
    fetchCount += 1;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
  };

  let ended = 0;
  primeMusicPlayerLoopAudio();
  const audio = createMusicPlayerLoopAudio("https://example.com/test.wav", LOOP, () => {}, () => { ended += 1; });
  try {
    await audio.prepare();
    audio.start();
    const context = contexts[0];
    assert.equal(contexts.length, 1);
    assert.equal(context.sources[0].loop, false);

    context.currentTime = 7;
    audio.setRepeatOne(true);
    assert.equal(context.sources[0].loop, false);
    assert.equal(audio.getPosition(), 7);

    context.currentTime = 10;
    context.sources[0].onended();
    assert.equal(ended, 1);
    audio.start(true);
    assert.equal(context.sources[1].startedAt, 0);
    assert.equal(context.sources[1].loop, true);
    assert.equal(context.sources[1].loopStart, 2);
    assert.equal(context.sources[1].loopEnd, 6);

    context.currentTime = 14;
    assert.equal(audio.getPosition(), 4);
    audio.setRepeatOne(false);
    assert.equal(context.sources[1].loop, false);
    context.currentTime = 16;
    assert.equal(audio.getPosition(), 6);
    audio.pause();
    audio.start();
    assert.equal(context.sources[2].startedAt, 6);
    assert.equal(context.sources[2].loop, false);

    audio.seek(8);
    assert.equal(context.sources[3].startedAt, 8);
    assert.equal(context.sources[3].loop, false);
    await audio.prepare();
    assert.equal(fetchCount, 1);
  } finally {
    audio.dispose();
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});
