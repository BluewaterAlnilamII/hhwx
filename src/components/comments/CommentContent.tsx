"use client";

import type { ReactNode } from "react";
import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import BandoriStampView from "@/components/bandori/BandoriStampView";
import { getCommentEmojiSrc } from "@/lib/comment-emojis";
import {
  isCommentStampRegion,
  type CommentStamp,
} from "@/lib/comment-stamps";
import {
  resolveCommentStamp,
  type CommentStampLookup,
} from "@/lib/comments/comment-content";
import { cn } from "@/lib/utils";

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

const COMMENT_CONTENT_TOKEN_PATTERN = /:stamp-([a-z]{2})-(\d+)(?:-(changed))?:|:([A-Za-z0-9_+-]+):/g;

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
          ? resolveCommentStamp(
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
  return <BandoriStampView key={`${token.raw}-${token.index}`} stamp={token.stamp} label={token.raw} />;
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
  const t = useTranslations("comments");
  const contentClassName = isDeleted ? "text-[var(--theme-color-text-muted)] opacity-70" : "text-[var(--theme-color-text-muted)] dark:text-slate-200";
  const tokens = useMemo(
    () => (isDeleted ? [] : parseCommentContent(content, stampLookup)),
    [content, isDeleted, stampLookup],
  );

  if (isDeleted) {
    return (
      <p className={cn("mt-2 whitespace-pre-wrap wrap-break-word text-[15px] leading-[26px] wrap-anywhere", contentClassName)}>
        {t("states.deleted")}
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
