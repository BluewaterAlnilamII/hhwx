import type { MusicPlayerItem } from "@/lib/music-player-contract";
import { OURNOTES_CDN } from "@/lib/ournotes/cards/assets";
import { ourNotesMusicImageUrl, type OurNotesMusicAssetIndex } from "@/lib/ournotes/music/assets";

export function buildOurNotesMusicPlayerItem({ songId, title, artist, assetIndex }: {
  songId: number; title: string; artist: string; assetIndex: OurNotesMusicAssetIndex | null;
}): MusicPlayerItem | null {
  const assets = assetIndex?.songs[String(songId)];
  if (!Number.isSafeInteger(songId) || songId <= 0 || !assets?.files.audio) return null;
  return {
    id: `ournotes:${songId}`, provider: "ournotes", providerTrackId: String(songId),
    title, artist: artist || null, sourceUrl: OURNOTES_CDN + assets.files.audio.key,
    artworkUrl: ourNotesMusicImageUrl(assetIndex, songId, "jacket") ?? ourNotesMusicImageUrl(assetIndex, songId, "thumb"),
    durationSeconds: assets.length,
  };
}
