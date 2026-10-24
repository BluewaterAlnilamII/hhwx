import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { chatHeaders, parseChatId, readChatBody, requireChatIdentity, requireChatRoom } from "@/lib/chat/chat-server";
import { issueChatImageUpload } from "@/lib/chat/chat-image-server";

export async function POST(request: Request) {
  const headers = chatHeaders();
  try {
    const actor = await requireChatIdentity(request, true);
    requireChatRoom(request);
    const body = await readChatBody(request);
    return jsonSuccess(await issueChatImageUpload(actor.userId, parseChatId(body.clientRequestId), body.image), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 503, code: "CHAT_IMAGES_UNAVAILABLE", message: "暂时无法上传图片" }, { headers });
  }
}
