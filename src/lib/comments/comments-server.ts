import { ApiRouteError } from "@/lib/api-contracts";
import {
  resolveStoredAccountAvatarCardIdentity,
} from "@/lib/account-avatar-card";
import {
  DEFAULT_ACCOUNT_AVATAR_CARD_ID,
  DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE,
  type AccountAvatarCardTrainType,
} from "@/lib/account-avatar-defaults";
import {
  createCommentReactionNotification,
  createCommentReplyNotification,
  type CommentNotificationCommentRef,
} from "@/lib/comments/notifications-server";
import {
  COMMENT_PAGE_SIZE,
  COMMENT_PREVIEW_REPLY_LIMIT,
  parseCommentReactionKey,
  type CommentAvatar,
  type CommentNode,
  type CommentReactionState,
  type CommentReactionSummary,
} from "@/lib/comments/comment-contract";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { COMMENT_REACTIONS_TABLE } from "@/lib/supabase-table-names";

const COMMENTS_TABLE = "comments";
const COMMENT_REACTION_PARTICIPANT_LIMIT = 8;

type CommentProfile = {
  username: string | null;
  avatar_card_id: number | null;
  avatar_card_server: number | null;
  avatar_card_train_type: AccountAvatarCardTrainType | null;
};

type CommentRow = {
  id: string;
  target_type: string;
  target_id: string;
  parent_id: string | null;
  root_id: string | null;
  user_id: string;
  content: string | null;
  depth: number;
  reply_count: number;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  moderation_status: string;
  profiles: CommentProfile | null;
};

type ListCommentsOptions = {
  targetType: string;
  targetId: string;
  parentId: string | null;
  rootId?: string | null;
  cursor?: string | null;
  page?: number | null;
  viewerUserId?: string | null;
};

type CommentReactionRow = {
  comment_id: string;
  emoji_key: string;
  user_id: string;
  created_at: string;
  profiles: CommentProfile | null;
};

const COMMENT_SELECT = [
  "id",
  "target_type",
  "target_id",
  "parent_id",
  "root_id",
  "user_id",
  "content",
  "depth",
  "reply_count",
  "created_at",
  "updated_at",
  "edited_at",
  "deleted_at",
  "moderation_status",
  "profiles:profiles!user_id(username, avatar_card_id, avatar_card_server, avatar_card_train_type)",
].join(", ");

function parseCursor(cursor: string | null | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const [rawCreatedAt, id] = cursor.split("|");
  const date = new Date(rawCreatedAt);
  if (!id || Number.isNaN(date.getTime())) {
    return null;
  }

  return { createdAt: date.toISOString(), id };
}

function normalizeCommentAvatarCardId(profile: CommentProfile | null): number {
  const cardId = Number(profile?.avatar_card_id);
  return Number.isInteger(cardId) && cardId > 0 ? cardId : DEFAULT_ACCOUNT_AVATAR_CARD_ID;
}

function normalizeCommentAvatarTrainType(
  profile: CommentProfile | null,
  cardId: number,
): AccountAvatarCardTrainType {
  if (cardId === DEFAULT_ACCOUNT_AVATAR_CARD_ID) {
    return DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE;
  }
  return profile?.avatar_card_train_type === "after_training" ? "after_training" : DEFAULT_ACCOUNT_AVATAR_CARD_TRAIN_TYPE;
}

function buildCommentAvatar(
  profile: CommentProfile | null,
): CommentAvatar {
  const storedCardId = normalizeCommentAvatarCardId(profile);
  const { cardId, entityServer } = resolveStoredAccountAvatarCardIdentity(
    storedCardId,
    profile?.avatar_card_server,
  );

  return {
    cardId,
    entityServer,
    trainType: normalizeCommentAvatarTrainType(profile, cardId),
  };
}

function toCommentNode(
  row: CommentRow,
  viewerUserId?: string | null,
  replyToUsernames?: Map<string, string | null>,
  reactionsByCommentId: ReadonlyMap<string, CommentReactionSummary[]> = new Map(),
): CommentNode {
  const isOwner = Boolean(viewerUserId && viewerUserId === row.user_id);
  const isDeleted = Boolean(row.deleted_at);
  const shouldShowReplyTarget = Boolean(row.parent_id && row.root_id && row.parent_id !== row.root_id);
  const reactions = reactionsByCommentId.get(row.id) ?? [];

  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    parentId: row.parent_id,
    rootId: row.root_id,
    userId: row.user_id,
    username: row.profiles?.username ?? null,
    avatar: buildCommentAvatar(row.profiles),
    content: row.content,
    depth: row.depth,
    replyCount: row.reply_count,
    reactions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    moderationStatus: row.moderation_status,
    canEdit: isOwner && !isDeleted,
    canDelete: isOwner && !isDeleted,
    replyToCommentId: shouldShowReplyTarget ? row.parent_id : null,
    replyToUsername: shouldShowReplyTarget && row.parent_id ? replyToUsernames?.get(row.parent_id) ?? null : null,
    previewReplies: [],
  };
}

async function readReplyToUsernames(rows: CommentRow[]): Promise<Map<string, string | null>> {
  const parentIds = Array.from(new Set(rows
    .filter((row) => row.parent_id && row.root_id && row.parent_id !== row.root_id)
    .map((row) => row.parent_id as string)));

  const result = new Map<string, string | null>();
  if (parentIds.length === 0) {
    return result;
  }

  const client = createServerSupabaseClient();
  const { data, error } = await client
    .from(COMMENTS_TABLE)
    .select("id, profiles:profiles!user_id(username)")
    .in("id", parentIds);

  if (error) {
    throw new ApiRouteError(500, "COMMENT_REPLY_TARGET_READ_FAILED", "无法读取被回复用户", error.message);
  }

  for (const row of (data ?? []) as unknown as Array<{ id: string; profiles: CommentProfile | null }>) {
    result.set(row.id, row.profiles?.username ?? null);
  }

  return result;
}

async function readCommentReactionsForCommentIds(
  commentIds: string[],
  viewerUserId?: string | null,
): Promise<Map<string, CommentReactionSummary[]>> {
  const uniqueCommentIds = Array.from(new Set(commentIds));
  const result = new Map<string, CommentReactionSummary[]>();
  if (uniqueCommentIds.length === 0) {
    return result;
  }

  const client = createServerSupabaseClient();
  const { data, error } = await client
    .from(COMMENT_REACTIONS_TABLE)
    .select("comment_id, emoji_key, user_id, created_at, profiles:profiles!user_id(username, avatar_card_id, avatar_card_server, avatar_card_train_type)")
    .in("comment_id", uniqueCommentIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiRouteError(500, "COMMENT_REACTIONS_READ_FAILED", "无法读取评论回应", error.message);
  }

  const reactionRows = (data ?? []) as unknown as CommentReactionRow[];
  const grouped = new Map<string, Map<string, CommentReactionSummary>>();

  for (const row of reactionRows) {
    const commentReactions = grouped.get(row.comment_id) ?? new Map<string, CommentReactionSummary>();
    grouped.set(row.comment_id, commentReactions);

    const summary = commentReactions.get(row.emoji_key) ?? {
      emojiKey: row.emoji_key,
      count: 0,
      reactedByViewer: false,
      users: [],
      remainingUserCount: 0,
    };

    summary.count += 1;
    if (viewerUserId && row.user_id === viewerUserId) {
      summary.reactedByViewer = true;
    }
    if (summary.users.length < COMMENT_REACTION_PARTICIPANT_LIMIT) {
      summary.users.push({
        userId: row.user_id,
        username: row.profiles?.username ?? null,
        avatar: buildCommentAvatar(row.profiles),
        reactedAt: row.created_at,
      });
    }
    summary.remainingUserCount = Math.max(0, summary.count - summary.users.length);
    commentReactions.set(row.emoji_key, summary);
  }

  for (const [commentId, reactions] of grouped) {
    result.set(commentId, [...reactions.values()]);
  }

  return result;
}

async function toCommentNodes(rows: CommentRow[], viewerUserId?: string | null): Promise<CommentNode[]> {
  const [replyToUsernames, reactionsByCommentId] = await Promise.all([
    readReplyToUsernames(rows),
    readCommentReactionsForCommentIds(rows.map((row) => row.id), viewerUserId),
  ]);
  return rows.map((row) => toCommentNode(
    row,
    viewerUserId,
    replyToUsernames,
    reactionsByCommentId,
  ));
}

async function fetchEarliestThreadReplies(
  rootIds: string[],
  viewerUserId?: string | null,
): Promise<Map<string, CommentNode[]>> {
  const result = new Map<string, CommentNode[]>();
  if (rootIds.length === 0) {
    return result;
  }

  const client = createServerSupabaseClient();
  await Promise.all(rootIds.map(async (rootId) => {
    const { data, error } = await client
      .from(COMMENTS_TABLE)
      .select(COMMENT_SELECT)
      .eq("root_id", rootId)
      .not("parent_id", "is", null)
      .eq("moderation_status", "visible")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(COMMENT_PREVIEW_REPLY_LIMIT);

    if (error) {
      throw new ApiRouteError(500, "COMMENT_REPLY_PREVIEW_FAILED", "无法读取回复预览", error.message);
    }

    result.set(rootId, await toCommentNodes((data ?? []) as unknown as CommentRow[], viewerUserId));
  }));

  return result;
}

async function countVisibleTargetComments(options: {
  targetType: string;
  targetId: string;
}): Promise<number> {
  const client = createServerSupabaseClient();
  const { count, error } = await client
    .from(COMMENTS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("target_type", options.targetType)
    .eq("target_id", options.targetId)
    .eq("moderation_status", "visible");

  if (error) {
    throw new ApiRouteError(500, "COMMENTS_COUNT_FAILED", "无法读取评论总数", error.message);
  }

  return count ?? 0;
}

export async function listComments(options: ListCommentsOptions): Promise<{
  comments: CommentNode[];
  nextCursor: string | null;
  hasMore: boolean;
  page: number;
  totalPages: number;
  totalCount: number;
  totalCommentCount: number;
}> {
  const client = createServerSupabaseClient();
  const cursor = parseCursor(options.cursor);
  const requestedPage = Math.max(1, Math.trunc(Number(options.page) || 1));
  const isRootCommentList = !options.rootId && options.parentId === null;
  const usePagePagination = !cursor && !options.rootId;
  let query = client
    .from(COMMENTS_TABLE)
    .select(COMMENT_SELECT, { count: "exact" })
    .eq("target_type", options.targetType)
    .eq("target_id", options.targetId)
    .eq("moderation_status", "visible")
    .order("created_at", { ascending: !isRootCommentList })
    .order("id", { ascending: !isRootCommentList });

  if (options.rootId) {
    query = query.eq("root_id", options.rootId).not("parent_id", "is", null);
  } else {
    query = options.parentId === null ? query.is("parent_id", null) : query.eq("parent_id", options.parentId);
  }

  if (cursor) {
    query = isRootCommentList
      ? query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
      : query.or(`created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`);
  }

  if (usePagePagination) {
    const offset = (requestedPage - 1) * COMMENT_PAGE_SIZE;
    query = query.range(offset, offset + COMMENT_PAGE_SIZE - 1);
  } else {
    query = query.limit(COMMENT_PAGE_SIZE + 1);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new ApiRouteError(500, "COMMENTS_READ_FAILED", "无法读取评论", error.message);
  }

  const rows = ((data ?? []) as unknown as CommentRow[]).slice(0, COMMENT_PAGE_SIZE);
  const comments = await toCommentNodes(rows, options.viewerUserId);
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / COMMENT_PAGE_SIZE));
  const totalCommentCount = usePagePagination
    ? await countVisibleTargetComments({ targetType: options.targetType, targetId: options.targetId })
    : totalCount;
  const previews = options.rootId
    ? new Map<string, CommentNode[]>()
    : await fetchEarliestThreadReplies(comments.map((comment) => comment.id), options.viewerUserId);

  for (const comment of comments) {
    comment.previewReplies = previews.get(comment.id) ?? [];
  }

  return {
    comments,
    hasMore: usePagePagination ? requestedPage < totalPages : (data?.length ?? 0) > COMMENT_PAGE_SIZE,
    nextCursor: comments.length > 0 ? `${comments[comments.length - 1].createdAt}|${comments[comments.length - 1].id}` : null,
    page: requestedPage,
    totalPages,
    totalCount,
    totalCommentCount,
  };
}

export async function createComment(options: {
  targetType: string;
  targetId: string;
  parentId?: string | null;
  userId: string;
  content: string;
}): Promise<CommentNode> {
  const client = createServerSupabaseClient();
  let parent: Pick<CommentRow, "id" | "target_type" | "target_id" | "root_id" | "user_id" | "depth"> | null = null;

  if (options.parentId) {
    const { data, error } = await client
      .from(COMMENTS_TABLE)
      .select("id, target_type, target_id, root_id, user_id, depth")
      .eq("id", options.parentId)
      .eq("target_type", options.targetType)
      .eq("target_id", options.targetId)
      .single();

    if (error || !data) {
      throw new ApiRouteError(404, "PARENT_COMMENT_NOT_FOUND", "被回复的评论不存在", error?.message);
    }

    parent = data as Pick<CommentRow, "id" | "target_type" | "target_id" | "root_id" | "user_id" | "depth">;
  }

  const { data, error } = await client
    .from(COMMENTS_TABLE)
    .insert({
      target_type: options.targetType,
      target_id: options.targetId,
      parent_id: options.parentId ?? null,
      root_id: parent?.root_id ?? null,
      depth: parent ? parent.depth + 1 : 0,
      user_id: options.userId,
      content: options.content,
    })
    .select(COMMENT_SELECT)
    .single();

  if (error || !data) {
    throw new ApiRouteError(500, "COMMENT_CREATE_FAILED", "评论发送失败", error?.message);
  }

  if (parent) {
    await createCommentReplyNotification({
      actorUserId: options.userId,
      parentComment: parent as CommentNotificationCommentRef,
      replyCommentId: (data as unknown as CommentRow).id,
    });
  }

  return (await toCommentNodes([data as unknown as CommentRow], options.userId))[0];
}

export async function listThreadReplies(options: {
  targetType: string;
  targetId: string;
  rootId: string;
  cursor?: string | null;
  viewerUserId?: string | null;
}): Promise<{
  comments: CommentNode[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  return listComments({
    targetType: options.targetType,
    targetId: options.targetId,
    parentId: null,
    rootId: options.rootId,
    cursor: options.cursor,
    viewerUserId: options.viewerUserId,
  });
}

export async function getCommentContext(options: {
  targetType: string;
  targetId: string;
  commentId: string;
  viewerUserId?: string | null;
}): Promise<{
  root: CommentNode;
  ancestors: CommentNode[];
  comment: CommentNode;
  rootPage: number;
}> {
  const client = createServerSupabaseClient();
  const { data, error } = await client
    .from(COMMENTS_TABLE)
    .select(COMMENT_SELECT)
    .eq("id", options.commentId)
    .eq("target_type", options.targetType)
    .eq("target_id", options.targetId)
    .eq("moderation_status", "visible")
    .maybeSingle();

  if (error || !data) {
    throw new ApiRouteError(404, "COMMENT_NOT_FOUND", "评论不存在", error?.message);
  }

  const commentRow = data as unknown as CommentRow;
  const chainRows: CommentRow[] = [];
  let parentId = commentRow.parent_id;
  let guard = 0;

  while (parentId && guard < 100) {
    const parentResult = await client
      .from(COMMENTS_TABLE)
      .select(COMMENT_SELECT)
      .eq("id", parentId)
      .eq("target_type", options.targetType)
      .eq("target_id", options.targetId)
      .eq("moderation_status", "visible")
      .maybeSingle();

    if (parentResult.error || !parentResult.data) {
      break;
    }

    const parentRow = parentResult.data as unknown as CommentRow;
    chainRows.unshift(parentRow);
    parentId = parentRow.parent_id;
    guard += 1;
  }

  const chainNodes = await toCommentNodes([...chainRows, commentRow], options.viewerUserId);
  const ancestors = chainNodes.slice(0, -1);
  const comment = chainNodes[chainNodes.length - 1];
  const root = ancestors[0] ?? comment;
  const rootRow = chainRows[0] ?? commentRow;
  const newerRootResult = await client
    .from(COMMENTS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("target_type", options.targetType)
    .eq("target_id", options.targetId)
    .eq("moderation_status", "visible")
    .is("parent_id", null)
    .or(`created_at.gt.${rootRow.created_at},and(created_at.eq.${rootRow.created_at},id.gt.${rootRow.id})`);

  if (newerRootResult.error) {
    throw new ApiRouteError(500, "COMMENT_ROOT_PAGE_READ_FAILED", "无法定位评论页码", newerRootResult.error.message);
  }

  return {
    root,
    ancestors,
    comment,
    rootPage: Math.floor((newerRootResult.count ?? 0) / COMMENT_PAGE_SIZE) + 1,
  };
}

export async function updateComment(options: {
  targetType: string;
  targetId: string;
  commentId: string;
  userId: string;
  content: string;
}): Promise<CommentNode> {
  const client = createServerSupabaseClient();
  const { data, error } = await client
    .from(COMMENTS_TABLE)
    .update({
      content: options.content,
      edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", options.commentId)
    .eq("target_type", options.targetType)
    .eq("target_id", options.targetId)
    .eq("user_id", options.userId)
    .is("deleted_at", null)
    .select(COMMENT_SELECT)
    .single();

  if (error || !data) {
    throw new ApiRouteError(404, "COMMENT_UPDATE_FAILED", "评论不存在或不可编辑", error?.message);
  }

  return (await toCommentNodes([data as unknown as CommentRow], options.userId))[0];
}

export async function softDeleteComment(options: {
  targetType: string;
  targetId: string;
  commentId: string;
  userId: string;
}): Promise<CommentNode> {
  const client = createServerSupabaseClient();
  const { data, error } = await client
    .from(COMMENTS_TABLE)
    .update({
      content: null,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", options.commentId)
    .eq("target_type", options.targetType)
    .eq("target_id", options.targetId)
    .eq("user_id", options.userId)
    .is("deleted_at", null)
    .select(COMMENT_SELECT)
    .single();

  if (error || !data) {
    throw new ApiRouteError(404, "COMMENT_DELETE_FAILED", "评论不存在或不可删除", error?.message);
  }

  return (await toCommentNodes([data as unknown as CommentRow], options.userId))[0];
}

async function ensureReactableComment(options: {
  targetType: string;
  targetId: string;
  commentId: string;
}): Promise<CommentNotificationCommentRef> {
  const client = createServerSupabaseClient();
  const { data, error } = await client
    .from(COMMENTS_TABLE)
    .select("id, target_type, target_id, user_id")
    .eq("id", options.commentId)
    .eq("target_type", options.targetType)
    .eq("target_id", options.targetId)
    .eq("moderation_status", "visible")
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new ApiRouteError(404, "COMMENT_NOT_FOUND", "评论不存在或不可回应", error?.message);
  }

  return data as CommentNotificationCommentRef;
}

async function readCommentReactionState(options: {
  commentId: string;
  userId: string;
}): Promise<CommentReactionState> {
  const client = createServerSupabaseClient();
  const [commentResult, reactionsByCommentId] = await Promise.all([
    client
      .from(COMMENTS_TABLE)
      .select("id")
      .eq("id", options.commentId)
      .single(),
    readCommentReactionsForCommentIds([options.commentId], options.userId),
  ]);

  if (commentResult.error || !commentResult.data) {
    throw new ApiRouteError(404, "COMMENT_NOT_FOUND", "评论不存在", commentResult.error?.message);
  }

  const reactions = reactionsByCommentId.get(options.commentId) ?? [];

  return {
    commentId: options.commentId,
    reactions,
  };
}

function isDuplicateError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23505";
}

async function insertCommentReaction(options: {
  commentId: string;
  userId: string;
  emojiKey: string;
}): Promise<boolean> {
  const client = createServerSupabaseClient();
  const { error } = await client
    .from(COMMENT_REACTIONS_TABLE)
    .insert({
      comment_id: options.commentId,
      user_id: options.userId,
      emoji_key: options.emojiKey,
    });

  if (error && !isDuplicateError(error)) {
    throw new ApiRouteError(500, "COMMENT_REACTION_FAILED", "评论回应失败", error.message);
  }

  return !error;
}

export async function reactToComment(options: {
  targetType: string;
  targetId: string;
  commentId: string;
  userId: string;
  emojiKey: string;
}): Promise<CommentReactionState> {
  parseCommentReactionKey(options.emojiKey);
  const comment = await ensureReactableComment(options);
  const inserted = await insertCommentReaction(options);
  if (inserted) {
    await createCommentReactionNotification({
      actorUserId: options.userId,
      comment,
      emojiKey: options.emojiKey,
    });
  }

  return readCommentReactionState(options);
}

export async function removeCommentReaction(options: {
  targetType: string;
  targetId: string;
  commentId: string;
  userId: string;
  emojiKey: string;
}): Promise<CommentReactionState> {
  parseCommentReactionKey(options.emojiKey);
  await ensureReactableComment(options);
  const client = createServerSupabaseClient();
  const { error } = await client
    .from(COMMENT_REACTIONS_TABLE)
    .delete()
    .eq("comment_id", options.commentId)
    .eq("user_id", options.userId)
    .eq("emoji_key", options.emojiKey);

  if (error) {
    throw new ApiRouteError(500, "COMMENT_REACTION_REMOVE_FAILED", "取消评论回应失败", error.message);
  }

  return readCommentReactionState(options);
}
