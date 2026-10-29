import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, chatRpc, readChatBody, readChatPresence, readChatPresenceConnections, reconnectChatPresence, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";

export async function GET(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request), roomId = requireChatRoom(request);
    const connections = new URL(request.url).searchParams.get("connections");
    if (connections !== null && connections !== "1") throw new ApiRouteError(400, "INVALID_REQUEST", "无效的在线状态查询");
    return jsonSuccess(connections === "1" ? await readChatPresenceConnections(actor.userId, roomId) : await readChatPresence(actor.userId, roomId), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "在线状态暂不可用" }, { headers });
  }
}

// Backend capability only; the chat UI does not expose a visibility setting yet.
export async function PATCH(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request, true);
    requireChatRoom(request);
    const body = await readChatBody(request);
    if (typeof body.visible !== "boolean") throw new ApiRouteError(400, "INVALID_REQUEST", "无效的在线状态设置");
    await chatRpc("set_chat_presence_visibility", { p_actor: actor.userId, p_visible: body.visible });
    await reconnectChatPresence(actor.userId);
    return jsonSuccess({ visible: body.visible }, { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "暂时无法更新在线状态" }, { headers });
  }
}
