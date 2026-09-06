import type { BandoriCardMaster, BandoriCharacterMaster, BandoriSkillMaster } from "@/lib/bandori/cards/master";
import type { BandoriCardCatalogBaseEntry } from "@/lib/bandori/cards/catalog";
import { materializeBandoriCardForServer } from "@/lib/bandori/cards/regional-extensions";
import {
  BANDORI_CARD_SEARCH_BAND_ALIASES,
  BANDORI_CARD_SEARCH_CHARACTER_ALIASES,
} from "@/lib/bandori/cards/search-aliases";
import {
  BANDORI_SERVERS,
  readBandoriRegionalNumberAt,
  readBandoriRegionalTextAt,
  type BandoriServer,
} from "@/lib/bandori-server";
import { resolveBandoriSkillLabelForServer } from "@/lib/bandori-skill-label";
import {
  BANDORI_SEARCH_SERVER_ALIASES,
  normalizeBandoriSearchText as normalizeBandoriCardSearchText,
  tokenizeBandoriSearch,
} from "@/lib/bandori/search";

export { normalizeBandoriSearchText as normalizeBandoriCardSearchText } from "@/lib/bandori/search";

type SearchSkill = {
  scorePercent: number | null;
  scorer: boolean;
  plock: boolean;
  heal: boolean;
};

export type BandoriCardSearchData = {
  filterSearchText: string;
  searchNames: readonly string[];
  searchSkills: readonly SearchSkill[];
};

export type BandoriCardSearchEntry = Pick<BandoriCardCatalogBaseEntry,
  "cardId" | "bandId" | "attribute" | "availableServers"
> & BandoriCardSearchData & { characterId: number | null; rarity: number | null; type: string | null };
type SearchCondition = (entry: BandoriCardSearchEntry) => boolean;

function readSearchSkill(skill: BandoriSkillMaster, server: BandoriServer): SearchSkill {
  const activation = skill.activationEffect;
  const effects = activation?.activateEffectTypes ?? {};
  const values = Object.entries(effects).flatMap(([type, effect]) => {
    // Per-note growth uses its initial score, not the increment or accumulated cap.
    if (!type.startsWith("score") || type === "score_rate_up_with_perfect") return [];
    const value = readBandoriRegionalNumberAt(effect.activateEffectValue, server);
    return value === null ? [] : [value];
  });
  const unified = readBandoriRegionalNumberAt(activation?.unificationActivateEffectValue, server);
  if (values.length > 0 && unified !== null) values.push(unified);
  const plock = effects.judge !== undefined
    && readBandoriRegionalNumberAt(effects.judge.activateEffectValue, server) !== null;
  const heal = skill.onceEffect?.onceEffectType === "life";
  return {
    scorePercent: values.length > 0 ? Math.max(...values) : null,
    scorer: values.some((value) => value > 0) && !plock && !heal,
    plock,
    heal,
  };
}

export function buildBandoriCardSearchMetadata(
  characters: Readonly<Record<string, BandoriCharacterMaster | null | undefined>>,
  skills: Readonly<Record<string, BandoriSkillMaster | null | undefined>>,
): {
  characterText: Record<string, string>;
  skills: Record<string, { text: string; byServer: SearchSkill[] }>;
} {
  const characterText: Record<string, string> = {};
  const skillMetadata: Record<string, { text: string; byServer: SearchSkill[] }> = {};
  for (const [id, character] of Object.entries(characters)) {
    const fields = [character?.nickname, character?.characterName, character?.firstName, character?.lastName];
    characterText[id] = [...new Set(BANDORI_SERVERS.flatMap((server) =>
      fields.map((field) => readBandoriRegionalTextAt(field, server)).filter(Boolean),
    ))].join(" ");
  }
  for (const [id, skill] of Object.entries(skills)) {
    if (!skill) continue;
    skillMetadata[id] = {
      text: [...new Set(BANDORI_SERVERS.map((server) => resolveBandoriSkillLabelForServer(skill, 5, server, 5).label))].filter(Boolean).join(" "),
      byServer: BANDORI_SERVERS.map((server) => readSearchSkill(skill, server)),
    };
  }
  return { characterText, skills: skillMetadata };
}

export function buildBandoriCardSearchData(
  canonicalCard: BandoriCardMaster | null | undefined,
  entityServer: BandoriServer | null,
  metadata: ReturnType<typeof buildBandoriCardSearchMetadata>,
): BandoriCardSearchData {
  if (!canonicalCard) return { filterSearchText: "", searchNames: [], searchSkills: [] };
  const text = new Set<string>();
  const names = new Set<string>();
  const searchSkills: SearchSkill[] = [];
  const addText = (value: string | null) => { if (value) text.add(value); };
  for (const server of entityServer === null ? BANDORI_SERVERS : [entityServer]) {
    const regionalCard = materializeBandoriCardForServer(canonicalCard, server);
    // Shared entities may have translated text before that region becomes available.
    const card = regionalCard ?? (entityServer === null ? canonicalCard : null);
    if (!card) continue;
    const name = readBandoriRegionalTextAt(card.prefix, server);
    if (name) names.add(normalizeBandoriCardSearchText(name));
    addText(name);
    addText(readBandoriRegionalTextAt(card.skillName, server));
    addText(metadata.characterText[String(card.characterId)] ?? null);
    const skill = metadata.skills[String(card.skillId)];
    // These descriptions belong to this entity's skill ID, including for CN/EN collisions.
    if (skill) addText(skill.text);
    if (regionalCard && skill) searchSkills.push(skill.byServer[server]);
  }
  return { filterSearchText: normalizeBandoriCardSearchText([...text].join(" ")), searchNames: [...names], searchSkills };
}

const keywordConditions = new Map<string, SearchCondition[]>();
function addKeywords(aliases: readonly string[], condition: SearchCondition): void {
  for (const alias of aliases) {
    const key = normalizeBandoriCardSearchText(alias);
    const existing = keywordConditions.get(key) ?? [];
    existing.push(condition);
    keywordConditions.set(key, existing);
  }
}

for (const [id, aliases] of Object.entries(BANDORI_CARD_SEARCH_BAND_ALIASES)) {
  const bandId = Number(id);
  addKeywords(aliases, (entry) => entry.bandId === bandId);
}
for (const [id, aliases] of Object.entries(BANDORI_CARD_SEARCH_CHARACTER_ALIASES)) {
  const characterId = Number(id);
  addKeywords(aliases, (entry) => entry.characterId === characterId);
}
for (const [attribute, aliases] of Object.entries({
  powerful: ["powerful", "power", "红", "紅", "パワフル"],
  cool: ["cool", "蓝", "藍", "クール"],
  happy: ["happy", "橙", "橘", "ハッピー"],
  pure: ["pure", "绿", "綠", "ピュア"],
})) addKeywords(aliases, (entry) => entry.attribute === attribute);

for (const server of BANDORI_SERVERS) {
  addKeywords(BANDORI_SEARCH_SERVER_ALIASES[server], (entry) => entry.availableServers.includes(server));
}
for (const [type, aliases] of Object.entries({
  permanent: ["permanent", "perm", "无期限", "常駐", "無期限", "常驻"],
  limited: ["limited", "limit", "lim", "期间限定", "期間限定"],
  dreamfes: ["df", "dream", "dreamfes", "梦限", "梦幻", "夢幻", "夢幻祭典", "ドリ", "ドリフェス"],
  kirafes: ["kf", "kira", "kirafes", "闪限", "闪亮", "閃亮", "閃亮祭典", "キラメキ", "キラメキフェス"],
  birthday: ["birthday", "bday", "生日", "誕生日"],
  event: ["event", "活动", "活動", "イベント", "活动奖励"],
  campaign: ["campaign", "login", "联动", "聯動", "联名合作", "聯名合作", "キャンペーン"],
  initial: ["initial", "init", "free", "初始", "デフォルト"],
  special: ["special", "特殊"],
  others: ["others", "其他"],
})) addKeywords(aliases, (entry) => entry.type === type);

for (const [type, aliases] of [
  ["scorer", ["score", "scorer", "分", "分卡"]],
  ["plock", ["plock", "判", "判卡"]],
  ["heal", ["heal", "healer", "奶", "奶卡"]],
] as const) addKeywords(aliases, (entry) => entry.searchSkills.some((skill) => skill[type]));

function compileToken(token: string): SearchCondition {
  if (/^\d+$/u.test(token)) {
    const value = Number(token);
    if (!Number.isSafeInteger(value) || value <= 0) return () => false;
    return (entry) => entry.cardId === value
      || (value <= 5 && entry.rarity === value)
      || entry.searchSkills.some((skill) => skill.scorePercent === value);
  }
  if (/^#\d+$/u.test(token)) {
    const id = Number(token.slice(1));
    return (entry) => Number.isSafeInteger(id) && id > 0 && entry.cardId === id;
  }
  if (/^\d+(?:\.\d+)?%$/u.test(token)) {
    const percent = Number(token.slice(0, -1));
    return (entry) => Number.isFinite(percent)
      && entry.searchSkills.some((skill) => skill.scorePercent === percent);
  }
  if (/^[1-5]\*$/u.test(token)) {
    const rarity = Number(token[0]);
    return (entry) => entry.rarity === rarity;
  }
  const comparison = /^(?:([<>]=?)(\d+(?:\.\d+)?)([%*]?)|(\d+(?:\.\d+)?)([%*]?)([+-]))$/u.exec(token);
  if (comparison) {
    const rawValue = comparison[2] ?? comparison[4];
    const value = Number(rawValue);
    const unit = comparison[3] ?? comparison[5];
    const operator = comparison[1] ?? comparison[6];
    if (!Number.isFinite(value) || (unit !== "%" && (!/^\d+$/u.test(rawValue) || !Number.isSafeInteger(value) || value <= 0))) {
      return () => false;
    }
    const hasRarityMeaning = Number.isInteger(value) && value >= 1 && value <= 5;
    const compare = (candidate: number) => operator === ">" ? candidate > value
      : operator === "<" ? candidate < value
      : operator === "+" || operator === ">=" ? candidate >= value
      : candidate <= value;
    return (entry) => (unit !== "%" && hasRarityMeaning && entry.rarity !== null && compare(entry.rarity))
      || (unit !== "*" && entry.searchSkills.some((skill) => skill.scorePercent !== null && compare(skill.scorePercent)));
  }
  const conditions = keywordConditions.get(token);
  if (conditions) return (entry) => conditions.some((condition) => condition(entry));
  if (/^[#<>]|^\d.*[%*+-]$/u.test(token)) return () => false;
  return (entry) => entry.filterSearchText.includes(token);
}

export function compileBandoriCardSearch(query: string): SearchCondition {
  const conditions = tokenizeBandoriSearch(query).map(({ value, nameOnly }): SearchCondition => (
    nameOnly
      ? (entry) => value !== "" && entry.searchNames.some((name) => name.includes(value))
      : compileToken(value)
  ));
  return (entry) => conditions.every((condition) => condition(entry));
}
