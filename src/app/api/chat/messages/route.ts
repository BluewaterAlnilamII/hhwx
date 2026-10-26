import { after } from "next/server";
import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, parseChatContent, parseChatCursor, parseChatId, publishChatEvent, readChatBody, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";
import type { ChatNewerPage, ChatPage, ChatSendResult } from "@/lib/chat/chat-contract";

export async function GET(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request);
    const roomId = requireChatRoom(request);
    const params = new URL(request.url).searchParams;
    if (params.has("before") && params.has("after")) throw new ApiRouteError(400, "CHAT_INVALID_CURSOR", "Invalid cursor");
    if (params.has("after")) {
      const cursor = parseChatCursor(params.get("after"));
      if (!cursor) throw new ApiRouteError(400, "CHAT_INVALID_CURSOR", "Invalid cursor");
      return jsonSuccess(await chatRpc<ChatNewerPage>("read_newer_chat_messages", {
        p_actor: actor.userId, p_after_at: cursor.createdAt, p_after_id: cursor.id, p_room_id: roomId,
      }), { headers });
    }
    const cursor = parseChatCursor(params.get("before"));
    if (!cursor && params.get("activity") === "1") {
      return jsonSuccess(await chatRpc<ChatPage>("read_chat_snapshot", { p_actor: actor.userId, p_room_id: roomId }), { headers });
    }
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
