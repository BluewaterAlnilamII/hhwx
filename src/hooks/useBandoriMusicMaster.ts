"use client";

import { useCachedFetch } from "@/hooks/useCachedFetch";
import { SESSION_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import {
  parseBandoriMusicMasterResponse,
  type BandoriMusicMasterMap,
} from "@/lib/bandori-music-api-client";

export const BANDORI_MUSIC_MASTER_CACHE_KEY = "bandori-master-music-v1";
export const BANDORI_MUSIC_MASTER_URL = "/api/bandori/master/music";

export function useBandoriMusicMaster(): {
  music: BandoriMusicMasterMap | null;
  loaded: boolean;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  refresh: () => void;
} {
  const result = useCachedFetch(
    BANDORI_MUSIC_MASTER_CACHE_KEY,
    BANDORI_MUSIC_MASTER_URL,
    parseBandoriMusicMasterResponse,
    SESSION_CLIENT_CACHE_POLICY,
  );

  return {
    ...result,
    music: result.data,
    loaded: result.data !== null,
  };
}
