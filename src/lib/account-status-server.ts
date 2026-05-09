import { createHash, randomBytes } from "crypto";
import { ApiRouteError } from "@/lib/api-contracts";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ACCOUNT_EMAIL_VERIFICATIONS_TABLE, ACCOUNT_STATUS_TABLE } from "@/lib/supabase-table-names";

const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type AccountStatusRow = {
  user_id: string;
  email_verified_at: string | null;
};

function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function readAccountStatusRow(userId: string): Promise<AccountStatusRow | null> {
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(ACCOUNT_STATUS_TABLE)
    .select("user_id, email_verified_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new ApiRouteError(500, "ACCOUNT_STATUS_READ_FAILED", "读取账号状态失败", error.message);
  }

  return data;
}

export async function ensureAccountStatus(userId: string): Promise<AccountStatusRow> {
  const existingStatus = await readAccountStatusRow(userId);
  if (existingStatus) {
    return existingStatus;
  }

  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(ACCOUNT_STATUS_TABLE)
    .insert({ user_id: userId })
    .select("user_id, email_verified_at")
    .single();

  if (error) {
    throw new ApiRouteError(500, "ACCOUNT_STATUS_CREATE_FAILED", "创建账号状态失败", error.message);
  }

  return data;
}

export async function readAccountEmailVerified(userId: string): Promise<boolean> {
  const status = await ensureAccountStatus(userId);
  return Boolean(status.email_verified_at);
}

export async function markAccountEmailVerified(userId: string): Promise<void> {
  const serviceClient = createServerSupabaseClient();
  const { error } = await serviceClient
    .from(ACCOUNT_STATUS_TABLE)
    .upsert({
      user_id: userId,
      email_verified_at: new Date().toISOString(),
    }, {
      onConflict: "user_id",
    });

  if (error) {
    throw new ApiRouteError(500, "ACCOUNT_EMAIL_VERIFY_FAILED", "记录邮箱验证状态失败", error.message);
  }
}

export async function clearAccountEmailVerification(userId: string): Promise<void> {
  const serviceClient = createServerSupabaseClient();
  const { error } = await serviceClient
    .from(ACCOUNT_STATUS_TABLE)
    .upsert({
      user_id: userId,
      email_verified_at: null,
    }, {
      onConflict: "user_id",
    });

  if (error) {
    throw new ApiRouteError(500, "ACCOUNT_EMAIL_VERIFICATION_RESET_FAILED", "重置邮箱验证状态失败", error.message);
  }
}

export async function createAccountEmailVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("base64url");
  const serviceClient = createServerSupabaseClient();

  const { error: cleanupError } = await serviceClient
    .from(ACCOUNT_EMAIL_VERIFICATIONS_TABLE)
    .delete()
    .eq("user_id", userId);

  if (cleanupError) {
    throw new ApiRouteError(500, "EMAIL_VERIFICATION_TOKEN_CLEANUP_FAILED", "清理旧邮箱验证凭证失败", cleanupError.message);
  }

  const { error } = await serviceClient
    .from(ACCOUNT_EMAIL_VERIFICATIONS_TABLE)
    .insert({
      user_id: userId,
      token_hash: hashVerificationToken(token),
      expires_at: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS).toISOString(),
    });

  if (error) {
    throw new ApiRouteError(500, "EMAIL_VERIFICATION_TOKEN_CREATE_FAILED", "创建邮箱验证凭证失败", error.message);
  }

  return token;
}

export async function consumeAccountEmailVerificationToken(userId: string, token: string): Promise<void> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new ApiRouteError(400, "EMAIL_VERIFICATION_TOKEN_REQUIRED", "缺少邮箱验证凭证");
  }

  const serviceClient = createServerSupabaseClient();
  const tokenHash = hashVerificationToken(normalizedToken);
  const { data, error } = await serviceClient
    .from(ACCOUNT_EMAIL_VERIFICATIONS_TABLE)
    .select("id, expires_at")
    .eq("user_id", userId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new ApiRouteError(500, "EMAIL_VERIFICATION_TOKEN_READ_FAILED", "读取邮箱验证凭证失败", error.message);
  }

  if (!data) {
    throw new ApiRouteError(400, "EMAIL_VERIFICATION_TOKEN_INVALID", "邮箱验证链接无效或已被使用");
  }

  const { error: deleteError } = await serviceClient
    .from(ACCOUNT_EMAIL_VERIFICATIONS_TABLE)
    .delete()
    .eq("id", data.id);

  if (deleteError) {
    throw new ApiRouteError(500, "EMAIL_VERIFICATION_TOKEN_CONSUME_FAILED", "使用邮箱验证凭证失败", deleteError.message);
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    throw new ApiRouteError(410, "EMAIL_VERIFICATION_TOKEN_EXPIRED", "邮箱验证链接已过期，请重新发送验证邮件");
  }
}
