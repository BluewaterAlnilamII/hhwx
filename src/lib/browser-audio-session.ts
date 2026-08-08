type BrowserAudioSessionType = "auto" | "ambient" | "playback";

type AudioSessionNavigator = Navigator & {
  audioSession?: {
    type: string;
  };
};

let musicPlaybackSessionActive = false;
let ambientSessionClaimCount = 0;

function resolveBrowserAudioSessionType(): BrowserAudioSessionType {
  if (musicPlaybackSessionActive) {
    return "playback";
  }
  if (ambientSessionClaimCount > 0) {
    return "ambient";
  }
  return "auto";
}

function applyBrowserAudioSessionType(): void {
  if (typeof navigator === "undefined") {
    return;
  }

  const audioSession = (navigator as AudioSessionNavigator).audioSession;
  if (!audioSession) {
    return;
  }

  try {
    audioSession.type = resolveBrowserAudioSessionType();
  } catch {
    // The Audio Session API is experimental and must remain an optional enhancement.
  }
}

export function setMusicPlaybackAudioSessionActive(active: boolean): void {
  musicPlaybackSessionActive = active;
  applyBrowserAudioSessionType();
}

export function claimAmbientBrowserAudioSession(): () => void {
  ambientSessionClaimCount += 1;
  applyBrowserAudioSessionType();

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    ambientSessionClaimCount = Math.max(0, ambientSessionClaimCount - 1);
    applyBrowserAudioSessionType();
  };
}

export function resetBrowserAudioSessionPolicy(): void {
  musicPlaybackSessionActive = false;
  ambientSessionClaimCount = 0;
  applyBrowserAudioSessionType();
}
