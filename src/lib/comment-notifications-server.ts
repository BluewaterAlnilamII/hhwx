import { ApiRouteError } from "@/lib/api-contracts";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { COMMENT_NOTIFICATIONS_TABLE } from "@/lib/supabase-table-names";

export type CommentNotificationType = "comment_reply" | "comment_reaction";

export type CommentNotificationCommentRef = {
  id: string;
  target_type: string;
  target_id: string;
  user_id: string;
};

type CommentNotificationProfile = {
  username: string | null;
};

type CommentNotificationRow = {
  id: string;
  recipient_user_id: string;
  actor_user_id: string | null;
  type: CommentNotificationType;
  target_type: string;
  target_id: string;
  comment_id: string;
  activity_comment_id: string | null;
  reaction_emoji_key: string | null;
  read_at: string | null;
  created_at: string;
  profiles: CommentNotificationProfile | null;
};

export type CommentNotification = {
  id: string;
  recipientUserId: string;
  actorUserId: string | null;
  actorUsername: string | null;
  type: CommentNotificationType;
  targetType: string;
  targetId: string;
  commentId: string;
  activityCommentId: string | null;
  reactionEmojiKey: string | null;
  linkCommentId: string;
  readAt: string | null;
  createdAt: string;
};

const NOTIFICATION_PAGE_SIZE = 20;
const NOTIFICATION_SELECT = [
  "id",
  "recipient_user_id",
  "actor_user_id",
  "type",
  "target_type",
  "target_id",
  "comment_id",
  "activity_comment_id",
  "reaction_emoji_key",
  "read_at",
  "created_at",
  "profiles:profiles!actor_user_id(username)",
].join(", ");
export function parseCommentNotificationType(value: string | null | undefined): CommentNotificationType | null {
  return value === "comment_reply" || value === "comment_reaction" ? value : null;
}

function parseCursor(cursor: string | null | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const [rawCreatedAt, id] = cursor.split("|");
  const date = new Date(rawCreatedAt);
  if (!id || Number.isNaN(date.getTime())) {
    return null;
  }

  return { createdAt: date.toISOString(), id };
}

function isDuplicateError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23505";
}

function toNotification(row: CommentNotificationRow): CommentNotification {
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    actorUserId: row.actor_user_id,
    actorUsername: row.profiles?.username ?? null,
    type: row.type,
    targetType: row.target_type,
    targetId: row.target_id,
    commentId: row.comment_id,
    activityCommentId: row.activity_comment_id,
    reactionEmojiKey: row.reaction_emoji_key ?? null,
    linkCommentId: row.activity_comment_id ?? row.comment_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

async function insertNotification(row: {
  recipient_user_id: string;
  actor_user_id: string;
  type: CommentNotificationType;
  target_type: string;
  target_id: string;
  comment_id: string;
  activity_comment_id?: string | null;
  reaction_emoji_key?: string | null;
}): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from(COMMENT_NOTIFICATIONS_TABLE)
    .insert(row);

  if (error && !isDuplicateError(error)) {
    throw new ApiRouteError(500, "COMMENT_NOTIFICATION_CREATE_FAILED", "提醒创建失败", error.message);
  }
}

export async function createCommentReplyNotification(options: {
  actorUserId: string;
  parentComment: CommentNotificationCommentRef;
  replyCommentId: string;
}): Promise<void> {
  if (options.parentComment.user_id === options.actorUserId) {
    return;
  }

  await insertNotification({
    recipient_user_id: options.parentComment.user_id,
    actor_user_id: options.actorUserId,
    type: "comment_reply",
    target_type: options.parentComment.target_type,
    target_id: options.parentComment.target_id,
    comment_id: options.parentComment.id,
    activity_comment_id: options.replyCommentId,
  });
}

export async function createCommentReactionNotification(options: {
  actorUserId: string;
  comment: CommentNotificationCommentRef;
  emojiKey: string;
}): Promise<void> {
  if (options.comment.user_id === options.actorUserId) {
    return;
  }

  await insertNotification({
    recipient_user_id: options.comment.user_id,
    actor_user_id: options.actorUserId,
    type: "comment_reaction",
    target_type: options.comment.target_type,
    target_id: options.comment.target_id,
    comment_id: options.comment.id,
    activity_comment_id: null,
    reaction_emoji_key: options.emojiKey,
  });
}

export async function listCommentNotifications(options: {
  userId: string;
  type?: CommentNotificationType | null;
  cursor?: string | null;
}): Promise<{
  notifications: CommentNotification[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const client = createServerSupabaseClient();
  const cursor = parseCursor(options.cursor);
  let query = client
    .from(COMMENT_NOTIFICATIONS_TABLE)
    .select(NOTIFICATION_SELECT)
    .eq("recipient_user_id", options.userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE + 1);

  if (options.type) {
    query = query.eq("type", options.type);
  }

  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiRouteError(500, "COMMENT_NOTIFICATIONS_READ_FAILED", "提醒读取失败", error.message);
  }

  const rows = ((data ?? []) as unknown as CommentNotificationRow[]).slice(0, NOTIFICATION_PAGE_SIZE);
  const notifications = rows.map(toNotification);

  return {
    notifications,
    hasMore: (data?.length ?? 0) > NOTIFICATION_PAGE_SIZE,
    nextCursor: notifications.length > 0
      ? `${notifications[notifications.length - 1].createdAt}|${notifications[notifications.length - 1].id}`
      : null,
  };
}

export async function countUnreadCommentNotifications(userId: string): Promise<number> {
  const client = createServerSupabaseClient();
  const { count, error } = await client
    .from(COMMENT_NOTIFICATIONS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", userId)
    .is("read_at", null);

  if (error) {
    throw new ApiRouteError(500, "COMMENT_NOTIFICATION_COUNT_FAILED", "未读提醒读取失败", error.message);
  }

  return count ?? 0;
}

export async function markCommentNotificationRead(options: {
  userId: string;
  notificationId: string;
}): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from(COMMENT_NOTIFICATIONS_TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq("id", options.notificationId)
    .eq("recipient_user_id", options.userId);

  if (error) {
    throw new ApiRouteError(500, "COMMENT_NOTIFICATION_UPDATE_FAILED", "提醒状态更新失败", error.message);
  }
}

export async function markAllCommentNotificationsRead(userId: string): Promise<void> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from(COMMENT_NOTIFICATIONS_TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_user_id", userId)
    .is("read_at", null);

  if (error) {
    throw new ApiRouteError(500, "COMMENT_NOTIFICATIONS_UPDATE_FAILED", "提醒状态更新失败", error.message);
  }
}
