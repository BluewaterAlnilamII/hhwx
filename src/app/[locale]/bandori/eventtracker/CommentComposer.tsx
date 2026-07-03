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
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={COMMENT_INPUT_MAX_LENGTH}
        autoFocus={autoFocus}
        className="min-h-[5.25rem] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 selection:bg-sky-200 selection:text-slate-900 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:selection:bg-sky-500/40 dark:selection:text-white dark:focus:border-sky-400 dark:focus:bg-slate-900 dark:focus:text-slate-50 dark:focus:ring-sky-500/25"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs", content.length > 460 ? "text-amber-600" : "text-slate-400")}>
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
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <X size={14} />
              取消
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Check size={14} />
            {submitting ? "发送中" : submitLabel}
          </button>
        </div>
      </div>
      {error ? <div className="mt-2 text-xs text-red-500">{error}</div> : null}
    </div>
  );
});
