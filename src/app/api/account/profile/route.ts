import { ApiRouteError } from "@/lib/api-contracts";
import { ensureAccountStatus } from "@/lib/account-status-server";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PROFILES_TABLE, USER_ROLES_TABLE } from "@/lib/supabase-table-names";
import { fetchBestdoriMasterDataset } from "@/lib/bestdori-master-data";
import {
  DEFAULT_ACCOUNT_AVATAR_CARD_ID,
  DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE,
  type AccountAvatarCardTrainType,
} from "@/lib/account-avatar-defaults";
import {
  USERNAME_REQUIRED_MESSAGE,
  USERNAME_TAKEN_MESSAGE,
  normalizeUsernameValue,
  validateUsernameValue,
} from "@/lib/username-policy";

type AvatarCardTrainType = AccountAvatarCardTrainType;

type ProfileRow = {
  public_uid: number;
  username: string;
  avatar_card_id: number | null;
  avatar_card_train_type: AvatarCardTrainType | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStoredAvatarCardId(value: number | null | undefined): number {
  return value ?? DEFAULT_ACCOUNT_AVATAR_CARD_ID;
}

function normalizeStoredAvatarTrainType(
  value: AvatarCardTrainType | null | undefined,
  cardId: number,
): AvatarCardTrainType {
  if (cardId === DEFAULT_ACCOUNT_AVATAR_CARD_ID) {
    return DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE;
  }

  return value === "normal" || value === "after_training" ? value : "after_training";
}

function normalizeAvatarCardId(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_ACCOUNT_AVATAR_CARD_ID;
  }

  const cardId = Number(value);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    throw new ApiRouteError(400, "INVALID_AVATAR_CARD_ID", "请选择有效的头像卡牌");
  }

  return cardId;
}

function normalizeRequestedAvatarTrainType(value: unknown, cardId: number): AvatarCardTrainType {
  if (value === undefined || value === null || value === "") {
    return cardId === DEFAULT_ACCOUNT_AVATAR_CARD_ID ? DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE : "after_training";
  }

  if (value === "normal" || value === "after_training") {
    return value;
  }

  throw new ApiRouteError(400, "INVALID_AVATAR_CARD_TRAIN_TYPE", "请选择有效的卡面版本");
}

async function readBestdoriAvatarCard(cardId: number): Promise<{ hasTrainedArt: boolean }> {
  const payload = await fetchBestdoriMasterDataset("cards");
  const card = isRecord(payload) ? payload[String(cardId)] : null;
  if (!isRecord(card) || typeof card.resourceSetName !== "string" || !card.resourceSetName.trim()) {
    throw new ApiRouteError(400, "AVATAR_CARD_NOT_FOUND", "所选卡牌不存在或缺少卡面资源");
  }

  return {
    hasTrainedArt: isRecord(card.stat) && isRecord(card.stat.training),
  };
}

function resolveAvatarTrainTypeForCard(
  requestedTrainType: AvatarCardTrainType,
  card: { hasTrainedArt: boolean },
): AvatarCardTrainType {
  return card.hasTrainedArt ? requestedTrainType : DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE;
}

async function ensureProfileRow(userId: string, preferredUsername: string | null): Promise<ProfileRow> {
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(PROFILES_TABLE)
    .select("public_uid, username, avatar_card_id, avatar_card_train_type, created_at")
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
      avatar_card_id: DEFAULT_ACCOUNT_AVATAR_CARD_ID,
      avatar_card_train_type: DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE,
    }, {
      onConflict: "id",
    })
    .select("public_uid, username, avatar_card_id, avatar_card_train_type, created_at")
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

  const avatarCardId = normalizeStoredAvatarCardId(profile.avatar_card_id);

  return {
    userId,
    publicUid: profile.public_uid,
    email,
    emailVerified: Boolean(accountStatus.email_verified_at),
    username: profile.username,
    avatarCardId,
    avatarCardTrainType: normalizeStoredAvatarTrainType(profile.avatar_card_train_type, avatarCardId),
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

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);

    let body: { avatarCardId?: unknown; avatarCardTrainType?: unknown };
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const avatarCardId = normalizeAvatarCardId(body.avatarCardId);
    const requestedAvatarCardTrainType = normalizeRequestedAvatarTrainType(body.avatarCardTrainType, avatarCardId);
    const avatarCard = await readBestdoriAvatarCard(avatarCardId);
    const avatarCardTrainType = resolveAvatarTrainTypeForCard(requestedAvatarCardTrainType, avatarCard);
    await ensureProfileRow(user.id, user.metadataUsername);

    const serviceClient = createServerSupabaseClient();
    const { error } = await serviceClient
      .from(PROFILES_TABLE)
      .update({
        avatar_card_id: avatarCardId,
        avatar_card_train_type: avatarCardTrainType,
      })
      .eq("id", user.id);

    if (error) {
      throw new ApiRouteError(500, "ACCOUNT_PROFILE_UPDATE_FAILED", "更新头像失败", error.message);
    }

    return jsonSuccess(await readAccountProfile(
      user.id,
      user.email,
      user.metadataUsername,
    ));
  } catch (error) {
    console.error("Account profile PATCH API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "ACCOUNT_PROFILE_UPDATE_FAILED",
      message: "更新头像失败",
    });
  }
}
