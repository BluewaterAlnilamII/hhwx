import { ApiRouteError } from "@/lib/api-contracts";
import { createAccountEmailVerificationToken } from "@/lib/account-status-server";
import { createServerAuthSupabaseClient } from "@/lib/supabase-auth-server";

type SendAccountEmailVerificationOptions = {
  userId: string;
  email: string;
  redirectTo: string;
  failureCode: string;
};

export function buildEmailVerificationRedirectUrl(redirectTo: string, token: string): string | undefined {
  if (!redirectTo) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(redirectTo);
  } catch {
    throw new ApiRouteError(400, "INVALID_REDIRECT_URL", "无效的邮箱验证回跳地址");
  }

  url.searchParams.set("verify_email", "1");
  url.searchParams.set("verification_token", token);
  return url.toString();
}

export async function sendAccountEmailVerificationEmail({
  userId,
  email,
  redirectTo,
  failureCode,
}: SendAccountEmailVerificationOptions): Promise<void> {
  const verificationToken = await createAccountEmailVerificationToken(userId);
  const authClient = createServerAuthSupabaseClient();
  const { error } = await authClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: buildEmailVerificationRedirectUrl(redirectTo, verificationToken),
      shouldCreateUser: false,
    },
  });

  if (error) {
    throw new ApiRouteError(400, failureCode, error.message);
  }
}
