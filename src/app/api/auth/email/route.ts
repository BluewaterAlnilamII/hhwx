import { ApiRouteError } from "@/lib/api-contracts";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { createServerAuthSupabaseClient } from "@/lib/supabase-auth-server";
import { verifyTurnstileToken } from "@/lib/turnstile-server";

interface EmailRequestBody {
  action?: unknown;
  captchaToken?: unknown;
  redirectTo?: unknown;
  newEmail?: unknown;
  refreshToken?: unknown;
}

function parseAccessToken(request: Request): string {
  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new ApiRouteError(401, "INVALID_AUTHORIZATION_HEADER", "无效的认证信息");
  }

  return token;
}

function readRequiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiRouteError(400, "INVALID_REQUEST", message);
  }

  return value.trim();
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);

    let body: EmailRequestBody;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const action = readRequiredString(body.action, "缺少操作类型");
    const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken.trim() : "";
    const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo.trim() : "";

    await verifyTurnstileToken(captchaToken, request);

    const authClient = createServerAuthSupabaseClient();

    if (action === "resend-verification") {
      const currentEmail = user.email?.trim() || "";
      if (!currentEmail) {
        throw new ApiRouteError(400, "EMAIL_REQUIRED", "当前账号缺少邮箱信息，无法发送验证邮件");
      }

      const { error } = await authClient.auth.resend({
        type: "signup",
        email: currentEmail,
        options: {
          emailRedirectTo: redirectTo || undefined,
        },
      });

      if (error) {
        throw new ApiRouteError(400, "EMAIL_RESEND_FAILED", error.message);
      }

      return jsonSuccess({ ok: true });
    }

    if (action === "update") {
      const newEmail = readRequiredString(body.newEmail, "请输入新的邮箱地址");
      const refreshToken = readRequiredString(body.refreshToken, "缺少刷新凭证");
      const accessToken = parseAccessToken(request);

      const { error: setSessionError } = await authClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (setSessionError) {
        throw new ApiRouteError(401, "AUTHENTICATION_FAILED", "认证失败", setSessionError.message);
      }

      const { error } = await authClient.auth.updateUser({ email: newEmail }, {
        emailRedirectTo: redirectTo || undefined,
      });

      if (error) {
        throw new ApiRouteError(400, "EMAIL_UPDATE_FAILED", error.message);
      }

      return jsonSuccess({ ok: true });
    }

    throw new ApiRouteError(400, "UNSUPPORTED_ACTION", "不支持的邮箱操作");
  } catch (error) {
    console.error("Auth email API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EMAIL_ACTION_FAILED",
      message: "邮箱操作失败",
    });
  }
}