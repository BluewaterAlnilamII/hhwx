import { ApiRouteError } from "@/lib/api-contracts";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const COMMENTS_TABLE = "comments";
export const COMMENT_PAGE_SIZE = 10;
export const COMMENT_PREVIEW_REPLY_LIMIT = 1;
export const COMMENT_TARGET_BANDORI_EVENT = "bandori_event";
export const MAX_COMMENT_LENGTH = 500;

export type CommentProfile = {
  username: string | null;
};

export type CommentRow = {
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

export type CommentNode = {
  id: string;
  targetType: string;
  targetId: string;
  parentId: string | null;
  rootId: string | null;
  userId: string;
  username: string | null;
  content: string | null;
  depth: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  moderationStatus: string;
  canEdit: boolean;
  canDelete: boolean;
  previewReplies: CommentNode[];
};

type ListCommentsOptions = {
  targetType: string;
  targetId: string;
  parentId: string | null;
  cursor?: string | null;
  viewerUserId?: string | null;
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
  "profiles:profiles!user_id(username)",
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

function toCommentNode(row: CommentRow, viewerUserId?: string | null): CommentNode {
  const isOwner = Boolean(viewerUserId && viewerUserId === row.user_id);
  const isDeleted = Boolean(row.deleted_at);

  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    parentId: row.parent_id,
    rootId: row.root_id,
    userId: row.user_id,
    username: row.profiles?.username ?? null,
    content: row.content,
    depth: row.depth,
    replyCount: row.reply_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    moderationStatus: row.moderation_status,
    canEdit: isOwner && !isDeleted,
    canDelete: isOwner && !isDeleted,
    previewReplies: [],
  };
}

async function fetchEarliestDirectReplies(
  parentIds: string[],
  viewerUserId?: string | null,
): Promise<Map<string, CommentNode[]>> {
  const result = new Map<string, CommentNode[]>();
  if (parentIds.length === 0) {
    return result;
  }

  const client = createServerSupabaseClient();
  await Promise.all(parentIds.map(async (parentId) => {
    const { data, error } = await client
      .from(COMMENTS_TABLE)
      .select(COMMENT_SELECT)
      .eq("parent_id", parentId)
      .eq("moderation_status", "visible")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(COMMENT_PREVIEW_REPLY_LIMIT);

    if (error) {
      throw new ApiRouteError(500, "COMMENT_REPLY_PREVIEW_FAILED", "无法读取回复预览", error.message);
    }

    result.set(parentId, ((data ?? []) as unknown as CommentRow[]).map((row) => toCommentNode(row, viewerUserId)));
  }));

  return result;
}

export async function listComments(options: ListCommentsOptions): Promise<{
  comments: CommentNode[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const client = createServerSupabaseClient();
  const cursor = parseCursor(options.cursor);
  let query = client
    .from(COMMENTS_TABLE)
    .select(COMMENT_SELECT)
    .eq("target_type", options.targetType)
    .eq("target_id", options.targetId)
    .eq("moderation_status", "visible")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(COMMENT_PAGE_SIZE + 1);

  query = options.parentId === null ? query.is("parent_id", null) : query.eq("parent_id", options.parentId);
  if (cursor) {
    query = query.or(`created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`);
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiRouteError(500, "COMMENTS_READ_FAILED", "无法读取评论", error.message);
  }

  const rows = ((data ?? []) as unknown as CommentRow[]).slice(0, COMMENT_PAGE_SIZE);
  const comments = rows.map((row) => toCommentNode(row, options.viewerUserId));
  const previews = await fetchEarliestDirectReplies(comments.map((comment) => comment.id), options.viewerUserId);

  for (const comment of comments) {
    comment.previewReplies = previews.get(comment.id) ?? [];
  }

  return {
    comments,
    hasMore: (data?.length ?? 0) > COMMENT_PAGE_SIZE,
    nextCursor: comments.length > 0 ? `${comments[comments.length - 1].createdAt}|${comments[comments.length - 1].id}` : null,
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
  let parent: Pick<CommentRow, "id" | "target_type" | "target_id" | "root_id" | "depth"> | null = null;

  if (options.parentId) {
    const { data, error } = await client
      .from(COMMENTS_TABLE)
      .select("id, target_type, target_id, root_id, depth")
      .eq("id", options.parentId)
      .eq("target_type", options.targetType)
      .eq("target_id", options.targetId)
      .single();

    if (error || !data) {
      throw new ApiRouteError(404, "PARENT_COMMENT_NOT_FOUND", "被回复的评论不存在", error?.message);
    }

    parent = data as Pick<CommentRow, "id" | "target_type" | "target_id" | "root_id" | "depth">;
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

  return toCommentNode(data as unknown as CommentRow, options.userId);
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
}> {
  const client = createServerSupabaseClient();
  const { data, error } = await client
    .from(COMMENTS_TABLE)
    .select(COMMENT_SELECT)
    .eq("id", options.commentId)
    .eq("target_type", options.targetType)
    .eq("target_id", options.targetId)
    .eq("moderation_status", "visible")
    .single();

  if (error || !data) {
    throw new ApiRouteError(404, "COMMENT_NOT_FOUND", "评论不存在", error?.message);
  }

  const comment = toCommentNode(data as unknown as CommentRow, options.viewerUserId);
  const chainRows: CommentRow[] = [];
  let parentId = comment.parentId;
  let guard = 0;

  while (parentId && guard < 100) {
    const parentResult = await client
      .from(COMMENTS_TABLE)
      .select(COMMENT_SELECT)
      .eq("id", parentId)
      .eq("target_type", options.targetType)
      .eq("target_id", options.targetId)
      .eq("moderation_status", "visible")
      .single();

    if (parentResult.error || !parentResult.data) {
      break;
    }

    const parentRow = parentResult.data as unknown as CommentRow;
    chainRows.unshift(parentRow);
    parentId = parentRow.parent_id;
    guard += 1;
  }

  const ancestors = chainRows.map((row) => toCommentNode(row, options.viewerUserId));
  const root = ancestors[0] ?? comment;

  return { root, ancestors, comment };
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

  return toCommentNode(data as unknown as CommentRow, options.userId);
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

  return toCommentNode(data as unknown as CommentRow, options.userId);
}
