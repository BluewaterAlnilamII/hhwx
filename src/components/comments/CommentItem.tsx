"use client";

import type {
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { useFormatter, useTranslations } from "next-intl";
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
  COMMENT_PAGE_SIZE,
  MAX_COMMENT_LENGTH,
  type CommentListResponse,
  type CommentNode,
  type CommentReactionSummary,
} from "@/lib/comments/comment-contract";
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
  insertCommentShortcode,
  type CommentStampLookup,
} from "@/lib/comments/comment-content";
import { CommentContent } from "./CommentContent";
import { CommentComposer } from "./CommentComposer";
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
  const t = useTranslations("comments");
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
            ? "border-[var(--theme-color-semantic-info-border)] bg-[var(--theme-color-semantic-info-background)] text-[var(--theme-color-semantic-info-foreground)] hover:brightness-95 dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-200 dark:hover:bg-sky-500/25"
            : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
        )}
      >
        <ReactionEmoji emojiKey={reaction.emojiKey} size={18} />
        {reaction.count}
      </button>
      {tooltipOpen ? (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-30 mb-0 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] p-2.5 text-left text-xs text-[var(--theme-color-text-muted)] shadow-2xl dark:border-slate-200 dark:bg-white dark:text-slate-700"
        >
          <div className="mb-2 flex items-center gap-1.5 font-semibold text-[var(--theme-color-text-default)]">
            <ReactionEmoji emojiKey={reaction.emojiKey} size={20} />
            <span>{t("reactions.count", { count: reaction.count })}</span>
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
                  className="ring-1 ring-[var(--theme-color-border-subtle)]"
                />
                <span className="min-w-0 flex-1 truncate text-[var(--theme-color-text-muted)]">
                  {user.username ?? t("states.anonymous")}
                </span>
              </div>
            ))}
          </div>
          {reaction.remainingUserCount > 0 ? (
            <div className="mt-2 border-t border-[var(--theme-color-border-subtle)] pt-2 text-[var(--theme-color-text-muted)]">
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
  buildPermalink: (commentId: string, page: number) => string;
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
  buildPermalink,
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
  const t = useTranslations("comments");
  const format = useFormatter();
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
    return buildPermalink(comment.id, commentPage);
  }, [buildPermalink, comment.id, commentPage]);

  const replyToPermalink = useMemo(() => {
    return comment.replyToCommentId
      ? buildPermalink(comment.replyToCommentId, commentPage)
      : "";
  }, [buildPermalink, comment.replyToCommentId, commentPage]);

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
      setActionError(err instanceof Error ? err.message : t("errors.updateFailed"));
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
      setActionError(err instanceof Error ? err.message : t("errors.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleReaction = async (emojiKey: string, reactedByViewer: boolean) => {
    if (reactingEmojiKey || isDeleted) return;
    setActionError("");
    if (!canReact) {
      setActionError(t("reactions.authenticationRequired"));
      return;
    }

    setReactingEmojiKey(emojiKey);
    try {
      await onToggleReaction(comment.id, emojiKey, reactedByViewer);
      setReactionPickerOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("errors.reactionFailed"));
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
          : "rounded-2xl border bg-[var(--theme-color-control-background)] p-3 shadow-xs sm:p-4 dark:bg-slate-900",
        isHighlighted && isReply
          ? "bg-[var(--theme-color-semantic-info-background)] ring-2 ring-[var(--theme-color-semantic-info-border)] dark:bg-sky-500/10 dark:ring-sky-500/25"
          : null,
        !isReply && (isHighlighted
          ? "border-[var(--theme-color-semantic-info-border)] ring-4 ring-[var(--theme-color-semantic-info-background)] dark:border-sky-500 dark:ring-sky-500/20"
          : "border-[var(--theme-color-border-subtle)] dark:border-slate-700"),
      )}
    >
      <div className={cn("flex items-start", isReply ? "gap-2" : "gap-3")}>
        <AccountCardAvatar
          username={comment.username}
          cardId={comment.avatar.cardId}
          entityServer={comment.avatar.entityServer}
          trainType={comment.avatar.trainType}
          size="comment"
          className="ring-1 ring-[var(--theme-color-action-secondary-border)] dark:ring-slate-700"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-[var(--theme-color-text-default)] dark:text-slate-100">
              {comment.username ?? t("states.anonymous")}
            </span>
            <span className="text-xs text-[var(--theme-color-text-muted)]">
              {format.dateTime(new Date(comment.createdAt), {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {comment.replyToUsername ? (
              comment.replyToCommentId && replyToPermalink ? (
                <a
                  href={replyToPermalink}
                  onClick={handleReplyToClick}
                  className="rounded-full text-xs font-medium text-[var(--theme-color-action-secondary-foreground)] underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] dark:text-sky-300 dark:hover:text-sky-200"
                >
                  {t("thread.replyTo", { username: comment.replyToUsername })}
                </a>
              ) : (
                <span className="text-xs font-medium text-[var(--theme-color-action-secondary-foreground)] dark:text-sky-300">
                  {t("thread.replyTo", { username: comment.replyToUsername })}
                </span>
              )
            ) : null}
            {comment.editedAt && !isDeleted ? (
              <span className="text-xs text-[var(--theme-color-text-muted)]">{t("states.edited")}</span>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-2">
              <textarea
                ref={editTextareaRef}
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                maxLength={MAX_COMMENT_LENGTH}
                className="min-h-20 w-full resize-y rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 py-2 text-sm leading-6 text-[var(--theme-color-text-default)] outline-hidden transition placeholder:text-[var(--theme-color-text-muted)] selection:bg-[var(--theme-color-selection-strong-background)] selection:text-[var(--theme-color-selection-strong-foreground)] focus:border-[var(--theme-color-focus-ring)] focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:selection:bg-sky-500/40 dark:selection:text-white dark:focus:border-sky-400 dark:focus:bg-slate-900 dark:focus:text-slate-50 dark:focus:ring-sky-500/25"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs", editValue.length > 460 ? "text-[var(--theme-color-semantic-warning-foreground)]" : "text-[var(--theme-color-text-muted)]")}>
                    {editValue.length}/{MAX_COMMENT_LENGTH}
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
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] dark:hover:bg-slate-800"
                  >
                    {t("actions.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleEdit}
                    className="rounded-full bg-[var(--theme-color-action-accent-background)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-color-action-accent-foreground)] hover:bg-[var(--theme-color-action-accent-background-hover)]"
                  >
                    {t("actions.save")}
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
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--theme-color-action-secondary-foreground)] hover:bg-[var(--theme-color-action-secondary-background-hover)] dark:text-sky-300 dark:hover:bg-sky-500/10"
              >
                <Reply size={13} />
                {t("actions.reply")}
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
                  label={t("actions.addReaction")}
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
              className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Link2 size={13} />
              {t("actions.copyLink")}
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
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Edit3 size={13} />
                {t("actions.edit")}
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
                    className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--theme-color-action-destructive-foreground)] hover:bg-[var(--theme-color-action-destructive-background-hover)] dark:text-[var(--theme-color-semantic-danger-foreground-on-dark)] dark:hover:bg-red-500/10"
                  >
                    <Trash2 size={13} />
                    {t("actions.delete")}
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-120 bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
                  <Dialog.Content className="fixed left-1/2 top-1/2 z-121 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[18px] border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-default)] shadow-2xl outline-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">
                    <Dialog.Title className="px-5 py-5 text-center text-base font-semibold">
                      {t("dialogs.deleteTitle")}
                    </Dialog.Title>
                    <div className="grid grid-cols-2 border-t border-[var(--theme-color-border-subtle)] dark:border-slate-700">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="h-11 border-r border-[var(--theme-color-border-subtle)] text-sm font-semibold text-[var(--theme-color-action-destructive-foreground)] transition hover:bg-[var(--theme-color-action-destructive-background-hover)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-[var(--theme-color-semantic-danger-foreground-on-dark)] dark:hover:bg-red-500/10"
                      >
                        {t("actions.delete")}
                      </button>
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          disabled={deleting}
                          className="h-11 text-sm font-semibold text-[var(--theme-color-text-muted)] transition hover:bg-[var(--theme-color-control-background-hover)] disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {t("actions.cancel")}
                        </button>
                      </Dialog.Close>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            ) : null}
          </div>

          {actionError ? <div className="mt-2 text-xs text-[var(--theme-color-semantic-danger-foreground)] dark:text-[var(--theme-color-semantic-danger-foreground-on-dark)]">{actionError}</div> : null}

          {replying ? (
            <div className="mt-3">
              <CommentComposer
                placeholder={t("composer.replyPlaceholder")}
                submitLabel={t("actions.reply")}
                autoFocus
                onCancel={() => setReplying(false)}
                onSubmit={handleSubmitReply}
              />
            </div>
          ) : null}

          {visibleReplies.length > 0 ? (
            <div className="mt-3 -ml-5.5 space-y-3 border-l border-[var(--theme-color-border-subtle)] pl-2 sm:ml-0 sm:pl-3 dark:border-slate-700">
              {visibleReplies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  buildPermalink={buildPermalink}
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
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-action-secondary-background)] px-3 text-xs font-semibold text-[var(--theme-color-action-secondary-foreground)] shadow-xs transition hover:bg-[var(--theme-color-action-secondary-background-hover)] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300"
            >
              <MoreHorizontal size={14} />
              {loadingReplies[threadRootId]
                ? t("states.loading")
                : loadedReplies?.hasMore
                  ? t("pagination.loadMoreReplies", { count: COMMENT_PAGE_SIZE })
                  : t("pagination.expandReplies", { count: hiddenReplyCount })}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
});
