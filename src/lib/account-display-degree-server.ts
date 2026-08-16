import "server-only";

import { ApiRouteError } from "@/lib/api-contracts";
import {
  CURRENT_GAME_BINDING_SERVER,
  DEFAULT_DISPLAY_DEGREE_ID,
  DEFAULT_DISPLAY_DEGREE_SERVER,
  normalizeStoredDisplayDegree,
  sortDisplayDegreeBindings,
  type AccountDisplayDegreeOptions,
  type AccountDisplayDegreeSelection,
} from "@/lib/account-display-degree";
import { readBandoriDegreesApiDataset } from "@/lib/bandori-degrees-api-server";
import { hasBandoriDegreeMasterRegion } from "@/lib/bandori-degree-assets";
import { getBandoriServerCode } from "@/lib/bandori-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PROFILES_TABLE, USER_GAME_BINDINGS_TABLE } from "@/lib/supabase-table-names";

type ProfileDegreeRow = {
  display_degree_server: number | null;
  display_degree_id: number | null;
  display_degree_effect_id: number | null;
};

type BindingDegreeRow = {
  game_uid: string;
  owned_degree_ids: number[] | null;
  owned_degree_effect_ids: number[] | null;
};

export async function readAccountDisplayDegreeOptions(
  userId: string,
): Promise<AccountDisplayDegreeOptions> {
  const serviceClient = createServerSupabaseClient();
  const [profileResult, bindingsResult] = await Promise.all([
    serviceClient
      .from(PROFILES_TABLE)
      .select("display_degree_server, display_degree_id, display_degree_effect_id")
      .eq("id", userId)
      .single<ProfileDegreeRow>(),
    serviceClient
      .from(USER_GAME_BINDINGS_TABLE)
      .select("game_uid, owned_degree_ids, owned_degree_effect_ids")
      .eq("web_user_id", userId),
  ]);

  if (profileResult.error) {
    throw new ApiRouteError(500, "DISPLAY_DEGREE_READ_FAILED", "读取展示称号失败", profileResult.error.message);
  }
  if (bindingsResult.error) {
    throw new ApiRouteError(500, "DISPLAY_DEGREE_BINDINGS_READ_FAILED", "读取称号所属账号失败", bindingsResult.error.message);
  }

  return {
    selected: normalizeStoredDisplayDegree(
      profileResult.data.display_degree_server,
      profileResult.data.display_degree_id,
      profileResult.data.display_degree_effect_id,
    ),
    accounts: sortDisplayDegreeBindings(
      ((bindingsResult.data ?? []) as BindingDegreeRow[]).map((binding) => ({
        server: CURRENT_GAME_BINDING_SERVER,
        gameUid: binding.game_uid,
        ownedDegreeIds: [...new Set(binding.owned_degree_ids ?? [])]
          .filter((degreeId) => Number.isSafeInteger(degreeId) && degreeId > 0)
          .sort((left, right) => left - right),
        ownedDegreeEffectIds: [...new Set(binding.owned_degree_effect_ids ?? [])]
          .filter((effectId) => Number.isSafeInteger(effectId) && effectId > 0)
          .sort((left, right) => left - right),
      })),
    ),
  };
}

async function assertDegreeExists(selection: AccountDisplayDegreeSelection): Promise<void> {
  if (
    selection.server === DEFAULT_DISPLAY_DEGREE_SERVER
    && selection.degreeId === DEFAULT_DISPLAY_DEGREE_ID
  ) {
    return;
  }

  const master = await readBandoriDegreesApiDataset();
  const entry = master[String(selection.degreeId)];
  if (!entry || !hasBandoriDegreeMasterRegion(entry, getBandoriServerCode(selection.server))) {
    throw new ApiRouteError(400, "DISPLAY_DEGREE_NOT_FOUND", "所选称号不存在");
  }
  const masterEffectId = entry.serverExtensions?.[selection.server]?.degreeEffect
    ?.biliDegreeEffectId ?? null;
  if (selection.degreeEffectId !== null && masterEffectId !== selection.degreeEffectId) {
    throw new ApiRouteError(400, "DISPLAY_DEGREE_EFFECT_NOT_FOUND", "所选称号动态效果不存在");
  }
}

export async function updateAccountDisplayDegree(
  userId: string,
  selection: AccountDisplayDegreeSelection,
): Promise<AccountDisplayDegreeSelection> {
  await assertDegreeExists(selection);

  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient.rpc("set_profile_display_degree", {
    p_web_user_id: userId,
    p_server: selection.server,
    p_degree_id: selection.degreeId,
    p_degree_effect_id: selection.degreeEffectId,
  });

  if (error) {
    if (error.message.includes("display degree is not owned")) {
      throw new ApiRouteError(409, "DISPLAY_DEGREE_NOT_OWNED", "该称号已不属于当前绑定账号");
    }
    throw new ApiRouteError(500, "DISPLAY_DEGREE_UPDATE_FAILED", "保存展示称号失败", error.message);
  }

  if (
    typeof data !== "object"
    || data === null
    || (data as Record<string, unknown>).displayDegreeServer !== selection.server
    || (data as Record<string, unknown>).displayDegreeId !== selection.degreeId
    || (data as Record<string, unknown>).displayDegreeEffectId !== selection.degreeEffectId
  ) {
    throw new ApiRouteError(500, "DISPLAY_DEGREE_INVALID_RESPONSE", "保存展示称号返回了无效结果");
  }
  return selection;
}
