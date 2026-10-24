"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUp, ImagePlus, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmojiPickerButton } from "@/components/comments/EmojiPickerButton";
import { COMMENT_STAMP_DEFAULT_REGION, type CommentStamp, type CommentStampRegion } from "@/lib/comments/stamps";
import { preloadSoundEffect } from "@/lib/sound-effect-audio";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { buildEmojiShortcode, insertCommentShortcode } from "@/lib/comments/comment-content";
import { countCommentCharacters, COMMENT_LENGTH_WARNING_THRESHOLD, truncateCommentContent } from "@/lib/comments/comment-contract";
import { CHAT_MAX_LENGTH } from "@/lib/chat/chat-contract";
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

export function ChatComposer({ draft, blocked, images, onChange, onSend, onStamp, stampDisabled = false }: {
  draft: string;
  blocked: boolean;
  images: ReturnType<typeof useChatAttachments>;
  onChange(value: string): void;
  onSend(images: PreparedChatImage[]): boolean;
  onStamp: (stamp: CommentStamp) => void;
  stampDisabled?: boolean;
}) {
  const t = useTranslations("chat");
  const textarea = useAutoResizeTextarea(draft);
  const composing = useRef(false);
  const extras = useRef<HTMLDivElement>(null);
  const plus = useRef<HTMLButtonElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [stampRegion, setStampRegion] = useState<CommentStampRegion>(COMMENT_STAMP_DEFAULT_REGION);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
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

  return <form className="shrink-0 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-4"
    onSubmit={(event) => {
      event.preventDefault();
      if (!blocked && imagesReady && chars <= CHAT_MAX_LENGTH) {
        setEmojiOpen(false); setExtrasOpen(false);
        if (!onSend(attachments.items.map((item) => item.image!))) return;
        clear(); setPreviewId(null);
        textarea.current?.focus();
      }
    }}>
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
      <div data-chat-input className="hhwx-control flex min-w-0 flex-1 items-end rounded-3xl border pl-3 pr-0.5 focus-within:border-[var(--theme-color-focus-ring)] sm:pl-4">
        <label className="sr-only" htmlFor="chat-draft">{t("draft")}</label>
        <textarea ref={textarea} id="chat-draft" value={draft} placeholder={t("placeholder")} rows={1}
          className="block max-h-40 min-h-12 min-w-0 flex-1 resize-none border-0 bg-transparent py-3 pr-1 text-base leading-6 outline-hidden placeholder:text-[var(--theme-color-text-muted)] sm:text-sm"
          onChange={(event) => onChange(event.target.value)}
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
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
              event.preventDefault(); event.currentTarget.form?.requestSubmit();
            }
          }} />
        <div className="mb-0.5 flex shrink-0 items-center" data-chat-picker>
          <EmojiPickerButton variant="composer" open={emojiOpen}
            onOpenChange={(value) => { setEmojiOpen(value); if (value) { setExtrasOpen(false); setStampOpen(false); } }} onSelect={insertEmoji} />
          <StampPickerButton variant="composer" open={stampOpen} label={t("stamp")} disabled={stampDisabled}
            selectedRegion={stampRegion} onRegionChange={setStampRegion} onPreview={preloadStampVoice}
            onOpenChange={(value) => { setStampOpen(value); if (value) { setExtrasOpen(false); setEmojiOpen(false); } }}
            onSelect={(stamp) => { if (!stampDisabled) onStamp(stamp); setStampOpen(false); textarea.current?.focus(); }} />
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
