import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileBandoriChart } from "../src/lib/bandori/chart-simulator/compiler.ts";
import {
  BANDORI_NATIVE_LONG_KEEP_FADE_SECONDS,
  BANDORI_NATIVE_NOTE_SOUND_VOLUME,
  BANDORI_NATIVE_TAP_SE_SKIN,
  BANDORI_NATIVE_TAP_SE_SKINS,
  collectBandoriNativeNoteSoundEvents,
  createBandoriNativeNoteSoundTimeline,
  getBandoriNativeActiveNoteSoundLoops,
  getBandoriNativeNoteSoundCueUrls,
  getBandoriNativeTapSeCueBankId,
} from "../src/lib/bandori/chart-simulator/native-note-sound-presentation.ts";
import {
  BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS,
  createBandoriNativeAudioRuntime,
  getBandoriNativeNoteSoundContextTime,
  getBandoriNativeNoteSoundScheduleAheadMediaSeconds,
} from "../src/lib/bandori/chart-simulator/native-audio-runtime.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("skin00 remains the default while all four JP TapSE packs are selectable at 100 percent", () => {
  assert.deepEqual(BANDORI_NATIVE_TAP_SE_SKINS.map(({ id }) => id), [0, 1, 2, 3]);
  assert.equal(BANDORI_NATIVE_TAP_SE_SKIN.id, 0);
  assert.equal(BANDORI_NATIVE_NOTE_SOUND_VOLUME, 1);
  assert.deepEqual(getBandoriNativeNoteSoundCueUrls(BANDORI_NATIVE_TAP_SE_SKIN), {
    "directional-1": "/local/chart-simulator/sound/tapseskin/directionalflickskin00/DirectionalFlickSE/directional_fl.wav",
    "directional-2": "/local/chart-simulator/sound/tapseskin/directionalflickskin00/DirectionalFlickSE/directional_fl_2.wav",
    "directional-3": "/local/chart-simulator/sound/tapseskin/directionalflickskin00/DirectionalFlickSE/directional_fl_3.wav",
    flick: "/local/chart-simulator/sound/tapseskin/skin00/TapSE/flick.wav",
    "long-keep": "/local/chart-simulator/sound/tapseskin/skin00/TapSE/SE_RHYTHM_TAP_LONG.wav",
    perfect: "/local/chart-simulator/sound/tapseskin/skin00/TapSE/perfect.wav",
    skill: "/local/chart-simulator/sound/common/RhythmGameSE/SE_RHYTHM_TAP_SKILL.wav",
  });
  for (const skin of BANDORI_NATIVE_TAP_SE_SKINS) {
    assert.equal(getBandoriNativeTapSeCueBankId(skin), `tapse-skin0${skin.id}`);
    const urls = getBandoriNativeNoteSoundCueUrls(skin);
    assert.equal(urls.perfect, `/local/chart-simulator/sound/tapseskin/skin0${skin.id}/TapSE/perfect.wav`);
    assert.equal(urls.flick, `/local/chart-simulator/sound/tapseskin/skin0${skin.id}/TapSE/flick.wav`);
    assert.equal(urls["long-keep"], `/local/chart-simulator/sound/tapseskin/skin0${skin.id}/TapSE/SE_RHYTHM_TAP_LONG.wav`);
  }
});

test("AutoPerfect sound timeline maps point, skill, Directional, Long, and Slide lifecycles", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    { type: "Single", beat: 1, lane: 3 },
    { type: "Single", beat: 2, lane: 2, flick: true, skill: true },
    { type: "Directional", beat: 3, lane: 3, width: 1, direction: "Left" },
    { type: "Directional", beat: 4, lane: 2, width: 2, direction: "Right" },
    { type: "Directional", beat: 5, lane: 4, width: 3, direction: "Left" },
    {
      type: "Long",
      connections: [
        { beat: 6, lane: 0, skill: true },
        { beat: 8, lane: 0, flick: true },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 9, lane: 1 },
        { beat: 10, lane: 2, hidden: true },
        { beat: 11, lane: 3 },
        { beat: 12, lane: 3, width: 3, direction: "Right", flick: true },
      ],
    },
  ]);
  const timeline = createBandoriNativeNoteSoundTimeline(compiled);

  assert.deepEqual(
    timeline.events.map(({ action, cue, fadeSeconds, timeSeconds, voiceKey }) => ({
      action,
      cue,
      fadeSeconds,
      timeSeconds,
      voiceKey,
    })),
    [
      { action: "play-one-shot", cue: "perfect", fadeSeconds: 0, timeSeconds: 1, voiceKey: null },
      { action: "play-one-shot", cue: "flick", fadeSeconds: 0, timeSeconds: 2, voiceKey: null },
      { action: "play-one-shot", cue: "skill", fadeSeconds: 0, timeSeconds: 2, voiceKey: null },
      { action: "play-one-shot", cue: "directional-1", fadeSeconds: 0, timeSeconds: 3, voiceKey: null },
      { action: "play-one-shot", cue: "directional-2", fadeSeconds: 0, timeSeconds: 4, voiceKey: null },
      { action: "play-one-shot", cue: "directional-3", fadeSeconds: 0, timeSeconds: 5, voiceKey: null },
      { action: "start-loop", cue: "long-keep", fadeSeconds: 0, timeSeconds: 6, voiceKey: "ribbon:0" },
      { action: "play-one-shot", cue: "perfect", fadeSeconds: 0, timeSeconds: 6, voiceKey: null },
      { action: "play-one-shot", cue: "skill", fadeSeconds: 0, timeSeconds: 6, voiceKey: null },
      { action: "play-one-shot", cue: "flick", fadeSeconds: 0, timeSeconds: 8, voiceKey: null },
      { action: "stop-loop", cue: "long-keep", fadeSeconds: BANDORI_NATIVE_LONG_KEEP_FADE_SECONDS, timeSeconds: 8, voiceKey: "ribbon:0" },
      { action: "start-loop", cue: "long-keep", fadeSeconds: 0, timeSeconds: 9, voiceKey: "ribbon:1" },
      { action: "play-one-shot", cue: "perfect", fadeSeconds: 0, timeSeconds: 9, voiceKey: null },
      { action: "play-one-shot", cue: "perfect", fadeSeconds: 0, timeSeconds: 11, voiceKey: null },
      { action: "play-one-shot", cue: "directional-3", fadeSeconds: 0, timeSeconds: 12, voiceKey: null },
      { action: "stop-loop", cue: "long-keep", fadeSeconds: BANDORI_NATIVE_LONG_KEEP_FADE_SECONDS, timeSeconds: 12, voiceKey: "ribbon:1" },
    ],
  );
  assert.equal(timeline.events.some(({ timeSeconds }) => timeSeconds === 10), false);
  assert.deepEqual(
    collectBandoriNativeNoteSoundEvents(timeline, 1.5, 3.1).map(({ cue }) => cue),
    ["flick", "skill", "directional-1"],
  );
  assert.deepEqual(getBandoriNativeActiveNoteSoundLoops(timeline, 7), [{
    cue: "long-keep",
    endTimeSeconds: 8,
    offsetSeconds: 1,
    startTimeSeconds: 6,
    voiceKey: "ribbon:0",
  }]);
  assert.deepEqual(getBandoriNativeActiveNoteSoundLoops(timeline, 8), []);
  assert.deepEqual(getBandoriNativeActiveNoteSoundLoops(timeline, 10), [{
    cue: "long-keep",
    endTimeSeconds: 12,
    offsetSeconds: 1,
    startTimeSeconds: 9,
    voiceKey: "ribbon:1",
  }]);
});

test("Directional widths 3 through 7 share the third JP cue", () => {
  const timeline = createBandoriNativeNoteSoundTimeline(compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    { type: "Directional", beat: 1, lane: 0, width: 3, direction: "Right" },
    { type: "Directional", beat: 2, lane: 0, width: 4, direction: "Right" },
    { type: "Directional", beat: 3, lane: 0, width: 5, direction: "Right" },
    { type: "Directional", beat: 4, lane: 0, width: 6, direction: "Right" },
    { type: "Directional", beat: 5, lane: 0, width: 7, direction: "Right" },
  ]));

  assert.deepEqual(
    timeline.events.map(({ cue, timeSeconds }) => ({ cue, timeSeconds })),
    [1, 2, 3, 4, 5].map((timeSeconds) => ({
      cue: "directional-3",
      timeSeconds,
    })),
  );
});

test("same-position base cues coalesce while different cues stay polyphonic", () => {
  const timeline = createBandoriNativeNoteSoundTimeline(compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    { type: "Single", beat: 1, lane: 0 },
    { type: "Single", beat: 1, lane: 6 },
    { type: "Single", beat: 1, lane: 2, flick: true },
  ]));
  assert.deepEqual(timeline.events.map(({ cue }) => cue), ["perfect", "flick"]);
});

test("future note sounds use exact shared AudioContext timestamps without a manual offset", () => {
  assert.equal(BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS, 0.1);
  assert.equal(getBandoriNativeNoteSoundScheduleAheadMediaSeconds(0, 0.5), 0.05);
  assert.ok(Math.abs(
    getBandoriNativeNoteSoundScheduleAheadMediaSeconds(0.2, 0.5) - 0.15,
  ) < 1e-12);
  assert.ok(Math.abs(
    getBandoriNativeNoteSoundScheduleAheadMediaSeconds(0.2, 1) - 0.3,
  ) < 1e-12);
  assert.equal(getBandoriNativeNoteSoundContextTime(20, 7.25, 7.33, 1), 20.08);
  assert.equal(getBandoriNativeNoteSoundContextTime(20, 7.25, 7.33, 0.5), 20.16);
  assert.equal(getBandoriNativeNoteSoundContextTime(20, 7.25, 7.2, 0.5), 20);
  assert.throws(
    () => getBandoriNativeNoteSoundContextTime(20, Number.NaN, 7.2, 1),
    /schedule times and playback rate must be valid/u,
  );
  assert.throws(
    () => getBandoriNativeNoteSoundContextTime(20, 7.25, 7.2, 0),
    /schedule times and playback rate must be valid/u,
  );
  assert.throws(
    () => getBandoriNativeNoteSoundScheduleAheadMediaSeconds(-0.1, 1),
    /look-ahead values must be valid/u,
  );
});

test("the shared AudioContext uses the output clock while render time owns continuation", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  class FakeBufferSource {
    buffer = null;
    connectCalls = [];
    disconnectCalls = 0;
    loop = false;
    onended = null;
    playbackRate = {
      calls: [],
      setValueAtTime: (value, when) => {
        this.playbackRate.calls.push([value, when]);
      },
    };
    startCalls = [];
    stopCalls = 0;
    stopCallTimes = [];

    connect(destination) {
      this.connectCalls.push(destination);
    }

    disconnect() {
      this.disconnectCalls += 1;
    }

    start(...args) {
      this.startCalls.push(args);
    }

    stop(...args) {
      this.stopCalls += 1;
      this.stopCallTimes.push(args);
    }
  }

  class FakeAudioContext extends EventTarget {
    static created = null;

    baseLatency = 0.1;
    closeCalls = 0;
    currentTime = 12;
    decodeCalls = 0;
    destination = {};
    outputContextTime = 11.6;
    outputLatency = 0.3;
    resumeCalls = 0;
    sources = [];
    state = "suspended";

    constructor() {
      super();
      FakeAudioContext.created = this;
    }

    close() {
      this.closeCalls += 1;
      this.state = "closed";
      return Promise.resolve();
    }

    createGain() {
      return {
        connect() {},
        gain: {
          cancelScheduledValues() {},
          linearRampToValueAtTime() {},
          setValueAtTime() {},
          value: 0,
        },
      };
    }

    createBufferSource() {
      const source = new FakeBufferSource();
      this.sources.push(source);
      return source;
    }

    decodeAudioData() {
      this.decodeCalls += 1;
      return Promise.resolve({ duration: 120 });
    }

    getOutputTimestamp() {
      return { contextTime: this.outputContextTime, performanceTime: 0 };
    }

    resume() {
      this.resumeCalls += 1;
      this.state = "running";
      this.dispatchEvent(new Event("statechange"));
      return Promise.resolve();
    }

  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  const fetchCalls = [];
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (url, options) => {
      fetchCalls.push([url, options]);
      return {
        arrayBuffer: async () => new ArrayBuffer(8),
        ok: true,
      };
    },
  });
  try {
    const cueBank = {
      cueUrls: getBandoriNativeNoteSoundCueUrls(BANDORI_NATIVE_TAP_SE_SKIN),
      id: "test",
    };
    const runtime = createBandoriNativeAudioRuntime([cueBank], cueBank.id, 1);
    assert.equal(runtime.getContextState(), null);
    assert.equal(runtime.isMusicPrepared, false);
    assert.equal(runtime.isMusicPlaying, false);
    const contextStates = [];
    let musicEndedCount = 0;
    const unsubscribeContextState = runtime.subscribeContextState(
      (state) => contextStates.push(state),
    );
    const unsubscribeMusicEnded = runtime.subscribeMusicEnded(() => {
      musicEndedCount += 1;
    });

    const controller = new AbortController();
    await runtime.prepareMusic("https://cdn.example/song.mp3", controller.signal);
    assert.equal(runtime.isMusicPrepared, true);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0][0], "https://cdn.example/song.mp3");
    assert.equal(fetchCalls[0][1].cache, "force-cache");
    assert.equal(fetchCalls[0][1].credentials, "omit");
    assert.equal(fetchCalls[0][1].signal, controller.signal);
    const loadedCueUrls = [];
    await runtime.prepareCueBank(cueBank, (url) => loadedCueUrls.push(url));
    assert.deepEqual(
      new Set(loadedCueUrls),
      new Set(Object.values(cueBank.cueUrls)),
    );
    const cachedCueUrls = [];
    await runtime.prepareCueBank(cueBank, (url) => cachedCueUrls.push(url));
    assert.deepEqual(
      new Set(cachedCueUrls),
      new Set(Object.values(cueBank.cueUrls)),
    );
    await runtime.resume();
    const context = FakeAudioContext.created;
    assert.ok(context);
    assert.equal(context.decodeCalls, 8);
    assert.equal(context.resumeCalls, 1);
    assert.equal(runtime.getContextState(), "running");
    assert.deepEqual(contextStates, ["suspended", "running"]);

    await assert.rejects(
      runtime.startMusic(Number.NaN, 1),
      /music offset must be finite/u,
    );
    await assert.rejects(
      runtime.startMusic(0, 1.01),
      /at most 1/u,
    );
    assert.deepEqual(await runtime.startMusic(30, 1), {
      contextTimeSeconds: 12,
      effectiveBackend: "native",
      latencySeconds: 0,
      mediaTimeSeconds: 30,
    });
    const firstSource = context.sources[0];
    assert.deepEqual(firstSource.startCalls, [[12, 30]]);
    assert.deepEqual(firstSource.playbackRate.calls, [[1, 12]]);
    assert.deepEqual(firstSource.connectCalls, [context.destination]);
    context.currentTime = 13;
    context.outputContextTime = 12.6;
    assert.ok(Math.abs(runtime.getMusicTime() - 30.6) < 1e-12);
    assert.ok(Math.abs(
      runtime.getNoteSoundScheduleAheadMediaSeconds(1) - 0.5,
    ) < 1e-12);
    runtime.dispatch([{
      action: "play-one-shot",
      cue: "perfect",
      fadeSeconds: 0,
      timeSeconds: 31,
      voiceKey: null,
    }], 30.6, 1);
    const scheduledNoteSource = context.sources[1];
    assert.deepEqual(scheduledNoteSource.startCalls, [[13]]);
    context.currentTime = 16;
    context.outputContextTime = 15.6;
    assert.ok(Math.abs(runtime.getMusicTime() - 33.6) < 1e-12);
    const firstEnded = firstSource.onended;
    assert.equal(runtime.pauseMusic(), 34);
    assert.equal(firstSource.stopCalls, 1);
    assert.deepEqual(firstSource.stopCallTimes, [[16]]);
    assert.equal(runtime.isMusicPlaying, true);
    assert.equal(runtime.isMusicPresentationTransitioning, true);
    firstEnded?.();
    assert.equal(musicEndedCount, 0);
    assert.ok(Math.abs(runtime.getMusicTime() - 33.6) < 1e-12);
    assert.equal(runtime.pauseMusic(), 34);
    assert.equal(runtime.isMusicPresentationTransitioning, true);
    assert.ok(Math.abs(runtime.getMusicTime() - 33.6) < 1e-12);
    context.outputContextTime = 15.8;
    assert.ok(Math.abs(runtime.getMusicTime() - 33.8) < 1e-12);
    context.outputContextTime = 15.999;
    assert.ok(Math.abs(runtime.getMusicTime() - 33.999) < 1e-12);
    context.outputContextTime = 16;
    assert.equal(runtime.getMusicTime(), 34);
    assert.equal(context.state, "running");

    const supersededStart = runtime.startMusic(40, 1);
    const latestStart = runtime.startMusic(50, 1);
    assert.equal(context.sources.length, 2);
    await assert.rejects(supersededStart, /superseded/u);
    assert.equal((await latestStart).mediaTimeSeconds, 50);
    assert.equal(runtime.isMusicPresentationTransitioning, false);
    const staleSource = context.sources.at(-1);
    const staleEnded = staleSource.onended;
    assert.equal((await runtime.startMusic(60, 1)).mediaTimeSeconds, 60);
    const finalSource = context.sources.at(-1);
    staleEnded?.();
    assert.equal(runtime.isMusicPlaying, true);
    assert.equal(runtime.getMusicTime(), 60);
    assert.equal(musicEndedCount, 0);
    context.currentTime = 76;
    context.outputContextTime = 75.6;
    finalSource.onended?.();
    assert.equal(runtime.isMusicPlaying, true);
    assert.ok(Math.abs(runtime.getMusicTime() - 119.6) < 1e-12);
    assert.equal(musicEndedCount, 0);
    context.outputContextTime = 76;
    assert.equal(runtime.getMusicTime(), 120);
    assert.equal(runtime.isMusicPlaying, false);
    assert.equal(musicEndedCount, 1);

    context.getOutputTimestamp = undefined;
    context.currentTime = 100;
    assert.equal((await runtime.startMusic(10, 1)).mediaTimeSeconds, 10);
    assert.equal(runtime.getMusicTime(), 10);
    context.currentTime = 100.5;
    assert.ok(Math.abs(runtime.getMusicTime() - 10.1) < 1e-12);
    assert.ok(Math.abs(runtime.pauseMusic() - 10.5) < 1e-12);

    await runtime.resume();
    assert.equal(context.resumeCalls, 1);

    context.state = "interrupted";
    context.dispatchEvent(new Event("statechange"));
    assert.deepEqual(contextStates, ["suspended", "running", "interrupted"]);
    await runtime.resume();
    assert.equal(context.resumeCalls, 2);
    assert.deepEqual(
      contextStates,
      ["suspended", "running", "interrupted", "running"],
    );
    unsubscribeContextState();
    unsubscribeMusicEnded();

    runtime.dispose();
    assert.equal(context.closeCalls, 1);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete globalThis.window;
    }
    if (originalFetch) {
      Object.defineProperty(globalThis, "fetch", originalFetch);
    } else {
      delete globalThis.fetch;
    }
  }
});

test("unsupported multi-lane point coverage cannot emit hidden audio", () => {
  const timeline = createBandoriNativeNoteSoundTimeline(compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    { type: "Single", beat: 1, lane: 1, lanes: [1, 2] },
  ]));
  assert.deepEqual(timeline.events, []);
  assert.deepEqual(timeline.loops, []);
});

test("the simulator owns one shared music and polyphonic Note SE AudioContext", async () => {
  const [runtime, pageRuntime] = await Promise.all([
    read("../src/lib/bandori/chart-simulator/native-audio-runtime.ts"),
    read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx"),
  ]);
  assert.match(runtime, /activeSources = new Set<AudioBufferSourceNode>/u);
  assert.match(runtime, /activeLoops = new Map<string, ActiveLoop>/u);
  assert.match(runtime, /buffersByCueBank/u);
  assert.match(runtime, /buffersByCueBank\.has\(this\.activeCueBankId\)/u);
  assert.match(runtime, /prepareCueBank\([\s\S]*cueBank/u);
  assert.match(runtime, /selectCueBank\(cueBankId/u);
  assert.match(runtime, /prepareMusic\(url: string, signal\?: AbortSignal\)/u);
  assert.match(runtime, /source\.connect\(context\.destination\)/u);
  assert.match(runtime, /source\.start\(contextStartTimeSeconds, startTimeSeconds\)/u);
  assert.match(runtime, /activeMusic\.contextStartTimeSeconds/u);
  assert.match(runtime, /activeMusic\.mediaStartTimeSeconds/u);
  assert.match(runtime, /activeMusic\.playbackRate/u);
  assert.match(runtime, /this\.activeMusic\?\.token !== token/u);
  assert.match(runtime, /subscribeMusicEnded\(listener/u);
  assert.doesNotMatch(runtime, /createMediaElementSource|MediaElementAudioSourceNode/u);
  assert.match(runtime, /source\.start\(when\)/u);
  assert.match(runtime, /linearRampToValueAtTime\(0, startTime \+ fade\)/u);
  assert.doesNotMatch(runtime, /context\.suspend\(\)/u);
  assert.match(runtime, /pauseMusic\(\): number/u);
  assert.match(runtime, /waitForMusicPresentationTail/u);
  assert.match(runtime, /isMusicPresentationTransitioning/u);
  assert.doesNotMatch(pageRuntime, /<audio|crossOrigin="anonymous"/u);
  assert.match(pageRuntime, /runtime\.getNoteSoundScheduleAheadMediaSeconds\(currentPlaybackRate\)/u);
  assert.doesNotMatch(pageRuntime, /musicPlaybackBackendRef|setMusicPlaybackRate/u);
  assert.match(pageRuntime, /runtime\.pauseMusic\(\)/u);
  assert.match(pageRuntime, /await runtime\.startMusic/u);
  assert.doesNotMatch(pageRuntime, /preservesPitch/u);
  assert.match(runtime, /source\.playbackRate\.setValueAtTime/u);
  assert.match(pageRuntime, /createResolvedNoteSoundCueBank/u);
  assert.match(pageRuntime, /runtime\.prepareCueBank\(cueBank, \(url\) =>/u);
  assert.match(pageRuntime, /runtime\.prepareMusic\(audioUrl, controller\.signal\)/u);
  assert.doesNotMatch(pageRuntime, /NOTE_SOUND_CUE_BANKS/u);
  assert.match(pageRuntime, /requestAnimationFrame\(updatePlayback\)/u);
  assert.match(pageRuntime, /getBandoriNativeActiveNoteSoundLoops/u);
  assert.doesNotMatch(pageRuntime, /playSoundEffect/u);
});
