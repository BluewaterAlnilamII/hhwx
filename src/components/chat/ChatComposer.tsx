"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RemoveScroll } from "react-remove-scroll";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import { CommentPublicUid } from "@/components/comments/CommentPublicUid";
import { resolveStoredAccountAvatarCardIdentity } from "@/lib/account-avatar-card";
import { chatMentionQuery, editChatMentions, insertChatMention, searchChatUsers, recentChatUsers } from "@/lib/chat/chat-mentions";
import type { ChatMention, ChatMentionUser, ChatRecentMentionUser } from "@/lib/chat/chat-contract";
import { ChatPresenceIndicator } from "./ChatPresence";
import dynamic from "next/dynamic";
import { ArrowUp, ImagePlus, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmojiPickerButton } from "@/components/comments/EmojiPickerButton";
import type { CommentStamp } from "@/lib/comments/stamps";
import { preloadSoundEffect } from "@/lib/sound-effect-audio";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { buildEmojiShortcode, insertCommentShortcode } from "@/lib/comments/comment-content";
import { countCommentCharacters, COMMENT_LENGTH_WARNING_THRESHOLD, truncateCommentContent } from "@/lib/comments/comment-contract";
import { CHAT_MAX_LENGTH, type ChatReply } from "@/lib/chat/chat-contract";
import { ChatReplyPreview } from "./ChatReplyPreview";
import { ChatMessageText } from "./ChatMessageText";
import { CHAT_IMAGE_MAX_ATTACHMENTS, type PreparedChatImage } from "@/lib/chat/chat-image-contract";
import { LoadingSpinner } from "@/components/LoadingIndicator";
import { ChatImageContent } from "./ChatImageContent";
import ImageViewer from "@/components/ImageViewer";

type DraftImage = { id: string; file: File; image?: PreparedChatImage & { url: string }; error?: string };
const StampPickerButton = dynamic(() => import("@/components/comments/StampPickerButton").then((module) => module.StampPickerButton), { ssr: false });

function preloadStampVoice(stamp: CommentStamp) {
  if (stamp.voiceUrl) void preloadSoundEffect(stamp.voiceUrl).catch(() => {});
}

// The account dialog owns drafts so closing its portal does not discard selected images.
export function useChatAttachments() {
  const [attachments, setAttachments] = useState<{ items: DraftImage[]; skipped: string[] }>({ items: [], skipped: [] });
  const previewUrls = useRef(new Map<string, string>());
  const processing = attachments.items.find((item) => !item.image && !item.error);

  useEffect(() => {
    if (!processing) return;
    const worker = new Worker(new URL("../../lib/chat/chat-image.worker.ts", import.meta.url));
    let active = true;
    worker.onmessage = (event: MessageEvent<{ image?: PreparedChatImage; error?: string }>) => {
      if (!active) return;
      let image: DraftImage["image"];
      if (event.data.image) {
        const url = URL.createObjectURL(event.data.image.blob);
        previewUrls.current.set(processing.id, url);
        image = { ...event.data.image, url };
      }
      setAttachments((current) => ({ ...current, items: current.items.map((item) => item.id === processing.id
        ? { ...item, image, error: image ? undefined : event.data.error ?? "CHAT_IMAGE_PROCESSING" } : item) }));
      worker.terminate();
    };
    worker.onerror = () => {
      if (active) setAttachments((current) => ({ ...current, items: current.items.map((item) => item.id === processing.id
        ? { ...item, error: "CHAT_IMAGE_PROCESSING" } : item) }));
      worker.terminate();
    };
    worker.postMessage(processing.file);
    return () => { active = false; worker.terminate(); };
  }, [processing]);
  useEffect(() => {
    const urls = previewUrls.current;
    return () => { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); };
  }, []);
  const addFiles = (files: File[]) => {
    const items = files.map((file) => ({ id: crypto.randomUUID(), file }));
    setAttachments((current) => {
      const available = CHAT_IMAGE_MAX_ATTACHMENTS - current.items.length;
      return { items: [...current.items, ...items.slice(0, available)], skipped: items.slice(available).map((item) => item.file.name) };
    });
  };
  const removeImage = (id: string) => {
    const url = previewUrls.current.get(id);
    if (url) URL.revokeObjectURL(url);
    previewUrls.current.delete(id);
    setAttachments((current) => ({ items: current.items.filter((item) => item.id !== id), skipped: [] }));
  };
  const clear = () => {
    for (const url of previewUrls.current.values()) URL.revokeObjectURL(url);
    previewUrls.current.clear();
    setAttachments({ items: [], skipped: [] });
  };
  return { attachments, addFiles, removeImage, clear };
}

export function ChatComposer({ draft, draftMentions, directory = null, onlineUsers = null, recentMentionUsers, mentionSuggestionsVersion, refreshMentionSuggestions, searchMentionUsers, reply, onCancelReply, blocked, images, onChange, onSend, onStamp, stampDisabled = false }: {
  draft: string;
  draftMentions: ChatMention[];
  directory?: ChatMentionUser[] | null;
  onlineUsers?: ChatMentionUser[] | null;
  recentMentionUsers: ChatRecentMentionUser[] | null;
  mentionSuggestionsVersion: number;
  refreshMentionSuggestions(): Promise<void>;
  searchMentionUsers(query: string, signal: AbortSignal): Promise<ChatMentionUser[]>;
  reply: ChatReply | null;
  onCancelReply(): void;
  blocked: boolean;
  images: ReturnType<typeof useChatAttachments>;
  onChange(value: string, mentions?: ChatMention[]): void;
  onSend(images: PreparedChatImage[]): boolean;
  onStamp: (stamp: CommentStamp) => void;
  stampDisabled?: boolean;
}) {
  const t = useTranslations("chat");
  const textarea = useAutoResizeTextarea(draft);
  const draftHighlight = useRef<HTMLDivElement>(null);
  const hasMentions = draftMentions.length > 0;
  const composing = useRef(false);
  const extras = useRef<HTMLDivElement>(null);
  const plus = useRef<HTMLButtonElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [mentionRange, setMentionRange] = useState<ReturnType<typeof chatMentionQuery>>(null);
  const [mentionResults, setMentionResults] = useState<{ range: NonNullable<ReturnType<typeof chatMentionQuery>>; users: ChatMentionUser[]; failed: boolean } | null>(null);
  const [selectedMention, setSelectedMention] = useState<string | null>(null);
  const mentionPanel = useRef<HTMLDivElement>(null);
  // Capture the first available cached result once per query, before rendering its rows.
  if (mentionRange && mentionResults?.range !== mentionRange) {
    const keyword = !!mentionRange.query.trim();
    const cached = keyword ? searchChatUsers(directory ?? [], mentionRange.query)
      : recentMentionUsers === null ? null : recentChatUsers(recentMentionUsers);
    if (cached && (!keyword || cached.length)) setMentionResults({ range: mentionRange, users: cached, failed: false });
  }
  const online = useMemo(() => new Set(onlineUsers?.map(user => user.userId)), [onlineUsers]);
  const currentResults = mentionResults?.range === mentionRange ? mentionResults : null;
  const mentionUsers = currentResults?.users ?? [];
  const mentionIndex = Math.max(0, mentionUsers.findIndex(user => user.userId === selectedMention));
  useLayoutEffect(() => {
    const field = textarea.current, highlight = draftHighlight.current;
    if (!field || !highlight) return;
    // Keep native editing/caret behavior while mirroring only its text colors.
    const sync = () => { highlight.style.width = `${field.clientWidth}px`; highlight.scrollTop = field.scrollTop; };
    sync();
    const observer = new ResizeObserver(sync); observer.observe(field);
    field.addEventListener("scroll", sync);
    return () => { observer.disconnect(); field.removeEventListener("scroll", sync); };
  }, [hasMentions, textarea]);
  useLayoutEffect(() => {
    if (draftHighlight.current && textarea.current) draftHighlight.current.scrollTop = textarea.current.scrollTop;
  }, [draft, textarea]);
  const updateMentionQuery = (value: string, cursor: number, selected = draftMentions) => {
    const range = chatMentionQuery(value, cursor, selected);
    if (range && mentionRange && range.start === mentionRange.start && range.end === mentionRange.end && range.query === mentionRange.query) return;
    setMentionRange(range); setSelectedMention(null);
    if (range) { setEmojiOpen(false); setStampOpen(false); setExtrasOpen(false); }
  };
  const selectMention = (user: ChatMentionUser) => {
    if (!mentionRange) return;
    const inserted = insertChatMention(draft, mentionRange, user, draftMentions);
    if (countCommentCharacters(inserted.text) > CHAT_MAX_LENGTH) return;
    onChange(inserted.text, inserted.mentions); setMentionRange(null);
    requestAnimationFrame(() => { textarea.current?.focus({ preventScroll: true }); textarea.current?.setSelectionRange(inserted.cursor, inserted.cursor); });
  };
  useEffect(() => {
    // Background cache changes feed the next query, never a completed selection list.
    if (!mentionRange || mentionRange.query.trim() || mentionResults?.range === mentionRange) return;
    const abort = new AbortController();
    void refreshMentionSuggestions().catch(() => {
      if (!abort.signal.aborted) setMentionResults({ range: mentionRange, users: [], failed: true });
    });
    return () => abort.abort();
  }, [mentionRange, mentionResults, mentionSuggestionsVersion, refreshMentionSuggestions]);
  useEffect(() => {
    if (!mentionRange?.query.trim() || mentionResults?.range === mentionRange) return;
    const abort = new AbortController();
    const complete = (users: ChatMentionUser[], failed = false) => {
      if (!abort.signal.aborted) setMentionResults({ range: mentionRange, users: users.slice(0, 8), failed });
    };
    const timer = setTimeout(() => {
      void searchMentionUsers(mentionRange.query, abort.signal).then(users => complete(users)).catch(() => complete([], true));
    }, 150);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [mentionRange, mentionResults, searchMentionUsers]);
  useEffect(() => {
    if (!mentionRange) return;
    const dismiss = (event: PointerEvent) => {
      if (!mentionPanel.current?.contains(event.target as Node) && event.target !== textarea.current) setMentionRange(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [mentionRange, textarea]);
  const chars = countCommentCharacters(draft);
  const fileInput = useRef<HTMLInputElement>(null);
  const { attachments, addFiles, removeImage, clear } = images;
  const preview = attachments.items.find((item) => item.id === previewId)?.image;
  const imagesReady = attachments.items.every((item) => !!item.image);

  useEffect(() => {
    if (!extrasOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!extras.current?.contains(event.target as Node)) setExtrasOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); setExtrasOpen(false); plus.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape, true);
    };
  }, [extrasOpen]);

  const insertEmoji = (name: string) => {
    const field = textarea.current;
    const { nextValue, nextCursor } = insertCommentShortcode(
      draft, buildEmojiShortcode(name), field?.selectionStart ?? draft.length, field?.selectionEnd ?? draft.length,
    );
    onChange(nextValue);
    setEmojiOpen(false);
    requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(nextCursor, nextCursor); });
  };

  return <form autoComplete="off" className="shrink-0 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-4"
    onSubmit={(event) => {
      event.preventDefault();
      if (!blocked && imagesReady && chars <= CHAT_MAX_LENGTH) {
        setEmojiOpen(false); setExtrasOpen(false); setMentionRange(null);
        if (!onSend(attachments.items.map((item) => item.image!))) return;
        clear(); setPreviewId(null);
      }
    }}>
    {reply && <div className="mb-2 flex items-start gap-2 rounded-xl bg-[var(--theme-color-control-background)] p-2" data-chat-reply-draft>
      <div className="min-w-0 flex-1"><ChatReplyPreview reply={reply} />
        {reply.deleted && <p role="alert" className="text-xs text-[var(--theme-color-semantic-danger-foreground)]">{t("replyUnavailable")}</p>}
      </div>
      <button type="button" className="chat-icon-button size-9!" aria-label={t("cancelReply")} onClick={onCancelReply}><X size={16} /></button>
    </div>}
    {!!attachments.items.length && <ul aria-label={t("attachments")} className="mb-2 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1">
      {attachments.items.map((item) => <li key={item.id} className="relative w-32 shrink-0">
        <div className="grid h-24 place-items-center overflow-hidden rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)]">
          {item.image ? <ChatImageContent src={item.image.url} width={item.image.width} height={item.image.height} compact onOpen={() => setPreviewId(item.id)} />
            : <span role="status" className="px-2 pt-5 text-center text-[11px] text-[var(--theme-color-text-muted)]">
              {item.error ? t(t.has(`errors.${item.error}`) ? `errors.${item.error}` : "errors.CHAT_IMAGE_PROCESSING")
                : <><LoadingSpinner className="size-4" /><span className="sr-only">{t("preparingImage")}</span></>}
            </span>}
        </div>
        <button type="button" className="hhwx-control absolute right-1 top-1 flex size-8 items-center justify-center rounded-full border shadow-sm"
          onClick={() => removeImage(item.id)} aria-label={t("removeAttachment", { name: item.file.name })}><X size={16} aria-hidden="true" /></button>
        <p className="mt-1 truncate px-1 text-[11px] text-[var(--theme-color-text-muted)]" title={item.file.name}>{item.file.name}</p>
      </li>)}
    </ul>}
    {!!attachments.skipped.length && <p role="alert" className="mb-2 max-h-12 overflow-y-auto px-1 text-xs text-[var(--theme-color-semantic-danger-foreground)]">
      {t("attachmentLimit", { count: CHAT_IMAGE_MAX_ATTACHMENTS, names: attachments.skipped.join(", ") })}
    </p>}
    {preview && <ImageViewer src={preview.url} label={t("image")} onClose={() => setPreviewId(null)}
      labels={{ close: t("closeImage"), instructions: t("imageInstructions"), previous: t("previousImage"), next: t("nextImage"), imageLoading: t("loading") }} />}
    <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/apng,image/webp,image/gif" className="hidden" onChange={(event) => {
      addFiles(Array.from(event.target.files ?? [])); event.target.value = "";
    }} />
    <div className="flex items-end gap-1 sm:gap-2">
      <div ref={extras} className="relative mb-0.5 shrink-0">
        <button ref={plus} type="button" className="chat-icon-button" aria-label={t("moreActions")}
          aria-expanded={extrasOpen} aria-controls="chat-extras" aria-haspopup="dialog"
          onClick={() => { setExtrasOpen(!extrasOpen); setEmojiOpen(false); setStampOpen(false); }}>
          <Plus size={24} aria-hidden="true" />
        </button>
        {extrasOpen && <div id="chat-extras" role="dialog" aria-label={t("moreActions")} data-chat-popover
          className="hhwx-floating-surface absolute bottom-14 left-0 z-20 w-52 rounded-xl border border-[var(--theme-color-border-subtle)] p-2">
          <button type="button" disabled={blocked} onClick={() => { setExtrasOpen(false); fileInput.current?.click(); }}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-sm hover:bg-[var(--theme-color-control-background-hover)] disabled:opacity-40">
            <ImagePlus size={20} aria-hidden="true" />
            <span>{t("sendImage")}</span>
          </button>
        </div>}
      </div>
      <div data-chat-input className="hhwx-control relative flex min-w-0 flex-1 items-end rounded-3xl border pl-3 pr-0.5 focus-within:border-[var(--theme-color-focus-ring)] sm:pl-4">
        {mentionRange && <RemoveScroll enabled allowPinchZoom shards={[textarea]}>
          <div ref={mentionPanel} data-chat-popover data-chat-mention-picker id="chat-mention-options" role="listbox" aria-label={t("mentionUsers")}
            className="hhwx-floating-surface absolute bottom-[calc(100%+0.5rem)] left-0 z-20 max-h-[min(21rem,50dvh)] w-64 max-w-[calc(100vw-5rem)] overflow-y-auto overscroll-contain rounded-lg border border-[var(--theme-color-border-subtle)] p-1.5 shadow-lg">
            {mentionUsers.map((user, index) => {
              const avatar = resolveStoredAccountAvatarCardIdentity(user.avatarCardId, user.avatarCardServer);
              return <div key={user.userId} id={`chat-mention-${user.userId}`} role="option" aria-selected={mentionIndex === index}
                onPointerDown={event => event.preventDefault()} onClick={() => selectMention(user)}
                onPointerMove={() => setSelectedMention(user.userId)}
                className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 ${index === mentionIndex ? "bg-[var(--theme-color-control-background-hover)]" : ""}`}>
                <span className="relative shrink-0"><AccountCardAvatar username={user.username} cardId={avatar.cardId} entityServer={avatar.entityServer} trainType={user.avatarCardTrainType} size="toolbar" /><ChatPresenceIndicator online={onlineUsers ? online.has(user.userId) : null} /></span>
                <span className="min-w-0 truncate text-xs font-semibold text-[var(--theme-color-text-default)]">{user.username}</span>
                <CommentPublicUid publicUid={user.publicUid} />
              </div>;
            })}
            {!mentionUsers.length && <div role="status" className="px-2 py-3 text-xs text-[var(--theme-color-text-muted)]">
              {t(!currentResults ? "loading" : currentResults.failed ? "mentionSearchFailed" : "mentionNoResults")}
            </div>}
          </div>
        </RemoveScroll>}
        <label className="sr-only" htmlFor="chat-draft">{t("draft")}</label>
        <div className="relative min-w-0 flex-1">
        {hasMentions && <div ref={draftHighlight} data-chat-draft-highlight aria-hidden="true"
          className="chat-draft-highlight pointer-events-none absolute inset-0 overflow-hidden py-3 pr-1 text-base leading-6 text-[var(--theme-color-text-default)] sm:text-sm">
          <ChatMessageText content={draft} mentions={draftMentions} draft />{"\u200b"}
        </div>}
        <textarea ref={textarea} id="chat-draft" value={draft} placeholder={t("placeholder")} rows={1} autoComplete="off"
          aria-autocomplete="list" aria-controls={mentionRange ? "chat-mention-options" : undefined}
          aria-activedescendant={mentionRange && mentionUsers[mentionIndex] ? `chat-mention-${mentionUsers[mentionIndex].userId}` : undefined}
          className={`chat-draft-input relative block max-h-40 min-h-12 w-full resize-none border-0 bg-transparent py-3 pr-1 text-base leading-6 outline-hidden placeholder:text-[var(--theme-color-text-muted)] sm:text-sm ${hasMentions ? "text-transparent caret-[var(--theme-color-text-default)]" : ""}`}
          onChange={(event) => {
            const value = event.target.value, mentions = editChatMentions(draft, value, draftMentions);
            onChange(value, mentions);
            if (!composing.current) updateMentionQuery(value, event.target.selectionStart, mentions);
          }}
          onClick={event => { if (event.currentTarget.selectionStart === event.currentTarget.selectionEnd) updateMentionQuery(draft, event.currentTarget.selectionStart); else setMentionRange(null); }}
          onPaste={(event) => {
            const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
            if (!images.length) return;
            event.preventDefault(); addFiles(images);
            const text = event.clipboardData.getData("text/plain");
            if (text) {
              const field = event.currentTarget, start = field.selectionStart, end = field.selectionEnd;
              const next = truncateCommentContent(draft.slice(0, start) + text + draft.slice(end));
              onChange(next);
              requestAnimationFrame(() => field.setSelectionRange(Math.min(start + text.length, next.length), Math.min(start + text.length, next.length)));
            }
          }}
          onCompositionStart={() => { composing.current = true; setMentionRange(null); }} onCompositionEnd={event => { composing.current = false; updateMentionQuery(event.currentTarget.value, event.currentTarget.selectionStart); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
            if (mentionRange) {
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMentionRange(null); return; }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const index = (mentionIndex + (event.key === "ArrowDown" ? 1 : -1) + mentionUsers.length) % (mentionUsers.length || 1);
                setSelectedMention(mentionUsers[index]?.userId ?? null); mentionPanel.current?.querySelectorAll('[role="option"]')[index]?.scrollIntoView({ block: "nearest" }); return;
              }
              if (!event.shiftKey && (event.key === "Enter" || event.key === "Tab") && mentionUsers[mentionIndex]) {
                event.preventDefault(); selectMention(mentionUsers[mentionIndex]); return;
              }
              if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End" || event.key === "Tab") setMentionRange(null);
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
              event.preventDefault(); event.currentTarget.form?.requestSubmit();
            }
          }} />
        </div>
        <div className="mb-0.5 flex shrink-0 items-center" data-chat-picker>
          <EmojiPickerButton variant="composer" open={emojiOpen}
            onOpenChange={(value) => { setEmojiOpen(value); if (value) { setExtrasOpen(false); setStampOpen(false); } }} onSelect={insertEmoji} />
          <StampPickerButton variant="composer" open={stampOpen} label={t("stamp")} disabled={stampDisabled}
            onPreview={preloadStampVoice}
            onOpenChange={(value) => { setStampOpen(value); if (value) { setExtrasOpen(false); setEmojiOpen(false); } }}
            onSelect={(stamp) => { if (!stampDisabled) onStamp(stamp); setStampOpen(false); }} />
        </div>
      </div>
      <button type="submit" aria-label={t("send")} title={t("send")}
        className="hhwx-action-accent mb-0.5 flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        disabled={blocked || !imagesReady || chars > CHAT_MAX_LENGTH}>
        <ArrowUp size={24} aria-hidden="true" />
      </button>
    </div>
    {chars > COMMENT_LENGTH_WARNING_THRESHOLD && <p role="status" className="mt-1 text-right text-xs text-[var(--theme-color-semantic-warning-foreground)]">{chars}/{CHAT_MAX_LENGTH}</p>}
  </form>;
}
