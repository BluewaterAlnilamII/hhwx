"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Check, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Edit3, Heart, Link2, MessageSquare, MoreHorizontal, Reply, Smile, Sticker, Trash2, Volume2, X } from "lucide-react";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import { type AccountAvatarCardTrainType } from "@/lib/account-avatar-defaults";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { COMMENT_EMOJI_NAMES, getCommentEmojiSrc } from "@/lib/comment-emojis";
import {
  COMMENT_STAMP_DEFAULT_REGION,
  COMMENT_STAMP_REGION_LABELS,
  COMMENT_STAMP_REGIONS,
  getCommentStampsForRegion,
  isCommentStampRegion,
  resolveCommentStamp,
  type CommentStamp,
  type CommentStampRegion,
} from "@/lib/comment-stamps";
import { getSafeSession } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/store/useGameStore";

type CommentAvatar = {
  cardId: number;
  trainType: AccountAvatarCardTrainType;
  resourceSetName: string | null;
  assetRegion: BandoriAssetRegion;
  displayName: string | null;
};

type CommentNode = {
  id: string;
  parentId: string | null;
  rootId: string | null;
  userId: string;
  username: string | null;
  avatar: CommentAvatar;
  content: string | null;
  depth: number;
  replyCount: number;
  likeCount: number;
  likedByViewer: boolean;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
  replyToCommentId: string | null;
  replyToUsername: string | null;
  previewReplies: CommentNode[];
};

type CommentListResponse = {
  comments: CommentNode[];
  nextCursor: string | null;
  hasMore: boolean;
  page?: number;
  totalPages?: number;
  totalCount?: number;
  totalCommentCount?: number;
};

type CommentContextResponse = {
  root: CommentNode;
  ancestors: CommentNode[];
  comment: CommentNode;
  rootPage: number;
};

type CommentReactionState = {
  commentId: string;
  likeCount: number;
  likedByViewer: boolean;
};

const COMMENT_INPUT_MAX_LENGTH = 500;
const COMMENT_ROOT_PAGE_SIZE = 10;
const COMMENT_CONTENT_TOKEN_PATTERN = /:stamp-([a-z]{2})-(\d+):|:([A-Za-z0-9_+-]+):/g;

let activeCommentStampAudio: HTMLAudioElement | null = null;
const preloadedCommentStampAudio = new Map<string, HTMLAudioElement>();

function getErrorMessage(payload: unknown, fallback: string): string {
  return getApiErrorMessage(payload) ?? fallback;
}

function formatCommentTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function prepareCommentStampAudio(voiceUrl: string, audio: HTMLAudioElement): HTMLAudioElement {
  audio.preload = "auto";
  audio.onended = () => {
    if (activeCommentStampAudio === audio) {
      activeCommentStampAudio = null;
    }
  };
  preloadedCommentStampAudio.set(voiceUrl, audio);
  return audio;
}

function getCommentStampAudio(voiceUrl: string): HTMLAudioElement {
  const cachedAudio = preloadedCommentStampAudio.get(voiceUrl);
  if (cachedAudio) {
    return cachedAudio;
  }

  const audio = prepareCommentStampAudio(voiceUrl, new Audio(voiceUrl));
  audio.load();
  return audio;
}

function playCommentStampVoice(voiceUrl: string): void {
  const audio = getCommentStampAudio(voiceUrl);
  activeCommentStampAudio?.pause();
  if (activeCommentStampAudio) {
    activeCommentStampAudio.currentTime = 0;
  }

  audio.currentTime = 0;
  activeCommentStampAudio = audio;
  void audio.play().catch(() => {
    if (activeCommentStampAudio === audio) {
      activeCommentStampAudio = null;
    }
  });
}

function CommentStampVoicePreload({ enabled, voiceUrl }: { enabled: boolean; voiceUrl: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!enabled || !voiceUrl || !audio) return;

    prepareCommentStampAudio(voiceUrl, audio).load();
  }, [enabled, voiceUrl]);

  if (!enabled || !voiceUrl) return null;

  return (
    <audio
      ref={audioRef}
      src={voiceUrl}
      preload="auto"
      className="hidden"
      aria-hidden="true"
      data-comment-stamp-voice-preload={voiceUrl}
    />
  );
}

function CommentStampView({ stamp, shortcode }: { stamp: CommentStamp; shortcode: string }) {
  const voiceUrl = stamp.voiceUrl;
  const [shouldPreloadVoice, setShouldPreloadVoice] = useState(false);

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={stamp.imageUrl}
      alt={shortcode}
      title={shortcode}
      loading="lazy"
      decoding="async"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={voiceUrl ? () => setShouldPreloadVoice(true) : undefined}
      className="h-full max-h-16 w-full max-w-24 object-contain"
    />
  );

  const className = "relative mx-0.5 inline-flex h-16 w-24 shrink-0 items-center justify-center align-[-1.35em]";
  if (!voiceUrl) {
    return <span className={className}>{image}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => playCommentStampVoice(voiceUrl)}
      className={cn(className, "rounded-lg transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200 dark:hover:bg-rose-500/10 dark:focus:ring-rose-500/30")}
      aria-label={`Play ${shortcode}`}
      title={`Play ${shortcode}`}
    >
      {image}
      <CommentStampVoicePreload enabled={shouldPreloadVoice} voiceUrl={voiceUrl} />
      <span className="absolute bottom-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
        <Volume2 size={12} aria-hidden="true" />
      </span>
    </button>
  );
}

function renderCommentContent(content: string) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  COMMENT_CONTENT_TOKEN_PATTERN.lastIndex = 0;

  while ((match = COMMENT_CONTENT_TOKEN_PATTERN.exec(content)) !== null) {
    const [raw, stampRegion, stampId, emojiName] = match;
    let node: ReactNode | null = null;

    if (stampRegion && stampId) {
      if (isCommentStampRegion(stampRegion)) {
        const id = Number.parseInt(stampId, 10);
        const stamp = Number.isSafeInteger(id) ? resolveCommentStamp(stampRegion, id) : null;
        node = stamp ? <CommentStampView key={`${raw}-${match.index}`} stamp={stamp} shortcode={raw} /> : null;
      }
    } else if (emojiName) {
      const src = getCommentEmojiSrc(emojiName);
      node = src ? (
        <Image
          key={`${emojiName}-${match.index}`}
          src={src}
          alt={raw}
          title={raw}
          width={32}
          height={32}
          loading="lazy"
          unoptimized
          style={{ width: "auto", height: "auto" }}
          className="mx-0.5 inline-block h-auto max-h-6 w-auto max-w-9 object-contain align-[-0.25em]"
        />
      ) : null;
    }

    if (!node) continue;

    if (match.index > cursor) {
      nodes.push(content.slice(cursor, match.index));
    }

    nodes.push(node);
    cursor = match.index + raw.length;
  }

  if (cursor < content.length) {
    nodes.push(content.slice(cursor));
  }

  return nodes.length > 0 ? nodes : content;
}

function insertCommentShortcode(
  value: string,
  shortcode: string,
  start: number,
  end: number,
): { nextValue: string; nextCursor: number } {
  const prefix = start > 0 && !/\s/.test(value[start - 1] ?? "") ? " " : "";
  const suffix = !/\s/.test(value[end] ?? "") ? " " : "";
  const nextValue = `${value.slice(0, start)}${prefix}${shortcode}${suffix}${value.slice(end)}`.slice(
    0,
    COMMENT_INPUT_MAX_LENGTH,
  );
  const nextCursor = Math.min(start + prefix.length + shortcode.length + suffix.length, nextValue.length);

  return { nextValue, nextCursor };
}

function buildEmojiShortcode(name: string): string {
  return `:${name}:`;
}

function buildStampShortcode(stamp: CommentStamp): string {
  return `:stamp-${stamp.region}-${stamp.id}:`;
}

type EmojiPickerButtonProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (name: string) => void;
};

function EmojiPickerButton({ open, onOpenChange, onSelect }: EmojiPickerButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const updatePopoverPosition = useCallback(() => {
    if (!open || !buttonRef.current || !containerRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const horizontalPadding = 16;
    const width = Math.min(384, Math.max(0, viewportWidth - horizontalPadding * 2));
    const viewportLeft = Math.min(
      Math.max(horizontalPadding, rect.left + rect.width / 2 - width / 2),
      viewportWidth - width - horizontalPadding,
    );

    setPopoverStyle({
      width,
      left: viewportLeft - containerRect.left,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onOpenChange, open]);

  useLayoutEffect(() => {
    if (!open) return;

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
    };
  }, [open, updatePopoverPosition]);

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full border text-slate-500 transition hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-500/10 dark:hover:text-sky-300",
          open
            ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-sky-300"
            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
        )}
        aria-expanded={open}
        aria-label="选择表情"
        title="选择表情"
      >
        <Smile size={15} />
      </button>
      {open ? (
        <div
          style={popoverStyle}
          className="absolute bottom-10 z-20 overflow-x-hidden rounded-2xl border border-sky-100 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="grid max-h-64 grid-cols-[repeat(9,minmax(0,1fr))] gap-1 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-color:#94a3b8_#e5e7eb] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-200">
            {COMMENT_EMOJI_NAMES.map((name) => {
              const src = getCommentEmojiSrc(name);
              if (!src) return null;

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelect(name)}
                  className="flex aspect-square w-full min-w-0 items-center justify-center rounded-lg transition hover:bg-sky-50 focus:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:hover:bg-sky-500/10 dark:focus:bg-sky-500/10 dark:focus:ring-sky-500/30"
                  aria-label={`:${name}:`}
                  title={`:${name}:`}
                >
                  <Image src={src} alt={`:${name}:`} width={32} height={32} unoptimized style={{ width: "auto", height: "auto" }} className="h-full max-h-8 w-full max-w-8 object-contain" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type StampPickerButtonProps = {
  open: boolean;
  selectedRegion: CommentStampRegion;
  onOpenChange: (open: boolean) => void;
  onRegionChange: (region: CommentStampRegion) => void;
  onSelect: (stamp: CommentStamp) => void;
};

function StampPickerOption({ stamp, onSelect }: { stamp: CommentStamp; onSelect: (stamp: CommentStamp) => void }) {
  const shortcode = buildStampShortcode(stamp);
  const voiceUrl = stamp.voiceUrl;

  return (
    <button
      type="button"
      onClick={() => onSelect(stamp)}
      className="relative flex h-20 w-full min-w-0 items-center justify-center rounded-lg p-1 transition hover:bg-rose-50 focus:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200 dark:hover:bg-rose-500/10 dark:focus:bg-rose-500/10 dark:focus:ring-rose-500/30"
      aria-label={shortcode}
      title={shortcode}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={stamp.imageUrl}
        alt={shortcode}
        loading="lazy"
        decoding="async"
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full max-h-[4.5rem] w-full object-contain"
      />
      {voiceUrl ? (
        <span className="absolute bottom-1 right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
          <Volume2 size={10} aria-hidden="true" />
        </span>
      ) : null}
    </button>
  );
}

function StampPickerButton({ open, selectedRegion, onOpenChange, onRegionChange, onSelect }: StampPickerButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const stamps = getCommentStampsForRegion(selectedRegion);

  const updatePopoverPosition = useCallback(() => {
    if (!open || !buttonRef.current || !containerRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const horizontalPadding = 16;
    const width = Math.min(456, Math.max(0, viewportWidth - horizontalPadding * 2));
    const viewportLeft = Math.min(
      Math.max(horizontalPadding, rect.left + rect.width / 2 - width / 2),
      viewportWidth - width - horizontalPadding,
    );

    setPopoverStyle({
      width,
      left: viewportLeft - containerRect.left,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onOpenChange, open]);

  useLayoutEffect(() => {
    if (!open) return;

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
    };
  }, [open, updatePopoverPosition]);

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full border text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10 dark:hover:text-rose-300",
          open
            ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-300"
            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
        )}
        aria-expanded={open}
        aria-label="Select stamp"
        title="Select stamp"
      >
        <Sticker size={15} />
      </button>
      {open ? (
        <div
          style={popoverStyle}
          className="absolute bottom-10 z-20 overflow-hidden rounded-2xl border border-rose-100 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-2 grid grid-cols-4 gap-1">
            {COMMENT_STAMP_REGIONS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => onRegionChange(region)}
                className={cn(
                  "h-7 rounded-full text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-rose-200 dark:focus:ring-rose-500/30",
                  selectedRegion === region
                    ? "bg-rose-500 text-white shadow-sm"
                    : "bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-200",
                )}
              >
                {COMMENT_STAMP_REGION_LABELS[region]}
              </button>
            ))}
          </div>
          <div className="grid max-h-80 grid-cols-[repeat(4,minmax(0,1fr))] gap-1 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-color:#fb7185_#e5e7eb] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-rose-400 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-200">
            {stamps.map((stamp) => (
              <StampPickerOption key={`${stamp.region}-${stamp.id}`} stamp={stamp} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildContextThread(context: CommentContextResponse): CommentNode {
  const root: CommentNode = { ...context.root, previewReplies: [] };
  const repliesById = new Map<string, CommentNode>();

  for (const item of [...context.ancestors, context.comment]) {
    if (item.id !== root.id) {
      repliesById.set(item.id, { ...item, previewReplies: [] });
    }
  }

  root.previewReplies = [...repliesById.values()].sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id);
  });

  return root;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  const data = parseApiSuccessData<T>(payload);
  if (!response.ok || data === null) {
    throw new Error(getErrorMessage(payload, `请求失败（HTTP ${response.status}）`));
  }

  return data;
}

async function authHeaders(): Promise<HeadersInit> {
  const session = await getSafeSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function replaceComment(nodes: CommentNode[], updated: CommentNode): CommentNode[] {
  return nodes.map((node) => {
    if (node.id === updated.id) {
      return { ...updated, previewReplies: node.previewReplies };
    }

    return { ...node, previewReplies: replaceComment(node.previewReplies, updated) };
  });
}

function findComment(nodes: CommentNode[], commentId: string): CommentNode | null {
  for (const node of nodes) {
    if (node.id === commentId) {
      return node;
    }

    const nested = findComment(node.previewReplies, commentId);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function appendUniqueComment(nodes: CommentNode[], next: CommentNode): CommentNode[] {
  if (nodes.some((node) => node.id === next.id)) {
    return nodes;
  }

  return [...nodes, next];
}

function mergePreviewReplies(current: CommentNode[], next: CommentNode[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();

  for (const item of current) {
    byId.set(item.id, item);
  }

  for (const item of next) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id);
  });
}

function updateCommentReaction(nodes: CommentNode[], reaction: CommentReactionState): CommentNode[] {
  return nodes.map((node) => {
    if (node.id === reaction.commentId) {
      return {
        ...node,
        likeCount: reaction.likeCount,
        likedByViewer: reaction.likedByViewer,
      };
    }

    return { ...node, previewReplies: updateCommentReaction(node.previewReplies, reaction) };
  });
}

function findThreadRootId(nodes: CommentNode[], comment: CommentNode): string | null {
  if (!comment.parentId) {
    return comment.id;
  }

  if (comment.rootId) {
    return comment.rootId;
  }

  return findComment(nodes, comment.parentId)?.rootId ?? comment.parentId;
}

function scrollToRenderedComment(commentId: string): boolean {
  const element = document.getElementById(`comment-${commentId}`);
  if (!element) {
    return false;
  }

  element.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

function bumpThreadReplyCount(nodes: CommentNode[], rootId: string, child: CommentNode): CommentNode[] {
  return nodes.map((node) => {
    if (node.id === rootId) {
      const hasPreview = node.previewReplies.some((reply) => reply.id === child.id);
      return {
        ...node,
        replyCount: node.replyCount + 1,
        previewReplies: node.replyCount === 0 && !hasPreview ? [child] : node.previewReplies,
      };
    }

    return node;
  });
}

type ComposerProps = {
  placeholder: string;
  submitLabel: string;
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
};

function CommentComposer({ placeholder, submitLabel, onSubmit, onCancel, autoFocus = false }: ComposerProps) {
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
}

type CommentItemProps = {
  comment: CommentNode;
  eventId: number;
  highlightedId: string | null;
  replies: Record<string, CommentListResponse>;
  loadingReplies: Record<string, boolean>;
  canReact: boolean;
  isReply?: boolean;
  rootCommentId?: string | null;
  onCreateReply: (parentId: string, content: string) => Promise<void>;
  onToggleLike: (commentId: string, likedByViewer: boolean) => Promise<void>;
  onUpdate: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onLoadReplies: (commentId: string, cursor?: string | null) => Promise<void>;
  onLocateComment: (commentId: string) => Promise<void>;
};

function CommentItem({
  comment,
  eventId,
  highlightedId,
  replies,
  loadingReplies,
  canReact,
  isReply = false,
  rootCommentId = null,
  onCreateReply,
  onToggleLike,
  onUpdate,
  onDelete,
  onLoadReplies,
  onLocateComment,
}: CommentItemProps) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment.content ?? "");
  const [editEmojiOpen, setEditEmojiOpen] = useState(false);
  const [editStampOpen, setEditStampOpen] = useState(false);
  const [editStampRegion, setEditStampRegion] = useState<CommentStampRegion>(COMMENT_STAMP_DEFAULT_REGION);
  const [liking, setLiking] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const deleteConfirmRef = useRef<HTMLSpanElement>(null);
  const threadRootId = rootCommentId ?? comment.id;
  const loadedReplies = replies[threadRootId];
  const visibleReplies = isReply ? [] : loadedReplies?.comments ?? comment.previewReplies;
  const hiddenReplyCount = isReply ? 0 : Math.max(0, comment.replyCount - visibleReplies.length);
  const isHighlighted = highlightedId === comment.id;
  const isDeleted = Boolean(comment.deletedAt);

  useEffect(() => {
    setDeleteConfirming(false);
    setDeleting(false);
  }, [comment.id, isDeleted]);

  useEffect(() => {
    if (!deleteConfirming || deleting) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (deleteConfirmRef.current?.contains(event.target as Node)) {
        return;
      }

      setDeleteConfirming(false);
      setActionError("");
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [deleteConfirming, deleting]);

  const permalink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("event", String(eventId));
    url.searchParams.set("comment", comment.id);
    return url.toString();
  }, [comment.id, eventId]);
  const replyToPermalink = useMemo(() => {
    if (typeof window === "undefined" || !comment.replyToCommentId) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("event", String(eventId));
    url.searchParams.set("comment", comment.replyToCommentId);
    return url.toString();
  }, [comment.replyToCommentId, eventId]);

  const handleCopyLink = async () => {
    if (!permalink) return;
    await navigator.clipboard?.writeText(permalink).catch(() => undefined);
    window.history.replaceState(null, "", permalink);
  };

  const handleReplyToClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!comment.replyToCommentId) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    void onLocateComment(comment.replyToCommentId);
  };

  const handleEdit = async () => {
    setDeleteConfirming(false);
    setActionError("");
    try {
      await onUpdate(comment.id, editValue);
      setEditing(false);
      setEditEmojiOpen(false);
      setEditStampOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "更新失败");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirming) {
      setActionError("");
      setDeleteConfirming(true);
      return;
    }

    if (deleting) {
      return;
    }

    setActionError("");
    setDeleting(true);
    try {
      await onDelete(comment.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleLike = async () => {
    if (liking || isDeleted) return;
    setActionError("");
    if (!canReact) {
      setActionError("登录并完成邮箱验证后可以点赞");
      return;
    }

    setLiking(true);
    try {
      await onToggleLike(comment.id, comment.likedByViewer);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "点赞失败");
    } finally {
      setLiking(false);
    }
  };

  const insertEditEmoji = (name: string) => {
    const textarea = editTextareaRef.current;
    const start = textarea?.selectionStart ?? editValue.length;
    const end = textarea?.selectionEnd ?? editValue.length;
    const { nextValue, nextCursor } = insertCommentShortcode(editValue, buildEmojiShortcode(name), start, end);

    setEditValue(nextValue);
    setEditEmojiOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const insertEditStamp = (stamp: CommentStamp) => {
    const textarea = editTextareaRef.current;
    const start = textarea?.selectionStart ?? editValue.length;
    const end = textarea?.selectionEnd ?? editValue.length;
    const { nextValue, nextCursor } = insertCommentShortcode(editValue, buildStampShortcode(stamp), start, end);

    setEditValue(nextValue);
    setEditStampOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <article
      id={`comment-${comment.id}`}
      className={cn(
        "relative transition",
        isReply
          ? "rounded-xl bg-transparent py-1"
          : "rounded-2xl border bg-white p-3 shadow-sm dark:bg-slate-900 sm:p-4",
        isHighlighted && isReply
          ? "bg-sky-50/80 ring-2 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/25"
          : null,
        !isReply && (isHighlighted
          ? "border-sky-300 ring-4 ring-sky-100 dark:border-sky-500 dark:ring-sky-500/20"
          : "border-slate-200 dark:border-slate-700"),
      )}
    >
      <div className={cn("flex items-start", isReply ? "gap-2" : "gap-3")}>
        <AccountCardAvatar
          username={comment.username}
          cardId={comment.avatar.cardId}
          trainType={comment.avatar.trainType}
          resourceSetName={comment.avatar.resourceSetName}
          assetRegion={comment.avatar.assetRegion}
          displayName={comment.avatar.displayName}
          size="comment"
          className="ring-1 ring-sky-200 dark:ring-slate-700"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {comment.username ?? "匿名用户"}
            </span>
            <span className="text-xs text-slate-400">{formatCommentTime(comment.createdAt)}</span>
            {comment.replyToUsername ? (
              comment.replyToCommentId && replyToPermalink ? (
                <a
                  href={replyToPermalink}
                  onClick={handleReplyToClick}
                  className="rounded-full text-xs font-medium text-sky-600 underline-offset-2 hover:text-sky-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:text-sky-300 dark:hover:text-sky-200"
                >
                  回复 @{comment.replyToUsername}
                </a>
              ) : (
                <span className="text-xs font-medium text-sky-600 dark:text-sky-300">
                  回复 @{comment.replyToUsername}
                </span>
              )
            ) : null}
            {comment.editedAt && !isDeleted ? <span className="text-xs text-slate-400">（已编辑）</span> : null}
          </div>

          {editing ? (
            <div className="mt-2">
              <textarea
                ref={editTextareaRef}
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                maxLength={COMMENT_INPUT_MAX_LENGTH}
                className="min-h-[5rem] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 selection:bg-sky-200 selection:text-slate-900 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:selection:bg-sky-500/40 dark:selection:text-white dark:focus:border-sky-400 dark:focus:bg-slate-900 dark:focus:text-slate-50 dark:focus:ring-sky-500/25"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs", editValue.length > 460 ? "text-amber-600" : "text-slate-400")}>
                    {editValue.length}/500
                  </span>
                  <EmojiPickerButton
                    open={editEmojiOpen}
                    onOpenChange={(open) => {
                      setEditEmojiOpen(open);
                      if (open) setEditStampOpen(false);
                    }}
                    onSelect={insertEditEmoji}
                  />
                  <StampPickerButton
                    open={editStampOpen}
                    selectedRegion={editStampRegion}
                    onOpenChange={(open) => {
                      setEditStampOpen(open);
                      if (open) setEditEmojiOpen(false);
                    }}
                    onRegionChange={setEditStampRegion}
                    onSelect={insertEditStamp}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setEditEmojiOpen(false);
                      setEditStampOpen(false);
                    }}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    取消
                  </button>
                  <button type="button" onClick={handleEdit} className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500">
                    保存
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className={cn("mt-2 whitespace-pre-wrap text-[15px] leading-[26px]", isDeleted ? "text-slate-400" : "text-slate-700 dark:text-slate-200")}>
              {isDeleted ? "（已删除）" : renderCommentContent(comment.content ?? "")}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {!isDeleted ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirming(false);
                  setReplying((value) => !value);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10"
              >
                <Reply size={13} />
                回复
              </button>
            ) : null}
            {!isDeleted ? (
              <button
                type="button"
                onClick={handleToggleLike}
                disabled={liking}
                aria-pressed={comment.likedByViewer}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold transition disabled:opacity-60",
                  comment.likedByViewer
                    ? "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                    : "text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300",
                )}
              >
                <Heart size={13} className={comment.likedByViewer ? "fill-current" : undefined} />
                {comment.likeCount}
              </button>
            ) : null}
            <button type="button" onClick={handleCopyLink} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
              <Link2 size={13} />
              链接
            </button>
            {comment.canEdit ? (
              <button
                type="button"
                onClick={() => {
                  setEditValue(comment.content ?? "");
                  setEditEmojiOpen(false);
                  setEditStampOpen(false);
                  setDeleteConfirming(false);
                  setEditing(true);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Edit3 size={13} />
                编辑
              </button>
            ) : null}
            {comment.canDelete ? (
              deleteConfirming ? (
                <span ref={deleteConfirmRef} className="inline-flex items-center gap-1 rounded-full bg-red-50 p-0.5 dark:bg-red-500/10">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-500/20"
                  >
                    <Check size={13} />
                    {deleting ? "删除中" : "确认删除"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirming(false);
                      setActionError("");
                    }}
                    disabled={deleting}
                    aria-label="取消删除"
                    className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-slate-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <X size={13} />
                    取消
                  </button>
                </span>
              ) : (
                <button type="button" onClick={handleDelete} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                  <Trash2 size={13} />
                  删除
                </button>
              )
            ) : null}
          </div>

          {actionError ? <div className="mt-2 text-xs text-red-500">{actionError}</div> : null}

          {replying ? (
            <div className="mt-3">
              <CommentComposer
                placeholder="写下你的回复..."
                submitLabel="回复"
                autoFocus
                onCancel={() => setReplying(false)}
                onSubmit={async (content) => {
                  await onCreateReply(comment.id, content);
                  setReplying(false);
                }}
              />
            </div>
          ) : null}

          {visibleReplies.length > 0 ? (
            <div className="mt-3 -ml-[1.375rem] space-y-3 border-l border-slate-200 pl-2 dark:border-slate-700 sm:ml-0 sm:pl-3">
              {visibleReplies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  eventId={eventId}
                  highlightedId={highlightedId}
                  replies={replies}
                  loadingReplies={loadingReplies}
                  canReact={canReact}
                  isReply
                  rootCommentId={comment.id}
                  onCreateReply={onCreateReply}
                  onToggleLike={onToggleLike}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onLoadReplies={onLoadReplies}
                  onLocateComment={onLocateComment}
                />
              ))}
            </div>
          ) : null}

          {comment.replyCount > 0 && hiddenReplyCount > 0 ? (
            <button
              type="button"
              onClick={() => onLoadReplies(threadRootId, loadedReplies?.nextCursor)}
              disabled={loadingReplies[threadRootId]}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-sky-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300"
            >
              <MoreHorizontal size={14} />
              {loadingReplies[threadRootId] ? "加载中" : loadedReplies?.hasMore ? "再展开 10 条回复" : `展开 ${hiddenReplyCount} 条回复`}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function EventComments({ eventId }: { eventId: number | null }) {
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalCommentCount, setTotalCommentCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, CommentListResponse>>({});
  const [loadingReplies, setLoadingReplies] = useState<Record<string, boolean>>({});
  const commentsRef = useRef<CommentNode[]>([]);
  const currentPageRef = useRef(1);
  const { userId, username, emailVerified, authReady } = useGameStore();

  const apiBase = eventId ? `/api/bandori/events/${eventId}/comments` : null;

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const loadRootComments = useCallback(async (page = 1) => {
    if (!apiBase) return;
    setLoading(true);
    setError("");
    try {
      const headers = await authHeaders();
      const suffix = `?page=${encodeURIComponent(String(Math.max(1, Math.trunc(page))))}`;
      const data = await requestJson<CommentListResponse>(`${apiBase}${suffix}`, { headers });
      setComments(data.comments);
      setCurrentPage(data.page ?? page);
      setTotalPages(data.totalPages ?? 1);
      setTotalCount(data.totalCount ?? data.comments.length);
      setTotalCommentCount(data.totalCommentCount ?? data.totalCount ?? data.comments.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "评论加载失败");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const locateLinkedComment = useCallback(async (commentId: string) => {
    if (!apiBase) return;
    setFocusedCommentId(commentId);
    if (scrollToRenderedComment(commentId)) {
      return;
    }

    try {
      const headers = await authHeaders();
      const data = await requestJson<CommentContextResponse>(`${apiBase}/${commentId}`, { headers });
      const contextRoot = buildContextThread(data);
      const rootVisible = commentsRef.current.some((comment) => comment.id === contextRoot.id);
      if (data.rootPage !== currentPageRef.current || !rootVisible) {
        await loadRootComments(data.rootPage);
      }
      if (contextRoot.previewReplies.length > 0) {
        setReplies((current) => {
          const existing = current[contextRoot.id];
          return {
            ...current,
            [contextRoot.id]: {
              comments: mergePreviewReplies(existing?.comments ?? [], contextRoot.previewReplies),
              nextCursor: existing?.nextCursor ?? null,
              hasMore: existing?.hasMore ?? false,
            },
          };
        });
      }
      window.requestAnimationFrame(() => {
        scrollToRenderedComment(commentId);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法定位评论");
    }
  }, [apiBase, loadRootComments]);

  const navigateToComment = useCallback(async (commentId: string) => {
    if (typeof window !== "undefined" && eventId) {
      const url = new URL(window.location.href);
      url.searchParams.set("event", String(eventId));
      url.searchParams.set("comment", commentId);
      window.history.replaceState(null, "", url.toString());
    }
    await locateLinkedComment(commentId);
  }, [eventId, locateLinkedComment]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    setComments([]);
    setReplies({});
    setCurrentPage(1);
    setPageInput("1");
    setTotalPages(1);
    setTotalCount(0);
    setTotalCommentCount(0);
    setFocusedCommentId(null);
    if (!eventId || !apiBase) return;

    const params = new URLSearchParams(window.location.search);
    const commentId = params.get("comment");
    void (async () => {
      if (commentId) {
        await locateLinkedComment(commentId);
        return;
      }
      await loadRootComments(1);
    })();
  }, [apiBase, eventId, loadRootComments, locateLinkedComment]);

  const createComment = async (content: string, parentId?: string | null) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const created = await requestJson<CommentNode>(apiBase, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ content, parentId }),
    });

    if (parentId) {
      const rootId = findThreadRootId(comments, created) ?? parentId;
      setTotalCommentCount((value) => value + 1);
      setComments((current) => bumpThreadReplyCount(current, rootId, created));
      setReplies((current) => {
        const existing = current[rootId];
        if (!existing) {
          const root = findComment(comments, rootId);
          const baseReplies = root?.previewReplies ?? [];
          return {
            ...current,
            [rootId]: {
              comments: appendUniqueComment(baseReplies, created),
              nextCursor: null,
              hasMore: false,
            },
          };
        }

        return {
          ...current,
          [rootId]: { ...existing, comments: appendUniqueComment(existing.comments, created) },
        };
      });
      setFocusedCommentId(created.id);
      window.setTimeout(() => document.getElementById(`comment-${created.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
      return;
    }

    await loadRootComments(Math.max(1, Math.ceil((totalCount + 1) / COMMENT_ROOT_PAGE_SIZE)));
    setFocusedCommentId(created.id);
    window.setTimeout(() => document.getElementById(`comment-${created.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
  };

  const updateCommentContent = async (commentId: string, content: string) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const updated = await requestJson<CommentNode>(`${apiBase}/${commentId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setComments((current) => replaceComment(current, updated));
    setReplies((current) => Object.fromEntries(
      Object.entries(current).map(([parentId, response]) => [
        parentId,
        { ...response, comments: replaceComment(response.comments, updated) },
      ]),
    ));
  };

  const deleteComment = async (commentId: string) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const updated = await requestJson<CommentNode>(`${apiBase}/${commentId}`, {
      method: "DELETE",
      headers,
    });
    setComments((current) => replaceComment(current, updated));
    setReplies((current) => Object.fromEntries(
      Object.entries(current).map(([parentId, response]) => [
        parentId,
        { ...response, comments: replaceComment(response.comments, updated) },
      ]),
    ));
  };

  const toggleCommentLike = async (commentId: string, likedByViewer: boolean) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const reaction = await requestJson<CommentReactionState>(`${apiBase}/${commentId}/like`, {
      method: likedByViewer ? "DELETE" : "PUT",
      headers,
    });

    setComments((current) => updateCommentReaction(current, reaction));
    setReplies((current) => Object.fromEntries(
      Object.entries(current).map(([parentId, response]) => [
        parentId,
        { ...response, comments: updateCommentReaction(response.comments, reaction) },
      ]),
    ));
  };

  const loadReplies = async (commentId: string, cursor?: string | null) => {
    if (!apiBase || loadingReplies[commentId]) return;
    setLoadingReplies((current) => ({ ...current, [commentId]: true }));
    try {
      const headers = await authHeaders();
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const data = await requestJson<CommentListResponse>(`${apiBase}/${commentId}/replies${suffix}`, { headers });
      setReplies((current) => {
        const existing = current[commentId];
        return {
          ...current,
          [commentId]: {
            comments: cursor && existing ? mergePreviewReplies(existing.comments, data.comments) : data.comments,
            nextCursor: data.nextCursor,
            hasMore: data.hasMore,
          },
        };
      });
    } finally {
      setLoadingReplies((current) => ({ ...current, [commentId]: false }));
    }
  };

  const submitPageInput = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    const nextPage = Math.min(totalPages, Math.max(1, parsed));
    setPageInput(String(nextPage));
    if (nextPage !== currentPage) {
      void loadRootComments(nextPage);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-[#fffef4] p-4 shadow-[0_16px_44px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950 sm:p-5">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="inline-flex items-center gap-2 text-xl font-black text-slate-900 dark:text-white">
          <MessageSquare size={20} className="text-sky-600 dark:text-sky-300" />
          活动评论
          <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">（{totalCommentCount}）</span>
        </h2>
      </div>

      <div className="mt-4">
        {!authReady ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            正在读取登录状态...
          </div>
        ) : userId && emailVerified ? (
          <CommentComposer placeholder={`以 ${username ?? "当前账号"} 发表主评论...`} submitLabel="发布评论" onSubmit={(content) => createComment(content, null)} />
        ) : userId ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            完成邮箱验证后可以发表评论和回复。
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            登录后可以参与本期活动讨论。
          </div>
        )}
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{error}</div> : null}

      <div className="mt-5 space-y-3">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            eventId={eventId ?? 0}
            highlightedId={focusedCommentId}
            replies={replies}
            loadingReplies={loadingReplies}
            canReact={Boolean(userId && emailVerified)}
            onCreateReply={(parentId, content) => createComment(content, parentId)}
            onToggleLike={toggleCommentLike}
            onUpdate={updateCommentContent}
            onDelete={deleteComment}
            onLoadReplies={loadReplies}
            onLocateComment={navigateToComment}
          />
        ))}

        {!loading && comments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-900/50">
            还没有评论，来留下本期活动的第一条讨论。
          </div>
        ) : null}
      </div>

      {totalCount > COMMENT_ROOT_PAGE_SIZE ? (
        <div className="mt-5 flex justify-center">
          <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => loadRootComments(1)}
              disabled={loading || currentPage <= 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300 dark:disabled:text-slate-600"
              aria-label="第一页"
              title="第一页"
            >
              <ChevronFirst size={16} />
            </button>
            <button
              type="button"
              onClick={() => loadRootComments(currentPage - 1)}
              disabled={loading || currentPage <= 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300 dark:disabled:text-slate-600"
              aria-label="上一页"
              title="上一页"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex h-8 min-w-28 items-center justify-center rounded-full bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-sky-200 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))}
                onBlur={() => setPageInput(String(currentPage))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitPageInput();
                  }
                }}
                disabled={loading}
                aria-label="跳转到页码"
                title="输入页码后按回车跳转"
                className="h-6 w-10 rounded-md border border-transparent bg-transparent text-center text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-200 focus:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-slate-200 dark:focus:border-slate-600 dark:focus:bg-slate-900"
              />
              <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
              <span className="min-w-8 text-center">{totalPages}</span>
            </div>
            <button
              type="button"
              onClick={() => loadRootComments(currentPage + 1)}
              disabled={loading || currentPage >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300 dark:disabled:text-slate-600"
              aria-label="下一页"
              title="下一页"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => loadRootComments(totalPages)}
              disabled={loading || currentPage >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300 dark:disabled:text-slate-600"
              aria-label="最后一页"
              title="最后一页"
            >
              <ChevronLast size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {loading && comments.length > 0 ? (
        <div className="mt-3 text-center text-xs text-slate-400">加载中</div>
      ) : null}
    </section>
  );
}
