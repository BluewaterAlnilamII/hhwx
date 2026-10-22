import { ApiRouteError } from "@/lib/api-contracts";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requestAccountEmailChange } from "@/lib/account-email-change-server";
import { verifyTurnstileToken } from "@/lib/turnstile-server";

export async function POST(request: Request) {
  try {
    const user = await requireVerifiedAccount(request);
    const body = await request.json().catch(() => null) as { action?: unknown; newEmail?: unknown; proofToken?: unknown; captchaToken?: unknown } | null;
    if (!body) throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    if (body.action !== "update") throw new ApiRouteError(410, "AUTH_FLOW_UPDATED", "账号流程已更新，请刷新页面后重试");
    const email = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      throw new ApiRouteError(400, "EMAIL_REQUIRED", "请输入有效的邮箱地址");
    }
    if (email === user.email?.toLowerCase()) throw new ApiRouteError(400, "EMAIL_UNCHANGED", "新邮箱需要与当前邮箱不同");
    if (typeof body.proofToken !== "string" || !body.proofToken || body.proofToken.length > 16384) {
      throw new ApiRouteError(403, "EMAIL_CHANGE_PROOF_REQUIRED", "请先验证当前邮箱");
    }
    await verifyTurnstileToken(typeof body.captchaToken === "string" ? body.captchaToken : undefined, request);
    return jsonSuccess(await requestAccountEmailChange(user, body.proofToken, email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonRouteError(error, { status: 500, code: "EMAIL_UPDATE_FAILED", message: "更新邮箱失败" });
  }
}
