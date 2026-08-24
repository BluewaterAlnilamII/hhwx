import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BANDORI_MUSIC_DSP_PREPARATION_TIMEOUT_MS,
  SIGNALSMITH_PROCESSOR_URL,
  createSignalsmithSchedule,
  getBandoriMusicTimeAtContextTime,
} from "../src/lib/bandori/chart-simulator/music-playback-backends.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const sha256 = async (path) => createHash("sha256")
  .update(await readFile(new URL(path, import.meta.url)))
  .digest("hex");

test("the automatic hybrid pins one pitch-preserving Worklet", () => {
  assert.equal(
    SIGNALSMITH_PROCESSOR_URL,
    "/res/bandori/chart-simulator/signalsmith-stretch-1.3.2.mjs",
  );
  assert.equal(BANDORI_MUSIC_DSP_PREPARATION_TIMEOUT_MS, 10_000);
});

test("versioned Worklet artifacts remain byte-identical to the reviewed releases", async () => {
  assert.equal(
    await sha256("../public/res/bandori/chart-simulator/signalsmith-stretch-1.3.2.mjs"),
    "97530b11d5bc01015af4cde40d6aa55ff10c40aa1294ca4c8c5762027d517a46",
  );
  assert.equal(
    await sha256("../public/res/bandori/chart-simulator/signalsmith-stretch-1.3.2.LICENSE.txt"),
    "1b1f812698936b28100d07b8cb55ec22cf3ba7bf21a4db44c645d92b62ce1e09",
  );
});

test("a future output anchor freezes presentation before C0 and advances from one mapping", () => {
  const mapping = {
    contextStartTimeSeconds: 20,
    durationSeconds: 120,
    mediaStartTimeSeconds: 7.25,
    playbackRate: 0.5,
  };
  assert.equal(getBandoriMusicTimeAtContextTime({
    ...mapping,
    contextTimeSeconds: 19.8,
  }), 7.25);
  assert.equal(getBandoriMusicTimeAtContextTime({
    ...mapping,
    contextTimeSeconds: 20,
  }), 7.25);
  assert.equal(getBandoriMusicTimeAtContextTime({
    ...mapping,
    contextTimeSeconds: 22,
  }), 8.25);
  assert.equal(getBandoriMusicTimeAtContextTime({
    ...mapping,
    contextTimeSeconds: 300,
  }), 120);
  assert.throws(
    () => getBandoriMusicTimeAtContextTime({
      ...mapping,
      contextTimeSeconds: Number.NaN,
    }),
    /clock values must be valid/u,
  );
});

test("the Signalsmith schedule uses the documented future output anchor", () => {
  assert.deepEqual(createSignalsmithSchedule({
    active: true,
    input: 7.25,
    output: 20,
    rate: 0.5,
  }), {
    active: true,
    input: 7.25,
    output: 20,
    rate: 0.5,
    semitones: 0,
  });
  assert.deepEqual(createSignalsmithSchedule({
    active: false,
    output: 40,
  }), {
    active: false,
    output: 40,
    semitones: 0,
  });
});

test("Signalsmith stays browser-lazy, retains PCM, and prepares disconnected", async () => {
  const source = await read(
    "../src/lib/bandori/chart-simulator/music-playback-backends.ts",
  );
  assert.match(source, /await import\("signalsmith-stretch"\)/u);
  assert.match(source, /createStretch\.moduleUrl = SIGNALSMITH_PROCESSOR_URL/u);
  assert.match(source, /getChannelData\(channel\)\.slice\(\)/u);
  assert.match(source, /channels\.map\(\(channel\) => channel\.buffer\)/u);
  assert.match(source, /numberOfInputs: 1/u);
  assert.match(source, /Signalsmith did not retain the complete PCM buffer/u);
  assert.match(source, /waitForDspPreparation/u);
  assert.match(source, /"Signalsmith schedule"/u);
  assert.doesNotMatch(source, /SoundTouch|soundtouch|@soundtouchjs/u);
  const prepareStart = source.indexOf("export async function prepareSignalsmithPlayback");
  assert.ok(prepareStart >= 0);
  assert.doesNotMatch(source.slice(prepareStart), /node\.connect\(context\.destination\)/u);
});

test("runtime selects automatically and fences then disconnects inactive Signalsmith", async () => {
  const source = await read(
    "../src/lib/bandori/chart-simulator/native-audio-runtime.ts",
  );
  const stopStart = source.indexOf("private stopMusicAt");
  const signalsmithStart = source.indexOf("private async startSignalsmithMusic");
  const connectStart = source.indexOf("private connectSignalsmithPlayback");
  assert.ok(stopStart >= 0 && signalsmithStart > stopStart && connectStart > signalsmithStart);
  const stopBlock = source.slice(stopStart, signalsmithStart);
  assert.match(
    stopBlock,
    /this\.musicToken \+= 1;[\s\S]*stopPreparedSignalsmithAtCurrentTime\(contextStopTimeSeconds\)[\s\S]*activeMusic\?\.cleanup\(contextStopTimeSeconds\)[\s\S]*status: "ready"/u,
  );
  assert.match(
    stopBlock,
    /stopPreparedSignalsmithAtCurrentTime[\s\S]*scheduleSignalsmithPlayback[\s\S]*active: false[\s\S]*node\.disconnect\(\)[\s\S]*isSignalsmithConnected = false/u,
  );
  assert.match(
    stopBlock,
    /pendingSignalsmithInactiveFence[\s\S]*result\.then[\s\S]*releaseSignalsmithPlayback/u,
  );
  assert.doesNotMatch(stopBlock, /catch\(\(\) => undefined\)/u);
  const signalsmithBlock = source.slice(signalsmithStart, connectStart);
  assert.match(
    signalsmithBlock,
    /await this\.waitForSignalsmithInactiveFence[\s\S]*connectSignalsmithPlayback[\s\S]*scheduleSignalsmithPlayback[\s\S]*active: true[\s\S]*this\.musicToken !== token/u,
  );
  assert.doesNotMatch(signalsmithBlock, /active: false/u);
  assert.match(source, /if \(playbackRate !== 1\)[\s\S]*startSignalsmithMusic/u);
  assert.match(source, /return this\.startNativeMusic/u);
  assert.match(source, /startNativeMusic[\s\S]*this\.musicToken !== token[\s\S]*Native playback start was superseded/u);
  assert.match(source, /prepared\.node\.addEventListener\("processorerror", handleProcessorError\)/u);
  assert.match(source, /notifyMusicPlaybackError/u);
  assert.match(source, /waitForMusicPresentationTail/u);
  assert.match(source, /captureMusicPresentationTail/u);
  assert.match(source, /Promise\.all\(\[[\s\S]*ensureSignalsmithPlayback[\s\S]*waitForMusicPresentationTail/u);
  assert.match(source, /failedPrepared[\s\S]*releaseSignalsmithPlayback\(failedPrepared\)/u);
  assert.doesNotMatch(source, /SoundTouch|soundtouch|setMusicPlaybackRate/u);
  assert.match(
    source,
    /pauseMusic\(\): number \{[\s\S]*const contextStopTimeSeconds = this\.context\?\.currentTime[\s\S]*calculateMusicRenderTimeAt\(contextStopTimeSeconds\)[\s\S]*stopMusicAt\(timeSeconds, contextStopTimeSeconds\)/u,
  );
  assert.match(
    source,
    /captureMusicPresentationTail\([\s\S]*contextEndTimeSeconds: number[\s\S]*source\.stop\(contextStopTimeSeconds\)/u,
  );
});

test("exact Worklet releases retain LF bytes across Windows checkouts", async () => {
  const attributes = await read("../.gitattributes");
  assert.match(attributes, /signalsmith-stretch-1\.3\.2\.mjs text eol=lf/u);
  assert.match(attributes, /signalsmith-stretch-1\.3\.2\.LICENSE\.txt text eol=lf/u);
  assert.doesNotMatch(attributes, /soundtouch/u);
});
