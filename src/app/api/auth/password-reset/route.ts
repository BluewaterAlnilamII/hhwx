import { jsonError } from "@/lib/api-response";

// Old clients restart the native OTP flow; never consume Turnstile twice.
export async function POST() {
  return jsonError(410, "AUTH_FLOW_UPDATED", "账号流程已更新，请刷新页面后重试");
}
