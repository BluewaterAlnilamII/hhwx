"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Edit3, Link2, MessageSquare, MoreHorizontal, Reply, Trash2, X } from "lucide-react";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { getSafeSession } from "@/lib/supabase";
import { getUsernameAvatarLabel } from "@/lib/username-policy";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/store/useGameStore";

type CommentNode = {
  id: string;
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
  canEdit: boolean;
  canDelete: boolean;
  previewReplies: CommentNode[];
};

type CommentListResponse = {
  comments: CommentNode[];
  nextCursor: string | null;
  hasMore: boolean;
};

type CommentContextResponse = {
  root: CommentNode;
  ancestors: CommentNode[];
  comment: CommentNode;
};

const MAX_DEPTH_INDENT = 5;

function getErrorMessage(payload: unknown, fallback: string): string {
  return getApiErrorMessage(payload) ?? fallback;
}

function formatCommentTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildFocusedTree(context: CommentContextResponse): CommentNode {
  const chain = context.ancestors.length > 0 ? [...context.ancestors, context.comment] : [context.comment];
  const root: CommentNode = { ...context.root, previewReplies: [] };
  let cursor = root;

  for (const item of chain.slice(root.id === chain[0]?.id ? 1 : 0)) {
    const next: CommentNode = { ...item, previewReplies: [] };
    cursor.previewReplies = [next];
    cursor = next;
  }

  return root;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  const data = parseApiSuccessData<T>(payload);
  if (!response.ok || data === null) {
    throw new Error(getErrorMessage(payload, `请求失败（HTTP ${response.status}）`));
  }

  return data;
}

async function authHeaders(): Promise<HeadersInit> {
  const session = await getSafeSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function replaceComment(nodes: CommentNode[], updated: CommentNode): CommentNode[] {
  return nodes.map((node) => {
    if (node.id === updated.id) {
      return { ...updated, previewReplies: node.previewReplies };
    }

    return { ...node, previewReplies: replaceComment(node.previewReplies, updated) };
  });
}

function findComment(nodes: CommentNode[], commentId: string): CommentNode | null {
  for (const node of nodes) {
    if (node.id === commentId) {
      return node;
    }

    const nested = findComment(node.previewReplies, commentId);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function appendUniqueComment(nodes: CommentNode[], next: CommentNode): CommentNode[] {
  if (nodes.some((node) => node.id === next.id)) {
    return nodes;
  }

  return [...nodes, next];
}

function bumpReplyCount(nodes: CommentNode[], parentId: string, child: CommentNode): CommentNode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      const hasPreview = node.previewReplies.some((reply) => reply.id === child.id);
      return {
        ...node,
        replyCount: node.replyCount + 1,
        previewReplies: node.replyCount === 0 && !hasPreview ? [child] : node.previewReplies,
      };
    }

    return { ...node, previewReplies: bumpReplyCount(node.previewReplies, parentId, child) };
  });
}

type ComposerProps = {
  placeholder: string;
  submitLabel: string;
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
};

function CommentComposer({ placeholder, submitLabel, onSubmit, onCancel, autoFocus = false }: ComposerProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(content.trim());
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-sky-100 bg-white/82 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/72">
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={500}
        autoFocus={autoFocus}
        className="min-h-[5.25rem] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/20"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className={cn("text-xs", content.length > 460 ? "text-amber-600" : "text-slate-400")}>
          {content.length}/500
        </span>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <X size={14} />
              取消
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Check size={14} />
            {submitting ? "发送中" : submitLabel}
          </button>
        </div>
      </div>
      {error ? <div className="mt-2 text-xs text-red-500">{error}</div> : null}
    </div>
  );
}

type CommentItemProps = {
  comment: CommentNode;
  eventId: number;
  highlightedId: string | null;
  replies: Record<string, CommentListResponse>;
  loadingReplies: Record<string, boolean>;
  onCreateReply: (parentId: string, content: string) => Promise<void>;
  onUpdate: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onLoadReplies: (commentId: string, cursor?: string | null) => Promise<void>;
};

function CommentItem({
  comment,
  eventId,
  highlightedId,
  replies,
  loadingReplies,
  onCreateReply,
  onUpdate,
  onDelete,
  onLoadReplies,
}: CommentItemProps) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment.content ?? "");
  const [actionError, setActionError] = useState("");
  const loadedReplies = replies[comment.id];
  const visibleReplies = loadedReplies?.comments ?? comment.previewReplies;
  const hiddenReplyCount = Math.max(0, comment.replyCount - visibleReplies.length);
  const indentDepth = Math.min(comment.depth, MAX_DEPTH_INDENT);
  const isHighlighted = highlightedId === comment.id;
  const isDeleted = Boolean(comment.deletedAt);

  const permalink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("event", String(eventId));
    url.searchParams.set("comment", comment.id);
    return url.toString();
  }, [comment.id, eventId]);

  const handleCopyLink = async () => {
    if (!permalink) return;
    await navigator.clipboard?.writeText(permalink).catch(() => undefined);
    window.history.replaceState(null, "", permalink);
  };

  const handleEdit = async () => {
    setActionError("");
    try {
      await onUpdate(comment.id, editValue);
      setEditing(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "更新失败");
    }
  };

  const handleDelete = async () => {
    setActionError("");
    try {
      await onDelete(comment.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <article
      id={`comment-${comment.id}`}
      className={cn(
        "relative rounded-2xl border bg-white/84 p-3 shadow-sm transition dark:bg-slate-900/72",
        isHighlighted
          ? "border-amber-300 ring-4 ring-amber-200/70 dark:border-amber-400 dark:ring-amber-400/20"
          : "border-sky-100/80 dark:border-slate-700",
      )}
      style={{ marginLeft: `${indentDepth * 18}px` }}
    >
      {comment.depth > MAX_DEPTH_INDENT ? (
        <div className="mb-2 text-xs text-slate-400">回复给上级评论</div>
      ) : null}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-emerald-400 text-xs font-bold text-white shadow-sm">
          {getUsernameAvatarLabel(comment.username, "?")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {comment.username ?? "匿名用户"}
            </span>
            <span className="text-xs text-slate-400">{formatCommentTime(comment.createdAt)}</span>
            {comment.editedAt && !isDeleted ? <span className="text-xs text-slate-400">（已编辑）</span> : null}
          </div>

          {editing ? (
            <div className="mt-2">
              <textarea
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                maxLength={500}
                className="min-h-[5rem] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                  取消
                </button>
                <button type="button" onClick={handleEdit} className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500">
                  保存
                </button>
              </div>
            </div>
          ) : (
            <p className={cn("mt-2 whitespace-pre-wrap text-sm leading-6", isDeleted ? "text-slate-400" : "text-slate-600 dark:text-slate-200")}>
              {isDeleted ? "（已删除）" : comment.content}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {!isDeleted ? (
              <button type="button" onClick={() => setReplying((value) => !value)} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10">
                <Reply size={13} />
                回复
              </button>
            ) : null}
            <button type="button" onClick={handleCopyLink} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
              <Link2 size={13} />
              链接
            </button>
            {comment.canEdit ? (
              <button type="button" onClick={() => setEditing(true)} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                <Edit3 size={13} />
                编辑
              </button>
            ) : null}
            {comment.canDelete ? (
              <button type="button" onClick={handleDelete} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                <Trash2 size={13} />
                删除
              </button>
            ) : null}
          </div>

          {actionError ? <div className="mt-2 text-xs text-red-500">{actionError}</div> : null}

          {replying ? (
            <div className="mt-3">
              <CommentComposer
                placeholder="写下你的回复..."
                submitLabel="回复"
                autoFocus
                onCancel={() => setReplying(false)}
                onSubmit={async (content) => {
                  await onCreateReply(comment.id, content);
                  setReplying(false);
                }}
              />
            </div>
          ) : null}

          {visibleReplies.length > 0 ? (
            <div className="mt-3 space-y-3 border-l border-sky-100 pl-3 dark:border-slate-700">
              {visibleReplies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  eventId={eventId}
                  highlightedId={highlightedId}
                  replies={replies}
                  loadingReplies={loadingReplies}
                  onCreateReply={onCreateReply}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onLoadReplies={onLoadReplies}
                />
              ))}
            </div>
          ) : null}

          {comment.replyCount > 0 && hiddenReplyCount > 0 ? (
            <button
              type="button"
              onClick={() => onLoadReplies(comment.id, loadedReplies?.nextCursor)}
              disabled={loadingReplies[comment.id]}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-60 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
            >
              <MoreHorizontal size={14} />
              {loadingReplies[comment.id] ? "加载中" : loadedReplies?.hasMore ? "再展开 10 条回复" : `展开 ${hiddenReplyCount} 条回复`}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function EventComments({ eventId }: { eventId: number | null }) {
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [focusedMode, setFocusedMode] = useState(false);
  const [replies, setReplies] = useState<Record<string, CommentListResponse>>({});
  const [loadingReplies, setLoadingReplies] = useState<Record<string, boolean>>({});
  const { userId, username, emailVerified, authReady } = useGameStore();

  const apiBase = eventId ? `/api/bandori/events/${eventId}/comments` : null;

  const loadRootComments = useCallback(async (cursor?: string | null) => {
    if (!apiBase) return;
    setLoading(true);
    setError("");
    try {
      const headers = await authHeaders();
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const data = await requestJson<CommentListResponse>(`${apiBase}${suffix}`, { headers });
      setComments((current) => cursor ? [...current, ...data.comments] : data.comments);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
      setFocusedMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "评论加载失败");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const loadFocusedComment = useCallback(async (commentId: string) => {
    if (!apiBase) return;
    setLoading(true);
    setError("");
    try {
      const headers = await authHeaders();
      const data = await requestJson<CommentContextResponse>(`${apiBase}/${commentId}`, { headers });
      setComments([buildFocusedTree(data)]);
      setFocusedCommentId(commentId);
      setFocusedMode(true);
      window.setTimeout(() => document.getElementById(`comment-${commentId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法定位评论");
      await loadRootComments(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, loadRootComments]);

  useEffect(() => {
    setComments([]);
    setReplies({});
    setFocusedMode(false);
    if (!eventId || !apiBase) return;

    const params = new URLSearchParams(window.location.search);
    const commentId = params.get("comment");
    if (commentId) {
      void loadFocusedComment(commentId);
      return;
    }

    void loadRootComments(null);
  }, [apiBase, eventId, loadFocusedComment, loadRootComments]);

  const createComment = async (content: string, parentId?: string | null) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const created = await requestJson<CommentNode>(apiBase, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ content, parentId }),
    });

    if (parentId) {
      setComments((current) => bumpReplyCount(current, parentId, created));
      setReplies((current) => {
        const existing = current[parentId];
        if (!existing) {
          const parent = findComment(comments, parentId);
          const baseReplies = parent?.previewReplies ?? [];
          return {
            ...current,
            [parentId]: {
              comments: appendUniqueComment(baseReplies, created),
              nextCursor: null,
              hasMore: false,
            },
          };
        }

        return {
          ...current,
          [parentId]: { ...existing, comments: appendUniqueComment(existing.comments, created) },
        };
      });
      setFocusedCommentId(created.id);
      window.setTimeout(() => document.getElementById(`comment-${created.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
      return;
    }

    setComments((current) => appendUniqueComment(current, created));
    setFocusedCommentId(created.id);
    window.setTimeout(() => document.getElementById(`comment-${created.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
  };

  const updateCommentContent = async (commentId: string, content: string) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const updated = await requestJson<CommentNode>(`${apiBase}/${commentId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setComments((current) => replaceComment(current, updated));
    setReplies((current) => Object.fromEntries(
      Object.entries(current).map(([parentId, response]) => [
        parentId,
        { ...response, comments: replaceComment(response.comments, updated) },
      ]),
    ));
  };

  const deleteComment = async (commentId: string) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const updated = await requestJson<CommentNode>(`${apiBase}/${commentId}`, {
      method: "DELETE",
      headers,
    });
    setComments((current) => replaceComment(current, updated));
    setReplies((current) => Object.fromEntries(
      Object.entries(current).map(([parentId, response]) => [
        parentId,
        { ...response, comments: replaceComment(response.comments, updated) },
      ]),
    ));
  };

  const loadReplies = async (commentId: string, cursor?: string | null) => {
    if (!apiBase || loadingReplies[commentId]) return;
    setLoadingReplies((current) => ({ ...current, [commentId]: true }));
    try {
      const headers = await authHeaders();
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const data = await requestJson<CommentListResponse>(`${apiBase}/${commentId}/replies${suffix}`, { headers });
      setReplies((current) => {
        const existing = current[commentId];
        return {
          ...current,
          [commentId]: {
            comments: cursor && existing ? [...existing.comments, ...data.comments] : data.comments,
            nextCursor: data.nextCursor,
            hasMore: data.hasMore,
          },
        };
      });
    } finally {
      setLoadingReplies((current) => ({ ...current, [commentId]: false }));
    }
  };

  return (
    <section className="rounded-3xl border border-sky-100/90 bg-gradient-to-b from-white/92 to-sky-50/72 p-4 shadow-[0_24px_60px_rgba(14,116,144,0.11)] dark:border-slate-800 dark:from-slate-950/94 dark:to-slate-900/84 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-sky-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
            <MessageSquare size={14} />
            活动评论
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">本期活动讨论</h2>
        </div>
        {focusedMode ? (
          <button
            type="button"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete("comment");
              window.history.replaceState(null, "", url.toString());
              setFocusedCommentId(null);
              void loadRootComments(null);
            }}
            className="inline-flex h-9 items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          >
            返回全部评论
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        {!authReady ? (
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/70">
            正在读取登录状态...
          </div>
        ) : userId && emailVerified ? (
          <CommentComposer placeholder={`以 ${username ?? "当前账号"} 发表主评论...`} submitLabel="发布评论" onSubmit={(content) => createComment(content, null)} />
        ) : userId ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            完成邮箱验证后可以发表评论和回复。
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/70">
            登录后可以参与本期活动讨论。
          </div>
        )}
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{error}</div> : null}

      <div className="mt-5 space-y-3">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            eventId={eventId ?? 0}
            highlightedId={focusedCommentId}
            replies={replies}
            loadingReplies={loadingReplies}
            onCreateReply={(parentId, content) => createComment(content, parentId)}
            onUpdate={updateCommentContent}
            onDelete={deleteComment}
            onLoadReplies={loadReplies}
          />
        ))}

        {!loading && comments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sky-200 bg-white/62 py-10 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900/50">
            还没有评论，来留下本期活动的第一条讨论。
          </div>
        ) : null}
      </div>

      {!focusedMode && hasMore ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => loadRootComments(nextCursor)}
            disabled={loading}
            className="inline-flex h-10 items-center rounded-full border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50 disabled:opacity-60 dark:border-sky-500/30 dark:bg-slate-900 dark:text-sky-300"
          >
            {loading ? "加载中" : "加载更多主评论"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
