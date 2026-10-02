import type { OurNotesCardKind } from "./api-contract";

export const OURNOTES_CDN = "https://cdn.hhwx.org/";
export const OURNOTES_CARDS_INDEX_URL = OURNOTES_CDN + "ournotes/cards/index.json";
export type OurNotesImageAsset = { key: string; sha256: string; size: number; width: number; height: number };
export type OurNotesCardsAssetIndex = {
  schema: "ournotes-card-assets-index-v1";
  resources: Record<OurNotesCardKind, Record<string, Partial<Record<"full" | "thumbnail", OurNotesImageAsset>>>>;
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid OurNotes image index");
  return value as Record<string, unknown>;
}
export function parseOurNotesCardsAssetIndex(value: unknown): OurNotesCardsAssetIndex {
  const root = record(value);
  if (root.schema !== "ournotes-card-assets-index-v1") throw new Error("Invalid OurNotes image index schema");
  const resources = record(root.resources);
  const result: OurNotesCardsAssetIndex = { schema: "ournotes-card-assets-index-v1", resources: { member: {}, support: {} } };
  for (const kind of ["member", "support"] as const) {
    const entries = Object.entries(record(resources[kind]));
    if (entries.length > 10_000) throw new Error("OurNotes image index is too large");
    for (const [id, item] of entries) {
      if (!/^[1-9]\d*$/u.test(id) || !Number.isSafeInteger(Number(id))) throw new Error("Invalid OurNotes asset ID");
      const images = record(item);
      const parsed: Partial<Record<"full" | "thumbnail", OurNotesImageAsset>> = {};
      for (const variant of ["full", "thumbnail"] as const) {
        if (images[variant] === undefined) continue;
        const image = record(images[variant]);
        if (typeof image.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(image.sha256)
          || image.key !== "ournotes/cards/" + kind + "/" + id + "/" + variant + "/" + image.sha256 + ".png"
          || ![image.width, image.height, image.size].every((n) => typeof n === "number" && Number.isSafeInteger(n) && n > 0)) throw new Error("Invalid OurNotes image descriptor");
        parsed[variant] = image as OurNotesImageAsset;
      }
      result.resources[kind][id] = parsed;
    }
  }
  return result;
}
export function ourNotesImageUrl(index: OurNotesCardsAssetIndex | null, kind: OurNotesCardKind, assetId: number, variant: "full" | "thumbnail"): string | null {
  const image = index?.resources[kind][assetId]?.[variant];
  return image ? OURNOTES_CDN + image.key : null;
}
export function ourNotesSpriteUrl(name: string): string {
  return OURNOTES_CDN + "ournotes/resources/atlases/fix-ui-sprite-atlas/" + name + ".png";
}
export function ourNotesAttributeIcon(attribute: number): string | null {
  return attribute >= 1 && attribute <= 5 ? ourNotesSpriteUrl(attribute === 2 ? "sp_icon_member_card_type_2" : "sp_icon_live_music_type_" + attribute) : null;
}
export function ourNotesCharacterIcon(id: number): string {
  return OURNOTES_CDN + "ournotes/resources/images/character-icon/" + id + "/character_face_icon.png";
}
export function ourNotesBandIcon(id: number): string {
  return OURNOTES_CDN + "ournotes/resources/images/band-icon/" + id + "/band_small_Icon.png";
}
