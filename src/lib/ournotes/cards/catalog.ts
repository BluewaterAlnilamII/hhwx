import { compareSearchValue, normalizeSearchText, SEARCH_SERVER_ALIASES, tokenizeSearch } from "@/lib/catalog-search";
import { BANDORI_SEARCH_BAND_ALIASES } from "@/lib/bandori/search";
import { BANDORI_CARD_SEARCH_CHARACTER_ALIASES } from "@/lib/bandori/cards/search-aliases";
import { OURNOTES_SLOTS, type OurNotesServer } from "../master-contract";
import { OURNOTES_SERVERS, OURNOTES_SERVER_CODES, getOurNotesServerFromCode, pickAvailableOurNotesServer } from "../server";
import type { OurNotesCharacter, OurNotesBand } from "../catalogs-contract";
import type { OurNotesSkill, OurNotesSkills, OurNotesSkillKind } from "../skills-contract";
import type { OurNotesCardKind, OurNotesCardSummary } from "./api-contract";

export type OurNotesCharacters = Record<string, OurNotesCharacter>;
export type OurNotesBands = Record<string, OurNotesBand>;
export { OURNOTES_SERVERS } from "../server";
export const OURNOTES_ATTRIBUTES = [1, 2, 3, 4, 5] as const;
export const OURNOTES_SORTS = ["id"] as const;
export type OurNotesSort = typeof OURNOTES_SORTS[number];
export const OURNOTES_RARITY_NAMES: Record<number, string> = { 2: "R", 3: "SR", 4: "SSR", 10: "EX", 20: "BD" };
const RARITY_ORDER = [2, 3, 10, 20, 4];
export function ourNotesCardRarities(kind: OurNotesCardKind): number[] {
  return RARITY_ORDER.filter((rarity) => kind !== "member" || rarity !== 10);
}

export function ourNotesCardCharacters(card: OurNotesCardSummary): number[] {
  return "characterId" in card ? [card.characterId] : card.characterIds;
}
export function ourNotesCardName(card: OurNotesCardSummary, characters: OurNotesCharacters, server: OurNotesServer): string {
  return card.name === undefined && "characterId" in card
    ? characters[card.characterId]?.characterName[server] ?? ""
    : card.name?.[server] ?? "";
}
export function ourNotesCardTitle(card: OurNotesCardSummary, server: OurNotesServer): string {
  return ("subtitle" in card ? card.subtitle : card.description)[server];
}
export function ourNotesCardStats(card: OurNotesCardSummary, locale: string) {
  const member = "characterId" in card;
  const values: [keyof OurNotesCardSummary["powerMax"] | "total", number][] = [
    ["performance", card.powerMax.performance], ["technic", card.powerMax.technic], ["visual", card.powerMax.visual],
  ];
  if (member) values.push(["total", card.powerMax.performance + card.powerMax.technic + card.powerMax.visual]);
  // Snapshot power uses basis points: 3500 = 35.00%, not 3500 additive power.
  const format = new Intl.NumberFormat(locale, member ? undefined : { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return values.map(([key, value]) => ({ key, value: format.format(member ? value : value / 10000) }));
}
export type OurNotesSkillReference = { kind: OurNotesSkillKind; id: number; slot: string };
export function ourNotesCardSkills(card: OurNotesCardSummary): OurNotesSkillReference[] {
  const refs: OurNotesSkillReference[] = "leaderSkillId" in card
    ? [{ kind: "leader", id: card.leaderSkillId, slot: "leader" }, { kind: "live", id: card.liveSkillId, slot: "live" }, { kind: "gekisou", id: card.gekisouSkillId, slot: "gekisou" }]
    : [{ kind: "support", id: card.supportSkillId01, slot: "support1" }, { kind: "support", id: card.supportSkillId02, slot: "support2" }, { kind: "gekisouSupport", id: card.gekisouSupportSkillId01, slot: "gekisouSupport1" }, { kind: "gekisouSupport", id: card.gekisouSupportSkillId02, slot: "gekisouSupport2" }];
  return refs.filter((ref) => ref.id !== 0);
}
export function ourNotesSkillDescription(skill: OurNotesSkill | undefined, server: OurNotesServer, level = 5): string {
  if (!skill) return "";
  if (!Number.isInteger(level) || level < 1 || level > 5) throw new Error("Invalid OurNotes skill level");
  return skill.description[server].replace(/\{(\d+)\}/gu, (_, index: string) => {
    const parameter = skill.descriptionParameters[Number(index)]?.[level - 1];
    if (parameter === undefined) throw new Error("Invalid OurNotes skill template");
    return parameter;
  });
}

export type OurNotesCardEntry = {
  id: string; kind: OurNotesCardKind; card: OurNotesCardSummary;
  title: string; name: string; characterIds: number[]; bandIds: number[]; servers: OurNotesServer[];
  displayServer: OurNotesServer;
  searchText: string; searchNames: string[];
  summaries: string[];
};
export function buildOurNotesCardCatalog(
  cards: Record<string, OurNotesCardSummary>, kind: OurNotesCardKind,
  characters: OurNotesCharacters, bands: OurNotesBands, skills: OurNotesSkills, preferredServer: OurNotesServer,
): OurNotesCardEntry[] {
  return Object.entries(cards).flatMap(([id, card]) => {
    const servers = OURNOTES_SERVERS.filter((slot) => card.serverExtensions?.[slot] != null);
    const server = pickAvailableOurNotesServer(servers, preferredServer);
    if (server === null) return [];
    const characterIds = ourNotesCardCharacters(card);
    const bandIds = [...new Set(characterIds.flatMap((cid) => characters[cid] ? [characters[cid].bandId] : []))];
    const references = ourNotesCardSkills(card);
    const names = OURNOTES_SERVERS.map((slot) => ourNotesCardTitle(card, slot));
    const searchText = [
      ...names, ...(card.name ?? []),
      ...characterIds.flatMap((cid) => [...(characters[cid]?.characterName ?? []), ...(characters[cid]?.shortName ?? [])]),
      ...bandIds.flatMap((bid) => bands[bid]?.bandName ?? []),
    ].join(" ");
    return {
      id, kind, card, characterIds, bandIds,
      title: ourNotesCardTitle(card, server), name: ourNotesCardName(card, characters, server),
      servers, displayServer: server,
      searchText: normalizeSearchText(searchText), searchNames: names.filter(Boolean).map(normalizeSearchText),
      summaries: references.map((ref) => ourNotesSkillDescription(skills[ref.kind]?.[ref.id], server)),
    };
  });
}

export type OurNotesCardFilter = {
  query: string; servers: number[]; bandIds: number[]; attributes: number[]; rarities: number[];
  characterIds: number[]; sortBy: OurNotesSort; direction: "asc" | "desc";
};
export type OurNotesFilterOptions = { bandIds: number[]; characterIds: number[]; rarities: number[] };
const FILTER_KEYS = ["kind", "q", "available", "bands", "attributes", "rarities", "characters", "direction"] as const;
function selection(raw: string | null, available: readonly number[]): number[] {
  return raw === null ? [...available] : [...new Set(raw.split(",").filter((value) => /^\d+$/u.test(value)).map(Number).filter((value) => available.includes(value)))];
}
export function parseOurNotesCardFilter(query: string, options: OurNotesFilterOptions): OurNotesCardFilter {
  const params = new URLSearchParams(query);
  const sort = params.get("sort");
  return {
    query: params.get("q") ?? "",
    servers: params.has("available") ? OURNOTES_SERVERS.filter((slot) => params.get("available")!.split(",").some((code) => getOurNotesServerFromCode(code) === slot)) : [...OURNOTES_SERVERS],
    bandIds: selection(params.get("bands"), options.bandIds), attributes: selection(params.get("attributes"), OURNOTES_ATTRIBUTES),
    rarities: selection(params.get("rarities"), options.rarities), characterIds: selection(params.get("characters"), options.characterIds),
    sortBy: OURNOTES_SORTS.includes(sort as OurNotesSort) ? sort as OurNotesSort : "id",
    direction: params.get("direction") === "asc" ? "asc" : "desc",
  };
}
export function updateOurNotesCardsQuery(query: string, patch: Partial<OurNotesCardFilter>, options: OurNotesFilterOptions): string {
  const params = new URLSearchParams(query);
  const lists = { servers: ["available", OURNOTES_SERVERS], bandIds: ["bands", options.bandIds], attributes: ["attributes", OURNOTES_ATTRIBUTES], rarities: ["rarities", options.rarities], characterIds: ["characters", options.characterIds] } as const;
  for (const field of Object.keys(lists) as (keyof typeof lists)[]) {
    const values = patch[field];
    if (!values) continue;
    const [key, defaults] = lists[field];
    if (values.length === defaults.length && defaults.every((value) => values.includes(value))) params.delete(key);
    else params.set(key, (field === "servers" ? values.map((value) => OURNOTES_SLOTS[value]) : values).join(","));
  }
  if (patch.query !== undefined) { if (patch.query.trim()) params.set("q", patch.query.trim()); else params.delete("q"); }
  params.delete("sort");
  if (patch.direction !== undefined) { if (patch.direction === "desc") params.delete("direction"); else params.set("direction", patch.direction); }
  return params.toString();
}
export function switchOurNotesCardsKind(query: string, kind: OurNotesCardKind): string {
  const params = new URLSearchParams(query);
  if (kind === "member") params.delete("kind"); else params.set("kind", kind);
  // Available rarities differ; a hidden EX-only selection must not empty Member.
  params.delete("rarities");
  params.delete("sort");
  return params.toString();
}
export function ourNotesCardsListHref(query: string, kind: OurNotesCardKind = "member"): string {
  const input = new URLSearchParams(query);
  const safe = new URLSearchParams();
  for (const key of FILTER_KEYS) if (input.has(key)) safe.set(key, input.get(key)!);
  if (kind === "support") safe.set("kind", kind); else safe.delete("kind");
  return "/ournotes/cards" + (safe.size ? "?" + safe.toString() : "");
}

const ATTRIBUTE_ALIASES: Record<string, number> = {
  ruby: 1, 绯红: 1, red: 1, 红: 1, 紅: 1,
  azure: 2, 绀碧: 2, blue: 2, 蓝: 2, 藍: 2,
  jade: 3, 翡翠: 3, green: 3, 绿: 3, 綠: 3,
  amber: 4, 琉金: 4, yellow: 4, 黄: 4, 黃: 4,
  violet: 5, 紫苑: 5, purple: 5, 紫: 5,
};
const BAND_ALIASES: Readonly<Record<number, readonly string[]>> = {
  1: BANDORI_SEARCH_BAND_ALIASES[45],
  2: ["avemujica", "mujica", "ave"],
  3: ["mewtype", "梦限大", "夢限大", "ゆめみた", "yumemita"],
  5: ["一家", "ikka", "dumb rock", "dumbrock"],
};
// Explicitly map the shared MyGO identities between the two games' character IDs.
const CHARACTER_ALIASES: Readonly<Record<number, readonly string[]>> = {
  1: BANDORI_CARD_SEARCH_CHARACTER_ALIASES[36],
  2: BANDORI_CARD_SEARCH_CHARACTER_ALIASES[37],
  3: BANDORI_CARD_SEARCH_CHARACTER_ALIASES[38],
  4: BANDORI_CARD_SEARCH_CHARACTER_ALIASES[39],
  5: BANDORI_CARD_SEARCH_CHARACTER_ALIASES[40],
  9: ["yutenji", "yuutenji", "nyamu yutenji", "yutenji nyamu", "nyamuyutenji", "yutenjinyamu",
    "nyamu yuutenji", "yuutenji nyamu", "nyamuyuutenji", "yuutenjinyamu"],
};
export function filterOurNotesCards(entries: OurNotesCardEntry[], filter: OurNotesCardFilter, bands: OurNotesBands, characters: OurNotesCharacters): OurNotesCardEntry[] {
  type Condition = (entry: OurNotesCardEntry) => boolean;
  const keywords = new Map<string, Condition[]>();
  function addKeywords(names: readonly string[], condition: Condition) {
    for (const name of names) {
      const key = normalizeSearchText(name);
      if (key) keywords.set(key, [...(keywords.get(key) ?? []), condition]);
    }
  }
  for (const [id, band] of Object.entries(bands)) {
    addKeywords([...band.bandName, ...(BAND_ALIASES[Number(id)] ?? [])], (entry) => entry.bandIds.includes(Number(id)));
  }
  for (const [id, character] of Object.entries(characters)) {
    const names = character.characterName.flatMap((name, slot) => {
      const shortName = normalizeSearchText(character.shortName[slot]);
      // Stage and personal names are separate full-name keywords; derive surnames from the matching localized short name.
      return normalizeSearchText(name).split("/").flatMap((part) => {
        const fullName = part.trim();
        const surname = !shortName ? "" : fullName.endsWith(shortName) ? fullName.slice(0, -shortName.length).trim()
          : fullName.startsWith(shortName + " ") ? fullName.slice(shortName.length).trim() : "";
        // Only known name components gain spacing/order variants; punctuation stays significant.
        return [fullName, fullName.replace(/ /gu, ""), surname, ...(surname ? [
          surname + shortName, shortName + surname, surname + " " + shortName, shortName + " " + surname,
        ] : [])];
      });
    });
    addKeywords([...character.characterName, ...character.shortName, ...names, ...(CHARACTER_ALIASES[Number(id)] ?? [])], (entry) => entry.characterIds.includes(Number(id)));
  }
  for (const slot of OURNOTES_SERVERS) {
    addKeywords([...SEARCH_SERVER_ALIASES[OURNOTES_SERVER_CODES[slot]], OURNOTES_SLOTS[slot]], (entry) => entry.servers.includes(slot));
  }
  for (const [name, attribute] of Object.entries(ATTRIBUTE_ALIASES)) addKeywords([name], (entry) => entry.card.cardType === attribute);
  for (const [rarity, name] of Object.entries(OURNOTES_RARITY_NAMES)) addKeywords([name], (entry) => entry.card.rarity === Number(rarity));
  const phrases = [...keywords.keys()].filter((name) => name.includes(" ")).map((name) => name.split(" ")).sort((a, b) => b.length - a.length);
  const conditions = tokenizeSearch(filter.query, phrases).map(({ value: token, nameOnly }): Condition => {
    if (!token) return () => false;
    if (nameOnly) return (entry) => entry.searchNames.some((name) => name.includes(token));
    if (/^#?\d+$/u.test(token)) {
      const id = Number(token.replace(/^#/u, ""));
      return (entry) => Number.isSafeInteger(id) && id > 0 && Number(entry.id) === id;
    }
    const comparison = /^(?:([<>]=?)(r|sr|ex|bd|ssr)|(r|sr|ex|bd|ssr)([+-]))$/u.exec(token);
    if (comparison) {
      const rarity = (comparison[2] ?? comparison[3]).toUpperCase();
      const rank = RARITY_ORDER.findIndex((id) => OURNOTES_RARITY_NAMES[id] === rarity);
      return (entry) => {
        const candidate = RARITY_ORDER.indexOf(entry.card.rarity);
        return candidate >= 0 && compareSearchValue(candidate, rank, comparison[1] ?? comparison[4]);
      };
    }
    const meanings = keywords.get(token);
    if (meanings) return (entry) => meanings.some((condition) => condition(entry));
    if (/^[#<>]|^\d.*[%*+-]$|^\d+(?:\.\d+)?(?:s|秒)$/u.test(token)) return () => false;
    return (entry) => entry.searchText.includes(token);
  });
  const allBands = Object.keys(bands).every((id) => filter.bandIds.includes(Number(id)));
  const allCharacters = Object.keys(characters).every((id) => filter.characterIds.includes(Number(id)));
  return entries.filter((entry) =>
    entry.servers.some((server) => filter.servers.includes(server))
    && (entry.bandIds.length ? entry.bandIds.some((id) => filter.bandIds.includes(id)) : allBands)
    && entry.characterIds.some((id) => filter.characterIds.includes(id) || (!characters[id] && allCharacters))
    && filter.attributes.includes(entry.card.cardType) && filter.rarities.includes(entry.card.rarity)
    && conditions.every((condition) => condition(entry)),
  ).sort((a, b) => (Number(a.id) - Number(b.id)) * (filter.direction === "asc" ? 1 : -1));
}
