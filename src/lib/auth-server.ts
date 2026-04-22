import { type User } from "@supabase/supabase-js";
import { ApiRouteError } from "@/lib/api-contracts";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export interface AuthenticatedRequestUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
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

function toAuthenticatedRequestUser(user: User): AuthenticatedRequestUser {
  return {
    id: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
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

  return toAuthenticatedRequestUser(user);
}

export function ensureVerifiedEmail(user: AuthenticatedRequestUser): void {
  if (!user.emailVerified) {
    throw new ApiRouteError(403, "EMAIL_VERIFICATION_REQUIRED", "请先完成邮箱验证");
  }
}