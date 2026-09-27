import {
  OURNOTES_MAX_RECORDS, OURNOTES_SLOT_SOURCES,
  ourNotesInteger, ourNotesLocales, ourNotesRecord, ourNotesString, ourNotesText, requireOurNotes,
  type OurNotesText,
} from "../master-contract";

export type OurNotesCardKind = "member" | "support";
export type OurNotesPresence = [Record<string, never> | null, Record<string, never> | null, Record<string, never> | null, Record<string, never> | null, Record<string, never> | null];
export type OurNotesCardSummary = {
  assetId: number; rarity: number; cardType: number;
  powerMax: { performance: number; technic: number; visual: number };
  startAt: OurNotesText; serverExtensions?: OurNotesPresence;
} & ({
  characterId: number; subtitle: OurNotesText; name?: OurNotesText;
  leaderSkillId: number; liveSkillId: number; gekisouSkillId: number;
} | {
  characterIds: number[]; description: OurNotesText; name: OurNotesText;
  supportSkillId01: number; supportSkillId02: number;
  gekisouSupportSkillId01: number; gekisouSupportSkillId02: number;
});
export type OurNotesCardGrowth = {
  level: Record<string, number>[]; rank: Record<string, number>[];
  awake?: Record<string, number>[]; awakeResource?: Record<string, number>[];
};
export type OurNotesCardDetail = OurNotesCardSummary & { growth: OurNotesCardGrowth };
export function isOurNotesCardKind(value: string): value is OurNotesCardKind {
  return value === "member" || value === "support";
}

const LEVEL_FIELDS = ["level", "exp", "performanceRate", "technicRate", "visualRate"];
const MEMBER_GROWTH = {
  level: LEVEL_FIELDS,
  awake: ["awakeCount", "performanceRate", "technicRate", "visualRate"],
  awakeResource: ["awakeCount", "itemId", "count"],
  rank: ["rank", "requiredRankUpItemCount", "performanceRate", "technicRate", "visualRate", "leaderSkillLevel", "musicTypeBonusRate", "musicTagBonusRate"],
};
const SUPPORT_GROWTH = {
  level: LEVEL_FIELDS,
  rank: ["rank", "limitLevel", "requiredRankUpItemCount", "supportSkill01Level", "supportSkill02Level", "gekisouSupportSkill01Level", "gekisouSupportSkill02Level", "cardTypeLinkBonusRate"],
};

function parseCard(value: unknown, kind: OurNotesCardKind) {
  const row = ourNotesRecord(value);
  const source = ourNotesRecord(row.source);
  const id = ourNotesInteger(row.id, 1);
  const assetId = ourNotesInteger(row.assetId, 1);
  requireOurNotes(id === source._id && assetId === source._assetID);
  const rarity = ourNotesInteger(row.rarity);
  const cardType = ourNotesInteger(row.cardType);
  const startAtRaw = ourNotesString(row.startAtRaw);
  requireOurNotes(rarity === source._rarity && cardType === source._cardType && startAtRaw === source._startAt);
  const rawPower = ourNotesRecord(row.powerMax);
  const powerMax = { performance: ourNotesInteger(rawPower.performance), technic: ourNotesInteger(rawPower.technic), visual: ourNotesInteger(rawPower.visual) };
  requireOurNotes(Object.entries(powerMax).every(([key, number]) => number === source[`_${key}PowerMax`]));
  requireOurNotes(Array.isArray(row.characterIds) && row.characterIds.length > 0 && row.characterIds.length <= OURNOTES_MAX_RECORDS);
  const characterIds = row.characterIds.map((value) => ourNotesInteger(value, 1));
  requireOurNotes(new Set(characterIds).size === characterIds.length);
  requireOurNotes(Array.isArray(row.characters) && row.characters.length === characterIds.length
    && row.characters.every((character, index) => ourNotesRecord(character)._id === characterIds[index]));
  if (kind === "member") requireOurNotes(characterIds.length === 1 && source._characterID === characterIds[0]);
  else requireOurNotes(JSON.stringify(source._characterIDs) === JSON.stringify(characterIds));
  let hasCardName = true;
  if (kind === "member") {
    const nameTextId = ourNotesString(source._nameTextID);
    const characterNameTextId = ourNotesString(ourNotesRecord(row.characters[0])._nameTextID);
    requireOurNotes(nameTextId.length > 0 && characterNameTextId.length > 0);
    hasCardName = nameTextId !== characterNameTextId;
  }

  const rawSkills = ourNotesRecord(row.skills);
  const skillId = (field: string) => {
    const id = ourNotesInteger(source[field]);
    const references = rawSkills[field];
    requireOurNotes(Array.isArray(references) && references.length === (id === 0 ? 0 : 1));
    if (id !== 0) requireOurNotes(ourNotesRecord(references[0])._id === id);
    return id;
  };
  const skills = kind === "member"
    ? { leaderSkillId: skillId("_leaderSkillID"), liveSkillId: skillId("_liveSkillID"), gekisouSkillId: skillId("_gekisouSkillID") }
    : { supportSkillId01: skillId("_supportSkillId01"), supportSkillId02: skillId("_supportSkillId02"), gekisouSupportSkillId01: skillId("_gekisouSupportSkillId01"), gekisouSupportSkillId02: skillId("_gekisouSupportSkillId02") };
  const rawGrowth = ourNotesRecord(row.growth);
  const growth = {} as OurNotesCardGrowth;
  for (const [name, fields] of Object.entries(kind === "member" ? MEMBER_GROWTH : SUPPORT_GROWTH)) {
    const field = `_${kind}Card${name[0].toUpperCase()}${name.slice(1)}Group`;
    const group = ourNotesInteger(source[field]);
    const rows = rawGrowth[field];
    requireOurNotes(Array.isArray(rows) && rows.length <= OURNOTES_MAX_RECORDS && (group === 0 ? rows.length === 0 : rows.length > 0));
    const ids = new Set<number>();
    growth[name as keyof OurNotesCardGrowth] = rows.map((value) => {
      const entry = ourNotesRecord(value);
      const id = ourNotesInteger(entry._id, 1);
      requireOurNotes(entry._group === group && !ids.has(id));
      ids.add(id);
      return Object.fromEntries(fields.map((field) => [field, ourNotesInteger(entry[`_${field}`])]));
    });
  }
  const base = { assetId, rarity, cardType, powerMax, ...skills, growth,
    ...(kind === "member" ? { characterId: characterIds[0] } : { characterIds }) };
  return { id, base, startAtRaw, hasCardName, name: ourNotesLocales(row.name), description: ourNotesLocales(row.description) };
}

export function mergeOurNotesCards(inputs: unknown[], kind: OurNotesCardKind): {
  summaries: Record<string, OurNotesCardSummary>; details: Record<string, OurNotesCardDetail>;
} {
  requireOurNotes(inputs.length === 4);
  const sources = inputs.map((input) => {
    const pack = ourNotesRecord(input);
    requireOurNotes(pack.schema === "ournotes-card-projection-v2" && pack.kind === kind
      && Array.isArray(pack.cards) && pack.cards.length > 0 && pack.cards.length <= OURNOTES_MAX_RECORDS);
    const records = new Map<string, ReturnType<typeof parseCard>>();
    for (const raw of pack.cards) {
      const card = parseCard(raw, kind);
      const id = String(card.id);
      requireOurNotes(!records.has(id));
      records.set(id, card);
    }
    return records;
  });
  const summaries: Record<string, OurNotesCardSummary> = {};
  const details: Record<string, OurNotesCardDetail> = {};
  for (const id of new Set(sources.flatMap((source) => [...source.keys()]))) {
    const rows = sources.map((source) => source.get(id));
    const canonical = rows.find(Boolean)!;
    const identity = JSON.stringify(canonical.base);
    requireOurNotes(rows.every((row) => !row || JSON.stringify(row.base) === identity));
    const { growth, ...base } = canonical.base;
    const name = ourNotesText(rows.map((row) => row?.name));
    const description = ourNotesText(rows.map((row) => row?.description));
    const summary = {
      ...base, ...(rows.some((row) => row?.hasCardName) ? { name } : {}),
      ...(kind === "member" ? { subtitle: description } : { description }),
      startAt: OURNOTES_SLOT_SOURCES.map((source) => rows[source]?.startAtRaw ?? "") as OurNotesText,
      serverExtensions: OURNOTES_SLOT_SOURCES.map((source) => rows[source] ? {} : null) as OurNotesPresence,
    } as OurNotesCardSummary;
    summaries[id] = summary;
    details[id] = { ...summary, growth };
  }
  return { summaries, details };
}
