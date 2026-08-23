export type BandoriChartTransportPhase =
  | "ready"
  | "playing"
  | "paused"
  | "scrubbing"
  | "ended";

export type BandoriChartTransportState = {
  phase: BandoriChartTransportPhase;
  durationSeconds: number;
  currentTimeSeconds: number;
  previewTimeSeconds: number | null;
  shouldResumeAfterInteraction: boolean;
};

function clampTime(durationSeconds: number, timeSeconds: number): number {
  return Math.max(0, Math.min(durationSeconds, timeSeconds));
}

export function createBandoriChartTransportState(
  durationSeconds: number,
): BandoriChartTransportState {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("durationSeconds must be a positive finite number");
  }
  return {
    phase: "ready",
    durationSeconds,
    currentTimeSeconds: 0,
    previewTimeSeconds: null,
    shouldResumeAfterInteraction: false,
  };
}

export function playBandoriChartTransport(
  state: BandoriChartTransportState,
): BandoriChartTransportState {
  if (state.phase === "scrubbing") return state;
  return {
    ...state,
    phase: "playing",
    currentTimeSeconds: state.phase === "ended" ? 0 : state.currentTimeSeconds,
    previewTimeSeconds: null,
    shouldResumeAfterInteraction: false,
  };
}

export function pauseBandoriChartTransport(
  state: BandoriChartTransportState,
): BandoriChartTransportState {
  if (state.phase !== "playing") return state;
  return { ...state, phase: "paused", shouldResumeAfterInteraction: false };
}

export function syncBandoriChartMediaTime(
  state: BandoriChartTransportState,
  mediaTimeSeconds: number,
): BandoriChartTransportState {
  if (!Number.isFinite(mediaTimeSeconds)) throw new Error("mediaTimeSeconds must be finite");
  if (state.phase !== "playing") return state;
  const currentTimeSeconds = clampTime(state.durationSeconds, mediaTimeSeconds);
  return {
    ...state,
    phase: currentTimeSeconds >= state.durationSeconds ? "ended" : "playing",
    currentTimeSeconds,
  };
}

export function restartBandoriChartTransport(
  state: BandoriChartTransportState,
): BandoriChartTransportState {
  return {
    ...state,
    phase: state.phase === "playing" ? "playing" : "ready",
    currentTimeSeconds: 0,
    previewTimeSeconds: null,
    shouldResumeAfterInteraction: false,
  };
}

export function beginBandoriChartScrub(
  state: BandoriChartTransportState,
): BandoriChartTransportState {
  if (state.phase === "scrubbing") return state;
  return {
    ...state,
    phase: "scrubbing",
    previewTimeSeconds: state.currentTimeSeconds,
    shouldResumeAfterInteraction: state.phase === "playing",
  };
}

export function previewBandoriChartScrub(
  state: BandoriChartTransportState,
  previewTimeSeconds: number,
): BandoriChartTransportState {
  if (!Number.isFinite(previewTimeSeconds)) throw new Error("previewTimeSeconds must be finite");
  if (state.phase !== "scrubbing") return state;
  return {
    ...state,
    previewTimeSeconds: clampTime(state.durationSeconds, previewTimeSeconds),
  };
}

export function commitBandoriChartScrub(
  state: BandoriChartTransportState,
): BandoriChartTransportState {
  if (state.phase !== "scrubbing" || state.previewTimeSeconds === null) return state;
  const currentTimeSeconds = state.previewTimeSeconds;
  return {
    ...state,
    phase: state.shouldResumeAfterInteraction && currentTimeSeconds < state.durationSeconds
      ? "playing"
      : currentTimeSeconds >= state.durationSeconds ? "ended" : "paused",
    currentTimeSeconds,
    previewTimeSeconds: null,
    shouldResumeAfterInteraction: false,
  };
}

export function jumpBandoriChartTransport(
  state: BandoriChartTransportState,
  deltaSeconds: -5 | 5,
): BandoriChartTransportState {
  if (state.phase === "scrubbing") return state;
  const currentTimeSeconds = clampTime(
    state.durationSeconds,
    state.currentTimeSeconds + deltaSeconds,
  );
  return {
    ...state,
    phase: currentTimeSeconds >= state.durationSeconds
      ? "ended"
      : state.phase === "playing" ? "playing" : "paused",
    currentTimeSeconds,
  };
}

export function getBandoriChartPresentationTime(
  state: BandoriChartTransportState,
): number {
  return state.previewTimeSeconds ?? state.currentTimeSeconds;
}
