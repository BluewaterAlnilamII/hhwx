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
const soundEffectAudioBufferCache = new Map<string, Promise<AudioBuffer>>();

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

function loadSoundEffectAudioBuffer(
  sourceUrl: string,
  context: AudioContext,
): Promise<AudioBuffer> {
  const cachedBuffer = soundEffectAudioBufferCache.get(sourceUrl);
  if (cachedBuffer) {
    return cachedBuffer;
  }

  const bufferPromise = fetch(sourceUrl, {
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
    .then((audioData) => decodeSoundEffectAudioData(context, audioData))
    .catch((error) => {
      soundEffectAudioBufferCache.delete(sourceUrl);
      throw error;
    });

  soundEffectAudioBufferCache.set(sourceUrl, bufferPromise);
  return bufferPromise;
}

function finishSoundEffect(activeAudio: ActiveSoundEffectAudio): void {
  if (activeAudio.completed) {
    return;
  }

  activeAudio.completed = true;
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
