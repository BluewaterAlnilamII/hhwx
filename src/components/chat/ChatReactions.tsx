"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReactionChip } from "@/components/comments/CommentReactionChip";
import type { CommentReactionParticipantPageLoader } from "@/hooks/useCommentReactionParticipants";
import type { CommentReactionParticipantListResponse } from "@/lib/comments/comment-contract";
import type { ChatMessage } from "@/lib/chat/chat-contract";

export function ChatReactions({ message, busy, muted, onToggle, onViewAll, loadParticipants }: {
  message: ChatMessage; busy: boolean; muted: boolean;
  onToggle(key: string, selected: boolean): Promise<void>;
  onViewAll(key: string): void;
  loadParticipants: CommentReactionParticipantPageLoader;
}) {
  const [previews, setPreviews] = useState<Record<string, { version: number; page: CommentReactionParticipantListResponse }>>({});
  const requests = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const pending = requests.current;
    return () => { for (const request of pending.values()) request.abort(); pending.clear(); };
  }, []);
  const preview = useCallback((emojiKey: string) => {
    const version = message.reactionsVersion ?? 0;
    const key = emojiKey;
    if (previews[key]?.version === version || requests.current.has(key)) return;
    const abort = new AbortController(); requests.current.set(key, abort);
    void loadParticipants({ commentId: message.id, emojiKey, signal: abort.signal }).then(page => {
      if (!abort.signal.aborted) setPreviews(current => ({ ...current, [key]: { version, page } }));
    }).catch(() => { /* The full participant dialog provides explicit retry. */ }).finally(() => requests.current.delete(key));
  }, [loadParticipants, message.id, message.reactionsVersion, previews]);
  return <>
    {message.reactions?.map(reaction => {
      const cached = previews[reaction.emojiKey];
      const page = cached?.version === (message.reactionsVersion ?? 0) ? cached.page : undefined;
      const users = page?.users.slice(0, 3) ?? [];
      return <ReactionChip key={reaction.emojiKey} reaction={{ ...reaction, users, remainingUserCount: Math.max(0, reaction.count - users.length) }}
        disabled={busy || (muted && !reaction.reactedByViewer)} onToggle={onToggle} onViewAll={onViewAll} onPreview={preview} />;
    })}
  </>;
}
