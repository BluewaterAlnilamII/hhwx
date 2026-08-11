"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import { useCommentReactionParticipants } from "@/hooks/useCommentReactionParticipants";
import type { CommentReactionParticipantPageLoader } from "@/hooks/useCommentReactionParticipants";
import type { CommentReactionSummary } from "@/lib/comments/comment-contract";
import { cn } from "@/lib/utils";
import { CommentReactionEmoji } from "./CommentReactionEmoji";

export type CommentReactionsDialogProps = {
  commentId: string;
  initialEmojiKey: string;
  reactions: CommentReactionSummary[];
  loadParticipants: CommentReactionParticipantPageLoader;
  onClose: () => void;
};

function sortReactions(reactions: CommentReactionSummary[]): CommentReactionSummary[] {
  return reactions
    .map((reaction, originalIndex) => ({ reaction, originalIndex }))
    .sort((left, right) => (
      right.reaction.count - left.reaction.count
      || left.originalIndex - right.originalIndex
    ))
    .map(({ reaction }) => reaction);
}

export function CommentReactionsDialog({
  commentId,
  initialEmojiKey,
  reactions,
  loadParticipants,
  onClose,
}: CommentReactionsDialogProps) {
  const t = useTranslations("comments");
  const [orderedReactions] = useState(() => sortReactions(reactions));
  const contentRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const {
    selectedEmojiKey,
    selectedPage,
    selectEmoji,
    loadMore,
    retry,
  } = useCommentReactionParticipants({
    commentId,
    initialEmojiKey,
    reactions: orderedReactions,
    loadParticipants,
  });
  const selectedReaction = orderedReactions.find(
    (reaction) => reaction.emojiKey === selectedEmojiKey,
  ) ?? orderedReactions[0];

  useEffect(() => {
    const root = listRef.current;
    const sentinel = sentinelRef.current;
    if (
      !root
      || !sentinel
      || !selectedPage?.isInitialized
      || !selectedPage.hasMore
      || selectedPage.isLoading
      || selectedPage.hasError
    ) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    }, {
      root,
      rootMargin: "0px 0px 160px 0px",
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, selectedEmojiKey, selectedPage]);

  const handleSelectEmoji = (emojiKey: string) => {
    listRef.current?.scrollTo({ top: 0 });
    selectEmoji(emojiKey);
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-130 bg-slate-950/55 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          ref={contentRef}
          data-testid="comment-reactions-dialog"
          aria-describedby={undefined}
          tabIndex={-1}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-131 flex h-[min(42rem,88dvh)] flex-col overflow-hidden rounded-t-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-default)] shadow-2xl outline-hidden data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:h-[min(38rem,calc(100dvh-3rem))] sm:w-[min(34rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=closed]:fade-out sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:fade-in sm:data-[state=open]:zoom-in-95 dark:border-slate-700 dark:bg-[#232428] dark:text-slate-50"
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--theme-color-border-subtle)] px-5 dark:border-white/10">
            <Dialog.Title className="text-lg font-bold tracking-tight">
              {t("dialogs.reactionsTitle")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t("actions.close")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--theme-color-text-muted)] transition hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <div
              aria-label={t("reactions.filtersLabel")}
              className="shrink-0 overflow-x-auto border-b border-[var(--theme-color-border-subtle)] p-2 sm:w-[98px] sm:overflow-x-hidden sm:overflow-y-auto sm:border-r sm:border-b-0 dark:border-white/10"
            >
              <div className="flex min-w-max gap-1 sm:min-w-0 sm:flex-col">
                {orderedReactions.map((reaction) => {
                  const isSelected = reaction.emojiKey === selectedEmojiKey;
                  return (
                    <button
                      key={reaction.emojiKey}
                      type="button"
                      data-testid={`reaction-filter-${reaction.emojiKey}`}
                      aria-pressed={isSelected}
                      aria-label={t("reactions.filterLabel", {
                        emoji: reaction.emojiKey,
                        count: reaction.count,
                      })}
                      onClick={() => handleSelectEmoji(reaction.emojiKey)}
                      className={cn(
                        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] sm:w-full sm:justify-between sm:gap-1.5 sm:px-2",
                        isSelected
                          ? "bg-[var(--theme-color-control-background-hover)] text-[var(--theme-color-text-default)] dark:bg-white/10 dark:text-white"
                          : "text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white",
                      )}
                    >
                      <CommentReactionEmoji emojiKey={reaction.emojiKey} size={21} />
                      <span className="pr-1 tabular-nums sm:min-w-[4ch] sm:text-right">
                        {reaction.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              ref={listRef}
              data-testid="reaction-participant-list"
              aria-label={selectedReaction ? t("reactions.participantsLabel", {
                emoji: selectedReaction.emojiKey,
              }) : undefined}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 sm:px-3"
            >
              {(selectedPage?.users ?? []).map((user) => (
                <div
                  key={`${selectedEmojiKey}-${user.userId}`}
                  data-testid="reaction-participant-row"
                  className="flex min-h-13 items-center gap-3 rounded-xl px-2.5 py-2 text-sm [contain-intrinsic-size:auto_52px] [content-visibility:auto] hover:bg-[var(--theme-color-control-background-hover)] dark:hover:bg-white/5"
                >
                  <AccountCardAvatar
                    username={user.username}
                    cardId={user.avatar.cardId}
                    entityServer={user.avatar.entityServer}
                    trainType={user.avatar.trainType}
                    size="toolbar"
                    className="h-9 w-9 ring-1 ring-[var(--theme-color-border-subtle)] dark:ring-white/15"
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold text-[var(--theme-color-text-default)] dark:text-slate-100">
                    {user.username ?? t("states.anonymous")}
                  </span>
                </div>
              ))}

              {selectedPage?.isLoading ? (
                <div
                  aria-live="polite"
                  className="flex h-12 items-center justify-center gap-2 text-xs font-semibold text-[var(--theme-color-text-muted)] dark:text-slate-400"
                >
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                  {t("reactions.loadingMore")}
                </div>
              ) : null}

              {selectedPage?.hasError ? (
                <div className="flex min-h-14 items-center justify-center">
                  <button
                    type="button"
                    onClick={retry}
                    className="rounded-full border border-[var(--theme-color-semantic-danger-border)] bg-[var(--theme-color-semantic-danger-background)] px-4 py-2 text-xs font-semibold text-[var(--theme-color-semantic-danger-foreground)] transition hover:brightness-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200"
                  >
                    {t("reactions.loadFailedRetry")}
                  </button>
                </div>
              ) : null}

              {selectedPage?.isInitialized
                && !selectedPage.isLoading
                && !selectedPage.hasError
                && selectedPage.users.length === 0 ? (
                  <div className="flex h-28 items-center justify-center text-sm text-[var(--theme-color-text-muted)] dark:text-slate-400">
                    {t("reactions.empty")}
                  </div>
                ) : null}

              <div ref={sentinelRef} data-testid="reaction-load-sentinel" className="h-px" />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
