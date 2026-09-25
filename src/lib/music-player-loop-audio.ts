import type { MusicPlayerItem } from "@/lib/music-player-contract";
import { clampMusicPlayerSeekPosition } from "@/lib/music-player-seek";

type Loop = NonNullable<MusicPlayerItem["loop"]>;

type LoopAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let primedContext: AudioContext | null = null;
let primedResume: Promise<void> | null = null;

export function primeMusicPlayerLoopAudio(): void {
  if (typeof window === "undefined") return;
  const AudioContextCtor = window.AudioContext
    ?? (window as LoopAudioWindow).webkitAudioContext;
  if (!AudioContextCtor) return;
  try {
    primedContext ??= new AudioContextCtor();
    if (primedContext.state === "suspended") {
      primedResume = primedContext.resume();
      void primedResume.catch(() => undefined);
    }
  } catch {
    if (primedContext) void primedContext.close().catch(() => undefined);
    primedContext = null;
    primedResume = null;
  }
}

export function shouldLoopMusicAtPosition(
  repeatOne: boolean,
  positionSeconds: number,
  loop: Loop,
): boolean {
  return repeatOne && positionSeconds < loop.endSeconds;
}

export function getMusicLoopPosition(
  offsetSeconds: number,
  elapsedSeconds: number,
  durationSeconds: number,
  loop: Loop,
  looping: boolean,
): number {
  const position = offsetSeconds + Math.max(0, elapsedSeconds);
  if (!looping || position < loop.endSeconds) {
    return Math.min(durationSeconds, position);
  }
  return loop.startSeconds
    + (position - loop.endSeconds) % (loop.endSeconds - loop.startSeconds);
}

export function createMusicPlayerLoopAudio(
  sourceUrl: string,
  loop: Loop,
  onPosition: (positionSeconds: number, durationSeconds: number) => void,
  onEnded: () => void,
) {
  let context: AudioContext | null = null;
  let gain: GainNode | null = null;
  let buffer: AudioBuffer | null = null;
  let source: AudioBufferSourceNode | null = null;
  let loadPromise: Promise<AudioBuffer> | null = null;
  let tick: number | null = null;
  let offsetSeconds = 0;
  let contextStartTime = 0;
  let repeatOne = false;
  let looping = false;
  let volume = 1;
  let disposed = false;
  const controller = new AbortController();

  const getPosition = () => source && context && buffer
    ? getMusicLoopPosition(
        offsetSeconds,
        context.currentTime - contextStartTime,
        buffer.duration,
        loop,
        looping,
      )
    : offsetSeconds;

  const publishPosition = () => {
    if (buffer) onPosition(getPosition(), buffer.duration);
  };

  const stopSource = () => {
    if (tick !== null) window.clearInterval(tick);
    tick = null;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // A source may have ended before its completion event reaches this task.
    }
    source.disconnect();
    source = null;
  };

  const startSource = () => {
    if (!context || !buffer || !gain || disposed) return;
    stopSource();
    offsetSeconds = Math.min(buffer.duration, Math.max(0, offsetSeconds));
    looping = shouldLoopMusicAtPosition(repeatOne, offsetSeconds, loop);
    const decoded = buffer;
    const nextSource = context.createBufferSource();
    nextSource.buffer = buffer;
    nextSource.loopStart = loop.startSeconds;
    nextSource.loopEnd = loop.endSeconds;
    nextSource.loop = looping;
    nextSource.connect(gain);
    nextSource.onended = () => {
      if (source !== nextSource || disposed) return;
      if (tick !== null) window.clearInterval(tick);
      tick = null;
      source = null;
      nextSource.disconnect();
      offsetSeconds = decoded.duration;
      publishPosition();
      onEnded();
    };
    source = nextSource;
    contextStartTime = context.currentTime;
    nextSource.start(0, offsetSeconds);
    publishPosition();
    tick = window.setInterval(publishPosition, 250);
  };

  return {
    prepare: async () => {
      if (disposed) throw new Error("Music playback was disposed");
      let resume: Promise<void> | null = null;
      if (!context) {
        const AudioContextCtor = window.AudioContext
          ?? (window as LoopAudioWindow).webkitAudioContext;
        if (!AudioContextCtor) throw new Error("Web Audio API is not available");
        context = primedContext ?? new AudioContextCtor();
        resume = primedResume;
        primedContext = null;
        primedResume = null;
        gain = context.createGain();
        gain.gain.value = volume;
        gain.connect(context.destination);
      } else if (primedContext) {
        const unused = primedContext;
        primedContext = null;
        primedResume = null;
        void unused.close().catch(() => undefined);
      }
      resume ??= context.state === "suspended" ? context.resume() : Promise.resolve();
      loadPromise ??= fetch(sourceUrl, {
        cache: "force-cache",
        credentials: "omit",
        mode: "cors",
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error(`Music fetch failed: HTTP ${response.status}`);
        return response.arrayBuffer();
      }).then((data) => context!.decodeAudioData(data)).catch((error: unknown) => {
        loadPromise = null;
        throw error;
      });
      const [, decoded] = await Promise.all([resume, loadPromise]);
      if (disposed) throw new Error("Music playback was disposed");
      if (
        !Number.isFinite(loop.startSeconds)
        || !Number.isFinite(loop.endSeconds)
        || loop.startSeconds < 0
        || loop.endSeconds <= loop.startSeconds
        || loop.endSeconds > decoded.duration
      ) {
        throw new Error("Invalid music loop range");
      }
      buffer = decoded;
      publishPosition();
    },
    start: (restart = false) => {
      if (restart) offsetSeconds = 0;
      startSource();
    },
    pause: () => {
      offsetSeconds = getPosition();
      stopSource();
      publishPosition();
    },
    seek: (positionSeconds: number) => {
      offsetSeconds = clampMusicPlayerSeekPosition(
        positionSeconds,
        buffer?.duration ?? Number.POSITIVE_INFINITY,
      );
      const wasPlaying = source !== null;
      stopSource();
      if (wasPlaying) startSource();
      else publishPosition();
      return offsetSeconds;
    },
    setRepeatOne: (enabled: boolean) => {
      if (source && context) {
        offsetSeconds = getPosition();
        contextStartTime = context.currentTime;
      }
      repeatOne = enabled;
      looping = shouldLoopMusicAtPosition(repeatOne, offsetSeconds, loop);
      if (source) source.loop = looping;
      publishPosition();
    },
    setVolume: (nextVolume: number) => {
      volume = nextVolume;
      if (gain) gain.gain.value = volume;
    },
    getPosition,
    getDuration: () => buffer?.duration ?? 0,
    dispose: () => {
      disposed = true;
      controller.abort();
      stopSource();
      buffer = null;
      loadPromise = null;
      gain?.disconnect();
      gain = null;
      if (context) void context.close().catch(() => undefined);
      context = null;
    },
  };
}
