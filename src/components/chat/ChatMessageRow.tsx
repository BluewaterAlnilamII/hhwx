"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { ChevronRight, MessageSquareQuote, SmilePlus, Trash2, VolumeX, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { ChatMessageText } from "./ChatMessageText";
import type { ChatMessage } from "@/lib/chat/chat-contract";
import { cn } from "@/lib/utils";
import { chatImageUrl } from "@/lib/chat/chat-image-contract";
import { ChatImageContent } from "./ChatImageContent";
import { ChatCopyMenuItem } from "./ChatCopyMenuItem";
import { ChatSaveImageMenuItem } from "./ChatSaveImageMenuItem";
import { EmojiPickerButton } from "@/components/comments/EmojiPickerButton";
import { CommentReactionEmoji } from "@/components/comments/CommentReactionEmoji";
import { CommentReactionsDialog } from "@/components/comments/CommentReactionsDialog";
import type { CommentReactionParticipantPageLoader } from "@/hooks/useCommentReactionParticipants";
import type { CommentReactionParticipantListResponse } from "@/lib/comments/comment-contract";
import { ChatReactions } from "./ChatReactions";
import { ChatReplyPreview } from "./ChatReplyPreview";
import type { ChatSession } from "@/lib/chat/chat-session";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import { ChatPresenceIndicator } from "./ChatPresence";
import { CommentPublicUid } from "@/components/comments/CommentPublicUid";
import { resolveStoredAccountAvatarCardIdentity } from "@/lib/account-avatar-card";

export const chatBubbleClass = "max-w-full rounded-2xl px-3 py-2 text-sm leading-[22px] wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-color-focus-ring)]";
export const menuClass = "hhwx-floating-surface z-1010 min-w-40 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--theme-color-border-subtle)] p-1.5 shadow-lg";
export const itemClass = "flex min-h-10 cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-hidden data-highlighted:bg-[var(--theme-color-control-background-hover)] data-disabled:opacity-40";

function hasIndependentAction(target: EventTarget) {
  if (!(target instanceof Element)) return false;
  const control = target.closest('button, a, input, textarea, select, [contenteditable="true"], [role="dialog"], [popover]');
  return !!control?.closest('[data-chat-message-row]') && !control.matches('[data-chat-reply], [data-chat-image]');
}

function stopIndependentAction(event: SyntheticEvent) {
  if (hasIndependentAction(event.target)) event.stopPropagation();
}

export function ChatMessageRow({ message, online = null, quickReactions, own, mentioned, showAuthor, showTime, highlightSequence, canModerate, busy, onDelete, onMute, onOpenImage, imageSource, muted, session, onReply, onLocate }: {
  message: ChatMessage;
  online?: boolean | null;
  quickReactions: string[];
  own: boolean;
  mentioned: boolean;
  showAuthor: boolean;
  showTime: boolean;
  highlightSequence?: number;
  canModerate: boolean;
  busy: boolean;
  onDelete(message: ChatMessage): void;
  onMute(userId: string, minutes: number | null): Promise<boolean>;
  onOpenImage(): void;
  imageSource?: string;
  muted: boolean;
  session: ChatSession;
  onReply(message: ChatMessage): void;
  onLocate(id: string): Promise<boolean>;
}) {
  const t = useTranslations("chat");
  const trigger = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muteFailed, setMuteFailed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [participants, setParticipants] = useState<{ emojiKey: string; load: CommentReactionParticipantPageLoader; reactions: ChatMessage["reactions"] } | null>(null);
  const participantRequests = useRef(new Set<AbortController>());
  const firstPages = useRef(new Map<string, Promise<CommentReactionParticipantListResponse>>());
  useEffect(() => { firstPages.current.clear(); }, [message.id, message.reactionsVersion, session]);
  useEffect(() => {
    const pending = participantRequests.current;
    return () => { for (const request of pending) request.abort(); pending.clear(); };
  }, []);
  const loadParticipants = useCallback<CommentReactionParticipantPageLoader>(options => {
      if (options.cursor) return session.loadReactionParticipants(options);
      const key = `${message.id}:${message.reactionsVersion ?? 0}:${options.emojiKey}`;
      let request = firstPages.current.get(key);
      if (!request) {
        // The row owns shared requests; dismissing one consumer must not cancel another.
        const abort = new AbortController(); participantRequests.current.add(abort);
        request = session.loadReactionParticipants({ ...options, signal: abort.signal })
          .catch(error => { firstPages.current.delete(key); throw error; })
          .finally(() => participantRequests.current.delete(abort));
        firstPages.current.set(key, request);
      }
      return request;
  }, [message.id, message.reactionsVersion, session]);
  const [reacting, setReacting] = useState(false);
  const [reactionFailed, setReactionFailed] = useState(false);
  const [locateFailed, setLocateFailed] = useState(false);
  const focusInput = useRef(false);
  const selected = (key: string) => !!message.reactions?.find(r => r.emojiKey === key)?.reactedByViewer;
  const toggle = async (key: string, active: boolean, options: { remember?: boolean } = {}) => {
    if (reacting || (muted && !active)) return;
    setPickerOpen(false); setMenuOpen(false); setReacting(true); setReactionFailed(false);
    try { await session.react(message.id, key, !active, options); }
    catch { setReactionFailed(true); }
    finally { setReacting(false); }
  };
  const reply = () => { focusInput.current = menuOpen; setMenuOpen(false); onReply(message); };
  const showPicker = () => { setMenuOpen(false); setPickerOpen(true); };
  const showParticipants = (key: string) => { setMenuOpen(false); setParticipants({ emojiKey: key, load: loadParticipants, reactions: message.reactions }); };
  const source = message.image ? imageSource ?? chatImageUrl(message.image) : undefined;
  const author = message.author;
  const avatar = resolveStoredAccountAvatarCardIdentity(author.avatarCardId, author.avatarCardServer);
  const mute = async (minutes: number | null) => {
    setMuteFailed(false);
    if (await onMute(message.author.userId, minutes)) setMenuOpen(false);
    else setMuteFailed(true);
  };
  return <ContextMenu.Root open={menuOpen} onOpenChange={(open) => {
    setMenuOpen(open); setMuteFailed(false);
    if (open) suppressClick.current = true;
  }}>
    <ContextMenu.Trigger asChild>
      <div data-chat-message-row data-chat-mentioned={mentioned || undefined}
        data-chat-actions-open={menuOpen || pickerOpen || !!participants || undefined}
        className={cn("chat-message-row flex gap-2.5", mentioned && "chat-mentioned-message",
          own ? "flex-row-reverse" : "justify-start", showAuthor && !showTime && "[--chat-row-gap:1rem]")}
        onPointerDownCapture={() => { suppressClick.current = false; }}
        onClickCapture={event => {
          // A long-press release must not also open the image or follow the quote.
          if (suppressClick.current && !hasIndependentAction(event.target)) {
            suppressClick.current = false; event.preventDefault(); event.stopPropagation();
          }
        }}>
        {highlightSequence !== undefined && <span key={highlightSequence} data-chat-locate-feedback aria-hidden="true" className="chat-message-locate-feedback" />}
        <div className="w-9 shrink-0 pt-0.5 sm:w-10" onPointerDown={stopIndependentAction} onContextMenu={stopIndependentAction}>
          {showAuthor && <span className="relative block"><AccountCardAvatar username={author.username} cardId={avatar.cardId} entityServer={avatar.entityServer} trainType={author.avatarCardTrainType} size="comment" className="size-9! sm:size-10!" /><ChatPresenceIndicator online={online} size="md" /></span>}
        </div>
        <div className={cn("flex min-w-0 max-w-[82%] flex-col sm:max-w-[78%]", own ? "items-end" : "items-start")}
          onPointerDown={stopIndependentAction} onContextMenu={stopIndependentAction}>
          {!own && showAuthor && <div className="mb-1.5 flex max-w-full items-center gap-2 px-0.5">
            <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--theme-color-text-muted)]">{author.username}</span>
            <CommentPublicUid publicUid={author.publicUid} />
          </div>}
          <div className={cn("flex min-w-0 max-w-full flex-col", own ? "items-end" : "items-start")}>
            {message.reply && <ChatReplyPreview reply={message.reply} onLocate={id => {
              setLocateFailed(false); void onLocate(id).catch(() => setLocateFailed(true));
            }} />}
            {locateFailed && <p role="alert" className="mb-1 text-xs text-[var(--theme-color-semantic-danger-foreground)]">{t("locateFailed")}</p>}
            <div ref={trigger} tabIndex={0} data-chat-bubble aria-label={t("messageActions")}
              className={message.image ? "max-w-full [-webkit-touch-callout:none]" : cn(chatBubbleClass, "w-fit [-webkit-touch-callout:none]", own
                ? "bg-[var(--theme-color-chat-own-background)] text-[var(--theme-color-chat-own-foreground)]"
                : cn("text-[var(--theme-color-text-default)]", !mentioned && "bg-[var(--theme-color-control-background)]"))}
              onKeyDown={(event) => {
                if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.bottom }));
                }
              }}>
              {message.image ? <ChatImageContent src={source!} width={message.image.width} height={message.image.height} onOpen={() => { if (!menuOpen) onOpenImage(); }} />
                : <ChatMessageText content={message.content} mentions={message.mentions} />}
            </div>
            <div data-chat-reactions-row className={cn("flex max-w-full flex-wrap items-center gap-1", !!message.reactions?.length && "mt-1")}>
              {!!message.reactions?.length && <ChatReactions message={message} busy={reacting} muted={muted} onToggle={toggle} onViewAll={showParticipants} loadParticipants={loadParticipants} />}
              <EmojiPickerButton compact variant="message" open={pickerOpen} onOpenChange={setPickerOpen}
                hideTrigger={!message.reactions?.length} anchorRef={trigger} disabled={muted || reacting} label={t("addReaction")}
                onSelect={key => { void toggle(key, selected(key), { remember: true }); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); }} />
            </div>
            {reactionFailed && <p role="alert" className="mt-1 text-xs text-[var(--theme-color-semantic-danger-foreground)]">{t("reactionFailed")}</p>}
          </div>
        </div>
      </div>
    </ContextMenu.Trigger>
    <ContextMenu.Portal>
      <ContextMenu.Content className={menuClass} collisionPadding={12} onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (focusInput.current) { focusInput.current = false; document.getElementById("chat-draft")?.focus({ preventScroll: true }); }
        else if (!pickerOpen && !participants) trigger.current?.focus({ preventScroll: true });
      }}>
        <ContextMenu.Group data-chat-quick-reactions className="flex gap-1 p-1">
          {quickReactions.map(key => <ContextMenu.Item key={key} aria-label={t("reactWith", { emoji: key })}
            disabled={reacting || (muted && !selected(key))} onSelect={() => void toggle(key, selected(key), { remember: true })}
            className={cn(itemClass, "justify-center px-2", selected(key) && "bg-[var(--theme-color-selection-subtle-background)]")}>
            <CommentReactionEmoji emojiKey={key} size={24} />
          </ContextMenu.Item>)}
          <ContextMenu.Item className={itemClass} disabled={muted || reacting} aria-label={t("addReaction")} onSelect={showPicker}><SmilePlus size={20} /></ContextMenu.Item>
        </ContextMenu.Group>
        <ContextMenu.Group>
          <ContextMenu.Item className={itemClass} disabled={muted} onSelect={reply}><MessageSquareQuote size={16} aria-hidden="true" />{t("reply")}</ContextMenu.Item>
          {!!message.reactions?.length && <ContextMenu.Item className={itemClass} onSelect={() => showParticipants(message.reactions![0].emojiKey)}><Users size={16} />{t("viewReactions")}</ContextMenu.Item>}
        </ContextMenu.Group>
        <ContextMenu.Separator className="my-1 border-t border-[var(--theme-color-border-subtle)]" />
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
    {participants && <CommentReactionsDialog commentId={message.id} initialEmojiKey={participants.emojiKey}
      reactions={(participants.reactions ?? []).map(r => ({ ...r, users: [], remainingUserCount: r.count }))}
      loadParticipants={participants.load} onClose={() => { setParticipants(null); trigger.current?.focus({ preventScroll: true }); }}
      overlayClassName="z-1020" className="z-1021" />}
  </ContextMenu.Root>;
}
