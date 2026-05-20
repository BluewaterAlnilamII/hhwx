import { NextResponse } from "next/server";
import { jsonRouteError } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { exportBestdoriGameProfile, normalizeProfileId } from "@/lib/user-game-profiles-server";

export async function GET(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await requireVerifiedAccount(request);
    const { profileId: rawProfileId } = await context.params;
    const profileId = normalizeProfileId(rawProfileId);
    const profile = await exportBestdoriGameProfile(user.id, profileId);

    // 导出保留兼容格式，并把 HHWX 专用字段放在顶层扩展里，方便其他读取方忽略。
    return NextResponse.json(profile);
  } catch (error) {
    console.error("Game profile export API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_EXPORT_FAILED",
      message: "导出游戏档案失败",
    });
  }
}
