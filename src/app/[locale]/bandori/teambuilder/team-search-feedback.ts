export type SearchInputIssue = { code: string; path: string };

export function searchInputMessageKey({ code, path }: SearchInputIssue) {
  switch (path) {
    case "song.notes": return "chartNoteLimit";
    case "otherPlayersAveragePower":
    case "otherPlayersPower": return "invalidRoomPower";
    case "durationSeconds": return "invalidSkillDuration";
    case "scoreRange": return "scoreRangeExceeded";
    case "pointBonusRates": return "invalidPointBonus";
    case "supportPowers": return "invalidSupportPower";
    case "eventRule": return "invalidEventRule";
  }
  if (path.startsWith("song.notes[") && path.endsWith(".timeSeconds")) return "invalidNoteTime";
  if (code === "INVALID_PROFILE" || (path.startsWith("sourceInput.cardsById.") && path.includes(".profile."))) {
    return "invalidProfile";
  }
  switch (code) {
    case "INVALID_PERFECT_RATE": return "invalidPerfectRate";
    case "INVALID_CHART":
    case "INVALID_SONG": return "invalidChart";
    case "INVALID_SKILL": return "invalidSkill";
    default: return "invalidSearchInput";
  }
}

function searchStopReasonKey(reason: string | null | undefined) {
  switch (reason) {
    case "timed_out": return "timeLimit";
    case "memory_exhausted": return "memoryLimit";
    case "cancelled": return "cancelled";
    case "arithmetic_overflow":
    case "count_or_index_overflow": return "overflow";
    case "invalid_data": return "invalidData";
    case "scorer_disagreement":
    case "internal_failure": return "calculationFailed";
    default: return "stopped";
  }
}

export function searchOutcomeNotice(
  status: "exact" | "incomplete", reason: string | null | undefined, teamCount: number,
  t: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  if (status === "exact") return teamCount === 0 ? t("noMatchingTeam") : null;
  return t(teamCount === 0 ? "stoppedWithoutTeams" : "stoppedWithTeams", {
    reason: t(`stopReasons.${searchStopReasonKey(reason)}`),
  });
}
