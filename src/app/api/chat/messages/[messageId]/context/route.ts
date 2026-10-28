import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, parseChatId, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";

export async function GET(request: Request, context: { params: Promise<{ messageId: string }> }) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request), roomId = requireChatRoom(request);
    return jsonSuccess(await chatRpc("read_chat_context", {
      p_actor: actor.userId, p_message_id: parseChatId((await context.params).messageId), p_room_id: roomId,
    }), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法读取消息" }, { headers });
  }
}
