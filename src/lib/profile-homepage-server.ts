import "server-only";
import { ApiRouteError } from "@/lib/api-contracts";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PROFILES_TABLE, USER_GAME_BINDINGS_TABLE, USER_GAME_PROFILES_TABLE } from "@/lib/supabase-table-names";
import { normalizeStoredDisplayDegree, CURRENT_GAME_BINDING_SERVER } from "@/lib/account-display-degree";
import { normalizeAccountAvatarCardServer, resolveStoredAccountAvatarCardIdentity } from "@/lib/account-avatar-card";
import { readBandoriCardApiDetail } from "@/lib/bandori/cards/api-server";
import { isKnownBandoriCardEntityCollision, materializeBandoriCardForServer } from "@/lib/bandori/cards/regional-extensions";
import { hasTrainedCardArt } from "@/lib/bandori/cards/training";
import { DEFAULT_BINDING_VISIBILITY, defaultHomepagePreferences, parseHomepagePatch, projectProfileBindings,
  type ProfileBinding, type ProfileHomepage, type ProfileHomepagePreferences } from "@/lib/profile-homepage";

export async function readProfileHomepage(publicUid: number, viewerId: string | null): Promise<ProfileHomepage | null> {
  const client = createServerSupabaseClient();
  const { data: profile, error } = await client.from(PROFILES_TABLE)
    .select("id, public_uid, username, created_at, avatar_card_id, avatar_card_server, avatar_card_train_type, display_degree_server, display_degree_id, display_degree_effect_id, ...profile_homepages(preferences)")
    .eq("public_uid", publicUid).maybeSingle();
  if (error) throw new ApiRouteError(500, "PROFILE_READ_FAILED", "Failed to load profile");
  if (!profile) return null;
  const isOwner = profile.id === viewerId;
  const preferences: ProfileHomepagePreferences = { ...defaultHomepagePreferences(), ...profile.preferences };
  let accounts: ProfileBinding[] = [];
  if (isOwner || preferences.publicAccounts) {
    const includeTitles = isOwner || preferences.accounts.some(a => a.public && a.titlesPublic);
    const table = client.from(USER_GAME_BINDINGS_TABLE);
    const accountQuery = includeTitles ? table.select("game_uid, owned_degree_ids, owned_degree_effect_ids") : table.select("game_uid");
    const [bindings, names] = await Promise.all([
      accountQuery.eq("web_user_id", profile.id),
      client.from(USER_GAME_PROFILES_TABLE).select("source_game_uid, profile_name").eq("web_user_id", profile.id)
        .eq("profile_kind", "auto").eq("server", CURRENT_GAME_BINDING_SERVER),
    ]);
    if (bindings.error) throw new ApiRouteError(500, "PROFILE_READ_FAILED", "Failed to load profile");
    const playerNames = new Map((names.error ? [] : names.data ?? [])
      .filter(row => row.profile_name !== `UID ${row.source_game_uid}`)
      .map(row => [row.source_game_uid, row.profile_name]));
    accounts = (bindings.data ?? []).map(row => ({
      server: CURRENT_GAME_BINDING_SERVER, gameUid: row.game_uid, playerName: playerNames.get(row.game_uid) ?? null,
      ownedDegreeIds: "owned_degree_ids" in row ? row.owned_degree_ids ?? [] : [],
      ownedDegreeEffectIds: "owned_degree_effect_ids" in row ? row.owned_degree_effect_ids ?? [] : [],
      ...DEFAULT_BINDING_VISIBILITY,
    }));
  }
  // Remove stale preferences from the owner payload; unbound IDs are never public data.
  preferences.accounts = preferences.accounts.filter(a => accounts.some(b => b.gameUid === a.gameUid));
  for (const account of accounts) {
    if (!preferences.accounts.some(a => a.gameUid === account.gameUid)) {
      preferences.accounts.push({ gameUid: account.gameUid, ...DEFAULT_BINDING_VISIBILITY });
    }
  }
  const identity = resolveStoredAccountAvatarCardIdentity(profile.avatar_card_id ?? 1, profile.avatar_card_server);
  return {
    publicUid: profile.public_uid, username: profile.username, createdAt: profile.created_at,
    avatar: { cardId: identity.cardId, entityServer: identity.entityServer,
      trainType: profile.avatar_card_train_type === "after_training" ? "after_training" : "normal" },
    displayDegree: normalizeStoredDisplayDegree(profile.display_degree_server, profile.display_degree_id, profile.display_degree_effect_id),
    signature: preferences.signature, cover: preferences.cover, isOwner,
    bindings: projectProfileBindings(accounts, preferences, isOwner), preferences: isOwner ? preferences : null,
  };
}

export async function updateProfileHomepage(userId: string, value: unknown): Promise<Partial<ProfileHomepagePreferences>> {
  const patch = parseHomepagePatch(value);
  if (!patch) throw new ApiRouteError(400, "INVALID_HOMEPAGE", "Invalid profile settings");
  const client = createServerSupabaseClient();
  if (patch.accounts) {
    const { data, error } = await client.from(USER_GAME_BINDINGS_TABLE).select("game_uid").eq("web_user_id", userId);
    if (error) throw new ApiRouteError(500, "PROFILE_SAVE_FAILED", "Failed to save profile");
    const owned = new Set((data ?? []).map(row => row.game_uid));
    if (patch.accounts.some(a => !owned.has(a.gameUid)) || patch.accounts.length !== owned.size) {
      throw new ApiRouteError(409, "PROFILE_BINDINGS_CHANGED", "Bound accounts changed");
    }
  }
  if (patch.cover) {
    const { cardId } = patch.cover;
    const entityServer = normalizeAccountAvatarCardServer(cardId, patch.cover.entityServer);
    if (isKnownBandoriCardEntityCollision(cardId) && entityServer === null) {
      throw new ApiRouteError(400, "INVALID_HOMEPAGE", "A regional card identity is required");
    }
    patch.cover.entityServer = entityServer;
    const canonical = await readBandoriCardApiDetail(String(cardId));
    const card = canonical && entityServer !== null ? materializeBandoriCardForServer(canonical, entityServer) : canonical;
    if (!card?.resourceSetName) throw new ApiRouteError(400, "INVALID_HOMEPAGE", "Card is unavailable");
    if (!hasTrainedCardArt(card)) patch.cover.trainType = "normal";
  }
  const { data, error } = await client.rpc("update_profile_homepage", { p_user_id: userId, p_patch: patch });
  if (error) throw new ApiRouteError(500, "PROFILE_SAVE_FAILED", "Failed to save profile");
  // Newly discovered bindings have client defaults until their preferences are first saved.
  return data;
}
