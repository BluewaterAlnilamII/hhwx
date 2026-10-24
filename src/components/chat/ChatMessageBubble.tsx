"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import { useRef, useState } from "react";
import { ChevronRight, Trash2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { CommentContent } from "@/components/comments/CommentContent";
import type { ChatMessage } from "@/lib/chat/chat-contract";
import { cn } from "@/lib/utils";
import { chatImageUrl } from "@/lib/chat/chat-image-contract";
import { ChatImageContent } from "./ChatImageContent";
import { ChatCopyMenuItem } from "./ChatCopyMenuItem";
import { ChatSaveImageMenuItem } from "./ChatSaveImageMenuItem";

export const chatBubbleClass = "max-w-full rounded-2xl px-3 py-2 text-sm leading-[22px] wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-color-focus-ring)]";
export const menuClass = "hhwx-floating-surface z-1010 min-w-40 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--theme-color-border-subtle)] p-1.5 shadow-lg";
export const itemClass = "flex min-h-10 cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-hidden data-highlighted:bg-[var(--theme-color-control-background-hover)] data-disabled:opacity-40";

export function ChatMessageBubble({ message, own, canModerate, busy, onDelete, onMute, onOpenImage, imageSource }: {
  message: ChatMessage;
  own: boolean;
  canModerate: boolean;
  busy: boolean;
  onDelete(message: ChatMessage): void;
  onMute(userId: string, minutes: number | null): Promise<boolean>;
  onOpenImage(): void;
  imageSource?: string;
}) {
  const t = useTranslations("chat");
  const trigger = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muteFailed, setMuteFailed] = useState(false);
  const source = message.image ? imageSource ?? chatImageUrl(message.image) : undefined;
  const mute = async (minutes: number | null) => {
    setMuteFailed(false);
    if (await onMute(message.author.userId, minutes)) setMenuOpen(false);
    else setMuteFailed(true);
  };
  return <ContextMenu.Root open={menuOpen} onOpenChange={(open) => { setMenuOpen(open); setMuteFailed(false); }}>
    <ContextMenu.Trigger asChild>
      <div ref={trigger} tabIndex={0} data-chat-bubble aria-label={t("messageActions")}
        className={message.image ? "max-w-full [-webkit-touch-callout:none]" : cn(chatBubbleClass, "w-fit [-webkit-touch-callout:none]", own
          ? "bg-[var(--theme-color-chat-own-background)] text-[var(--theme-color-chat-own-foreground)]"
          : "bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-default)]")}
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.bottom }));
          }
        }}>
        {message.image ? <ChatImageContent src={source!} width={message.image.width} height={message.image.height} onOpen={() => { if (!menuOpen) onOpenImage(); }} />
          : <CommentContent content={message.content} isDeleted={false} className="m-0 text-sm text-inherit leading-[22px]" />}
      </div>
    </ContextMenu.Trigger>
    <ContextMenu.Portal>
      <ContextMenu.Content className={menuClass} collisionPadding={12} onCloseAutoFocus={(event) => {
        event.preventDefault(); trigger.current?.focus({ preventScroll: true });
      }}>
        <ContextMenu.Group>
          <ChatCopyMenuItem content={message.content} imageSource={source}
            className={itemClass} onCopied={() => setMenuOpen(false)} />
          {message.image && <ChatSaveImageMenuItem source={source!} contentType={message.image.contentType} onPreview={onOpenImage} className={itemClass} />}
          {(own || canModerate) && <ContextMenu.Item className={cn(itemClass, "text-[var(--theme-color-action-destructive-foreground)]")}
            disabled={busy} onSelect={() => onDelete(message)}><Trash2 size={16} aria-hidden="true" />{t("delete")}</ContextMenu.Item>}
        </ContextMenu.Group>
        {canModerate && !own && <ContextMenu.Sub>
          <ContextMenu.SubTrigger className={itemClass} disabled={busy}>
            <VolumeX size={16} aria-hidden="true" />{t("manage")}<ChevronRight size={16} className="ml-auto" aria-hidden="true" />
          </ContextMenu.SubTrigger>
          <ContextMenu.Portal>
            <ContextMenu.SubContent className={menuClass} collisionPadding={12}>
              <ContextMenu.Group>
                <ContextMenu.Item className={itemClass} disabled={busy} onSelect={(event) => { event.preventDefault(); void mute(60); }}>{t("muteHour")}</ContextMenu.Item>
                <ContextMenu.Item className={itemClass} disabled={busy} onSelect={(event) => { event.preventDefault(); void mute(1440); }}>{t("muteDay")}</ContextMenu.Item>
                <ContextMenu.Item className={itemClass} disabled={busy} onSelect={(event) => { event.preventDefault(); void mute(null); }}>{t("unmute")}</ContextMenu.Item>
              </ContextMenu.Group>
              {muteFailed && <p role="alert" className="px-3 py-2 text-xs text-[var(--theme-color-semantic-danger-foreground)]">{t("moderationFailed")}</p>}
            </ContextMenu.SubContent>
          </ContextMenu.Portal>
        </ContextMenu.Sub>}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  </ContextMenu.Root>;
}
