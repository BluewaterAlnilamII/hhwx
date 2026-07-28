import { parseApiSuccessData } from "@/lib/api-contracts";

export type BandoriMusicDifficulty = {
  playLevel?: number;
  publishedAt?: Array<string | number | null>;
};

export type BandoriMusicMasterRecord = Record<string, unknown> & {
  bandName?: Array<string | null>;
  difficulty?: Record<string, BandoriMusicDifficulty>;
  musicTitle?: Array<string | null>;
};

export type BandoriMusicMasterMap = Record<
  string,
  BandoriMusicMasterRecord | undefined
>;

const BANDORI_MUSIC_ID_PATTERN = /^[1-9]\d*$/u;

export function parseBandoriMusicMasterResponse(raw: unknown): BandoriMusicMasterMap {
  const data = parseApiSuccessData<unknown>(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Bandori Music API returned an invalid dataset");
  }

  for (const [musicId, music] of Object.entries(data)) {
    if (
      !BANDORI_MUSIC_ID_PATTERN.test(musicId)
      || !Number.isSafeInteger(Number(musicId))
      || !music
      || typeof music !== "object"
      || Array.isArray(music)
    ) {
      throw new Error(`Bandori Music API returned an invalid Music record: ${musicId}`);
    }
  }

  return data as BandoriMusicMasterMap;
}
