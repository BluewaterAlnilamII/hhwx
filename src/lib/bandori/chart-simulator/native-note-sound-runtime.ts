import type {
  BandoriNativeNoteSoundCue,
  BandoriNativeNoteSoundEvent,
} from "./native-note-sound-presentation";

type AudioContextConstructor = new () => AudioContext;
type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor;
};

type ActiveLoop = {
  readonly gain: GainNode;
  readonly source: AudioBufferSourceNode;
};

type CueUrls = Readonly<Record<BandoriNativeNoteSoundCue, string>>;

export type BandoriNativeNoteSoundCueBank = {
  readonly id: string;
  readonly cueUrls: CueUrls;
};

export const BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS = 0.1;

export function getBandoriNativeNoteSoundContextTime(
  contextTimeSeconds: number,
  mediaTimeSeconds: number,
  eventTimeSeconds: number,
  playbackRate: number,
): number {
  if (
    !Number.isFinite(contextTimeSeconds)
    || !Number.isFinite(mediaTimeSeconds)
    || !Number.isFinite(eventTimeSeconds)
    || !Number.isFinite(playbackRate)
    || playbackRate <= 0
  ) {
    throw new Error("Native note sound schedule times and playback rate must be valid");
  }
  return contextTimeSeconds
    + Math.max(0, eventTimeSeconds - mediaTimeSeconds) / playbackRate;
}

export type BandoriNativeNoteSoundRuntime = {
  readonly isPrepared: boolean;
  attachMediaElement(mediaElement: HTMLMediaElement): void;
  dispatch(
    events: readonly BandoriNativeNoteSoundEvent[],
    mediaTimeSeconds: number,
    playbackRate: number,
  ): void;
  dispose(): void;
  pause(): Promise<void>;
  prepare(): Promise<void>;
  resume(): Promise<void>;
  selectCueBank(cueBankId: string): void;
  setVolume(volume: number): void;
  startLoop(voiceKey: string, cue: BandoriNativeNoteSoundCue, offsetSeconds?: number): void;
  stopAll(): void;
};

class WebAudioBandoriNativeNoteSoundRuntime implements BandoriNativeNoteSoundRuntime {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly cueBanks = new Map<string, CueUrls>();
  private readonly buffersByCueBank = new Map<
    string,
    ReadonlyMap<BandoriNativeNoteSoundCue, AudioBuffer>
  >();
  private readonly bufferPromisesByUrl = new Map<string, Promise<AudioBuffer>>();
  private readonly activeSources = new Set<AudioBufferSourceNode>();
  private readonly activeLoops = new Map<string, ActiveLoop>();
  private readonly mediaSources = new Map<HTMLMediaElement, MediaElementAudioSourceNode>();
  private preparePromise: Promise<void> | null = null;
  private disposed = false;

  constructor(
    cueBanks: readonly BandoriNativeNoteSoundCueBank[],
    private activeCueBankId: string,
    private volume: number,
  ) {
    this.assertVolume(volume);
    for (const cueBank of cueBanks) {
      if (this.cueBanks.has(cueBank.id)) {
        throw new Error(`Duplicate native note sound cue bank: ${cueBank.id}`);
      }
      this.cueBanks.set(cueBank.id, cueBank.cueUrls);
    }
    if (!this.cueBanks.has(activeCueBankId)) {
      throw new Error(`Unknown native note sound cue bank: ${activeCueBankId}`);
    }
  }

  get isPrepared(): boolean {
    return this.buffersByCueBank.size === this.cueBanks.size;
  }

  private assertVolume(volume: number): void {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new Error("Native note sound volume must be from 0 through 1");
    }
  }

  private getContext(): AudioContext {
    if (this.disposed) throw new Error("Native note sound runtime is disposed");
    if (this.context) return this.context;
    if (typeof window === "undefined") {
      throw new Error("Native note sound playback is only available in the browser");
    }
    const AudioContextCtor = window.AudioContext
      ?? (window as WebAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) throw new Error("Web Audio API is not available");
    const context = new AudioContextCtor();
    const masterGain = context.createGain();
    masterGain.gain.value = this.volume;
    masterGain.connect(context.destination);
    this.context = context;
    this.masterGain = masterGain;
    return context;
  }

  async prepare(): Promise<void> {
    if (this.isPrepared) return;
    if (this.preparePromise) return this.preparePromise;
    const context = this.getContext();
    const loadBuffer = (url: string): Promise<AudioBuffer> => {
      const existing = this.bufferPromisesByUrl.get(url);
      if (existing) return existing;
      const promise = fetch(url, {
        cache: "force-cache",
        credentials: "same-origin",
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Native note sound fetch failed: HTTP ${response.status}`);
        }
        const audioData = await response.arrayBuffer();
        return context.decodeAudioData(audioData.slice(0));
      });
      this.bufferPromisesByUrl.set(url, promise);
      return promise;
    };
    this.preparePromise = Promise.all(Array.from(
      this.cueBanks,
      async ([cueBankId, cueUrls]) => {
        const entries = await Promise.all(Object.entries(cueUrls).map(
          async ([cue, url]) => [cue, await loadBuffer(url)] as const,
        ));
        return [cueBankId, new Map(entries) as ReadonlyMap<
          BandoriNativeNoteSoundCue,
          AudioBuffer
        >] as const;
      },
    )).then((cueBanks) => {
      for (const [cueBankId, buffers] of cueBanks) {
        this.buffersByCueBank.set(cueBankId, buffers);
      }
    }).catch((error) => {
      this.buffersByCueBank.clear();
      this.bufferPromisesByUrl.clear();
      this.preparePromise = null;
      throw error;
    });
    return this.preparePromise;
  }

  attachMediaElement(mediaElement: HTMLMediaElement): void {
    if (this.mediaSources.has(mediaElement)) return;
    const context = this.getContext();
    const source = context.createMediaElementSource(mediaElement);
    source.connect(context.destination);
    this.mediaSources.set(mediaElement, source);
  }

  async resume(): Promise<void> {
    const context = this.getContext();
    if (context.state === "suspended") await context.resume();
  }

  async pause(): Promise<void> {
    const context = this.context;
    if (context?.state === "running") await context.suspend();
  }

  selectCueBank(cueBankId: string): void {
    if (!this.cueBanks.has(cueBankId)) {
      throw new Error(`Unknown native note sound cue bank: ${cueBankId}`);
    }
    this.activeCueBankId = cueBankId;
  }

  setVolume(volume: number): void {
    this.assertVolume(volume);
    this.volume = volume;
    if (this.masterGain && this.context) {
      this.masterGain.gain.setValueAtTime(volume, this.context.currentTime);
    }
  }

  private attachSource(source: AudioBufferSourceNode): void {
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      for (const [voiceKey, activeLoop] of this.activeLoops) {
        if (activeLoop.source === source) this.activeLoops.delete(voiceKey);
      }
    };
  }

  private playOneShot(cue: BandoriNativeNoteSoundCue, when: number): void {
    const context = this.context;
    const masterGain = this.masterGain;
    const buffer = this.buffersByCueBank.get(this.activeCueBankId)?.get(cue);
    if (!context || !masterGain || !buffer) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(masterGain);
    this.attachSource(source);
    source.start(when);
  }

  startLoop(
    voiceKey: string,
    cue: BandoriNativeNoteSoundCue,
    offsetSeconds = 0,
    when?: number,
  ): void {
    if (this.activeLoops.has(voiceKey)) return;
    const context = this.context;
    const masterGain = this.masterGain;
    const buffer = this.buffersByCueBank.get(this.activeCueBankId)?.get(cue);
    if (!context || !masterGain || !buffer || buffer.duration <= 0) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(masterGain);
    this.attachSource(source);
    this.activeLoops.set(voiceKey, { gain, source });
    source.start(
      when ?? context.currentTime,
      Math.max(0, offsetSeconds) % buffer.duration,
    );
  }

  private stopLoop(voiceKey: string, fadeSeconds: number, when: number): void {
    const activeLoop = this.activeLoops.get(voiceKey);
    const context = this.context;
    if (!activeLoop || !context) return;
    this.activeLoops.delete(voiceKey);
    const startTime = Math.max(context.currentTime, when);
    const fade = Math.max(0, fadeSeconds);
    activeLoop.gain.gain.cancelScheduledValues(startTime);
    activeLoop.gain.gain.setValueAtTime(activeLoop.gain.gain.value, startTime);
    activeLoop.gain.gain.linearRampToValueAtTime(0, startTime + fade);
    try {
      activeLoop.source.stop(startTime + fade);
    } catch {
      this.activeSources.delete(activeLoop.source);
    }
  }

  dispatch(
    events: readonly BandoriNativeNoteSoundEvent[],
    mediaTimeSeconds: number,
    playbackRate: number,
  ): void {
    const context = this.context;
    if (
      !context
      || !Number.isFinite(mediaTimeSeconds)
      || !Number.isFinite(playbackRate)
      || playbackRate <= 0
    ) return;
    const contextTimeSeconds = context.currentTime;
    for (const event of events) {
      const when = getBandoriNativeNoteSoundContextTime(
        contextTimeSeconds,
        mediaTimeSeconds,
        event.timeSeconds,
        playbackRate,
      );
      if (event.action === "play-one-shot") {
        this.playOneShot(event.cue, when);
      } else if (event.action === "start-loop" && event.voiceKey) {
        this.startLoop(
          event.voiceKey,
          event.cue,
          Math.max(0, mediaTimeSeconds - event.timeSeconds) / playbackRate,
          when,
        );
      } else if (event.action === "stop-loop" && event.voiceKey) {
        this.stopLoop(event.voiceKey, event.fadeSeconds, when);
      }
    }
  }

  stopAll(): void {
    this.activeLoops.clear();
    for (const source of this.activeSources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // A source may already have ended between the Set iteration and stop().
      }
    }
    this.activeSources.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.stopAll();
    this.disposed = true;
    for (const source of this.mediaSources.values()) source.disconnect();
    this.mediaSources.clear();
    const context = this.context;
    this.context = null;
    this.masterGain = null;
    if (context && context.state !== "closed") void context.close();
  }
}

export function createBandoriNativeNoteSoundRuntime(
  cueBanks: readonly BandoriNativeNoteSoundCueBank[],
  activeCueBankId: string,
  volume: number,
): BandoriNativeNoteSoundRuntime {
  return new WebAudioBandoriNativeNoteSoundRuntime(
    cueBanks,
    activeCueBankId,
    volume,
  );
}
