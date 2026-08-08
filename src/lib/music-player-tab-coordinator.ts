import {
  MUSIC_PLAYER_BROADCAST_CHANNEL_NAME,
  MUSIC_PLAYER_PLAYBACK_OWNER_STORAGE_KEY,
  MUSIC_PLAYER_STORAGE_VERSION,
  parseMusicPlayerPlaybackClaim,
  type MusicPlayerPlaybackClaim,
} from "@/lib/music-player-contract";

type MusicPlayerPlaybackCoordinator = {
  claimPlayback: () => MusicPlayerPlaybackClaim;
  dispose: () => void;
};

function createSafeIdentifier(prefix: string): string {
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomPart}`;
}
function readLatestClaim(): MusicPlayerPlaybackClaim | null {
  try {
    return parseMusicPlayerPlaybackClaim(
      window.localStorage.getItem(MUSIC_PLAYER_PLAYBACK_OWNER_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export function createMusicPlayerTabId(): string {
  return createSafeIdentifier("tab");
}

export function createMusicPlayerPlaybackCoordinator(
  ownerId: string,
  onRemoteClaim: (claim: MusicPlayerPlaybackClaim) => void,
): MusicPlayerPlaybackCoordinator {
  let channel: BroadcastChannel | null = null;
  let lastHandledToken: string | null = null;

  const handleClaim = (claim: MusicPlayerPlaybackClaim | null) => {
    if (!claim || claim.ownerId === ownerId || claim.token === lastHandledToken) {
      return;
    }

    const latestClaim = readLatestClaim();
    if (latestClaim?.ownerId === ownerId) {
      return;
    }
    if (latestClaim && latestClaim.token !== claim.token) {
      return;
    }

    lastHandledToken = claim.token;
    onRemoteClaim(claim);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === MUSIC_PLAYER_PLAYBACK_OWNER_STORAGE_KEY) {
      handleClaim(parseMusicPlayerPlaybackClaim(event.newValue));
    }
  };

  window.addEventListener("storage", handleStorage);
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(MUSIC_PLAYER_BROADCAST_CHANNEL_NAME);
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      handleClaim(typeof event.data === "string" ? parseMusicPlayerPlaybackClaim(event.data) : null);
    });
  }

  return {
    claimPlayback: () => {
      const claim: MusicPlayerPlaybackClaim = {
        version: MUSIC_PLAYER_STORAGE_VERSION,
        type: "playback-claim",
        ownerId,
        token: createSafeIdentifier("claim"),
        claimedAt: Date.now(),
      };
      const serializedClaim = JSON.stringify(claim);
      try {
        window.localStorage.setItem(MUSIC_PLAYER_PLAYBACK_OWNER_STORAGE_KEY, serializedClaim);
      } catch {
        // BroadcastChannel still coordinates tabs when browser storage is unavailable.
      }
      channel?.postMessage(serializedClaim);
      return claim;
    },
    dispose: () => {
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    },
  };
}
