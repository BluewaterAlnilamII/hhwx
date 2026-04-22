import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { findAuthUserByEmail, normalizeEmailAddress } from "@/lib/auth-user-server";
import { createServerAuthSupabaseClient } from "@/lib/supabase-auth-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PROFILES_TABLE } from "@/lib/supabase-table-names";
import { verifyTurnstileToken } from "@/lib/turnstile-server";

const USERNAME_PATTERN = /^[\p{L}\p{N}_-]{2,24}$/u;

interface SignUpRequestBody {
  username?: unknown;
  email?: unknown;
  password?: unknown;
  captchaToken?: unknown;
  redirectTo?: unknown;
}

function readRequiredString(value: unknown, message: string): string {
  if (typeof value !== "string") {
    throw new ApiRouteError(400, "INVALID_REQUEST", message);
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new ApiRouteError(400, "INVALID_REQUEST", message);
  }

  return normalizedValue;
}

function normalizeUsername(value: unknown): string {
  const username = readRequiredString(value, "请输入用户名");
  if (!USERNAME_PATTERN.test(username)) {
    throw new ApiRouteError(400, "INVALID_USERNAME", "用户名需为 2-24 位，可包含字母、数字、下划线或连字符");
  }

  return username;
}

export async function POST(request: Request) {
  try {
    let body: SignUpRequestBody;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const username = normalizeUsername(body.username);
    const email = normalizeEmailAddress(readRequiredString(body.email, "请输入邮箱"));
    const password = readRequiredString(body.password, "请输入密码");
    const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo.trim() : "";
    const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken.trim() : "";

    await verifyTurnstileToken(captchaToken, request);

    const serviceClient = createServerSupabaseClient();
    const { data: existingProfile, error: existingProfileError } = await serviceClient
      .from(PROFILES_TABLE)
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existingProfileError) {
      throw new ApiRouteError(500, "USERNAME_CHECK_FAILED", "检查用户名是否可用失败", existingProfileError.message);
    }

    if (existingProfile) {
      throw new ApiRouteError(409, "USERNAME_TAKEN", "该用户名已被占用");
    }

    const existingUser = await findAuthUserByEmail(email);
    if (existingUser) {
      throw new ApiRouteError(409, "EMAIL_TAKEN", "该邮箱已被注册");
    }

    const authClient = createServerAuthSupabaseClient();
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo || undefined,
        data: { username },
      },
    });

    if (error) {
      throw new ApiRouteError(400, "SIGN_UP_FAILED", error.message);
    }

    return jsonSuccess({
      requiresEmailVerification: !(data.session && data.user?.email_confirmed_at),
      session: data.session
        ? {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
          }
        : null,
      authSummary: data.session && data.user
        ? {
            userId: data.user.id,
            username,
            email: data.user.email ?? email,
            emailVerified: Boolean(data.user.email_confirmed_at),
          }
        : null,
    });
  } catch (error) {
    console.error("Auth signup API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "SIGN_UP_FAILED",
      message: "注册失败",
    });
  }
}