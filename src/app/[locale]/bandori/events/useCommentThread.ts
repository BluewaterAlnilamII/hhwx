"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommentStampCatalog } from "@/hooks/useCommentStamps";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { getSafeSession } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";
import { getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";
import {
  buildCommentStampLookup,
} from "./commentContent";
import type {
  CommentContextResponse,
  CommentListResponse,
  CommentNode,
  CommentReactionState,
} from "./commentTypes";
import {
  readEventTrackerSearchParams,
  readPositiveIntegerSearchParam,
  replaceEventTrackerUrlQuery,
} from "./urlQuery";

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

function readCommentPageSearchParam(): number {
  return readPositiveIntegerSearchParam(readEventTrackerSearchParams(), "page") ?? 1;
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
  server: BandoriServer,
  path = "",
  values: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams({ server: getBandoriServerCode(server) });
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, value);
  }
  return `${apiBase}${path}?${params.toString()}`;
}

export function useCommentThread(eventId: number | null, server: BandoriServer) {
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
  const eventGenerationRef = useRef(0);
  const rootLoadSequenceRef = useRef(0);
  const replyLoadsInFlightRef = useRef<Set<string>>(new Set());
  const pendingCommentScrollIdRef = useRef<string | null>(null);
  const { userId, username, emailVerified, authReady } = useGameStore();

  const apiBase = eventId ? `/api/bandori/events/${eventId}/comments` : null;
  const { catalog: stampCatalog } = useCommentStampCatalog(Boolean(eventId && comments.length > 0));
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
      const data = await requestJson<CommentListResponse>(buildCommentApiUrl(apiBase, server, "", {
        page: String(Math.max(1, Math.trunc(page))),
      }), { headers });
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
        setError(err instanceof Error ? err.message : "评论加载失败");
      }
      return null;
    } finally {
      if (requestId === rootLoadSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [apiBase, server]);

  const locateLinkedComment = useCallback(async (
    commentId: string,
    options: { expectedPage?: number; silent?: boolean } = {},
  ): Promise<number | null> => {
    if (!apiBase) return null;
    const generation = eventGenerationRef.current;
    pendingCommentScrollIdRef.current = commentId;
    setFocusedCommentId(commentId);
    if (scrollToRenderedComment(commentId)) {
      pendingCommentScrollIdRef.current = null;
      return currentPageRef.current;
    }

    try {
      const headers = await authHeaders();
      const data = await requestJson<CommentContextResponse>(buildCommentApiUrl(apiBase, server, `/${commentId}`), { headers });
      if (generation !== eventGenerationRef.current) {
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
        if (generation !== eventGenerationRef.current || !pageData) {
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
      if (generation !== eventGenerationRef.current) {
        return null;
      }

      pendingCommentScrollIdRef.current = null;
      setFocusedCommentId(null);
      if (options.silent) {
        return null;
      }
      setError(err instanceof Error ? err.message : "无法定位评论");
      return null;
    }
  }, [apiBase, loadRootComments, server]);

  const navigateToComment = useCallback(async (commentId: string) => {
    const generation = eventGenerationRef.current;
    const locatedPage = await locateLinkedComment(commentId, {
      expectedPage: currentPageRef.current,
      silent: true,
    });
    if (generation !== eventGenerationRef.current) {
      return;
    }

    replaceEventTrackerUrlQuery({
      eventId,
      server,
      commentPage: locatedPage ?? currentPageRef.current,
      commentId: locatedPage !== null ? commentId : null,
    });
  }, [eventId, locateLinkedComment, server]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    eventGenerationRef.current += 1;
    rootLoadSequenceRef.current += 1;
    replyLoadsInFlightRef.current.clear();
    const generation = eventGenerationRef.current;

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
    if (!eventId || !apiBase) return;

    const params = readEventTrackerSearchParams();
    const requestedPage = readCommentPageSearchParam();
    const commentId = params.get("comment");
    void (async () => {
      if (commentId) {
        // Comment IDs are stable while reverse-sorted page numbers drift as new roots arrive.
        // Resolve the comment before loading a potentially stale or invalid requested page.
        const locatedPage = await locateLinkedComment(commentId, {
          silent: true,
        });
        if (generation !== eventGenerationRef.current) {
          return;
        }

        if (locatedPage !== null) {
          replaceEventTrackerUrlQuery({
            eventId,
            server,
            commentPage: locatedPage,
            commentId,
          });
          return;
        }
      }

      const data = await loadRootComments(requestedPage);
      if (generation !== eventGenerationRef.current || !data) {
        return;
      }

      const loadedPage = data.page ?? requestedPage;
      replaceEventTrackerUrlQuery({ eventId, server, commentPage: loadedPage, commentId: null });
    })();
  }, [apiBase, eventId, loadRootComments, locateLinkedComment, server]);

  const createComment = useCallback(async (content: string, parentId?: string | null) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const created = await requestJson<CommentNode>(buildCommentApiUrl(apiBase, server), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ content, parentId }),
    });

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
      replaceEventTrackerUrlQuery({
        eventId,
        server,
        commentPage: currentPageRef.current,
        commentId: created.id,
      });
      scrollToCommentAfterRender(created.id);
      return;
    }

    const createdPage = 1;
    await loadRootComments(createdPage);
    setFocusedCommentId(created.id);
    replaceEventTrackerUrlQuery({
      eventId,
      server,
      commentPage: createdPage,
      commentId: created.id,
    });
    scrollToCommentAfterRender(created.id);
  }, [apiBase, eventId, loadRootComments, server]);

  const updateCommentContent = useCallback(async (commentId: string, content: string) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const updated = await requestJson<CommentNode>(buildCommentApiUrl(apiBase, server, `/${commentId}`), {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setComments((current) => replaceComment(current, updated));
    setReplies((current) => mapReplyComments(current, (comments) => replaceComment(comments, updated)));
  }, [apiBase, server]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const updated = await requestJson<CommentNode>(buildCommentApiUrl(apiBase, server, `/${commentId}`), {
      method: "DELETE",
      headers,
    });
    setComments((current) => replaceComment(current, updated));
    setReplies((current) => mapReplyComments(current, (comments) => replaceComment(comments, updated)));
  }, [apiBase, server]);

  const toggleCommentReaction = useCallback(async (commentId: string, emojiKey: string, reactedByViewer: boolean) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const reaction = await requestJson<CommentReactionState>(buildCommentApiUrl(apiBase, server, `/${commentId}/reactions/${encodeURIComponent(emojiKey)}`), {
      method: reactedByViewer ? "DELETE" : "PUT",
      headers,
    });

    setComments((current) => updateCommentReaction(current, reaction));
    setReplies((current) => mapReplyComments(current, (comments) => updateCommentReaction(comments, reaction)));
  }, [apiBase, server]);

  const loadReplies = useCallback(async (commentId: string, cursor?: string | null) => {
    if (!apiBase || replyLoadsInFlightRef.current.has(commentId)) return;
    const generation = eventGenerationRef.current;
    replyLoadsInFlightRef.current.add(commentId);
    setLoadingReplies((current) => ({ ...current, [commentId]: true }));
    try {
      const headers = await authHeaders();
      const data = await requestJson<CommentListResponse>(buildCommentApiUrl(apiBase, server, `/${commentId}/replies`, {
        cursor: cursor ?? undefined,
      }), { headers });
      if (generation !== eventGenerationRef.current) {
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
      if (generation === eventGenerationRef.current) {
        setLoadingReplies((current) => ({ ...current, [commentId]: false }));
      }
    }
  }, [apiBase, server]);

  const goToCommentPage = useCallback((page: number) => {
    const nextPage = Math.min(totalPages, Math.max(1, Math.trunc(page)));
    setPageInput(String(nextPage));
    pendingCommentScrollIdRef.current = null;
    setFocusedCommentId(null);
    replaceEventTrackerUrlQuery({
      eventId,
      server,
      commentPage: nextPage,
      commentId: null,
    });
    void loadRootComments(nextPage);
  }, [eventId, loadRootComments, server, totalPages]);

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
