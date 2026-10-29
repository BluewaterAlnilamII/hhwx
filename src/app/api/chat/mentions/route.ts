import { after } from "next/server";
import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, parseChatId, publishMentionAcknowledgement, readChatBody, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";
import type { ChatMentionInbox } from "@/lib/chat/chat-contract";

export async function GET(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request), roomId = requireChatRoom(request);
    return jsonSuccess(await chatRpc<ChatMentionInbox>("read_chat_mentions", { p_actor: actor.userId, p_room_id: roomId }), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法读取提及" }, { headers });
  }
}

export async function PUT(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request, true), roomId = requireChatRoom(request), body = await readChatBody(request);
    if (!Array.isArray(body.messageIds) || body.messageIds.length < 1 || body.messageIds.length > 50) {
      throw new ApiRouteError(400, "CHAT_INVALID_MENTION", "无效的提及");
    }
    const messageIds = [...new Set(body.messageIds.map(parseChatId))];
    await chatRpc("acknowledge_chat_mentions", { p_actor: actor.userId, p_message_ids: messageIds, p_room_id: roomId });
    after(() => publishMentionAcknowledgement(actor.userId, messageIds, roomId));
    return jsonSuccess({ acknowledged: true }, { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法关闭提醒" }, { headers });
  }
}
