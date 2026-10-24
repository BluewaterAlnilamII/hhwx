import assert from "node:assert/strict";
import test from "node:test";
import { playSoundEffect, playIndependentSoundEffect, preloadSoundEffect, resumeSoundEffectAudio } from "../src/lib/sound-effect-audio.ts";

test("sound effects share only pending loads and release buffers after playback", async (t) => {
  const sources = [], fetches = [], contextInstances = [];
  let releaseFetch, decoded = 0, contexts = 0, resumes = 0, failOnce = true;
  class AudioContext {
    state = "suspended";
    destination = {};
    constructor() { contexts++; contextInstances.push(this); }
    async resume() { resumes++; this.state = "running"; }
    decodeAudioData(_bytes, resolve) { decoded++; resolve({ duration: 4 }); }
    createBufferSource() {
      const source = { started: false, stopped: false, disconnected: false, connect() {},
        disconnect() { this.disconnected = true; },
        start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } };
      sources.push(source); return source;
    }
  }
  const oldWindow = globalThis.window;
  globalThis.window = { AudioContext };
  t.after(() => { if (oldWindow) globalThis.window = oldWindow; else delete globalThis.window; });
  t.mock.method(globalThis, "fetch", async (url, init) => {
    fetches.push(url);
    assert.equal(init.cache, "force-cache", "browser HTTP caching remains enabled");
    if (url === "/delayed" || url === "/dedup") await new Promise(resolve => { releaseFetch = resolve; });
    if (url === "/retry" && failOnce) { failOnce = false; throw new Error("offline"); }
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  });
  await preloadSoundEffect("/voice");
  assert.equal(contexts, 0, "preloading does not open an audio context");
  assert.equal(decoded, 0, "preloading warms HTTP cache without decoding");
  await resumeSoundEffectAudio();
  const a = new AbortController(), b = new AbortController();
  const first = playIndependentSoundEffect("/voice", a.signal, Date.now() + 3000);
  const second = playIndependentSoundEffect("/voice", b.signal, Date.now() + 3000);
  await new Promise(setImmediate);
  assert.equal(sources.length, 2);
  assert.equal(fetches.filter(u => u === "/voice").length, 2, "playback reads HTTP cache, not retained preload bytes");
  assert.equal(decoded, 1, "concurrent playback shares the pending decode");
  assert.equal(sources[0].buffer, sources[1].buffer);
  a.abort(); await first;
  assert.equal(sources[0].stopped, true);
  assert.equal(sources[0].buffer, null);
  assert.equal(sources[1].stopped, false);
  assert.ok(sources[1].buffer, "stopping one source preserves the other playback");
  sources[1].onended(); await second;
  assert.equal(sources[1].buffer, null);

  await playSoundEffect("/voice"); const buffer = sources.at(-1).buffer;
  await playSoundEffect("/voice");
  assert.equal(decoded, 3, "later plays decode again rather than retaining completed buffers");
  assert.notEqual(sources.at(-1).buffer, buffer);
  assert.equal(sources[2].stopped, true, "comments retain single sound behavior");
  assert.equal(sources[2].buffer, null);
  sources[3].onended();
  assert.ok(sources.every(source => source.disconnected && source.buffer === null));

  const cancelled = new AbortController();
  const delayed = playIndependentSoundEffect("/delayed", cancelled.signal, Date.now() + 3000);
  cancelled.abort(); releaseFetch(); await delayed;
  assert.equal(sources.length, 4, "late load completion cannot resurrect cancelled audio");
  const beforeExpired = fetches.length;
  await playIndependentSoundEffect("/voice", new AbortController().signal, Date.now() - 1);
  assert.equal(fetches.length, beforeExpired, "expired events do not load audio");

  const pendingOne = preloadSoundEffect("/dedup");
  const pendingTwo = preloadSoundEffect("/dedup");
  const concurrentPlay = playSoundEffect("/dedup");
  releaseFetch(); await Promise.all([pendingOne, pendingTwo, concurrentPlay]);
  assert.equal(fetches.filter(u => u === "/dedup").length, 1, "preload and playback share an in-flight fetch");
  sources.at(-1).onended();
  const later = playSoundEffect("/dedup");
  releaseFetch(); await later;
  assert.equal(fetches.filter(u => u === "/dedup").length, 2, "settled raw bytes are not retained either");
  sources.at(-1).onended();
  await assert.rejects(preloadSoundEffect("/retry"), /offline/);
  await preloadSoundEffect("/retry");
  assert.equal(fetches.filter(u => u === "/retry").length, 2, "failed loads remain retryable");

  for (const play of [
    () => resumeSoundEffectAudio(),
    () => playSoundEffect("/voice"),
    () => playIndependentSoundEffect("/voice", new AbortController().signal, Date.now() + 3000),
  ]) {
    const before = resumes;
    contextInstances.at(-1).state = "interrupted";
    const playing = play(); await new Promise(setImmediate);
    assert.equal(contextInstances.at(-1).state, "running", "iOS interruptions are resumed without refreshing");
    assert.equal(resumes, before + 1);
    sources.at(-1)?.onended(); await playing;
  }
  const context = contextInstances.at(-1), originalResume = context.resume;
  let finishResume;
  context.state = "interrupted";
  context.resume = () => new Promise(resolve => { finishResume = () => { context.state = "running"; resolve(); }; });
  const beforeRecovery = sources.length;
  const recovering = playIndependentSoundEffect("/voice", new AbortController().signal, Date.now() + 3000);
  await new Promise(setImmediate);
  assert.equal(sources.length, beforeRecovery, "a cached voice waits for asynchronous audio recovery");
  finishResume(); await new Promise(setImmediate);
  assert.equal(sources.length, beforeRecovery + 1, "the current voice starts once recovery completes");
  sources.at(-1).onended(); await recovering;

  context.state = "interrupted";
  const abortRecovery = new AbortController();
  const cancelledRecovery = playIndependentSoundEffect("/voice", abortRecovery.signal, Date.now() + 3000);
  await new Promise(setImmediate); abortRecovery.abort(); await cancelledRecovery;
  finishResume(); await new Promise(setImmediate);
  assert.equal(sources.length, beforeRecovery + 1, "recovery cannot resurrect a replaced effect");

  context.state = "interrupted";
  context.resume = () => new Promise(() => {});
  const sourceCount = sources.length;
  await playIndependentSoundEffect("/voice", new AbortController().signal, Date.now() + 20);
  assert.equal(sources.length, sourceCount, "blocked resumption expires with the effect rather than queuing later audio");
  context.resume = originalResume;
  contextInstances.at(-1).state = "closed";
  await playSoundEffect("/voice");
  assert.equal(contexts, 2, "a closed context is replaced");
  sources.at(-1).onended();
  assert.ok(sources.every(source => source.disconnected && source.buffer === null));
});
