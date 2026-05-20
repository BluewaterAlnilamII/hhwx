/*
 * Bandori 队伍计算基础层。
 *
 * 本模块只处理单张卡、区域道具、活动加成和技能上下文解析等纯计算。
 * 搜索算法不在这里实现，方便单曲、组曲和验证脚本复用同一套综合力与技能口径。
 */
export type BandoriCardAttribute = "powerful" | "cool" | "happy" | "pure";

export type BandoriJudge = "perfect" | "great" | "good" | "bad" | "miss";

export type BandoriParamVector = readonly [number, number, number];

export type BandoriTeamCardContext = {
  characterId: number;
  attribute: BandoriCardAttribute;
};

export type BandoriCharacterMaster = {
  bandId?: number | null;
};

export type BandoriUserCardState = {
  cardId: number;
  level: number;
  masterRank: number;
  skillLevel: number;
  episodeCount: number;
  isTrained: boolean;
  isExcluded?: boolean;
};

export type BandoriCharacterBonusState = {
  characterId: number;
  potential?: Partial<Record<BandoriParamKey, number | null>>;
  missionBonusPercent?: Partial<Record<BandoriParamKey, number | null>>;
  missionBonusPercentByType?: Partial<Record<"collection" | "training", Partial<Record<BandoriParamKey, number | null>>>>;
  missionBonusRoundingMode?: "combined" | "split-by-type";
};

export type BestdoriParamObject = {
  performance?: unknown;
  technique?: unknown;
  visual?: unknown;
};

export type BestdoriCardMaster = {
  characterId?: unknown;
  attribute?: unknown;
  rarity?: unknown;
  skillId?: unknown;
  levelLimit?: unknown;
  stat?: Record<string, unknown> & {
    episodes?: BestdoriParamObject[];
    training?: BestdoriParamObject & {
      levelLimit?: unknown;
    };
  };
};

export type BestdoriAreaItemMaster = {
  targetAttributes?: unknown;
  targetBandIds?: unknown;
  performance?: Record<string, unknown>;
  technique?: Record<string, unknown>;
  visual?: Record<string, unknown>;
};

export type BandoriUserAreaItemState = {
  areaItemId: number;
  level: number;
};

export type BandoriEventBonus = {
  attributes?: unknown[];
  characters?: unknown[];
  pointPercent?: number | null;
  parameterPercent?: number | null;
  performancePercent?: number | null;
  techniquePercent?: number | null;
  visualPercent?: number | null;
  members?: unknown[];
  limitBreaks?: unknown[];
};

export type BandoriTeamContext = {
  sameBandId: number | null;
  sameAttribute: BandoriCardAttribute | null;
};

export type BestdoriSkillEffect = {
  activateEffectValue?: unknown;
  activateCondition?: unknown;
  activateConditionLife?: unknown;
};

export type BestdoriSkillMaster = {
  duration?: unknown;
  activationEffect?: {
    activateEffectTypes?: Record<string, BestdoriSkillEffect>;
    unificationActivateConditionBandId?: unknown;
    unificationActivateConditionType?: unknown;
    unificationActivateEffectValue?: unknown;
  };
};

export type ResolvedBandoriScoreSkillEffect = {
  type: string;
  valuePercent: number;
  condition: BandoriJudge | "none";
  conditionLife: number | null;
  isUnifiedValue: boolean;
};

export type ResolvedBandoriSkill = {
  durationSeconds: number;
  scoreEffects: ResolvedBandoriScoreSkillEffect[];
  hasRateUpWithPerfect: boolean;
  cacheKey: string;
};

export type CalculatedBandoriCard = BandoriUserCardState & {
  characterId: number;
  bandId: number | null;
  attribute: BandoriCardAttribute;
  rarity: number;
  skillId: number;
  baseParam: BandoriParamVector;
  characterParam: BandoriParamVector;
  totalPower: number;
};

export type BandoriCardEventBonus = {
  parameterBonus: BandoriParamVector;
  parameterBonusWithRoom: BandoriParamVector;
  pointBonusRate: number;
};

export type BandoriSupportCardEventBonus = {
  supportBonusRate: number;
  supportPower: number;
};

export type CalculatedBandoriTeam = {
  cards: CalculatedBandoriCard[];
  context: BandoriTeamContext;
  cardPower: number;
  areaItemPower: number;
  eventPower: number;
  eventPowerWithRoom: number;
  totalPower: number;
  totalPowerWithRoom: number;
  pointBonusRate: number;
  selectedAreaItemIds: number[];
  skills: Array<{
    cardId: number;
    skillId: number;
    skillLevel: number;
    resolvedSkill: ResolvedBandoriSkill | null;
  }>;
};

type BandoriParamKey = "performance" | "technique" | "visual";

const PARAM_KEYS = ["performance", "technique", "visual"] as const satisfies readonly BandoriParamKey[];

const SCORE_EFFECT_TYPES = new Set([
  "score",
  "score_over_life",
  "score_under_life",
  "score_continued_note_judge",
  "score_under_great_half",
  "score_only_perfect",
  "score_rate_up_with_perfect",
]);

// 非满级卡牌按稀有度成长曲线计算，不能用线性插值近似，否则低等级卡会稳定偏差。
export const BANDORI_CARD_LEVEL_GROWTH_CURVES: readonly (readonly number[])[] = [
  [0, 0.027741577148418566, 0.05827079766928518, 0.09157023784727926, 0.12763157919247634, 0.16646335421245123, 0.2080467329810958, 0.2523725635815978, 0.29945970809515476, 0.3493549269647502, 0.4019829891560635, 0.45737145350963615, 0.5155589441139967, 0.5765070194790465, 0.6401879689268755, 0.7066399177484718, 0.77583438444173, 0.8477702087090347, 0.922495295719485, 1],
  [0, 0.017856719467337606, 0.036896819500198366, 0.05712720353262898, 0.0785481410852151, 0.10115068684022054, 0.12493367020010375, 0.14991873595264252, 0.17609001362625878, 0.20343906942389595, 0.23198087664087155, 0.26171208783900635, 0.2926379539012518, 0.324741136882865, 0.3580344489450513, 0.3925231410698117, 0.4281932552740394, 0.46505212999997836, 0.5031024182461973, 0.5423349324988558, 0.5827566752115649, 0.6243699948827242, 0.6671642798084607, 0.7111523418284023, 0.7563202420759938, 0.802684231316528, 0.8502340870909751, 0.8989700203928614, 0.9488922676005076, 1],
  [0, 0.006579811100923505, 0.013490376941789076, 0.02072357033736649, 0.0282857469218734, 0.036174782566627796, 0.044399557457405224, 0.0529520377427399, 0.06182744102603252, 0.07104081341142438, 0.0805784925749624, 0.09044396348716642, 0.1006360985970335, 0.11115826738840272, 0.12201077801526514, 0.1331914612552324, 0.14469696632024545, 0.1565321016810991, 0.16870064899154105, 0.18119441263664268, 0.19401618052690653, 0.20716987792842392, 0.220646377954231, 0.23445670502582086, 0.24859157352745323, 0.26305982052078125, 0.2778572809267125, 0.29297495807935886, 0.30842764497977343, 0.3242045972904203, 0.3403108556813293, 0.3567490256479929, 0.37351842656938367, 0.3906106859938102, 0.4080321560667454, 0.4257874104768857, 0.4438663146273812, 0.4622730945351113, 0.48101099472751, 0.5000713733964425, 0.5277508312304107, 0.5603880999928903, 0.5979841991476733, 0.6405413574510139, 0.6880557418260439, 0.7405268767404022, 0.7979648036251932, 0.8603540332444733, 0.9276952510130176, 1],
  [0, 0.0052137940761305835, 0.010626772033633004, 0.01625140619739073, 0.02208300765878985, 0.028130123879720123, 0.03438591969492338, 0.040845165089679725, 0.04751431401768039, 0.05438920952360014, 0.06146926738626297, 0.06876102000541633, 0.07625624123106317, 0.08396613839157453, 0.09187956441780568, 0.1000002838288349, 0.1083369509623417, 0.11687849700242568, 0.12562643419463135, 0.13458349890179105, 0.14375149230097023, 0.1531220343111895, 0.1627012369922088, 0.1724891364692424, 0.18248307296777722, 0.19268953004894984, 0.2031038118277759, 0.2137266946705706, 0.22455873405686588, 0.23560016086505522, 0.246845117069297, 0.2583022752066268, 0.26996585295356473, 0.2818368100569856, 0.29391689352667993, 0.3062034732003648, 0.31870850250918314, 0.3314136656714306, 0.34432706913752, 0.35744699511750455, 0.37077464809342076, 0.3843126970348029, 0.39805844303293897, 0.41201000405281624, 0.4261726805173379, 0.440542342723313, 0.4551202726012628, 0.46990761662317243, 0.48490456025578976, 0.5001066997170803, 0.5277872974717714, 0.5604260864848988, 0.5980193982337021, 0.640573453684307, 0.6880874211513187, 0.7405574835992293, 0.7979798883017865, 0.8603639584557542, 0.927706300412736, 1],
  [0, 0.0052137940761305835, 0.010626772033633004, 0.01625140619739073, 0.02208300765878985, 0.028130123879720123, 0.03438591969492338, 0.040845165089679725, 0.04751431401768039, 0.05438920952360014, 0.06146926738626297, 0.06876102000541633, 0.07625624123106317, 0.08396613839157453, 0.09187956441780568, 0.1000002838288349, 0.1083369509623417, 0.11687849700242568, 0.12562643419463135, 0.13458349890179105, 0.14375149230097023, 0.1531220343111895, 0.1627012369922088, 0.1724891364692424, 0.18248307296777722, 0.19268953004894984, 0.2031038118277759, 0.2137266946705706, 0.22455873405686588, 0.23560016086505522, 0.246845117069297, 0.2583022752066268, 0.26996585295356473, 0.2818368100569856, 0.29391689352667993, 0.3062034732003648, 0.31870850250918314, 0.3314136656714306, 0.34432706913752, 0.35744699511750455, 0.37077464809342076, 0.3843126970348029, 0.39805844303293897, 0.41201000405281624, 0.4261726805173379, 0.440542342723313, 0.4551202726012628, 0.46990761662317243, 0.48490456025578976, 0.5001066997170803, 0.5277872974717714, 0.5604260864848988, 0.5980193982337021, 0.640573453684307, 0.6880874211513187, 0.7405574835992293, 0.7979798883017865, 0.8603639584557542, 0.927706300412736, 1],
];

const JUDGE_RANK: Record<BandoriJudge, number> = {
  perfect: 0,
  great: 1,
  good: 2,
  bad: 3,
  miss: 4,
};

function toFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toInteger(value: unknown, fallback = 0): number {
  const numberValue = toFiniteNumber(value);
  return numberValue === null ? fallback : Math.trunc(numberValue);
}

function getRegionalNumber(value: unknown, server: number): number | null {
  if (Array.isArray(value)) {
    return toFiniteNumber(value[server]) ?? toFiniteNumber(value[0]);
  }

  return toFiniteNumber(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function addParamVector(left: BandoriParamVector, right: BandoriParamVector): BandoriParamVector {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function floorParamVector(value: BandoriParamVector): BandoriParamVector {
  return [Math.floor(value[0]), Math.floor(value[1]), Math.floor(value[2])];
}

function sumParamVector(value: BandoriParamVector): number {
  return value[0] + value[1] + value[2];
}

function multiplyParamVector(value: BandoriParamVector, rates: BandoriParamVector): BandoriParamVector {
  return [value[0] * rates[0], value[1] * rates[1], value[2] * rates[2]];
}

export function calculateBandoriRoundedParamBonusPower(value: BandoriParamVector, rates: BandoriParamVector): number {
  return value[0] * rates[0] + value[1] * rates[1] + value[2] * rates[2];
}

function bestdoriParamToVector(value: unknown): BandoriParamVector {
  if (!isRecord(value)) {
    return [0, 0, 0];
  }

  return PARAM_KEYS.map((key) => toFiniteNumber(value[key]) ?? 0) as unknown as BandoriParamVector;
}

function normalizeSkillLevel(skillLevel: number): number {
  if (!Number.isFinite(skillLevel)) {
    return 1;
  }

  return Math.min(5, Math.max(1, Math.trunc(skillLevel)));
}

function normalizeJudge(value: unknown): BandoriJudge | "none" {
  if (typeof value !== "string") {
    return "none";
  }

  const normalized = value.toLowerCase();
  if (
    normalized === "perfect"
    || normalized === "great"
    || normalized === "good"
    || normalized === "bad"
    || normalized === "miss"
  ) {
    return normalized;
  }

  return "none";
}

function normalizeCardAttribute(value: unknown): BandoriCardAttribute | null {
  if (value === "powerful" || value === "cool" || value === "happy" || value === "pure") {
    return value;
  }

  return null;
}

function resolvesUnifiedBandCondition(
  skill: BestdoriSkillMaster,
  context: BandoriTeamContext,
): boolean {
  const expectedBandId = toFiniteNumber(skill.activationEffect?.unificationActivateConditionBandId);
  return expectedBandId !== null && context.sameBandId === expectedBandId;
}

function resolvesUnifiedAttributeCondition(
  skill: BestdoriSkillMaster,
  context: BandoriTeamContext,
): boolean {
  const expectedAttribute = skill.activationEffect?.unificationActivateConditionType;
  return typeof expectedAttribute === "string" && context.sameAttribute === expectedAttribute.toLowerCase();
}

function normalizeCardLevel(card: BestdoriCardMaster, state: BandoriUserCardState): {
  level: number;
  maxLevel: number;
} {
  const baseLevelLimit = Math.max(1, toInteger(card.levelLimit, 1));
  const trainingLevelLimit = Math.max(0, toInteger(card.stat?.training?.levelLimit, 0));
  const maxLevel = baseLevelLimit + trainingLevelLimit;
  const level = Math.min(maxLevel, Math.max(1, toInteger(state.level, 1)));
  return { level, maxLevel };
}

function getCardLevelGrowthRate(rarity: number, level: number, maxLevel: number): number {
  if (level >= maxLevel) {
    return 1;
  }

  // master 数据存在旧卡和异常输入，缺失曲线时才退回线性值，正常卡不能走这个近似。
  const curve = BANDORI_CARD_LEVEL_GROWTH_CURVES[rarity - 1];
  return curve?.[level - 1] ?? (maxLevel > 1 ? (level - 1) / (maxLevel - 1) : 0);
}

function getCharacterMissionBonusVector(
  characterId: number,
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>,
): BandoriParamVector {
  const bonus = characterBonusesById[String(characterId)];
  return PARAM_KEYS.map((key) => (
    (toFiniteNumber(bonus?.missionBonusPercent?.[key]) ?? 0) / 100
  )) as unknown as BandoriParamVector;
}

function getCharacterMissionBonusVectorByType(
  characterId: number,
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>,
  bonusType: "collection" | "training",
): BandoriParamVector {
  const bonus = characterBonusesById[String(characterId)];
  return PARAM_KEYS.map((key) => (
    (toFiniteNumber(bonus?.missionBonusPercentByType?.[bonusType]?.[key]) ?? 0) / 100
  )) as unknown as BandoriParamVector;
}

function getCharacterPotentialVector(
  characterId: number,
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>,
): BandoriParamVector {
  const bonus = characterBonusesById[String(characterId)];
  return PARAM_KEYS.map((key) => {
    const level = toFiniteNumber(bonus?.potential?.[key]) ?? 0;
    return level > 1 ? level / 1000 : 0;
  }) as unknown as BandoriParamVector;
}

function getEventAttributePercent(eventBonus: BandoriEventBonus | null | undefined, attribute: BandoriCardAttribute): number {
  const record = eventBonus?.attributes?.find((item) => isRecord(item) && item.attribute === attribute);
  return isRecord(record) ? (toFiniteNumber(record.percent) ?? 0) / 100 : 0;
}

function getEventCharacterPercent(eventBonus: BandoriEventBonus | null | undefined, characterId: number): number {
  const record = eventBonus?.characters?.find((item) => isRecord(item) && toInteger(item.characterId) === characterId);
  return isRecord(record) ? (toFiniteNumber(record.percent) ?? 0) / 100 : 0;
}

function getEventMemberPercent(eventBonus: BandoriEventBonus | null | undefined, cardId: number): number {
  const record = eventBonus?.members?.find((item) => (
    isRecord(item) && (toInteger(item.situationId) === cardId || toInteger(item.id) === cardId)
  ));
  return isRecord(record) ? (toFiniteNumber(record.percent) ?? 0) / 100 : 0;
}

function getEventMasterRankPercent(
  eventBonus: BandoriEventBonus | null | undefined,
  rarity: number,
  masterRank: number,
): number {
  const record = eventBonus?.limitBreaks?.find((item) => (
    isRecord(item) && toInteger(item.rarity) === rarity && toInteger(item.rank) === masterRank
  ));
  return isRecord(record) ? (toFiniteNumber(record.percent) ?? 0) / 100 : 0;
}

function getEventRoomParameterPercentVector(eventBonus: BandoriEventBonus | null | undefined): BandoriParamVector {
  return [
    (toFiniteNumber(eventBonus?.performancePercent) ?? 0) / 100,
    (toFiniteNumber(eventBonus?.techniquePercent) ?? 0) / 100,
    (toFiniteNumber(eventBonus?.visualPercent) ?? 0) / 100,
  ];
}

export function getBandoriTeamContext(
  cards: BandoriTeamCardContext[],
  charactersById: Record<string, BandoriCharacterMaster | undefined>,
): BandoriTeamContext {
  let sameBandId: number | null | undefined;
  let sameAttribute: BandoriCardAttribute | null | undefined;

  for (const card of cards) {
    const bandId = toFiniteNumber(charactersById[String(card.characterId)]?.bandId);
    if (bandId === null) {
      sameBandId = null;
      break;
    } else if (sameBandId === undefined) {
      sameBandId = bandId;
    } else if (sameBandId !== bandId) {
      sameBandId = null;
      break;
    }
  }

  for (const card of cards) {
    if (sameAttribute === undefined) {
      sameAttribute = card.attribute;
    } else if (sameAttribute !== card.attribute) {
      sameAttribute = null;
      break;
    }
  }

  return {
    sameBandId: cards.length > 0 ? sameBandId ?? null : null,
    sameAttribute: cards.length > 0 ? sameAttribute ?? null : null,
  };
}

export function calculateBandoriCard(
  state: BandoriUserCardState,
  card: BestdoriCardMaster,
  charactersById: Record<string, BandoriCharacterMaster | undefined>,
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined> = {},
): CalculatedBandoriCard {
  const characterId = toInteger(card.characterId);
  const attribute = normalizeCardAttribute(card.attribute);
  const rarity = toInteger(card.rarity);
  const skillId = toInteger(card.skillId);
  const { level, maxLevel } = normalizeCardLevel(card, state);
  const minimumParam = bestdoriParamToVector(card.stat?.["1"]);
  const maximumParam = bestdoriParamToVector(card.stat?.[String(maxLevel)]);
  const levelRatio = getCardLevelGrowthRate(rarity, level, maxLevel);
  let baseParam = PARAM_KEYS.map((_, index) => (
    Math.round(minimumParam[index] + (maximumParam[index] - minimumParam[index]) * levelRatio)
  )) as unknown as BandoriParamVector;

  const masterRankBonus = 50 * rarity * Math.max(0, toInteger(state.masterRank));
  baseParam = addParamVector(baseParam, [masterRankBonus, masterRankBonus, masterRankBonus]);

  if (state.isTrained) {
    baseParam = addParamVector(baseParam, bestdoriParamToVector(card.stat?.training));
  }

  const episodes = Array.isArray(card.stat?.episodes) ? card.stat.episodes : [];
  for (let index = 0; index < Math.min(episodes.length, Math.max(0, toInteger(state.episodeCount))); index += 1) {
    baseParam = addParamVector(baseParam, bestdoriParamToVector(episodes[index]));
  }

  const potentialRates = getCharacterPotentialVector(characterId, characterBonusesById);
  const bonus = characterBonusesById[String(characterId)];
  const hasMissionBonusTypes = Boolean(bonus?.missionBonusPercentByType);
  const shouldSplitMissionBonusTypes = bonus?.missionBonusRoundingMode !== "combined";
  const characterBonusParam = hasMissionBonusTypes && shouldSplitMissionBonusTypes
    ? addParamVector(
      addParamVector(
        floorParamVector(multiplyParamVector(baseParam, potentialRates)),
        floorParamVector(multiplyParamVector(baseParam, getCharacterMissionBonusVectorByType(characterId, characterBonusesById, "collection"))),
      ),
      floorParamVector(multiplyParamVector(baseParam, getCharacterMissionBonusVectorByType(characterId, characterBonusesById, "training"))),
    )
    : hasMissionBonusTypes
      ? addParamVector(
        floorParamVector(multiplyParamVector(baseParam, potentialRates)),
        floorParamVector(multiplyParamVector(baseParam, getCharacterMissionBonusVector(characterId, characterBonusesById))),
      )
    : floorParamVector(multiplyParamVector(
      baseParam,
      addParamVector(potentialRates, getCharacterMissionBonusVector(characterId, characterBonusesById)),
    ));
  const characterParam = addParamVector(baseParam, characterBonusParam);
  const bandId = toFiniteNumber(charactersById[String(characterId)]?.bandId);

  if (!attribute) {
    throw new Error(`Invalid Bandori card attribute for card ${state.cardId}`);
  }

  return {
    ...state,
    level,
    characterId,
    bandId,
    attribute,
    rarity,
    skillId,
    baseParam,
    characterParam,
    totalPower: sumParamVector(characterParam),
  };
}

export function calculateBandoriAreaItemPower(
  cards: CalculatedBandoriCard[],
  areaItemsById: Record<string, BestdoriAreaItemMaster | undefined>,
  userAreaItemsById: Record<string, BandoriUserAreaItemState | undefined>,
  areaItemGroups: number[][],
  server = 3,
): { power: number; selectedAreaItemIds: number[] } {
  let power = 0;
  const selectedAreaItemIds: number[] = [];

  for (const group of areaItemGroups) {
    let bestGroupPower = 0;
    let bestAreaItemId: number | null = null;

    for (const areaItemId of group) {
      const areaItem = areaItemsById[String(areaItemId)];
      const level = Math.max(0, toInteger(userAreaItemsById[String(areaItemId)]?.level));
      if (!areaItem || level <= 0) {
        continue;
      }

      const targetAttributes = Array.isArray(areaItem.targetAttributes) ? areaItem.targetAttributes : [];
      const targetBandIds = Array.isArray(areaItem.targetBandIds) ? areaItem.targetBandIds.map((item) => toInteger(item)) : [];
      const rates: BandoriParamVector = [
        (getRegionalNumber(areaItem.performance?.[String(level)], server) ?? 0) / 100,
        (getRegionalNumber(areaItem.technique?.[String(level)], server) ?? 0) / 100,
        (getRegionalNumber(areaItem.visual?.[String(level)], server) ?? 0) / 100,
      ];
      const groupPower = cards.reduce((sum, card) => {
        if (!targetAttributes.includes(card.attribute) || card.bandId === null || !targetBandIds.includes(card.bandId)) {
          return sum;
        }

        return sum + calculateBandoriRoundedParamBonusPower(card.characterParam, rates);
      }, 0);

      if (groupPower > bestGroupPower) {
        bestGroupPower = groupPower;
        bestAreaItemId = areaItemId;
      }
    }

    if (bestAreaItemId !== null) {
      selectedAreaItemIds.push(bestAreaItemId);
    }
    power += bestGroupPower;
  }

  return {
    power,
    selectedAreaItemIds,
  };
}

export function calculateBandoriSelectedAreaItemPower(
  cards: CalculatedBandoriCard[],
  areaItemsById: Record<string, BestdoriAreaItemMaster | undefined>,
  userAreaItemsById: Record<string, BandoriUserAreaItemState | undefined>,
  selectedAreaItemIds: number[],
  server = 3,
): { power: number; selectedAreaItemIds: number[] } {
  // 搜索层会枚举一个全局区域配置；这里按传入配置求值，不能再逐 group 自行取最大。
  const power = selectedAreaItemIds.reduce((totalPower, areaItemId) => {
    const areaItem = areaItemsById[String(areaItemId)];
    const level = Math.max(0, toInteger(userAreaItemsById[String(areaItemId)]?.level));
    if (!areaItem || level <= 0) {
      return totalPower;
    }

    const targetAttributes = Array.isArray(areaItem.targetAttributes) ? areaItem.targetAttributes : [];
    const targetBandIds = Array.isArray(areaItem.targetBandIds) ? areaItem.targetBandIds.map((item) => toInteger(item)) : [];
    const rates: BandoriParamVector = [
      (getRegionalNumber(areaItem.performance?.[String(level)], server) ?? 0) / 100,
      (getRegionalNumber(areaItem.technique?.[String(level)], server) ?? 0) / 100,
      (getRegionalNumber(areaItem.visual?.[String(level)], server) ?? 0) / 100,
    ];

    return totalPower + cards.reduce((cardPower, card) => {
      if (!targetAttributes.includes(card.attribute) || card.bandId === null || !targetBandIds.includes(card.bandId)) {
        return cardPower;
      }

      return cardPower + calculateBandoriRoundedParamBonusPower(card.characterParam, rates);
    }, 0);
  }, 0);

  return {
    power,
    selectedAreaItemIds,
  };
}

export function calculateBandoriCardEventBonus(
  card: CalculatedBandoriCard,
  eventBonus: BandoriEventBonus | null | undefined,
): BandoriCardEventBonus {
  const attributePercent = getEventAttributePercent(eventBonus, card.attribute);
  const characterPercent = getEventCharacterPercent(eventBonus, card.characterId);
  const memberPercent = getEventMemberPercent(eventBonus, card.cardId);
  const masterRankPercent = getEventMasterRankPercent(eventBonus, card.rarity, card.masterRank);
  const matchesAttributeAndCharacter = attributePercent > 0 && characterPercent > 0;
  const matchParameterPercent = matchesAttributeAndCharacter ? (toFiniteNumber(eventBonus?.parameterPercent) ?? 0) / 100 : 0;
  const matchPointPercent = matchesAttributeAndCharacter ? (toFiniteNumber(eventBonus?.pointPercent) ?? 0) / 100 : 0;
  const baseRate = attributePercent + characterPercent + memberPercent + masterRankPercent + matchParameterPercent;
  const parameterRates = matchesAttributeAndCharacter
    ? addParamVector([baseRate, baseRate, baseRate], getEventRoomParameterPercentVector(eventBonus))
    : [baseRate, baseRate, baseRate] as BandoriParamVector;

  return {
    parameterBonus: multiplyParamVector(card.characterParam, parameterRates),
    parameterBonusWithRoom: multiplyParamVector(card.characterParam, parameterRates),
    pointBonusRate: attributePercent + characterPercent + memberPercent + masterRankPercent + matchPointPercent,
  };
}

export function calculateBandoriSupportCardEventBonus(
  card: CalculatedBandoriCard,
  eventBonus: BandoriEventBonus | null | undefined,
): BandoriSupportCardEventBonus {
  const supportBonusRate = Math.max(
    0,
    getEventAttributePercent(eventBonus, card.attribute)
      + getEventCharacterPercent(eventBonus, card.characterId)
      + getEventMemberPercent(eventBonus, card.cardId)
      + getEventMasterRankPercent(eventBonus, card.rarity, card.masterRank),
  );

  return {
    supportBonusRate,
    supportPower: card.totalPower * (1 + supportBonusRate),
  };
}

export function calculateBandoriTeamPower(options: {
  cards: CalculatedBandoriCard[];
  skillsById?: Record<string, BestdoriSkillMaster | undefined>;
  eventBonus?: BandoriEventBonus | null;
  areaItemsById?: Record<string, BestdoriAreaItemMaster | undefined>;
  userAreaItemsById?: Record<string, BandoriUserAreaItemState | undefined>;
  areaItemGroups?: number[][];
  leaderIndex?: number;
  server?: number;
}): CalculatedBandoriTeam {
  const server = options.server ?? 3;
  const context = getBandoriTeamContext(options.cards, Object.fromEntries(
    options.cards.map((card) => [String(card.characterId), { bandId: card.bandId }]),
  ));
  const cardPower = options.cards.reduce((sum, card) => sum + card.totalPower, 0);
  const areaItemResult = options.areaItemsById && options.userAreaItemsById && options.areaItemGroups
    ? calculateBandoriAreaItemPower(options.cards, options.areaItemsById, options.userAreaItemsById, options.areaItemGroups, server)
    : { power: 0, selectedAreaItemIds: [] };
  const eventBonuses = options.cards.map((card) => calculateBandoriCardEventBonus(card, options.eventBonus));
  const eventPower = Math.floor(eventBonuses.reduce((sum, bonus) => sum + sumParamVector(bonus.parameterBonus), 0));
  const eventPowerWithRoom = Math.floor(eventBonuses.reduce((sum, bonus) => sum + sumParamVector(bonus.parameterBonusWithRoom), 0));
  const pointBonusRate = Math.round(eventBonuses.reduce((sum, bonus) => sum + bonus.pointBonusRate, 0) * 100) / 100;
  const leaderIndex = Math.min(Math.max(0, toInteger(options.leaderIndex)), Math.max(0, options.cards.length - 1));
  const skillCards = options.cards.length === 0
    ? []
    : [options.cards[leaderIndex], ...options.cards.filter((_, index) => index !== leaderIndex)];

  return {
    cards: options.cards,
    context,
    cardPower,
    areaItemPower: areaItemResult.power,
    eventPower,
    eventPowerWithRoom,
    totalPower: cardPower + areaItemResult.power + eventPower,
    totalPowerWithRoom: cardPower + areaItemResult.power + eventPowerWithRoom,
    pointBonusRate,
    selectedAreaItemIds: areaItemResult.selectedAreaItemIds,
    skills: skillCards.map((card) => {
      const skill = options.skillsById?.[String(card.skillId)];
      return {
        cardId: card.cardId,
        skillId: card.skillId,
        skillLevel: card.skillLevel,
        resolvedSkill: skill ? resolveBandoriSkill(card.skillId, skill, card.skillLevel, context, server) : null,
      };
    }),
  };
}

// 技能解析必须包含队伍上下文：同团/同属性条件技能在队伍确定前不能复用同一个缓存值。
export function buildBandoriSkillCacheKey(
  skillId: number,
  skillLevel: number,
  context: BandoriTeamContext,
  server: number,
): string {
  return [
    skillId,
    normalizeSkillLevel(skillLevel),
    server,
    context.sameBandId ?? "mixed-band",
    context.sameAttribute ?? "mixed-attr",
  ].join(":");
}

export function resolveBandoriSkill(
  skillId: number,
  skill: BestdoriSkillMaster,
  skillLevel: number,
  context: BandoriTeamContext,
  server = 3,
): ResolvedBandoriSkill {
  const normalizedSkillLevel = normalizeSkillLevel(skillLevel);
  const durationSeconds = getRegionalNumber(
    Array.isArray(skill.duration) ? skill.duration[normalizedSkillLevel - 1] : skill.duration,
    server,
  ) ?? 0;
  const effectTypes = skill.activationEffect?.activateEffectTypes ?? {};
  const unifiedValue = getRegionalNumber(skill.activationEffect?.unificationActivateEffectValue, server);
  const hasRateUpWithPerfect = "score_rate_up_with_perfect" in effectTypes;
  const shouldUseUnifiedValue = unifiedValue !== null && (
    resolvesUnifiedBandCondition(skill, context)
    || resolvesUnifiedAttributeCondition(skill, context)
  );
  let unifiedValueApplied = false;

  const scoreEffects = Object.entries(effectTypes).flatMap(([type, effect]) => {
    if (!SCORE_EFFECT_TYPES.has(type)) {
      return [];
    }

    const regionalValue = getRegionalNumber(effect.activateEffectValue, server);
    if (regionalValue === null) {
      return [];
    }

    const useUnifiedValue = type !== "score_rate_up_with_perfect" && shouldUseUnifiedValue && !unifiedValueApplied;
    if (useUnifiedValue) {
      unifiedValueApplied = true;
    }

    return {
      type,
      valuePercent: useUnifiedValue ? unifiedValue : regionalValue,
      condition: normalizeJudge(effect.activateCondition),
      conditionLife: toFiniteNumber(effect.activateConditionLife),
      isUnifiedValue: useUnifiedValue,
    };
  });

  return {
    durationSeconds,
    scoreEffects,
    hasRateUpWithPerfect,
    cacheKey: buildBandoriSkillCacheKey(skillId, normalizedSkillLevel, context, server),
  };
}

export function getBandoriScoreSkillMultiplier(
  effect: ResolvedBandoriScoreSkillEffect,
  judge: BandoriJudge,
): number {
  // 当前搜索准率模型只区分 PERFECT/GREAT；GOOD/BAD/MISS 打断由调用侧决定是否生成。
  if (effect.condition === "none") {
    return 1 + effect.valuePercent / 100;
  }

  if (JUDGE_RANK[judge] <= JUDGE_RANK[effect.condition]) {
    return 1 + effect.valuePercent / 100;
  }

  if (effect.type === "score_under_great_half") {
    return 0.5;
  }

  if (effect.type === "score_only_perfect") {
    return 0;
  }

  return 1;
}
