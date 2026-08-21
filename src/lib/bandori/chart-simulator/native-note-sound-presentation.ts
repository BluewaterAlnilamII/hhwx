import {
  BANDORI_COMPILED_DIRECTION,
  BANDORI_COMPILED_NOTE_FLAG,
  BANDORI_COMPILED_NOTE_KIND,
  type CompiledBandoriChart,
} from "./compiler";
import {
  prepareBandoriNativeChartVisuals,
  upperBoundBandoriNoteTime,
} from "./native-note-presentation";

export type BandoriNativeTapSeSkinId = 0 | 1 | 2 | 3;

export type BandoriNativeNoteSoundCue =
  | "perfect"
  | "flick"
  | "directional-1"
  | "directional-2"
  | "directional-3"
  | "skill"
  | "long-keep";

export type BandoriNativeTapSeSkin = {
  readonly id: BandoriNativeTapSeSkinId;
  readonly cueUrls: Readonly<Pick<
    Record<BandoriNativeNoteSoundCue, string>,
    "perfect" | "flick" | "long-keep"
  >>;
};

export type BandoriNativeNoteSoundEvent = {
  readonly action: "play-one-shot" | "start-loop" | "stop-loop";
  readonly cue: BandoriNativeNoteSoundCue;
  readonly fadeSeconds: number;
  readonly noteIndex: number;
  readonly timeSeconds: number;
  readonly voiceKey: string | null;
};

export type BandoriNativeNoteSoundLoop = {
  readonly cue: "long-keep";
  readonly endTimeSeconds: number;
  readonly startTimeSeconds: number;
  readonly voiceKey: string;
};

export type BandoriNativeNoteSoundTimeline = {
  readonly events: readonly BandoriNativeNoteSoundEvent[];
  readonly eventTimes: Float64Array;
  readonly loops: readonly BandoriNativeNoteSoundLoop[];
};

const SOUND_ROOT = "/local/chart-simulator/sound";

function createTapSeSkin(id: BandoriNativeTapSeSkinId): BandoriNativeTapSeSkin {
  const directory = `${SOUND_ROOT}/tapseskin/skin0${id}/TapSE`;
  return {
    id,
    cueUrls: {
      flick: `${directory}/flick.wav`,
      "long-keep": `${directory}/SE_RHYTHM_TAP_LONG.wav`,
      perfect: `${directory}/perfect.wav`,
    },
  };
}

/**
 * The four JP TapSE packs are retained as data so a later approved selector
 * changes only this input. The current simulator intentionally fixes skin00.
 */
export const BANDORI_NATIVE_TAP_SE_SKINS = [
  createTapSeSkin(0),
  createTapSeSkin(1),
  createTapSeSkin(2),
  createTapSeSkin(3),
] as const;

export const BANDORI_NATIVE_TAP_SE_SKIN = BANDORI_NATIVE_TAP_SE_SKINS[0];
export const BANDORI_NATIVE_NOTE_SOUND_VOLUME = 1;
export const BANDORI_NATIVE_LONG_KEEP_FADE_SECONDS = 0.3000000119;

export function getBandoriNativeTapSeCueBankId(
  skin: BandoriNativeTapSeSkin,
): string {
  return `tapse-skin0${skin.id}`;
}

const DIRECTIONAL_CUE_URLS = {
  "directional-1": `${SOUND_ROOT}/tapseskin/directionalflickskin00/DirectionalFlickSE/directional_fl.wav`,
  "directional-2": `${SOUND_ROOT}/tapseskin/directionalflickskin00/DirectionalFlickSE/directional_fl_2.wav`,
  "directional-3": `${SOUND_ROOT}/tapseskin/directionalflickskin00/DirectionalFlickSE/directional_fl_3.wav`,
} as const;

const SKILL_CUE_URL = `${SOUND_ROOT}/common/RhythmGameSE/SE_RHYTHM_TAP_SKILL.wav`;

export function getBandoriNativeNoteSoundCueUrls(
  skin: BandoriNativeTapSeSkin = BANDORI_NATIVE_TAP_SE_SKIN,
): Readonly<Record<BandoriNativeNoteSoundCue, string>> {
  return {
    ...skin.cueUrls,
    ...DIRECTIONAL_CUE_URLS,
    skill: SKILL_CUE_URL,
  };
}

function directionalCue(width: number): BandoriNativeNoteSoundCue | null {
  if (width === 1) return "directional-1";
  if (width === 2) return "directional-2";
  if (width >= 3 && width <= 7) return "directional-3";
  return null;
}

function eventPriority(event: BandoriNativeNoteSoundEvent): number {
  if (event.action === "start-loop") return 0;
  if (event.action === "play-one-shot") return 1;
  return 2;
}

function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}

/**
 * Compiles only the approved JP AutoPerfect sound lifecycle. Point and ribbon
 * eligibility is shared with the visual whitelist, so unsupported chart data
 * cannot emit audio behind a failed-closed note presentation.
 */
export function createBandoriNativeNoteSoundTimeline(
  compiled: CompiledBandoriChart,
): BandoriNativeNoteSoundTimeline {
  const chartVisuals = prepareBandoriNativeChartVisuals(compiled, false);
  const supportedRibbonIndexes = new Set(
    chartVisuals.ribbons.map((ribbon) => ribbon.ribbonIndex),
  );
  const events: BandoriNativeNoteSoundEvent[] = [];
  const loops: BandoriNativeNoteSoundLoop[] = [];
  const emittedBaseCues = new Set<string>();

  const pushBaseCue = (
    cue: BandoriNativeNoteSoundCue,
    noteIndex: number,
    timeSeconds: number,
  ) => {
    // TapSEStatusData suppresses the same semantic at one absolute position.
    // Different cues remain polyphonic, and Skill is dispatched separately.
    const key = `${timeSeconds}:${cue}`;
    if (emittedBaseCues.has(key)) return;
    emittedBaseCues.add(key);
    events.push({
      action: "play-one-shot",
      cue,
      fadeSeconds: 0,
      noteIndex,
      timeSeconds,
      voiceKey: null,
    });
  };

  for (let noteIndex = 0; noteIndex < compiled.notes.times.length; noteIndex += 1) {
    const group = chartVisuals.notes[noteIndex];
    if (!group?.visuals[0]) continue;

    const kind = compiled.notes.kinds[noteIndex];
    const flags = compiled.notes.flags[noteIndex];
    const ribbonIndex = compiled.notes.ribbonIndexes[noteIndex];
    const timeSeconds = compiled.notes.times[noteIndex];
    const isRibbonNode = kind === BANDORI_COMPILED_NOTE_KIND.longStart
      || kind === BANDORI_COMPILED_NOTE_KIND.longEnd
      || kind === BANDORI_COMPILED_NOTE_KIND.slide;
    if (isRibbonNode && !supportedRibbonIndexes.has(ribbonIndex)) continue;

    const isRibbonStart = isRibbonNode
      && hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.ribbonStart);
    const isRibbonEnd = isRibbonNode
      && hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.ribbonEnd);
    const voiceKey = isRibbonNode ? `ribbon:${ribbonIndex}` : null;

    if (isRibbonStart && voiceKey) {
      events.push({
        action: "start-loop",
        cue: "long-keep",
        fadeSeconds: 0,
        noteIndex,
        timeSeconds,
        voiceKey,
      });
      loops.push({
        cue: "long-keep",
        endTimeSeconds: compiled.ribbons.endTimes[ribbonIndex],
        startTimeSeconds: compiled.ribbons.startTimes[ribbonIndex],
        voiceKey,
      });
    }

    const isDirectional = kind === BANDORI_COMPILED_NOTE_KIND.directional
      || (
        isRibbonEnd
        && compiled.notes.directions[noteIndex] !== BANDORI_COMPILED_DIRECTION.none
      );
    const baseCue = isDirectional
      ? directionalCue(compiled.notes.widths[noteIndex])
      : hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.flick)
        ? "flick"
        : "perfect";
    if (baseCue) pushBaseCue(baseCue, noteIndex, timeSeconds);

    const usesSkillCue = hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.skill)
      && (!isRibbonNode || isRibbonStart);
    if (usesSkillCue) {
      events.push({
        action: "play-one-shot",
        cue: "skill",
        fadeSeconds: 0,
        noteIndex,
        timeSeconds,
        voiceKey: null,
      });
    }

    if (isRibbonEnd && voiceKey) {
      events.push({
        action: "stop-loop",
        cue: "long-keep",
        fadeSeconds: BANDORI_NATIVE_LONG_KEEP_FADE_SECONDS,
        noteIndex,
        timeSeconds,
        voiceKey,
      });
    }
  }

  events.sort((left, right) => (
    left.timeSeconds - right.timeSeconds
    || eventPriority(left) - eventPriority(right)
    || left.noteIndex - right.noteIndex
    || left.cue.localeCompare(right.cue)
  ));
  loops.sort((left, right) => (
    left.startTimeSeconds - right.startTimeSeconds
    || left.voiceKey.localeCompare(right.voiceKey)
  ));
  return {
    events,
    eventTimes: Float64Array.from(events.map((event) => event.timeSeconds)),
    loops,
  };
}

export function collectBandoriNativeNoteSoundEvents(
  timeline: BandoriNativeNoteSoundTimeline,
  previousTimeSeconds: number,
  currentTimeSeconds: number,
): readonly BandoriNativeNoteSoundEvent[] {
  if (
    !Number.isFinite(previousTimeSeconds)
    || !Number.isFinite(currentTimeSeconds)
    || currentTimeSeconds <= previousTimeSeconds
  ) {
    return [];
  }
  const startIndex = upperBoundBandoriNoteTime(
    timeline.eventTimes,
    previousTimeSeconds,
  );
  const endIndex = upperBoundBandoriNoteTime(
    timeline.eventTimes,
    currentTimeSeconds,
  );
  return timeline.events.slice(startIndex, endIndex);
}

export function getBandoriNativeActiveNoteSoundLoops(
  timeline: BandoriNativeNoteSoundTimeline,
  timeSeconds: number,
): readonly (BandoriNativeNoteSoundLoop & { readonly offsetSeconds: number })[] {
  if (!Number.isFinite(timeSeconds)) return [];
  return timeline.loops.flatMap((loop) => (
    loop.startTimeSeconds <= timeSeconds && timeSeconds < loop.endTimeSeconds
      ? [{ ...loop, offsetSeconds: timeSeconds - loop.startTimeSeconds }]
      : []
  ));
}
