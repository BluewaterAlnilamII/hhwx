"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Check, Edit3, Link2, MessageSquare, MoreHorizontal, Reply, Smile, Trash2, X } from "lucide-react";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { COMMENT_EMOJI_NAMES, getCommentEmojiSrc } from "@/lib/comment-emojis";
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
  replyToCommentId: string | null;
  replyToUsername: string | null;
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

const COMMENT_INPUT_MAX_LENGTH = 500;


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

function renderCommentContent(content: string) {
  const nodes: ReactNode[] = [];
  const emojiPattern = /:([A-Za-z0-9_+-]+):/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = emojiPattern.exec(content)) !== null) {
    const [raw, name] = match;
    const src = getCommentEmojiSrc(name);
    if (!src) continue;

    if (match.index > cursor) {
      nodes.push(content.slice(cursor, match.index));
    }

    nodes.push(
      <Image
        key={`${name}-${match.index}`}
        src={src}
        alt={raw}
        title={raw}
        width={32}
        height={32}
        loading="lazy"
        className="mx-0.5 inline-block h-8 w-8 align-[-0.35em]"
      />,
    );
    cursor = match.index + raw.length;
  }

  if (cursor < content.length) {
    nodes.push(content.slice(cursor));
  }

  return nodes.length > 0 ? nodes : content;
}

function insertEmojiShortcode(
  value: string,
  name: string,
  start: number,
  end: number,
): { nextValue: string; nextCursor: number } {
  const shortcode = `:${name}:`;
  const prefix = start > 0 && !/\s/.test(value[start - 1] ?? "") ? " " : "";
  const suffix = !/\s/.test(value[end] ?? "") ? " " : "";
  const nextValue = `${value.slice(0, start)}${prefix}${shortcode}${suffix}${value.slice(end)}`.slice(
    0,
    COMMENT_INPUT_MAX_LENGTH,
  );
  const nextCursor = Math.min(start + prefix.length + shortcode.length + suffix.length, nextValue.length);

  return { nextValue, nextCursor };
}

type EmojiPickerButtonProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (name: string) => void;
};

function EmojiPickerButton({ open, onOpenChange, onSelect }: EmojiPickerButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onOpenChange, open]);

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full border text-slate-500 transition hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-500/10 dark:hover:text-sky-300",
          open
            ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-sky-300"
            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
        )}
        aria-expanded={open}
        aria-label="选择表情"
        title="选择表情"
      >
        <Smile size={15} />
      </button>
      {open ? (
        <div className="absolute bottom-10 left-0 z-20 w-[min(24rem,calc(100vw-4rem))] rounded-2xl border border-sky-100 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="grid max-h-64 grid-cols-9 gap-1 overflow-y-auto pr-1 [scrollbar-color:#94a3b8_#e5e7eb] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-200">
            {COMMENT_EMOJI_NAMES.map((name) => {
              const src = getCommentEmojiSrc(name);
              if (!src) return null;

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelect(name)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-sky-50 focus:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:hover:bg-sky-500/10 dark:focus:bg-sky-500/10 dark:focus:ring-sky-500/30"
                  aria-label={`:${name}:`}
                  title={`:${name}:`}
                >
                  <Image src={src} alt={`:${name}:`} width={32} height={32} className="h-8 w-8 object-contain" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildContextThread(context: CommentContextResponse): CommentNode {
  const root: CommentNode = { ...context.root, previewReplies: [] };
  const repliesById = new Map<string, CommentNode>();

  for (const item of [...context.ancestors, context.comment]) {
    if (item.id !== root.id) {
      repliesById.set(item.id, { ...item, previewReplies: [] });
    }
  }

  root.previewReplies = [...repliesById.values()].sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id);
  });

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

function mergePreviewReplies(current: CommentNode[], next: CommentNode[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();

  for (const item of current) {
    byId.set(item.id, item);
  }

  for (const item of next) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id);
  });
}

function mergeContextRoot(nodes: CommentNode[], contextRoot: CommentNode): CommentNode[] {
  let found = false;
  const merged = nodes.map((node) => {
    if (node.id !== contextRoot.id) {
      return node;
    }

    found = true;
    return {
      ...node,
      replyCount: Math.max(node.replyCount, contextRoot.replyCount),
      previewReplies: mergePreviewReplies(node.previewReplies, contextRoot.previewReplies),
    };
  });

  return found ? merged : [...merged, contextRoot];
}

function findThreadRootId(nodes: CommentNode[], comment: CommentNode): string | null {
  if (!comment.parentId) {
    return comment.id;
  }

  if (comment.rootId) {
    return comment.rootId;
  }

  return findComment(nodes, comment.parentId)?.rootId ?? comment.parentId;
}

function bumpThreadReplyCount(nodes: CommentNode[], rootId: string, child: CommentNode): CommentNode[] {
  return nodes.map((node) => {
    if (node.id === rootId) {
      const hasPreview = node.previewReplies.some((reply) => reply.id === child.id);
      return {
        ...node,
        replyCount: node.replyCount + 1,
        previewReplies: node.replyCount === 0 && !hasPreview ? [child] : node.previewReplies,
      };
    }

    return node;
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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(content.trim());
      setContent("");
      setEmojiOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const insertEmoji = (name: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const { nextValue, nextCursor } = insertEmojiShortcode(content, name, start, end);

    setContent(nextValue);
    setEmojiOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <div className="rounded-2xl border border-sky-100 bg-white/82 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/72">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={COMMENT_INPUT_MAX_LENGTH}
        autoFocus={autoFocus}
        className="min-h-[5.25rem] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/20"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs", content.length > 460 ? "text-amber-600" : "text-slate-400")}>
            {content.length}/500
          </span>
          <EmojiPickerButton open={emojiOpen} onOpenChange={setEmojiOpen} onSelect={insertEmoji} />
        </div>
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
  isReply?: boolean;
  rootCommentId?: string | null;
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
  isReply = false,
  rootCommentId = null,
  onCreateReply,
  onUpdate,
  onDelete,
  onLoadReplies,
}: CommentItemProps) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment.content ?? "");
  const [editEmojiOpen, setEditEmojiOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRootId = rootCommentId ?? comment.id;
  const loadedReplies = replies[threadRootId];
  const visibleReplies = isReply ? [] : loadedReplies?.comments ?? comment.previewReplies;
  const hiddenReplyCount = isReply ? 0 : Math.max(0, comment.replyCount - visibleReplies.length);
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
      setEditEmojiOpen(false);
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

  const insertEditEmoji = (name: string) => {
    const textarea = editTextareaRef.current;
    const start = textarea?.selectionStart ?? editValue.length;
    const end = textarea?.selectionEnd ?? editValue.length;
    const { nextValue, nextCursor } = insertEmojiShortcode(editValue, name, start, end);

    setEditValue(nextValue);
    setEditEmojiOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
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
    >
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
            {comment.replyToUsername ? (
              <span className="text-xs font-medium text-sky-600 dark:text-sky-300">
                回复 @{comment.replyToUsername}
              </span>
            ) : null}
            {comment.editedAt && !isDeleted ? <span className="text-xs text-slate-400">（已编辑）</span> : null}
          </div>

          {editing ? (
            <div className="mt-2">
              <textarea
                ref={editTextareaRef}
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                maxLength={COMMENT_INPUT_MAX_LENGTH}
                className="min-h-[5rem] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs", editValue.length > 460 ? "text-amber-600" : "text-slate-400")}>
                    {editValue.length}/500
                  </span>
                  <EmojiPickerButton open={editEmojiOpen} onOpenChange={setEditEmojiOpen} onSelect={insertEditEmoji} />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setEditEmojiOpen(false);
                    }}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    取消
                  </button>
                  <button type="button" onClick={handleEdit} className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500">
                    保存
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className={cn("mt-2 whitespace-pre-wrap text-sm leading-6", isDeleted ? "text-slate-400" : "text-slate-600 dark:text-slate-200")}>
              {isDeleted ? "（已删除）" : renderCommentContent(comment.content ?? "")}
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
              <button
                type="button"
                onClick={() => {
                  setEditValue(comment.content ?? "");
                  setEditEmojiOpen(false);
                  setEditing(true);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
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
                  isReply
                  rootCommentId={comment.id}
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
              onClick={() => onLoadReplies(threadRootId, loadedReplies?.nextCursor)}
              disabled={loadingReplies[threadRootId]}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-60 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
            >
              <MoreHorizontal size={14} />
              {loadingReplies[threadRootId] ? "加载中" : loadedReplies?.hasMore ? "再展开 10 条回复" : `展开 ${hiddenReplyCount} 条回复`}
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "评论加载失败");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const locateLinkedComment = useCallback(async (commentId: string) => {
    if (!apiBase) return;
    try {
      const headers = await authHeaders();
      const data = await requestJson<CommentContextResponse>(`${apiBase}/${commentId}`, { headers });
      const contextRoot = buildContextThread(data);
      setComments((current) => mergeContextRoot(current, contextRoot));
      if (contextRoot.previewReplies.length > 0) {
        setReplies((current) => {
          const existing = current[contextRoot.id];
          return {
            ...current,
            [contextRoot.id]: {
              comments: mergePreviewReplies(existing?.comments ?? [], contextRoot.previewReplies),
              nextCursor: existing?.nextCursor ?? null,
              hasMore: existing?.hasMore ?? false,
            },
          };
        });
      }
      setFocusedCommentId(commentId);
      window.setTimeout(() => document.getElementById(`comment-${commentId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法定位评论");
    }
  }, [apiBase]);

  useEffect(() => {
    setComments([]);
    setReplies({});
    setFocusedCommentId(null);
    if (!eventId || !apiBase) return;

    const params = new URLSearchParams(window.location.search);
    const commentId = params.get("comment");
    void (async () => {
      await loadRootComments(null);
      if (commentId) {
        await locateLinkedComment(commentId);
      }
    })();
  }, [apiBase, eventId, loadRootComments, locateLinkedComment]);

  const createComment = async (content: string, parentId?: string | null) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const created = await requestJson<CommentNode>(apiBase, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ content, parentId }),
    });

    if (parentId) {
      const rootId = findThreadRootId(comments, created) ?? parentId;
      setComments((current) => bumpThreadReplyCount(current, rootId, created));
      setReplies((current) => {
        const existing = current[rootId];
        if (!existing) {
          const root = findComment(comments, rootId);
          const baseReplies = root?.previewReplies ?? [];
          return {
            ...current,
            [rootId]: {
              comments: appendUniqueComment(baseReplies, created),
              nextCursor: null,
              hasMore: false,
            },
          };
        }

        return {
          ...current,
          [rootId]: { ...existing, comments: appendUniqueComment(existing.comments, created) },
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

      {hasMore ? (
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
