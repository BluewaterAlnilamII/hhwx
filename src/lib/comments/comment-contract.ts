import type { AccountAvatarCardTrainType } from "@/lib/account-avatar-defaults";
import { ApiRouteError } from "@/lib/api-contracts";
import type { BandoriServer } from "@/lib/bandori-server";
import { COMMENT_EMOJI_NAME_SET } from "@/lib/comments/emoji";

export const COMMENT_PAGE_SIZE = 10;
export const COMMENT_PREVIEW_REPLY_LIMIT = 3;
export const COMMENT_REACTION_PARTICIPANT_PAGE_SIZE = 50;
export const MAX_COMMENT_LENGTH = 1_000;
export const COMMENT_LENGTH_WARNING_THRESHOLD = 920;

export function countCommentCharacters(value: string): number {
  return Array.from(value).length;
}

export function truncateCommentContent(
  value: string,
  maxLength = MAX_COMMENT_LENGTH,
): string {
  const characters = Array.from(value);
  return characters.length <= maxLength
    ? value
    : characters.slice(0, maxLength).join("");
}

export type CommentNotificationType = "comment_reply" | "comment_reaction";

type BaseCommentNotification = {
  id: string;
  recipientUserId: string;
  actorUserId: string | null;
  actorUsername: string | null;
  targetType: string;
  targetId: string;
  commentId: string;
  linkCommentId: string;
  readAt: string | null;
  createdAt: string;
};

export type CommentReplyNotification = BaseCommentNotification & {
  type: "comment_reply";
  activityCommentId: string;
  reactionEmojiKey: null;
};

export type CommentReactionNotification = BaseCommentNotification & {
  type: "comment_reaction";
  activityCommentId: null;
  reactionEmojiKey: string;
};

export type CommentNotification = CommentReplyNotification | CommentReactionNotification;

export type CommentNotificationListResponse = {
  notifications: CommentNotification[];
  nextCursor: string | null;
  hasMore: boolean;
};

const COMMENT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const COMMENT_REACTION_TIMESTAMP_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;
const POSITIVE_INTEGER_TOKEN_PATTERN = /^[1-9]\d*$/u;

function isValidCommentReactionTimestamp(value: string): boolean {
  const match = COMMENT_REACTION_TIMESTAMP_PATTERN.exec(value);
  if (!match || Number.isNaN(new Date(value).getTime())) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return year > 0 && day <= daysInMonth[month - 1];
}

export function parseCommentNotificationType(
  value: string | null | undefined,
): CommentNotificationType | null {
  return value === "comment_reply" || value === "comment_reaction" ? value : null;
}

export type CommentAvatar = {
  cardId: number;
  entityServer: BandoriServer | null;
  trainType: AccountAvatarCardTrainType;
};

export type CommentReactionParticipant = {
  userId: string;
  username: string | null;
  avatar: CommentAvatar;
  reactedAt: string;
};

export type CommentReactionSummary = {
  emojiKey: string;
  count: number;
  reactedByViewer: boolean;
  users: CommentReactionParticipant[];
  remainingUserCount: number;
};

export type CommentReactionParticipantCursor = {
  reactedAt: string;
  userId: string;
};

export function buildCommentReactionParticipantCursor(
  cursor: CommentReactionParticipantCursor,
): string {
  if (
    !isValidCommentReactionTimestamp(cursor.reactedAt)
    || !COMMENT_UUID_PATTERN.test(cursor.userId)
  ) {
    throw new Error("Cannot build an invalid comment reaction participant cursor");
  }

  return `${cursor.reactedAt}|${cursor.userId}`;
}

export type CommentReactionParticipantListResponse = {
  commentId: string;
  emojiKey: string;
  users: CommentReactionParticipant[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CommentNode = {
  id: string;
  targetType: string;
  targetId: string;
  parentId: string | null;
  rootId: string | null;
  userId: string;
  username: string | null;
  avatar: CommentAvatar;
  content: string | null;
  depth: number;
  replyCount: number;
  reactions: CommentReactionSummary[];
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  moderationStatus: string;
  canEdit: boolean;
  canDelete: boolean;
  replyToCommentId: string | null;
  replyToUsername: string | null;
  previewReplies: CommentNode[];
};

export type CommentListResponse = {
  comments: CommentNode[];
  nextCursor: string | null;
  hasMore: boolean;
  page?: number;
  totalPages?: number;
  totalCount?: number;
  totalCommentCount?: number;
};

export type CommentContextResponse = {
  root: CommentNode;
  ancestors: CommentNode[];
  comment: CommentNode;
  rootPage: number;
};

export type CommentReactionState = {
  commentId: string;
  reactions: CommentReactionSummary[];
};

export function parseCommentContent(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiRouteError(400, "INVALID_COMMENT_CONTENT", "评论内容无效");
  }

  const content = value.trim();
  if (!content) {
    throw new ApiRouteError(400, "EMPTY_COMMENT", "评论内容不能为空");
  }

  if (countCommentCharacters(content) > MAX_COMMENT_LENGTH) {
    throw new ApiRouteError(400, "COMMENT_TOO_LONG", `评论内容不能超过 ${MAX_COMMENT_LENGTH} 个字符`);
  }

  return content;
}

export function parseCommentReactionKey(value: unknown): string {
  if (typeof value !== "string" || !COMMENT_EMOJI_NAME_SET.has(value)) {
    throw new ApiRouteError(400, "INVALID_COMMENT_REACTION", "评论回应无效");
  }

  return value;
}

export function parseCommentReactionParticipantCursor(
  value: string | null | undefined,
): CommentReactionParticipantCursor | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parts = value.split("|");
  if (parts.length !== 2) {
    throw new ApiRouteError(400, "INVALID_COMMENT_REACTION_CURSOR", "评论回应游标无效");
  }

  const [rawReactedAt, userId] = parts;
  if (
    !isValidCommentReactionTimestamp(rawReactedAt)
    || !COMMENT_UUID_PATTERN.test(userId)
  ) {
    throw new ApiRouteError(400, "INVALID_COMMENT_REACTION_CURSOR", "评论回应游标无效");
  }

  return {
    // Keep PostgreSQL microseconds intact so the next keyset page starts
    // strictly after the exact row used to create the cursor.
    reactedAt: rawReactedAt,
    userId,
  };
}

export function parseCommentId(value: unknown): string {
  if (typeof value !== "string" || !COMMENT_UUID_PATTERN.test(value)) {
    throw new ApiRouteError(400, "INVALID_COMMENT_ID", "评论 ID 无效");
  }

  return value;
}

export function parseParentCommentId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !COMMENT_UUID_PATTERN.test(value)) {
    throw new ApiRouteError(400, "INVALID_PARENT_COMMENT_ID", "被回复的评论 ID 无效");
  }

  return value;
}

export function parseCommentPage(value: string | null): number {
  const token = value ?? "1";
  if (!POSITIVE_INTEGER_TOKEN_PATTERN.test(token)) {
    throw new ApiRouteError(400, "INVALID_COMMENT_PAGE", "评论页码无效");
  }

  const page = Number(token);
  if (!Number.isSafeInteger(page)) {
    throw new ApiRouteError(400, "INVALID_COMMENT_PAGE", "评论页码无效");
  }

  return page;
}
