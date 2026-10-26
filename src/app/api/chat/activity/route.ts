import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";
import type { ChatActivity } from "@/lib/chat/chat-contract";

export async function GET(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request);
    const roomId = requireChatRoom(request);
    return jsonSuccess(await chatRpc<ChatActivity>("read_chat_activity", { p_actor: actor.userId, p_room_id: roomId }), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法读取留言板状态" }, { headers });
  }
}
