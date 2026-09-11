import { parseApiSuccessData } from "@/lib/api-contracts";
import { BANDORI_CHART_DIFFICULTIES, isBandoriChartDifficulty, type BandoriChartDifficulty } from "@/lib/bandori-master-contract";
import { BANDORI_CHARACTER_GROUPS } from "@/lib/bandori-character-groups";
import { getBandoriServerFromCode, type BandoriServerCode } from "@/lib/bandori-server";

export const PLAYER_UID_PATTERN = /^[1-9][0-9]{3,15}$/u;
export const PLAYER_BAND_ORDER = [1, 2, 4, 5, 3, 21, 18, 45] as const;
export const PLAYER_BANDS = PLAYER_BAND_ORDER.map((id) => BANDORI_CHARACTER_GROUPS.find((band) => band.bandId === id)!);
// MasterStageChallengeList main challenges 1–7; special challenges are separate.
export const PLAYER_STAGE_BANDS = PLAYER_BANDS.slice(0, 7).map((band, index) => ({ ...band, stageChallengeId: index + 1 }));
export const PLAYER_CLEAR_ROWS = [
  ["clearedMusicCount", "publishMusicClearedFlg", "clear"],
  ["fullComboMusicCount", "publishMusicFullComboFlg", "fullCombo"],
  ["allPerfectMusicCount", "publishMusicAllPerfectFlg", "allPerfect"],
] as const;
const RATING_FIELDS = [
  [1, "userPoppinPartyHighScoreMusicList"], [2, "userAfterglowHighScoreMusicList"],
  [4, "userPastelPalettesHighScoreMusicList"], [5, "userRoseliaHighScoreMusicList"],
  [3, "userHelloHappyWorldHighScoreMusicList"], [21, "userMorfonicaHighScoreMusicList"],
  [18, "userRaiseASuilenHighScoreMusicList"], [45, "userMyGOScoreMusicList"],
  [0, "userOtherHighScoreMusicList"],
] as const;

type RecordValue = Record<string, unknown>;
export function playerRecord(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}
function entries(value: unknown): RecordValue { return playerRecord(playerRecord(value).entries); }
function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function positive(value: unknown): number | null {
  const number = integer(value);
  return number !== null && number > 0 ? number : null;
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }

/** Retain the existing wire shape, but never send protected values to a browser. */
export function redactBandoriPlayerProfile(raw: RecordValue): RecordValue {
  const profile = { ...raw };
  for (const [field, flag] of [
    ["enabledUserAreaItems", "publishTotalDeckPowerFlg"],
    ["bandRankMap", "publishBandRankFlg"],
    ["userHighScoreRating", "publishHighScoreRatingFlg"],
    ["userDeckTotalRatingMap", "publishDeckRankFlg"],
    ["stageChallengeAchievementConditionsMap", "publishStageChallengeAchievementConditionsFlg"],
    ["userCharacterRankMap", "publishCharacterRankFlg"],
    ["updatedAt", "publishUpdatedAtFlg"],
  ]) {
    if (profile[flag] !== true) delete profile[field];
  }
  if (profile.userMusicClearInfoMap) {
    profile.userMusicClearInfoMap = { entries: Object.fromEntries(Object.entries(entries(profile.userMusicClearInfoMap)).map(([difficulty, value]) => {
      const counts = { ...playerRecord(value) };
      for (const [field, flag] of PLAYER_CLEAR_ROWS) if (profile[flag] !== true) delete counts[field];
      return [difficulty, counts];
    })) };
  }
  // Append parameters can reveal power that the player has chosen to hide.
  const situations = playerRecord(profile.mainDeckUserSituations).entries;
  if (profile.publishTotalDeckPowerFlg !== true && Array.isArray(situations)) {
    profile.mainDeckUserSituations = { entries: situations.map((value) => {
      const card = { ...playerRecord(value) };
      delete card.userAppendParameter;
      return card;
    }) };
  }
  return profile;
}

export type PlayerCard = {
  cardId: number; level: number | null; masterRank: number | null; skillLevel: number | null;
  illust: "normal" | "after_training"; isTrained: boolean; isLeader: boolean;
};
export type PlayerRatingSong = { musicId: number; difficulty: BandoriChartDifficulty; rating: number };
export type PlayerSection<T> = { public: boolean; value: T | null };
export type PlayerProfileView = {
  server: BandoriServerCode; uid: string; cache: boolean; fetchedAt: string | null;
  name: string; rank: number | null; introduction: string; cards: PlayerCard[];
  avatar: PlayerCard | null; portrait: { cardId: number; illust: PlayerCard["illust"] } | null;
  degreeIds: number[];
  bandRanks: PlayerSection<Record<string, number | null>>;
  clears: Array<PlayerSection<Record<BandoriChartDifficulty, number | null>>>;
  rating: PlayerSection<{ total: number | null; groups: Array<{ bandId: number; songs: PlayerRatingSong[] | null; total: number | null }> }>;
  stage: PlayerSection<Record<string, number | null>>;
  deckRanks: PlayerSection<Record<string, { rank: string; level: number | null; score: number | null }>>;
  characterRanks: PlayerSection<Record<string, number | null>>;
};

export function parseBandoriPlayerResponse(raw: unknown): PlayerProfileView {
  const data = playerRecord(parseApiSuccessData(raw));
  const profile = playerRecord(data.profile);
  if (getBandoriServerFromCode(data.server) === null || typeof data.uid !== "string"
    || !PLAYER_UID_PATTERN.test(data.uid) || profile.userId !== data.uid) {
    throw new Error("Invalid player response");
  }
  const deck = playerRecord(profile.mainUserDeck);
  const leader = positive(deck.leader);
  const rawCards = playerRecord(profile.mainDeckUserSituations).entries;
  const cards: PlayerCard[] = Array.isArray(rawCards) ? rawCards.slice(0, 5).flatMap((value) => {
    const card = playerRecord(value);
    const cardId = positive(card.situationId);
    return cardId ? [{ cardId, level: integer(card.level), masterRank: integer(card.limitBreakRank),
      skillLevel: integer(card.skillLevel), illust: card.illust === "after_training" ? "after_training" as const : "normal" as const,
      isTrained: card.trainingStatus === "done", isLeader: cardId === leader }] : [];
  }) : [];
  // Native deck slots expand outwards from the leader in the center.
  const positions = [deck.member3, deck.member1, deck.leader, deck.member2, deck.member4];
  if (positions.every((id) => positive(id) !== null) && new Set(positions).size === 5 && cards.every((card) => positions.includes(card.cardId))) {
    cards.sort((left, right) => positions.indexOf(left.cardId) - positions.indexOf(right.cardId));
  }
  const leaderCard = cards.find((card) => card.isLeader) ?? null;
  const setting = playerRecord(profile.userProfileSituation);
  const portraitId = positive(setting.situationId);
  const portrait = setting.viewProfileSituationStatus === "profile_situation"
    ? portraitId ? { cardId: portraitId, illust: setting.illust === "after_training" ? "after_training" as const : "normal" as const } : null
    : leaderCard;
  const portraitCard = cards.find((card) => card.cardId === portrait?.cardId);
  const avatar = portrait ? { ...portraitCard, ...portrait,
    level: portraitCard?.level ?? null, masterRank: portraitCard?.masterRank ?? null,
    skillLevel: portraitCard?.skillLevel ?? null, isLeader: portraitCard?.isLeader ?? false,
    isTrained: portraitCard?.isTrained ?? portrait.illust === "after_training" } : null;
  function section<T>(flag: string, field: string, read: (value: unknown) => T | null): PlayerSection<T> {
    const published = profile[flag] === true;
    const value = profile[field];
    return { public: published, value: published && value !== null && typeof value === "object" && !Array.isArray(value) ? read(value) : null };
  }
  function numberMap(value: unknown): Record<string, number | null> {
    return Object.fromEntries(Object.entries(entries(value)).map(([key, item]) => [key, integer(item)]));
  }
  const degrees = entries(profile.userProfileDegreeMap);
  const degreeIds = ["first", "second"].flatMap((slot) => {
    const id = positive(playerRecord(degrees[slot]).degreeId);
    return id ? [id] : [];
  });
  if (!degreeIds.length && positive(profile.degree)) degreeIds.push(profile.degree as number);
  return {
    server: data.server as BandoriServerCode, uid: data.uid, cache: data.cache === true,
    fetchedAt: typeof data.fetchedAt === "string" && Number.isFinite(Date.parse(data.fetchedAt)) ? data.fetchedAt : null,
    name: text(profile.userName), rank: integer(profile.rank), introduction: text(profile.introduction),
    cards, avatar, portrait, degreeIds,
    bandRanks: section("publishBandRankFlg", "bandRankMap", numberMap),
    clears: PLAYER_CLEAR_ROWS.map(([field, flag]) => section(flag, "userMusicClearInfoMap", (value) => (
      Object.fromEntries(BANDORI_CHART_DIFFICULTIES.map((difficulty) => [difficulty, integer(playerRecord(entries(value)[difficulty])[field])])) as Record<BandoriChartDifficulty, number | null>
    ))),
    rating: section("publishHighScoreRatingFlg", "userHighScoreRating", (value) => {
      const rating = playerRecord(value);
      const groups = RATING_FIELDS.map(([bandId, field]) => {
        const list = playerRecord(rating[field]).entries;
        const songs = Array.isArray(list) && list.every((song) => {
          const entry = playerRecord(song);
          return positive(entry.musicId) !== null && integer(entry.rating) !== null && isBandoriChartDifficulty(text(entry.difficulty));
        }) ? list.map((song) => {
          const entry = playerRecord(song);
          return { musicId: entry.musicId as number, rating: entry.rating as number, difficulty: entry.difficulty as BandoriChartDifficulty };
        }) : null;
        return { bandId, songs, total: songs?.reduce((sum, song) => sum + song.rating, 0) ?? null };
      });
      return { groups, total: groups.every((group) => group.total !== null) ? groups.reduce((sum, group) => sum + group.total!, 0) : null };
    }),
    stage: section<Record<string, number | null>>("publishStageChallengeAchievementConditionsFlg", "stageChallengeAchievementConditionsMap", (value) => {
      const map = playerRecord(value).entries;
      if (!map || typeof map !== "object" || Array.isArray(map)) return null;
      const progress = entries(value);
      // The native progress map is sparse: omitted main challenges have no earned stars.
      return Object.fromEntries(PLAYER_STAGE_BANDS.map(({ bandId, stageChallengeId }) => [bandId,
        progress[stageChallengeId] === undefined ? 0 : integer(progress[stageChallengeId]) ]));
    }),
    deckRanks: section("publishDeckRankFlg", "userDeckTotalRatingMap", (value) => Object.fromEntries(Object.entries(entries(value)).map(([key, value]) => {
      const rank = playerRecord(value);
      return [key, { rank: text(rank.rank).toLowerCase(), level: integer(rank.level), score: integer(rank.score) }];
    }))),
    characterRanks: section("publishCharacterRankFlg", "userCharacterRankMap", (value) => Object.fromEntries(Object.entries(entries(value)).map(([key, value]) => [key, integer(playerRecord(value).rank)]))),
  };
}
