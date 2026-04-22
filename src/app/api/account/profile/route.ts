import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PROFILES_TABLE, USER_ROLES_TABLE } from "@/lib/supabase-table-names";

const USERNAME_PATTERN = /^[\p{L}\p{N}_-]{2,24}$/u;

type ProfileRow = {
  username: string;
  created_at: string | null;
};

function buildFallbackUsername(preferredUsername: string | null, userId: string): string {
  if (preferredUsername && USERNAME_PATTERN.test(preferredUsername)) {
    return preferredUsername;
  }

  return `user_${userId.slice(0, 8)}`;
}

function normalizeUsername(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiRouteError(400, "INVALID_USERNAME", "用户名无效");
  }

  const username = value.trim();
  if (!USERNAME_PATTERN.test(username)) {
    throw new ApiRouteError(400, "INVALID_USERNAME", "用户名需为 2-24 位，可包含字母、数字、下划线或连字符");
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
  emailVerified: boolean,
  metadataUsername: string | null,
) {
  const serviceClient = createServerSupabaseClient();
  const [profile, rolesResult] = await Promise.all([
    ensureProfileRow(userId, metadataUsername),
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
    emailVerified,
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
      user.emailVerified,
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
        throw new ApiRouteError(409, "USERNAME_TAKEN", "该用户名已被占用", error.message);
      }

      throw new ApiRouteError(500, "ACCOUNT_PROFILE_UPDATE_FAILED", "更新账号资料失败", error.message);
    }

    return jsonSuccess(await readAccountProfile(
      user.id,
      user.email,
      user.emailVerified,
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