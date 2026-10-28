import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";
import type { ChatMentionUser } from "@/lib/chat/chat-contract";

export async function GET(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request), roomId = requireChatRoom(request);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    if ([...query].length > 96 || query.includes("\0")) throw new ApiRouteError(400, "CHAT_INVALID_MENTION", "无效的搜索内容");
    return jsonSuccess(await chatRpc<ChatMentionUser[]>("search_chat_mention_users", { p_actor: actor.userId, p_query: query.trim(), p_room_id: roomId }), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法搜索用户" }, { headers });
  }
}
