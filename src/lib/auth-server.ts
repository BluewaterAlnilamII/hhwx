import { type User } from "@supabase/supabase-js";
import { ApiRouteError } from "@/lib/api-contracts";
import { readAccountEmailVerified } from "@/lib/account-status-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export interface AuthenticatedRequestUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  metadataUsername: string | null;
}

function parseBearerToken(request: Request): string {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    throw new ApiRouteError(401, "UNAUTHENTICATED", "未登录");
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new ApiRouteError(401, "INVALID_AUTHORIZATION_HEADER", "无效的认证信息");
  }

  return token;
}

function toAuthenticatedRequestUser(user: User, emailVerified: boolean): AuthenticatedRequestUser {
  return {
    id: user.id,
    email: user.email ?? null,
    emailVerified,
    metadataUsername: typeof user.user_metadata?.username === "string"
      ? user.user_metadata.username.trim() || null
      : null,
  };
}

export async function requireAuthenticatedUser(request: Request): Promise<AuthenticatedRequestUser> {
  const serviceClient = createServerSupabaseClient();
  const token = parseBearerToken(request);
  const {
    data: { user },
    error,
  } = await serviceClient.auth.getUser(token);

  if (error || !user) {
    throw new ApiRouteError(401, "AUTHENTICATION_FAILED", "认证失败", error?.message);
  }

  const emailVerified = await readAccountEmailVerified(user.id);
  return toAuthenticatedRequestUser(user, emailVerified);
}

export function ensureVerifiedEmail(user: AuthenticatedRequestUser): void {
  if (!user.emailVerified) {
    throw new ApiRouteError(403, "EMAIL_VERIFICATION_REQUIRED", "请先完成邮箱验证");
  }
}

export async function requireVerifiedAccount(request: Request): Promise<AuthenticatedRequestUser> {
  const user = await requireAuthenticatedUser(request);
  ensureVerifiedEmail(user);
  return user;
}
