import { ApiRouteError } from "@/lib/api-contracts";
import { ensureAccountStatus } from "@/lib/account-status-server";
import { sendAccountEmailVerificationEmail } from "@/lib/account-email-verification-server";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { findAuthUserByEmail, normalizeEmailAddress } from "@/lib/auth-user-server";
import { readAuthEmailRedirectTo } from "@/lib/auth-redirect-server";
import { validatePasswordValue } from "@/lib/password-policy";
import { createServerAuthSupabaseClient } from "@/lib/supabase-auth-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PROFILES_TABLE } from "@/lib/supabase-table-names";
import { verifyTurnstileToken } from "@/lib/turnstile-server";
import {
  USERNAME_CHECK_FAILED_MESSAGE,
  USERNAME_REQUIRED_MESSAGE,
  USERNAME_TAKEN_MESSAGE,
  normalizeUsernameValue,
  validateUsernameValue,
} from "@/lib/username-policy";

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

function readPassword(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiRouteError(400, "INVALID_REQUEST", "请输入密码");
  }

  if (!value) {
    throw new ApiRouteError(400, "INVALID_REQUEST", "请输入密码");
  }

  const validationError = validatePasswordValue(value);
  if (validationError) {
    throw new ApiRouteError(400, "INVALID_PASSWORD", validationError);
  }

  return value;
}

function normalizeUsername(value: unknown): string {
  const username = normalizeUsernameValue(readRequiredString(value, USERNAME_REQUIRED_MESSAGE));
  const validationError = validateUsernameValue(username);
  if (validationError) {
    throw new ApiRouteError(400, "INVALID_USERNAME", validationError);
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
    const password = readPassword(body.password);
    const redirectTo = readAuthEmailRedirectTo(body.redirectTo, request);
    const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken.trim() : "";

    await verifyTurnstileToken(captchaToken, request);

    const serviceClient = createServerSupabaseClient();
    const { data: existingProfile, error: existingProfileError } = await serviceClient
      .from(PROFILES_TABLE)
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existingProfileError) {
      throw new ApiRouteError(500, "USERNAME_CHECK_FAILED", USERNAME_CHECK_FAILED_MESSAGE, existingProfileError.message);
    }

    if (existingProfile) {
      throw new ApiRouteError(409, "USERNAME_TAKEN", USERNAME_TAKEN_MESSAGE);
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

    if (data.user) {
      await ensureAccountStatus(data.user.id);
      await sendAccountEmailVerificationEmail({
        userId: data.user.id,
        email: data.user.email ?? email,
        redirectTo,
        failureCode: "SIGN_UP_VERIFICATION_EMAIL_FAILED",
      });
    }

    return jsonSuccess({
      requiresEmailVerification: true,
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
            emailVerified: false,
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
