type BrowserAudioSessionType = "auto" | "ambient" | "playback";

type AudioSessionNavigator = Navigator & {
  audioSession?: {
    type: string;
  };
};

const musicPlaybackSessionClaims = new Set<symbol>();
let ambientSessionClaimCount = 0;

function resolveBrowserAudioSessionType(): BrowserAudioSessionType {
  if (musicPlaybackSessionClaims.size > 0) {
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

export type MusicPlaybackBrowserAudioSession = Readonly<{
  release: () => void;
  setActive: (active: boolean) => void;
}>;

/** Owns one playback claim so unrelated players cannot release each other. */
export function createMusicPlaybackBrowserAudioSession(): MusicPlaybackBrowserAudioSession {
  const token = Symbol("music-playback-audio-session");
  let active = false;
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      if (active) musicPlaybackSessionClaims.delete(token);
      active = false;
      applyBrowserAudioSessionType();
    },
    setActive: (nextActive) => {
      if (released || active === nextActive) return;
      active = nextActive;
      if (active) musicPlaybackSessionClaims.add(token);
      else musicPlaybackSessionClaims.delete(token);
      applyBrowserAudioSessionType();
    },
  };
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
  musicPlaybackSessionClaims.clear();
  ambientSessionClaimCount = 0;
  applyBrowserAudioSessionType();
}
