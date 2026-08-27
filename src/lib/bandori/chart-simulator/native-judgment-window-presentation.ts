import {
  BANDORI_COMPILED_DIRECTION,
  BANDORI_COMPILED_NOTE_FLAG,
  BANDORI_COMPILED_NOTE_KIND,
  getBandoriCompiledTimeAtBeat,
  type CompiledBandoriChart,
} from "./compiler";
import {
  BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  BandoriNativeNoteContractError,
  getBandoriSimulatorNoteArrivalSeconds,
  type BandoriNativeChartVisuals,
  type BandoriNativeNoteVisualGroup,
} from "./native-note-presentation";
import { roundNonNegativeMidpointToEven } from "./numeric";

export const BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS = Math.fround(1 / 60);
export const BANDORI_NATIVE_STANDARD_PERFECT_BOUNDARY_SECONDS =
  2.5 * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS;
export const BANDORI_NATIVE_STANDARD_GREAT_BOUNDARY_SECONDS =
  5.5 * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS;
export const BANDORI_NATIVE_LONG_RELEASE_PERFECT_BOUNDARY_SECONDS =
  3.5 * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS;
export const BANDORI_NATIVE_LONG_RELEASE_GREAT_BOUNDARY_SECONDS =
  6.5 * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS;
export const BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS = Math.fround(13 / 60);
export const BANDORI_NATIVE_SLIDE_FLICK_SLOW_TIMEOUT_SECONDS = Math.fround(7 / 60);
export const BANDORI_NATIVE_JUDGMENT_ADJUST_VALUE_B = 0;
export const BANDORI_SLIDE_JUDGMENT_FRAME_CORRECTION_DEFAULT_TENTHS = 5;
export const BANDORI_SLIDE_JUDGMENT_FRAME_CORRECTION_OPTIONS = [
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
] as const;

export type BandoriSlideJudgmentFrameCorrectionTenths =
  (typeof BANDORI_SLIDE_JUDGMENT_FRAME_CORRECTION_OPTIONS)[number];

export function isBandoriSlideJudgmentFrameCorrectionTenths(
  value: unknown,
): value is BandoriSlideJudgmentFrameCorrectionTenths {
  return typeof value === "number"
    && BANDORI_SLIDE_JUDGMENT_FRAME_CORRECTION_OPTIONS.some(
      (option) => option === value,
    );
}

export type BandoriNativeStandardJudgmentResult =
  | "perfect"
  | "great"
  | "good"
  | "bad"
  | "none";

export type BandoriNativeJudgmentWindowTimingKind =
  | "longRelease"
  | "slidePosition"
  | "standardPress";

export type BandoriNativeSlideTailKind =
  | "directional"
  | "flick"
  | "none"
  | "plain";

export type BandoriNativeJudgmentWindowCandidate = Readonly<{
  buttons: readonly number[];
  isSlideHead: boolean;
  isSlideMiddle: boolean;
  noteIndex: number;
  slideSlowMidpointTimeSeconds: number | null;
  slideTailKind: BandoriNativeSlideTailKind;
  timingKind: BandoriNativeJudgmentWindowTimingKind;
  timeSeconds: number;
}>;

export type BandoriNativeJudgmentWindowSegment = Readonly<{
  category: "perfect" | "great";
  endTimeSeconds: number;
  leftButton: number;
  noteIndex: number;
  rightButton: number;
  startTimeSeconds: number;
  timingKind: BandoriNativeJudgmentWindowTimingKind;
}>;

type CategoryInterval = Readonly<{
  category: BandoriNativeJudgmentWindowSegment["category"];
  maximumDeltaSeconds: number;
  minimumDeltaSeconds: number;
}>;

type ButtonPriorityContext = Readonly<{
  candidates: readonly PriorityCandidate[];
  cutTimes: readonly number[];
  positionArrivalSeconds: number;
}>;

type PriorityCandidate = Readonly<{
  acquisitionEndTimeSeconds: number;
  acquisitionStartTimeSeconds: number;
  candidate: BandoriNativeJudgmentWindowCandidate;
}>;

type OwnedTimeRange = Readonly<{
  endTimeSeconds: number;
  startTimeSeconds: number;
}>;

const BUTTON_COUNT = 7;
export const BANDORI_NATIVE_STANDARD_TRIGGER_BOUNDARY_SECONDS =
  7.5 * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS;
const BANDORI_NATIVE_SLIDE_FAST_OUTER_FRAMES = 5;

function classifyBandoriNativeJudgment(
  timingErrorSeconds: number,
  sweetFrame: 0 | 1,
): BandoriNativeStandardJudgmentResult {
  if (!Number.isFinite(timingErrorSeconds)) return "none";
  const frameDistance = roundNonNegativeMidpointToEven(
    Math.abs(timingErrorSeconds) / BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS,
  );
  if (frameDistance < 3 + sweetFrame) return "perfect";
  if (frameDistance < 6 + sweetFrame) return "great";
  if (frameDistance === 6 + sweetFrame) return "good";
  if (frameDistance === 7 + sweetFrame) return "bad";
  return "none";
}

export function classifyBandoriNativeStandardJudgment(
  timingErrorSeconds: number,
): BandoriNativeStandardJudgmentResult {
  return classifyBandoriNativeJudgment(timingErrorSeconds, 0);
}

export function classifyBandoriNativeLongReleaseJudgment(
  timingErrorSeconds: number,
): BandoriNativeStandardJudgmentResult {
  return classifyBandoriNativeJudgment(timingErrorSeconds, 1);
}

export function isBandoriNativeStandardPressTriggerable(
  timingErrorSeconds: number,
): boolean {
  return Number.isFinite(timingErrorSeconds)
    && Math.abs(timingErrorSeconds) < BANDORI_NATIVE_STANDARD_TRIGGER_BOUNDARY_SECONDS;
}

function collectGroupButtons(group: BandoriNativeNoteVisualGroup): number[] {
  const buttons = new Set<number>();
  for (const visual of group.visuals) {
    for (const lane of visual.coveredLanes ?? [visual.lane]) {
      if (!Number.isInteger(lane) || lane < 0 || lane >= BUTTON_COUNT) {
        throw new BandoriNativeNoteContractError(
          "Judgment-window candidate has an invalid covered button",
        );
      }
      buttons.add(lane);
    }
  }
  const ordered = [...buttons].sort((left, right) => left - right);
  if (ordered.length === 0) {
    throw new BandoriNativeNoteContractError(
      "Judgment-window candidate has no covered buttons",
    );
  }
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] !== ordered[index - 1] + 1) {
      throw new BandoriNativeNoteContractError(
        "Judgment-window candidate buttons must be contiguous",
      );
    }
  }
  return ordered;
}

/**
 * Standard press windows cover point, directional-press, and Long heads. Long
 * releases use their sweetFrame=1 window. Scoring Slide nodes use the manual
 * Fast-side frame correction and the native Slow-side lifetime. Generated
 * hidden curve points never become notes or midpoint cutoffs.
 */
export function prepareBandoriNativeJudgmentWindowCandidates(
  compiled: CompiledBandoriChart,
  visuals: BandoriNativeChartVisuals,
): Array<BandoriNativeJudgmentWindowCandidate | null> {
  if (visuals.notes.length !== compiled.notes.times.length) {
    throw new BandoriNativeNoteContractError(
      "Judgment-window candidates do not match the compiled chart",
    );
  }
  const nextVisibleSlideBeatByConnection = new Float64Array(
    compiled.ribbons.connectionBeats.length,
  );
  nextVisibleSlideBeatByConnection.fill(Number.NaN);
  for (
    let ribbonIndex = 0;
    ribbonIndex < compiled.ribbons.kinds.length;
    ribbonIndex += 1
  ) {
    const connectionStart = compiled.ribbons.connectionOffsets[ribbonIndex];
    const connectionEnd = compiled.ribbons.connectionOffsets[ribbonIndex + 1];
    let nextVisibleBeat = Number.NaN;
    for (
      let connectionIndex = connectionEnd - 1;
      connectionIndex >= connectionStart;
      connectionIndex -= 1
    ) {
      const isHidden = (
        compiled.ribbons.connectionFlags[connectionIndex]
        & BANDORI_COMPILED_NOTE_FLAG.hidden
      ) !== 0;
      if (isHidden) continue;
      nextVisibleSlideBeatByConnection[connectionIndex] = nextVisibleBeat;
      nextVisibleBeat = compiled.ribbons.connectionBeats[connectionIndex];
    }
  }
  return visuals.notes.map((group, noteIndex) => {
    if (!group) return null;
    const kind = compiled.notes.kinds[noteIndex];
    const timingKind: BandoriNativeJudgmentWindowTimingKind | null = (
      kind !== BANDORI_COMPILED_NOTE_KIND.single
      && kind !== BANDORI_COMPILED_NOTE_KIND.directional
      && kind !== BANDORI_COMPILED_NOTE_KIND.longStart
      && kind !== BANDORI_COMPILED_NOTE_KIND.longEnd
      && kind !== BANDORI_COMPILED_NOTE_KIND.slide
    )
      ? null
      : kind === BANDORI_COMPILED_NOTE_KIND.longEnd
        ? "longRelease"
        : kind === BANDORI_COMPILED_NOTE_KIND.slide
          ? "slidePosition"
          : "standardPress";
    if (!timingKind) return null;
    const flags = compiled.notes.flags[noteIndex];
    const isSlideHead = timingKind === "slidePosition"
      && (flags & BANDORI_COMPILED_NOTE_FLAG.ribbonStart) !== 0;
    const isSlideEnd = timingKind === "slidePosition"
      && (flags & BANDORI_COMPILED_NOTE_FLAG.ribbonEnd) !== 0;
    const slideTailKind: BandoriNativeSlideTailKind = !isSlideEnd
      ? "none"
      : compiled.notes.directions[noteIndex] !== BANDORI_COMPILED_DIRECTION.none
        ? "directional"
        : (flags & BANDORI_COMPILED_NOTE_FLAG.flick) !== 0
          ? "flick"
          : "plain";
    let slideSlowMidpointTimeSeconds: number | null = null;
    if (timingKind === "slidePosition" && !isSlideEnd) {
      const ribbonIndex = compiled.notes.ribbonIndexes[noteIndex];
      const sourceNodeIndex = compiled.notes.sourceNodeIndexes[noteIndex];
      const connectionIndex = compiled.ribbons.connectionOffsets[ribbonIndex]
        + sourceNodeIndex;
      const nextVisibleBeat = nextVisibleSlideBeatByConnection[connectionIndex];
      if (Number.isFinite(nextVisibleBeat)) {
        const midpointBeat = compiled.notes.beats[noteIndex]
          + (nextVisibleBeat - compiled.notes.beats[noteIndex]) / 2;
        slideSlowMidpointTimeSeconds = getBandoriCompiledTimeAtBeat(
          compiled,
          midpointBeat,
        );
      }
    }
    return {
      buttons: collectGroupButtons(group),
      isSlideHead,
      isSlideMiddle: timingKind === "slidePosition" && !isSlideHead && !isSlideEnd,
      noteIndex,
      slideSlowMidpointTimeSeconds,
      slideTailKind,
      timingKind,
      timeSeconds: compiled.notes.times[noteIndex],
    };
  });
}

function getSlideCategoryIntervals(
  isSlideMiddle: boolean,
  slideTailKind: BandoriNativeSlideTailKind,
  approachTimeScale: number,
  frameCorrectionTenths: BandoriSlideJudgmentFrameCorrectionTenths,
  slowMidpointDeltaSeconds: number | null,
  showPerfect: boolean,
  showGreat: boolean,
): CategoryInterval[] {
  const frameSeconds = BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS * approachTimeScale;
  const correctionFrames = frameCorrectionTenths / 10;
  const isGestureTail = slideTailKind === "flick" || slideTailKind === "directional";
  const perfectFastFrames = isGestureTail
    ? 0
    : (isSlideMiddle ? 0 : 2) + correctionFrames;
  const slowTimeoutSeconds = slideTailKind === "flick"
    ? BANDORI_NATIVE_SLIDE_FLICK_SLOW_TIMEOUT_SECONDS
    : BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS;
  const slowPerfectSeconds = slowMidpointDeltaSeconds === null
    ? slowTimeoutSeconds
    : Math.min(slowTimeoutSeconds, Math.max(0, slowMidpointDeltaSeconds));
  const intervals: CategoryInterval[] = [];
  if (showGreat && !isSlideMiddle && !isGestureTail) {
    intervals.push({
      category: "great",
      maximumDeltaSeconds: -perfectFastFrames * frameSeconds,
      minimumDeltaSeconds: -(perfectFastFrames + 3) * frameSeconds,
    });
  }
  if (showPerfect) {
    intervals.push({
      category: "perfect",
      maximumDeltaSeconds: slowPerfectSeconds,
      minimumDeltaSeconds: -perfectFastFrames * frameSeconds,
    });
  }
  return intervals;
}

function getPositionDistanceBoundary(
  leftTimeSeconds: number,
  rightTimeSeconds: number,
  arrivalSeconds: number,
): number | null {
  const earlierTimeSeconds = Math.min(leftTimeSeconds, rightTimeSeconds);
  const laterTimeSeconds = Math.max(leftTimeSeconds, rightTimeSeconds);
  const gapSeconds = laterTimeSeconds - earlierTimeSeconds;
  if (gapSeconds === 0) return null;
  const exponentRate = Math.log(1.1) * 50 / arrivalSeconds;
  return earlierTimeSeconds + Math.log(
    2 / (1 + Math.exp(-exponentRate * gapSeconds)),
  ) / exponentRate;
}

function getPositionDistance(
  targetTimeSeconds: number,
  inputTimeSeconds: number,
  arrivalSeconds: number,
): number {
  const exponentRate = Math.log(1.1) * 50 / arrivalSeconds;
  return Math.abs(Math.expm1(exponentRate * (inputTimeSeconds - targetTimeSeconds)));
}

function getPriorityCandidate(
  candidate: BandoriNativeJudgmentWindowCandidate,
  approachTimeScale: number,
  slideFrameCorrectionTenths: BandoriSlideJudgmentFrameCorrectionTenths,
): PriorityCandidate | null {
  if (candidate.timingKind === "standardPress") {
    return {
      acquisitionEndTimeSeconds:
        candidate.timeSeconds + BANDORI_NATIVE_STANDARD_TRIGGER_BOUNDARY_SECONDS,
      acquisitionStartTimeSeconds:
        candidate.timeSeconds - BANDORI_NATIVE_STANDARD_TRIGGER_BOUNDARY_SECONDS,
      candidate,
    };
  }
  if (candidate.timingKind !== "slidePosition" || !candidate.isSlideHead) {
    return null;
  }

  const correctionFrames = slideFrameCorrectionTenths / 10;
  const fastTriggerSeconds = (
    2 + correctionFrames + BANDORI_NATIVE_SLIDE_FAST_OUTER_FRAMES
  ) * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS * approachTimeScale;
  const slowMidpointDeltaSeconds = candidate.slideSlowMidpointTimeSeconds === null
    ? null
    : candidate.slideSlowMidpointTimeSeconds - candidate.timeSeconds;
  const slowTriggerSeconds = slowMidpointDeltaSeconds === null
    ? BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS
    : Math.min(
      BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS,
      Math.max(0, slowMidpointDeltaSeconds),
    );
  return {
    acquisitionEndTimeSeconds: candidate.timeSeconds + slowTriggerSeconds,
    acquisitionStartTimeSeconds: candidate.timeSeconds - fastTriggerSeconds,
    candidate,
  };
}

function isPriorityCandidateActive(
  candidate: PriorityCandidate,
  inputTimeSeconds: number,
): boolean {
  if (candidate.candidate.timingKind === "standardPress") {
    return isBandoriNativeStandardPressTriggerable(
      inputTimeSeconds - candidate.candidate.timeSeconds,
    );
  }
  return inputTimeSeconds >= candidate.acquisitionStartTimeSeconds
    && inputTimeSeconds <= candidate.acquisitionEndTimeSeconds;
}

function getPriorityWinner(
  context: ButtonPriorityContext,
  inputTimeSeconds: number,
): BandoriNativeJudgmentWindowCandidate | null {
  let standard: BandoriNativeJudgmentWindowCandidate | null = null;
  let standardRawDistance = Number.POSITIVE_INFINITY;
  let slide: BandoriNativeJudgmentWindowCandidate | null = null;
  let slidePositionDistance = Number.POSITIVE_INFINITY;

  for (const priorityCandidate of context.candidates) {
    if (!isPriorityCandidateActive(priorityCandidate, inputTimeSeconds)) continue;
    const { candidate } = priorityCandidate;
    if (candidate.timingKind === "standardPress") {
      const rawDistance = Math.abs(inputTimeSeconds - candidate.timeSeconds);
      if (rawDistance < standardRawDistance) {
        standard = candidate;
        standardRawDistance = rawDistance;
      }
      continue;
    }
    const positionDistance = getPositionDistance(
      candidate.timeSeconds,
      inputTimeSeconds,
      context.positionArrivalSeconds,
    );
    if (positionDistance < slidePositionDistance) {
      slide = candidate;
      slidePositionDistance = positionDistance;
    }
  }

  if (!standard) return slide;
  if (!slide) return standard;
  const standardPositionDistance = getPositionDistance(
    standard.timeSeconds,
    inputTimeSeconds,
    context.positionArrivalSeconds,
  );
  return standardPositionDistance <= slidePositionDistance ? standard : slide;
}

function createPriorityContextsByButton(
  activeCandidates: readonly BandoriNativeJudgmentWindowCandidate[],
  noteSpeed: number,
  approachTimeScale: number,
  slideFrameCorrectionTenths: BandoriSlideJudgmentFrameCorrectionTenths,
): ButtonPriorityContext[] {
  const candidatesByButton = Array.from(
    { length: BUTTON_COUNT },
    () => [] as PriorityCandidate[],
  );
  for (const candidate of activeCandidates) {
    const priorityCandidate = getPriorityCandidate(
      candidate,
      approachTimeScale,
      slideFrameCorrectionTenths,
    );
    if (!priorityCandidate) continue;
    for (const button of candidate.buttons) {
      candidatesByButton[button].push(priorityCandidate);
    }
  }

  return candidatesByButton.map((candidates) => {
    const positionArrivalSeconds = getBandoriSimulatorNoteArrivalSeconds(
      noteSpeed,
      approachTimeScale,
    );
    const standards = candidates
      .filter(({ candidate }) => candidate.timingKind === "standardPress")
      .sort((left, right) => (
        left.candidate.timeSeconds - right.candidate.timeSeconds
        || left.candidate.noteIndex - right.candidate.noteIndex
      ));
    const cutTimes = candidates.flatMap((candidate) => [
      candidate.acquisitionStartTimeSeconds,
      candidate.acquisitionEndTimeSeconds,
    ]);
    for (let index = 1; index < standards.length; index += 1) {
      cutTimes.push((
        standards[index - 1].candidate.timeSeconds
        + standards[index].candidate.timeSeconds
      ) / 2);
    }
    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
        const boundary = getPositionDistanceBoundary(
          candidates[leftIndex].candidate.timeSeconds,
          candidates[rightIndex].candidate.timeSeconds,
          positionArrivalSeconds,
        );
        if (boundary !== null) cutTimes.push(boundary);
      }
    }
    cutTimes.sort((left, right) => left - right);
    return {
      candidates,
      cutTimes: cutTimes.filter((timeSeconds, index) => (
        index === 0 || timeSeconds !== cutTimes[index - 1]
      )),
      positionArrivalSeconds,
    };
  });
}

function getCategoryIntervals(
  timingKind: Exclude<BandoriNativeJudgmentWindowTimingKind, "slidePosition">,
  showPerfect: boolean,
  showGreat: boolean,
): CategoryInterval[] {
  const perfectBoundarySeconds = timingKind === "longRelease"
    ? BANDORI_NATIVE_LONG_RELEASE_PERFECT_BOUNDARY_SECONDS
    : BANDORI_NATIVE_STANDARD_PERFECT_BOUNDARY_SECONDS;
  const greatBoundarySeconds = timingKind === "longRelease"
    ? BANDORI_NATIVE_LONG_RELEASE_GREAT_BOUNDARY_SECONDS
    : BANDORI_NATIVE_STANDARD_GREAT_BOUNDARY_SECONDS;
  const intervals: CategoryInterval[] = [];
  if (showGreat) {
    intervals.push(
      {
        category: "great",
        maximumDeltaSeconds: -perfectBoundarySeconds,
        minimumDeltaSeconds: -greatBoundarySeconds,
      },
      {
        category: "great",
        maximumDeltaSeconds: greatBoundarySeconds,
        minimumDeltaSeconds: perfectBoundarySeconds,
      },
    );
  }
  if (showPerfect) {
    intervals.push({
      category: "perfect",
      maximumDeltaSeconds: perfectBoundarySeconds,
      minimumDeltaSeconds: -perfectBoundarySeconds,
    });
  }
  return intervals;
}

function collectOwnedTimeRanges(
  candidate: BandoriNativeJudgmentWindowCandidate,
  context: ButtonPriorityContext,
  startTimeSeconds: number,
  endTimeSeconds: number,
): OwnedTimeRange[] {
  if (endTimeSeconds <= startTimeSeconds) return [];
  const isFingerBound = candidate.timingKind === "longRelease"
    || (candidate.timingKind === "slidePosition" && !candidate.isSlideHead);
  if (isFingerBound) return [{ endTimeSeconds, startTimeSeconds }];

  const points = [
    startTimeSeconds,
    ...context.cutTimes.filter((timeSeconds) => (
      timeSeconds > startTimeSeconds && timeSeconds < endTimeSeconds
    )),
    endTimeSeconds,
  ];
  const ranges: OwnedTimeRange[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const rangeStart = points[index - 1];
    const rangeEnd = points[index];
    const winner = getPriorityWinner(context, (rangeStart + rangeEnd) / 2);
    if (winner?.noteIndex !== candidate.noteIndex) continue;
    const previous = ranges.at(-1);
    if (previous?.endTimeSeconds === rangeStart) {
      ranges[ranges.length - 1] = {
        endTimeSeconds: rangeEnd,
        startTimeSeconds: previous.startTimeSeconds,
      };
    } else {
      ranges.push({ endTimeSeconds: rangeEnd, startTimeSeconds: rangeStart });
    }
  }
  return ranges;
}

/**
 * Splits unbound candidates per button. Standard presses first use raw-time
 * proximity; Slide heads use current distance to the judgment line, with the
 * standard candidate winning an exact cross-type tie. Long releases and Slide
 * nodes after the head stay independent because their finger binding persists.
 */
export function collectBandoriNativeJudgmentWindowSegments({
  activeCandidates,
  approachTimeScale = 1,
  minimumInputTimeSeconds = Number.NEGATIVE_INFINITY,
  noteSpeed = BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  showGreat,
  showPerfect,
  slideFrameCorrectionTenths = BANDORI_SLIDE_JUDGMENT_FRAME_CORRECTION_DEFAULT_TENTHS,
}: Readonly<{
  activeCandidates: readonly BandoriNativeJudgmentWindowCandidate[];
  approachTimeScale?: number;
  minimumInputTimeSeconds?: number;
  noteSpeed?: number;
  showGreat: boolean;
  showPerfect: boolean;
  slideFrameCorrectionTenths?: BandoriSlideJudgmentFrameCorrectionTenths;
}>): BandoriNativeJudgmentWindowSegment[] {
  if (Number.isNaN(minimumInputTimeSeconds)) return [];
  if ((!showPerfect && !showGreat) || activeCandidates.length === 0) return [];
  const priorityContextsByButton = createPriorityContextsByButton(
    activeCandidates,
    noteSpeed,
    approachTimeScale,
    slideFrameCorrectionTenths,
  );
  const segments: BandoriNativeJudgmentWindowSegment[] = [];

  for (const candidate of activeCandidates) {
    const intervals = candidate.timingKind === "slidePosition"
      ? getSlideCategoryIntervals(
        candidate.isSlideMiddle,
        candidate.slideTailKind,
        approachTimeScale,
        slideFrameCorrectionTenths,
        candidate.slideSlowMidpointTimeSeconds === null
          ? null
          : candidate.slideSlowMidpointTimeSeconds - candidate.timeSeconds,
        showPerfect,
        showGreat,
      )
      : getCategoryIntervals(candidate.timingKind, showPerfect, showGreat);
    for (const interval of intervals) {
      const buttonSegments: BandoriNativeJudgmentWindowSegment[] = [];
      for (const button of candidate.buttons) {
        const startTimeSeconds = Math.max(
          candidate.timeSeconds + interval.minimumDeltaSeconds,
          minimumInputTimeSeconds,
        );
        const endTimeSeconds = candidate.timeSeconds + interval.maximumDeltaSeconds;
        const ownedRanges = collectOwnedTimeRanges(
          candidate,
          priorityContextsByButton[button],
          startTimeSeconds,
          endTimeSeconds,
        );
        for (const ownedRange of ownedRanges) {
          buttonSegments.push({
            category: interval.category,
            endTimeSeconds: ownedRange.endTimeSeconds,
            leftButton: button,
            noteIndex: candidate.noteIndex,
            rightButton: button,
            startTimeSeconds: ownedRange.startTimeSeconds,
            timingKind: candidate.timingKind,
          });
        }
      }
      buttonSegments.sort((left, right) => (
        left.startTimeSeconds - right.startTimeSeconds
        || left.leftButton - right.leftButton
        || left.endTimeSeconds - right.endTimeSeconds
      ));
      let previousSegment: BandoriNativeJudgmentWindowSegment | null = null;
      for (const segment of buttonSegments) {
        if (
          previousSegment
          && previousSegment.rightButton + 1 === segment.leftButton
          && previousSegment.startTimeSeconds === segment.startTimeSeconds
          && previousSegment.endTimeSeconds === segment.endTimeSeconds
        ) {
          const mergedSegment: BandoriNativeJudgmentWindowSegment = {
            ...previousSegment,
            rightButton: segment.rightButton,
          };
          segments[segments.length - 1] = mergedSegment;
          previousSegment = mergedSegment;
          continue;
        }
        segments.push(segment);
        previousSegment = segment;
      }
    }
  }
  return segments;
}
