"use client";

import { memo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import {
  COMMENT_STAMP_DEFAULT_REGION,
  type CommentStamp,
  type CommentStampRegion,
} from "@/lib/comment-stamps";
import { cn } from "@/lib/utils";
import {
  buildEmojiShortcode,
  buildStampShortcode,
  insertCommentShortcode,
} from "./commentContent";
import { COMMENT_INPUT_MAX_LENGTH } from "./commentTypes";
import { EmojiPickerButton } from "./EmojiPickerButton";
import { StampPickerButton } from "./StampPickerButton";

type CommentComposerProps = {
  placeholder: string;
  submitLabel: string;
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
};

export const CommentComposer = memo(function CommentComposer({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: CommentComposerProps) {
  const [content, setContent] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [stampRegion, setStampRegion] = useState<CommentStampRegion>(COMMENT_STAMP_DEFAULT_REGION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(content.trim());
      setContent("");
      setEmojiOpen(false);
      setStampOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const insertEmoji = (name: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const { nextValue, nextCursor } = insertCommentShortcode(content, buildEmojiShortcode(name), start, end);

    setContent(nextValue);
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

    setContent(nextValue);
    setStampOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <div className="rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] p-3 shadow-xs dark:border-slate-700 dark:bg-slate-900">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={COMMENT_INPUT_MAX_LENGTH}
        autoFocus={autoFocus}
        className="min-h-21 w-full resize-y rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 py-2 text-sm leading-6 text-[var(--theme-color-text-default)] outline-hidden transition placeholder:text-[var(--theme-color-text-muted)] selection:bg-[var(--theme-color-selection-strong-background)] selection:text-[var(--theme-color-selection-strong-foreground)] focus:border-[var(--theme-color-focus-ring)] focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:selection:bg-sky-500/40 dark:selection:text-white dark:focus:border-sky-400 dark:focus:bg-slate-900 dark:focus:text-slate-50 dark:focus:ring-sky-500/25"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs", content.length > 460 ? "text-[var(--theme-color-semantic-warning-foreground)]" : "text-[var(--theme-color-text-muted)]")}>
            {content.length}/500
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
              onClick={onCancel}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 text-xs font-semibold text-[var(--theme-color-text-muted)] transition hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <X size={14} />
              取消
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--theme-color-action-accent-background)] px-3 text-xs font-semibold text-[var(--theme-color-action-accent-foreground)] shadow-xs transition hover:bg-[var(--theme-color-action-accent-background-hover)] disabled:cursor-not-allowed disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:opacity-70 disabled:shadow-none disabled:ring-1 disabled:ring-inset disabled:ring-[var(--theme-color-control-border-disabled)] disabled:hover:bg-[var(--theme-color-control-background-disabled)]"
          >
            <Check size={14} />
            {submitting ? "发送中" : submitLabel}
          </button>
        </div>
      </div>
      {error ? <div className="mt-2 text-xs text-[var(--theme-color-semantic-danger-foreground)] dark:text-[var(--theme-color-semantic-danger-foreground-on-dark)]">{error}</div> : null}
    </div>
  );
});
