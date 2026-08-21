import assert from "node:assert/strict";
import test from "node:test";
import { seekBandoriMediaElement } from "../src/lib/bandori/chart-simulator/media-seek.ts";

class FakeMediaElement extends EventTarget {
  #currentTime = 0;

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
}

test("media seek waits for the committed media position", async () => {
  const media = new FakeMediaElement();
  let isResolved = false;
  const pending = seekBandoriMediaElement(media, 12.5).then((value) => {
    isResolved = true;
    return value;
  });

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

test("superseded media seeks abort without waiting for seeked", async () => {
  const media = new FakeMediaElement();
  const controller = new AbortController();
  const pending = seekBandoriMediaElement(media, 8, controller.signal);
  controller.abort();
  await assert.rejects(pending, (error) => error?.name === "AbortError");
});
