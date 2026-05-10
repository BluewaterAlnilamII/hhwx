const BESTDORI_AREA_ITEMS_URL = "https://bestdori.com/api/areaItems/main.2.json";

export type BandoriAreaItemMetadata = {
  areaItemId: number;
  areaItemName: Array<string | null>;
  targetAttributes: string[];
  targetBandIds: number[];
  level: Array<number | null>;
  description?: Record<string, Array<string | null>>;
  performance?: Record<string, Array<number | null>>;
  technique?: Record<string, Array<number | null>>;
  visual?: Record<string, Array<number | null>>;
  source: "bestdori" | "hhwx-cn";
};

type BestdoriAreaItemPayload = Record<string, Omit<BandoriAreaItemMetadata, "areaItemId" | "source">>;

const REGION_COUNT = 5;
const ALL_ATTRIBUTES = ["powerful", "pure", "cool", "happy"];
const ALL_CN_BAND_IDS = [1, 2, 3, 4, 5, 21, 18, 45];

const CN_ONLY_AREA_ITEMS: Record<string, BandoriAreaItemMetadata> = {
  "59": createCnOnlyAllMemberAreaItem(59, "巧克力海螺包", 5),
  "68": createCnOnlyAllMemberAreaItem(68, "盆栽套装", 5),
  "72": createCnOnlyAllMemberAreaItem(72, "极上咖啡", 5),
};

export const LEGACY_GAME_AREA_ITEM_RESOURCE_ALIASES: Record<string, number> = {
  "295": 59,
  "340": 68,
  "477": 72,
  "478": 72,
  "479": 72,
  "480": 72,
  "481": 72,
  "697": 56,
  "698": 57,
  "699": 58,
  "700": 60,
};

for (let resourceId = 1; resourceId <= 35; resourceId += 1) {
  LEGACY_GAME_AREA_ITEM_RESOURCE_ALIASES[String(348 + resourceId * 5)] = resourceId;
}

for (let resourceId = 56; resourceId <= 60; resourceId += 1) {
  LEGACY_GAME_AREA_ITEM_RESOURCE_ALIASES[String(291 + (resourceId - 56) * 5)] = resourceId;
}

for (let resourceId = 66; resourceId <= 70; resourceId += 1) {
  LEGACY_GAME_AREA_ITEM_RESOURCE_ALIASES[String(331 + (resourceId - 66) * 5)] = resourceId;
}

for (let resourceId = 73; resourceId <= 103; resourceId += 1) {
  LEGACY_GAME_AREA_ITEM_RESOURCE_ALIASES[String(138 + resourceId * 5)] = resourceId;
}

for (let resourceId = 73; resourceId <= 77; resourceId += 1) {
  LEGACY_GAME_AREA_ITEM_RESOURCE_ALIASES[String(656 + (resourceId - 73) * 3)] = resourceId;
}

for (let resourceId = 83; resourceId <= 87; resourceId += 1) {
  LEGACY_GAME_AREA_ITEM_RESOURCE_ALIASES[String(750 + (resourceId - 83))] = resourceId;
}

for (let resourceId = 90; resourceId <= 94; resourceId += 1) {
  LEGACY_GAME_AREA_ITEM_RESOURCE_ALIASES[String(755 + (resourceId - 90))] = resourceId;
}

for (let resourceId = 97; resourceId <= 101; resourceId += 1) {
  LEGACY_GAME_AREA_ITEM_RESOURCE_ALIASES[String(760 + (resourceId - 97))] = resourceId;
}

Object.assign(LEGACY_GAME_AREA_ITEM_RESOURCE_ALIASES, {
  "765": 66,
  "766": 67,
  "767": 69,
  "768": 70,
  "769": 80,
  "770": 81,
  "771": 82,
  "772": 26,
  "773": 27,
  "774": 28,
  "775": 29,
  "776": 30,
  "777": 88,
  "778": 95,
  "779": 78,
  "780": 102,
  "781": 31,
  "782": 32,
  "783": 33,
  "784": 34,
  "785": 35,
  "786": 89,
  "787": 96,
  "788": 79,
  "789": 103,
});

function createCnOnlyAllMemberAreaItem(areaItemId: number, nameCn: string, maxLevel: number): BandoriAreaItemMetadata {
  const names: Array<string | null> = [null, null, null, nameCn, null];
  const level = Array.from({ length: REGION_COUNT }, () => maxLevel);
  const description: Record<string, Array<string | null>> = {};
  const performance: Record<string, Array<number | null>> = {};
  const technique: Record<string, Array<number | null>> = {};
  const visual: Record<string, Array<number | null>> = {};

  for (let currentLevel = 1; currentLevel <= maxLevel; currentLevel += 1) {
    const percent = currentLevel * 0.5;
    const regionalPercent = Array.from({ length: REGION_COUNT }, () => percent);
    description[String(currentLevel)] = [null, null, null, `全部成员的属性上升${percent}%`, null];
    performance[String(currentLevel)] = regionalPercent;
    technique[String(currentLevel)] = regionalPercent;
    visual[String(currentLevel)] = regionalPercent;
  }

  return {
    areaItemId,
    areaItemName: names,
    targetAttributes: ALL_ATTRIBUTES,
    targetBandIds: ALL_CN_BAND_IDS,
    level,
    description,
    performance,
    technique,
    visual,
    source: "hhwx-cn",
  };
}

function normalizeAreaItem(areaItemId: number, item: Omit<BandoriAreaItemMetadata, "areaItemId" | "source">): BandoriAreaItemMetadata {
  return {
    ...item,
    areaItemId,
    areaItemName: Array.isArray(item.areaItemName) ? item.areaItemName : [],
    targetAttributes: Array.isArray(item.targetAttributes) ? item.targetAttributes : [],
    targetBandIds: Array.isArray(item.targetBandIds) ? item.targetBandIds : [],
    level: Array.isArray(item.level) ? item.level : [],
    source: "bestdori",
  };
}

export async function fetchBandoriAreaItems(): Promise<Record<string, BandoriAreaItemMetadata>> {
  const response = await fetch(BESTDORI_AREA_ITEMS_URL, {
    headers: { "User-Agent": "hhwx-tracker/1.0" },
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    throw new Error(`Bestdori area items API failed: HTTP ${response.status}`);
  }

  const payload = await response.json() as BestdoriAreaItemPayload;
  const areaItems: Record<string, BandoriAreaItemMetadata> = {};
  Object.entries(payload).forEach(([rawAreaItemId, item]) => {
    const areaItemId = Number.parseInt(rawAreaItemId, 10);
    if (Number.isFinite(areaItemId) && areaItemId > 0) {
      areaItems[rawAreaItemId] = normalizeAreaItem(areaItemId, item);
    }
  });

  Object.assign(areaItems, CN_ONLY_AREA_ITEMS);
  return areaItems;
}

export async function fetchBandoriAreaItemsMetadata() {
  return {
    areaItems: await fetchBandoriAreaItems(),
    gameAreaItemResourceAliases: LEGACY_GAME_AREA_ITEM_RESOURCE_ALIASES,
  };
}
