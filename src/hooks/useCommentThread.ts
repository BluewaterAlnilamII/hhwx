"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useCommentStampCatalog } from "@/hooks/useCommentStamps";
import { getApiErrorCode, getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { getSafeSession } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";
import { buildCommentStampLookup } from "@/lib/comments/comment-content";
import {
  CommentRequestCancelledError,
  CommentRequestError,
  classifyLinkedCommentLocateError,
  isCommentTargetRequestCurrent,
  type CommentTargetRequest,
  type LinkedCommentLocateFailure,
} from "@/lib/comments/comment-request-guard";
import type {
  CommentContextResponse,
  CommentListResponse,
  CommentNode,
  CommentReactionParticipantListResponse,
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

type CommentReadRequest = CommentTargetRequest & {
  readGeneration: number;
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
    throw new CommentRequestError(
      response.status,
      getApiErrorCode(payload),
      getErrorMessage(payload, requestFailedMessage(response.status)),
    );
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
  const readGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const rootLoadSequenceRef = useRef(0);
  const replyLoadsInFlightRef = useRef<Set<string>>(new Set());
  const pendingCommentScrollIdRef = useRef<string | null>(null);
  const targetIdentity = JSON.stringify([targetKey, apiBase, apiQuery]);
  const currentTargetIdentityRef = useRef(targetIdentity);
  const { userId, username, emailVerified, authReady } = useGameStore();
  const requestFailedMessage = useCallback(
    (status: number) => t("errors.requestFailed", { status }),
    [t],
  );

  const { catalog: stampCatalog } = useCommentStampCatalog(Boolean(apiBase && comments.length > 0));
  const stampLookup = useMemo(() => buildCommentStampLookup(stampCatalog), [stampCatalog]);

  const captureTargetRequest = useCallback((): CommentTargetRequest => ({
    generation: targetGenerationRef.current,
    identity: targetIdentity,
  }), [targetIdentity]);

  const isTargetRequestCurrent = useCallback((request: CommentTargetRequest): boolean => (
    isCommentTargetRequestCurrent(
      request,
      {
        generation: targetGenerationRef.current,
        identity: currentTargetIdentityRef.current,
      },
      mountedRef.current,
    )
  ), []);

  const captureReadRequest = useCallback((): CommentReadRequest => ({
    ...captureTargetRequest(),
    readGeneration: readGenerationRef.current,
  }), [captureTargetRequest]);

  const isReadRequestCurrent = useCallback((request: CommentReadRequest): boolean => (
    isTargetRequestCurrent(request)
    && request.readGeneration === readGenerationRef.current
  ), [isTargetRequestCurrent]);

  useLayoutEffect(() => {
    if (currentTargetIdentityRef.current === targetIdentity) return;

    // Layout effects run only for committed renders and before async callbacks
    // can resume, avoiding both stale commits and render-phase ref mutation.
    currentTargetIdentityRef.current = targetIdentity;
    targetGenerationRef.current += 1;
    readGenerationRef.current += 1;
  }, [targetIdentity]);

  useLayoutEffect(() => {
    const replyLoadsInFlight = replyLoadsInFlightRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      targetGenerationRef.current += 1;
      readGenerationRef.current += 1;
      rootLoadSequenceRef.current += 1;
      replyLoadsInFlight.clear();
    };
  }, []);

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

  const loadRootComments = useCallback(async (
    page = 1,
    expectedTarget = captureTargetRequest(),
  ): Promise<CommentListResponse | null> => {
    if (!apiBase || !isTargetRequestCurrent(expectedTarget)) return null;
    const requestId = rootLoadSequenceRef.current + 1;
    rootLoadSequenceRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const headers = await authHeaders();
      if (!isTargetRequestCurrent(expectedTarget)) return null;
      const data = await requestJson<CommentListResponse>(
        buildCommentApiUrl(apiBase, apiQuery, "", {
          page: String(Math.max(1, Math.trunc(page))),
        }),
        requestFailedMessage,
        { headers },
      );
      if (
        !isTargetRequestCurrent(expectedTarget)
        || requestId !== rootLoadSequenceRef.current
      ) {
        return null;
      }

      setComments(data.comments);
      setCurrentPage(data.page ?? page);
      setTotalPages(data.totalPages ?? 1);
      setTotalCount(data.totalCount ?? data.comments.length);
      setTotalCommentCount(data.totalCommentCount ?? data.totalCount ?? data.comments.length);
      return data;
    } catch (err) {
      if (
        isTargetRequestCurrent(expectedTarget)
        && requestId === rootLoadSequenceRef.current
      ) {
        setError(err instanceof Error ? err.message : t("errors.loadFailed"));
      }
      return null;
    } finally {
      if (
        isTargetRequestCurrent(expectedTarget)
        && requestId === rootLoadSequenceRef.current
      ) {
        setLoading(false);
      }
    }
  }, [apiBase, apiQuery, captureTargetRequest, isTargetRequestCurrent, requestFailedMessage, t]);

  const locateLinkedComment = useCallback(async (
    commentId: string,
    options: {
      expectedPage?: number;
      silent?: boolean;
      onFailure?: (failure: LinkedCommentLocateFailure) => void;
    } = {},
  ): Promise<number | null> => {
    if (!apiBase) return null;
    const requestTarget = captureReadRequest();
    pendingCommentScrollIdRef.current = commentId;
    setFocusedCommentId(commentId);
    if (scrollToRenderedComment(commentId)) {
      pendingCommentScrollIdRef.current = null;
      return currentPageRef.current;
    }

    try {
      const headers = await authHeaders();
      if (!isReadRequestCurrent(requestTarget)) return null;
      const data = await requestJson<CommentContextResponse>(
        buildCommentApiUrl(apiBase, apiQuery, `/${commentId}`),
        requestFailedMessage,
        { headers },
      );
      if (!isReadRequestCurrent(requestTarget)) {
        return null;
      }

      if (options.expectedPage !== undefined && data.rootPage !== options.expectedPage) {
        pendingCommentScrollIdRef.current = null;
        setFocusedCommentId(null);
        options.onFailure?.("failed");
        return null;
      }

      const contextRoot = buildContextThread(data);
      const rootVisible = commentsRef.current.some((comment) => comment.id === contextRoot.id);
      if (data.rootPage !== currentPageRef.current || !rootVisible) {
        const pageData = await loadRootComments(data.rootPage, requestTarget);
        if (!isReadRequestCurrent(requestTarget)) {
          return null;
        }
        if (!pageData) {
          options.onFailure?.("failed");
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
      if (!isReadRequestCurrent(requestTarget)) {
        return null;
      }

      pendingCommentScrollIdRef.current = null;
      setFocusedCommentId(null);
      const failure = classifyLinkedCommentLocateError(err);
      options.onFailure?.(failure);
      if (failure === "failed" || !options.silent) {
        setError(err instanceof Error ? err.message : t("errors.locateFailed"));
      }
      return null;
    }
  }, [apiBase, apiQuery, captureReadRequest, isReadRequestCurrent, loadRootComments, requestFailedMessage, t]);

  const navigateToComment = useCallback(async (commentId: string) => {
    const requestTarget = captureReadRequest();
    let locateFailure: LinkedCommentLocateFailure | null = null;
    const locatedPage = await locateLinkedComment(commentId, {
      expectedPage: currentPageRef.current,
      silent: true,
      onFailure: (failure) => {
        locateFailure = failure;
      },
    });
    if (!isReadRequestCurrent(requestTarget) || locateFailure === "failed") {
      return;
    }

    updateLocation({
      page: locatedPage ?? currentPageRef.current,
      commentId: locatedPage !== null ? commentId : null,
    });
  }, [captureReadRequest, isReadRequestCurrent, locateLinkedComment, updateLocation]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    rootLoadSequenceRef.current += 1;
    readGenerationRef.current += 1;
    replyLoadsInFlightRef.current.clear();
    const requestTarget = captureReadRequest();

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
        let locateFailure: LinkedCommentLocateFailure | null = null;
        const locatedPage = await locateLinkedComment(commentId, {
          silent: true,
          onFailure: (failure) => {
            locateFailure = failure;
          },
        });
        if (!isReadRequestCurrent(requestTarget)) {
          return;
        }

        if (locatedPage !== null) {
          updateLocation({
            page: locatedPage,
            commentId,
          });
          return;
        }
        if (locateFailure === "failed") {
          // A transient context failure must not destroy a valid share URL.
          return;
        }
      }

      const data = await loadRootComments(requestedPage, requestTarget);
      if (!isReadRequestCurrent(requestTarget) || !data) {
        return;
      }

      const loadedPage = data.page ?? requestedPage;
      updateLocation({ page: loadedPage, commentId: null });
    })();
  }, [apiBase, captureReadRequest, isReadRequestCurrent, loadRootComments, locateLinkedComment, readLocation, targetKey, updateLocation]);

  const createComment = useCallback(async (content: string, parentId?: string | null) => {
    if (!apiBase) return;
    const requestTarget = captureTargetRequest();
    let writeCompleted = false;
    try {
      const headers = await authHeaders();
      if (!isTargetRequestCurrent(requestTarget)) {
        // No write occurred, so reject and let the old composer retain its draft.
        throw new CommentRequestCancelledError();
      }
      const created = await requestJson<CommentNode>(
        buildCommentApiUrl(apiBase, apiQuery),
        requestFailedMessage,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ content, parentId }),
        },
      );
      writeCompleted = true;
      if (!isTargetRequestCurrent(requestTarget)) return;

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
      await loadRootComments(createdPage, requestTarget);
      if (!isTargetRequestCurrent(requestTarget)) return;
      setFocusedCommentId(created.id);
      updateLocation({
        page: createdPage,
        commentId: created.id,
      });
      scrollToCommentAfterRender(created.id);
    } catch (error) {
      if (!isTargetRequestCurrent(requestTarget)) {
        if (writeCompleted) {
          // A completed POST belongs to the old target. Resolve without touching
          // current state so the successfully submitted old draft can be cleared.
          return;
        }
        throw error instanceof CommentRequestCancelledError
          ? error
          : new CommentRequestCancelledError();
      }
      throw error;
    }
  }, [apiBase, apiQuery, captureTargetRequest, isTargetRequestCurrent, loadRootComments, requestFailedMessage, updateLocation]);

  const updateCommentContent = useCallback(async (commentId: string, content: string) => {
    if (!apiBase) return;
    const requestTarget = captureTargetRequest();
    try {
      const headers = await authHeaders();
      if (!isTargetRequestCurrent(requestTarget)) return;
      const updated = await requestJson<CommentNode>(
        buildCommentApiUrl(apiBase, apiQuery, `/${commentId}`),
        requestFailedMessage,
        {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      if (!isTargetRequestCurrent(requestTarget)) return;
      setComments((current) => replaceComment(current, updated));
      setReplies((current) => mapReplyComments(current, (comments) => replaceComment(comments, updated)));
    } catch (error) {
      if (!isTargetRequestCurrent(requestTarget)) return;
      throw error;
    }
  }, [apiBase, apiQuery, captureTargetRequest, isTargetRequestCurrent, requestFailedMessage]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!apiBase) return;
    const requestTarget = captureTargetRequest();
    try {
      const headers = await authHeaders();
      if (!isTargetRequestCurrent(requestTarget)) return;
      const updated = await requestJson<CommentNode>(
        buildCommentApiUrl(apiBase, apiQuery, `/${commentId}`),
        requestFailedMessage,
        { method: "DELETE", headers },
      );
      if (!isTargetRequestCurrent(requestTarget)) return;
      setComments((current) => replaceComment(current, updated));
      setReplies((current) => mapReplyComments(current, (comments) => replaceComment(comments, updated)));
    } catch (error) {
      if (!isTargetRequestCurrent(requestTarget)) return;
      throw error;
    }
  }, [apiBase, apiQuery, captureTargetRequest, isTargetRequestCurrent, requestFailedMessage]);

  const loadReactionParticipants = useCallback(async ({
    commentId,
    emojiKey,
    cursor,
    signal,
  }: {
    commentId: string;
    emojiKey: string;
    cursor?: string | null;
    signal?: AbortSignal;
  }): Promise<CommentReactionParticipantListResponse> => {
    if (!apiBase) {
      throw new Error(t("errors.reactionParticipantsLoadFailed"));
    }

    return requestJson<CommentReactionParticipantListResponse>(
      buildCommentApiUrl(
        apiBase,
        apiQuery,
        `/${commentId}/reactions/${encodeURIComponent(emojiKey)}`,
        { cursor: cursor ?? undefined },
      ),
      requestFailedMessage,
      { signal },
    );
  }, [apiBase, apiQuery, requestFailedMessage, t]);

  const toggleCommentReaction = useCallback(async (commentId: string, emojiKey: string, reactedByViewer: boolean) => {
    if (!apiBase) return;
    const requestTarget = captureTargetRequest();
    try {
      const headers = await authHeaders();
      if (!isTargetRequestCurrent(requestTarget)) return;
      const reaction = await requestJson<CommentReactionState>(
        buildCommentApiUrl(apiBase, apiQuery, `/${commentId}/reactions/${encodeURIComponent(emojiKey)}`),
        requestFailedMessage,
        { method: reactedByViewer ? "DELETE" : "PUT", headers },
      );
      if (!isTargetRequestCurrent(requestTarget)) return;

      setComments((current) => updateCommentReaction(current, reaction));
      setReplies((current) => mapReplyComments(current, (comments) => updateCommentReaction(comments, reaction)));
    } catch (error) {
      if (!isTargetRequestCurrent(requestTarget)) return;
      throw error;
    }
  }, [apiBase, apiQuery, captureTargetRequest, isTargetRequestCurrent, requestFailedMessage]);

  const loadReplies = useCallback(async (commentId: string, cursor?: string | null) => {
    if (!apiBase || replyLoadsInFlightRef.current.has(commentId)) return;
    const requestTarget = captureReadRequest();
    replyLoadsInFlightRef.current.add(commentId);
    setLoadingReplies((current) => ({ ...current, [commentId]: true }));
    try {
      const headers = await authHeaders();
      if (!isReadRequestCurrent(requestTarget)) return;
      const data = await requestJson<CommentListResponse>(
        buildCommentApiUrl(apiBase, apiQuery, `/${commentId}/replies`, {
          cursor: cursor ?? undefined,
        }),
        requestFailedMessage,
        { headers },
      );
      if (!isReadRequestCurrent(requestTarget)) {
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
      if (isReadRequestCurrent(requestTarget)) {
        setLoadingReplies((current) => ({ ...current, [commentId]: false }));
      }
    }
  }, [apiBase, apiQuery, captureReadRequest, isReadRequestCurrent, requestFailedMessage]);

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

  const refreshComments = useCallback(async (): Promise<boolean> => {
    const expandedRootIds = Object.keys(replies);

    // A manual refresh means "show the latest": invalidate pending context and
    // reply reads, then load the first reverse-sorted page before changing the URL.
    readGenerationRef.current += 1;
    const requestTarget = captureTargetRequest();
    replyLoadsInFlightRef.current.clear();
    setLoadingReplies({});
    pendingCommentScrollIdRef.current = null;
    setFocusedCommentId(null);

    const data = await loadRootComments(1, requestTarget);
    if (!data || !isTargetRequestCurrent(requestTarget)) return false;

    const visibleRootIds = new Set(data.comments.map((comment) => comment.id));
    const expandedVisibleRootIds = expandedRootIds.filter((rootId) => visibleRootIds.has(rootId));
    setReplies((current) => Object.fromEntries(
      expandedVisibleRootIds.flatMap((rootId) => (
        current[rootId] ? [[rootId, current[rootId]]] : []
      )),
    ));
    setPageInput("1");
    updateLocation({ page: data.page ?? 1, commentId: null });

    const replyResults = await Promise.allSettled(
      expandedVisibleRootIds.map((rootId) => loadReplies(rootId)),
    );
    return isTargetRequestCurrent(requestTarget)
      && replyResults.every((result) => result.status === "fulfilled");
  }, [captureTargetRequest, isTargetRequestCurrent, loadReplies, loadRootComments, replies, updateLocation]);

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
  };
}
