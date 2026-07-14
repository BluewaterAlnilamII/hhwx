"use client";

import { useCallback } from "react";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";
import { COMMENT_ROOT_PAGE_SIZE } from "./commentTypes";
import { useCommentThread } from "./useCommentThread";

export default function EventComments({ eventId }: { eventId: number | null }) {
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
  } = useCommentThread(eventId);

  const handleCreateRootComment = useCallback((content: string) => createComment(content, null), [createComment]);
  const handleCreateReply = useCallback((parentId: string, content: string) => createComment(content, parentId), [createComment]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-[#fffef4] p-4 shadow-[0_16px_44px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950 sm:p-5">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="inline-flex items-center gap-2 text-xl font-black text-slate-900 dark:text-white">
          <MessageSquare size={20} className="text-sky-600 dark:text-sky-300" />
          活动评论
          <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">（{totalCommentCount}）</span>
        </h2>
      </div>

      <div className="mt-4">
        {!authReady ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            正在读取登录状态...
          </div>
        ) : userId && emailVerified ? (
          <CommentComposer
            placeholder={`以 ${username ?? "当前账号"} 发表主评论...`}
            submitLabel="发布评论"
            onSubmit={handleCreateRootComment}
          />
        ) : userId ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            完成邮箱验证后可以发表评论和回复。
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            登录后可以发表评论，并启用30秒频率的高频活动榜榜线更新
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            eventId={eventId ?? 0}
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
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-900/50">
            还没有评论，来留下本期活动的第一条讨论。
          </div>
        ) : null}
      </div>

      {totalCount > COMMENT_ROOT_PAGE_SIZE ? (
        <div className="mt-5 flex justify-center">
          <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => goToCommentPage(1)}
              disabled={loading || currentPage <= 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300 dark:disabled:text-slate-600"
              aria-label="第一页"
              title="第一页"
            >
              <ChevronFirst size={16} />
            </button>
            <button
              type="button"
              onClick={() => goToCommentPage(currentPage - 1)}
              disabled={loading || currentPage <= 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300 dark:disabled:text-slate-600"
              aria-label="上一页"
              title="上一页"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex h-8 min-w-28 items-center justify-center rounded-full bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-sky-200 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
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
                className="h-6 w-10 rounded-md border border-transparent bg-transparent text-center text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-200 focus:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-slate-200 dark:focus:border-slate-600 dark:focus:bg-slate-900"
              />
              <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
              <span className="min-w-8 text-center">{totalPages}</span>
            </div>
            <button
              type="button"
              onClick={() => goToCommentPage(currentPage + 1)}
              disabled={loading || currentPage >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300 dark:disabled:text-slate-600"
              aria-label="下一页"
              title="下一页"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => goToCommentPage(totalPages)}
              disabled={loading || currentPage >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300 dark:disabled:text-slate-600"
              aria-label="最后一页"
              title="最后一页"
            >
              <ChevronLast size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {loading && comments.length > 0 ? (
        <div className="mt-3 text-center text-xs text-slate-400">加载中</div>
      ) : null}
    </section>
  );
}
