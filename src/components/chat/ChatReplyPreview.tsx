"use client";

import { useEffect, useState } from "react";
import { CornerUpLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { CHAT_RETENTION_MS, type ChatReply } from "@/lib/chat/chat-contract";

export function ChatReplyPreview({ reply, onLocate }: { reply: ChatReply; onLocate?: (id: string) => void }) {
  const t = useTranslations("chat");
  const [now, setNow] = useState(Date.now);
  const expires = reply.deleted ? 0 : Date.parse(reply.createdAt) + CHAT_RETENTION_MS;
  const deleted = reply.deleted || expires <= now;
  useEffect(() => {
    if (deleted) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2147483647, Math.max(0, expires - Date.now()) + 10));
    return () => clearTimeout(timer);
  }, [deleted, expires, now]);
  const content = <><CornerUpLeft size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
    <span className="min-w-0">{deleted || reply.deleted ? t("messageDeleted") : <>
      <span className="block truncate font-semibold">{reply.username}</span>
      <span className="line-clamp-2 wrap-anywhere">{reply.image ? t("image") : reply.content}</span>
    </>}</span></>;
  const className = "mb-1 flex max-w-full gap-1.5 rounded-lg border-l-2 border-[var(--theme-color-border-subtle)] px-2 py-1 text-left text-xs text-[var(--theme-color-text-muted)]";
  return onLocate && !deleted ? <button type="button" data-chat-reply className={`${className} hover:bg-[var(--theme-color-control-background-hover)] focus-visible:outline-2 focus-visible:outline-[var(--theme-color-focus-ring)]`}
    aria-label={t("viewOriginal")} onClick={() => onLocate(reply.id)}>{content}</button>
    : <div data-chat-reply className={className}>{content}</div>;
}
