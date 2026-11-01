"use client";

import { ReactionChip } from "@/components/comments/CommentReactionChip";
import type { CommentReactionParticipantPageLoader } from "@/hooks/useCommentReactionParticipants";
import { COMMENT_REACTION_PARTICIPANT_LIMIT } from "@/lib/comments/comment-contract";
import type { ChatMessage } from "@/lib/chat/chat-contract";

export function ChatReactions({ message, busy, muted, onToggle, onViewAll, loadParticipants }: {
  message: ChatMessage; busy: boolean; muted: boolean;
  onToggle(key: string, selected: boolean): Promise<void>;
  onViewAll(key: string): void;
  loadParticipants: CommentReactionParticipantPageLoader;
}) {
  return <>
    {message.reactions?.map(reaction => <ReactionChip key={reaction.emojiKey} reaction={{ ...reaction, users: [], remainingUserCount: 0 }}
      disabled={busy || (muted && !reaction.reactedByViewer)} onToggle={onToggle} onViewAll={onViewAll}
      onPreview={async emojiKey => {
        const page = await loadParticipants({ commentId: message.id, emojiKey });
        const users = page.users.slice(0, COMMENT_REACTION_PARTICIPANT_LIMIT);
        return { ...reaction, users, remainingUserCount: Math.max(0, reaction.count - users.length) };
      }} />)}
  </>;
}
