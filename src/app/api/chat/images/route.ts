import { after } from "next/server";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, parseChatId, publishChatEvent, readChatBody, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";
import { verifyChatImageUpload } from "@/lib/chat/chat-image-server";
import type { ChatSendResult } from "@/lib/chat/chat-contract";

export async function POST(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request, true);
    const roomId = requireChatRoom(request);
    const body = await readChatBody(request);
    const requestId = parseChatId(body.clientRequestId);
    const image = await verifyChatImageUpload(actor.userId, requestId, body.receipt);
    const result = await chatRpc<ChatSendResult>("send_chat_image", { p_actor: actor.userId, p_request_id: requestId, p_image: image, p_room_id: roomId,
      p_reply_to_id: body.replyToId == null ? null : parseChatId(body.replyToId) });
    if (!result.deleted && result.message) {
      const message = result.message;
      after(() => publishChatEvent({ type: "message.created", message }, roomId));
    }
    return jsonSuccess(result, { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法发送图片" }, { headers });
  }
}
