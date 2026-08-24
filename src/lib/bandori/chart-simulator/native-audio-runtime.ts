import type {
  BandoriNativeNoteSoundCue,
  BandoriNativeNoteSoundEvent,
} from "./native-note-sound-presentation";
import {
  createSignalsmithSchedule,
  getBandoriMusicTimeAtContextTime,
  prepareSignalsmithPlayback,
  scheduleSignalsmithPlayback,
  type BandoriMusicPlaybackBackend,
  type BandoriMusicPlaybackState,
  type PreparedSignalsmithPlayback,
} from "./music-playback-backends";

type AudioContextConstructor = new () => AudioContext;
type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor;
};

type ActiveLoop = {
  readonly gain: GainNode;
  readonly source: AudioBufferSourceNode;
};

type ActiveMusic = {
  readonly cleanup: (contextStopTimeSeconds?: number) => void;
  readonly contextStartTimeSeconds: number;
  readonly effectiveBackend: BandoriMusicPlaybackBackend;
  readonly mediaStartTimeSeconds: number;
  readonly playbackRate: number;
  readonly token: number;
};

type MusicPresentationTail = {
  readonly contextEndTimeSeconds: number;
  readonly contextStartTimeSeconds: number;
  readonly mediaStartTimeSeconds: number;
  readonly playbackRate: number;
};

type PendingSignalsmithInactiveFence = {
  readonly prepared: PreparedSignalsmithPlayback;
  readonly result: Promise<Error | null>;
};

type CueUrls = Readonly<Record<BandoriNativeNoteSoundCue, string>>;

export type BandoriNativeNoteSoundCueBank = {
  readonly id: string;
  readonly cueUrls: CueUrls;
};

export const BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS = 0.1;
const BANDORI_EXPERIMENTAL_NOTE_SOUND_FALLBACK_RENDER_LEAD_SECONDS = 0.25;
const BANDORI_MUSIC_PRESENTATION_HANDOFF_TIMEOUT_MS = 10_000;

export function getBandoriNativeNoteSoundScheduleAheadMediaSeconds(
  outputRenderLeadSeconds: number,
  playbackRate: number,
): number {
  if (
    !Number.isFinite(outputRenderLeadSeconds)
    || outputRenderLeadSeconds < 0
    || !Number.isFinite(playbackRate)
    || playbackRate <= 0
  ) {
    throw new Error("Note sound look-ahead values must be valid");
  }
  return (
    BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS + outputRenderLeadSeconds
  ) * playbackRate;
}

export type BandoriNativeAudioContextState = AudioContextState | "interrupted";

export type BandoriMusicStartResult = {
  readonly contextTimeSeconds: number;
  readonly effectiveBackend: BandoriMusicPlaybackBackend;
  readonly latencySeconds: number;
  readonly mediaTimeSeconds: number;
};

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

export type BandoriNativeAudioRuntime = {
  readonly isPrepared: boolean;
  readonly isMusicPlaying: boolean;
  readonly isMusicPresentationTransitioning: boolean;
  readonly isMusicPrepared: boolean;
  dispatch(
    events: readonly BandoriNativeNoteSoundEvent[],
    mediaTimeSeconds: number,
    playbackRate: number,
  ): void;
  dispose(): void;
  getContextState(): BandoriNativeAudioContextState | null;
  getMusicContextTime(mediaTimeSeconds: number): number | null;
  getNoteSoundScheduleAheadMediaSeconds(playbackRate: number): number;
  getMusicPlaybackState(): BandoriMusicPlaybackState;
  getMusicTime(): number;
  pauseMusic(): number;
  prepare(): Promise<void>;
  prepareCueBank(
    cueBank: BandoriNativeNoteSoundCueBank,
    onResourceLoaded?: (url: string) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  prepareMusic(url: string, signal?: AbortSignal): Promise<void>;
  resume(): Promise<void>;
  selectCueBank(cueBankId: string): void;
  setVolume(volume: number): void;
  startMusic(
    offsetSeconds: number,
    playbackRate: number,
  ): Promise<BandoriMusicStartResult>;
  startLoop(
    voiceKey: string,
    cue: BandoriNativeNoteSoundCue,
    offsetSeconds?: number,
    when?: number,
  ): void;
  stopAll(): void;
  subscribeContextState(
    listener: (state: BandoriNativeAudioContextState) => void,
  ): () => void;
  subscribeMusicEnded(listener: () => void): () => void;
  subscribeMusicPlaybackError(
    listener: (error: Error, continuationTimeSeconds: number) => void,
  ): () => void;
  subscribeMusicPlaybackState(
    listener: (state: BandoriMusicPlaybackState) => void,
  ): () => void;
};

class WebAudioBandoriNativeAudioRuntime implements BandoriNativeAudioRuntime {
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
  private readonly musicPlaybackErrorListeners = new Set<
    (error: Error, continuationTimeSeconds: number) => void
  >();
  private readonly musicPlaybackStateListeners = new Set<
    (state: BandoriMusicPlaybackState) => void
  >();
  private activeMusic: ActiveMusic | null = null;
  private disposed = false;
  private musicBuffer: AudioBuffer | null = null;
  private musicBufferUrl: string | null = null;
  private preparedSignalsmith: PreparedSignalsmithPlayback | null = null;
  private preparedSignalsmithPromise: Promise<PreparedSignalsmithPlayback> | null = null;
  private pendingSignalsmithInactiveFence: PendingSignalsmithInactiveFence | null = null;
  private isSignalsmithConnected = false;
  private signalsmithProcessorErrorCleanup: (() => void) | null = null;
  private musicPresentationTail: MusicPresentationTail | null = null;
  private musicTimeSeconds = 0;
  private musicToken = 0;
  private musicPlaybackState: BandoriMusicPlaybackState;

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
    this.musicPlaybackState = {
      effectiveBackend: "native",
      generation: 0,
      isSignalsmithPrepared: false,
      latencySeconds: 0,
      status: "idle",
    };
  }

  get isPrepared(): boolean {
    return this.buffersByCueBank.has(this.activeCueBankId);
  }

  get isMusicPlaying(): boolean {
    return this.activeMusic !== null || this.hasPendingMusicPresentationTail();
  }

  get isMusicPresentationTransitioning(): boolean {
    const presentationContextTime = this.getPresentationContextTime();
    if (this.getMusicPresentationTailAt(presentationContextTime) !== null) {
      return true;
    }
    return this.activeMusic !== null
      && presentationContextTime < this.activeMusic.contextStartTimeSeconds;
  }

  get isMusicPrepared(): boolean {
    return this.musicBuffer !== null;
  }

  getMusicPlaybackState(): BandoriMusicPlaybackState {
    return this.musicPlaybackState;
  }

  private updateMusicPlaybackState(
    update: Partial<BandoriMusicPlaybackState>,
  ): void {
    this.musicPlaybackState = {
      ...this.musicPlaybackState,
      ...update,
    };
    for (const listener of this.musicPlaybackStateListeners) {
      listener(this.musicPlaybackState);
    }
  }

  private assertVolume(volume: number): void {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new Error("Native note sound volume must be from 0 through 1");
    }
  }

  private assertPlaybackRate(playbackRate: number): void {
    if (!Number.isFinite(playbackRate) || playbackRate <= 0 || playbackRate > 1) {
      throw new Error("Music playback rate must be greater than 0 and at most 1");
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
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw this.createAbortError();
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
        signal,
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
    this.updateMusicPlaybackState({ status: "preparing" });
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
      if (signal?.aborted) throw this.createAbortError();
      this.musicBuffer = musicBuffer;
      this.musicTimeSeconds = 0;
      this.updateMusicPlaybackState({
        effectiveBackend: "native",
        isSignalsmithPrepared: false,
        latencySeconds: 0,
        status: "ready",
      });
    } catch (error) {
      this.musicBufferUrl = null;
      this.updateMusicPlaybackState({ status: "error" });
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
    return this.getMusicTimeAt(this.getPresentationContextTime());
  }

  private getPresentationContextTime(): number {
    const context = this.context;
    if (!context) return 0;
    const timestamp = context.getOutputTimestamp?.();
    const outputContextTime = timestamp?.contextTime;
    return Number.isFinite(outputContextTime)
      && (outputContextTime as number) >= 0
      && (outputContextTime as number) <= context.currentTime
      ? (outputContextTime as number)
      : Math.max(
          0,
          context.currentTime - this.getFallbackOutputRenderLeadSeconds(context),
        );
  }

  private getMusicTimeAt(contextTimeSeconds: number): number {
    const timeSeconds = this.calculateMusicTimeAt(contextTimeSeconds);
    const durationSeconds = this.musicBuffer?.duration ?? 0;
    const activeMusic = this.activeMusic;
    const isPresentingTail = this.getMusicPresentationTailAt(contextTimeSeconds) !== null;
    if (
      activeMusic
      && !isPresentingTail
      && contextTimeSeconds >= activeMusic.contextStartTimeSeconds
      && timeSeconds >= durationSeconds
      && durationSeconds > 0
    ) {
      this.finishMusicAtEnd(activeMusic.token);
    }
    return timeSeconds;
  }

  private calculateMusicTimeAt(contextTimeSeconds: number): number {
    const presentationTailTime = this.getMusicPresentationTailAt(contextTimeSeconds);
    if (presentationTailTime !== null) return presentationTailTime;
    return this.calculateMusicRenderTimeAt(contextTimeSeconds);
  }

  private calculateMusicRenderTimeAt(contextTimeSeconds: number): number {
    const activeMusic = this.activeMusic;
    if (!activeMusic) return this.clampMusicTime(this.musicTimeSeconds);
    const durationSeconds = this.musicBuffer?.duration ?? 0;
    return getBandoriMusicTimeAtContextTime({
      contextStartTimeSeconds: activeMusic.contextStartTimeSeconds,
      contextTimeSeconds,
      durationSeconds,
      mediaStartTimeSeconds: activeMusic.mediaStartTimeSeconds,
      playbackRate: activeMusic.playbackRate,
    });
  }

  private getMusicPresentationTailAt(contextTimeSeconds: number): number | null {
    const tail = this.musicPresentationTail;
    if (!tail) return null;
    if (contextTimeSeconds >= tail.contextEndTimeSeconds) {
      this.musicPresentationTail = null;
      return null;
    }
    return getBandoriMusicTimeAtContextTime({
      contextStartTimeSeconds: tail.contextStartTimeSeconds,
      contextTimeSeconds,
      durationSeconds: this.musicBuffer?.duration ?? 0,
      mediaStartTimeSeconds: tail.mediaStartTimeSeconds,
      playbackRate: tail.playbackRate,
    });
  }

  private hasPendingMusicPresentationTail(): boolean {
    return this.getMusicPresentationTailAt(this.getPresentationContextTime()) !== null;
  }

  private getFallbackOutputRenderLeadSeconds(context: AudioContext): number {
    const baseLatencySeconds = Number.isFinite(context.baseLatency)
      ? Math.max(0, context.baseLatency)
      : 0;
    const outputLatencySeconds = Number.isFinite(context.outputLatency)
      ? Math.max(0, context.outputLatency)
      : 0;
    const reportedRenderLeadSeconds = baseLatencySeconds + outputLatencySeconds;
    return reportedRenderLeadSeconds > 0
      ? reportedRenderLeadSeconds
      : BANDORI_EXPERIMENTAL_NOTE_SOUND_FALLBACK_RENDER_LEAD_SECONDS;
  }

  getMusicContextTime(mediaTimeSeconds: number): number | null {
    if (!Number.isFinite(mediaTimeSeconds)) return null;
    const activeMusic = this.activeMusic;
    if (!activeMusic) return null;
    return activeMusic.contextStartTimeSeconds
      + (mediaTimeSeconds - activeMusic.mediaStartTimeSeconds)
        / activeMusic.playbackRate;
  }

  getNoteSoundScheduleAheadMediaSeconds(playbackRate: number): number {
    this.assertPlaybackRate(playbackRate);
    const context = this.context;
    const activeMusic = this.activeMusic;
    if (!context || !activeMusic) {
      return getBandoriNativeNoteSoundScheduleAheadMediaSeconds(0, playbackRate);
    }
    const timestamp = context.getOutputTimestamp?.();
    const outputContextTime = timestamp?.contextTime;
    const observedRenderLeadSeconds = Number.isFinite(outputContextTime)
      && (outputContextTime as number) >= 0
      && (outputContextTime as number) <= context.currentTime
      ? context.currentTime - (outputContextTime as number)
      : 0;
    const fallbackRenderLeadSeconds = this.getFallbackOutputRenderLeadSeconds(context);
    const outputRenderLeadSeconds = Math.max(
      observedRenderLeadSeconds,
      fallbackRenderLeadSeconds,
    );
    return getBandoriNativeNoteSoundScheduleAheadMediaSeconds(
      outputRenderLeadSeconds,
      playbackRate,
    );
  }

  private notifyMusicPlaybackError(
    error: Error,
    continuationTimeSeconds: number,
  ): void {
    for (const listener of this.musicPlaybackErrorListeners) {
      listener(error, continuationTimeSeconds);
    }
  }

  private releaseSignalsmithPlayback(
    prepared: PreparedSignalsmithPlayback,
  ): void {
    if (this.preparedSignalsmith !== prepared) return;
    this.signalsmithProcessorErrorCleanup?.();
    this.signalsmithProcessorErrorCleanup = null;
    this.preparedSignalsmith = null;
    if (this.pendingSignalsmithInactiveFence?.prepared === prepared) {
      this.pendingSignalsmithInactiveFence = null;
    }
    this.updateMusicPlaybackState({ isSignalsmithPrepared: false });
    this.isSignalsmithConnected = false;
    prepared.node.disconnect();
    prepared.node.port.close();
  }

  private handleSignalsmithProcessorError(
    prepared: PreparedSignalsmithPlayback,
  ): void {
    if (this.disposed || this.preparedSignalsmith !== prepared) return;
    const activeMusic = this.activeMusic;
    const isSignalsmithPlaying = activeMusic?.effectiveBackend === "signalsmith";
    const isSignalsmithPreparing = !activeMusic
      && this.musicPlaybackState.status === "preparing";
    const continuationTimeSeconds = isSignalsmithPlaying && this.context
      ? this.calculateMusicRenderTimeAt(this.context.currentTime)
      : this.clampMusicTime(this.musicTimeSeconds);
    this.releaseSignalsmithPlayback(prepared);
    if (!isSignalsmithPlaying && !isSignalsmithPreparing) return;
    this.musicToken += 1;
    if (isSignalsmithPlaying) {
      this.activeMusic = null;
      activeMusic.cleanup();
    }
    this.musicTimeSeconds = continuationTimeSeconds;
    this.updateMusicPlaybackState({ status: "error" });
    this.notifyMusicPlaybackError(
      new Error("Signalsmith AudioWorklet processor failed"),
      continuationTimeSeconds,
    );
  }

  private finishMusicAtEnd(token: number): void {
    const activeMusic = this.activeMusic;
    const durationSeconds = this.musicBuffer?.duration ?? 0;
    if (!activeMusic || activeMusic.token !== token || this.musicToken !== token) return;
    if (activeMusic.effectiveBackend === "signalsmith") {
      this.stopPreparedSignalsmithAtCurrentTime();
    }
    this.activeMusic = null;
    this.musicTimeSeconds = durationSeconds;
    activeMusic.cleanup();
    this.updateMusicPlaybackState({ status: "ready" });
    for (const listener of this.musicEndedListeners) listener();
  }

  private captureMusicPresentationTail(
    activeMusic: ActiveMusic,
    contextEndTimeSeconds: number,
  ): void {
    const context = this.context;
    if (!context) return;
    if (this.getPresentationContextTime() >= contextEndTimeSeconds) {
      this.musicPresentationTail = null;
      return;
    }
    this.musicPresentationTail = {
      contextEndTimeSeconds,
      contextStartTimeSeconds: activeMusic.contextStartTimeSeconds,
      mediaStartTimeSeconds: activeMusic.mediaStartTimeSeconds,
      playbackRate: activeMusic.playbackRate,
    };
  }

  private stopMusicAt(
    timeSeconds: number,
    contextStopTimeSeconds = this.context?.currentTime,
  ): void {
    const activeMusic = this.activeMusic;
    if (activeMusic && contextStopTimeSeconds !== undefined) {
      this.captureMusicPresentationTail(activeMusic, contextStopTimeSeconds);
    }
    this.musicToken += 1;
    this.stopPreparedSignalsmithAtCurrentTime(contextStopTimeSeconds);
    this.activeMusic = null;
    this.musicTimeSeconds = this.clampMusicTime(timeSeconds);
    activeMusic?.cleanup(contextStopTimeSeconds);
    if (this.musicBuffer && this.musicPlaybackState.status !== "error") {
      this.updateMusicPlaybackState({ status: "ready" });
    }
  }

  private async waitForMusicPresentationTail(token: number): Promise<void> {
    const deadlineMs = Date.now() + BANDORI_MUSIC_PRESENTATION_HANDOFF_TIMEOUT_MS;
    while (this.hasPendingMusicPresentationTail()) {
      if (this.musicToken !== token) {
        throw new Error("Music playback start was superseded");
      }
      if (Date.now() >= deadlineMs) {
        throw new Error("Music output handoff timed out");
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 16);
      });
    }
    if (this.musicToken !== token) {
      throw new Error("Music playback start was superseded");
    }
  }

  private stopPreparedSignalsmithAtCurrentTime(
    contextStopTimeSeconds = this.context?.currentTime,
  ): void {
    const context = this.context;
    const preparedSignalsmith = this.preparedSignalsmith;
    if (!context || !preparedSignalsmith || !this.isSignalsmithConnected) return;
    // This message is the FIFO fence between generations. Stale async starts
    // must never post another schedule after observing the new token.
    const result = scheduleSignalsmithPlayback(
      preparedSignalsmith.node,
      createSignalsmithSchedule({
        active: false,
        output: contextStopTimeSeconds ?? context.currentTime,
      }),
    ).then(
      () => null,
      (error: unknown) => error instanceof Error ? error : new Error(String(error)),
    );
    const pendingFence = {
      prepared: preparedSignalsmith,
      result,
    } satisfies PendingSignalsmithInactiveFence;
    this.pendingSignalsmithInactiveFence = pendingFence;
    void result.then((error) => {
      if (this.pendingSignalsmithInactiveFence !== pendingFence) return;
      this.pendingSignalsmithInactiveFence = null;
      if (error) this.releaseSignalsmithPlayback(preparedSignalsmith);
    });
    preparedSignalsmith.node.disconnect();
    this.isSignalsmithConnected = false;
  }

  private async waitForSignalsmithInactiveFence(
    prepared: PreparedSignalsmithPlayback,
    token: number,
  ): Promise<void> {
    const pendingFence = this.pendingSignalsmithInactiveFence;
    if (pendingFence?.prepared === prepared) {
      const error = await pendingFence.result;
      if (this.musicToken !== token) {
        throw new Error("Signalsmith playback start was superseded");
      }
      if (error) {
        this.releaseSignalsmithPlayback(prepared);
        throw new Error(`Signalsmith inactive fence failed: ${error.message}`);
      }
    }
    if (this.preparedSignalsmith !== prepared) {
      throw new Error("Signalsmith playback is no longer prepared");
    }
  }

  pauseMusic(): number {
    // Presentation follows the sample currently reaching the device, but a
    // stop at context.currentTime cannot retract audio already rendered into
    // the device queue. Continue from the render cursor to avoid replaying
    // that queued tail after pause, seek, or a fresh DSP generation.
    const contextStopTimeSeconds = this.context?.currentTime;
    const timeSeconds = contextStopTimeSeconds === undefined
      ? this.clampMusicTime(this.musicTimeSeconds)
      : this.calculateMusicRenderTimeAt(contextStopTimeSeconds);
    this.stopMusicAt(timeSeconds, contextStopTimeSeconds);
    return timeSeconds;
  }

  async startMusic(
    offsetSeconds: number,
    playbackRate: number,
  ): Promise<BandoriMusicStartResult> {
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
    if (startTimeSeconds >= musicBuffer.duration) {
      return {
        contextTimeSeconds: context.currentTime,
        effectiveBackend: "native",
        latencySeconds: 0,
        mediaTimeSeconds: startTimeSeconds,
      };
    }

    const token = ++this.musicToken;
    if (playbackRate !== 1) {
      this.updateMusicPlaybackState({ status: "preparing" });
    }
    try {
      if (playbackRate !== 1) {
        const [prepared] = await Promise.all([
          this.ensureSignalsmithPlayback(context, musicBuffer),
          this.waitForMusicPresentationTail(token),
        ]);
        return await this.startSignalsmithMusic(
          context,
          prepared,
          startTimeSeconds,
          playbackRate,
          token,
        );
      }
    } catch (error) {
      if (this.musicToken === token) {
        this.stopPreparedSignalsmithAtCurrentTime();
        const failedPrepared = this.preparedSignalsmith;
        if (failedPrepared) this.releaseSignalsmithPlayback(failedPrepared);
        this.activeMusic = null;
        this.musicTimeSeconds = startTimeSeconds;
        this.updateMusicPlaybackState({ status: "error" });
      }
      throw error;
    }
    await this.waitForMusicPresentationTail(token);
    return this.startNativeMusic(
      context,
      musicBuffer,
      startTimeSeconds,
      playbackRate,
      token,
    );
  }

  private startNativeMusic(
    context: AudioContext,
    musicBuffer: AudioBuffer,
    startTimeSeconds: number,
    playbackRate: number,
    token: number,
  ): BandoriMusicStartResult {
    if (this.musicToken !== token) {
      throw new Error("Native playback start was superseded");
    }
    const source = context.createBufferSource();
    const contextStartTimeSeconds = context.currentTime;
    source.buffer = musicBuffer;
    source.playbackRate.setValueAtTime(playbackRate, contextStartTimeSeconds);
    source.connect(context.destination);
    const cleanup = (contextStopTimeSeconds?: number) => {
      source.onended = null;
      try {
        if (contextStopTimeSeconds === undefined) {
          source.stop();
        } else {
          source.stop(contextStopTimeSeconds);
        }
      } catch {
        // A source may have ended immediately before the explicit stop.
      }
      source.disconnect();
    };
    this.activeMusic = {
      cleanup,
      contextStartTimeSeconds,
      effectiveBackend: "native",
      mediaStartTimeSeconds: startTimeSeconds,
      playbackRate,
      token,
    };
    source.onended = () => {
      if (
        this.activeMusic?.token !== token
        || this.musicToken !== token
      ) return;
      // AudioBufferSourceNode ends at the render cursor. On a high-latency
      // output the final rendered frames have not reached the device yet, so
      // presentation polling owns the actual end notification.
      this.getMusicTimeAt(this.getPresentationContextTime());
    };
    source.start(contextStartTimeSeconds, startTimeSeconds);
    this.updateMusicPlaybackState({
      effectiveBackend: "native",
      generation: token,
      latencySeconds: 0,
      status: "playing",
    });
    return {
      contextTimeSeconds: contextStartTimeSeconds,
      effectiveBackend: "native",
      latencySeconds: 0,
      mediaTimeSeconds: startTimeSeconds,
    };
  }

  private async startSignalsmithMusic(
    context: AudioContext,
    prepared: PreparedSignalsmithPlayback,
    startTimeSeconds: number,
    playbackRate: number,
    token: number,
  ): Promise<BandoriMusicStartResult> {
    if (this.musicToken !== token) {
      throw new Error("Signalsmith playback start was superseded");
    }
    await this.waitForSignalsmithInactiveFence(prepared, token);
    if (this.musicToken !== token) {
      throw new Error("Signalsmith playback start was superseded");
    }
    this.connectSignalsmithPlayback(prepared, context);
    const safetySeconds = Math.max(0.05, 2 * 128 / context.sampleRate);
    const contextStartTimeSeconds = context.currentTime
      + prepared.latencySeconds
      + safetySeconds;
    await scheduleSignalsmithPlayback(prepared.node, createSignalsmithSchedule({
      active: true,
      input: startTimeSeconds,
      output: contextStartTimeSeconds,
      rate: playbackRate,
    }));
    if (this.musicToken !== token) {
      throw new Error("Signalsmith playback start was superseded");
    }
    this.activeMusic = {
      cleanup: () => undefined,
      contextStartTimeSeconds,
      effectiveBackend: "signalsmith",
      mediaStartTimeSeconds: startTimeSeconds,
      playbackRate,
      token,
    };
    this.updateMusicPlaybackState({
      effectiveBackend: "signalsmith",
      generation: token,
      latencySeconds: prepared.latencySeconds,
      status: "playing",
    });
    return {
      contextTimeSeconds: contextStartTimeSeconds,
      effectiveBackend: "signalsmith",
      latencySeconds: prepared.latencySeconds,
      mediaTimeSeconds: startTimeSeconds,
    };
  }

  private connectSignalsmithPlayback(
    prepared: PreparedSignalsmithPlayback,
    context: AudioContext,
  ): void {
    if (this.preparedSignalsmith !== prepared) {
      throw new Error("Signalsmith playback is no longer prepared");
    }
    if (this.isSignalsmithConnected) return;
    prepared.node.connect(context.destination);
    this.isSignalsmithConnected = true;
  }

  private async ensureSignalsmithPlayback(
    context: AudioContext,
    musicBuffer: AudioBuffer,
  ): Promise<PreparedSignalsmithPlayback> {
    if (this.preparedSignalsmith) return this.preparedSignalsmith;
    if (!this.preparedSignalsmithPromise) {
      this.updateMusicPlaybackState({ status: "preparing" });
      const request = prepareSignalsmithPlayback(context, musicBuffer).then((prepared) => {
        if (this.disposed) {
          prepared.node.disconnect();
          prepared.node.port.close();
          throw new Error("Native note sound runtime is disposed");
        }
        this.preparedSignalsmith = prepared;
        this.updateMusicPlaybackState({ isSignalsmithPrepared: true });
        const handleProcessorError = () => {
          this.handleSignalsmithProcessorError(prepared);
        };
        prepared.node.addEventListener("processorerror", handleProcessorError);
        this.signalsmithProcessorErrorCleanup = () => {
          prepared.node.removeEventListener("processorerror", handleProcessorError);
        };
        return prepared;
      }).finally(() => {
        if (this.preparedSignalsmithPromise === request) {
          this.preparedSignalsmithPromise = null;
        }
      });
      this.preparedSignalsmithPromise = request;
    }
    return this.preparedSignalsmithPromise;
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

  subscribeMusicPlaybackError(
    listener: (error: Error, continuationTimeSeconds: number) => void,
  ): () => void {
    if (this.disposed) throw new Error("Native note sound runtime is disposed");
    this.musicPlaybackErrorListeners.add(listener);
    return () => this.musicPlaybackErrorListeners.delete(listener);
  }

  subscribeMusicPlaybackState(
    listener: (state: BandoriMusicPlaybackState) => void,
  ): () => void {
    if (this.disposed) throw new Error("Native note sound runtime is disposed");
    this.musicPlaybackStateListeners.add(listener);
    listener(this.musicPlaybackState);
    return () => this.musicPlaybackStateListeners.delete(listener);
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
    this.musicPlaybackErrorListeners.clear();
    this.musicPlaybackStateListeners.clear();
    const preparedSignalsmith = this.preparedSignalsmith;
    if (preparedSignalsmith) {
      this.signalsmithProcessorErrorCleanup?.();
      preparedSignalsmith.node.disconnect();
      preparedSignalsmith.node.port.close();
    }
    this.context = null;
    this.masterGain = null;
    this.musicBuffer = null;
    this.musicBufferUrl = null;
    this.preparedSignalsmith = null;
    this.preparedSignalsmithPromise = null;
    this.pendingSignalsmithInactiveFence = null;
    this.isSignalsmithConnected = false;
    this.musicPresentationTail = null;
    this.signalsmithProcessorErrorCleanup = null;
    if (context && context.state !== "closed") void context.close();
  }

  private createAbortError(): Error {
    const error = new Error("Native music load was aborted");
    error.name = "AbortError";
    return error;
  }
}

export function createBandoriNativeAudioRuntime(
  cueBanks: readonly BandoriNativeNoteSoundCueBank[],
  activeCueBankId: string,
  volume: number,
): BandoriNativeAudioRuntime {
  return new WebAudioBandoriNativeAudioRuntime(
    cueBanks,
    activeCueBankId,
    volume,
  );
}
