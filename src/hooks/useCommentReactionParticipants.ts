"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CommentReactionParticipant,
  CommentReactionParticipantListResponse,
  CommentReactionSummary,
} from "@/lib/comments/comment-contract";

export type CommentReactionParticipantPageLoader = (options: {
  commentId: string;
  emojiKey: string;
  cursor?: string | null;
  signal?: AbortSignal;
}) => Promise<CommentReactionParticipantListResponse>;

type ReactionParticipantPageState = {
  users: CommentReactionParticipant[];
  nextCursor: string | null;
  hasMore: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  hasError: boolean;
  failedMode: "initial" | "more" | null;
};

function buildInitialPageStates(
  reactions: CommentReactionSummary[],
): Record<string, ReactionParticipantPageState> {
  return Object.fromEntries(reactions.map((reaction) => [
    reaction.emojiKey,
    {
      users: reaction.users,
      nextCursor: null,
      hasMore: reaction.remainingUserCount > 0,
      isInitialized: reaction.remainingUserCount === 0,
      isLoading: false,
      hasError: false,
      failedMode: null,
    },
  ]));
}

function mergeParticipants(
  current: CommentReactionParticipant[],
  next: CommentReactionParticipant[],
): CommentReactionParticipant[] {
  const usersById = new Map(current.map((user) => [user.userId, user]));
  for (const user of next) {
    usersById.set(user.userId, user);
  }
  return [...usersById.values()];
}

export function useCommentReactionParticipants({
  commentId,
  initialEmojiKey,
  reactions,
  loadParticipants,
}: {
  commentId: string;
  initialEmojiKey: string;
  reactions: CommentReactionSummary[];
  loadParticipants: CommentReactionParticipantPageLoader;
}) {
  const initialPageStates = useRef(buildInitialPageStates(reactions));
  const [selectedEmojiKey, setSelectedEmojiKey] = useState(initialEmojiKey);
  const [pagesByEmoji, setPagesByEmoji] = useState(initialPageStates.current);
  const pagesRef = useRef(initialPageStates.current);
  const abortControllersRef = useRef(new Map<string, AbortController>());

  const commitPageState = useCallback((
    emojiKey: string,
    nextState: ReactionParticipantPageState,
  ) => {
    pagesRef.current = {
      ...pagesRef.current,
      [emojiKey]: nextState,
    };
    setPagesByEmoji(pagesRef.current);
  }, []);

  const loadPage = useCallback(async (
    emojiKey: string,
    mode: "initial" | "more",
  ) => {
    const currentState = pagesRef.current[emojiKey];
    if (!currentState || currentState.isLoading) return;
    if (mode === "initial" && currentState.isInitialized) return;
    if (mode === "more" && (
      !currentState.isInitialized
      || !currentState.hasMore
      || !currentState.nextCursor
    )) return;

    const cursor = mode === "more" ? currentState.nextCursor : null;
    commitPageState(emojiKey, {
      ...currentState,
      isLoading: true,
      hasError: false,
      failedMode: null,
    });

    const controller = new AbortController();
    abortControllersRef.current.set(emojiKey, controller);
    try {
      const response = await loadParticipants({
        commentId,
        emojiKey,
        cursor,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      const latestState = pagesRef.current[emojiKey];
      commitPageState(emojiKey, {
        users: mode === "more"
          ? mergeParticipants(latestState.users, response.users)
          : response.users,
        nextCursor: response.nextCursor,
        hasMore: response.hasMore,
        isInitialized: true,
        isLoading: false,
        hasError: false,
        failedMode: null,
      });
    } catch {
      if (controller.signal.aborted) return;
      const latestState = pagesRef.current[emojiKey];
      commitPageState(emojiKey, {
        ...latestState,
        isLoading: false,
        hasError: true,
        failedMode: mode,
      });
    } finally {
      if (abortControllersRef.current.get(emojiKey) === controller) {
        abortControllersRef.current.delete(emojiKey);
      }
    }
  }, [commentId, commitPageState, loadParticipants]);

  useEffect(() => {
    const selectedState = pagesRef.current[selectedEmojiKey];
    if (selectedState && !selectedState.isInitialized && !selectedState.isLoading) {
      void loadPage(selectedEmojiKey, "initial");
    }
  }, [loadPage, selectedEmojiKey]);

  useEffect(() => () => {
    const interruptedEmojiKeys = [...abortControllersRef.current.keys()];
    for (const controller of abortControllersRef.current.values()) {
      controller.abort();
    }
    abortControllersRef.current.clear();

    if (interruptedEmojiKeys.length === 0) return;

    // Strict Mode simulates an unmount/remount without recreating refs. Reset
    // only the ref state so the second effect setup can start a fresh request;
    // a real unmount still avoids scheduling a React state update.
    const nextPages = { ...pagesRef.current };
    for (const emojiKey of interruptedEmojiKeys) {
      const page = nextPages[emojiKey];
      if (page?.isLoading) {
        nextPages[emojiKey] = { ...page, isLoading: false };
      }
    }
    pagesRef.current = nextPages;
  }, []);

  const selectedPage = pagesByEmoji[selectedEmojiKey]
    ?? initialPageStates.current[initialEmojiKey];
  const loadMore = useCallback(
    () => loadPage(selectedEmojiKey, "more"),
    [loadPage, selectedEmojiKey],
  );
  const retry = useCallback(() => {
    const mode = pagesRef.current[selectedEmojiKey]?.failedMode;
    if (mode) void loadPage(selectedEmojiKey, mode);
  }, [loadPage, selectedEmojiKey]);

  return {
    selectedEmojiKey,
    selectedPage,
    selectEmoji: setSelectedEmojiKey,
    loadMore,
    retry,
  };
}
