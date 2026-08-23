import assert from "node:assert/strict";
import test from "node:test";
import {
  playBandoriMediaElement,
  seekBandoriMediaElement,
} from "../src/lib/bandori/chart-simulator/media-seek.ts";

class FakeMediaElement extends EventTarget {
  #currentTime = 0;

  #resolvePlay = null;

  paused = true;
  duration = Number.NaN;
  ended = false;
  readyState = 3;
  seeking = false;

  get currentTime() {
    return this.#currentTime;
  }

  set currentTime(value) {
    this.#currentTime = value;
    this.seeking = true;
  }

  finishSeek(actualTime = this.#currentTime) {
    this.#currentTime = actualTime;
    this.seeking = false;
    this.dispatchEvent(new Event("seeked"));
  }

  dispatchStaleSeeked(actualTime) {
    this.#currentTime = actualTime;
    this.seeking = false;
    this.dispatchEvent(new Event("seeked"));
  }

  play() {
    this.paused = false;
    return new Promise((resolve) => {
      this.#resolvePlay = resolve;
    });
  }

  finishPlay(actualTime = this.#currentTime) {
    this.#currentTime = actualTime;
    this.#resolvePlay?.();
    this.#resolvePlay = null;
  }
}

test("media play waits for its own play request", async () => {
  const media = new FakeMediaElement();
  let isResolved = false;
  const pending = playBandoriMediaElement(media).then((value) => {
    isResolved = true;
    return value;
  });

  media.dispatchEvent(new Event("playing"));
  await Promise.resolve();
  assert.equal(isResolved, false);
  media.finishPlay(6.125);
  assert.equal(await pending, 6.125);
});

test("superseded media play requests abort without accepting late completion", async () => {
  const media = new FakeMediaElement();
  const controller = new AbortController();
  const pending = playBandoriMediaElement(media, controller.signal);
  controller.abort();
  media.finishPlay(3);
  await assert.rejects(pending, (error) => error?.name === "AbortError");
});

test("media play rejects ended or unbuffered completion", async () => {
  const endedMedia = new FakeMediaElement();
  const endedPending = playBandoriMediaElement(endedMedia);
  endedMedia.ended = true;
  endedMedia.finishPlay(9);
  await assert.rejects(endedPending, /without stable playback/u);

  const unbufferedMedia = new FakeMediaElement();
  const unbufferedPending = playBandoriMediaElement(unbufferedMedia);
  unbufferedMedia.readyState = 2;
  unbufferedMedia.finishPlay(4);
  await assert.rejects(unbufferedPending, /without stable playback/u);
});

test("media seek waits for the committed media position", async () => {
  const media = new FakeMediaElement();
  let isResolved = false;
  const pending = seekBandoriMediaElement(media, 12.5).then((value) => {
    isResolved = true;
    return value;
  });

  await Promise.resolve();
  assert.equal(isResolved, false);
  media.dispatchStaleSeeked(4);
  await Promise.resolve();
  assert.equal(isResolved, false);
  media.finishSeek(12.503);
  assert.equal(await pending, 12.503);
});

test("media seek resolves without an event when already positioned", async () => {
  const media = new FakeMediaElement();
  media.finishSeek(4);
  assert.equal(await seekBandoriMediaElement(media, 4), 4);
});

test("media seek accepts the resource duration when the requested metadata end is later", async () => {
  const media = new FakeMediaElement();
  media.duration = 9.9;
  const pending = seekBandoriMediaElement(media, 10);
  media.finishSeek(9.9);
  assert.equal(await pending, 9.9);
});

test("superseded media seeks abort without waiting for seeked", async () => {
  const media = new FakeMediaElement();
  const controller = new AbortController();
  const pending = seekBandoriMediaElement(media, 8, controller.signal);
  controller.abort();
  await assert.rejects(pending, (error) => error?.name === "AbortError");
});
