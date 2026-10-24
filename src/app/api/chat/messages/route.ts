import { after } from "next/server";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, parseChatContent, parseChatCursor, parseChatId, publishChatEvent, readChatBody, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";
import type { ChatPage, ChatSendResult } from "@/lib/chat/chat-contract";

export async function GET(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request);
    const roomId = requireChatRoom(request);
    const cursor = parseChatCursor(new URL(request.url).searchParams.get("before"));
    return jsonSuccess(await chatRpc<ChatPage>("read_chat_messages", {
      p_actor: actor.userId, p_before_at: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null, p_room_id: roomId,
    }), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法读取消息" }, { headers });
  }
}

export async function POST(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request, true);
    const roomId = requireChatRoom(request);
    const body = await readChatBody(request);
    const result = await chatRpc<ChatSendResult>("send_chat_message", {
      p_actor: actor.userId, p_request_id: parseChatId(body.clientRequestId), p_content: parseChatContent(body.content), p_room_id: roomId,
    });
    if (!result.deleted && result.message) {
      const message = result.message;
      after(() => publishChatEvent({ type: "message.created", message }, roomId));
    }
    return jsonSuccess(result, { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法发送消息" }, { headers });
  }
}
