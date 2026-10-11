import { OURNOTES_CDN, type OurNotesImageAsset } from "../cards/assets";

export const OURNOTES_MUSIC_INDEX_URL = OURNOTES_CDN + "ournotes/music/index.json";
export type OurNotesMusicAssetIndex = {
  songs: Record<string, {
    files: Partial<Record<"jacket" | "thumb", OurNotesImageAsset>> & { audio?: { key: string; sha256: string; size: number } };
    length: number | null;
  }>;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid OurNotes music index");
  return value as Record<string, unknown>;
}

export function parseOurNotesMusicAssetIndex(value: unknown): OurNotesMusicAssetIndex {
  const root = record(value);
  if (root.schema !== "ournotes-music-assets-index-v1") throw new Error("Invalid OurNotes music index schema");
  return { songs: Object.fromEntries(Object.entries(record(root.songs)).map(([id, value]) => {
    if (!/^[1-9]\d*$/u.test(id) || !Number.isSafeInteger(Number(id))) throw new Error("Invalid OurNotes music ID");
    const entry = record(value);
    const files = record(entry.files);
    const images: Partial<Record<"jacket" | "thumb", OurNotesImageAsset>> = {};
    for (const role of ["jacket", "thumb"] as const) {
      if (files[role] === undefined) continue;
      const image = record(files[role]);
      if (typeof image.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(image.sha256)
        || image.key !== `ournotes/music/${role}s/${image.sha256}.png`
        || ![image.size, image.width, image.height].every((n) => typeof n === "number" && Number.isSafeInteger(n) && n > 0)) {
        throw new Error("Invalid OurNotes music image descriptor");
      }
      images[role] = image as OurNotesImageAsset;
    }
    let audio: { key: string; sha256: string; size: number } | undefined;
    if (files.audio !== undefined) {
      const descriptor = record(files.audio);
      if (typeof descriptor.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(descriptor.sha256)
        || descriptor.key !== `ournotes/music/audio/${descriptor.sha256}.mp3`
        || typeof descriptor.size !== "number" || !Number.isSafeInteger(descriptor.size) || descriptor.size <= 0) {
        throw new Error("Invalid OurNotes music audio descriptor");
      }
      audio = descriptor as typeof audio;
    }
    if (entry.length != null && (typeof entry.length !== "number" || !Number.isFinite(entry.length) || entry.length <= 0)) {
      throw new Error("Invalid OurNotes music duration");
    }
    return [id, { files: { ...images, ...(audio ? { audio } : {}) }, length: entry.length as number | null ?? null }];
  })) };
}

export function ourNotesMusicImageUrl(index: OurNotesMusicAssetIndex | null, songId: string | number, role: "jacket" | "thumb"): string | null {
  const image = index?.songs[String(songId)]?.files[role];
  return image ? OURNOTES_CDN + image.key : null;
}
