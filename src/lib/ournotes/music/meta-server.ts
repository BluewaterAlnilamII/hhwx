import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { SNAPSHOT_HTTP_CACHE_POLICY } from "@/lib/api-cache";
import { fetchR2Object } from "@/lib/r2-s3-reader";
import { OurNotesDataError, requireOurNotes } from "../master-contract";
import { parseOurNotesSongMeta, type OurNotesSongMeta } from "./meta-contract";

export function verifyOurNotesSongMeta(raw: unknown, indexBytes: Buffer): OurNotesSongMeta {
  const artifact = parseOurNotesSongMeta(raw);
  requireOurNotes(createHash("sha256").update(indexBytes).digest("hex") === artifact.musicIndexSha256);
  return { durations: artifact.durations, songs: artifact.songs };
}

async function fetchSongMeta(): Promise<OurNotesSongMeta> {
  try {
    const required = (key: string) => {
      const value = process.env[key]?.trim();
      requireOurNotes(value);
      return value;
    };
    const config = { endpoint: required("OURNOTES_R2_ENDPOINT"), bucket: required("OURNOTES_PUBLIC_R2_BUCKET"),
      accessKeyId: required("OURNOTES_R2_ACCESS_KEY_ID"), secretAccessKey: required("OURNOTES_R2_SECRET_ACCESS_KEY") };
    const [meta, index] = await Promise.all(["meta", "index"].map(async (name) => {
      const response = await fetchR2Object(config, `ournotes/music/${name}.json`, undefined, { maxBytes: 8 * 1024 * 1024, timeoutMs: 15_000 });
      requireOurNotes(response.ok);
      return response.buffer();
    }));
    return verifyOurNotesSongMeta(JSON.parse(meta.toString("utf8")), index);
  } catch {
    throw new OurNotesDataError("OurNotes song meta is unavailable");
  }
}

export const readOurNotesSongMeta = unstable_cache(fetchSongMeta, ["ournotes-song-meta:v1"], {
  revalidate: SNAPSHOT_HTTP_CACHE_POLICY.nextRevalidateSeconds ?? 1800,
});
