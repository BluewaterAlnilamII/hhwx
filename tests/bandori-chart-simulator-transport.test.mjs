import assert from "node:assert/strict";
import test from "node:test";
import {
  beginBandoriChartScrub,
  commitBandoriChartScrub,
  createBandoriChartTransportState,
  getBandoriChartPresentationTime,
  jumpBandoriChartTransport,
  pauseBandoriChartTransport,
  playBandoriChartTransport,
  previewBandoriChartScrub,
  restartBandoriChartTransport,
  syncBandoriChartMediaTime,
} from "../src/lib/bandori/chart-simulator/transport.ts";
import {
  adjustBandoriSimulatorPlaybackRate,
  BANDORI_SIMULATOR_PLAYBACK_RATE_DEFAULT_HUNDREDTHS,
  BANDORI_SIMULATOR_PLAYBACK_RATE_MAX_HUNDREDTHS,
  BANDORI_SIMULATOR_PLAYBACK_RATE_MIN_HUNDREDTHS,
  getBandoriSimulatorNoteApproachTimeScale,
  getBandoriSimulatorPlaybackRate,
} from "../src/lib/bandori/chart-simulator/playback-rate.ts";

test("approved slow-play control uses integer hundredths and stops at its boundaries", () => {
  assert.equal(BANDORI_SIMULATOR_PLAYBACK_RATE_MIN_HUNDREDTHS, 50);
  assert.equal(BANDORI_SIMULATOR_PLAYBACK_RATE_MAX_HUNDREDTHS, 100);
  assert.equal(BANDORI_SIMULATOR_PLAYBACK_RATE_DEFAULT_HUNDREDTHS, 100);
  assert.equal(getBandoriSimulatorPlaybackRate(50), 0.5);
  assert.equal(getBandoriSimulatorPlaybackRate(100), 1);
  assert.equal(getBandoriSimulatorNoteApproachTimeScale(50), 0.5);
  assert.equal(getBandoriSimulatorNoteApproachTimeScale(100), 1);
  assert.equal(adjustBandoriSimulatorPlaybackRate(100, -10), 90);
  assert.equal(adjustBandoriSimulatorPlaybackRate(90, -1), 89);
  assert.equal(adjustBandoriSimulatorPlaybackRate(99, 10), 100);
  assert.equal(adjustBandoriSimulatorPlaybackRate(51, -10), 50);
  assert.equal(adjustBandoriSimulatorPlaybackRate(50, -1), 50);
  assert.equal(adjustBandoriSimulatorPlaybackRate(100, 1), 100);
  assert.throws(() => adjustBandoriSimulatorPlaybackRate(80, 5), RangeError);
  assert.throws(() => getBandoriSimulatorPlaybackRate(49), RangeError);
});

test("audio-owned transport advances only while playing and ends at the duration", () => {
  const ready = createBandoriChartTransportState(30);
  assert.equal(syncBandoriChartMediaTime(ready, 5), ready);

  const playing = playBandoriChartTransport(ready);
  const advanced = syncBandoriChartMediaTime(playing, 12.5);
  assert.equal(advanced.phase, "playing");
  assert.equal(advanced.currentTimeSeconds, 12.5);

  const ended = syncBandoriChartMediaTime(advanced, 35);
  assert.equal(ended.phase, "ended");
  assert.equal(ended.currentTimeSeconds, 30);
  assert.equal(playBandoriChartTransport(ended).currentTimeSeconds, 0);
});

test("scrubbing previews separately and resumes only when playback was active", () => {
  const playing = syncBandoriChartMediaTime(
    playBandoriChartTransport(createBandoriChartTransportState(20)),
    4,
  );
  const scrubbing = previewBandoriChartScrub(beginBandoriChartScrub(playing), 13);
  assert.equal(scrubbing.currentTimeSeconds, 4);
  assert.equal(getBandoriChartPresentationTime(scrubbing), 13);
  const committed = commitBandoriChartScrub(scrubbing);
  assert.equal(committed.phase, "playing");
  assert.equal(committed.currentTimeSeconds, 13);

  const pausedScrub = previewBandoriChartScrub(
    beginBandoriChartScrub(pauseBandoriChartTransport(committed)),
    20,
  );
  const pausedCommit = commitBandoriChartScrub(pausedScrub);
  assert.equal(pausedCommit.phase, "ended");
  assert.equal(pausedCommit.currentTimeSeconds, 20);
});

test("fixed jumps clamp and restart preserves active playback intent", () => {
  const playing = syncBandoriChartMediaTime(
    playBandoriChartTransport(createBandoriChartTransportState(9)),
    6,
  );
  assert.equal(jumpBandoriChartTransport(playing, 5).phase, "ended");
  assert.equal(jumpBandoriChartTransport(playing, -5).currentTimeSeconds, 1);

  const restartedPlaying = restartBandoriChartTransport(playing);
  assert.equal(restartedPlaying.phase, "playing");
  assert.equal(restartedPlaying.currentTimeSeconds, 0);
  const restartedPaused = restartBandoriChartTransport(pauseBandoriChartTransport(playing));
  assert.equal(restartedPaused.phase, "ready");
});

test("pause, scrub, and jump snapshot the exact media clock before changing state", () => {
  const staleTransport = syncBandoriChartMediaTime(
    playBandoriChartTransport(createBandoriChartTransportState(20)),
    4,
  );
  const exactTransport = syncBandoriChartMediaTime(staleTransport, 4.437);

  const paused = pauseBandoriChartTransport(exactTransport);
  assert.equal(paused.currentTimeSeconds, 4.437);
  assert.equal(getBandoriChartPresentationTime(paused), 4.437);

  const scrubbing = beginBandoriChartScrub(exactTransport);
  assert.equal(scrubbing.previewTimeSeconds, 4.437);
  assert.equal(scrubbing.shouldResumeAfterInteraction, true);

  const jumped = jumpBandoriChartTransport(exactTransport, 5);
  assert.ok(Math.abs(jumped.currentTimeSeconds - 9.437) < 1e-12);
  assert.equal(jumped.phase, "playing");
});
