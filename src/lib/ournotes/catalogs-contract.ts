import { OURNOTES_MAX_RECORDS, ourNotesId, ourNotesInteger, ourNotesLocales, ourNotesRecord, ourNotesString, ourNotesText, requireOurNotes, type OurNotesText, type OurNotesLocaleMap } from "./master-contract";

export type OurNotesCatalogName = "characters" | "bands";
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
