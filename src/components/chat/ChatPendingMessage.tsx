"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import { useRef, useState } from "react";
import { CircleAlert, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ChatMessageText } from "./ChatMessageText";
import { LoadingSpinner } from "@/components/LoadingIndicator";
import ImageViewer from "@/components/ImageViewer";
import type { ChatSnapshot } from "@/lib/chat/chat-session";
import { cn } from "@/lib/utils";
import { ChatImageContent } from "./ChatImageContent";
import { chatBubbleClass, itemClass, menuClass } from "./ChatMessageRow";
import { ChatCopyMenuItem } from "./ChatCopyMenuItem";
import { ChatSaveImageMenuItem } from "./ChatSaveImageMenuItem";
import { ChatReplyPreview } from "./ChatReplyPreview";

export function ChatPendingMessage({ pending, blocked, onRetry, onDiscard, onRetryWithoutReply }: {
  pending: ChatSnapshot["pending"][number]; blocked: boolean; onRetry(): void; onDiscard(): void; onRetryWithoutReply(): void;
}) {
  const t = useTranslations("chat");
  const trigger = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const failed = pending.status === "failed";
  const error = pending.error && t.has(`errors.${pending.error}`) ? t(`errors.${pending.error}`) : t("errors.CHAT_UNAVAILABLE");
  const descriptionId = `chat-retry-${pending.clientRequestId}`;
  const status = failed ? error : t(pending.status === "queued" ? "queued" : pending.status === "uploading" ? "uploadingImage" : "sending");

  return <li data-pending-id={pending.clientRequestId} data-send-status={pending.status} className="mt-2 mr-11.5 flex items-center justify-end gap-1 sm:mr-12.5" aria-live="polite">
    {failed ? <button type="button" disabled={blocked} onClick={onRetry} aria-label={t("retryFailed")}
      aria-describedby={descriptionId} title={`${error} · ${t("retry")}`}
      className="flex size-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-[var(--theme-color-focus-ring)] disabled:opacity-40">
      <CircleAlert size={20} aria-hidden="true" fill="var(--theme-color-action-danger-background)" stroke="var(--theme-color-action-danger-foreground)" />
      <span id={descriptionId} className="sr-only">{error}</span>
    </button> : <span role="status" className="flex size-10 shrink-0 items-center justify-center text-[var(--theme-color-text-muted)]" title={status}>
      <LoadingSpinner className="size-3" /><span className="sr-only">{status}</span>
    </span>}
    <ContextMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <ContextMenu.Trigger asChild disabled={!failed}>
        <div ref={trigger} tabIndex={failed ? 0 : undefined} aria-label={t("messageActions")}
          className={cn("min-w-0 max-w-[82%] sm:max-w-[78%] [-webkit-touch-callout:none]", !failed && "opacity-70",
            !pending.image && chatBubbleClass, !pending.image && "bg-[var(--theme-color-chat-own-background)] text-[var(--theme-color-chat-own-foreground)]")}
          onKeyDown={(event) => {
            if (failed && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.bottom }));
            }
          }}>
          {pending.reply && <ChatReplyPreview reply={pending.error === "CHAT_REPLY_DELETED" ? { id: pending.reply.id, deleted: true } : pending.reply} />}
          {pending.image ? <ChatImageContent src={pending.image.url} width={pending.image.width} height={pending.image.height} onOpen={() => { if (!menuOpen) setPreviewOpen(true); }} />
            : <ChatMessageText content={pending.content} mentions={pending.mentions} />}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuClass} collisionPadding={12} onCloseAutoFocus={(event) => {
          event.preventDefault(); trigger.current?.focus({ preventScroll: true });
        }}>
          <ContextMenu.Group>
            {pending.reply && pending.error === "CHAT_REPLY_DELETED" && <ContextMenu.Item className={itemClass} disabled={blocked} onSelect={onRetryWithoutReply}>{t("retryWithoutReply")}</ContextMenu.Item>}
            <ChatCopyMenuItem content={pending.content} imageSource={pending.image?.url} className={itemClass} onCopied={() => setMenuOpen(false)} />
            {pending.image && <ChatSaveImageMenuItem source={pending.image.url} contentType={pending.image.contentType} onPreview={() => setPreviewOpen(true)} className={itemClass} />}
            <ContextMenu.Item className={cn(itemClass, "text-[var(--theme-color-action-destructive-foreground)]")} onSelect={onDiscard}>
              <Trash2 size={16} aria-hidden="true" />{t("delete")}
            </ContextMenu.Item>
          </ContextMenu.Group>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
    {previewOpen && pending.image && <ImageViewer src={pending.image.url} label={t("image")} onClose={() => setPreviewOpen(false)}
      labels={{ close: t("closeImage"), instructions: t("imageInstructions"), previous: t("previousImage"), next: t("nextImage"), imageLoading: t("loading") }} />}
  </li>;
}
