import { after } from "next/server";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, parseChatId, publishChatEvent, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";
import type { ChatEvent } from "@/lib/chat/chat-contract";

export async function DELETE(request: Request, context: { params: Promise<{ messageId: string }> }) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request);
    const roomId = requireChatRoom(request);
    const event = await chatRpc<ChatEvent>("delete_chat_message", {
      p_actor: actor.userId, p_message_id: parseChatId((await context.params).messageId), p_room_id: roomId,
    });
    after(() => publishChatEvent(event, roomId));
    return jsonSuccess(event, { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法删除消息" }, { headers });
  }
}
