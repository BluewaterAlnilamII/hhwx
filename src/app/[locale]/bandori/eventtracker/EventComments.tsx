"use client";

import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Edit3, Link2, MessageSquare, MoreHorizontal, Reply, Smile, Sticker, Trash2, Volume2, X } from "lucide-react";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import {
  useCommentStampAnimation,
  useCommentStampAsset,
  useCommentStampsForRegion,
} from "@/hooks/useCommentStamps";
import { type AccountAvatarCardTrainType } from "@/lib/account-avatar-defaults";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { type BandoriStampAnimationResponse } from "@/lib/bandori-stamp-assets";
import { playCommentStampVoice } from "@/lib/comment-stamp-audio";
import { COMMENT_EMOJI_NAMES, getCommentEmojiSrc } from "@/lib/comment-emojis";
import {
  COMMENT_STAMP_DEFAULT_REGION,
  COMMENT_STAMP_REGION_LABELS,
  COMMENT_STAMP_REGIONS,
  isCommentStampRegion,
  resolveCommentStamp,
  type CommentStamp,
  type CommentStampRegion,
} from "@/lib/comment-stamps";
import { getSafeSession } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/store/useGameStore";
import {
  readEventTrackerSearchParams,
  readPositiveIntegerSearchParam,
  replaceEventTrackerUrlQuery,
} from "./urlQuery";

type CommentAvatar = {
  cardId: number;
  trainType: AccountAvatarCardTrainType;
  resourceSetName: string | null;
  assetRegion: BandoriAssetRegion;
  displayName: string | null;
};

type CommentReactionParticipant = {
  userId: string;
  username: string | null;
  avatar: CommentAvatar;
  reactedAt: string;
};

type CommentReactionSummary = {
  emojiKey: string;
  count: number;
  reactedByViewer: boolean;
  users: CommentReactionParticipant[];
  remainingUserCount: number;
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
  reactions: CommentReactionSummary[];
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
  reactions: CommentReactionSummary[];
};

type CommentContentTextToken = {
  type: "text";
  value: string;
};

type CommentContentEmojiToken = {
  type: "emoji";
  raw: string;
  name: string;
  src: string;
  index: number;
};

type CommentContentStampToken = {
  type: "stamp";
  raw: string;
  stamp: CommentStamp;
  index: number;
};

type CommentContentToken =
  | CommentContentTextToken
  | CommentContentEmojiToken
  | CommentContentStampToken;

const COMMENT_INPUT_MAX_LENGTH = 500;
const COMMENT_ROOT_PAGE_SIZE = 10;
const COMMENT_CONTENT_TOKEN_PATTERN = /:stamp-([a-z]{2})-(\d+):|:([A-Za-z0-9_+-]+):/g;

const commentStampAtlasImageCache = new Map<string, Promise<HTMLImageElement>>();

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

function loadCommentStampAtlasImage(atlasUrl: string): Promise<HTMLImageElement> {
  const cachedImage = commentStampAtlasImageCache.get(atlasUrl);
  if (cachedImage) {
    return cachedImage;
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load stamp atlas: ${atlasUrl}`));
    image.src = atlasUrl;
  }).catch((error) => {
    commentStampAtlasImageCache.delete(atlasUrl);
    throw error;
  });

  commentStampAtlasImageCache.set(atlasUrl, promise);
  return promise;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function CommentStampAnimationCanvas({
  animation,
  shortcode,
  onError,
  active = true,
  className = "h-full max-h-16 w-full max-w-24 object-contain",
}: {
  animation: BandoriStampAnimationResponse;
  shortcode: string;
  onError: () => void;
  active?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [frameIndex, setFrameIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const frameCount = animation.frames.length;
  const frame = animation.frames[Math.min(frameIndex, Math.max(0, frameCount - 1))];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry?.isIntersecting ?? true),
      { rootMargin: "96px" },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active || prefersReducedMotion || !isVisible || frameCount <= 1) {
      return;
    }

    const intervalMs = 1000 / Math.max(1, animation.frameRate);
    const intervalId = window.setInterval(() => {
      setFrameIndex((currentFrameIndex) => (currentFrameIndex + 1) % frameCount);
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [active, animation.frameRate, frameCount, isVisible, prefersReducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) {
      return;
    }

    let cancelled = false;
    void loadCommentStampAtlasImage(animation.atlasUrl)
      .then((atlasImage) => {
        if (cancelled) {
          return;
        }

        const context = canvas.getContext("2d");
        if (!context) {
          onError();
          return;
        }

        const { x, y, width, height } = frame.cssRect;
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(atlasImage, x, y, width, height, 0, 0, width, height);
      })
      .catch(() => {
        if (!cancelled) {
          onError();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [animation.atlasUrl, frame, onError]);

  if (!frame) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={frame.cssRect.width}
      height={frame.cssRect.height}
      role="img"
      aria-label={shortcode}
      title={shortcode}
      className={className}
    />
  );
}

function CommentStampView({ stamp, shortcode }: { stamp: CommentStamp; shortcode: string }) {
  const [shouldLoadAsset, setShouldLoadAsset] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const { asset } = useCommentStampAsset(stamp.region, stamp.id, shouldLoadAsset);
  const animationSummary = asset?.animation ?? null;
  const { animation } = useCommentStampAnimation(
    stamp.region,
    stamp.id,
    Boolean(animationSummary && !animationFailed),
  );
  const voiceUrl = asset?.voiceUrl ?? null;
  const imageUrl = asset?.imageUrl ?? stamp.imageUrl;

  const handleAnimationError = useCallback(() => {
    setAnimationFailed(true);
  }, []);

  if (imageFailed) {
    return <span>{shortcode}</span>;
  }

  const image = (
    animation && !animationFailed ? (
      <CommentStampAnimationCanvas
        animation={animation}
        shortcode={shortcode}
        onError={handleAnimationError}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={shortcode}
        title={shortcode}
        loading="lazy"
        decoding="async"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setShouldLoadAsset(true)}
        onError={() => setImageFailed(true)}
        className="h-full max-h-16 w-full max-w-24 object-contain"
      />
    )
  );

  const className = "relative mx-0.5 inline-flex h-16 w-24 shrink-0 items-center justify-center align-[-1.35em]";
  if (!voiceUrl) {
    return <span className={className}>{image}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => {
        void playCommentStampVoice(voiceUrl);
      }}
      className={cn(className, "rounded-lg transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200 dark:hover:bg-rose-500/10 dark:focus:ring-rose-500/30")}
      aria-label={`Play ${shortcode}`}
      title={`Play ${shortcode}`}
    >
      {image}
      <span className="absolute bottom-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
        <Volume2 size={12} aria-hidden="true" />
      </span>
    </button>
  );
}

function parseCommentContent(content: string): CommentContentToken[] {
  const tokens: CommentContentToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  COMMENT_CONTENT_TOKEN_PATTERN.lastIndex = 0;

  while ((match = COMMENT_CONTENT_TOKEN_PATTERN.exec(content)) !== null) {
    const [raw, stampRegion, stampId, emojiName] = match;
    let token: CommentContentToken | null = null;

    if (stampRegion && stampId) {
      if (isCommentStampRegion(stampRegion)) {
        const id = Number.parseInt(stampId, 10);
        const stamp = Number.isSafeInteger(id) ? resolveCommentStamp(stampRegion, id) : null;
        token = stamp ? { type: "stamp", raw, stamp, index: match.index } : null;
      }
    } else if (emojiName) {
      const src = getCommentEmojiSrc(emojiName);
      token = src ? { type: "emoji", raw, name: emojiName, src, index: match.index } : null;
    }

    if (!token) continue;

    if (match.index > cursor) {
      tokens.push({ type: "text", value: content.slice(cursor, match.index) });
    }

    tokens.push(token);
    cursor = match.index + raw.length;
  }

  if (cursor < content.length) {
    tokens.push({ type: "text", value: content.slice(cursor) });
  }

  return tokens;
}

function isJumboEmojiContent(tokens: readonly CommentContentToken[]): boolean {
  let hasEmoji = false;

  for (const token of tokens) {
    if (token.type === "emoji") {
      hasEmoji = true;
      continue;
    }

    if (token.type === "stamp") {
      continue;
    }

    if (/\S/u.test(token.value)) {
      return false;
    }
  }

  return hasEmoji;
}

function renderCommentEmojiToken(token: CommentContentEmojiToken, variant: "inline" | "jumbo") {
  const isJumbo = variant === "jumbo";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={`${token.name}-${token.index}`}
      src={token.src}
      alt={token.raw}
      title={token.raw}
      width={isJumbo ? 64 : 32}
      height={isJumbo ? 64 : 32}
      loading="lazy"
      decoding="async"
      className={cn(
        "inline-block h-auto w-auto object-contain",
        isJumbo ? "max-h-12 max-w-12 align-middle" : "mx-0.5 max-h-6 max-w-6 align-[-0.25em]",
      )}
    />
  );
}

function renderCommentStampToken(token: CommentContentStampToken) {
  return <CommentStampView key={`${token.raw}-${token.index}`} stamp={token.stamp} shortcode={token.raw} />;
}

function renderCommentContentTokens(tokens: readonly CommentContentToken[]) {
  return tokens.map((token) => {
    if (token.type === "text") return token.value;

    if (token.type === "stamp") {
      return renderCommentStampToken(token);
    }

    return renderCommentEmojiToken(token, "inline");
  });
}

function renderJumboEmojiRows(tokens: readonly CommentContentToken[]) {
  const rows: ReactNode[][] = [[]];

  for (const token of tokens) {
    if (token.type === "emoji") {
      rows[rows.length - 1].push(renderCommentEmojiToken(token, "jumbo"));
    } else if (token.type === "stamp") {
      rows[rows.length - 1].push(renderCommentStampToken(token));
    } else if (token.type === "text") {
      const lineBreaks = token.value.match(/\r\n|\r|\n/g)?.length ?? 0;
      for (let index = 0; index < lineBreaks; index += 1) {
        rows.push([]);
      }
    }
  }

  return rows
    .filter((row) => row.length > 0)
    .map((row, index) => (
      <span key={`emoji-row-${index}`} className="flex flex-wrap items-center gap-1.5">
        {row}
      </span>
    ));
}

function CommentContent({ content, isDeleted }: { content: string; isDeleted: boolean }) {
  const contentClassName = isDeleted ? "text-slate-400" : "text-slate-700 dark:text-slate-200";

  if (isDeleted) {
    return (
      <p className={cn("mt-2 whitespace-pre-wrap break-words text-[15px] leading-[26px] [overflow-wrap:anywhere]", contentClassName)}>
        （已删除）
      </p>
    );
  }

  const tokens = parseCommentContent(content);

  if (isJumboEmojiContent(tokens)) {
    return (
      <div className={cn("mt-2 flex flex-col items-start gap-1 [overflow-wrap:anywhere]", contentClassName)}>
        {renderJumboEmojiRows(tokens)}
      </div>
    );
  }

  return (
    <p className={cn("mt-2 whitespace-pre-wrap break-words text-[15px] leading-[26px] [overflow-wrap:anywhere]", contentClassName)}>
      {renderCommentContentTokens(tokens)}
    </p>
  );
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
  compact?: boolean;
  disabled?: boolean;
  label?: string;
};

function EmojiPickerButton({ open, onOpenChange, onSelect, compact = false, disabled = false, label = "选择表情" }: EmojiPickerButtonProps) {
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
        onClick={() => {
          if (!disabled) onOpenChange(!open);
        }}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center rounded-full border text-slate-500 transition hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-sky-500/10 dark:hover:text-sky-300",
          compact ? "h-7 w-7" : "h-8 w-8",
          open
            ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-sky-300"
            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
        )}
        aria-expanded={open}
        aria-label={label}
        title={label}
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`:${name}:`} width={32} height={32} loading="lazy" decoding="async" className="h-full max-h-8 w-full max-w-8 object-contain" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ReactionChipProps = {
  reaction: CommentReactionSummary;
  disabled: boolean;
  onToggle: (emojiKey: string, reactedByViewer: boolean) => Promise<void>;
};

function ReactionEmoji({ emojiKey, size = 20 }: { emojiKey: string; size?: number }) {
  const src = getCommentEmojiSrc(emojiKey);
  if (!src) {
    return <Smile size={Math.min(size, 18)} aria-hidden="true" />;
  }

  return (
    <Image
      src={src}
      alt={`:${emojiKey}:`}
      width={size}
      height={size}
      unoptimized
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function ReactionChip({ reaction, disabled, onToggle }: ReactionChipProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  useEffect(() => {
    if (!tooltipOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setTooltipOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [tooltipOpen]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse") return;
    clearLongPressTimer();
    suppressClickRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      setTooltipOpen(true);
    }, 450);
  };

  const handlePointerEnd = () => {
    clearLongPressTimer();
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    void onToggle(reaction.emojiKey, reaction.reactedByViewer);
  };

  return (
    <span
      ref={containerRef}
      className="relative inline-flex"
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setTooltipOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setTooltipOpen(false);
      }}
      onFocus={() => setTooltipOpen(true)}
      onBlur={() => setTooltipOpen(false)}
    >
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onContextMenu={(event) => {
          if (tooltipOpen) event.preventDefault();
        }}
        disabled={disabled}
        aria-pressed={reaction.reactedByViewer}
        aria-label={`:${reaction.emojiKey}: ${reaction.count}`}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
          reaction.reactedByViewer
            ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-200 dark:hover:bg-sky-500/25"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
        )}
      >
        <ReactionEmoji emojiKey={reaction.emojiKey} size={18} />
        {reaction.count}
      </button>
      {tooltipOpen ? (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-30 mb-0 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-xs text-slate-700 shadow-2xl shadow-slate-900/10 dark:border-slate-200 dark:bg-white dark:text-slate-700"
        >
          <div className="mb-2 flex items-center gap-1.5 font-semibold text-slate-900">
            <ReactionEmoji emojiKey={reaction.emojiKey} size={20} />
            <span>{reaction.count} 个回应</span>
          </div>
          <div className="space-y-1.5">
            {reaction.users.map((user) => (
              <div key={`${reaction.emojiKey}-${user.userId}`} className="flex items-center gap-2">
                <AccountCardAvatar
                  username={user.username}
                  cardId={user.avatar.cardId}
                  trainType={user.avatar.trainType}
                  resourceSetName={user.avatar.resourceSetName}
                  assetRegion={user.avatar.assetRegion}
                  displayName={user.avatar.displayName}
                  size="toolbar"
                  className="ring-1 ring-slate-200"
                />
                <span className="min-w-0 flex-1 truncate text-slate-700">{user.username ?? "匿名用户"}</span>
              </div>
            ))}
          </div>
          {reaction.remainingUserCount > 0 ? (
            <div className="mt-2 border-t border-slate-200 pt-2 text-slate-500">
              …
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
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
  const hasVoice = stamp.hasVoiceAudio || stamp.withVoice;
  const [previewActive, setPreviewActive] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const shouldCheckAsset = previewActive && !stamp.hasAnimation && !animationFailed;
  const { asset } = useCommentStampAsset(stamp.region, stamp.id, shouldCheckAsset);
  const shouldLoadAnimation = previewActive && (stamp.hasAnimation || asset?.hasAnimation === true) && !animationFailed;
  const { animation } = useCommentStampAnimation(stamp.region, stamp.id, shouldLoadAnimation);

  const handleAnimationError = useCallback(() => {
    setAnimationFailed(true);
  }, []);

  return (
    <button
      type="button"
      onClick={() => onSelect(stamp)}
      onPointerEnter={() => setPreviewActive(true)}
      onPointerLeave={() => setPreviewActive(false)}
      onFocus={() => setPreviewActive(true)}
      onBlur={() => setPreviewActive(false)}
      className="relative flex h-20 w-full min-w-0 items-center justify-center rounded-lg p-1 transition hover:bg-rose-50 focus:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200 dark:hover:bg-rose-500/10 dark:focus:bg-rose-500/10 dark:focus:ring-rose-500/30"
      aria-label={shortcode}
      title={shortcode}
    >
      {animation ? (
        <CommentStampAnimationCanvas
          animation={animation}
          shortcode={shortcode}
          active={previewActive}
          onError={handleAnimationError}
          className="h-full max-h-[4.5rem] w-full object-contain"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stamp.imageUrl}
          alt={shortcode}
          loading="lazy"
          decoding="async"
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full max-h-[4.5rem] w-full object-contain"
        />
      )}
      {hasVoice ? (
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
  const { stamps } = useCommentStampsForRegion(selectedRegion, open);

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
        reactions: reaction.reactions,
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

function readCommentPageSearchParam(): number {
  return readPositiveIntegerSearchParam(readEventTrackerSearchParams(), "page") ?? 1;
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
  commentPage: number;
  isReply?: boolean;
  rootCommentId?: string | null;
  onCreateReply: (parentId: string, content: string) => Promise<void>;
  onToggleReaction: (commentId: string, emojiKey: string, reactedByViewer: boolean) => Promise<void>;
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
  commentPage,
  isReply = false,
  rootCommentId = null,
  onCreateReply,
  onToggleReaction,
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
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [reactingEmojiKey, setReactingEmojiKey] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRootId = rootCommentId ?? comment.id;
  const loadedReplies = replies[threadRootId];
  const visibleReplies = isReply ? [] : loadedReplies?.comments ?? comment.previewReplies;
  const hiddenReplyCount = isReply ? 0 : Math.max(0, comment.replyCount - visibleReplies.length);
  const isHighlighted = highlightedId === comment.id;
  const isDeleted = Boolean(comment.deletedAt);

  useEffect(() => {
    setDeleteDialogOpen(false);
    setDeleting(false);
    setReactionPickerOpen(false);
    setReactingEmojiKey(null);
  }, [comment.id, isDeleted]);

  const permalink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("event", String(eventId));
    url.searchParams.set("page", String(commentPage));
    url.searchParams.set("comment", comment.id);
    return url.toString();
  }, [comment.id, commentPage, eventId]);
  const replyToPermalink = useMemo(() => {
    if (typeof window === "undefined" || !comment.replyToCommentId) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("event", String(eventId));
    url.searchParams.set("page", String(commentPage));
    url.searchParams.set("comment", comment.replyToCommentId);
    return url.toString();
  }, [comment.replyToCommentId, commentPage, eventId]);

  const handleCopyLink = async () => {
    if (!permalink) return;
    await navigator.clipboard?.writeText(permalink).catch(() => undefined);
    if (permalink !== window.location.href) {
      window.history.replaceState(null, "", permalink);
    }
  };

  const handleReplyToClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!comment.replyToCommentId) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    void onLocateComment(comment.replyToCommentId);
  };

  const handleEdit = async () => {
    setDeleteDialogOpen(false);
    setReactionPickerOpen(false);
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
    if (deleting) {
      return;
    }

    setActionError("");
    setDeleting(true);
    try {
      await onDelete(comment.id);
      setDeleteDialogOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleReaction = async (emojiKey: string, reactedByViewer: boolean) => {
    if (reactingEmojiKey || isDeleted) return;
    setActionError("");
    if (!canReact) {
      setActionError("登录并完成邮箱验证后可以回应");
      return;
    }

    setReactingEmojiKey(emojiKey);
    try {
      await onToggleReaction(comment.id, emojiKey, reactedByViewer);
      setReactionPickerOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "评论回应失败");
    } finally {
      setReactingEmojiKey(null);
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
            <CommentContent content={comment.content ?? ""} isDeleted={isDeleted} />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {!isDeleted ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setReactionPickerOpen(false);
                  setReplying((value) => !value);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10"
              >
                <Reply size={13} />
                回复
              </button>
            ) : null}
            {!isDeleted ? (
              <>
                {(comment.reactions ?? []).map((reaction) => (
                  <ReactionChip
                    key={reaction.emojiKey}
                    reaction={reaction}
                    disabled={Boolean(reactingEmojiKey)}
                    onToggle={handleToggleReaction}
                  />
                ))}
                <EmojiPickerButton
                  compact
                  open={reactionPickerOpen}
                  disabled={Boolean(reactingEmojiKey)}
                  label="添加回应"
                  onOpenChange={setReactionPickerOpen}
                  onSelect={(emojiKey) => {
                    const existingReaction = (comment.reactions ?? []).find((reaction) => reaction.emojiKey === emojiKey);
                    setReactionPickerOpen(false);
                    void handleToggleReaction(emojiKey, Boolean(existingReaction?.reactedByViewer));
                  }}
                />
              </>
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
                  setDeleteDialogOpen(false);
                  setReactionPickerOpen(false);
                  setEditing(true);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Edit3 size={13} />
                编辑
              </button>
            ) : null}
            {comment.canDelete ? (
              <Dialog.Root
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                  if (!deleting) {
                    setDeleteDialogOpen(open);
                    if (!open) setActionError("");
                  }
                }}
              >
                <Dialog.Trigger asChild>
                  <button type="button" className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                    <Trash2 size={13} />
                    删除
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
                  <Dialog.Content className="fixed left-1/2 top-1/2 z-[121] w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[18px] border border-slate-200 bg-white text-slate-900 shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">
                    <Dialog.Title className="px-5 py-5 text-center text-base font-semibold">
                      确认删除评论？
                    </Dialog.Title>
                    <div className="grid grid-cols-2 border-t border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="h-11 border-r border-slate-200 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-red-300 dark:hover:bg-red-500/10"
                      >
                        删除
                      </button>
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          disabled={deleting}
                          className="h-11 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          取消
                        </button>
                      </Dialog.Close>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
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
                  commentPage={commentPage}
                  isReply
                  rootCommentId={comment.id}
                  onCreateReply={onCreateReply}
                  onToggleReaction={onToggleReaction}
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
  const eventGenerationRef = useRef(0);
  const rootLoadSequenceRef = useRef(0);
  const { userId, username, emailVerified, authReady } = useGameStore();

  const apiBase = eventId ? `/api/bandori/events/${eventId}/comments` : null;

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const loadRootComments = useCallback(async (page = 1): Promise<CommentListResponse | null> => {
    if (!apiBase) return null;
    const requestId = rootLoadSequenceRef.current + 1;
    rootLoadSequenceRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const headers = await authHeaders();
      const suffix = `?page=${encodeURIComponent(String(Math.max(1, Math.trunc(page))))}`;
      const data = await requestJson<CommentListResponse>(`${apiBase}${suffix}`, { headers });
      if (requestId !== rootLoadSequenceRef.current) {
        return null;
      }

      setComments(data.comments);
      setCurrentPage(data.page ?? page);
      setTotalPages(data.totalPages ?? 1);
      setTotalCount(data.totalCount ?? data.comments.length);
      setTotalCommentCount(data.totalCommentCount ?? data.totalCount ?? data.comments.length);
      return data;
    } catch (err) {
      if (requestId === rootLoadSequenceRef.current) {
        setError(err instanceof Error ? err.message : "评论加载失败");
      }
      return null;
    } finally {
      if (requestId === rootLoadSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [apiBase]);

  const locateLinkedComment = useCallback(async (
    commentId: string,
    options: { expectedPage?: number; silent?: boolean } = {},
  ): Promise<boolean> => {
    if (!apiBase) return false;
    const generation = eventGenerationRef.current;
    setFocusedCommentId(commentId);
    if (scrollToRenderedComment(commentId)) {
      return true;
    }

    try {
      const headers = await authHeaders();
      const data = await requestJson<CommentContextResponse>(`${apiBase}/${commentId}`, { headers });
      if (generation !== eventGenerationRef.current) {
        return false;
      }

      if (options.expectedPage !== undefined && data.rootPage !== options.expectedPage) {
        setFocusedCommentId(null);
        return false;
      }

      const contextRoot = buildContextThread(data);
      const rootVisible = commentsRef.current.some((comment) => comment.id === contextRoot.id);
      if (data.rootPage !== currentPageRef.current || !rootVisible) {
        const pageData = await loadRootComments(data.rootPage);
        if (generation !== eventGenerationRef.current || !pageData) {
          return false;
        }
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
      return true;
    } catch (err) {
      if (generation !== eventGenerationRef.current) {
        return false;
      }

      setFocusedCommentId(null);
      if (options.silent) {
        return false;
      }
      setError(err instanceof Error ? err.message : "无法定位评论");
      return false;
    }
  }, [apiBase, loadRootComments]);

  const navigateToComment = useCallback(async (commentId: string) => {
    const generation = eventGenerationRef.current;
    const located = await locateLinkedComment(commentId, {
      expectedPage: currentPageRef.current,
      silent: true,
    });
    if (generation !== eventGenerationRef.current) {
      return;
    }

    replaceEventTrackerUrlQuery({
      eventId,
      commentPage: currentPageRef.current,
      commentId: located ? commentId : null,
    });
  }, [eventId, locateLinkedComment]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    eventGenerationRef.current += 1;
    rootLoadSequenceRef.current += 1;
    const generation = eventGenerationRef.current;

    setComments([]);
    setReplies({});
    setCurrentPage(1);
    setPageInput("1");
    setTotalPages(1);
    setTotalCount(0);
    setTotalCommentCount(0);
    setLoading(false);
    setError("");
    setFocusedCommentId(null);
    if (!eventId || !apiBase) return;

    const params = readEventTrackerSearchParams();
    const requestedPage = readCommentPageSearchParam();
    const commentId = params.get("comment");
    void (async () => {
      const data = await loadRootComments(requestedPage);
      if (generation !== eventGenerationRef.current || !data) {
        return;
      }

      const loadedPage = data.page ?? requestedPage;
      if (commentId) {
        if (findComment(data.comments, commentId)) {
          setFocusedCommentId(commentId);
          replaceEventTrackerUrlQuery({ eventId, commentPage: loadedPage, commentId });
          window.requestAnimationFrame(() => {
            scrollToRenderedComment(commentId);
          });
          return;
        }

        const located = await locateLinkedComment(commentId, {
          expectedPage: loadedPage,
          silent: true,
        });
        if (generation !== eventGenerationRef.current) {
          return;
        }

        replaceEventTrackerUrlQuery({
          eventId,
          commentPage: loadedPage,
          commentId: located ? commentId : null,
        });
        return;
      }

      replaceEventTrackerUrlQuery({ eventId, commentPage: loadedPage, commentId: null });
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
      replaceEventTrackerUrlQuery({
        eventId,
        commentPage: currentPageRef.current,
        commentId: created.id,
      });
      window.setTimeout(() => document.getElementById(`comment-${created.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
      return;
    }

    const createdPage = 1;
    await loadRootComments(createdPage);
    setFocusedCommentId(created.id);
    replaceEventTrackerUrlQuery({
      eventId,
      commentPage: createdPage,
      commentId: created.id,
    });
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

  const toggleCommentReaction = async (commentId: string, emojiKey: string, reactedByViewer: boolean) => {
    if (!apiBase) return;
    const headers = await authHeaders();
    const reaction = await requestJson<CommentReactionState>(`${apiBase}/${commentId}/reactions/${encodeURIComponent(emojiKey)}`, {
      method: reactedByViewer ? "DELETE" : "PUT",
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

  const goToCommentPage = useCallback((page: number) => {
    const nextPage = Math.min(totalPages, Math.max(1, Math.trunc(page)));
    setPageInput(String(nextPage));
    setFocusedCommentId(null);
    replaceEventTrackerUrlQuery({
      eventId,
      commentPage: nextPage,
      commentId: null,
    });
    void loadRootComments(nextPage);
  }, [eventId, loadRootComments, totalPages]);

  const submitPageInput = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    const nextPage = Math.min(totalPages, Math.max(1, parsed));
    setPageInput(String(nextPage));
    if (nextPage !== currentPage) {
      goToCommentPage(nextPage);
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
            commentPage={currentPage}
            onCreateReply={(parentId, content) => createComment(content, parentId)}
            onToggleReaction={toggleCommentReaction}
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
              onClick={() => goToCommentPage(1)}
              disabled={loading || currentPage <= 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300 dark:disabled:text-slate-600"
              aria-label="第一页"
              title="第一页"
            >
              <ChevronFirst size={16} />
            </button>
            <button
              type="button"
              onClick={() => goToCommentPage(currentPage - 1)}
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
              onClick={() => goToCommentPage(currentPage + 1)}
              disabled={loading || currentPage >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300 dark:disabled:text-slate-600"
              aria-label="下一页"
              title="下一页"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => goToCommentPage(totalPages)}
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
