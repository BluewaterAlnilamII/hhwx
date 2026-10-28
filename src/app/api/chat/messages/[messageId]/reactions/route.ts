import { after } from "next/server";
import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { COMMENT_EMOJI_NAME_SET } from "@/lib/comments/emoji";
import { chatHeaders, chatRpc, parseChatCursor, parseChatId, publishChatEvent, readChatBody, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";
import type { ChatReactionEvent } from "@/lib/chat/chat-contract";

type Context = { params: Promise<{ messageId: string }> };
function emoji(value: unknown) {
  if (typeof value !== "string" || !COMMENT_EMOJI_NAME_SET.has(value)) throw new ApiRouteError(400, "CHAT_INVALID_REACTION", "无效的回应");
  return value;
}
export async function PUT(request: Request, context: Context) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request, true), roomId = requireChatRoom(request);
    const messageId = parseChatId((await context.params).messageId);
    const body = await readChatBody(request);
    if (typeof body.active !== "boolean") throw new ApiRouteError(400, "CHAT_INVALID_REACTION", "无效的回应");
    const event = await chatRpc<ChatReactionEvent>("set_chat_reaction", {
      p_actor: actor.userId, p_message_id: messageId, p_emoji_key: emoji(body.emojiKey), p_active: body.active, p_room_id: roomId,
    });
    after(() => publishChatEvent(event, roomId));
    return jsonSuccess(event, { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法更新回应" }, { headers });
  }
}
export async function GET(request: Request, context: Context) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request), roomId = requireChatRoom(request);
    const params = new URL(request.url).searchParams;
    const cursor = parseChatCursor(params.get("after"));
    return jsonSuccess(await chatRpc("read_chat_reaction_participants", {
      p_actor: actor.userId, p_message_id: parseChatId((await context.params).messageId), p_emoji_key: emoji(params.get("emojiKey")),
      p_after_at: cursor?.createdAt ?? null, p_after_id: cursor?.id ?? null, p_room_id: roomId,
    }), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法读取回应" }, { headers });
  }
}
