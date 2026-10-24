import type { AccountAvatarCardTrainType } from "@/lib/account-avatar-defaults";
import type { BandoriServer } from "@/lib/bandori-server";
import { isChatImage, type ChatImage } from "./chat-image-contract";

export const CHAT_DEFAULT_ROOM_ID = "main";
export const chatChannel = (roomId: string) => `chat:${roomId}`;
export const CHAT_CHANNEL = chatChannel(CHAT_DEFAULT_ROOM_ID);
export const CHAT_MAX_LENGTH = 1000;
export const CHAT_WINDOW_SIZE = 300;
export const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const CHAT_UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

export type ChatMessage = {
  id: string;
  clientRequestId: string;
  content: string;
  image?: ChatImage | null;
  createdAt: string;
  author: {
    userId: string;
    username: string;
    publicUid: number;
    avatarCardId: number;
    avatarCardServer: BandoriServer | null;
    avatarCardTrainType: AccountAvatarCardTrainType;
  };
};
export type ChatCursor = { createdAt: string; id: string };
export type ChatPage = { messages: ChatMessage[]; nextCursor: ChatCursor | null };
export type ChatViewer = { userId: string; canModerate: boolean; mutedUntil: string | null; nextSendAt: string | null };
export type ChatConnection = { token: string; url: string; channel?: string; viewer: ChatViewer };
export type ChatEvent = { type: "message.created"; message: ChatMessage }
  | { type: "message.deleted"; messageId: string; deletedAt: string };
export type ChatSendResult = { messageId: string; clientRequestId: string; message: ChatMessage | null; deleted: boolean; nextSendAt: string | null };

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as ChatMessage;
  const a = m.author;
  return typeof m.id === "string" && CHAT_UUID.test(m.id)
    && typeof m.clientRequestId === "string" && CHAT_UUID.test(m.clientRequestId)
    && typeof m.content === "string" && [...m.content].length <= CHAT_MAX_LENGTH
    && (m.image == null || (m.content === "" && isChatImage(m.image)))
    && typeof m.createdAt === "string" && Number.isFinite(Date.parse(m.createdAt))
    && !!a && typeof a.userId === "string" && CHAT_UUID.test(a.userId)
    && typeof a.username === "string" && a.username.length <= 96
    && Number.isSafeInteger(a.publicUid) && a.publicUid > 0
    && Number.isInteger(a.avatarCardId) && a.avatarCardId > 0
    && (a.avatarCardServer === null || [0, 1, 2, 3].includes(a.avatarCardServer))
    && (a.avatarCardTrainType === "normal" || a.avatarCardTrainType === "after_training");
}

export function parseChatEvent(value: unknown): ChatEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as ChatEvent;
  if (event.type === "message.created" && isChatMessage(event.message)) return event;
  if (event.type === "message.deleted" && typeof event.messageId === "string" && CHAT_UUID.test(event.messageId)
    && typeof event.deletedAt === "string" && Number.isFinite(Date.parse(event.deletedAt))) return event;
  return null;
}

export function compareChatMessages(a: ChatMessage, b: ChatMessage): number {
  // SQL returns fixed-width UTC microseconds; Date would discard cursor precision.
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
