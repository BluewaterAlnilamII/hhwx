"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CircleX,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Heading from "@/components/Heading";
import { useBandoriDegreeCatalog } from "@/hooks/useBandoriDegrees";
import type { CommentThreadLocation } from "@/hooks/useCommentThread";
import { useCommentThread } from "@/hooks/useCommentThread";
import type { AccountDisplayDegreeSelection } from "@/lib/account-display-degree";
import {
  getBandoriDegreeCatalogItemsForRegion,
  type BandoriDegreeCatalogItem,
} from "@/lib/bandori-degree-assets";
import { BANDORI_SERVERS, getBandoriServerCode } from "@/lib/bandori-server";
import { COMMENT_PAGE_SIZE } from "@/lib/comments/comment-contract";
import { buildCommentDraftStorageKey } from "@/lib/comments/comment-drafts";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";

const paginationButtonClassName = "inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--theme-color-text-default)] transition hover:bg-[var(--theme-color-surface-background)] hover:text-[var(--theme-color-action-secondary-foreground)] active:bg-[var(--theme-color-surface-background)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-[var(--theme-color-text-muted)] disabled:opacity-25 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-[var(--theme-color-action-secondary-foreground-on-dark)]";
const REFRESH_SUCCESS_DURATION_MS = 2_000;
const REFRESH_ERROR_DURATION_MS = 4_000;

function getDisplayDegreeKey(
  selection: Pick<AccountDisplayDegreeSelection, "server" | "degreeId">,
): string {
  return `${selection.server}:${selection.degreeId}`;
}

type RefreshState = {
  targetKey: string;
  phase: "pending" | "success" | "error";
};

type CommentThreadProps = {
  apiBase: string | null;
  apiQuery: string;
  targetKey: string;
  readLocation: () => CommentThreadLocation;
  updateLocation: (location: CommentThreadLocation) => void;
  buildPermalink: (commentId: string, page: number) => string;
  title: string;
  signedOutMessage: string;
  emptyMessage: string;
};

export default function CommentThread({
  apiBase,
  apiQuery,
  targetKey,
  readLocation,
  updateLocation,
  buildPermalink,
  title,
  signedOutMessage,
  emptyMessage,
}: CommentThreadProps) {
  const t = useTranslations("comments");
  const [refreshState, setRefreshState] = useState<RefreshState | null>(null);
  const refreshSequenceRef = useRef(0);
  const refreshFeedbackTimerRef = useRef<number | null>(null);
  const {
    authReady,
    canReact,
    comments,
    createComment,
    currentPage,
    deleteComment,
    emailVerified,
    error,
    focusedCommentId,
    goToCommentPage,
    loading,
    loadingReplies,
    loadReactionParticipants,
    loadReplies,
    navigateToComment,
    pageInput,
    replies,
    refreshComments,
    setPageInput,
    stampLookup,
    submitPageInput,
    toggleCommentReaction,
    totalCommentCount,
    totalCount,
    totalPages,
    updateCommentContent,
    userId,
    username,
  } = useCommentThread({ apiBase, apiQuery, targetKey, readLocation, updateLocation });
  const { catalog: degreeCatalog } = useBandoriDegreeCatalog(comments.length > 0);
  const degreesBySelection = useMemo(() => {
    const result = new Map<string, BandoriDegreeCatalogItem>();
    for (const server of BANDORI_SERVERS) {
      for (const degree of getBandoriDegreeCatalogItemsForRegion(
        degreeCatalog,
        getBandoriServerCode(server),
      )) {
        result.set(getDisplayDegreeKey({ server, degreeId: degree.id }), degree);
      }
    }
    return result;
  }, [degreeCatalog]);
  const resolveDisplayDegree = useCallback(
    (selection: AccountDisplayDegreeSelection) => (
      degreesBySelection.get(getDisplayDegreeKey(selection)) ?? null
    ),
    [degreesBySelection],
  );

  const handleCreateRootComment = useCallback((content: string) => createComment(content, null), [createComment]);
  const handleCreateReply = useCallback((parentId: string, content: string) => createComment(content, parentId), [createComment]);
  const visibleRefreshPhase = refreshState?.targetKey === targetKey
    ? refreshState.phase
    : null;
  const draftTargetKey = `${apiBase ?? "disabled"}?${apiQuery}`;
  const rootDraftStorageKey = userId && apiBase
    ? buildCommentDraftStorageKey({ userId, targetKey: draftTargetKey })
    : null;

  const handleRefresh = useCallback(async () => {
    const sequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = sequence;
    if (refreshFeedbackTimerRef.current !== null) {
      window.clearTimeout(refreshFeedbackTimerRef.current);
      refreshFeedbackTimerRef.current = null;
    }
    setRefreshState({ targetKey, phase: "pending" });

    const succeeded = await refreshComments();
    if (sequence !== refreshSequenceRef.current) return;

    const phase = succeeded ? "success" : "error";
    setRefreshState({ targetKey, phase });
    refreshFeedbackTimerRef.current = window.setTimeout(() => {
      if (sequence === refreshSequenceRef.current) {
        setRefreshState(null);
      }
      refreshFeedbackTimerRef.current = null;
    }, succeeded ? REFRESH_SUCCESS_DURATION_MS : REFRESH_ERROR_DURATION_MS);
  }, [refreshComments, targetKey]);

  useEffect(() => () => {
    refreshSequenceRef.current += 1;
    if (refreshFeedbackTimerRef.current !== null) {
      window.clearTimeout(refreshFeedbackTimerRef.current);
    }
  }, []);

  return (
    <section className="rounded-3xl border border-[var(--theme-color-border-subtle)] bg-[#fffef4] p-2 shadow-[var(--theme-shadow-surface-raised)] sm:p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--theme-color-border-subtle)] px-2 pb-4 pt-2 sm:px-0 sm:pt-0 dark:border-slate-800">
        <Heading as="h2" visualRole="section" accentSlot="a" icon={<MessageSquare size={20} />} className="dark:text-[var(--theme-color-text-default-on-dark)]">
          {title}
          <span className="text-sm font-semibold text-[var(--theme-color-text-muted)] dark:text-[var(--theme-color-text-muted-on-dark)]">
            {t("thread.commentCount", { count: totalCommentCount })}
          </span>
        </Heading>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={apiBase === null || loading || visibleRefreshPhase === "pending"}
            aria-label={t("actions.refresh")}
            title={t("actions.refresh")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] shadow-xs transition hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <RefreshCw
              size={17}
              className={loading || visibleRefreshPhase === "pending" ? "animate-spin" : undefined}
            />
          </button>
          {visibleRefreshPhase === "success" ? (
            <div
              role="status"
              className="pointer-events-none absolute right-full top-1/2 z-20 mr-2 inline-flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--theme-color-semantic-success-border)] bg-[var(--theme-color-semantic-success-background)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-color-semantic-success-foreground)] shadow-md dark:text-[var(--theme-color-semantic-success-foreground-on-dark)]"
            >
              <CheckCircle2 size={14} aria-hidden="true" />
              {t("states.refreshSuccess")}
            </div>
          ) : visibleRefreshPhase === "error" ? (
            <div
              role="alert"
              className="pointer-events-none absolute right-full top-1/2 z-20 mr-2 inline-flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--theme-color-semantic-danger-border)] bg-[var(--theme-color-semantic-danger-background)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-color-semantic-danger-foreground)] shadow-md dark:text-[var(--theme-color-semantic-danger-foreground-on-dark)]"
            >
              <CircleX size={14} aria-hidden="true" />
              {t("states.refreshFailed")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        {!authReady ? (
          <div className="rounded-2xl border border-[var(--theme-color-semantic-neutral-border)] bg-[var(--theme-color-semantic-neutral-background)] p-4 text-center text-sm font-semibold text-[var(--theme-color-semantic-neutral-foreground)] dark:border-slate-700 dark:bg-slate-900 dark:text-[var(--theme-color-semantic-neutral-foreground-on-dark)]">
            {t("states.loadingAuth")}
          </div>
        ) : userId && emailVerified ? (
          <CommentComposer
            key={rootDraftStorageKey ?? "root-comment-composer"}
            placeholder={t("composer.rootPlaceholder", { username: username ?? t("states.currentAccount") })}
            submitLabel={t("actions.publish")}
            draftStorageKey={rootDraftStorageKey}
            onSubmit={handleCreateRootComment}
          />
        ) : userId ? (
          <div className="rounded-2xl border border-[var(--theme-color-semantic-warning-border)] bg-[var(--theme-color-semantic-warning-background)] p-4 text-center text-sm font-medium text-[var(--theme-color-semantic-warning-foreground)]">
            {t("states.verificationRequired")}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--theme-color-semantic-neutral-border)] bg-[var(--theme-color-semantic-neutral-background)] p-4 text-center text-sm font-semibold text-[var(--theme-color-semantic-neutral-foreground)] dark:border-slate-700 dark:bg-slate-900 dark:text-[var(--theme-color-semantic-neutral-foreground-on-dark)]">
            {signedOutMessage}
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-[var(--theme-color-semantic-danger-border)] bg-[var(--theme-color-semantic-danger-background)] p-3 text-sm text-[var(--theme-color-semantic-danger-foreground)]">
          {error}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            buildPermalink={buildPermalink}
            highlightedId={focusedCommentId}
            replies={replies}
            loadingReplies={loadingReplies}
            stampLookup={stampLookup}
            canReact={canReact}
            commentPage={currentPage}
            draftTargetKey={draftTargetKey}
            draftUserId={userId}
            draftUsername={username}
            resolveDisplayDegree={resolveDisplayDegree}
            onCreateReply={handleCreateReply}
            onLoadReactionParticipants={loadReactionParticipants}
            onToggleReaction={toggleCommentReaction}
            onUpdate={updateCommentContent}
            onDelete={deleteComment}
            onLoadReplies={loadReplies}
            onLocateComment={navigateToComment}
          />
        ))}

        {!loading && !error && comments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--theme-color-semantic-neutral-border)] bg-[var(--theme-color-semantic-neutral-background)] py-10 text-center text-sm font-semibold text-[var(--theme-color-semantic-neutral-foreground)] dark:border-slate-700 dark:bg-slate-900/50 dark:text-[var(--theme-color-semantic-neutral-foreground-on-dark)]">
            {emptyMessage}
          </div>
        ) : null}
      </div>

      {totalCount > COMMENT_PAGE_SIZE ? (
        <div className="mt-5 flex justify-center">
          <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] p-1 shadow-xs dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => goToCommentPage(1)}
              disabled={loading || currentPage <= 1}
              className={paginationButtonClassName}
              aria-label={t("pagination.first")}
              title={t("pagination.first")}
            >
              <ChevronFirst size={16} />
            </button>
            <button
              type="button"
              onClick={() => goToCommentPage(currentPage - 1)}
              disabled={loading || currentPage <= 1}
              className={paginationButtonClassName}
              aria-label={t("pagination.previous")}
              title={t("pagination.previous")}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex h-8 min-w-28 items-center justify-center rounded-full bg-[var(--theme-color-control-background)] px-3 text-sm font-semibold text-[var(--theme-color-text-default)] shadow-xs ring-1 ring-inset ring-[var(--theme-color-action-secondary-border)] dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))}
                onBlur={() => setPageInput(String(currentPage))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitPageInput();
                  }
                }}
                disabled={loading}
                aria-label={t("pagination.jumpLabel")}
                title={t("pagination.jumpHint")}
                className="h-6 w-10 rounded-md border border-transparent bg-transparent text-center text-sm font-semibold text-[var(--theme-color-text-default)] outline-hidden transition focus:border-[var(--theme-color-action-secondary-border)] focus:bg-[var(--theme-color-surface-background)] disabled:cursor-not-allowed disabled:text-[var(--theme-color-text-muted)] dark:text-slate-200 dark:focus:border-slate-600 dark:focus:bg-slate-900"
              />
              <span className="mx-1 text-[var(--theme-color-text-muted)] opacity-50">/</span>
              <span className="min-w-8 text-center">{totalPages}</span>
            </div>
            <button
              type="button"
              onClick={() => goToCommentPage(currentPage + 1)}
              disabled={loading || currentPage >= totalPages}
              className={paginationButtonClassName}
              aria-label={t("pagination.next")}
              title={t("pagination.next")}
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => goToCommentPage(totalPages)}
              disabled={loading || currentPage >= totalPages}
              className={paginationButtonClassName}
              aria-label={t("pagination.last")}
              title={t("pagination.last")}
            >
              <ChevronLast size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {loading && comments.length > 0 ? (
        <div className="mt-3 text-center text-xs text-[var(--theme-color-text-muted)] dark:text-[var(--theme-color-text-muted-on-dark)]">
          {t("states.loading")}
        </div>
      ) : null}
    </section>
  );
}
