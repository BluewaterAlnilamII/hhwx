"use client";

import { useCallback } from "react";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import Heading from "@/components/Heading";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";
import { COMMENT_ROOT_PAGE_SIZE } from "./commentTypes";
import { useCommentThread } from "./useCommentThread";
import type { BandoriServer } from "@/lib/bandori-server";

const paginationButtonClassName = "inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--theme-color-text-muted)] transition hover:bg-[var(--theme-color-control-background)] hover:text-[var(--theme-color-action-secondary-foreground)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export default function EventComments({ eventId, server }: { eventId: number | null; server: BandoriServer }) {
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
    loadReplies,
    navigateToComment,
    pageInput,
    replies,
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
  } = useCommentThread(eventId, server);

  const handleCreateRootComment = useCallback((content: string) => createComment(content, null), [createComment]);
  const handleCreateReply = useCallback((parentId: string, content: string) => createComment(content, parentId), [createComment]);

  return (
    <section className="rounded-3xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-surface-background)] p-4 shadow-[0_16px_44px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="flex flex-col gap-3 border-b border-[var(--theme-color-border-subtle)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <Heading as="h2" visualRole="section" accentSlot="a" icon={<MessageSquare size={20} />}>
          活动评论
          <span className="text-sm font-semibold text-[var(--theme-color-text-muted)]">（{totalCommentCount}）</span>
        </Heading>
      </div>

      <div className="mt-4">
        {!authReady ? (
          <div className="rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] p-4 text-center text-sm font-semibold text-[var(--theme-color-text-muted)]">
            正在读取登录状态...
          </div>
        ) : userId && emailVerified ? (
          <CommentComposer
            placeholder={`以 ${username ?? "当前账号"} 发表主评论...`}
            submitLabel="发布评论"
            onSubmit={handleCreateRootComment}
          />
        ) : userId ? (
          <div className="rounded-2xl border border-[var(--theme-color-feedback-warning-border)] bg-[var(--theme-color-feedback-warning-background)] p-4 text-center text-sm font-medium text-[var(--theme-color-feedback-warning-foreground)]">
            完成邮箱验证后可以发表评论和回复
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] p-4 text-center text-sm font-semibold text-[var(--theme-color-text-muted)]">
            登录后可以发表评论，并启用30秒频率的高频活动榜榜线更新
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-[var(--theme-color-feedback-error-border)] bg-[var(--theme-color-feedback-error-background)] p-3 text-sm text-[var(--theme-color-feedback-error-foreground)]">
          {error}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            eventId={eventId ?? 0}
            server={server}
            highlightedId={focusedCommentId}
            replies={replies}
            loadingReplies={loadingReplies}
            stampLookup={stampLookup}
            canReact={canReact}
            commentPage={currentPage}
            onCreateReply={handleCreateReply}
            onToggleReaction={toggleCommentReaction}
            onUpdate={updateCommentContent}
            onDelete={deleteComment}
            onLoadReplies={loadReplies}
            onLocateComment={navigateToComment}
          />
        ))}

        {!loading && comments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] py-10 text-center text-sm font-semibold text-[var(--theme-color-text-muted)]">
            还没有评论，来留下本期活动的第一条讨论
          </div>
        ) : null}
      </div>

      {totalCount > COMMENT_ROOT_PAGE_SIZE ? (
        <div className="mt-5 flex justify-center">
          <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] p-1 shadow-xs">
            <button
              type="button"
              onClick={() => goToCommentPage(1)}
              disabled={loading || currentPage <= 1}
              className={paginationButtonClassName}
              aria-label="第一页"
              title="第一页"
            >
              <ChevronFirst size={16} />
            </button>
            <button
              type="button"
              onClick={() => goToCommentPage(currentPage - 1)}
              disabled={loading || currentPage <= 1}
              className={paginationButtonClassName}
              aria-label="上一页"
              title="上一页"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex h-8 min-w-28 items-center justify-center rounded-full bg-[var(--theme-color-control-background)] px-3 text-sm font-semibold text-[var(--theme-color-text-default)] shadow-xs ring-1 ring-inset ring-[var(--theme-color-action-secondary-border)]">
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
                aria-label="跳转到页码"
                title="输入页码后按回车跳转"
                className="h-6 w-10 rounded-md border border-transparent bg-transparent text-center text-sm font-semibold text-[var(--theme-color-text-default)] outline-hidden transition focus:border-[var(--theme-color-action-secondary-border)] focus:bg-[var(--theme-color-control-background-hover)] disabled:cursor-not-allowed disabled:text-[var(--theme-color-text-muted)]"
              />
              <span className="mx-1 text-[var(--theme-color-text-muted)] opacity-50">/</span>
              <span className="min-w-8 text-center">{totalPages}</span>
            </div>
            <button
              type="button"
              onClick={() => goToCommentPage(currentPage + 1)}
              disabled={loading || currentPage >= totalPages}
              className={paginationButtonClassName}
              aria-label="下一页"
              title="下一页"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => goToCommentPage(totalPages)}
              disabled={loading || currentPage >= totalPages}
              className={paginationButtonClassName}
              aria-label="最后一页"
              title="最后一页"
            >
              <ChevronLast size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {loading && comments.length > 0 ? (
        <div className="mt-3 text-center text-xs text-[var(--theme-color-text-muted)]">加载中</div>
      ) : null}
    </section>
  );
}
