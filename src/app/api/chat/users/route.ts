import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";
import type { ChatMentionUser } from "@/lib/chat/chat-contract";

export async function GET(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request), roomId = requireChatRoom(request);
    return jsonSuccess(await chatRpc<ChatMentionUser[]>("read_chat_user_directory", { p_actor: actor.userId, p_room_id: roomId }), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法加载用户" }, { headers });
  }
}
