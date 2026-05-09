import { ApiRouteError } from "@/lib/api-contracts";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PROFILES_TABLE } from "@/lib/supabase-table-names";

export type PublicProfile = {
  publicUid: number;
  username: string;
  createdAt: string | null;
};

export function normalizePublicUid(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) {
    return null;
  }

  const publicUid = Number(value);
  return Number.isSafeInteger(publicUid) ? publicUid : null;
}

export async function readPublicProfile(publicUid: number): Promise<PublicProfile | null> {
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(PROFILES_TABLE)
    .select("public_uid, username, created_at")
    .eq("public_uid", publicUid)
    .maybeSingle();

  if (error) {
    throw new ApiRouteError(500, "PUBLIC_PROFILE_READ_FAILED", "读取公开主页失败", error.message);
  }

  if (!data) {
    return null;
  }

  return {
    publicUid: data.public_uid,
    username: data.username,
    createdAt: data.created_at,
  };
}
