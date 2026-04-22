import { ApiRouteError } from "@/lib/api-contracts";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { createServerAuthSupabaseClient } from "@/lib/supabase-auth-server";
import { verifyTurnstileToken } from "@/lib/turnstile-server";

interface PasswordResetRequestBody {
  email?: unknown;
  captchaToken?: unknown;
  redirectTo?: unknown;
}

function readOptionalEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
}

export async function POST(request: Request) {
  try {
    let body: PasswordResetRequestBody;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken.trim() : "";
    const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo.trim() : "";
    await verifyTurnstileToken(captchaToken, request);

    let targetEmail = readOptionalEmail(body.email);
    if (!targetEmail) {
      const user = await requireAuthenticatedUser(request);
      targetEmail = user.email?.trim() || null;
    }

    if (!targetEmail) {
      throw new ApiRouteError(400, "EMAIL_REQUIRED", "缺少可用邮箱");
    }

    const authClient = createServerAuthSupabaseClient();
    const { error } = await authClient.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: redirectTo || undefined,
    });

    if (error) {
      throw new ApiRouteError(400, "PASSWORD_RESET_FAILED", error.message);
    }

    return jsonSuccess({ ok: true });
  } catch (error) {
    console.error("Auth password reset API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "PASSWORD_RESET_FAILED",
      message: "发送重置邮件失败",
    });
  }
}