import "server-only";
import { ApiRouteError } from "@/lib/api-contracts";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { readBandoriCardApiDetail } from "@/lib/bandori/cards/api-server";
import { materializeBandoriCardForServer } from "@/lib/bandori/cards/regional-extensions";
import { hasTrainedCardArt } from "@/lib/bandori/cards/training";
import { readBandoriMusicApiDetail } from "@/lib/bandori-music-api-server";
import { hasBandoriCatalogEvent } from "@/lib/bandori/events/api-server";
import { CARD_PREVIEW_MAX, parseFavoriteKey, type FavoriteGroup } from "./favorites";

type Target = NonNullable<ReturnType<typeof parseFavoriteKey>>;
export async function readFavoriteKeys(userId: string): Promise<string[]> {
  const { data, error } = await createServerSupabaseClient().rpc("read_bandori_favorite_keys", { p_user_id: userId });
  if (error) throw error;
  return data;
}

export async function readFavoriteGroups(publicUid: number | null, viewer: string | null): Promise<FavoriteGroup[]> {
  const { data, error } = await createServerSupabaseClient().rpc("read_bandori_favorites", { p_public_uid: publicUid, p_viewer_id: viewer });
  if (error) throw error;
  return data;
}

export async function saveFavoriteLayout(userId: string, input: unknown) {
  const invalid = () => new ApiRouteError(400, "INVALID_LAYOUT", "Invalid favorite layout");
  if (!input || typeof input !== "object") throw invalid();
  const kind = "kind" in input ? input.kind : "cards";
  if (kind !== "cards" && kind !== "songs") throw invalid();
  const previewCount = "previewCount" in input ? input.previewCount : null;
  if (kind === "cards" ? typeof previewCount !== "number" || !Number.isInteger(previewCount)
    || previewCount < 1 || previewCount > CARD_PREVIEW_MAX : previewCount !== null) throw invalid();

  let targets: unknown = "targets" in input ? input.targets : undefined;
  // Earlier playlist clients sent the starting order and two drag indices.
  if (kind === "songs" && targets === undefined && "previous" in input && Array.isArray(input.previous)) {
    const { previous } = input;
    const validIndex = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < previous.length;
    if (!("from" in input) || !("to" in input) || !validIndex(input.from) || !validIndex(input.to)) throw invalid();
    targets = previous.toSpliced(input.from, 1).toSpliced(input.to, 0, previous[input.from]);
  }
  if (!Array.isArray(targets) || !targets.length || targets.some(id => typeof id !== "string" || !parseFavoriteKey(kind + ":" + id))
    || new Set(targets).size !== targets.length) throw invalid();

  const { data, error } = await createServerSupabaseClient().rpc("save_favorite_layout", {
    p_user_id: userId, p_kind: kind, p_targets: targets, p_preview_count: previewCount,
  });
  if (error) throw error;
  if (!data) throw new ApiRouteError(409, "FAVORITES_CHANGED", "Favorite items changed");
  return true;
}

async function targetExists({ kind, id, server }: Target, artChoice: boolean) {
  if (kind === "songs") return Boolean(await readBandoriMusicApiDetail(id));
  if (kind === "events") return hasBandoriCatalogEvent(id);
  const card = await readBandoriCardApiDetail(id);
  const entity = card && server !== null ? materializeBandoriCardForServer(card, server) : card;
  if (entity && artChoice && !hasTrainedCardArt(entity)) throw new ApiRouteError(400, "INVALID_ART", "Card has one illustration");
  return Boolean(entity);
}

export async function writeFavorite(userId: string, entry: Target, method: string, art: string | null) {
  const client = createServerSupabaseClient();
  const table = client.from("bandori_favorites");
  const row = { user_id: userId, kind: entry.kind, target: entry.target };
  if (method === "DELETE") {
    const { error } = entry.kind === "cards"
      ? await client.rpc("remove_favorite_card", { p_user_id: userId, p_target: entry.target })
      : await table.delete().match(row);
    if (error) throw error;
    return;
  }
  const artChoice = method === "PATCH";
  if (artChoice && (entry.kind !== "cards" || art !== "normal" && art !== "after_training")) {
    throw new ApiRouteError(400, "INVALID_ART", "Invalid artwork choice");
  }
  if (!await targetExists(entry, artChoice)) throw new ApiRouteError(404, "TARGET_NOT_FOUND", "Favorite target not found");
  if (artChoice) {
    const { data, error } = await table.update({ normal_art: art === "normal" }).match(row).select("position").maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiRouteError(404, "FAVORITE_NOT_FOUND", "Favorite not found");
    return;
  }
  const { error } = await table.upsert(row, { onConflict: "user_id,kind,target", ignoreDuplicates: true });
  if (error) throw error;
}
