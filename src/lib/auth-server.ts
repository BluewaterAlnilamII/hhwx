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

export async function requireAuthenticatedUserId(request: Request): Promise<string> {
  const { data, error } = await createServerSupabaseClient().auth.getClaims(parseBearerToken(request));
  const claims = data?.claims;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (error || !claims || !supabaseUrl
    || claims.iss !== `${new URL(supabaseUrl).origin}/auth/v1`
    || claims.aud !== "authenticated" || claims.role !== "authenticated"
    || typeof claims.sub !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(claims.sub)
    || typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) {
    throw new ApiRouteError(401, "AUTHENTICATION_FAILED", "认证失败");
  }
  return claims.sub.toLowerCase();
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

// Public comment reads tolerate missing or expired sessions; writes require verification.
export async function readViewerUserId(request: Request): Promise<string | null> {
  if (!request.headers.get("authorization")) return null;
  try {
    return (await requireAuthenticatedUser(request)).id;
  } catch {
    return null;
  }
}

function ensureVerifiedEmail(user: AuthenticatedRequestUser): void {
  if (!user.emailVerified) {
    throw new ApiRouteError(403, "EMAIL_VERIFICATION_REQUIRED", "请先完成邮箱验证");
  }
}

export async function requireVerifiedAccount(request: Request): Promise<AuthenticatedRequestUser> {
  const user = await requireAuthenticatedUser(request);
  ensureVerifiedEmail(user);
  return user;
}
