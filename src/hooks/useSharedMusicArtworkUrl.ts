"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getSharedMusicArtworkUrl,
  subscribeSharedMusicArtworkUrl,
} from "@/lib/music-player-artwork-cache";

export function useSharedMusicArtworkUrl(sourceUrl: string | null): string | null {
  const subscribe = useCallback(
    (listener: () => void) => subscribeSharedMusicArtworkUrl(sourceUrl, listener),
    [sourceUrl],
  );
  const getSnapshot = useCallback(
    () => getSharedMusicArtworkUrl(sourceUrl),
    [sourceUrl],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
