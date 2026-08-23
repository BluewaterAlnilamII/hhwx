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

type ActiveMusic = {
  contextStartTimeSeconds: number;
  mediaStartTimeSeconds: number;
  playbackRate: number;
  readonly source: AudioBufferSourceNode;
  readonly token: number;
};

type CueUrls = Readonly<Record<BandoriNativeNoteSoundCue, string>>;

export type BandoriNativeNoteSoundCueBank = {
  readonly id: string;
  readonly cueUrls: CueUrls;
};

export const BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS = 0.1;

export type BandoriNativeAudioContextState = AudioContextState | "interrupted";

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
  readonly isMusicPlaying: boolean;
  readonly isMusicPrepared: boolean;
  dispatch(
    events: readonly BandoriNativeNoteSoundEvent[],
    mediaTimeSeconds: number,
    playbackRate: number,
  ): void;
  dispose(): void;
  getContextState(): BandoriNativeAudioContextState | null;
  getMusicTime(): number;
  pauseMusic(): number;
  prepare(): Promise<void>;
  prepareCueBank(
    cueBank: BandoriNativeNoteSoundCueBank,
    onResourceLoaded?: (url: string) => void,
  ): Promise<void>;
  prepareMusic(url: string, signal?: AbortSignal): Promise<void>;
  resume(): Promise<void>;
  selectCueBank(cueBankId: string): void;
  setMusicPlaybackRate(playbackRate: number): number;
  setVolume(volume: number): void;
  startMusic(offsetSeconds: number, playbackRate: number): number;
  startLoop(voiceKey: string, cue: BandoriNativeNoteSoundCue, offsetSeconds?: number): void;
  stopAll(): void;
  subscribeContextState(
    listener: (state: BandoriNativeAudioContextState) => void,
  ): () => void;
  subscribeMusicEnded(listener: () => void): () => void;
};

class WebAudioBandoriNativeNoteSoundRuntime implements BandoriNativeNoteSoundRuntime {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly cueBanks = new Map<string, CueUrls>();
  private readonly buffersByCueBank = new Map<
    string,
    ReadonlyMap<BandoriNativeNoteSoundCue, AudioBuffer>
  >();
  private readonly bufferPromisesByCueBank = new Map<
    string,
    Promise<ReadonlyMap<BandoriNativeNoteSoundCue, AudioBuffer>>
  >();
  private readonly bufferPromisesByUrl = new Map<string, Promise<AudioBuffer>>();
  private readonly activeSources = new Set<AudioBufferSourceNode>();
  private readonly activeLoops = new Map<string, ActiveLoop>();
  private readonly contextStateListeners = new Set<
    (state: BandoriNativeAudioContextState) => void
  >();
  private readonly musicEndedListeners = new Set<() => void>();
  private activeMusic: ActiveMusic | null = null;
  private disposed = false;
  private musicBuffer: AudioBuffer | null = null;
  private musicBufferUrl: string | null = null;
  private musicTimeSeconds = 0;
  private musicToken = 0;

  private readonly handleContextStateChange = () => {
    const state = this.context?.state as BandoriNativeAudioContextState | undefined;
    if (!state) return;
    for (const listener of this.contextStateListeners) listener(state);
  };

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
    return this.buffersByCueBank.has(this.activeCueBankId);
  }

  get isMusicPlaying(): boolean {
    return this.activeMusic !== null;
  }

  get isMusicPrepared(): boolean {
    return this.musicBuffer !== null;
  }

  private assertVolume(volume: number): void {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new Error("Native note sound volume must be from 0 through 1");
    }
  }

  private assertPlaybackRate(playbackRate: number): void {
    if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
      throw new Error("Native music playback rate must be positive");
    }
  }

  private clampMusicTime(timeSeconds: number): number {
    const durationSeconds = this.musicBuffer?.duration ?? 0;
    return Math.max(0, Math.min(durationSeconds, timeSeconds));
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
    context.addEventListener("statechange", this.handleContextStateChange);
    this.handleContextStateChange();
    return context;
  }

  async prepare(): Promise<void> {
    await Promise.all(Array.from(
      this.cueBanks,
      ([id, cueUrls]) => this.prepareCueBank({ id, cueUrls }),
    ));
  }

  async prepareCueBank(
    cueBank: BandoriNativeNoteSoundCueBank,
    onResourceLoaded?: (url: string) => void,
  ): Promise<void> {
    const existingCueUrls = this.cueBanks.get(cueBank.id);
    if (
      existingCueUrls
      && Object.entries(cueBank.cueUrls).some(
        ([cue, url]) => existingCueUrls[cue as BandoriNativeNoteSoundCue] !== url,
      )
    ) {
      throw new Error(`Native note sound cue bank changed in place: ${cueBank.id}`);
    }
    if (!existingCueUrls) this.cueBanks.set(cueBank.id, cueBank.cueUrls);
    if (this.buffersByCueBank.has(cueBank.id)) {
      for (const url of new Set(Object.values(cueBank.cueUrls))) {
        onResourceLoaded?.(url);
      }
      return;
    }
    const existingPromise = this.bufferPromisesByCueBank.get(cueBank.id);
    if (existingPromise) {
      await existingPromise;
      for (const url of new Set(Object.values(cueBank.cueUrls))) {
        onResourceLoaded?.(url);
      }
      return;
    }
    const context = this.getContext();
    const loadBuffer = (url: string): Promise<AudioBuffer> => {
      const existing = this.bufferPromisesByUrl.get(url);
      if (existing) return existing;
      const promise = fetch(url, {
        cache: "force-cache",
        credentials: "omit",
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
    const cueUrls = this.cueBanks.get(cueBank.id);
    if (!cueUrls) throw new Error(`Unknown native note sound cue bank: ${cueBank.id}`);
    const request = Promise.all(Object.entries(cueUrls).map(
      async ([cue, url]) => {
        const buffer = await loadBuffer(url);
        onResourceLoaded?.(url);
        return [cue, buffer] as const;
      },
    )).then((entries) => {
      const buffers = new Map(entries) as ReadonlyMap<
        BandoriNativeNoteSoundCue,
        AudioBuffer
      >;
      this.buffersByCueBank.set(cueBank.id, buffers);
      return buffers;
    }).catch((error) => {
      for (const url of Object.values(cueUrls)) {
        this.bufferPromisesByUrl.delete(url);
      }
      throw error;
    }).finally(() => {
      if (this.bufferPromisesByCueBank.get(cueBank.id) === request) {
        this.bufferPromisesByCueBank.delete(cueBank.id);
      }
    });
    this.bufferPromisesByCueBank.set(cueBank.id, request);
    await request;
  }

  async prepareMusic(url: string, signal?: AbortSignal): Promise<void> {
    if (!url) throw new Error("Native music URL is required");
    if (signal?.aborted) throw this.createAbortError();
    if (this.musicBuffer && this.musicBufferUrl === url) return;
    if (this.musicBufferUrl && this.musicBufferUrl !== url) {
      throw new Error("Native music changed in place");
    }
    const context = this.getContext();
    this.musicBufferUrl = url;
    try {
      const response = await fetch(url, {
        cache: "force-cache",
        credentials: "omit",
        signal,
      });
      if (!response.ok) {
        throw new Error(`Native music fetch failed: HTTP ${response.status}`);
      }
      const audioData = await response.arrayBuffer();
      if (signal?.aborted) throw this.createAbortError();
      const musicBuffer = await context.decodeAudioData(audioData.slice(0));
      if (signal?.aborted) throw this.createAbortError();
      if (musicBuffer.duration <= 0) {
        throw new Error("Native music decoded to an empty buffer");
      }
      this.musicBuffer = musicBuffer;
      this.musicTimeSeconds = 0;
    } catch (error) {
      this.musicBufferUrl = null;
      throw error;
    }
  }

  async resume(): Promise<void> {
    const context = this.getContext();
    if (context.state === "closed") {
      throw new Error("Native note sound audio context is closed");
    }
    if (context.state !== "running") await context.resume();
    if (context.state !== "running") {
      throw new Error("Native note sound audio context did not resume");
    }
  }

  getMusicTime(): number {
    const context = this.context;
    if (!context) return this.clampMusicTime(this.musicTimeSeconds);
    return this.getMusicTimeAt(context.currentTime);
  }

  private getMusicTimeAt(contextTimeSeconds: number): number {
    const activeMusic = this.activeMusic;
    if (!activeMusic) return this.clampMusicTime(this.musicTimeSeconds);
    return this.clampMusicTime(
      activeMusic.mediaStartTimeSeconds
        + Math.max(0, contextTimeSeconds - activeMusic.contextStartTimeSeconds)
          * activeMusic.playbackRate,
    );
  }

  private stopMusicAt(timeSeconds: number): void {
    const activeMusic = this.activeMusic;
    this.musicToken += 1;
    this.activeMusic = null;
    this.musicTimeSeconds = this.clampMusicTime(timeSeconds);
    if (!activeMusic) return;
    activeMusic.source.onended = null;
    try {
      activeMusic.source.stop();
    } catch {
      // A source may have ended immediately before the explicit stop.
    }
    activeMusic.source.disconnect();
  }

  pauseMusic(): number {
    const timeSeconds = this.getMusicTime();
    this.stopMusicAt(timeSeconds);
    return timeSeconds;
  }

  startMusic(offsetSeconds: number, playbackRate: number): number {
    this.assertPlaybackRate(playbackRate);
    if (!Number.isFinite(offsetSeconds)) {
      throw new Error("Native music offset must be finite");
    }
    const context = this.getContext();
    const musicBuffer = this.musicBuffer;
    if (!musicBuffer) throw new Error("Native music is not prepared");
    if (context.state !== "running") throw new Error("Audio output is not running");

    const startTimeSeconds = this.clampMusicTime(offsetSeconds);
    this.stopMusicAt(startTimeSeconds);
    if (startTimeSeconds >= musicBuffer.duration) return startTimeSeconds;

    const source = context.createBufferSource();
    const token = ++this.musicToken;
    const contextStartTimeSeconds = context.currentTime;
    source.buffer = musicBuffer;
    source.playbackRate.setValueAtTime(playbackRate, contextStartTimeSeconds);
    source.connect(context.destination);
    this.activeMusic = {
      contextStartTimeSeconds,
      mediaStartTimeSeconds: startTimeSeconds,
      playbackRate,
      source,
      token,
    };
    source.onended = () => {
      if (
        this.activeMusic?.source !== source
        || this.activeMusic.token !== token
        || this.musicToken !== token
      ) return;
      source.disconnect();
      this.activeMusic = null;
      this.musicTimeSeconds = musicBuffer.duration;
      for (const listener of this.musicEndedListeners) listener();
    };
    source.start(contextStartTimeSeconds, startTimeSeconds);
    return startTimeSeconds;
  }

  setMusicPlaybackRate(playbackRate: number): number {
    this.assertPlaybackRate(playbackRate);
    const activeMusic = this.activeMusic;
    const context = this.context;
    const contextTimeSeconds = context?.currentTime ?? 0;
    const timeSeconds = this.getMusicTimeAt(contextTimeSeconds);
    this.musicTimeSeconds = timeSeconds;
    if (!activeMusic || !context) return timeSeconds;
    activeMusic.source.playbackRate.setValueAtTime(playbackRate, contextTimeSeconds);
    activeMusic.contextStartTimeSeconds = contextTimeSeconds;
    activeMusic.mediaStartTimeSeconds = timeSeconds;
    activeMusic.playbackRate = playbackRate;
    return timeSeconds;
  }

  getContextState(): BandoriNativeAudioContextState | null {
    return (this.context?.state as BandoriNativeAudioContextState | undefined) ?? null;
  }

  selectCueBank(cueBankId: string): void {
    if (!this.buffersByCueBank.has(cueBankId)) {
      throw new Error(`Unprepared native note sound cue bank: ${cueBankId}`);
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
    const activeMusic = this.activeMusic;
    for (const event of events) {
      const when = activeMusic && activeMusic.playbackRate === playbackRate
        ? Math.max(
            contextTimeSeconds,
            activeMusic.contextStartTimeSeconds
              + (event.timeSeconds - activeMusic.mediaStartTimeSeconds) / playbackRate,
          )
        : getBandoriNativeNoteSoundContextTime(
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

  subscribeContextState(
    listener: (state: BandoriNativeAudioContextState) => void,
  ): () => void {
    if (this.disposed) throw new Error("Native note sound runtime is disposed");
    this.contextStateListeners.add(listener);
    const state = this.context?.state as BandoriNativeAudioContextState | undefined;
    if (state) listener(state);
    return () => this.contextStateListeners.delete(listener);
  }

  subscribeMusicEnded(listener: () => void): () => void {
    if (this.disposed) throw new Error("Native note sound runtime is disposed");
    this.musicEndedListeners.add(listener);
    return () => this.musicEndedListeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.pauseMusic();
    this.stopAll();
    this.disposed = true;
    const context = this.context;
    context?.removeEventListener("statechange", this.handleContextStateChange);
    this.contextStateListeners.clear();
    this.musicEndedListeners.clear();
    this.context = null;
    this.masterGain = null;
    this.musicBuffer = null;
    this.musicBufferUrl = null;
    if (context && context.state !== "closed") void context.close();
  }

  private createAbortError(): Error {
    const error = new Error("Native music load was aborted");
    error.name = "AbortError";
    return error;
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
