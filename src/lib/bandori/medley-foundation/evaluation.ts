import {
  MEDLEY_FOUNDATION_SOURCE_SCHEMA_VERSION,
  MEDLEY_SCORING_INPUT_SCHEMA_VERSION,
  MEDLEY_SCORING_RULES_VERSION,
} from "./contracts";
import type {
  BandoriServer,
  CalculatedProfileCardV1,
  CardScoringInputV1,
  Five,
  FixedMedleyEvaluationInputV1,
  FixedMedleyFoundationResultV1,
  FixedSongSourceSelectionV1,
  FixedTeamParameterTraceV1,
  FixedTeamSourceSelectionV1,
  FixedTeamV1,
  MedleySongV1,
  Triple,
} from "./contracts";
import {
  assertAllowedKeys,
  failInput,
  readArray,
  readRecord,
  readSafeInteger,
} from "./errors";
import { normalizeBestdoriScoringChart } from "./chart";
import { parsePerfectRatePercent, parseSongIdText } from "./numeric";
import { calculateFixedTeamParameters, calculateProfileCard } from "./parameters";
import { decodeMedleyProfile } from "./profile";
import { buildFixedTeamSkillContext, resolveBestdoriScoreSkill } from "./skills";
import {
  readSourceDifficulty,
  readSourcePlayLevel,
  requireSourceMaster,
  resolveSourceCardMaster,
} from "./source-masters";

function positiveIntegerLike(value: unknown, path: string, maximum = 0xffff_ffff): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    failInput("INVALID_MASTER", path, `must be a positive integer no greater than ${maximum}`);
  }
  return parsed;
}

function readSourcePositiveInteger(value: unknown, path: string): number {
  const parsed = readSafeInteger(value, path, "INVALID_PARAMETER");
  if (parsed <= 0 || parsed > 0xffff_ffff) {
    failInput("INVALID_PARAMETER", path, "must be a positive unsigned 32-bit integer");
  }
  return parsed;
}

function readAreaItemIds(value: unknown): number[] {
  const items = readArray(value, "selectedAreaItemIds", "INVALID_PARAMETER")
    .map((item, index) => readSourcePositiveInteger(item, `selectedAreaItemIds[${index}]`));
  if (new Set(items).size !== items.length) {
    failInput("INVALID_PARAMETER", "selectedAreaItemIds", "must contain unique IDs");
  }
  return items;
}

function readTeamSelections(value: unknown): Triple<FixedTeamSourceSelectionV1> {
  const teams = readArray(value, "teams", "INVALID_TEAM");
  if (teams.length !== 3) failInput("INVALID_TEAM", "teams", "must contain exactly three teams");
  return teams.map((rawTeam, slot) => {
    const team = readRecord(rawTeam, `teams[${slot}]`, "INVALID_TEAM");
    assertAllowedKeys(team, ["memberCardIds"], ["memberCardIds"], `teams[${slot}]`, "INVALID_TEAM");
    const memberCardIds = readArray(team.memberCardIds, `teams[${slot}].memberCardIds`, "INVALID_TEAM");
    if (memberCardIds.length !== 5) {
      failInput("INVALID_TEAM", `teams[${slot}].memberCardIds`, "must contain exactly five card IDs");
    }
    return {
      memberCardIds: memberCardIds.map((cardId, index) => (
        readSourcePositiveInteger(cardId, `teams[${slot}].memberCardIds[${index}]`)
      )) as Five<number>,
    };
  }) as Triple<FixedTeamSourceSelectionV1>;
}

function readSongSelections(value: unknown): Triple<FixedSongSourceSelectionV1> {
  const songs = readArray(value, "songs", "INVALID_SONG");
  if (songs.length !== 3) failInput("INVALID_SONG", "songs", "must contain exactly three songs");
  return songs.map((rawSong, slot) => {
    const song = readRecord(rawSong, `songs[${slot}]`, "INVALID_SONG");
    assertAllowedKeys(
      song,
      ["songIdText", "difficulty", "chart"],
      ["songIdText", "difficulty", "chart"],
      `songs[${slot}]`,
      "INVALID_SONG",
    );
    return {
      songIdText: typeof song.songIdText === "string"
        ? song.songIdText
        : failInput("INVALID_SONG", `songs[${slot}].songIdText`, "must be a string"),
      difficulty: readSourceDifficulty(song.difficulty, `songs[${slot}].difficulty`),
      chart: song.chart,
    };
  }) as Triple<FixedSongSourceSelectionV1>;
}

/** Build a fixed 15-card, three-team scoring input without performing any search. */
export function buildFixedMedleyEvaluationInput(
  value: unknown,
  path = "sourceInput",
): FixedMedleyFoundationResultV1 {
  const source = readRecord(value, path, "INVALID_PARAMETER");
  assertAllowedKeys(
    source,
    [
      "schemaVersion",
      "profilePayload",
      "cardsById",
      "charactersById",
      "skillsById",
      "areaItemsById",
      "songsById",
      "eventBonus",
      "selectedAreaItemIds",
      "perfectRatePercentText",
      "teams",
      "songs",
    ],
    [
      "schemaVersion",
      "profilePayload",
      "cardsById",
      "charactersById",
      "skillsById",
      "areaItemsById",
      "songsById",
      "eventBonus",
      "selectedAreaItemIds",
      "perfectRatePercentText",
      "teams",
      "songs",
    ],
    path,
    "INVALID_PARAMETER",
  );
  if (source.schemaVersion !== MEDLEY_FOUNDATION_SOURCE_SCHEMA_VERSION) {
    failInput("UNSUPPORTED_SCHEMA", `${path}.schemaVersion`, "unsupported fixed-source schema");
  }

  const profile = decodeMedleyProfile(source.profilePayload, `${path}.profilePayload`);
  const cardsById = readRecord(source.cardsById, `${path}.cardsById`, "INVALID_MASTER");
  const charactersById = readRecord(source.charactersById, `${path}.charactersById`, "INVALID_MASTER");
  const skillsById = readRecord(source.skillsById, `${path}.skillsById`, "INVALID_MASTER");
  const areaItemsById = readRecord(source.areaItemsById, `${path}.areaItemsById`, "INVALID_MASTER");
  const songsById = readRecord(source.songsById, `${path}.songsById`, "INVALID_MASTER");
  const selectedAreaItemIds = readAreaItemIds(source.selectedAreaItemIds);
  const teamSelections = readTeamSelections(source.teams);
  const songSelections = readSongSelections(source.songs);
  const perfectRate = parsePerfectRatePercent(
    source.perfectRatePercentText,
    `${path}.perfectRatePercentText`,
  );
  const profileCards = new Map(profile.cards.map((card) => [card.cardId, card]));
  const profileAreaItems = new Map(profile.areaItems.map((item) => [item.areaItemId, item]));
  const characterBonuses = new Map(profile.characterBonuses.map((bonus) => [bonus.characterId, bonus]));

  for (const areaItemId of selectedAreaItemIds) {
    if (!profileAreaItems.has(areaItemId)) {
      failInput("INVALID_PARAMETER", `${path}.selectedAreaItemIds`, `area item ${areaItemId} is not owned`);
    }
    requireSourceMaster(areaItemsById, areaItemId, `${path}.areaItemsById`);
  }

  const selectedCardIds = new Set<number>();
  const scoringCards: CardScoringInputV1[] = [];
  const scoringTeams: FixedTeamV1[] = [];
  const teamParameters: FixedTeamParameterTraceV1[] = [];
  const teamMemberCardIds: Five<number>[] = [];

  for (const [teamSlot, teamSelection] of teamSelections.entries()) {
    const calculatedCards = teamSelection.memberCardIds.map((cardId, memberIndex) => {
      if (selectedCardIds.has(cardId)) {
        failInput("INVALID_TEAM", `${path}.teams[${teamSlot}].memberCardIds[${memberIndex}]`, "card is selected more than once");
      }
      selectedCardIds.add(cardId);
      const state = profileCards.get(cardId);
      if (!state) {
        failInput("INVALID_CARD", `${path}.teams[${teamSlot}].memberCardIds[${memberIndex}]`, "card must be owned");
      }
      const cardMaster = resolveSourceCardMaster(
        requireSourceMaster(cardsById, cardId, `${path}.cardsById`),
        profile.server,
        `${path}.cardsById.${cardId}`,
      );
      const characterId = positiveIntegerLike(cardMaster.characterId, `${path}.cardsById.${cardId}.characterId`);
      const characterMaster = requireSourceMaster(
        charactersById,
        characterId,
        `${path}.charactersById`,
      );
      const card = calculateProfileCard(
        state,
        cardMaster,
        characterMaster,
        characterBonuses,
        `${path}.cardsById.${cardId}`,
      );
      return card;
    }) as Five<CalculatedProfileCardV1>;
    if (new Set(calculatedCards.map((card) => card.characterId)).size !== 5) {
      failInput("INVALID_TEAM", `${path}.teams[${teamSlot}].memberCardIds`, "one team cannot repeat a character");
    }
    const context = buildFixedTeamSkillContext(calculatedCards);
    const instanceIds = calculatedCards.map((card) => {
      const instanceId = scoringCards.length;
      scoringCards.push({
        instanceId,
        masterCardId: card.cardId,
        characterId: card.characterId,
        skill: resolveBestdoriScoreSkill({
          skillId: card.skillId,
          skillLevel: card.skillLevel,
          skillMaster: requireSourceMaster(skillsById, card.skillId, `${path}.skillsById`),
          context,
          server: profile.server,
          path: `${path}.skillsById.${card.skillId}`,
        }),
      });
      return instanceId;
    }) as Five<number>;
    const parameters = calculateFixedTeamParameters({
      cards: calculatedCards,
      areaItemsById,
      profileAreaItems,
      selectedAreaItemIds,
      eventBonus: source.eventBonus,
      server: profile.server,
    });
    teamParameters.push(parameters);
    teamMemberCardIds.push(teamSelection.memberCardIds);
    scoringTeams.push({
      slot: teamSlot,
      memberInstanceIds: instanceIds,
      deckTotalParameter: parameters.deckTotalParameter,
    });
  }

  const scoringSongs = songSelections.map((selection, songSlot) => {
    const songId = parseSongIdText(selection.songIdText, `${path}.songs[${songSlot}].songIdText`);
    return {
      slot: songSlot,
      songId,
      difficulty: selection.difficulty,
      playLevel: readSourcePlayLevel(
        songsById[String(songId)],
        songId,
        selection.difficulty,
      ),
      notes: normalizeBestdoriScoringChart(selection.chart, `${path}.songs[${songSlot}].chart`),
    };
  }) as Triple<MedleySongV1>;

  const scoringInput: FixedMedleyEvaluationInputV1 = {
    schemaVersion: MEDLEY_SCORING_INPUT_SCHEMA_VERSION,
    scoringRulesVersion: MEDLEY_SCORING_RULES_VERSION,
    perfectRate,
    cards: scoringCards,
    teams: scoringTeams as Triple<FixedTeamV1>,
    songs: scoringSongs,
  };
  return {
    scoringInput,
    audit: {
      sourceSchemaVersion: MEDLEY_FOUNDATION_SOURCE_SCHEMA_VERSION,
      profileName: profile.name,
      server: profile.server as BandoriServer,
      selectedCardIds: [...selectedCardIds],
      selectedAreaItemIds,
      teamMemberCardIds: teamMemberCardIds as Triple<Five<number>>,
      teamParameters: teamParameters as Triple<FixedTeamParameterTraceV1>,
    },
  };
}
