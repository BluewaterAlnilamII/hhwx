import { ApiRouteError } from "@/lib/api-contracts";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function readSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
}

function readSecretKey(): string {
  return process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
}

function readRemoteIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for")?.trim();
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  return request.headers.get("x-real-ip")?.trim() || null;
}

export function isServerTurnstileEnabled(): boolean {
  return Boolean(readSiteKey() && readSecretKey());
}

export async function verifyTurnstileToken(token: string | null | undefined, request: Request): Promise<void> {
  if (!isServerTurnstileEnabled()) {
    return;
  }

  const secretKey = readSecretKey();
  if (!secretKey) {
    throw new ApiRouteError(500, "TURNSTILE_SERVER_NOT_CONFIGURED", "缺少服务端安全验证配置");
  }

  if (!token) {
    throw new ApiRouteError(400, "TURNSTILE_REQUIRED", "请先完成安全验证");
  }

  const formData = new URLSearchParams();
  formData.set("secret", secretKey);
  formData.set("response", token);

  const remoteIp = readRemoteIp(request);
  if (remoteIp) {
    formData.set("remoteip", remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ApiRouteError(502, "TURNSTILE_VERIFY_FAILED", "安全验证服务暂时不可用");
  }

  const payload = await response.json().catch(() => null) as
    | { success?: boolean; "error-codes"?: unknown }
    | null;

  if (!payload?.success) {
    throw new ApiRouteError(400, "TURNSTILE_INVALID", "安全验证未通过", payload?.["error-codes"]);
  }
}