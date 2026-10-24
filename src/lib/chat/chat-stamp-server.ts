import "server-only";
import { ApiRouteError } from "@/lib/api-contracts";
import { readBandoriStampsApiDataset } from "@/lib/bandori-stamps-api-server";
import { parseChatStampReference, type ChatStampPublication, type ChatStampReference } from "./chat-stamp-contract";
import { publishChatEvent } from "./chat-server";
import { CHAT_DEFAULT_ROOM_ID } from "./chat-contract";

export async function requireChatStamp(value: unknown): Promise<ChatStampReference> {
  const stamp = parseChatStampReference(value);
  if (!stamp) throw new ApiRouteError(400, "CHAT_INVALID_STAMP", "无效的 Stamp");
  // Reuse the private, versioned master reader and its cache; never trust client URLs.
  const master = (await readBandoriStampsApiDataset())[String(stamp.id)];
  const slot = ["jp", "en", "tw", "cn"].indexOf(stamp.region);
  if (!master?.imageName[slot] || (stamp.kind === "changed" && !master.changedStamps?.[slot]?.length)) {
    throw new ApiRouteError(400, "CHAT_INVALID_STAMP", "无效的 Stamp");
  }
  return stamp;
}

// shortcut: one Next.js publishing process owns the shared gate. Move it to a shared
// publisher before running multiple application instances; no per-client gates or queues.
const runtime = globalThis as typeof globalThis & { chatStampBroadcastTimes?: number[] };
export async function publishChatStamp(event: ChatStampPublication, roomId = CHAT_DEFAULT_ROOM_ID): Promise<void> {
  const now = Date.now();
  const times = runtime.chatStampBroadcastTimes ??= [];
  while (times.length && times[0] <= now - 1000) times.shift();
  if (times.length >= 5) return;
  times.push(now);
  await publishChatEvent(event, roomId);
}
