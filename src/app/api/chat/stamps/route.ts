import { after } from "next/server";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, parseChatId, readChatBody, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";
import { publishChatStamp, requireChatStamp } from "@/lib/chat/chat-stamp-server";
import type { ChatStampSendResult } from "@/lib/chat/chat-stamp-contract";

export async function POST(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request, true);
    const roomId = requireChatRoom(request);
    const body = await readChatBody(request);
    const id = parseChatId(body.clientRequestId);
    const stamp = await requireChatStamp(body.stamp);
    const result = await chatRpc<ChatStampSendResult & { username: string; publicUid: number }>("authorize_chat_stamp", { p_actor: actor.userId });
    after(() => publishChatStamp({ type: "stamp.sent", id, userId: actor.userId, username: result.username, publicUid: result.publicUid, stamp }, roomId));
    return jsonSuccess({ nextStampAt: result.nextStampAt }, { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法发送 Stamp" }, { headers });
  }
}
