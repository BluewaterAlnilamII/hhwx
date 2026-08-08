import type { BandoriMusicMasterRecord } from "@/lib/bandori-music-api-client";
import {
  buildBandoriPublicAssetUrl,
  type BandoriMusicAssetEntry,
} from "@/lib/bandori-public-asset-index";
import {
  pickBandoriRegionalText,
  type BandoriServer,
} from "@/lib/bandori-server";
import type { MusicPlayerItem } from "@/lib/music-player-contract";

export type BuildBandoriMusicPlayerItemOptions = {
  musicId: number;
  music?: BandoriMusicMasterRecord;
  assets?: BandoriMusicAssetEntry;
  preferredServer: BandoriServer;
  contextServer?: BandoriServer | null;
  fallbackTitle?: string | null;
  fallbackArtist?: string | null;
};

export function buildBandoriMusicPlayerItem({
  musicId,
  music,
  assets,
  preferredServer,
  contextServer,
  fallbackTitle,
  fallbackArtist,
}: BuildBandoriMusicPlayerItemOptions): MusicPlayerItem | null {
  if (!Number.isSafeInteger(musicId) || musicId <= 0) {
    return null;
  }

  const sourceUrl = buildBandoriPublicAssetUrl(assets?.files.audio);
  if (!sourceUrl) {
    return null;
  }

  const title = pickBandoriRegionalText(
    music?.musicTitle,
    preferredServer,
    contextServer,
  ) ?? fallbackTitle?.trim() ?? `Music #${musicId}`;
  const artist = pickBandoriRegionalText(
    music?.bandName,
    preferredServer,
    contextServer,
  ) ?? fallbackArtist?.trim() ?? null;

  return {
    id: `bandori:${musicId}`,
    provider: "bandori",
    providerTrackId: String(musicId),
    title,
    artist: artist || null,
    sourceUrl,
    artworkUrl: buildBandoriPublicAssetUrl(assets?.files.jacket ?? assets?.files.thumb),
    durationSeconds: assets?.length ?? null,
  };
}
