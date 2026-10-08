import { ourNotesHash, ourNotesId, ourNotesInteger, ourNotesRecord, ourNotesSize, ourNotesString, requireOurNotes } from "../master-contract";
import { OURNOTES_TRACKER_MAX_COMPRESSED_BYTES, OURNOTES_TRACKER_MAX_JSON_BYTES } from "./contract";

export const OURNOTES_PARTICIPATION_PREFIX = "ournotes/trackerdata/participation";
export const OURNOTES_PARTICIPATION_FIELDS = ["firstCardRewardCount", "lastCardRewardCount", "allNonEventItemRewardsCount", "allPointRewardsCount", "participantCount"] as const;
export type OurNotesParticipationSlots = [number | null, number | null, number | null, null, number | null];
export type OurNotesParticipationCounts = Record<typeof OURNOTES_PARTICIPATION_FIELDS[number], OurNotesParticipationSlots>;
export type OurNotesParticipation = Record<string, OurNotesParticipationCounts>;
export type OurNotesParticipationPack = { kind: "participation"; events: OurNotesParticipation };
export type OurNotesParticipationDescriptor = {
  kind: "participation"; key: string; semanticSha256: string; compressedSha256: string;
  compressedSize: number; jsonSize: number; recordCount: number;
};
export type OurNotesParticipationManifest = {
  generation: number; publishedAt: string; descriptor: OurNotesParticipationDescriptor;
};
function record(value: unknown, fields: readonly string[]) {
  const row = ourNotesRecord(value);
  requireOurNotes(Object.keys(row).length === fields.length && fields.every((key) => Object.hasOwn(row, key)));
  return row;
}
export function parseOurNotesParticipationManifest(value: unknown): OurNotesParticipationManifest {
  const row = record(value, ["schemaVersion", "kind", "generation", "publishedAt", "pack", "recentPackKeys"]);
  requireOurNotes(row.schemaVersion === 1 && row.kind === "eventParticipation");
  const generation = ourNotesInteger(row.generation, 1);
  const publishedAt = ourNotesString(row.publishedAt);
  requireOurNotes(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(publishedAt) && Number.isFinite(Date.parse(publishedAt)));
  const raw = record(row.pack, ["key", "semanticSha256", "compressedSha256", "compressedSize", "jsonSize", "recordCount"]);
  const compressedSha256 = ourNotesHash(raw.compressedSha256);
  const prefix = `${OURNOTES_PARTICIPATION_PREFIX}/packs/`;
  const key = `${prefix}${compressedSha256}.json.gz`;
  requireOurNotes(raw.key === key);
  const descriptor: OurNotesParticipationDescriptor = {
    kind: "participation", key, compressedSha256, semanticSha256: ourNotesHash(raw.semanticSha256),
    compressedSize: ourNotesSize(raw.compressedSize, OURNOTES_TRACKER_MAX_COMPRESSED_BYTES),
    jsonSize: ourNotesSize(raw.jsonSize, OURNOTES_TRACKER_MAX_JSON_BYTES), recordCount: ourNotesInteger(raw.recordCount, 1),
  };
  requireOurNotes(descriptor.recordCount <= descriptor.jsonSize);
  const recent = row.recentPackKeys;
  requireOurNotes(Array.isArray(recent) && recent.length >= 1 && recent.length <= 8
    && recent[0] === key && new Set(recent).size === recent.length);
  for (const item of recent) requireOurNotes(typeof item === "string" && item.startsWith(prefix)
    && /^[a-f0-9]{64}\.json\.gz$/u.test(item.slice(prefix.length)));
  return { generation, publishedAt, descriptor };
}
export function parseOurNotesParticipationPack(value: unknown, descriptor: OurNotesParticipationDescriptor): OurNotesParticipationPack {
  const row = record(value, ["schemaVersion", "kind", "events"]);
  requireOurNotes(row.schemaVersion === 1 && row.kind === "eventParticipation");
  const entries = Object.entries(ourNotesRecord(row.events));
  requireOurNotes(entries.length === descriptor.recordCount);
  const events = Object.fromEntries(entries.map(([id, value]) => {
    requireOurNotes(ourNotesId(id));
    const input = ourNotesRecord(value);
    // Early three-metric packs retain their counts; the added metrics are unknown.
    const raw = record({
      lastCardRewardCount: [null, null, null, null, null], allNonEventItemRewardsCount: [null, null, null, null, null],
      ...input,
    }, OURNOTES_PARTICIPATION_FIELDS);
    const counts = Object.fromEntries(OURNOTES_PARTICIPATION_FIELDS.map((field) => {
      const slots = raw[field];
      requireOurNotes(Array.isArray(slots) && slots.length === 5 && slots[3] === null);
      return [field, slots.map((count) => {
        if (count === null) return null;
        const n = ourNotesInteger(count);
        requireOurNotes(n <= 2_147_483_647);
        return n;
      })];
    })) as OurNotesParticipationCounts;
    for (const slot of [0, 1, 2, 4]) {
      const [card, lastCard, nonEventItem, all, total] = OURNOTES_PARTICIPATION_FIELDS.map((field) => counts[field][slot]);
      const ordered = [total, card, lastCard, nonEventItem, all].filter((count): count is number => count !== null);
      requireOurNotes(ordered.every((count, i) => i === 0 || ordered[i - 1] >= count));
    }
    return [id, counts];
  }));
  return { kind: "participation", events };
}
