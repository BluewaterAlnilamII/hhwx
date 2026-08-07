"use client";

import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { useCommentStampAnimation } from "@/hooks/useCommentStamps";
import {
  getBandoriStampCatalogItemsForRegion,
  type BandoriStampAnimationResponse,
  type BandoriStampCatalog,
} from "@/lib/bandori-stamp-assets";
import { playCommentStampVoice } from "@/lib/comment-stamp-audio";
import { getCommentEmojiSrc } from "@/lib/comment-emojis";
import {
  COMMENT_STAMP_REGIONS,
  isCommentStampRegion,
  type CommentStamp,
  type CommentStampRegion,
} from "@/lib/comment-stamps";
import { cn } from "@/lib/utils";
import { COMMENT_INPUT_MAX_LENGTH } from "./commentTypes";

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

export type CommentStampLookup = ReadonlyMap<string, CommentStamp>;

const COMMENT_CONTENT_TOKEN_PATTERN = /:stamp-([a-z]{2})-(\d+)(?:-(changed))?:|:([A-Za-z0-9_+-]+):/g;
const commentStampAtlasImageCache = new Map<string, Promise<HTMLImageElement>>();

export function formatCommentTime(value: string): string {
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

export function CommentStampAnimationCanvas({
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

export function CommentStampView({
  stamp,
  shortcode,
  variant = "comment",
}: {
  stamp: CommentStamp;
  shortcode: string;
  variant?: "comment" | "reward";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const animationSummary = stamp.animation;
  const { animation } = useCommentStampAnimation(
    stamp.region,
    stamp.id,
    animationSummary,
    Boolean(animationSummary) && !animationFailed,
  );
  const voiceUrl = stamp.voiceUrl;
  const imageUrl = stamp.imageUrl;
  const mediaClassName = cn(
    "h-full w-full object-contain",
    variant === "reward"
      ? "max-h-[74px] max-w-[111px] sm:max-h-[76px] sm:max-w-[114px]"
      : "max-h-16 max-w-24 sm:max-h-[76px] sm:max-w-[114px]",
  );

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
        className={mediaClassName}
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
        onError={() => setImageFailed(true)}
        className={mediaClassName}
      />
    )
  );

  const className = cn(
    "relative mx-0.5 inline-flex shrink-0 items-center justify-center align-[-1.35em]",
    variant === "reward"
      ? "h-[74px] w-[111px] sm:h-[76px] sm:w-[114px]"
      : "h-16 w-24 sm:h-[76px] sm:w-[114px]",
  );
  if (!voiceUrl) {
    return <span className={className}>{image}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => {
        void playCommentStampVoice(voiceUrl);
      }}
      className={cn(
        className,
        "rounded-lg transition hover:bg-[var(--theme-color-control-background-hover)] focus:outline-hidden focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] dark:hover:bg-rose-500/10 dark:focus:ring-rose-500/30",
      )}
      aria-label={`Play ${shortcode}`}
      title={`Play ${shortcode}`}
    >
      {image}
      <span className="absolute bottom-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow-xs ring-2 ring-white dark:ring-slate-900">
        <Volume2 size={12} aria-hidden="true" />
      </span>
    </button>
  );
}

function commentStampLookupKey(
  region: CommentStampRegion,
  stampId: number,
  kind: CommentStamp["kind"],
): string {
  return `${region}:${stampId}:${kind}`;
}

export function buildCommentStampLookup(catalog: BandoriStampCatalog | null): CommentStampLookup {
  const lookup = new Map<string, CommentStamp>();
  for (const region of COMMENT_STAMP_REGIONS) {
    for (const stamp of getBandoriStampCatalogItemsForRegion(catalog, region)) {
      lookup.set(commentStampLookupKey(region, stamp.id, stamp.kind), stamp);
    }
  }
  return lookup;
}

function resolveCommentStampWithCatalog(
  stampLookup: CommentStampLookup,
  region: CommentStampRegion,
  id: number,
  kind: CommentStamp["kind"],
): CommentStamp | null {
  return stampLookup.get(commentStampLookupKey(region, id, kind)) ?? null;
}

function parseCommentContent(content: string, stampLookup: CommentStampLookup): CommentContentToken[] {
  const tokens: CommentContentToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  COMMENT_CONTENT_TOKEN_PATTERN.lastIndex = 0;

  while ((match = COMMENT_CONTENT_TOKEN_PATTERN.exec(content)) !== null) {
    const [raw, stampRegion, stampId, changedMarker, emojiName] = match;
    let token: CommentContentToken | null = null;

    if (stampRegion && stampId) {
      if (isCommentStampRegion(stampRegion)) {
        const id = Number.parseInt(stampId, 10);
        const stamp = Number.isSafeInteger(id)
          ? resolveCommentStampWithCatalog(
            stampLookup,
            stampRegion,
            id,
            changedMarker ? "changed" : "normal",
          )
          : null;
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

export const CommentContent = memo(function CommentContent({
  content,
  isDeleted,
  stampLookup,
}: {
  content: string;
  isDeleted: boolean;
  stampLookup: CommentStampLookup;
}) {
  const contentClassName = isDeleted ? "text-[var(--theme-color-text-muted)] opacity-70" : "text-[var(--theme-color-text-muted)] dark:text-slate-200";
  const tokens = useMemo(
    () => (isDeleted ? [] : parseCommentContent(content, stampLookup)),
    [content, isDeleted, stampLookup],
  );

  if (isDeleted) {
    return (
      <p className={cn("mt-2 whitespace-pre-wrap wrap-break-word text-[15px] leading-[26px] wrap-anywhere", contentClassName)}>
        （已删除）
      </p>
    );
  }

  if (isJumboEmojiContent(tokens)) {
    return (
      <div className={cn("mt-2 flex flex-col items-start gap-1 wrap-anywhere", contentClassName)}>
        {renderJumboEmojiRows(tokens)}
      </div>
    );
  }

  return (
    <p className={cn("mt-2 whitespace-pre-wrap wrap-break-word text-[15px] leading-[26px] wrap-anywhere", contentClassName)}>
      {renderCommentContentTokens(tokens)}
    </p>
  );
});

export function insertCommentShortcode(
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

export function buildEmojiShortcode(name: string): string {
  return `:${name}:`;
}

export function buildStampShortcode(stamp: CommentStamp): string {
  return `:stamp-${stamp.region}-${stamp.id}${stamp.kind === "changed" ? "-changed" : ""}:`;
}
