"use client";

import type {
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Edit3,
  Link2,
  MoreHorizontal,
  Reply,
  Smile,
  Trash2,
} from "lucide-react";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import {
  COMMENT_STAMP_DEFAULT_REGION,
  type CommentStamp,
  type CommentStampRegion,
} from "@/lib/comment-stamps";
import { getCommentEmojiSrc } from "@/lib/comment-emojis";
import { cn } from "@/lib/utils";
import {
  buildEmojiShortcode,
  buildStampShortcode,
  CommentContent,
  type CommentStampLookup,
  formatCommentTime,
  insertCommentShortcode,
} from "./commentContent";
import { CommentComposer } from "./CommentComposer";
import {
  COMMENT_INPUT_MAX_LENGTH,
  type CommentListResponse,
  type CommentNode,
  type CommentReactionSummary,
} from "./commentTypes";
import { EmojiPickerButton } from "./EmojiPickerButton";
import { StampPickerButton } from "./StampPickerButton";

type ReactionChipProps = {
  reaction: CommentReactionSummary;
  disabled: boolean;
  onToggle: (emojiKey: string, reactedByViewer: boolean) => Promise<void>;
};

function ReactionEmoji({ emojiKey, size = 20 }: { emojiKey: string; size?: number }) {
  const src = getCommentEmojiSrc(emojiKey);
  if (!src) {
    return <Smile size={Math.min(size, 18)} aria-hidden="true" />;
  }

  return (
    <Image
      src={src}
      alt={`:${emojiKey}:`}
      width={size}
      height={size}
      unoptimized
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function ReactionChip({ reaction, disabled, onToggle }: ReactionChipProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  useEffect(() => {
    if (!tooltipOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setTooltipOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [tooltipOpen]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse") return;
    clearLongPressTimer();
    suppressClickRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      setTooltipOpen(true);
    }, 450);
  };

  const handlePointerEnd = () => {
    clearLongPressTimer();
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    void onToggle(reaction.emojiKey, reaction.reactedByViewer);
  };

  return (
    <span
      ref={containerRef}
      className="relative inline-flex"
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setTooltipOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setTooltipOpen(false);
      }}
      onFocus={() => setTooltipOpen(true)}
      onBlur={() => setTooltipOpen(false)}
    >
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onContextMenu={(event) => {
          if (tooltipOpen) event.preventDefault();
        }}
        disabled={disabled}
        aria-pressed={reaction.reactedByViewer}
        aria-label={`:${reaction.emojiKey}: ${reaction.count}`}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
          reaction.reactedByViewer
            ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-200 dark:hover:bg-sky-500/25"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
        )}
      >
        <ReactionEmoji emojiKey={reaction.emojiKey} size={18} />
        {reaction.count}
      </button>
      {tooltipOpen ? (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-30 mb-0 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-xs text-slate-700 shadow-2xl shadow-slate-900/10 dark:border-slate-200 dark:bg-white dark:text-slate-700"
        >
          <div className="mb-2 flex items-center gap-1.5 font-semibold text-slate-900">
            <ReactionEmoji emojiKey={reaction.emojiKey} size={20} />
            <span>{reaction.count} 个回应</span>
          </div>
          <div className="space-y-1.5">
            {reaction.users.map((user) => (
              <div key={`${reaction.emojiKey}-${user.userId}`} className="flex items-center gap-2">
                <AccountCardAvatar
                  username={user.username}
                  cardId={user.avatar.cardId}
                  entityServer={user.avatar.entityServer}
                  trainType={user.avatar.trainType}
                  size="toolbar"
                  className="ring-1 ring-slate-200"
                />
                <span className="min-w-0 flex-1 truncate text-slate-700">{user.username ?? "匿名用户"}</span>
              </div>
            ))}
          </div>
          {reaction.remainingUserCount > 0 ? (
            <div className="mt-2 border-t border-slate-200 pt-2 text-slate-500">
              …
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

export type CommentItemProps = {
  comment: CommentNode;
  eventId: number;
  highlightedId: string | null;
  replies: Record<string, CommentListResponse>;
  loadingReplies: Record<string, boolean>;
  stampLookup: CommentStampLookup;
  canReact: boolean;
  commentPage: number;
  isReply?: boolean;
  rootCommentId?: string | null;
  onCreateReply: (parentId: string, content: string) => Promise<void>;
  onToggleReaction: (commentId: string, emojiKey: string, reactedByViewer: boolean) => Promise<void>;
  onUpdate: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onLoadReplies: (commentId: string, cursor?: string | null) => Promise<void>;
  onLocateComment: (commentId: string) => Promise<void>;
};

export const CommentItem = memo(function CommentItem({
  comment,
  eventId,
  highlightedId,
  replies,
  loadingReplies,
  stampLookup,
  canReact,
  commentPage,
  isReply = false,
  rootCommentId = null,
  onCreateReply,
  onToggleReaction,
  onUpdate,
  onDelete,
  onLoadReplies,
  onLocateComment,
}: CommentItemProps) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment.content ?? "");
  const [editEmojiOpen, setEditEmojiOpen] = useState(false);
  const [editStampOpen, setEditStampOpen] = useState(false);
  const [editStampRegion, setEditStampRegion] = useState<CommentStampRegion>(COMMENT_STAMP_DEFAULT_REGION);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [reactingEmojiKey, setReactingEmojiKey] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRootId = rootCommentId ?? comment.id;
  const loadedReplies = replies[threadRootId];
  const visibleReplies = isReply ? [] : loadedReplies?.comments ?? comment.previewReplies;
  const hiddenReplyCount = isReply ? 0 : Math.max(0, comment.replyCount - visibleReplies.length);
  const isHighlighted = highlightedId === comment.id;
  const isDeleted = Boolean(comment.deletedAt);

  useEffect(() => {
    setDeleteDialogOpen(false);
    setDeleting(false);
    setReactionPickerOpen(false);
    setReactingEmojiKey(null);
  }, [comment.id, isDeleted]);

  const permalink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("event", String(eventId));
    url.searchParams.set("page", String(commentPage));
    url.searchParams.set("comment", comment.id);
    return url.toString();
  }, [comment.id, commentPage, eventId]);

  const replyToPermalink = useMemo(() => {
    if (typeof window === "undefined" || !comment.replyToCommentId) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("event", String(eventId));
    url.searchParams.set("page", String(commentPage));
    url.searchParams.set("comment", comment.replyToCommentId);
    return url.toString();
  }, [comment.replyToCommentId, commentPage, eventId]);

  const handleCopyLink = async () => {
    if (!permalink) return;
    await navigator.clipboard?.writeText(permalink).catch(() => undefined);
    if (permalink !== window.location.href) {
      window.history.replaceState(null, "", permalink);
    }
  };

  const handleReplyToClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!comment.replyToCommentId) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    void onLocateComment(comment.replyToCommentId);
  };

  const handleEdit = async () => {
    setDeleteDialogOpen(false);
    setReactionPickerOpen(false);
    setActionError("");
    try {
      await onUpdate(comment.id, editValue);
      setEditing(false);
      setEditEmojiOpen(false);
      setEditStampOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "更新失败");
    }
  };

  const handleDelete = async () => {
    if (deleting) {
      return;
    }

    setActionError("");
    setDeleting(true);
    try {
      await onDelete(comment.id);
      setDeleteDialogOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleReaction = async (emojiKey: string, reactedByViewer: boolean) => {
    if (reactingEmojiKey || isDeleted) return;
    setActionError("");
    if (!canReact) {
      setActionError("登录并完成邮箱验证后可以回应");
      return;
    }

    setReactingEmojiKey(emojiKey);
    try {
      await onToggleReaction(comment.id, emojiKey, reactedByViewer);
      setReactionPickerOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "评论回应失败");
    } finally {
      setReactingEmojiKey(null);
    }
  };

  const insertEditEmoji = (name: string) => {
    const textarea = editTextareaRef.current;
    const start = textarea?.selectionStart ?? editValue.length;
    const end = textarea?.selectionEnd ?? editValue.length;
    const { nextValue, nextCursor } = insertCommentShortcode(editValue, buildEmojiShortcode(name), start, end);

    setEditValue(nextValue);
    setEditEmojiOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const insertEditStamp = (stamp: CommentStamp) => {
    const textarea = editTextareaRef.current;
    const start = textarea?.selectionStart ?? editValue.length;
    const end = textarea?.selectionEnd ?? editValue.length;
    const { nextValue, nextCursor } = insertCommentShortcode(editValue, buildStampShortcode(stamp), start, end);

    setEditValue(nextValue);
    setEditStampOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleSubmitReply = useCallback(async (content: string) => {
    await onCreateReply(comment.id, content);
    setReplying(false);
  }, [comment.id, onCreateReply]);

  return (
    <article
      id={`comment-${comment.id}`}
      className={cn(
        "relative transition",
        isReply
          ? "rounded-xl bg-transparent py-1"
          : "rounded-2xl border bg-white p-3 shadow-xs dark:bg-slate-900 sm:p-4",
        isHighlighted && isReply
          ? "bg-sky-50/80 ring-2 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/25"
          : null,
        !isReply && (isHighlighted
          ? "border-sky-300 ring-4 ring-sky-100 dark:border-sky-500 dark:ring-sky-500/20"
          : "border-slate-200 dark:border-slate-700"),
      )}
    >
      <div className={cn("flex items-start", isReply ? "gap-2" : "gap-3")}>
        <AccountCardAvatar
          username={comment.username}
          cardId={comment.avatar.cardId}
          entityServer={comment.avatar.entityServer}
          trainType={comment.avatar.trainType}
          size="comment"
          className="ring-1 ring-sky-200 dark:ring-slate-700"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {comment.username ?? "匿名用户"}
            </span>
            <span className="text-xs text-slate-400">{formatCommentTime(comment.createdAt)}</span>
            {comment.replyToUsername ? (
              comment.replyToCommentId && replyToPermalink ? (
                <a
                  href={replyToPermalink}
                  onClick={handleReplyToClick}
                  className="rounded-full text-xs font-medium text-sky-600 underline-offset-2 hover:text-sky-700 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-200 dark:text-sky-300 dark:hover:text-sky-200"
                >
                  回复 @{comment.replyToUsername}
                </a>
              ) : (
                <span className="text-xs font-medium text-sky-600 dark:text-sky-300">
                  回复 @{comment.replyToUsername}
                </span>
              )
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
                className="min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 outline-hidden transition placeholder:text-slate-400 selection:bg-sky-200 selection:text-slate-900 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:selection:bg-sky-500/40 dark:selection:text-white dark:focus:border-sky-400 dark:focus:bg-slate-900 dark:focus:text-slate-50 dark:focus:ring-sky-500/25"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs", editValue.length > 460 ? "text-amber-600" : "text-slate-400")}>
                    {editValue.length}/500
                  </span>
                  <EmojiPickerButton
                    open={editEmojiOpen}
                    onOpenChange={(open) => {
                      setEditEmojiOpen(open);
                      if (open) setEditStampOpen(false);
                    }}
                    onSelect={insertEditEmoji}
                  />
                  <StampPickerButton
                    open={editStampOpen}
                    selectedRegion={editStampRegion}
                    onOpenChange={(open) => {
                      setEditStampOpen(open);
                      if (open) setEditEmojiOpen(false);
                    }}
                    onRegionChange={setEditStampRegion}
                    onSelect={insertEditStamp}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setEditEmojiOpen(false);
                      setEditStampOpen(false);
                    }}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleEdit}
                    className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <CommentContent content={comment.content ?? ""} isDeleted={isDeleted} stampLookup={stampLookup} />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {!isDeleted ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setReactionPickerOpen(false);
                  setReplying((value) => !value);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10"
              >
                <Reply size={13} />
                回复
              </button>
            ) : null}
            {!isDeleted ? (
              <>
                {(comment.reactions ?? []).map((reaction) => (
                  <ReactionChip
                    key={reaction.emojiKey}
                    reaction={reaction}
                    disabled={Boolean(reactingEmojiKey)}
                    onToggle={handleToggleReaction}
                  />
                ))}
                <EmojiPickerButton
                  compact
                  open={reactionPickerOpen}
                  disabled={Boolean(reactingEmojiKey)}
                  label="添加回应"
                  onOpenChange={setReactionPickerOpen}
                  onSelect={(emojiKey) => {
                    const existingReaction = (comment.reactions ?? []).find((reaction) => reaction.emojiKey === emojiKey);
                    setReactionPickerOpen(false);
                    void handleToggleReaction(emojiKey, Boolean(existingReaction?.reactedByViewer));
                  }}
                />
              </>
            ) : null}
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Link2 size={13} />
              链接
            </button>
            {comment.canEdit ? (
              <button
                type="button"
                onClick={() => {
                  setEditValue(comment.content ?? "");
                  setEditEmojiOpen(false);
                  setEditStampOpen(false);
                  setDeleteDialogOpen(false);
                  setReactionPickerOpen(false);
                  setEditing(true);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Edit3 size={13} />
                编辑
              </button>
            ) : null}
            {comment.canDelete ? (
              <Dialog.Root
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                  if (!deleting) {
                    setDeleteDialogOpen(open);
                    if (!open) setActionError("");
                  }
                }}
              >
                <Dialog.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    <Trash2 size={13} />
                    删除
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-120 bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
                  <Dialog.Content className="fixed left-1/2 top-1/2 z-121 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[18px] border border-slate-200 bg-white text-slate-900 shadow-2xl outline-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">
                    <Dialog.Title className="px-5 py-5 text-center text-base font-semibold">
                      确认删除评论？
                    </Dialog.Title>
                    <div className="grid grid-cols-2 border-t border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="h-11 border-r border-slate-200 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-red-300 dark:hover:bg-red-500/10"
                      >
                        删除
                      </button>
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          disabled={deleting}
                          className="h-11 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          取消
                        </button>
                      </Dialog.Close>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
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
                onSubmit={handleSubmitReply}
              />
            </div>
          ) : null}

          {visibleReplies.length > 0 ? (
            <div className="mt-3 -ml-5.5 space-y-3 border-l border-slate-200 pl-2 dark:border-slate-700 sm:ml-0 sm:pl-3">
              {visibleReplies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  eventId={eventId}
                  highlightedId={highlightedId}
                  replies={replies}
                  loadingReplies={loadingReplies}
                  stampLookup={stampLookup}
                  canReact={canReact}
                  commentPage={commentPage}
                  isReply
                  rootCommentId={comment.id}
                  onCreateReply={onCreateReply}
                  onToggleReaction={onToggleReaction}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onLoadReplies={onLoadReplies}
                  onLocateComment={onLocateComment}
                />
              ))}
            </div>
          ) : null}

          {comment.replyCount > 0 && hiddenReplyCount > 0 ? (
            <button
              type="button"
              onClick={() => onLoadReplies(threadRootId, loadedReplies?.nextCursor)}
              disabled={loadingReplies[threadRootId]}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-sky-700 shadow-xs transition hover:border-sky-200 hover:bg-sky-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300"
            >
              <MoreHorizontal size={14} />
              {loadingReplies[threadRootId] ? "加载中" : loadedReplies?.hasMore ? "再展开 10 条回复" : `展开 ${hiddenReplyCount} 条回复`}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
});
