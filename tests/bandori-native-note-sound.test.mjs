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
  getBandoriNativeNoteSoundContextTime,
} from "../src/lib/bandori/chart-simulator/native-note-sound-runtime.ts";

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
});

test("unsupported multi-lane point coverage cannot emit hidden audio", () => {
  const timeline = createBandoriNativeNoteSoundTimeline(compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    { type: "Single", beat: 1, lane: 1, lanes: [1, 2] },
  ]));
  assert.deepEqual(timeline.events, []);
  assert.deepEqual(timeline.loops, []);
});

test("the simulator owns a polyphonic runtime instead of the monophonic shared helper", async () => {
  const [runtime, pageRuntime] = await Promise.all([
    read("../src/lib/bandori/chart-simulator/native-note-sound-runtime.ts"),
    read("../src/app/[locale]/bandori/songs/[songId]/ChartSimulatorRuntime.tsx"),
  ]);
  assert.match(runtime, /activeSources = new Set<AudioBufferSourceNode>/u);
  assert.match(runtime, /activeLoops = new Map<string, ActiveLoop>/u);
  assert.match(runtime, /buffersByCueBank/u);
  assert.match(runtime, /buffersByCueBank\.has\(this\.activeCueBankId\)/u);
  assert.match(runtime, /prepareCueBank\(cueBank/u);
  assert.match(runtime, /selectCueBank\(cueBankId/u);
  assert.match(runtime, /createMediaElementSource\(mediaElement\)/u);
  assert.match(runtime, /source\.start\(when\)/u);
  assert.match(runtime, /linearRampToValueAtTime\(0, startTime \+ fade\)/u);
  assert.match(runtime, /context\.suspend\(\)/u);
  assert.match(pageRuntime, /crossOrigin="anonymous"/u);
  assert.match(pageRuntime, /BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS/u);
  assert.match(pageRuntime, /BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS \* currentPlaybackRate/u);
  assert.match(pageRuntime, /audio\.playbackRate = playbackRate/u);
  assert.match(pageRuntime, /audio\.preservesPitch = true/u);
  assert.doesNotMatch(runtime, /source\.playbackRate/u);
  assert.match(pageRuntime, /createResolvedNoteSoundCueBank/u);
  assert.match(pageRuntime, /runtime\.prepareCueBank\(cueBank\)/u);
  assert.doesNotMatch(pageRuntime, /NOTE_SOUND_CUE_BANKS/u);
  assert.match(pageRuntime, /requestAnimationFrame\(updateNoteSounds\)/u);
  assert.match(pageRuntime, /getBandoriNativeActiveNoteSoundLoops/u);
  assert.doesNotMatch(pageRuntime, /playSoundEffect/u);
});
