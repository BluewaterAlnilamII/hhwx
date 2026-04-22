import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const DELETE_CONFIRMATION_TEXT = "DELETE";

export async function DELETE(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);

    let body: { confirmationText?: unknown };
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    if (body.confirmationText !== DELETE_CONFIRMATION_TEXT) {
      throw new ApiRouteError(400, "INVALID_DELETE_CONFIRMATION", "请输入 DELETE 以确认删除账号");
    }

    const serviceClient = createServerSupabaseClient();
    const { error } = await serviceClient.auth.admin.deleteUser(user.id);
    if (error) {
      throw new ApiRouteError(500, "ACCOUNT_DELETE_FAILED", "删除账号失败", error.message);
    }

    return jsonSuccess({ deleted: true });
  } catch (error) {
    console.error("Account DELETE API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "ACCOUNT_DELETE_FAILED",
      message: "删除账号失败",
    });
  }
}