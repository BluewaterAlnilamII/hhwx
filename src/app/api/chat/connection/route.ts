import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, issueChatConnection, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";

export async function POST(request: Request) {
  const headers = chatHeaders();
  try {
    const roomId = requireChatRoom(request);
    // Existing tabs keep their server-side full subscription until their next page load.
    return jsonSuccess(await issueChatConnection(await requireChatIdentity(request), roomId,
      new URL(request.url).searchParams.get("activity") === "1"), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_UNAVAILABLE", message: "留言板暂时不可用" }, { headers });
  }
}
