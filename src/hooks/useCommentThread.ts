"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useCommentStampCatalog } from "@/hooks/useCommentStamps";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { getSafeSession } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";
import { buildCommentStampLookup } from "@/lib/comments/comment-content";
import type {
  CommentContextResponse,
  CommentListResponse,
  CommentNode,
  CommentReactionState,
} from "@/lib/comments/comment-contract";

export type CommentThreadLocation = {
  page: number;
  commentId: string | null;
};

type UseCommentThreadOptions = {
  apiBase: string | null;
  apiQuery: string;
  targetKey: string;
  readLocation: () => CommentThreadLocation;
  updateLocation: (location: CommentThreadLocation) => void;
};

function getErrorMessage(payload: unknown, fallback: string): string {
  return getApiErrorMessage(payload) ?? fallback;
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

async function requestJson<T>(
  url: string,
  requestFailedMessage: (status: number) => string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  const data = parseApiSuccessData<T>(payload);
  if (!response.ok || data === null) {
    throw new Error(getErrorMessage(payload, requestFailedMessage(response.status)));
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

function updateCommentReaction(nodes: CommentNode[], reaction: CommentReactionState): CommentNode[] {
  return nodes.map((node) => {
    if (node.id === reaction.commentId) {
      return {
        ...node,
        reactions: reaction.reactions,
      };
    }

    return { ...node, previewReplies: updateCommentReaction(node.previewReplies, reaction) };
  });
}

function mapReplyComments(
  current: Record<string, CommentListResponse>,
  mapComments: (comments: CommentNode[]) => CommentNode[],
): Record<string, CommentListResponse> {
  return Object.fromEntries(
    Object.entries(current).map(([parentId, response]) => [
      parentId,
      { ...response, comments: mapComments(response.comments) },
    ]),
  );
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

function scrollToRenderedComment(commentId: string): boolean {
  const element = document.getElementById(`comment-${commentId}`);
  if (!element) {
    return false;
  }

  element.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

function scrollToCommentAfterRender(commentId: string) {
  window.setTimeout(() => {
    document.getElementById(`comment-${commentId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 80);
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

function buildCommentApiUrl(
  apiBase: string,
  apiQuery: string,
  path = "",
  values: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams(apiQuery);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, value);
  }
  return `${apiBase}${path}?${params.toString()}`;
}

export function useCommentThread({
  apiBase,
  apiQuery,
  targetKey,
  readLocation,
  updateLocation,
}: UseCommentThreadOptions) {
  const t = useTranslations("comments");
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalCommentCount, setTotalCommentCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, CommentListResponse>>({});
  const [loadingReplies, setLoadingReplies] = useState<Record<string, boolean>>({});
  const commentsRef = useRef<CommentNode[]>([]);
  const currentPageRef = useRef(1);
  const targetGenerationRef = useRef(0);
  const rootLoadSequenceRef = useRef(0);
  const replyLoadsInFlightRef = useRef<Set<string>>(new Set());
  const pendingCommentScrollIdRef = useRef<string | null>(null);
  const { userId, username, emailVerified, authReady } = useGameStore();
  const requestFailedMessage = useCallback(
    (status: number) => t("errors.requestFailed", { status }),
    [t],
  );

  const { catalog: stampCatalog } = useCommentStampCatalog(Boolean(apiBase && comments.length > 0));
  const stampLookup = useMemo(() => buildCommentStampLookup(stampCatalog), [stampCatalog]);

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    const commentId = pendingCommentScrollIdRef.current;
    if (!commentId || focusedCommentId !== commentId) return;

    // Linked comments can finish loading before React commits the target node.
    // Retry after relevant comment state commits and cancel obsolete frames.
    const animationFrame = window.requestAnimationFrame(() => {
      if (
        pendingCommentScrollIdRef.current === commentId
        && scrollToRenderedComment(commentId)
      ) {
        pendingCommentScrollIdRef.current = null;
      }
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [comments, focusedCommentId, replies]);

  const loadRootComments = useCallback(async (page = 1): Promise<CommentListResponse | null> => {
    if (!apiBase) return null;
    const requestId = rootLoadSequenceRef.current + 1;
    rootLoadSequenceRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const headers = await authHeaders();
      const data = await requestJson<CommentListResponse>(
        buildCommentApiUrl(apiBase, apiQuery, "", {
          page: String(Math.max(1, Math.trunc(page))),
        }),
        requestFailedMessage,
        { headers },
      );
      if (requestId !== rootLoadSequenceRef.current) {
        return null;
      }

      setComments(data.comments);
      setCurrentPage(data.page ?? page);
      setTotalPages(data.totalPages ?? 1);
      setTotalCount(data.totalCount ?? data.comments.length);
      setTotalCommentCount(data.totalCommentCount ?? data.totalCount ?? data.comments.length);
      return data;
    } catch (err) {
      if (requestId === rootLoadSequenceRef.current) {
        setError(err instanceof Error ? err.message : t("errors.loadFailed"));
      }
      return null;
    } finally {
      if (requestId === rootLoadSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [apiBase, apiQuery, requestFailedMessage, t]);

  const locateLinkedComment = useCallback(async (
    commentId: string,
    options: { expectedPage?: number; silent?: boolean } = {},
  ): Promise<number | null> => {
    if (!apiBase) return null;
    const generation = targetGenerationRef.current;
    pendingCommentScrollIdRef.current = commentId;
    setFocusedCommentId(commentId);
    if (scrollToRenderedComment(commentId)) {
      pendingCommentScrollIdRef.current = null;
      return currentPageRef.current;
    }

    try {
      const headers = await authHeaders();
      const data = await requestJson<CommentContextResponse>(
        buildCommentApiUrl(apiBase, apiQuery, `/${commentId}`),
        requestFailedMessage,
        { headers },
      );
      if (generation !== targetGenerationRef.current) {
        return null;
      }

      if (options.expectedPage !== undefined && data.rootPage !== options.expectedPage) {
        pendingCommentScrollIdRef.current = null;
        setFocusedCommentId(null);
        return null;
      }

      const contextRoot = buildContextThread(data);
      const rootVisible = commentsRef.current.some((comment) => comment.id === contextRoot.id);
      if (data.rootPage !== currentPageRef.current || !rootVisible) {
        const pageData = await loadRootComments(data.rootPage);
        if (generation !== targetGenerationRef.current || !pageData) {
          return null;
        }
      }
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
      return data.rootPage;
    } catch (err) {
      if (generation !== targetGenerationRef.current) {
        return null;
      }

      pendingCommentScrollIdRef.current = null;
      setFocusedCommentId(null);
      if (options.silent) {
        return null;
      }
      setError(err instanceof Error ? err.message : t("errors.locateFailed"));
      return null;
    }
  }, [apiBase, apiQuery, loadRootComments, requestFailedMessage, t]);

  const navigateToComment = useCallback(async (commentId: string) => {
    const generation = targetGenerationRef.current;
    const locatedPage = await locateLinkedComment(commentId, {
      expectedPage: currentPageRef.current,
      silent: true,
    });
    if (generation !== targetGenerationRef.current) {
      return;
    }

    updateLocation({
      page: locatedPage ?? currentPageRef.current,
      commentId: locatedPage !== null ? commentId : null,
    });
  }, [locateLinkedComment, updateLocation]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    targetGenerationRef.current += 1;
    rootLoadSequenceRef.current += 1;
    replyLoadsInFlightRef.current.clear();
    const generation = targetGenerationRef.current;

    setComments([]);
    setReplies({});
    setCurrentPage(1);
    setPageInput("1");
    setTotalPages(1);
    setTotalCount(0);
    setTotalCommentCount(0);
    setLoading(false);
    setLoadingReplies({});
    setError("");
    pendingCommentScrollIdRef.current = null;
    setFocusedCommentId(null);
    if (!apiBase) return;

    const { page: requestedPage, commentId } = readLocation();
    void (async () => {
      if (commentId) {
        // Comment IDs are stable while reverse-sorted page numbers drift as new roots arrive.
        // Resolve the comment before loading a potentially stale or invalid requested page.
        const locatedPage = await locateLinkedComment(commentId, {
          silent: true,
        });
        if (generation !== targetGenerationRef.current) {
          return;
        }

        if (locatedPage !== null) {
          updateLocation({
            page: locatedPage,
            commentId,
          });
          return;
        }
      }

      const data = await loadRootComments(requestedPage);
      if (generation !== targetGenerationRef.current || !data) {
        return;
      }

      const loadedPage = data.page ?? requestedPage;
      updateLocation({ page: loadedPage, commentId: null });
    })();
  }, [apiBase, loadRootComments, locateLinkedComment, readLocation, targetKey, updateLocation]);

  const createComment = useCallback(async (content: string, parentId?: string | null) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const created = await requestJson<CommentNode>(
      buildCommentApiUrl(apiBase, apiQuery),
      requestFailedMessage,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ content, parentId }),
      },
    );

    if (parentId) {
      const rootId = findThreadRootId(commentsRef.current, created) ?? parentId;
      setTotalCommentCount((value) => value + 1);
      setComments((current) => bumpThreadReplyCount(current, rootId, created));
      setReplies((current) => {
        const existing = current[rootId];
        if (!existing) {
          const root = findComment(commentsRef.current, rootId);
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
      updateLocation({
        page: currentPageRef.current,
        commentId: created.id,
      });
      scrollToCommentAfterRender(created.id);
      return;
    }

    const createdPage = 1;
    await loadRootComments(createdPage);
    setFocusedCommentId(created.id);
    updateLocation({
      page: createdPage,
      commentId: created.id,
    });
    scrollToCommentAfterRender(created.id);
  }, [apiBase, apiQuery, loadRootComments, requestFailedMessage, updateLocation]);

  const updateCommentContent = useCallback(async (commentId: string, content: string) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const updated = await requestJson<CommentNode>(
      buildCommentApiUrl(apiBase, apiQuery, `/${commentId}`),
      requestFailedMessage,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      },
    );
    setComments((current) => replaceComment(current, updated));
    setReplies((current) => mapReplyComments(current, (comments) => replaceComment(comments, updated)));
  }, [apiBase, apiQuery, requestFailedMessage]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const updated = await requestJson<CommentNode>(
      buildCommentApiUrl(apiBase, apiQuery, `/${commentId}`),
      requestFailedMessage,
      { method: "DELETE", headers },
    );
    setComments((current) => replaceComment(current, updated));
    setReplies((current) => mapReplyComments(current, (comments) => replaceComment(comments, updated)));
  }, [apiBase, apiQuery, requestFailedMessage]);

  const toggleCommentReaction = useCallback(async (commentId: string, emojiKey: string, reactedByViewer: boolean) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const reaction = await requestJson<CommentReactionState>(
      buildCommentApiUrl(apiBase, apiQuery, `/${commentId}/reactions/${encodeURIComponent(emojiKey)}`),
      requestFailedMessage,
      { method: reactedByViewer ? "DELETE" : "PUT", headers },
    );

    setComments((current) => updateCommentReaction(current, reaction));
    setReplies((current) => mapReplyComments(current, (comments) => updateCommentReaction(comments, reaction)));
  }, [apiBase, apiQuery, requestFailedMessage]);

  const loadReplies = useCallback(async (commentId: string, cursor?: string | null) => {
    if (!apiBase || replyLoadsInFlightRef.current.has(commentId)) return;
    const generation = targetGenerationRef.current;
    replyLoadsInFlightRef.current.add(commentId);
    setLoadingReplies((current) => ({ ...current, [commentId]: true }));
    try {
      const headers = await authHeaders();
      const data = await requestJson<CommentListResponse>(
        buildCommentApiUrl(apiBase, apiQuery, `/${commentId}/replies`, {
          cursor: cursor ?? undefined,
        }),
        requestFailedMessage,
        { headers },
      );
      if (generation !== targetGenerationRef.current) {
        return;
      }

      setReplies((current) => {
        const existing = current[commentId];
        return {
          ...current,
          [commentId]: {
            comments: cursor && existing ? mergePreviewReplies(existing.comments, data.comments) : data.comments,
            nextCursor: data.nextCursor,
            hasMore: data.hasMore,
          },
        };
      });
    } finally {
      replyLoadsInFlightRef.current.delete(commentId);
      if (generation === targetGenerationRef.current) {
        setLoadingReplies((current) => ({ ...current, [commentId]: false }));
      }
    }
  }, [apiBase, apiQuery, requestFailedMessage]);

  const goToCommentPage = useCallback((page: number) => {
    const nextPage = Math.min(totalPages, Math.max(1, Math.trunc(page)));
    setPageInput(String(nextPage));
    pendingCommentScrollIdRef.current = null;
    setFocusedCommentId(null);
    updateLocation({
      page: nextPage,
      commentId: null,
    });
    void loadRootComments(nextPage);
  }, [loadRootComments, totalPages, updateLocation]);

  const submitPageInput = useCallback(() => {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    const nextPage = Math.min(totalPages, Math.max(1, parsed));
    setPageInput(String(nextPage));
    if (nextPage !== currentPage) {
      goToCommentPage(nextPage);
    }
  }, [currentPage, goToCommentPage, pageInput, totalPages]);

  return {
    authReady,
    canReact: Boolean(userId && emailVerified),
    comments,
    currentPage,
    createComment,
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
  };
}
