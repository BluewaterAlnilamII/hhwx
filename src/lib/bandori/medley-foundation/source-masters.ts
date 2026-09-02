import { resolveBandoriCardForServerWithJpFallback } from "@/lib/bandori/cards/regional-extensions";

import { normalizeBestdoriScoringChart } from "./chart";
import type {
  BandoriServer,
  FixedSongSourceSelectionV1,
  MedleyDifficulty,
  MedleySongV1,
  Triple,
} from "./contracts";
import { assertAllowedKeys, failInput, readArray, readRecord } from "./errors";
import { parseSongIdText } from "./numeric";

const DIFFICULTIES = ["easy", "normal", "hard", "expert", "special"] as const;

function positiveIntegerLike(value: unknown, path: string, maximum = 0xffff_ffff): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    failInput("INVALID_MASTER", path, `must be a positive integer no greater than ${maximum}`);
  }
  return parsed;
}

export function readSourceDifficulty(value: unknown, path: string): MedleyDifficulty {
  if (typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value)) {
    return value as MedleyDifficulty;
  }
  failInput("INVALID_SONG", path, "must be a Bestdori difficulty");
}

export function readSourcePlayLevel(
  songMasterValue: unknown,
  songId: number,
  difficulty: MedleyDifficulty,
): number {
  const masterPath = `songsById.${songId}`;
  const master = readRecord(songMasterValue, masterPath, "INVALID_MASTER");
  const difficulties = readRecord(master.difficulty, `${masterPath}.difficulty`, "INVALID_MASTER");
  const difficultyIndex = DIFFICULTIES.indexOf(difficulty);
  const row = readRecord(
    difficulties[String(difficultyIndex)],
    `${masterPath}.difficulty.${difficultyIndex}`,
    "INVALID_MASTER",
  );
  return positiveIntegerLike(row.playLevel, `${masterPath}.difficulty.${difficultyIndex}.playLevel`, 0xffff);
}

export function readSongSelections(value: unknown, path: string): Triple<FixedSongSourceSelectionV1> {
  const songs = readArray(value, path, "INVALID_SONG");
  if (songs.length !== 3) failInput("INVALID_SONG", path, "must contain exactly three songs");
  return songs.map((rawSong, slot) => {
    const songPath = `${path}[${slot}]`;
    const song = readRecord(rawSong, songPath, "INVALID_SONG");
    assertAllowedKeys(
      song,
      ["songIdText", "difficulty", "chart"],
      ["songIdText", "difficulty", "chart"],
      songPath,
      "INVALID_SONG",
    );
    return {
      songIdText: typeof song.songIdText === "string"
        ? song.songIdText
        : failInput("INVALID_SONG", `${songPath}.songIdText`, "must be a string"),
      difficulty: readSourceDifficulty(song.difficulty, `${songPath}.difficulty`),
      chart: song.chart,
    };
  }) as Triple<FixedSongSourceSelectionV1>;
}

export function buildSongs(
  selections: Triple<FixedSongSourceSelectionV1>,
  songsById: Record<string, unknown>,
  path: string,
): Triple<MedleySongV1> {
  return selections.map((selection, slot) => {
    const songId = parseSongIdText(selection.songIdText, `${path}[${slot}].songIdText`);
    return {
      slot,
      songId,
      difficulty: selection.difficulty,
      playLevel: readSourcePlayLevel(songsById[String(songId)], songId, selection.difficulty),
      notes: normalizeBestdoriScoringChart(selection.chart, `${path}[${slot}].chart`),
    };
  }) as Triple<MedleySongV1>;
}

export function requireSourceMaster(
  map: Record<string, unknown>,
  id: number,
  path: string,
): Record<string, unknown> {
  return readRecord(map[String(id)], `${path}.${id}`, "INVALID_MASTER");
}

export function resolveSourceCardMaster(
  card: Record<string, unknown>,
  server: BandoriServer,
  path: string,
): Record<string, unknown> {
  let resolved: Record<string, unknown> | null;
  try {
    resolved = resolveBandoriCardForServerWithJpFallback(card, server);
  } catch (error) {
    const message = error instanceof Error ? error.message : "card server extension is invalid";
    failInput("INVALID_MASTER", `${path}.serverExtensions`, message);
  }
  return resolved ?? failInput("INVALID_MASTER", path, "card is unavailable on the profile server and JP");
}
