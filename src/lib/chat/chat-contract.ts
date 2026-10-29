import type { AccountAvatarCardTrainType } from "@/lib/account-avatar-defaults";
import type { BandoriServer } from "@/lib/bandori-server";
import { isChatImage, type ChatImage } from "./chat-image-contract";

export const CHAT_DEFAULT_ROOM_ID = "main";
export const chatChannel = (roomId: string) => `chat:${roomId}`;
export const chatActivityChannel = (roomId: string) => `chat_activity:${roomId}`;
export const chatMentionChannel = (userId: string) => `chat_mentions:${userId}`;
export const CHAT_CHANNEL = chatChannel(CHAT_DEFAULT_ROOM_ID);
export const CHAT_MAX_LENGTH = 1000;
export const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const CHAT_UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

export type ChatReply = { id: string; deleted: true } | {
  id: string; deleted: false; username: string; content: string; image: boolean; createdAt: string;
};
export type ChatReaction = { emojiKey: string; count: number; reactedByViewer: boolean };
export type ChatReactionEvent = { type: "message.reactions"; messageId: string; version: number;
  reactions: { emojiKey: string; count: number }[]; userId: string; ownEmojiKeys: string[] };

export type ChatMessage = {
  id: string;
  clientRequestId: string;
  content: string;
  mentions?: ChatMention[];
  image?: ChatImage | null;
  createdAt: string;
  reply?: ChatReply | null;
  reactions?: ChatReaction[];
  reactionsVersion?: number;
  reactionsViewerId?: string | null;
  /** Client-only revision for the viewer's complete selection, independent of aggregate arrival order. */
  viewerReactionsVersion?: number;
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
export type ChatActivity = { latest: ChatCursor | null; latestOther: ChatCursor | null };
export type ChatPage = { messages: ChatMessage[]; nextCursor: ChatCursor | null; activity?: ChatActivity };
export type ChatNewerPage = { messages: ChatMessage[]; hasMore: boolean };
export type ChatViewer = { userId: string; canModerate: boolean; mutedUntil: string | null; nextSendAt: string | null };
export type ChatMention = { userId: string; start: number; end: number };
export type ChatMentionNotice = ChatCursor & { username: string };
export type ChatMentionInbox = { items: ChatMentionNotice[]; total: number };
export type ChatMentionAcknowledgement = { type: "mentions.changed"; roomId: string; acknowledgedMessageIds: string[] };
export function parseChatMentionAcknowledgement(value: unknown): ChatMentionAcknowledgement | null {
  if (!value || typeof value !== "object") return null;
  const event = value as ChatMentionAcknowledgement;
  return event.type === "mentions.changed" && typeof event.roomId === "string"
    && Array.isArray(event.acknowledgedMessageIds) && event.acknowledgedMessageIds.length > 0 && event.acknowledgedMessageIds.length <= 50
    && event.acknowledgedMessageIds.every(id => typeof id === "string" && CHAT_UUID.test(id)) ? event : null;
}
export type ChatMentionUser = ChatMessage["author"];
export type ChatRecentMentionUser = ChatMentionUser & { lastMessageAt: string };
export type ChatPresenceConnection = { clientId: string; user: ChatMentionUser };
export type ChatPresenceEvent = { type: "join"; connection: ChatPresenceConnection } | { type: "leave"; clientId: string };
export type ChatConnection = { token: string; url: string; channel: string; activityChannel: string; mentionChannel?: string; subscriptionToken: string; viewer: ChatViewer };
export type ChatActivityEvent = { type: "message.created"; cursor: ChatCursor; userId: string }
  | { type: "message.deleted"; messageId: string };
export type ChatEvent = { type: "message.created"; message: ChatMessage }
  | { type: "message.deleted"; messageId: string; deletedAt: string }
  | ChatReactionEvent;
export type ChatSendResult = { messageId: string; clientRequestId: string; message: ChatMessage | null; deleted: boolean; nextSendAt: string | null };

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as ChatMessage;
  return typeof m.id === "string" && CHAT_UUID.test(m.id)
    && typeof m.clientRequestId === "string" && CHAT_UUID.test(m.clientRequestId)
    && typeof m.content === "string" && [...m.content].length <= CHAT_MAX_LENGTH
    && (m.mentions === undefined || isChatMentions(m.mentions, m.content))
    && (m.image == null || (m.content === "" && isChatImage(m.image)))
    && typeof m.createdAt === "string" && Number.isFinite(Date.parse(m.createdAt))
    && (m.reply == null || isChatReply(m.reply))
    && (m.reactionsVersion === undefined || (Number.isSafeInteger(m.reactionsVersion) && m.reactionsVersion >= 0))
    && (m.reactionsViewerId == null || (typeof m.reactionsViewerId === "string" && CHAT_UUID.test(m.reactionsViewerId)))
    && (m.reactions === undefined || (Array.isArray(m.reactions) && m.reactions.every(r => isReactionCount(r) && typeof r.reactedByViewer === "boolean")))
    && isChatMentionUser(m.author);
}

export function isChatMentionUser(value: unknown): value is ChatMentionUser {
  if (!value || typeof value !== "object") return false;
  const a = value as ChatMentionUser;
  return typeof a.userId === "string" && CHAT_UUID.test(a.userId)
    && typeof a.username === "string" && a.username.length <= 96
    && Number.isSafeInteger(a.publicUid) && a.publicUid > 0
    && Number.isInteger(a.avatarCardId) && a.avatarCardId > 0
    && (a.avatarCardServer === null || [0, 1, 2, 3].includes(a.avatarCardServer))
    && (a.avatarCardTrainType === "normal" || a.avatarCardTrainType === "after_training");
}

export function isChatReply(value: unknown): value is ChatReply {
  if (!value || typeof value !== "object") return false;
  const r = value as ChatReply;
  return typeof r.id === "string" && CHAT_UUID.test(r.id) && (r.deleted === true || (r.deleted === false
    && typeof r.username === "string" && r.username.length <= 96 && typeof r.content === "string" && [...r.content].length <= 160
    && typeof r.image === "boolean" && typeof r.createdAt === "string" && Number.isFinite(Date.parse(r.createdAt))));
}
export function isChatMentions(value: unknown, content: string): value is ChatMention[] {
  const text = [...content];
  let lastEnd = 0;
  return Array.isArray(value) && value.length <= 500 && value.every(m => {
    if (!m || typeof m !== "object" || typeof m.userId !== "string" || !CHAT_UUID.test(m.userId)
      || !Number.isSafeInteger(m.start) || !Number.isSafeInteger(m.end) || m.start < lastEnd
      || m.end <= m.start + 1 || m.end > text.length || text[m.start] !== "@") return false;
    lastEnd = m.end; return true;
  });
}
function isReactionCount(value: unknown): value is ChatReaction {
  if (!value || typeof value !== "object") return false;
  const r = value as ChatReaction;
  return typeof r.emojiKey === "string" && /^[A-Za-z0-9_+-]{1,64}$/u.test(r.emojiKey) && Number.isSafeInteger(r.count) && r.count > 0;
}

export function parseChatEvent(value: unknown): ChatEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as ChatEvent;
  if (event.type === "message.created" && isChatMessage(event.message)) return event;
  if (event.type === "message.reactions" && typeof event.messageId === "string" && CHAT_UUID.test(event.messageId)
    && Number.isSafeInteger(event.version) && event.version >= 0 && Array.isArray(event.reactions) && event.reactions.every(isReactionCount)
    && typeof event.userId === "string" && CHAT_UUID.test(event.userId) && Array.isArray(event.ownEmojiKeys)
    && event.ownEmojiKeys.every(key => typeof key === "string" && /^[A-Za-z0-9_+-]{1,64}$/u.test(key))) return event;
  if (event.type === "message.deleted" && typeof event.messageId === "string" && CHAT_UUID.test(event.messageId)
    && typeof event.deletedAt === "string" && Number.isFinite(Date.parse(event.deletedAt))) return event;
  return null;
}

export function compareChatMessages(a: ChatCursor, b: ChatCursor): number {
  // SQL returns fixed-width UTC microseconds; Date would discard cursor precision.
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export function isChatCursor(value: unknown): value is ChatCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as ChatCursor;
  return typeof cursor.id === "string" && CHAT_UUID.test(cursor.id)
    && typeof cursor.createdAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/u.test(cursor.createdAt)
    && Number.isFinite(Date.parse(cursor.createdAt));
}

export function parseChatActivityEvent(value: unknown): ChatActivityEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as ChatActivityEvent;
  if (event.type === "message.created" && isChatCursor(event.cursor) && typeof event.userId === "string" && CHAT_UUID.test(event.userId)) return event;
  if (event.type === "message.deleted" && typeof event.messageId === "string" && CHAT_UUID.test(event.messageId)) return event;
  return null;
}
