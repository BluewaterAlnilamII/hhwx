import { truncateCommentContent } from "@/lib/comments/comment-contract";

const COMMENT_DRAFT_STORAGE_PREFIX = "hhwx-comment-draft:v1";

export type CommentDraftIdentity = {
  userId: string;
  targetKey: string;
  replyToCommentId?: string | null;
};

function getCommentDraftStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function buildCommentDraftStorageKey({
  userId,
  targetKey,
  replyToCommentId = null,
}: CommentDraftIdentity): string {
  const draftType = replyToCommentId ? `reply:${replyToCommentId}` : "root";
  return [
    COMMENT_DRAFT_STORAGE_PREFIX,
    encodeURIComponent(userId),
    encodeURIComponent(targetKey),
    encodeURIComponent(draftType),
  ].join(":");
}

export function readCommentDraft(storageKey: string | null): string {
  if (!storageKey) return "";
  const storage = getCommentDraftStorage();
  if (!storage) return "";

  try {
    const stored = storage.getItem(storageKey) ?? "";
    const content = truncateCommentContent(stored);
    if (content !== stored) {
      storage.setItem(storageKey, content);
    }
    return content;
  } catch {
    return "";
  }
}

export function writeCommentDraft(storageKey: string | null, value: string): string {
  const content = truncateCommentContent(value);
  if (!storageKey) return content;
  const storage = getCommentDraftStorage();
  if (!storage) return content;

  try {
    if (content) {
      storage.setItem(storageKey, content);
    } else {
      storage.removeItem(storageKey);
    }
  } catch {
    // Browser storage is optional; the controlled input remains authoritative.
  }
  return content;
}

export function clearCommentDraft(storageKey: string | null): void {
  if (!storageKey) return;
  const storage = getCommentDraftStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // Ignore unavailable or blocked session storage.
  }
}
