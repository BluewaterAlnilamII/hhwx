import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, parseChatId, readChatBody, requireChatIdentity } from "@/lib/chat/chat-server";

async function setMute(request: Request, context: { params: Promise<{ userId: string }> }, clear: boolean) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request);
    const until = clear ? null : (await readChatBody(request)).mutedUntil;
    if (!clear && (typeof until !== "string" || !Number.isFinite(Date.parse(until)))) {
      throw new ApiRouteError(400, "CHAT_INVALID_MUTE", "禁言到期时间无效");
    }
    return jsonSuccess(await chatRpc("set_chat_mute", {
      p_actor: actor.userId, p_user_id: parseChatId((await context.params).userId), p_until: until,
    }), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法更新禁言" }, { headers });
  }
}

export const PUT = (request: Request, context: { params: Promise<{ userId: string }> }) => setMute(request, context, false);
export const DELETE = (request: Request, context: { params: Promise<{ userId: string }> }) => setMute(request, context, true);
