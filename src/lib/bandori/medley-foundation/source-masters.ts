import { resolveBandoriCardForServerWithJpFallback } from "@/lib/bandori/cards/regional-extensions";

import type { BandoriServer, MedleyDifficulty } from "./contracts";
import { failInput, readRecord } from "./errors";

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
