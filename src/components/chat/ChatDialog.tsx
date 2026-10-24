"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import dynamic from "next/dynamic";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useGameStore } from "@/store/useGameStore";
import { useAccountProfileStore } from "@/store/useAccountProfileStore";
import { resumeSoundEffectAudio } from "@/lib/sound-effect-audio";
import type { ChatStampLayerHandle } from "./ChatStampLayer";
import { useChatSession } from "@/hooks/useChatSession";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import { CommentPublicUid } from "@/components/comments/CommentPublicUid";
import { LoadingSpinner } from "@/components/LoadingIndicator";
import { resolveStoredAccountAvatarCardIdentity } from "@/lib/account-avatar-card";
import { formatChatTime, getChatMessageLayout } from "@/lib/chat/chat-presentation";
import type { ChatMessage } from "@/lib/chat/chat-contract";
import { cn } from "@/lib/utils";
import { ChatComposer, useChatAttachments } from "./ChatComposer";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { ChatPendingMessage } from "./ChatPendingMessage";
import ImageViewer from "@/components/ImageViewer";
import { chatImageUrl, type ChatImage } from "@/lib/chat/chat-image-contract";

type Props = { open: boolean; onOpenChange(open: boolean): void; trigger: RefObject<HTMLButtonElement | null> };
const ChatStampLayer = dynamic(() => import("./ChatStampLayer").then((module) => module.ChatStampLayer), { ssr: false });

const ChatMessages = memo(function ChatMessages({ messages, userId, canModerate, busy, onDelete, onMute, onOpenImage }: {
  messages: ChatMessage[];
  userId: string;
  canModerate: boolean;
  busy: boolean;
  onDelete(message: ChatMessage): void;
  onMute(userId: string, minutes: number | null): Promise<boolean>;
  onOpenImage(image: ChatImage): void;
}) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const rows = useMemo(() => getChatMessageLayout(messages), [messages]);
  return <>{rows.map(({ message, showTime, showAuthor }) => {
    const own = message.author.userId === userId;
    const author = message.author;
    const avatar = resolveStoredAccountAvatarCardIdentity(author.avatarCardId, author.avatarCardServer);
    return <li key={message.id} data-message-id={message.id}>
      {showTime && <div className="flex justify-center py-3"><time dateTime={message.createdAt}
        title={new Date(message.createdAt).toLocaleString(locale)}
        className="rounded-full px-2.5 text-[11px] text-[var(--theme-color-text-muted)]">
        {formatChatTime(message.createdAt, locale, t("yesterday"))}
      </time></div>}
      <div className={cn("flex gap-2.5", own ? "justify-end" : "justify-start", showAuthor && !showTime ? "mt-4" : "mt-1.5")}>
        {!own && <div className="w-9 shrink-0 pt-0.5 sm:w-10">
          {showAuthor && <AccountCardAvatar username={author.username} cardId={avatar.cardId} entityServer={avatar.entityServer} trainType={author.avatarCardTrainType} size="comment" className="size-9! sm:size-10!" />}
        </div>}
        <div className={cn("flex min-w-0 max-w-[82%] flex-col sm:max-w-[78%]", own ? "items-end" : "items-start")}>
          {!own && showAuthor && <div className="mb-1.5 flex max-w-full items-baseline gap-2 px-0.5">
            <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--theme-color-text-muted)]">{author.username}</span>
            <CommentPublicUid publicUid={author.publicUid} />
          </div>}
          <ChatMessageBubble message={message} own={own} canModerate={canModerate}
            onOpenImage={() => { if (message.image) onOpenImage(message.image); }}
            busy={busy} onDelete={onDelete} onMute={onMute} />
        </div>
      </div>
    </li>;
  })}</>;
});

function Conversation({ userId, open, images, session, state }: {
  userId: string; open: boolean; images: ReturnType<typeof useChatAttachments>;
} & ReturnType<typeof useChatSession>) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const scroll = useRef<HTMLDivElement>(null);
  const stampLayer = useRef<ChatStampLayerHandle>(null);
  const profile = useAccountProfileStore((state) => state.userId === userId ? state.profile : null);
  const list = useRef<HTMLOListElement>(null);
  const following = useRef(true);
  const previousStatus = useRef(state.status);
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const [away, setAway] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ChatMessage | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [viewingImage, setViewingImage] = useState<ChatImage | null>(null);
  const [showReconnecting, setShowReconnecting] = useState(false);
  const deadline = Math.max(Date.parse(state.viewer?.nextSendAt ?? "") || 0, Date.parse(state.viewer?.mutedUntil ?? "") || 0);
  const stampDeadline = Date.parse(state.nextStampAt ?? "") || 0;

  useEffect(() => session.subscribeStamps((event) => stampLayer.current?.play(event)), [session]);
  useEffect(() => {
    if (stampDeadline <= Date.now()) return;
    const timer = setTimeout(() => setNow(Date.now()), stampDeadline - Date.now() + 30);
    return () => clearTimeout(timer);
  }, [stampDeadline]);

  useEffect(() => {
    if (!open || state.status === "paused" || deadline <= now) return;
    const muted = Date.parse(state.viewer?.mutedUntil ?? "") > Date.now();
    const timeout = window.setTimeout(() => setNow(Date.now()), Math.min(muted ? 2147483647 : 1000, Math.max(0, deadline - Date.now()) + 30));
    return () => window.clearTimeout(timeout);
  }, [deadline, open, state.status, state.viewer?.mutedUntil, now]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setShowReconnecting(state.status === "connecting"), state.status === "connecting" ? 1500 : 0);
    return () => window.clearTimeout(timeout);
  }, [state.status]);

  const captureAnchor = () => {
    const el = scroll.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const row = [...el.querySelectorAll<HTMLElement>("[data-message-id]")].find((item) => item.getBoundingClientRect().bottom > top);
    anchor.current = row ? { id: row.dataset.messageId!, top: row.getBoundingClientRect().top - top } : null;
  };
  const preserveScroll = () => {
    const el = scroll.current;
    if (!el) return;
    if (following.current) el.scrollTop = el.scrollHeight;
    else if (anchor.current) {
      const row = el.querySelector<HTMLElement>(`[data-message-id="${anchor.current.id}"]`);
      if (row) el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.current.top;
    }
  };
  useLayoutEffect(() => {
    if (state.status === "live" && previousStatus.current === "syncing") {
      following.current = true; anchor.current = null;
    }
    previousStatus.current = state.status;
    preserveScroll();
  }, [state.messages, state.pending, state.status, open]);
  useEffect(() => {
    const observer = new ResizeObserver(preserveScroll);
    if (scroll.current) observer.observe(scroll.current);
    if (list.current) observer.observe(list.current);
    return () => observer.disconnect();
  }, []);
  const jumpLatest = () => {
    following.current = true; anchor.current = null; setAway(false);
    void session.jumpLatest();
    preserveScroll();
  };
  const blocked = deadline > now;
  const muted = Date.parse(state.viewer?.mutedUntil ?? "") > now;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const confirmDelete = useCallback((message: ChatMessage) => {
    setDeleteFailed(false); setDeleting(message);
  }, []);
  const mute = useCallback(async (id: string, minutes: number | null) => {
    setBusy(true);
    const succeeded = await session.mute(id, minutes);
    setBusy(false);
    return succeeded;
  }, [session]);

  return <>
    <div className="relative flex min-h-0 flex-1 flex-col bg-[var(--theme-color-chat-background)]">
      {showReconnecting && state.messages.length > 0 && <p role="status" className="absolute inset-x-0 top-2 z-10 text-center text-xs text-[var(--theme-color-text-muted)]"><span className="rounded-full bg-[var(--theme-color-control-background)] px-3 py-1">{t("reconnecting")}</span></p>}
      <div ref={scroll} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 [overflow-anchor:none] sm:px-5"
        aria-label={t("messages")} onScroll={() => {
          const el = scroll.current!;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          setAway(!following.current);
          session.setFollowing(following.current);
          captureAnchor();
        }}>
        {state.nextCursor && <div className="mb-4 text-center"><button type="button"
          className="min-h-10 rounded-full px-4 text-xs text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background)] disabled:opacity-50"
          disabled={state.loadingOlder} onClick={() => { following.current = false; captureAnchor(); void session.loadOlder(); }}>
          {state.loadingOlder ? <LoadingSpinner /> : t("older")}
        </button></div>}
        {!state.messages.length && !state.pending.length && <div className="flex min-h-40 items-center justify-center py-12 text-sm text-[var(--theme-color-text-muted)]">
          {state.status === "live" ? <p>{t("empty")}</p> : state.status !== "error" ? <span role="status"><LoadingSpinner /><span className="sr-only">{t("loading")}</span></span> : null}
        </div>}
        <ol ref={list} className="flex flex-col">
          <ChatMessages messages={state.messages} userId={userId} canModerate={state.viewer?.canModerate ?? false}
            busy={busy} onDelete={confirmDelete} onMute={mute} onOpenImage={setViewingImage} />
          {state.pending.map((pending) => <ChatPendingMessage key={pending.clientRequestId} pending={pending} blocked={blocked}
            onRetry={() => void session.retry(pending.clientRequestId)} onDiscard={() => { session.discard(pending.clientRequestId); document.getElementById("chat-draft")?.focus(); }} />)}
        </ol>
      </div>
      <ChatStampLayer ref={stampLayer} />
      {(away || state.hasNewerMessages) && <button type="button" onClick={jumpLatest}
        aria-label={state.newMessages ? t("newMessages", { count: state.newMessages }) : t("latest")}
        title={t("latest")} className="hhwx-floating-surface absolute bottom-3 right-4 z-10 flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-[var(--theme-color-border-subtle)] px-3 text-sm shadow-md">
        <ArrowDown size={18} aria-hidden="true" />{state.newMessages > 0 && <span>{state.newMessages}</span>}
      </button>}
    </div>
    <div className="shrink-0 border-t border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)]">
      {muted && <p role="status" className="px-4 pt-2 text-xs text-[var(--theme-color-text-muted)]">{t("mutedUntil", { time: new Date(state.viewer!.mutedUntil!).toLocaleString(locale) })}</p>}
      {blocked && !muted && <p role="status" className="px-4 pt-2 text-xs text-[var(--theme-color-text-muted)]">{t("rateLimit", { seconds: remaining })}</p>}
      <ChatComposer draft={state.draft} blocked={blocked} images={images} onChange={session.setDraft}
        stampDisabled={muted || !profile || stampDeadline > now} onStamp={(stamp) => {
          if (muted || !profile) return;
          void resumeSoundEffectAudio().catch(() => {});
          const id = session.sendStamp(stamp);
          if (id) stampLayer.current?.play({ id, userId, publicUid: profile.publicUid, username: profile.username, stamp });
        }} onSend={(images) => {
        const sending = session.send(images);
        if (!sending) return false;
        jumpLatest(); void sending; return true;
      }} />
    </div>
    {viewingImage && <ImageViewer src={chatImageUrl(viewingImage)} label={t("image")} onClose={() => setViewingImage(null)}
      labels={{ close: t("closeImage"), instructions: t("imageInstructions"), previous: t("previousImage"), next: t("nextImage"), imageLoading: t("loading") }} />}
    <Dialog.Root open={!!deleting} onOpenChange={(value) => { if (!value && !busy) setDeleting(null); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-1020 bg-[var(--theme-color-overlay-background)]" />
        <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); document.getElementById("chat-draft")?.focus(); }}
          className="hhwx-floating-surface fixed left-1/2 top-1/2 z-1020 w-[calc(100%-2rem)] max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5">
          <Dialog.Title className="text-base font-semibold">{t("confirmDelete")}</Dialog.Title>
          {deleteFailed && <p role="alert" className="mt-3 text-sm text-[var(--theme-color-semantic-danger-foreground)]">{t("deleteFailed")}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close disabled={busy} className="hhwx-control min-h-11 rounded-full border px-4 text-sm">{t("cancel")}</Dialog.Close>
            <button type="button" disabled={busy} className="hhwx-action-accent min-h-11 rounded-full px-4 text-sm" onClick={async () => {
              if (!deleting) return;
              setBusy(true); setDeleteFailed(false);
              const succeeded = await session.remove(deleting.id);
              setBusy(false);
              if (succeeded) setDeleting(null); else setDeleteFailed(true);
            }}>{busy ? <LoadingSpinner /> : t("delete")}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}

function AccountDialog({ open, onOpenChange, trigger, userId }: Props & { userId: string | null }) {
  const t = useTranslations("chat");
  const chat = useChatSession(userId ?? "", open && !!userId);
  const images = useChatAttachments();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    const resize = () => {
      panel.current?.style.setProperty("--chat-viewport-height", `${viewport.height}px`);
      panel.current?.style.setProperty("--chat-viewport-top", `${viewport.offsetTop}px`);
    };
    const frame = requestAnimationFrame(resize);
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, [open]);
  // The session survives panel closure; Radix releases focus and scroll locks on unmount.
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-1000 bg-[var(--theme-color-overlay-background)] data-[state=closed]:hidden" />
      <Dialog.Content ref={panel} data-chat-panel aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}
        onEscapeKeyDown={(event) => {
          if (document.querySelector("[data-chat-popover], [data-chat-picker] [role=dialog]")) event.preventDefault();
        }}
        className="hhwx-floating-surface fixed left-1/2 top-[calc(var(--chat-viewport-top,0px)+var(--chat-viewport-height,100dvh)/2)] z-1000 flex h-[var(--chat-viewport-height,100dvh)] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden text-[var(--theme-color-text-default)] focus:outline-hidden data-[state=closed]:hidden sm:h-[min(48rem,calc(var(--chat-viewport-height,100dvh)-2rem))] sm:w-[calc(100%-2rem)] sm:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-2 sm:px-5">
          <Dialog.Title className="text-base font-semibold">{t("title")}</Dialog.Title>
          <Dialog.Close className="chat-icon-button" aria-label={t("close")}><X size={22} aria-hidden="true" /></Dialog.Close>
        </header>
        {userId && <Conversation userId={userId} open={open} images={images} {...chat} />}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export default function ChatDialog(props: Props) {
  const userId = useGameStore((s) => s.userId);
  return <AccountDialog key={userId ?? "guest"} {...props} userId={userId} />;
}
