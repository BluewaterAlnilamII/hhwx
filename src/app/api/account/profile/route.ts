import { ApiRouteError } from "@/lib/api-contracts";
import { ensureAccountStatus } from "@/lib/account-status-server";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PROFILES_TABLE, USER_ROLES_TABLE } from "@/lib/supabase-table-names";
import {
  USERNAME_REQUIRED_MESSAGE,
  USERNAME_TAKEN_MESSAGE,
  normalizeUsernameValue,
  validateUsernameValue,
} from "@/lib/username-policy";

type ProfileRow = {
  username: string;
  created_at: string | null;
};

function buildFallbackUsername(preferredUsername: string | null, userId: string): string {
  if (preferredUsername) {
    const normalizedPreferredUsername = normalizeUsernameValue(preferredUsername);
    if (!validateUsernameValue(normalizedPreferredUsername)) {
      return normalizedPreferredUsername;
    }
  }

  return `user_${userId.slice(0, 8)}`;
}

function normalizeUsername(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiRouteError(400, "INVALID_USERNAME", USERNAME_REQUIRED_MESSAGE);
  }

  const username = normalizeUsernameValue(value);
  const validationError = validateUsernameValue(username);
  if (validationError) {
    throw new ApiRouteError(400, "INVALID_USERNAME", validationError);
  }

  return username;
}

async function ensureProfileRow(userId: string, preferredUsername: string | null): Promise<ProfileRow> {
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(PROFILES_TABLE)
    .select("username, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new ApiRouteError(500, "PROFILE_READ_FAILED", "读取账号资料失败", error.message);
  }

  if (data) {
    return data;
  }

  const fallbackUsername = buildFallbackUsername(preferredUsername, userId);
  const { data: created, error: createError } = await serviceClient
    .from(PROFILES_TABLE)
    .upsert({
      id: userId,
      username: fallbackUsername,
    }, {
      onConflict: "id",
    })
    .select("username, created_at")
    .single();

  if (createError) {
    throw new ApiRouteError(500, "PROFILE_CREATE_FAILED", "创建账号资料失败", createError.message);
  }

  return created;
}

async function readAccountProfile(
  userId: string,
  email: string | null,
  metadataUsername: string | null,
) {
  const serviceClient = createServerSupabaseClient();
  const [profile, accountStatus, rolesResult] = await Promise.all([
    ensureProfileRow(userId, metadataUsername),
    ensureAccountStatus(userId),
    serviceClient
      .from(USER_ROLES_TABLE)
      .select("role")
      .eq("user_id", userId),
  ]);

  if (rolesResult.error) {
    throw new ApiRouteError(500, "ACCOUNT_ROLES_READ_FAILED", "读取账号权限失败", rolesResult.error.message);
  }

  return {
    userId,
    email,
    emailVerified: Boolean(accountStatus.email_verified_at),
    username: profile.username,
    createdAt: profile.created_at,
    updatedAt: profile.created_at,
    roles: (rolesResult.data ?? []).map((row) => row.role),
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    return jsonSuccess(await readAccountProfile(
      user.id,
      user.email,
      user.metadataUsername,
    ));
  } catch (error) {
    console.error("Account profile GET API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "ACCOUNT_PROFILE_READ_FAILED",
      message: "读取账号资料失败",
    });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);

    let body: { username?: unknown };
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const username = normalizeUsername(body.username);
    const serviceClient = createServerSupabaseClient();
    const { error } = await serviceClient
      .from(PROFILES_TABLE)
      .upsert({
        id: user.id,
        username,
      }, {
        onConflict: "id",
      });

    if (error) {
      if (error.code === "23505") {
        throw new ApiRouteError(409, "USERNAME_TAKEN", USERNAME_TAKEN_MESSAGE, error.message);
      }

      throw new ApiRouteError(500, "ACCOUNT_PROFILE_UPDATE_FAILED", "更新账号资料失败", error.message);
    }

    return jsonSuccess(await readAccountProfile(
      user.id,
      user.email,
      username,
    ));
  } catch (error) {
    console.error("Account profile PUT API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "ACCOUNT_PROFILE_UPDATE_FAILED",
      message: "更新账号资料失败",
    });
  }
}
