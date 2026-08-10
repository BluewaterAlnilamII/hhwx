import type { AccountAvatarCardTrainType } from "@/lib/account-avatar-defaults";
import { ApiRouteError } from "@/lib/api-contracts";
import type { BandoriServer } from "@/lib/bandori-server";
import { COMMENT_EMOJI_NAME_SET } from "@/lib/comment-emojis";

export const COMMENT_PAGE_SIZE = 10;
export const COMMENT_PREVIEW_REPLY_LIMIT = 3;
export const MAX_COMMENT_LENGTH = 500;

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
const POSITIVE_INTEGER_TOKEN_PATTERN = /^[1-9]\d*$/u;

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

  if (Array.from(content).length > MAX_COMMENT_LENGTH) {
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
