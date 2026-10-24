import { claimAmbientBrowserAudioSession } from "@/lib/browser-audio-session";

type AudioContextConstructor = new () => AudioContext;
type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor;
};

interface ActiveSoundEffectAudio {
  source: AudioBufferSourceNode;
  releaseAudioSession: () => void;
  completed: boolean;
}

let soundEffectAudioContext: AudioContext | null = null;
let activeSoundEffectAudio: ActiveSoundEffectAudio | null = null;
const soundEffectDataLoads = new Map<string, Promise<ArrayBuffer>>();
const soundEffectAudioLoads = new Map<string, Promise<AudioBuffer>>();

function getSoundEffectAudioContext(): AudioContext {
  if (soundEffectAudioContext) {
    return soundEffectAudioContext;
  }

  if (typeof window === "undefined") {
    throw new Error("Sound effect playback is only available in the browser");
  }

  const AudioContextCtor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Web Audio API is not available");
  }

  soundEffectAudioContext = new AudioContextCtor();
  return soundEffectAudioContext;
}

async function decodeSoundEffectAudioData(
  context: AudioContext,
  audioData: ArrayBuffer,
): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const maybePromise = context.decodeAudioData(audioData.slice(0), resolve, reject);
    if (maybePromise) {
      void maybePromise.then(resolve, reject);
    }
  });
}

function loadSoundEffectData(sourceUrl: string): Promise<ArrayBuffer> {
  const pending = soundEffectDataLoads.get(sourceUrl);
  if (pending) return pending;

  const dataPromise = fetch(sourceUrl, {
    cache: "force-cache",
    credentials: "omit",
    mode: "cors",
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Sound effect fetch failed: HTTP ${response.status}`);
      }

      return response.arrayBuffer();
    })
    .finally(() => { soundEffectDataLoads.delete(sourceUrl); });

  soundEffectDataLoads.set(sourceUrl, dataPromise);
  return dataPromise;
}

function loadSoundEffectAudioBuffer(sourceUrl: string, context: AudioContext): Promise<AudioBuffer> {
  const pending = soundEffectAudioLoads.get(sourceUrl);
  if (pending) return pending;
  const bufferPromise = loadSoundEffectData(sourceUrl)
    .then((audioData) => decodeSoundEffectAudioData(context, audioData))
    .finally(() => { soundEffectAudioLoads.delete(sourceUrl); });

  soundEffectAudioLoads.set(sourceUrl, bufferPromise);
  return bufferPromise;
}

function finishSoundEffect(activeAudio: ActiveSoundEffectAudio): void {
  if (activeAudio.completed) {
    return;
  }

  activeAudio.completed = true;
  activeAudio.source.disconnect();
  activeAudio.source.buffer = null;
  if (activeSoundEffectAudio === activeAudio) {
    activeSoundEffectAudio = null;
  }
  activeAudio.releaseAudioSession();
}

function stopSoundEffect(activeAudio: ActiveSoundEffectAudio): void {
  if (activeAudio.completed) {
    return;
  }

  try {
    activeAudio.source.stop();
  } catch {
    // Already-ended one-shot sources throw on stop in some browsers.
  } finally {
    finishSoundEffect(activeAudio);
  }
}

function stopActiveSoundEffect(): void {
  if (activeSoundEffectAudio) {
    stopSoundEffect(activeSoundEffectAudio);
  }
}

export async function resumeSoundEffectAudio(): Promise<void> {
  const context = getSoundEffectAudioContext();
  if (context.state === "suspended") await context.resume();
}

export async function preloadSoundEffect(sourceUrl: string): Promise<void> {
  // Warm the HTTP cache without retaining or decoding audio in application memory.
  await loadSoundEffectData(sourceUrl);
}

export async function playSoundEffect(sourceUrl: string): Promise<void> {
  const releaseAudioSession = claimAmbientBrowserAudioSession();

  try {
    const context = getSoundEffectAudioContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    const buffer = await loadSoundEffectAudioBuffer(sourceUrl, context);
    stopActiveSoundEffect();

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const activeAudio: ActiveSoundEffectAudio = {
      source,
      releaseAudioSession,
      completed: false,
    };
    source.onended = () => finishSoundEffect(activeAudio);

    activeSoundEffectAudio = activeAudio;
    try {
      source.start(0);
    } catch (error) {
      finishSoundEffect(activeAudio);
      throw error;
    }
  } catch (error) {
    releaseAudioSession();
    throw error;
  }
}

// Concurrent loads are shared; each sender owns its playback and cancellation.
export async function playIndependentSoundEffect(sourceUrl: string, signal: AbortSignal, startBefore: number): Promise<void> {
  if (signal.aborted || Date.now() >= startBefore) return;
  const context = getSoundEffectAudioContext();
  const buffer = await loadSoundEffectAudioBuffer(sourceUrl, context);
  if (signal.aborted || Date.now() >= startBefore || context.state !== "running") return;

  await new Promise<void>((resolve, reject) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const releaseAudioSession = claimAmbientBrowserAudioSession();
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      signal.removeEventListener("abort", stop);
      source.disconnect();
      source.buffer = null;
      releaseAudioSession();
      resolve();
    };
    const stop = () => {
      try { source.stop(); } catch { /* Already ended. */ } finally { finish(); }
    };
    source.onended = finish;
    signal.addEventListener("abort", stop, { once: true });
    try { source.start(0); } catch (error) { reject(error); finish(); }
  });
}
