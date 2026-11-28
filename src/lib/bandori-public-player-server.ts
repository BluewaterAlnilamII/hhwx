import "server-only";

import type { BandoriServerCode } from "@/lib/bandori-server";
import { publicPlayerObservation } from "@/lib/bandori/player-profile";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const PUBLIC_PLAYER_RESPONSE_BYTES = 1024 * 1024;

export async function recordPublicPlayerProfile(server: BandoriServerCode, uid: string, profile: Record<string, unknown>) {
  try {
    const { error } = await createServerSupabaseClient().rpc("merge_bandori_public_player", {
      p_server: server, p_game_uid: uid, p_observation: publicPlayerObservation(profile),
    }).abortSignal(AbortSignal.timeout(1500));
    if (error) throw error;
  } catch {
    console.warn("Bandori public player observation could not be saved", { server });
  }
}
