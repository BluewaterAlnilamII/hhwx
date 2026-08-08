import { claimAmbientBrowserAudioSession } from "@/lib/browser-audio-session";

type AudioContextConstructor = new () => AudioContext;
type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor;
};

interface ActiveCommentStampAudio {
  source: AudioBufferSourceNode;
  releaseAudioSession: () => void;
}

let commentStampAudioContext: AudioContext | null = null;
let activeCommentStampAudio: ActiveCommentStampAudio | null = null;
const commentStampAudioBufferCache = new Map<string, Promise<AudioBuffer>>();

function getCommentStampAudioContext(): AudioContext {
  if (commentStampAudioContext) {
    return commentStampAudioContext;
  }

  if (typeof window === "undefined") {
    throw new Error("Stamp voice playback is only available in the browser");
  }

  const AudioContextCtor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Web Audio API is not available");
  }

  commentStampAudioContext = new AudioContextCtor();
  return commentStampAudioContext;
}

async function decodeCommentStampAudioData(
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

function loadCommentStampAudioBuffer(voiceUrl: string, context: AudioContext): Promise<AudioBuffer> {
  const cachedBuffer = commentStampAudioBufferCache.get(voiceUrl);
  if (cachedBuffer) {
    return cachedBuffer;
  }

  const bufferPromise = fetch(voiceUrl, {
    cache: "force-cache",
    credentials: "omit",
    mode: "cors",
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Stamp voice fetch failed: HTTP ${response.status}`);
      }

      return response.arrayBuffer();
    })
    .then((audioData) => decodeCommentStampAudioData(context, audioData))
    .catch((error) => {
      commentStampAudioBufferCache.delete(voiceUrl);
      throw error;
    });

  commentStampAudioBufferCache.set(voiceUrl, bufferPromise);
  return bufferPromise;
}

function stopActiveCommentStampSource(): void {
  const activeAudio = activeCommentStampAudio;
  if (!activeAudio) {
    return;
  }

  activeCommentStampAudio = null;
  try {
    activeAudio.source.stop();
  } catch {
    // Already-ended one-shot sources throw on stop in some browsers.
  } finally {
    activeAudio.releaseAudioSession();
  }
}

export async function playCommentStampVoice(voiceUrl: string): Promise<void> {
  const releaseAudioSession = claimAmbientBrowserAudioSession();

  try {
    const context = getCommentStampAudioContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    const buffer = await loadCommentStampAudioBuffer(voiceUrl, context);
    stopActiveCommentStampSource();

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const activeAudio = { source, releaseAudioSession };
    source.onended = () => {
      if (activeCommentStampAudio === activeAudio) {
        activeCommentStampAudio = null;
        releaseAudioSession();
      }
    };

    activeCommentStampAudio = activeAudio;
    source.start(0);
  } catch (error) {
    releaseAudioSession();
    throw error;
  }
}
