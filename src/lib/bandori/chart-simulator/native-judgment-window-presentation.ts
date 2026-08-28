import {
  BANDORI_COMPILED_DIRECTION,
  BANDORI_COMPILED_NOTE_FLAG,
  BANDORI_COMPILED_NOTE_KIND,
  getBandoriCompiledBeatAtTime,
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
export const BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS = 1.168;
export const BANDORI_SLIDE_JUDGMENT_FRAME_CORRECTION_DEFAULT_TENTHS = 0;
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
  positionBeat: number;
  slidePreviousScoringTimeSeconds: number | null;
  slideSlowMidpointTimeSeconds: number | null;
  slideTailKind: BandoriNativeSlideTailKind;
  timingKind: BandoriNativeJudgmentWindowTimingKind;
  timeSeconds: number;
}>;

type BandoriNativeJudgmentButtonPriorityIndex = Readonly<{
  slideHeads: readonly BandoriNativeJudgmentWindowCandidate[];
  standardPresses: readonly BandoriNativeJudgmentWindowCandidate[];
}>;

export type BandoriNativeJudgmentWindowPriorityIndex =
  readonly BandoriNativeJudgmentButtonPriorityIndex[];

export type BandoriNativeJudgmentWindowSegment = Readonly<{
  category: "perfect" | "great";
  endTimeSeconds: number;
  leftLane: number;
  noteIndex: number;
  rightLane: number;
  startTimeSeconds: number;
  timingKind: BandoriNativeJudgmentWindowTimingKind;
}>;

export type BandoriNativeJudgmentWindowOutlineEdge = Readonly<{
  category: BandoriNativeJudgmentWindowSegment["category"];
  endLane: number;
  endTimeSeconds: number;
  noteIndex: number;
  startLane: number;
  startTimeSeconds: number;
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

type HorizontalButtonOrderSlab = Readonly<{
  buttons: readonly number[];
  leftLane: number;
  rightLane: number;
}>;

type PriorityCandidate = Readonly<{
  activationStartTimeSeconds: number;
  acquisitionEndTimeSeconds: number;
  acquisitionStartTimeSeconds: number;
  candidate: BandoriNativeJudgmentWindowCandidate;
}>;

const BUTTON_COUNT = 7;
export const BANDORI_NATIVE_STANDARD_TRIGGER_BOUNDARY_SECONDS =
  7.5 * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS;
const BANDORI_NATIVE_SLIDE_FAST_OUTER_FRAMES = 5;

/**
 * Builds the immutable candidate ordering once per normal or mirrored chart.
 * The index may supply a candidate before the current render frame shows it,
 * but time-sliced ownership still starts only at that candidate's activation.
 */
export function prepareBandoriNativeJudgmentWindowPriorityIndex(
  candidatesByNoteIndex: readonly (
    BandoriNativeJudgmentWindowCandidate | null
  )[],
): BandoriNativeJudgmentWindowPriorityIndex {
  const index = Array.from(
    { length: BUTTON_COUNT },
    () => ({
      slideHeads: [] as BandoriNativeJudgmentWindowCandidate[],
      standardPresses: [] as BandoriNativeJudgmentWindowCandidate[],
    }),
  );
  for (const candidate of candidatesByNoteIndex) {
    if (!candidate) continue;
    const collection = candidate.timingKind === "standardPress"
      ? "standardPresses"
      : candidate.timingKind === "slidePosition" && candidate.isSlideHead
        ? "slideHeads"
        : null;
    if (!collection) continue;
    for (const button of candidate.buttons) {
      index[button][collection].push(candidate);
    }
  }
  for (const buttonIndex of index) {
    buttonIndex.standardPresses.sort((left, right) => (
      left.timeSeconds - right.timeSeconds
      || left.noteIndex - right.noteIndex
    ));
    buttonIndex.slideHeads.sort((left, right) => (
      left.timeSeconds - right.timeSeconds
      || left.noteIndex - right.noteIndex
    ));
  }
  return index;
}

function upperBoundPriorityCandidateTime(
  candidates: readonly BandoriNativeJudgmentWindowCandidate[],
  timeSeconds: number,
): number {
  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (candidates[middle].timeSeconds <= timeSeconds) low = middle + 1;
    else high = middle;
  }
  return low;
}

function collectIndexedPriorityCandidates(
  priorityIndex: BandoriNativeJudgmentWindowPriorityIndex,
  minimumCandidateTimeSeconds: number,
  maximumCandidateTimeSeconds: number,
): BandoriNativeJudgmentWindowCandidate[] {
  const selected = new Set<BandoriNativeJudgmentWindowCandidate>();
  for (const buttonIndex of priorityIndex) {
    for (const candidates of [
      buttonIndex.standardPresses,
      buttonIndex.slideHeads,
    ]) {
      const startIndex = upperBoundPriorityCandidateTime(
        candidates,
        minimumCandidateTimeSeconds,
      );
      const endIndex = upperBoundPriorityCandidateTime(
        candidates,
        maximumCandidateTimeSeconds,
      );
      for (let index = startIndex; index < endIndex; index += 1) {
        selected.add(candidates[index]);
      }
    }
  }
  return [...selected].sort((left, right) => (
    left.timeSeconds - right.timeSeconds
    || left.noteIndex - right.noteIndex
  ));
}

function createHorizontalButtonOrderSlabs(): readonly HorizontalButtonOrderSlab[] {
  const boundaries: number[] = [];
  for (let button = 0; button < BUTTON_COUNT; button += 1) {
    boundaries.push(
      button - BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS,
      button + BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS,
    );
  }
  for (let leftButton = 0; leftButton < BUTTON_COUNT; leftButton += 1) {
    for (
      let rightButton = leftButton + 1;
      rightButton < BUTTON_COUNT && rightButton - leftButton <= 2;
      rightButton += 1
    ) {
      boundaries.push((leftButton + rightButton) / 2);
    }
  }
  boundaries.sort((left, right) => left - right);
  const uniqueBoundaries = boundaries.filter((boundary, index) => (
    index === 0 || boundary !== boundaries[index - 1]
  ));
  const slabs: HorizontalButtonOrderSlab[] = [];
  for (let index = 1; index < uniqueBoundaries.length; index += 1) {
    const leftLane = uniqueBoundaries[index - 1];
    const rightLane = uniqueBoundaries[index];
    const sampleLane = (leftLane + rightLane) / 2;
    const buttons = Array.from({ length: BUTTON_COUNT }, (_, button) => button)
      .filter((button) => (
        Math.abs(sampleLane - button)
          < BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS
      ))
      .sort((leftButton, rightButton) => (
        Math.abs(sampleLane - leftButton) - Math.abs(sampleLane - rightButton)
        || leftButton - rightButton
      ));
    if (buttons.length === 0) continue;
    slabs.push({ buttons, leftLane, rightLane });
  }
  return slabs;
}

const HORIZONTAL_BUTTON_ORDER_SLABS = createHorizontalButtonOrderSlabs();

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
  const previousVisibleSlideBeatByConnection = new Float64Array(
    compiled.ribbons.connectionBeats.length,
  );
  nextVisibleSlideBeatByConnection.fill(Number.NaN);
  previousVisibleSlideBeatByConnection.fill(Number.NaN);
  for (
    let ribbonIndex = 0;
    ribbonIndex < compiled.ribbons.kinds.length;
    ribbonIndex += 1
  ) {
    const connectionStart = compiled.ribbons.connectionOffsets[ribbonIndex];
    const connectionEnd = compiled.ribbons.connectionOffsets[ribbonIndex + 1];
    let previousVisibleBeat = Number.NaN;
    for (
      let connectionIndex = connectionStart;
      connectionIndex < connectionEnd;
      connectionIndex += 1
    ) {
      const isHidden = (
        compiled.ribbons.connectionFlags[connectionIndex]
        & BANDORI_COMPILED_NOTE_FLAG.hidden
      ) !== 0;
      if (isHidden) continue;
      previousVisibleSlideBeatByConnection[connectionIndex] = previousVisibleBeat;
      previousVisibleBeat = compiled.ribbons.connectionBeats[connectionIndex];
    }
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
    let slidePreviousScoringTimeSeconds: number | null = null;
    let slideSlowMidpointTimeSeconds: number | null = null;
    if (timingKind === "slidePosition") {
      const ribbonIndex = compiled.notes.ribbonIndexes[noteIndex];
      const sourceNodeIndex = compiled.notes.sourceNodeIndexes[noteIndex];
      const connectionIndex = compiled.ribbons.connectionOffsets[ribbonIndex]
        + sourceNodeIndex;
      const previousVisibleBeat = previousVisibleSlideBeatByConnection[connectionIndex];
      if (Number.isFinite(previousVisibleBeat)) {
        slidePreviousScoringTimeSeconds = getBandoriCompiledTimeAtBeat(
          compiled,
          previousVisibleBeat,
        );
      }
      if (!isSlideEnd) {
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
    }
    return {
      buttons: collectGroupButtons(group),
      isSlideHead,
      isSlideMiddle: timingKind === "slidePosition" && !isSlideHead && !isSlideEnd,
      noteIndex,
      positionBeat: compiled.notes.beats[noteIndex],
      slidePreviousScoringTimeSeconds,
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
  activationStartTimeSeconds: number,
  approachTimeScale: number,
  slideFrameCorrectionTenths: BandoriSlideJudgmentFrameCorrectionTenths,
): PriorityCandidate | null {
  if (candidate.timingKind === "standardPress") {
    return {
      activationStartTimeSeconds,
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
    activationStartTimeSeconds,
    acquisitionEndTimeSeconds: candidate.timeSeconds + slowTriggerSeconds,
    acquisitionStartTimeSeconds: candidate.timeSeconds - fastTriggerSeconds,
    candidate,
  };
}

function isPriorityCandidateTriggerable(
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

function getPriorityPositionBeat(
  inputTimeSeconds: number,
  compiled: Pick<CompiledBandoriChart, "bpm"> | undefined,
): number {
  return compiled
    ? getBandoriCompiledBeatAtTime(compiled, inputTimeSeconds)
    : inputTimeSeconds;
}

function getPriorityGroupWinners(
  context: ButtonPriorityContext,
  inputTimeSeconds: number,
  compiled: Pick<CompiledBandoriChart, "bpm"> | undefined,
): Readonly<{
  slide: PriorityCandidate | null;
  standard: PriorityCandidate | null;
}> {
  const inputPositionBeat = getPriorityPositionBeat(inputTimeSeconds, compiled);
  let standard: PriorityCandidate | null = null;
  let standardBeatDistance = Number.POSITIVE_INFINITY;
  let slide: PriorityCandidate | null = null;
  let slidePositionDistance = Number.POSITIVE_INFINITY;

  for (const priorityCandidate of context.candidates) {
    if (inputTimeSeconds < priorityCandidate.activationStartTimeSeconds) continue;
    const { candidate } = priorityCandidate;
    if (candidate.timingKind === "standardPress") {
      const beatDistance = Math.abs(inputPositionBeat - candidate.positionBeat);
      if (beatDistance < standardBeatDistance) {
        standard = priorityCandidate;
        standardBeatDistance = beatDistance;
      }
      continue;
    }
    const positionDistance = getPositionDistance(
      candidate.timeSeconds,
      inputTimeSeconds,
      context.positionArrivalSeconds,
    );
    if (positionDistance < slidePositionDistance) {
      slide = priorityCandidate;
      slidePositionDistance = positionDistance;
    }
  }

  return { slide, standard };
}

function getUnclassifiedPriorityWinner(
  context: ButtonPriorityContext,
  inputTimeSeconds: number,
  compiled: Pick<CompiledBandoriChart, "bpm"> | undefined,
): PriorityCandidate | null {
  const { slide, standard } = getPriorityGroupWinners(
    context,
    inputTimeSeconds,
    compiled,
  );

  if (!standard) return slide;
  if (!slide) return standard;
  const standardPositionDistance = getPositionDistance(
    standard.candidate.timeSeconds,
    inputTimeSeconds,
    context.positionArrivalSeconds,
  );
  const slidePositionDistance = getPositionDistance(
    slide.candidate.timeSeconds,
    inputTimeSeconds,
    context.positionArrivalSeconds,
  );
  return standardPositionDistance <= slidePositionDistance ? standard : slide;
}

function getPriorityWinner(
  context: ButtonPriorityContext,
  inputTimeSeconds: number,
  compiled: Pick<CompiledBandoriChart, "bpm"> | undefined,
): BandoriNativeJudgmentWindowCandidate | null {
  const winner = getUnclassifiedPriorityWinner(
    context,
    inputTimeSeconds,
    compiled,
  );
  return winner && isPriorityCandidateTriggerable(winner, inputTimeSeconds)
    ? winner.candidate
    : null;
}

function createPriorityContextsByButton(
  activeCandidates: readonly BandoriNativeJudgmentWindowCandidate[],
  noteSpeed: number,
  approachTimeScale: number,
  slideFrameCorrectionTenths: BandoriSlideJudgmentFrameCorrectionTenths,
  compiled: Pick<CompiledBandoriChart, "bpm"> | undefined,
): ButtonPriorityContext[] {
  const candidatesByButton = Array.from(
    { length: BUTTON_COUNT },
    () => [] as PriorityCandidate[],
  );
  const positionArrivalSeconds = getBandoriSimulatorNoteArrivalSeconds(
    noteSpeed,
    approachTimeScale,
  );
  for (const candidate of activeCandidates) {
    const priorityCandidate = getPriorityCandidate(
      candidate,
      candidate.timeSeconds - positionArrivalSeconds,
      approachTimeScale,
      slideFrameCorrectionTenths,
    );
    if (!priorityCandidate) continue;
    for (const button of candidate.buttons) {
      candidatesByButton[button].push(priorityCandidate);
    }
  }

  return candidatesByButton.map((candidates) => {
    const standards = candidates
      .filter(({ candidate }) => candidate.timingKind === "standardPress")
      .sort((left, right) => (
        left.candidate.positionBeat - right.candidate.positionBeat
        || left.candidate.noteIndex - right.candidate.noteIndex
      ));
    const slides = candidates
      .filter(({ candidate }) => candidate.timingKind === "slidePosition")
      .sort((left, right) => (
        left.candidate.timeSeconds - right.candidate.timeSeconds
        || left.candidate.noteIndex - right.candidate.noteIndex
      ));
    const cutTimes = candidates.flatMap((candidate) => [
      candidate.activationStartTimeSeconds,
      candidate.acquisitionStartTimeSeconds,
      candidate.acquisitionEndTimeSeconds,
    ]);
    for (let index = 1; index < standards.length; index += 1) {
      const midpointBeat = (
        standards[index - 1].candidate.positionBeat
        + standards[index].candidate.positionBeat
      ) / 2;
      cutTimes.push(
        compiled
          ? getBandoriCompiledTimeAtBeat(compiled, midpointBeat)
          : midpointBeat,
      );
    }
    for (let index = 1; index < slides.length; index += 1) {
      const boundary = getPositionDistanceBoundary(
        slides[index - 1].candidate.timeSeconds,
        slides[index].candidate.timeSeconds,
        positionArrivalSeconds,
      );
      if (boundary !== null) cutTimes.push(boundary);
    }
    cutTimes.sort((left, right) => left - right);
    const baseCutTimes = cutTimes.filter((timeSeconds, index) => (
      index === 0 || timeSeconds !== cutTimes[index - 1]
    ));
    for (let index = 1; index < baseCutTimes.length; index += 1) {
      const rangeStart = baseCutTimes[index - 1];
      const rangeEnd = baseCutTimes[index];
      const { slide, standard } = getPriorityGroupWinners(
        {
          candidates,
          cutTimes: baseCutTimes,
          positionArrivalSeconds,
        },
        (rangeStart + rangeEnd) / 2,
        compiled,
      );
      if (!slide || !standard) continue;
      const boundary = getPositionDistanceBoundary(
        standard.candidate.timeSeconds,
        slide.candidate.timeSeconds,
        positionArrivalSeconds,
      );
      if (boundary !== null && boundary > rangeStart && boundary < rangeEnd) {
        cutTimes.push(boundary);
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

type CandidateCategoryTimeInterval = Readonly<{
  category: BandoriNativeJudgmentWindowSegment["category"];
  endTimeSeconds: number;
  startTimeSeconds: number;
}>;

function isFingerBoundCandidate(
  candidate: BandoriNativeJudgmentWindowCandidate,
): boolean {
  return candidate.timingKind === "longRelease"
    || (candidate.timingKind === "slidePosition" && !candidate.isSlideHead);
}

function getCandidateCategoryIntervals(
  candidate: BandoriNativeJudgmentWindowCandidate,
  approachTimeScale: number,
  slideFrameCorrectionTenths: BandoriSlideJudgmentFrameCorrectionTenths,
  showPerfect: boolean,
  showGreat: boolean,
): CandidateCategoryTimeInterval[] {
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
  return intervals.map((interval) => ({
    category: interval.category,
    endTimeSeconds: candidate.timeSeconds + interval.maximumDeltaSeconds,
    startTimeSeconds: candidate.timeSeconds + interval.minimumDeltaSeconds,
  }));
}

function getDisplayedCategory(
  intervals: readonly CandidateCategoryTimeInterval[],
  inputTimeSeconds: number,
): BandoriNativeJudgmentWindowSegment["category"] | null {
  return intervals.find((interval) => (
    inputTimeSeconds >= interval.startTimeSeconds
    && inputTimeSeconds <= interval.endTimeSeconds
  ))?.category ?? null;
}

/**
 * Produces the native two-dimensional ownership regions at the judgment line.
 * Horizontal slabs encode the fixed adjacent-lane collision circles and button
 * distance order. Each button selects one candidate before judging whether it
 * is triggerable; invisible Good/Bad ownership can therefore mask a farther
 * button's Perfect/Great region. Finger-bound Long releases and Slide nodes do
 * not re-enter new-touch priority selection and may overlap other bound regions.
 */
export function collectBandoriNativeJudgmentWindowSegments({
  activeCandidates,
  approachTimeScale = 1,
  compiled,
  minimumInputTimeSeconds = Number.NEGATIVE_INFINITY,
  noteSpeed = BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  priorityIndex,
  showGreat,
  showPerfect,
  slideFrameCorrectionTenths = BANDORI_SLIDE_JUDGMENT_FRAME_CORRECTION_DEFAULT_TENTHS,
}: Readonly<{
  activeCandidates: readonly BandoriNativeJudgmentWindowCandidate[];
  approachTimeScale?: number;
  compiled?: Pick<CompiledBandoriChart, "bpm">;
  minimumInputTimeSeconds?: number;
  noteSpeed?: number;
  priorityIndex?: BandoriNativeJudgmentWindowPriorityIndex;
  showGreat: boolean;
  showPerfect: boolean;
  slideFrameCorrectionTenths?: BandoriSlideJudgmentFrameCorrectionTenths;
}>): BandoriNativeJudgmentWindowSegment[] {
  if (Number.isNaN(minimumInputTimeSeconds)) return [];
  if ((!showPerfect && !showGreat) || activeCandidates.length === 0) return [];
  const boundSegments: BandoriNativeJudgmentWindowSegment[] = [];
  const unboundIntervalsByNoteIndex = new Map<
    number,
    readonly CandidateCategoryTimeInterval[]
  >();
  const timeCuts: number[] = [];

  for (const candidate of activeCandidates) {
    const intervals = getCandidateCategoryIntervals(
      candidate,
      approachTimeScale,
      slideFrameCorrectionTenths,
      showPerfect,
      showGreat,
    );
    if (!isFingerBoundCandidate(candidate)) {
      const visibleIntervals: CandidateCategoryTimeInterval[] = [];
      for (const interval of intervals) {
        const startTimeSeconds = Math.max(
          interval.startTimeSeconds,
          minimumInputTimeSeconds,
        );
        if (interval.endTimeSeconds <= startTimeSeconds) continue;
        const visibleInterval = { ...interval, startTimeSeconds };
        visibleIntervals.push(visibleInterval);
        timeCuts.push(
          visibleInterval.startTimeSeconds,
          visibleInterval.endTimeSeconds,
        );
      }
      if (visibleIntervals.length > 0) {
        unboundIntervalsByNoteIndex.set(candidate.noteIndex, visibleIntervals);
      }
      continue;
    }
    for (const interval of intervals) {
      const startTimeSeconds = Math.max(
        interval.startTimeSeconds,
        minimumInputTimeSeconds,
        candidate.slidePreviousScoringTimeSeconds
          ?? Number.NEGATIVE_INFINITY,
      );
      if (interval.endTimeSeconds <= startTimeSeconds) continue;
      boundSegments.push({
        category: interval.category,
        endTimeSeconds: interval.endTimeSeconds,
        leftLane:
          candidate.buttons[0] - BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS,
        noteIndex: candidate.noteIndex,
        rightLane: candidate.buttons.at(-1)!
          + BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS,
        startTimeSeconds,
        timingKind: candidate.timingKind,
      });
    }
  }

  if (unboundIntervalsByNoteIndex.size === 0) return boundSegments;
  let displayDomainStartTimeSeconds = Number.POSITIVE_INFINITY;
  let displayDomainEndTimeSeconds = Number.NEGATIVE_INFINITY;
  for (const timeSeconds of timeCuts) {
    displayDomainStartTimeSeconds = Math.min(
      displayDomainStartTimeSeconds,
      timeSeconds,
    );
    displayDomainEndTimeSeconds = Math.max(
      displayDomainEndTimeSeconds,
      timeSeconds,
    );
  }
  const priorityCandidates = priorityIndex
    ? collectIndexedPriorityCandidates(
      priorityIndex,
      minimumInputTimeSeconds,
      displayDomainEndTimeSeconds + getBandoriSimulatorNoteArrivalSeconds(
        noteSpeed,
        approachTimeScale,
      ),
    )
    : activeCandidates;
  const priorityContextsByButton = createPriorityContextsByButton(
    priorityCandidates,
    noteSpeed,
    approachTimeScale,
    slideFrameCorrectionTenths,
    compiled,
  );
  for (const context of priorityContextsByButton) {
    for (const cutTimeSeconds of context.cutTimes) {
      if (
        cutTimeSeconds > displayDomainStartTimeSeconds
        && cutTimeSeconds < displayDomainEndTimeSeconds
      ) {
        timeCuts.push(cutTimeSeconds);
      }
    }
  }
  timeCuts.sort((left, right) => left - right);
  const uniqueTimeCuts = timeCuts.filter((timeSeconds, index) => (
    index === 0 || timeSeconds !== timeCuts[index - 1]
  ));
  const unboundSegments: BandoriNativeJudgmentWindowSegment[] = [];
  const lastSegmentIndexByGeometry = new Map<string, number>();

  const appendUnboundSegment = (
    segment: BandoriNativeJudgmentWindowSegment,
  ): void => {
    const geometryKey = [
      segment.noteIndex,
      segment.category,
      segment.timingKind,
      segment.leftLane,
      segment.rightLane,
    ].join(":");
    const previousIndex = lastSegmentIndexByGeometry.get(geometryKey);
    const previous = previousIndex === undefined
      ? null
      : unboundSegments[previousIndex];
    if (previous?.endTimeSeconds === segment.startTimeSeconds) {
      unboundSegments[previousIndex!] = {
        ...previous,
        endTimeSeconds: segment.endTimeSeconds,
      };
      return;
    }
    lastSegmentIndexByGeometry.set(geometryKey, unboundSegments.length);
    unboundSegments.push(segment);
  };

  for (let timeIndex = 1; timeIndex < uniqueTimeCuts.length; timeIndex += 1) {
    const startTimeSeconds = Math.max(
      uniqueTimeCuts[timeIndex - 1],
      minimumInputTimeSeconds,
    );
    const endTimeSeconds = uniqueTimeCuts[timeIndex];
    if (endTimeSeconds <= startTimeSeconds) continue;
    const sampleTimeSeconds = (startTimeSeconds + endTimeSeconds) / 2;
    const winnersByButton = priorityContextsByButton.map((context) => (
      getPriorityWinner(context, sampleTimeSeconds, compiled)
    ));
    let run: Omit<BandoriNativeJudgmentWindowSegment, "endTimeSeconds" | "startTimeSeconds">
      | null = null;
    for (const slab of HORIZONTAL_BUTTON_ORDER_SLABS) {
      let winner: BandoriNativeJudgmentWindowCandidate | null = null;
      for (const button of slab.buttons) {
        winner = winnersByButton[button];
        if (winner) break;
      }
      const category = winner
        ? getDisplayedCategory(
          unboundIntervalsByNoteIndex.get(winner.noteIndex) ?? [],
          sampleTimeSeconds,
        )
        : null;
      const nextRun = winner && category
        ? {
          category,
          leftLane: slab.leftLane,
          noteIndex: winner.noteIndex,
          rightLane: slab.rightLane,
          timingKind: winner.timingKind,
        }
        : null;
      if (
        run
        && nextRun
        && run.noteIndex === nextRun.noteIndex
        && run.category === nextRun.category
        && run.timingKind === nextRun.timingKind
        && run.rightLane === nextRun.leftLane
      ) {
        run = {
          category: run.category,
          leftLane: run.leftLane,
          noteIndex: run.noteIndex,
          rightLane: nextRun.rightLane,
          timingKind: run.timingKind,
        };
        continue;
      }
      if (run) {
        appendUnboundSegment({
          ...run,
          endTimeSeconds,
          startTimeSeconds,
        });
      }
      run = nextRun;
    }
    if (run) {
      appendUnboundSegment({
        ...run,
        endTimeSeconds,
        startTimeSeconds,
      });
    }
  }

  return [...boundSegments, ...unboundSegments].sort((left, right) => (
    left.startTimeSeconds - right.startTimeSeconds
    || left.leftLane - right.leftLane
    || left.endTimeSeconds - right.endTimeSeconds
    || left.noteIndex - right.noteIndex
  ));
}

/**
 * Extracts only the exterior edges of each Note's rectangle union. Perfect and
 * Great remain separate fills, but their shared boundary is internal to the
 * same Note and is therefore omitted from the outline.
 */
export function collectBandoriNativeJudgmentWindowOutlineEdges(
  segments: readonly BandoriNativeJudgmentWindowSegment[],
): BandoriNativeJudgmentWindowOutlineEdge[] {
  const segmentsByNoteIndex = new Map<
    number,
    BandoriNativeJudgmentWindowSegment[]
  >();
  for (const segment of segments) {
    const noteSegments = segmentsByNoteIndex.get(segment.noteIndex);
    if (noteSegments) noteSegments.push(segment);
    else segmentsByNoteIndex.set(segment.noteIndex, [segment]);
  }

  const edges: BandoriNativeJudgmentWindowOutlineEdge[] = [];
  for (const [noteIndex, noteSegments] of segmentsByNoteIndex) {
    const laneCuts = [...new Set(noteSegments.flatMap((segment) => [
      segment.leftLane,
      segment.rightLane,
    ]))].sort((left, right) => left - right);
    const timeCuts = [...new Set(noteSegments.flatMap((segment) => [
      segment.startTimeSeconds,
      segment.endTimeSeconds,
    ]))].sort((left, right) => left - right);
    const laneCellCount = laneCuts.length - 1;
    const timeCellCount = timeCuts.length - 1;
    if (laneCellCount <= 0 || timeCellCount <= 0) continue;

    const laneCutIndexes = new Map(
      laneCuts.map((lane, index) => [lane, index]),
    );
    const timeCutIndexes = new Map(
      timeCuts.map((timeSeconds, index) => [timeSeconds, index]),
    );
    const categoryByCell = Array.from(
      { length: laneCellCount },
      () => Array<BandoriNativeJudgmentWindowSegment["category"] | null>(
        timeCellCount,
      ).fill(null),
    );
    for (const segment of noteSegments) {
      const leftIndex = laneCutIndexes.get(segment.leftLane);
      const rightIndex = laneCutIndexes.get(segment.rightLane);
      const startIndex = timeCutIndexes.get(segment.startTimeSeconds);
      const endIndex = timeCutIndexes.get(segment.endTimeSeconds);
      if (
        leftIndex === undefined
        || rightIndex === undefined
        || startIndex === undefined
        || endIndex === undefined
      ) {
        continue;
      }
      for (let laneIndex = leftIndex; laneIndex < rightIndex; laneIndex += 1) {
        for (let timeIndex = startIndex; timeIndex < endIndex; timeIndex += 1) {
          const existingCategory = categoryByCell[laneIndex][timeIndex];
          if (existingCategory === null || segment.category === "perfect") {
            categoryByCell[laneIndex][timeIndex] = segment.category;
          }
        }
      }
    }

    const getExteriorCategory = (
      first: BandoriNativeJudgmentWindowSegment["category"] | null,
      second: BandoriNativeJudgmentWindowSegment["category"] | null,
    ): BandoriNativeJudgmentWindowSegment["category"] | null => {
      if (first === null) return second;
      if (second === null) return first;
      return null;
    };

    for (let laneBoundary = 0; laneBoundary <= laneCellCount; laneBoundary += 1) {
      let runCategory: BandoriNativeJudgmentWindowSegment["category"] | null = null;
      let runStartIndex = 0;
      for (let timeIndex = 0; timeIndex <= timeCellCount; timeIndex += 1) {
        const category = timeIndex === timeCellCount
          ? null
          : getExteriorCategory(
            laneBoundary === 0
              ? null
              : categoryByCell[laneBoundary - 1][timeIndex],
            laneBoundary === laneCellCount
              ? null
              : categoryByCell[laneBoundary][timeIndex],
          );
        if (category === runCategory) continue;
        if (runCategory !== null) {
          edges.push({
            category: runCategory,
            endLane: laneCuts[laneBoundary],
            endTimeSeconds: timeCuts[timeIndex],
            noteIndex,
            startLane: laneCuts[laneBoundary],
            startTimeSeconds: timeCuts[runStartIndex],
          });
        }
        runCategory = category;
        runStartIndex = timeIndex;
      }
    }

    for (let timeBoundary = 0; timeBoundary <= timeCellCount; timeBoundary += 1) {
      let runCategory: BandoriNativeJudgmentWindowSegment["category"] | null = null;
      let runStartIndex = 0;
      for (let laneIndex = 0; laneIndex <= laneCellCount; laneIndex += 1) {
        const category = laneIndex === laneCellCount
          ? null
          : getExteriorCategory(
            timeBoundary === 0
              ? null
              : categoryByCell[laneIndex][timeBoundary - 1],
            timeBoundary === timeCellCount
              ? null
              : categoryByCell[laneIndex][timeBoundary],
          );
        if (category === runCategory) continue;
        if (runCategory !== null) {
          edges.push({
            category: runCategory,
            endLane: laneCuts[laneIndex],
            endTimeSeconds: timeCuts[timeBoundary],
            noteIndex,
            startLane: laneCuts[runStartIndex],
            startTimeSeconds: timeCuts[timeBoundary],
          });
        }
        runCategory = category;
        runStartIndex = laneIndex;
      }
    }
  }
  return edges;
}
