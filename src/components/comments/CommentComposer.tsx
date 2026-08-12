"use client";

import { memo, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import {
  COMMENT_STAMP_DEFAULT_REGION,
  type CommentStamp,
  type CommentStampRegion,
} from "@/lib/comments/stamps";
import {
  COMMENT_LENGTH_WARNING_THRESHOLD,
  MAX_COMMENT_LENGTH,
  countCommentCharacters,
} from "@/lib/comments/comment-contract";
import {
  clearCommentDraft,
  readCommentDraft,
  writeCommentDraft,
} from "@/lib/comments/comment-drafts";
import { cn } from "@/lib/utils";
import {
  buildEmojiShortcode,
  buildStampShortcode,
  insertCommentShortcode,
} from "@/lib/comments/comment-content";
import { EmojiPickerButton } from "./EmojiPickerButton";
import { StampPickerButton } from "./StampPickerButton";

type CommentComposerProps = {
  placeholder: string;
  submitLabel: string;
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  draftStorageKey?: string | null;
  variant?: "default" | "reply";
};

export const CommentComposer = memo(function CommentComposer({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
  draftStorageKey = null,
  variant = "default",
}: CommentComposerProps) {
  const t = useTranslations("comments");
  const [content, setContent] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [stampRegion, setStampRegion] = useState<CommentStampRegion>(COMMENT_STAMP_DEFAULT_REGION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useAutoResizeTextarea(content);
  const contentLength = countCommentCharacters(content);

  useEffect(() => {
    setContent(readCommentDraft(draftStorageKey));
  }, [draftStorageKey]);

  const updateContent = (value: string) => {
    setContent(writeCommentDraft(draftStorageKey, value));
  };

  const handleCancel = () => {
    clearCommentDraft(draftStorageKey);
    setContent("");
    onCancel?.();
  };

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(content.trim());
      clearCommentDraft(draftStorageKey);
      setContent("");
      setEmojiOpen(false);
      setStampOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const insertEmoji = (name: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const { nextValue, nextCursor } = insertCommentShortcode(content, buildEmojiShortcode(name), start, end);

    updateContent(nextValue);
    setEmojiOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const insertStamp = (stamp: CommentStamp) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const { nextValue, nextCursor } = insertCommentShortcode(content, buildStampShortcode(stamp), start, end);

    updateContent(nextValue);
    setStampOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <div
      className={cn(
        variant === "reply"
          ? "bg-transparent sm:rounded-2xl sm:border sm:border-[var(--theme-color-border-subtle)] sm:bg-[var(--theme-color-control-background)] sm:p-3 sm:shadow-xs sm:dark:border-slate-700 sm:dark:bg-slate-900"
          : "rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] p-3 shadow-xs dark:border-slate-700 dark:bg-slate-900",
      )}
    >
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => updateContent(event.target.value)}
        placeholder={placeholder}
        rows={3}
        autoFocus={autoFocus}
        className="min-h-21 max-h-60 w-full resize-y overflow-y-hidden rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 py-2 text-sm leading-6 text-[var(--theme-color-text-default)] outline-hidden transition placeholder:text-[var(--theme-color-text-muted)] selection:bg-[var(--theme-color-selection-strong-background)] selection:text-[var(--theme-color-selection-strong-foreground)] focus:border-[var(--theme-color-focus-ring)] focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:selection:bg-sky-500/40 dark:selection:text-white dark:focus:border-sky-400 dark:focus:bg-slate-900 dark:focus:text-slate-50 dark:focus:ring-sky-500/25"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs", contentLength > COMMENT_LENGTH_WARNING_THRESHOLD ? "text-[var(--theme-color-semantic-warning-foreground)]" : "text-[var(--theme-color-text-muted)]")}>
            {contentLength}/{MAX_COMMENT_LENGTH}
          </span>
          <EmojiPickerButton
            open={emojiOpen}
            onOpenChange={(open) => {
              setEmojiOpen(open);
              if (open) setStampOpen(false);
            }}
            onSelect={insertEmoji}
          />
          <StampPickerButton
            open={stampOpen}
            selectedRegion={stampRegion}
            onOpenChange={(open) => {
              setStampOpen(open);
              if (open) setEmojiOpen(false);
            }}
            onRegionChange={setStampRegion}
            onSelect={insertStamp}
          />
        </div>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 text-xs font-semibold text-[var(--theme-color-text-muted)] transition hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <X size={14} />
              {t("actions.cancel")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--theme-color-action-accent-background)] px-3 text-xs font-semibold text-[var(--theme-color-action-accent-foreground)] shadow-xs transition hover:bg-[var(--theme-color-action-accent-background-hover)] disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:opacity-70 disabled:shadow-none disabled:ring-1 disabled:ring-inset disabled:ring-[var(--theme-color-control-border-disabled)] disabled:hover:bg-[var(--theme-color-control-background-disabled)]"
          >
            <Check size={14} />
            {submitting ? t("actions.sending") : submitLabel}
          </button>
        </div>
      </div>
      {error ? <div className="mt-2 text-xs text-[var(--theme-color-semantic-danger-foreground)] dark:text-[var(--theme-color-semantic-danger-foreground-on-dark)]">{error}</div> : null}
    </div>
  );
});
