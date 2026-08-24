import type createSignalsmithStretch from "signalsmith-stretch";

export type BandoriMusicPlaybackBackend = "native" | "signalsmith";

export const BANDORI_MUSIC_DSP_PREPARATION_TIMEOUT_MS = 10_000;

export type BandoriMusicPlaybackState = {
  readonly effectiveBackend: BandoriMusicPlaybackBackend;
  readonly generation: number;
  readonly isSignalsmithPrepared: boolean;
  readonly latencySeconds: number;
  readonly status: "idle" | "preparing" | "ready" | "playing" | "error";
};

export type SignalsmithSchedule = {
  readonly active: boolean;
  readonly input?: number;
  readonly output: number;
  readonly rate?: number;
  readonly semitones?: number;
};

export type PreparedSignalsmithPlayback = {
  readonly latencySeconds: number;
  readonly node: Awaited<ReturnType<typeof createSignalsmithStretch>>;
};

export const SIGNALSMITH_PROCESSOR_URL =
  "/res/bandori/chart-simulator/signalsmith-stretch-1.3.2.mjs";

async function waitForDspPreparation<T>(
  request: Promise<T>,
  label: string,
  onLateResolve?: (value: T) => void,
): Promise<T> {
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  void request.then(
    (value) => {
      if (!didTimeout || !onLateResolve) return;
      try {
        onLateResolve(value);
      } catch {
        // The caller already owns the timeout error; late cleanup is best-effort.
      }
    },
    () => undefined,
  );
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      reject(new Error(
        `${label} timed out after ${BANDORI_MUSIC_DSP_PREPARATION_TIMEOUT_MS} ms`,
      ));
    }, BANDORI_MUSIC_DSP_PREPARATION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

export function createSignalsmithSchedule({
  active,
  input,
  output,
  rate,
}: {
  active: boolean;
  input?: number;
  output: number;
  rate?: number;
}): SignalsmithSchedule {
  return {
    active,
    ...(input === undefined ? {} : { input }),
    output,
    ...(rate === undefined ? {} : { rate }),
    semitones: 0,
  };
}

export async function scheduleSignalsmithPlayback(
  node: PreparedSignalsmithPlayback["node"],
  schedule: SignalsmithSchedule,
): Promise<void> {
  await waitForDspPreparation(
    node.schedule(schedule),
    "Signalsmith schedule",
  );
}

export function getBandoriMusicTimeAtContextTime({
  contextStartTimeSeconds,
  contextTimeSeconds,
  durationSeconds,
  mediaStartTimeSeconds,
  playbackRate,
}: {
  contextStartTimeSeconds: number;
  contextTimeSeconds: number;
  durationSeconds: number;
  mediaStartTimeSeconds: number;
  playbackRate: number;
}): number {
  if (
    !Number.isFinite(contextStartTimeSeconds)
    || !Number.isFinite(contextTimeSeconds)
    || !Number.isFinite(durationSeconds)
    || !Number.isFinite(mediaStartTimeSeconds)
    || !Number.isFinite(playbackRate)
    || durationSeconds < 0
    || playbackRate <= 0
  ) {
    throw new Error("Music playback clock values must be valid");
  }
  return Math.max(
    0,
    Math.min(
      durationSeconds,
      mediaStartTimeSeconds
        + Math.max(0, contextTimeSeconds - contextStartTimeSeconds) * playbackRate,
    ),
  );
}

export async function prepareSignalsmithPlayback(
  context: AudioContext,
  musicBuffer: AudioBuffer,
): Promise<PreparedSignalsmithPlayback> {
  const { default: createStretch } = await import("signalsmith-stretch");
  // Avoid the package's blob/stringification bootstrap. Serving the exact
  // versioned module gives the Worklet a stable same-origin URL and lets CSP,
  // caching, and production behavior stay deterministic.
  createStretch.moduleUrl = SIGNALSMITH_PROCESSOR_URL;
  const node = await waitForDspPreparation(
    createStretch(context, {
      // 1.3.2 expects inputList[0] to exist even in buffer mode. An unconnected
      // input is exposed as an empty channel array, so the processor reads the
      // PCM supplied through addBuffers() instead of its live-input branch.
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [musicBuffer.numberOfChannels],
    }),
    "Signalsmith Worklet initialization",
    (lateNode) => {
      lateNode.disconnect();
      lateNode.port.close();
    },
  );
  try {
    const channels = Array.from(
      { length: musicBuffer.numberOfChannels },
      (_, channel) => musicBuffer.getChannelData(channel).slice(),
    );
    const bufferedDurationSeconds = await waitForDspPreparation(
      node.addBuffers(
        channels,
        channels.map((channel) => channel.buffer),
      ),
      "Signalsmith PCM transfer",
    );
    if (
      !Number.isFinite(bufferedDurationSeconds)
      || Math.abs(bufferedDurationSeconds - musicBuffer.duration)
        > 1 / musicBuffer.sampleRate
    ) {
      throw new Error("Signalsmith did not retain the complete PCM buffer");
    }
    const latencySeconds = await waitForDspPreparation(
      node.latency(),
      "Signalsmith latency query",
    );
    if (!Number.isFinite(latencySeconds) || latencySeconds < 0) {
      throw new Error("Signalsmith reported an invalid latency");
    }
    return { latencySeconds, node };
  } catch (error) {
    node.disconnect();
    node.port.close();
    throw error;
  }
}
