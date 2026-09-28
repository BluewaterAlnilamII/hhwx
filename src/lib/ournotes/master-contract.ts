export const OURNOTES_SOURCE_SERVERS = ["jp", "en", "tw", "kr"] as const;
export const OURNOTES_SLOTS = ["jp", "en", "tw", "cn_intl", "kr"] as const;
export const OURNOTES_SLOT_SOURCES = [0, 1, 2, 2, 3] as const;
export const OURNOTES_LOCALES = ["ja", "en", "zh-TW", "zh-CN", "ko"] as const;
export type OurNotesSourceServer = typeof OURNOTES_SOURCE_SERVERS[number];
export type OurNotesServer = 0 | 1 | 2 | 3 | 4;
export type OurNotesText = [string, string, string, string, string];
export type OurNotesLocaleMap = Record<typeof OURNOTES_LOCALES[number], string>;
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

export type OurNotesObjectDescriptor = { key: string; sha256: string; size: number };
export function ourNotesHash(value: unknown): string {
  requireOurNotes(typeof value === "string" && /^[a-f0-9]{64}$/u.test(value));
  return value;
}
export function ourNotesSize(value: unknown, maximum = OURNOTES_MAX_JSON_BYTES): number {
  const result = ourNotesInteger(value, 1);
  requireOurNotes(result <= maximum);
  return result;
}
export function ourNotesMasterKey(server: OurNotesSourceServer): string {
  return `ournotes/master/${server}/active/manifest.json`;
}
export function parseOurNotesManifest(value: unknown, server: OurNotesSourceServer): Map<string, OurNotesObjectDescriptor> {
  const row = ourNotesRecord(value);
  requireOurNotes(row.schema === "ournotes-master-artifact-v1" && row.server === server
    && Array.isArray(row.files) && row.files.length > 0 && row.files.length <= 10_000);
  const generation = ourNotesHash(row.generation);
  const files = new Map<string, OurNotesObjectDescriptor>();
  for (const item of row.files) {
    const file = ourNotesRecord(item);
    const path = ourNotesString(file.path);
    requireOurNotes(path.length < 768 && path.split("/").every((part) => /^[A-Za-z0-9_.-]+$/u.test(part) && part !== "." && part !== "..") && !files.has(path));
    files.set(path, { key: `ournotes/master/${server}/${generation}/${path}`, sha256: ourNotesHash(file.sha256), size: ourNotesSize(file.size, 64 * 1024 * 1024) });
  }
  return files;
}
