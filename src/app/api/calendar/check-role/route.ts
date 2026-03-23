import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function hasCalendarEditorRole(userId: string): Promise<boolean> {
  const serviceClient = createServerSupabaseClient();

  const { data, error } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "calendar_editor")
    .maybeSingle();

  if (error) {
    console.error("Check-role API 查询 user_roles 失败:", error);
    return false;
  }

  return !!data;
}

/**
 * GET /api/calendar/check-role
 * 检查当前登录用户是否拥有 calendar_editor 权限。
 */
export async function GET(request: Request) {
  try {
    const serviceClient = createServerSupabaseClient();
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ hasPermission: false });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ hasPermission: false });
    }

    return NextResponse.json({ hasPermission: await hasCalendarEditorRole(user.id) });
  } catch (error) {
    console.error("Check-role API 错误:", error);
    return NextResponse.json({ hasPermission: false });
  }
}
