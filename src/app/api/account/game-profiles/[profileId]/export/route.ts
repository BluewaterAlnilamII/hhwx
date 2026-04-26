import { NextResponse } from "next/server";
import { jsonRouteError } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { exportBestdoriGameProfile, exportCompleteGameProfile, normalizeProfileId } from "@/lib/user-game-profiles-server";

export async function GET(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { profileId: rawProfileId } = await context.params;
    const profileId = normalizeProfileId(rawProfileId);
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "full" ? "full" : "bestdori";
    const profile = format === "full"
      ? await exportCompleteGameProfile(user.id, profileId)
      : await exportBestdoriGameProfile(user.id, profileId);

    // This route is an explicit profile export boundary. Bestdori format returns
    // the third-party-compatible JSON, and full format returns HHWX-owned details.
    return NextResponse.json(profile);
  } catch (error) {
    console.error("Game profile export API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_EXPORT_FAILED",
      message: "导出游戏 Profile 失败",
    });
  }
}
