export const OURNOTES_SOURCE_SERVERS = ["jp", "en", "tw", "kr"] as const;
export const OURNOTES_SLOTS = ["jp", "en", "tw", "cn_intl", "kr"] as const;
export const OURNOTES_SLOT_SOURCES = [0, 1, 2, 2, 3] as const;
export const OURNOTES_LOCALES = ["ja", "en", "zh-TW", "zh-CN", "ko"] as const;
export type OurNotesSourceServer = typeof OURNOTES_SOURCE_SERVERS[number];
export type OurNotesServer = 0 | 1 | 2 | 3 | 4;
export type OurNotesText = [string, string, string, string, string];
export type OurNotesLocaleMap = Record<typeof OURNOTES_LOCALES[number], string>;
export type OurNotesDataset = "member_cards" | "support_cards" | "characters" | "bands";
export type OurNotesCatalogName = "characters" | "bands";
export const OURNOTES_MAX_JSON_BYTES = 16 * 1024 * 1024;
export const OURNOTES_MAX_RECORDS = 10_000;

export class OurNotesDataError extends Error {}
export function requireOurNotes(condition: unknown): asserts condition {
  if (!condition) throw new OurNotesDataError("Invalid OurNotes master data");
}
export function ourNotesRecord(value: unknown): Record<string, unknown> {
  requireOurNotes(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
export function ourNotesInteger(value: unknown, minimum = 0): number {
  requireOurNotes(typeof value === "number" && Number.isSafeInteger(value) && value >= minimum);
  return value;
}
export function ourNotesString(value: unknown): string {
  requireOurNotes(typeof value === "string" && value.length <= 65_536);
  return value;
}
export function ourNotesId(value: string): boolean {
  return /^[1-9]\d*$/u.test(value) && Number.isSafeInteger(Number(value));
}
export function ourNotesLocales(value: unknown): OurNotesLocaleMap {
  const row = ourNotesRecord(value);
  return Object.fromEntries(OURNOTES_LOCALES.map((locale) => [locale, ourNotesString(row[locale])])) as OurNotesLocaleMap;
}
export function ourNotesText(values: Array<OurNotesLocaleMap | undefined>): OurNotesText {
  return OURNOTES_SLOT_SOURCES.map((source, slot) => values[source]?.[OURNOTES_LOCALES[slot]] ?? "") as OurNotesText;
}

type ObjectDescriptor = { key: string; sha256: string; size: number };
export type OurNotesPackDescriptor = {
  key: string; semanticSha256: string; compressedSha256: string;
  compressedSize: number; jsonSize: number; recordCount: number;
};
export type OurNotesPointer = {
  artifactGeneration: string;
  artifact: ObjectDescriptor;
  datasets: Record<"member_cards" | "support_cards", OurNotesPackDescriptor>;
};
export function ourNotesPointerKey(server: OurNotesSourceServer): string {
  return `ournotes/master/cards-v1/${server}/api/active.json`;
}
function hash(value: unknown): string {
  requireOurNotes(typeof value === "string" && /^[a-f0-9]{64}$/u.test(value));
  return value;
}
function size(value: unknown, maximum = OURNOTES_MAX_JSON_BYTES): number {
  const result = ourNotesInteger(value, 1);
  requireOurNotes(result <= maximum);
  return result;
}
export function parseOurNotesPointer(value: unknown, server: OurNotesSourceServer): OurNotesPointer {
  const row = ourNotesRecord(value);
  requireOurNotes(row.schema === "ournotes-cards-api-pointer-v1" && row.server === server);
  ourNotesInteger(row.generation, 1);
  ourNotesString(row.updatedAt);
  const artifactGeneration = hash(row.artifactGeneration);
  const artifact = ourNotesRecord(row.artifact);
  const artifactKey = `ournotes/master/${server}/${artifactGeneration}/manifest.json`;
  requireOurNotes(artifact.key === artifactKey);
  const rawDatasets = ourNotesRecord(row.datasets);
  requireOurNotes(Object.keys(rawDatasets).sort().join() === "member_cards,support_cards");
  const datasets = {} as OurNotesPointer["datasets"];
  for (const kind of ["member_cards", "support_cards"] as const) {
    const pack = ourNotesRecord(rawDatasets[kind]);
    const compressedSha256 = hash(pack.compressedSha256);
    const key = `ournotes/master/cards-v1/${server}/api/packs/${kind}/${compressedSha256}.json.gz`;
    requireOurNotes(pack.key === key);
    datasets[kind] = { key, compressedSha256, semanticSha256: hash(pack.semanticSha256), compressedSize: size(pack.compressedSize), jsonSize: size(pack.jsonSize), recordCount: size(pack.recordCount, OURNOTES_MAX_RECORDS) };
  }
  return { artifactGeneration, artifact: { key: artifactKey, sha256: hash(artifact.sha256), size: size(artifact.size, 1024 * 1024) }, datasets };
}

const TABLES = [
  "MasterMemberCard", "MasterSupportCard", "MasterCharacter", "MasterText",
  "MasterMemberCardLevel", "MasterMemberCardAwake", "MasterMemberCardAwakeResource", "MasterMemberCardRank",
  "MasterSupportCardLevel", "MasterSupportCardRank", "MasterLeaderSkill", "MasterLiveSkill",
  "MasterGekisouSkill", "MasterSupportSkill", "MasterGekisouSupportSkill", "MasterBand",
];
const EXPECTED_FILES = new Set([
  "source/MasterManifest.json",
  ...TABLES.flatMap((table) => [`source/${table}.bin`, `raw/${table}.json`]),
  ...["member_cards", "support_cards", "characters", "bands"].flatMap((dataset) => [`normalized/${dataset}.json`, `normalized/${dataset}.json.gz`]),
]);
export function parseOurNotesManifest(value: unknown, server: OurNotesSourceServer, pointer: OurNotesPointer): Map<string, ObjectDescriptor> {
  const row = ourNotesRecord(value);
  requireOurNotes(row.schema === "ournotes-master-artifact-v1" && row.revision === "ournotes-cards-v3"
    && row.server === server && row.generation === pointer.artifactGeneration
    && JSON.stringify(row.selectedTables) === JSON.stringify(TABLES)
    && Array.isArray(row.files) && row.files.length === EXPECTED_FILES.size);
  const files = new Map<string, ObjectDescriptor>();
  for (const item of row.files) {
    const file = ourNotesRecord(item);
    const path = ourNotesString(file.path);
    requireOurNotes(EXPECTED_FILES.has(path) && !files.has(path));
    files.set(path, { key: `ournotes/master/${server}/${pointer.artifactGeneration}/${path}`, sha256: hash(file.sha256), size: size(file.size, 64 * 1024 * 1024) });
  }
  return files;
}

export type OurNotesCharacter = { characterName: OurNotesText; shortName: OurNotesText; bandId: number; displayOrder: number; colorCode: string };
export type OurNotesBand = { bandName: OurNotesText; colorCode: string };
type LocalCharacter = Omit<OurNotesCharacter, "characterName" | "shortName"> & { characterName: OurNotesLocaleMap; shortName: OurNotesLocaleMap };
type LocalBand = Omit<OurNotesBand, "bandName"> & { bandName: OurNotesLocaleMap };

export function mergeOurNotesCatalog(inputs: unknown[], dataset: OurNotesCatalogName): Record<string, OurNotesCharacter | OurNotesBand> {
  requireOurNotes(inputs.length === 4);
  const sources = inputs.map((input) => {
    const entries = Object.entries(ourNotesRecord(input));
    requireOurNotes(entries.length > 0 && entries.length <= OURNOTES_MAX_RECORDS);
    return Object.fromEntries(entries.map(([id, value]): [string, LocalCharacter | LocalBand] => {
      requireOurNotes(ourNotesId(id));
      const row = ourNotesRecord(value);
      const colorCode = ourNotesString(row.colorCode);
      return [id, dataset === "bands" ? { colorCode, bandName: ourNotesLocales(row.bandName) }
        : { colorCode, characterName: ourNotesLocales(row.characterName), shortName: ourNotesLocales(row.shortName), bandId: ourNotesInteger(row.bandId, 1), displayOrder: ourNotesInteger(row.displayOrder) }];
    }));
  });
  const result: Record<string, OurNotesCharacter | OurNotesBand> = {};
  for (const id of new Set(sources.flatMap((rows) => Object.keys(rows)))) {
    const rows = sources.map((source) => source[id]);
    const canonical = rows.find(Boolean)!;
    requireOurNotes(rows.every((row) => !row || row.colorCode === canonical.colorCode));
    if ("bandName" in canonical) {
      result[id] = { colorCode: canonical.colorCode, bandName: ourNotesText(rows.map((row) => (row as LocalBand | undefined)?.bandName)) };
    } else {
      requireOurNotes(rows.every((row) => !row || ("bandId" in row && row.bandId === canonical.bandId && row.displayOrder === canonical.displayOrder)));
      result[id] = { bandId: canonical.bandId, displayOrder: canonical.displayOrder, colorCode: canonical.colorCode,
        characterName: ourNotesText(rows.map((row) => (row as LocalCharacter | undefined)?.characterName)),
        shortName: ourNotesText(rows.map((row) => (row as LocalCharacter | undefined)?.shortName)) };
    }
  }
  return result;
}
