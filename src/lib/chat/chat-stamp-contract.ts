import type { CommentStamp } from "../comments/stamps";
import { CHAT_UUID } from "./chat-contract";

export type ChatStampReference = Pick<CommentStamp, "id" | "region" | "kind">;
export type ChatStampPublication = {
  type: "stamp.sent";
  id: string;
  userId: string;
  publicUid: number;
  username: string;
  stamp: ChatStampReference;
};
export type ChatStampSendResult = { nextStampAt: string | null };

export function parseChatStampReference(value: unknown): ChatStampReference | null {
  if (!value || typeof value !== "object") return null;
  const s = value as ChatStampReference;
  return Number.isSafeInteger(s.id) && s.id > 0 && ["jp", "en", "tw", "cn"].includes(s.region)
    && (s.kind === "normal" || s.kind === "changed") ? { id: s.id, region: s.region, kind: s.kind } : null;
}

export function parseChatStampPublication(value: unknown): ChatStampPublication | null {
  if (!value || typeof value !== "object") return null;
  const e = value as ChatStampPublication;
  const stamp = parseChatStampReference(e.stamp);
  return e.type === "stamp.sent" && typeof e.id === "string" && CHAT_UUID.test(e.id)
    && typeof e.userId === "string" && CHAT_UUID.test(e.userId)
    && Number.isSafeInteger(e.publicUid) && e.publicUid > 0
    && typeof e.username === "string" && e.username.length <= 96 && stamp
    ? { type: e.type, id: e.id, userId: e.userId, publicUid: e.publicUid, username: e.username, stamp } : null;
}
