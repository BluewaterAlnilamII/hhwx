"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import dynamic from "next/dynamic";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAccountProfileStore } from "@/store/useAccountProfileStore";
import { resumeSoundEffectAudio } from "@/lib/sound-effect-audio";
import type { ChatStampLayerHandle } from "./ChatStampLayer";
import type { useChatSession } from "@/hooks/useChatSession";
import { LoadingSpinner } from "@/components/LoadingIndicator";
import { formatChatTime, getChatMessageLayout } from "@/lib/chat/chat-presentation";
import type { ChatMessage } from "@/lib/chat/chat-contract";
import { ChatComposer, useChatAttachments } from "./ChatComposer";
import { ChatMessageRow } from "./ChatMessageRow";
import { ChatPendingMessage } from "./ChatPendingMessage";
import ImageViewer from "@/components/ImageViewer";
import { chatImageUrl } from "@/lib/chat/chat-image-contract";

type Props = { open: boolean; onOpenChange(open: boolean): void; trigger: RefObject<HTMLButtonElement | null>; userId: string } & ReturnType<typeof useChatSession>;
const ChatStampLayer = dynamic(() => import("./ChatStampLayer").then((module) => module.ChatStampLayer), { ssr: false });

const ChatMessages = memo(function ChatMessages({ messages, quickReactions, userId, canModerate, busy, onDelete, onMute, onOpenImage, getImagePreview, session, muted, onReply, onLocate, highlighted }: {
  session: Props["session"];
  muted: boolean;
  onReply(message: ChatMessage): void;
  onLocate(id: string): Promise<boolean>;
  highlighted: { id: string; sequence: number } | null;
  messages: ChatMessage[];
  quickReactions: string[];
  userId: string;
  canModerate: boolean;
  busy: boolean;
  onDelete(message: ChatMessage): void;
  onMute(userId: string, minutes: number | null): Promise<boolean>;
  onOpenImage(source: string): void;
  getImagePreview(messageId: string): string | undefined;
}) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const rows = useMemo(() => getChatMessageLayout(messages), [messages]);
  return <>{rows.map(({ message, showTime, showAuthor }) => {
    const own = message.author.userId === userId;
    const mentioned = !own && message.mentions?.some(mention => mention.userId === userId);
    const imageSource = message.image ? getImagePreview(message.id) ?? chatImageUrl(message.image) : undefined;
    return <li key={message.id} data-message-id={message.id}>
      {showTime && <div className="flex justify-center py-3"><time dateTime={message.createdAt}
        title={new Date(message.createdAt).toLocaleString(locale)}
        className="rounded-full px-2.5 text-[11px] text-[var(--theme-color-text-muted)]">
        {formatChatTime(message.createdAt, locale, t("yesterday"))}
      </time></div>}
      <ChatMessageRow message={message} quickReactions={quickReactions} own={own} mentioned={!!mentioned} canModerate={canModerate}
        showAuthor={showAuthor} showTime={showTime} highlightSequence={highlighted?.id === message.id ? highlighted.sequence : undefined}
        imageSource={imageSource} onOpenImage={() => { if (imageSource) onOpenImage(imageSource); }}
        session={session} muted={muted} onReply={onReply} onLocate={onLocate} busy={busy} onDelete={onDelete} onMute={onMute} />
    </li>;
  })}</>;
});

function ChatMentionBanner({ mention, total, onLocate, onDismiss }: {
  mention: Props["state"]["mentions"]["items"][number] | undefined;
  total: number;
  onLocate(id: string): void;
  onDismiss(id: string): void;
}) {
  const t = useTranslations("chat");
  const locale = useLocale();
  // Retain the text during retraction; the closed card cannot receive focus or clicks.
  const [lastMention, setLastMention] = useState(mention);
  if (mention && mention !== lastMention) setLastMention(mention);
  const displayed = mention ?? lastMention;
  return <div className="chat-mention-banner-slot relative z-10 shrink-0 bg-[var(--theme-color-chat-background)]" data-open={!!mention}
    inert={!mention} aria-hidden={!mention}>
    <div className="min-h-0 overflow-hidden">
      {displayed && <div data-chat-mention-banner={mention ? "" : undefined}
        className="chat-mention-banner mx-3 mb-2 flex h-11 items-center gap-1 rounded-b-xl px-3 sm:mx-4">
        <button type="button" className="flex h-full min-w-0 flex-1 items-center rounded-b-lg text-left text-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--theme-color-focus-ring)]"
          onClick={() => { if (mention) onLocate(mention.id); }}>
          <span key={displayed.id} className="chat-mention-banner-content flex min-w-0 flex-1 items-center gap-2">
            <span className="flex min-w-0 items-baseline gap-1 whitespace-nowrap">{t.rich("mentionBy", {
              username: displayed.username,
              name: chunks => <span className="min-w-0 truncate font-medium text-[var(--theme-color-chat-mention-foreground)]">{chunks}</span>,
            })}</span>
            <time dateTime={displayed.createdAt} className="shrink-0 text-[11px] text-[var(--theme-color-text-muted)]">
              {formatChatTime(displayed.createdAt, locale, t("yesterday"))}
            </time>
            {total > 1 && <span className="ml-auto shrink-0 text-[11px] text-[var(--theme-color-text-muted)]">{t("moreMentions", { count: total - 1 })}</span>}
          </span>
        </button>
        <button type="button" className="chat-icon-button size-8!" aria-label={t("dismissMention")}
          onClick={() => { if (mention) onDismiss(mention.id); }}><X size={16} aria-hidden="true" /></button>
      </div>}
    </div>
  </div>;
}

function Conversation({ userId, open, images, session, state }: {
  userId: string; open: boolean; images: ReturnType<typeof useChatAttachments>;
} & ReturnType<typeof useChatSession>) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const scroll = useRef<HTMLDivElement>(null);
  const stampLayer = useRef<ChatStampLayerHandle>(null);
  const profile = useAccountProfileStore((state) => state.userId === userId ? state.profile : null);
  const list = useRef<HTMLOListElement>(null);
  const following = useRef(state.following);
  const anchors = useRef(session.scrollAnchors);
  const expectedScroll = useRef<number | null>(null);
  const lastScroll = useRef(0);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ChatMessage | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<{ id: string; sequence: number } | null>(null);
  const locateFrame = useRef(0);
  const [mentionLocateError, setMentionLocateError] = useState<"deleted" | "failed" | null>(null);
  const shown = state.context ?? state;
  useEffect(() => { if (!highlighted) return; const timer = setTimeout(() => setHighlighted(null), 1800); return () => clearTimeout(timer); }, [highlighted]);
  useEffect(() => () => cancelAnimationFrame(locateFrame.current), []);
  const loading = open && ((!state.messages.length && ["paused", "connecting", "syncing"].includes(state.status)) || state.loadingOlder);
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

  const captureAnchor = useCallback(() => {
    const el = scroll.current;
    // Radix hides the closing panel before unmount; its zero-size layout is not a reading position.
    if (!el?.clientHeight) return;
    const top = el.getBoundingClientRect().top;
    const rows = [...el.querySelectorAll<HTMLElement>("[data-message-id]")];
    const index = rows.findIndex(item => item.getBoundingClientRect().bottom > top);
    // Neighbours preserve the viewport when the first visible row is deleted offline.
    anchors.current = [...rows.slice(Math.max(0, index)), ...rows.slice(0, Math.max(0, index)).reverse()]
      .map(row => ({ id: row.dataset.messageId!, top: row.getBoundingClientRect().top - top }));
    session.setScrollAnchors(anchors.current);
  }, [session]);
  const preserveScroll = useCallback(() => {
    const el = scroll.current;
    if (!el?.clientHeight) return;
    if (following.current) el.scrollTop = el.scrollHeight;
    else {
      for (const anchor of anchors.current) {
        const row = el.querySelector<HTMLElement>(`[data-message-id="${anchor.id}"]`);
        if (!row) continue;
        el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.top;
        break;
      }
    }
    expectedScroll.current = el.scrollTop;
    lastScroll.current = el.scrollTop;
    captureAnchor();
  }, [captureAnchor]);
  const checkPosition = useCallback(() => {
    const el = scroll.current;
    const current = session.getSnapshot();
    if (!el?.clientHeight || current.loadingOlder || current.context) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance <= 2) { session.setFollowing(true); session.markRead(); }
  }, [session]);
  useLayoutEffect(() => {
    following.current = state.following;
    preserveScroll();
    if (open) checkPosition();
  }, [state.messages, state.context, state.pending, state.status, state.following,
    state.loadingOlder, open, preserveScroll, checkPosition]);
  useEffect(() => {
    const observer = new ResizeObserver(() => { preserveScroll(); checkPosition(); });
    if (scroll.current) observer.observe(scroll.current);
    if (list.current) observer.observe(list.current);
    return () => observer.disconnect();
  }, [preserveScroll, checkPosition]);
  useEffect(() => {
    let frame = 0;
    const check = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(checkPosition); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [checkPosition]);
  const jumpLatest = () => {
    void session.jumpLatest();
  };
  const blocked = deadline > now;
  const muted = Date.parse(state.viewer?.mutedUntil ?? "") > now;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const reply = useCallback((message: ChatMessage) => {
    session.setReply(message);
    requestAnimationFrame(() => document.getElementById("chat-draft")?.focus({ preventScroll: true }));
  }, [session]);
  const locate = useCallback(async (id: string) => {
    cancelAnimationFrame(locateFrame.current);
    captureAnchor();
    if (!await session.locate(id)) return false;
    locateFrame.current = requestAnimationFrame(() => {
      const el = scroll.current;
      const row = el?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
      if (!el || !row) return;
      following.current = false;
      el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 3;
      expectedScroll.current = el.scrollTop;
      captureAnchor();
      setHighlighted(previous => ({ id, sequence: (previous?.sequence ?? 0) + 1 }));
    });
    return true;
  }, [session, captureAnchor]);
  useEffect(() => {
    if (!open || !state.mentionTarget || state.status !== "live") return;
    const id = state.mentionTarget;
    const frame = requestAnimationFrame(() => {
      session.requestMentionLocation(null);
      void locate(id).then(found => setMentionLocateError(found || session.getSnapshot().mentions.items.some(m => m.id === id) ? null : "deleted"), () => setMentionLocateError("failed"));
    });
    return () => cancelAnimationFrame(frame);
  }, [open, state.mentionTarget, state.status, session, locate]);
  useEffect(() => {
    const container = scroll.current;
    if (!open || !container || !state.mentions.items.length) return;
    let timer = 0;
    const visible = new Set<string>();
    const acknowledge = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible" && document.hasFocus()) void session.acknowledgeMentions([...visible], true);
      }, 300);
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = entry.target.closest<HTMLElement>("[data-message-id]")?.dataset.messageId;
        if (!id) continue;
        // Long messages may never fit half their height inside the viewport.
        if (entry.isIntersecting && entry.intersectionRatio >= 0.01) visible.add(id); else visible.delete(id);
      }
      acknowledge();
    }, { root: container, threshold: [0, 0.01] });
    const pendingIds = new Set(state.mentions.items.map(m => m.id));
    for (const message of shown.messages) {
      if (!pendingIds.has(message.id) && !(message.author.userId !== userId && message.mentions?.some(m => m.userId === userId))) continue;
      const bubble = container.querySelector(`[data-message-id="${message.id}"] [data-chat-bubble]`);
      if (bubble) observer.observe(bubble);
    }
    window.addEventListener("focus", acknowledge); document.addEventListener("visibilitychange", acknowledge);
    return () => { clearTimeout(timer); observer.disconnect(); window.removeEventListener("focus", acknowledge); document.removeEventListener("visibilitychange", acknowledge); };
  }, [open, shown.messages, state.mentions.items, session, userId]);
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
    <ChatMentionBanner mention={state.mentions.items[0]} total={state.mentions.total}
      onLocate={id => session.requestMentionLocation(id)}
      onDismiss={id => { captureAnchor(); void session.acknowledgeMentions([id]); }} />
    {(mentionLocateError || state.mentionError) && <button type="button" role="alert" className="shrink-0 px-4 py-1 text-left text-xs text-[var(--theme-color-semantic-danger-foreground)]"
      onClick={() => { setMentionLocateError(null); void session.refreshMentions(); }}>{mentionLocateError === "deleted" ? t("messageDeleted") : mentionLocateError ? t("locateFailed") : t("mentionSyncFailed")}</button>}
    <div className="relative flex min-h-0 flex-1 flex-col bg-[var(--theme-color-chat-background)]">
      {loading && <span role="status" aria-label={t("loading")} className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center"><LoadingSpinner /></span>}
      <div ref={scroll} className="min-h-0 flex-1 select-none overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 [overflow-anchor:none] sm:px-5"
        aria-label={t("messages")} onScroll={() => {
          const el = scroll.current;
          if (!el?.clientHeight) return;
          if (expectedScroll.current !== null && Math.abs(el.scrollTop - expectedScroll.current) < 1) {
            expectedScroll.current = null; return;
          }
          expectedScroll.current = null;
          const downward = el.scrollTop > lastScroll.current;
          lastScroll.current = el.scrollTop;
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
          captureAnchor();
          session.setFollowing(downward && distance <= 2);
          if (downward && distance <= 2) session.markRead();
        }}>
        {shown.nextCursor && <div className="mb-4 text-center"><button type="button"
          className="min-h-10 rounded-full px-4 text-xs text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background)] disabled:opacity-50"
          disabled={state.loadingOlder || state.status === "syncing"} onClick={() => { following.current = false; captureAnchor(); void session.loadOlder(); }}>
          {t("older")}
        </button></div>}
        {state.status === "live" && !state.messages.length && !state.pending.length && <p className="flex min-h-40 items-center justify-center py-12 text-sm text-[var(--theme-color-text-muted)]">{t("empty")}</p>}
        <ol ref={list} className="flex flex-col">
          <ChatMessages messages={shown.messages} quickReactions={state.quickReactions} session={session} muted={muted} onReply={reply} onLocate={locate} highlighted={highlighted} userId={userId} canModerate={state.viewer?.canModerate ?? false}
            busy={busy} onDelete={confirmDelete} onMute={mute} onOpenImage={setViewingImage} getImagePreview={session.getImagePreview} />
          {!state.context && state.pending.map((pending) => <ChatPendingMessage key={pending.clientRequestId} pending={pending} blocked={blocked}
            onRetry={() => void session.retry(pending.clientRequestId)} onRetryWithoutReply={() => void session.retryWithoutReply(pending.clientRequestId)} onDiscard={() => session.discard(pending.clientRequestId)} />)}
        </ol>
      </div>
      <ChatStampLayer ref={stampLayer} />
      {!state.following && <button type="button" onClick={jumpLatest}
        aria-label={t("latest")}
        title={t("latest")} className="hhwx-floating-surface absolute bottom-3 right-4 z-10 flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-[var(--theme-color-border-subtle)] px-3 text-sm shadow-md">
        <ArrowDown size={18} aria-hidden="true" />
      </button>}
    </div>
    <div className="shrink-0 border-t border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)]">
      {muted && <p role="status" className="px-4 pt-2 text-xs text-[var(--theme-color-text-muted)]">{t("mutedUntil", { time: new Date(state.viewer!.mutedUntil!).toLocaleString(locale) })}</p>}
      {blocked && !muted && <p role="status" className="px-4 pt-2 text-xs text-[var(--theme-color-text-muted)]">{t("rateLimit", { seconds: remaining })}</p>}
      <ChatComposer reply={state.reply} onCancelReply={() => session.setReply(null)} draft={state.draft} draftMentions={state.draftMentions} searchMentionUsers={session.searchMentionUsers} blocked={blocked} images={images} onChange={session.setDraft}
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
    {viewingImage && <ImageViewer src={viewingImage} crossOrigin="anonymous" label={t("image")} onClose={() => setViewingImage(null)}
      labels={{ close: t("closeImage"), instructions: t("imageInstructions"), previous: t("previousImage"), next: t("nextImage"), imageLoading: t("loading") }} />}
    <Dialog.Root open={!!deleting} onOpenChange={(value) => { if (!value && !busy) setDeleting(null); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-1020 bg-[var(--theme-color-overlay-background)]" />
        <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); document.querySelector<HTMLElement>("[data-chat-panel]")?.focus({ preventScroll: true }); }}
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

export default function ChatDialog({ open, onOpenChange, trigger, userId, session, state }: Props) {
  const t = useTranslations("chat");
  const chat = { session, state };
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
      <Dialog.Overlay className="fixed inset-0 z-1000 bg-[var(--theme-color-panel-background)] data-[state=closed]:hidden sm:bg-[var(--theme-color-overlay-background)]" />
      <Dialog.Content ref={panel} data-chat-panel aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}
        onEscapeKeyDown={(event) => {
          if (document.querySelector("[data-chat-popover], [data-chat-picker] [role=dialog]")) event.preventDefault();
          else if (state.reply) {
            event.preventDefault(); session.setReply(null);
            document.getElementById("chat-draft")?.focus({ preventScroll: true });
          }
        }}
        className="hhwx-floating-surface fixed left-1/2 top-0 z-1000 h-dvh w-full max-w-2xl -translate-x-1/2 overflow-hidden text-[var(--theme-color-text-default)] focus:outline-hidden data-[state=closed]:hidden sm:top-[calc(var(--chat-viewport-top,0px)+var(--chat-viewport-height,100dvh)/2)] sm:h-[min(48rem,calc(var(--chat-viewport-height,100dvh)-2rem))] sm:w-[calc(100%-2rem)] sm:-translate-y-1/2 sm:rounded-2xl">
        {/* Keep the mobile surface behind browser keyboard controls; only its contents shrink. */}
        <div data-chat-viewport className="flex h-[var(--chat-viewport-height,100dvh)] translate-y-[var(--chat-viewport-top,0px)] flex-col sm:h-full sm:translate-y-0">
        <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-2 sm:px-5">
          <Dialog.Title title={t("title")} className="min-w-0 truncate text-base font-semibold">{t("title")}</Dialog.Title>
          {chat.state.newMessages > 0 && <span role="status" className="shrink-0 whitespace-nowrap text-xs text-[var(--theme-color-semantic-info-foreground)]">{t("newMessages")}</span>}
          <Dialog.Close className="chat-icon-button" aria-label={t("close")}><X size={22} aria-hidden="true" /></Dialog.Close>
        </header>
        {userId && <Conversation userId={userId} open={open} images={images} {...chat} />}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
