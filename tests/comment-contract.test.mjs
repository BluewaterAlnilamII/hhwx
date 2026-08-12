import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  COMMENT_TARGET_BANDORI_EVENT,
  isBandoriEventCommentTargetAccessible,
  parseBandoriEventCommentEventId,
} from "../src/lib/bandori/events/comment-target.ts";
import {
  COMMENT_TARGET_BANDORI_CARD,
  buildBandoriCardCommentTargetId,
  parseBandoriCardCommentCardId,
  parseBandoriCardCommentEntityServer,
  parseBandoriCardCommentTargetId,
} from "../src/lib/bandori/cards/comment-target.ts";
import {
  COMMENT_LENGTH_WARNING_THRESHOLD,
  COMMENT_REACTION_PARTICIPANT_PAGE_SIZE,
  MAX_COMMENT_LENGTH,
  buildCommentReactionParticipantCursor,
  countCommentCharacters,
  parseCommentId,
  parseCommentContent,
  parseCommentNotificationType,
  parseCommentPage,
  parseParentCommentId,
  parseCommentReactionParticipantCursor,
  truncateCommentContent,
} from "../src/lib/comments/comment-contract.ts";
import {
  buildCommentDraftStorageKey,
  clearCommentDraft,
  readCommentDraft,
  writeCommentDraft,
} from "../src/lib/comments/comment-drafts.ts";
import { parseCommentReactionSummaryRows } from "../src/lib/comments/comments-server.ts";

const VALID_COMMENT_ID = "123e4567-e89b-12d3-a456-426614174000";

test("comment target types remain owned by their Bandori domain adapters", () => {
  const eventTargetSource = readFileSync(
    new URL("../src/lib/bandori/events/comment-target.ts", import.meta.url),
    "utf8",
  );
  const commentContractSource = readFileSync(
    new URL("../src/lib/comments/comment-contract.ts", import.meta.url),
    "utf8",
  );
  const cardTargetSource = readFileSync(
    new URL("../src/lib/bandori/cards/comment-target.ts", import.meta.url),
    "utf8",
  );
  const routeSources = [
    "../src/app/api/bandori/events/[eventId]/comments/route.ts",
    "../src/app/api/bandori/events/[eventId]/comments/[commentId]/route.ts",
    "../src/app/api/bandori/events/[eventId]/comments/[commentId]/replies/route.ts",
    "../src/app/api/bandori/events/[eventId]/comments/[commentId]/reactions/[emojiKey]/route.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  assert.equal(COMMENT_TARGET_BANDORI_EVENT, "bandori_event");
  assert.equal(COMMENT_TARGET_BANDORI_CARD, "bandori_card");
  assert.match(eventTargetSource, /export const COMMENT_TARGET_BANDORI_EVENT = "bandori_event"/u);
  assert.match(cardTargetSource, /export const COMMENT_TARGET_BANDORI_CARD = "bandori_card"/u);
  assert.doesNotMatch(commentContractSource, /COMMENT_TARGET_BANDORI_(?:EVENT|CARD)|bandori_(?:event|card)/u);
  for (const routeSource of routeSources) {
    assert.match(routeSource, /COMMENT_TARGET_BANDORI_EVENT[\s\S]*from "@\/lib\/bandori\/events\/comment-target"/u);
    assert.doesNotMatch(routeSource, /COMMENT_TARGET_BANDORI_EVENT[\s\S]*from "@\/lib\/comments\/comment-contract"/u);
  }
});

test("card comment targets share ordinary cards and isolate registered collisions", () => {
  assert.equal(parseBandoriCardCommentCardId("595"), "595");
  assert.equal(buildBandoriCardCommentTargetId("595", null), "595");
  assert.equal(buildBandoriCardCommentTargetId("10001", 1), "en:10001");
  assert.equal(buildBandoriCardCommentTargetId("10001", 3), "cn:10001");
  assert.deepEqual(parseBandoriCardCommentTargetId("595"), {
    cardId: 595,
    entityServer: null,
  });
  assert.deepEqual(parseBandoriCardCommentTargetId("en:10001"), {
    cardId: 10001,
    entityServer: 1,
  });
  assert.deepEqual(parseBandoriCardCommentTargetId("cn:10001"), {
    cardId: 10001,
    entityServer: 3,
  });

  assert.equal(
    parseBandoriCardCommentEntityServer("595", new URL("https://hhwx.org/api/comments")),
    null,
  );
  assert.equal(
    parseBandoriCardCommentEntityServer("10001", new URL("https://hhwx.org/api/comments?server=en")),
    1,
  );

  for (const value of ["", "0", "-1", "12tail", "9007199254740992"]) {
    assert.throws(() => parseBandoriCardCommentCardId(value));
  }
  assert.throws(() => parseBandoriCardCommentEntityServer(
    "595",
    new URL("https://hhwx.org/api/comments?server=cn"),
  ));
  assert.throws(() => parseBandoriCardCommentEntityServer(
    "10001",
    new URL("https://hhwx.org/api/comments"),
  ));
  assert.throws(() => parseBandoriCardCommentEntityServer(
    "10001",
    new URL("https://hhwx.org/api/comments?server=jp"),
  ));
  assert.throws(() => buildBandoriCardCommentTargetId("595", 3));
  assert.throws(() => buildBandoriCardCommentTargetId("10001", null));
  for (const value of ["10001", "jp:10001", "en:595", "en:10011", "cn:0", "bad"] ) {
    assert.equal(parseBandoriCardCommentTargetId(value), null);
  }
});

test("comment route tokens require complete positive integers and UUIDs", () => {
  assert.equal(parseBandoriEventCommentEventId("123"), "123");
  assert.equal(parseCommentPage(null), 1);
  assert.equal(parseCommentPage("42"), 42);
  assert.equal(parseCommentId(VALID_COMMENT_ID), VALID_COMMENT_ID);
  assert.equal(parseParentCommentId(null), null);
  assert.equal(parseParentCommentId(VALID_COMMENT_ID), VALID_COMMENT_ID);

  for (const value of ["12abc", " 12", "0", "-1", "9007199254740992"]) {
    assert.throws(() => parseBandoriEventCommentEventId(value));
  }
  for (const value of ["2next", "0", "-1", "1.5", "9007199254740992"]) {
    assert.throws(() => parseCommentPage(value));
  }
  for (const value of ["", "not-a-uuid", `${VALID_COMMENT_ID}tail`]) {
    assert.throws(() => parseCommentId(value));
    assert.throws(() => parseParentCommentId(value));
  }
});

test("comment reaction participant cursors preserve stable timestamp and user ordering", () => {
  const postgresReactedAt = "2026-08-10T08:24:23.86436+00:00";
  const postgresCursor = buildCommentReactionParticipantCursor({
    reactedAt: postgresReactedAt,
    userId: VALID_COMMENT_ID,
  });

  assert.equal(COMMENT_REACTION_PARTICIPANT_PAGE_SIZE, 50);
  assert.equal(parseCommentReactionParticipantCursor(null), null);
  assert.equal(postgresCursor, `${postgresReactedAt}|${VALID_COMMENT_ID}`);
  assert.deepEqual(parseCommentReactionParticipantCursor(postgresCursor), {
    reactedAt: postgresReactedAt,
    userId: VALID_COMMENT_ID,
  });
  assert.deepEqual(
    parseCommentReactionParticipantCursor(`2026-08-11T08:09:10.123Z|${VALID_COMMENT_ID}`),
    {
      reactedAt: "2026-08-11T08:09:10.123Z",
      userId: VALID_COMMENT_ID,
    },
  );

  for (const value of [
    "not-a-cursor",
    `not-a-date|${VALID_COMMENT_ID}`,
    `2026-08-11|${VALID_COMMENT_ID}`,
    `2026-02-30T08:09:10.123Z|${VALID_COMMENT_ID}`,
    `2026-08-11T08:09:10.1234567Z|${VALID_COMMENT_ID}`,
    `2026-08-11T08:09:10.123Z,created_at.gt.0|${VALID_COMMENT_ID}`,
    "2026-08-11T08:09:10.123Z|not-a-uuid",
    `2026-08-11T08:09:10.123Z|${VALID_COMMENT_ID}|extra`,
  ]) {
    assert.throws(() => parseCommentReactionParticipantCursor(value));
  }
});

test("comment reaction participant cursors advance a 51-user keyset page without duplicates", () => {
  const reactedAt = "2026-08-10T08:24:23.86436+00:00";
  const participants = Array.from({ length: 51 }, (_, index) => ({
    reactedAt,
    userId: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
  }));
  const firstPage = participants.slice(0, COMMENT_REACTION_PARTICIPANT_PAGE_SIZE);
  const nextCursor = parseCommentReactionParticipantCursor(
    buildCommentReactionParticipantCursor(firstPage[firstPage.length - 1]),
  );

  assert.ok(nextCursor);
  assert.equal(participants.length > COMMENT_REACTION_PARTICIPANT_PAGE_SIZE, true);

  const secondPage = participants.filter((participant) => (
    participant.reactedAt > nextCursor.reactedAt
    || (
      participant.reactedAt === nextCursor.reactedAt
      && participant.userId > nextCursor.userId
    )
  ));

  assert.deepEqual(secondPage, [participants[50]]);
  assert.equal(firstPage.some((participant) => participant.userId === secondPage[0].userId), false);
});

test("reaction participant reads extend the existing emoji route without requiring sign-in", () => {
  const routeSource = readFileSync(
    new URL("../src/app/api/bandori/events/[eventId]/comments/[commentId]/reactions/[emojiKey]/route.ts", import.meta.url),
    "utf8",
  );
  const serviceSource = readFileSync(
    new URL("../src/lib/comments/comments-server.ts", import.meta.url),
    "utf8",
  );
  const getHandlerSource = routeSource.slice(
    routeSource.indexOf("export async function GET"),
    routeSource.indexOf("export async function PUT"),
  );

  assert.match(getHandlerSource, /listCommentReactionParticipants\(/u);
  assert.match(getHandlerSource, /buildBandoriEventCommentTargetId\(eventId, server\)/u);
  assert.match(getHandlerSource, /parseCommentReactionParticipantCursor/u);
  assert.doesNotMatch(getHandlerSource, /requireVerifiedAccount/u);
  assert.match(serviceSource, /await ensureReactableComment\(options\)/u);
  assert.match(serviceSource, /\.order\("created_at", \{ ascending: true \}\)[\s\S]*\.order\("user_id", \{ ascending: true \}\)/u);
  assert.match(serviceSource, /\.limit\(COMMENT_REACTION_PARTICIPANT_PAGE_SIZE \+ 1\)/u);
  assert.match(serviceSource, /nextCursor: lastUser \? buildCommentReactionParticipantCursor\(lastUser\) : null/u);
});

test("comment page hydration batches reply previews and reaction summaries", () => {
  const serviceSource = readFileSync(
    new URL("../src/lib/comments/comments-server.ts", import.meta.url),
    "utf8",
  );

  assert.match(serviceSource, /\.rpc\("read_comment_preview_reply_ids"/u);
  assert.match(serviceSource, /\.rpc\("read_comment_reaction_summary_rows"/u);
  assert.match(serviceSource, /\.in\("id", replyIds\)/u);
  assert.match(serviceSource, /toCommentNodes\(\[\.\.\.rows, \.\.\.previewRows\], options\.viewerUserId\)/u);
  assert.doesNotMatch(serviceSource, /Promise\.all\(rootIds\.map/u);
});

test("comment reaction summary rows map ordered JSON and reject incomplete previews", () => {
  const rawRows = [{
    comment_id: VALID_COMMENT_ID,
    reaction_groups: [{
      emoji_key: "KokoroYay",
      reaction_count: "2",
      reacted_by_viewer: true,
      first_reacted_at: "2026-08-11T00:00:00Z",
      users: [
        {
          user_id: "00000000-0000-0000-0000-000000000001",
          username: "First user",
          avatar_card_id: 1,
          avatar_card_server: null,
          avatar_card_train_type: "normal",
          reacted_at: "2026-08-11T00:00:00Z",
        },
        {
          user_id: "00000000-0000-0000-0000-000000000002",
          username: null,
          avatar_card_id: null,
          avatar_card_server: null,
          avatar_card_train_type: null,
          reacted_at: "2026-08-11T00:00:01Z",
        },
      ],
    }],
  }];

  assert.deepEqual(
    parseCommentReactionSummaryRows(rawRows, [VALID_COMMENT_ID]).get(VALID_COMMENT_ID),
    [{
      emojiKey: "KokoroYay",
      count: 2,
      reactedByViewer: true,
      users: [
        {
          userId: "00000000-0000-0000-0000-000000000001",
          username: "First user",
          avatar: { cardId: 1, entityServer: null, trainType: "normal" },
          reactedAt: "2026-08-11T00:00:00Z",
        },
        {
          userId: "00000000-0000-0000-0000-000000000002",
          username: null,
          avatar: { cardId: 1, entityServer: null, trainType: "normal" },
          reactedAt: "2026-08-11T00:00:01Z",
        },
      ],
      remainingUserCount: 0,
    }],
  );

  const incompleteRows = structuredClone(rawRows);
  incompleteRows[0].reaction_groups[0].reaction_count = "3";
  assert.throws(
    () => parseCommentReactionSummaryRows(incompleteRows, [VALID_COMMENT_ID]),
    (error) => error?.details === "Incomplete comment reaction participant preview",
  );
  assert.throws(
    () => parseCommentReactionSummaryRows(rawRows, ["00000000-0000-0000-0000-000000000099"]),
    (error) => error?.details === "Invalid comment reaction summary row",
  );
});

test("comment notification contracts stay generic and target presentation stays at the edge", () => {
  const contractSource = readFileSync(
    new URL("../src/lib/comments/comment-contract.ts", import.meta.url),
    "utf8",
  );
  const serviceSource = readFileSync(
    new URL("../src/lib/comments/notifications-server.ts", import.meta.url),
    "utf8",
  );
  const apiSource = readFileSync(
    new URL("../src/app/api/account/notifications/route.ts", import.meta.url),
    "utf8",
  );
  const pageSource = readFileSync(
    new URL("../src/app/[locale]/account/notifications/page.tsx", import.meta.url),
    "utf8",
  );
  const oldServiceUrl = new URL("../src/lib/comment-notifications-server.ts", import.meta.url);

  assert.equal(parseCommentNotificationType("comment_reply"), "comment_reply");
  assert.equal(parseCommentNotificationType("comment_reaction"), "comment_reaction");
  assert.equal(parseCommentNotificationType("bandori_event"), null);
  assert.match(contractSource, /export type CommentNotification = CommentReplyNotification \| CommentReactionNotification/u);
  assert.match(contractSource, /export type CommentNotificationListResponse/u);
  assert.doesNotMatch(serviceSource, /bandori|eventId|BandoriServer/iu);
  assert.match(apiSource, /COMMENT_TARGET_BANDORI_EVENT[\s\S]*parseBandoriEventCommentTargetId/u);
  assert.match(apiSource, /eventId: target\?\.eventId \?\? null/u);
  assert.match(apiSource, /server: target \? getBandoriServerCode\(target\.server\) : null/u);
  assert.match(pageSource, /import type \{[\s\S]*CommentNotification[\s\S]*from "@\/lib\/comments\/comment-contract"/u);
  assert.match(pageSource, /switch \(notification\.targetType\)/u);
  assert.match(pageSource, /case COMMENT_TARGET_BANDORI_CARD/u);
  assert.match(pageSource, /parseBandoriCardCommentTargetId\(notification\.targetId\)/u);
  assert.match(pageSource, /href: null/u);
  assert.doesNotMatch(pageSource, /^type (?:Base)?CommentNotification/mu);
  assert.equal(existsSync(oldServiceUrl), false);
});

test("shared comments accept 1000 Unicode characters and count emoji consistently", () => {
  assert.equal(MAX_COMMENT_LENGTH, 1_000);
  assert.equal(COMMENT_LENGTH_WARNING_THRESHOLD, 920);
  assert.equal(countCommentCharacters("a😀中"), 3);
  assert.equal(parseCommentContent("😀".repeat(1_000)), "😀".repeat(1_000));
  assert.throws(() => parseCommentContent("😀".repeat(1_001)));
  assert.equal(countCommentCharacters(truncateCommentContent("😀".repeat(1_001))), 1_000);
});

test("comment drafts isolate users, targets, roots, and replies in session storage", () => {
  const values = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };

  try {
    const rootKey = buildCommentDraftStorageKey({
      userId: "user-a",
      targetKey: "/api/bandori/cards/595/comments?",
    });
    const otherUserKey = buildCommentDraftStorageKey({
      userId: "user-b",
      targetKey: "/api/bandori/cards/595/comments?",
    });
    const replyKey = buildCommentDraftStorageKey({
      userId: "user-a",
      targetKey: "/api/bandori/cards/595/comments?",
      replyToCommentId: VALID_COMMENT_ID,
    });

    assert.notEqual(rootKey, otherUserKey);
    assert.notEqual(rootKey, replyKey);
    assert.equal(writeCommentDraft(rootKey, "draft"), "draft");
    assert.equal(readCommentDraft(rootKey), "draft");
    assert.equal(readCommentDraft(otherUserKey), "");
    assert.equal(countCommentCharacters(writeCommentDraft(replyKey, "😀".repeat(1_001))), 1_000);
    clearCommentDraft(rootKey);
    assert.equal(readCommentDraft(rootKey), "");
  } finally {
    globalThis.window = originalWindow;
  }
});

test("comment composers remount with user-scoped target draft keys", () => {
  const thread = readFileSync(
    new URL("../src/components/comments/CommentThread.tsx", import.meta.url),
    "utf8",
  );
  const item = readFileSync(
    new URL("../src/components/comments/CommentItem.tsx", import.meta.url),
    "utf8",
  );

  assert.match(thread, /const draftTargetKey = `\$\{apiBase \?\? "disabled"\}\?\$\{apiQuery\}`/u);
  assert.match(thread, /key=\{rootDraftStorageKey \?\? "root-comment-composer"\}/u);
  assert.match(item, /replyToCommentId: comment\.id/u);
  assert.match(item, /key=\{replyDraftStorageKey \?\? `reply-comment-composer:\$\{comment\.id\}`\}/u);
});

test("shared comment textareas auto grow on every viewport and cap their height", () => {
  const composer = readFileSync(
    new URL("../src/components/comments/CommentComposer.tsx", import.meta.url),
    "utf8",
  );
  const item = readFileSync(
    new URL("../src/components/comments/CommentItem.tsx", import.meta.url),
    "utf8",
  );
  const autoResizeHook = readFileSync(
    new URL("../src/hooks/useAutoResizeTextarea.ts", import.meta.url),
    "utf8",
  );

  assert.match(composer, /useAutoResizeTextarea\(content\)/u);
  assert.match(item, /useAutoResizeTextarea\(editValue, editing\)/u);
  for (const source of [composer, item]) {
    assert.match(source, /max-h-60/u);
    assert.match(source, /resize-y/u);
  }
  assert.match(autoResizeHook, /textarea\.scrollHeight/u);
  assert.match(autoResizeHook, /contentHeight > nextHeight \? "auto" : "hidden"/u);
  assert.match(autoResizeHook, /new ResizeObserver/u);
});

test("mobile comment threads group roots into wide cards without nesting replies", () => {
  const thread = readFileSync(
    new URL("../src/components/comments/CommentThread.tsx", import.meta.url),
    "utf8",
  );
  const item = readFileSync(
    new URL("../src/components/comments/CommentItem.tsx", import.meta.url),
    "utf8",
  );
  const composer = readFileSync(
    new URL("../src/components/comments/CommentComposer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(thread, /p-2[\s\S]*sm:p-5/u);
  assert.match(thread, /bg-\[#fffef4\][\s\S]*dark:bg-slate-950/u);
  assert.match(
    thread,
    /border-b border-\[var\(--theme-color-border-subtle\)\] px-2 pb-4 pt-2 sm:px-0 sm:pt-0/u,
  );
  assert.match(thread, /mt-5 space-y-3/u);
  assert.doesNotMatch(thread, /-mx-1/u);
  assert.match(item, /grid-cols-\[2\.75rem_minmax\(0,1fr\)\]/u);
  assert.match(
    item,
    /col-span-2 min-w-0 pt-1 sm:col-span-1 sm:col-start-2 sm:pt-0/u,
  );
  assert.doesNotMatch(item, /col-span-2 min-w-0 pt-3/u);
  assert.match(item, /rounded-2xl border[\s\S]*px-3 py-3[\s\S]*sm:p-4/u);
  assert.match(
    item,
    /rounded-2xl border border-\[var\(--theme-color-border-subtle\)\] bg-\[var\(--theme-color-control-background\)\]/u,
  );
  assert.match(
    composer,
    /rounded-2xl border border-\[var\(--theme-color-border-subtle\)\] bg-\[var\(--theme-color-control-background\)\] p-3/u,
  );
  assert.match(item, /const commentReactions = comment\.reactions \?\? \[\]/u);
  assert.match(item, /const hasDedicatedReactionRow = !isDeleted && commentReactions\.length >= 2/u);
  assert.match(item, /data-comment-action-layout=\{hasDedicatedReactionRow \? "stacked" : "inline"\}/u);
  assert.match(item, /hasDedicatedReactionRow \? "space-y-1\.5" : "flex flex-wrap items-center gap-1\.5"/u);
  assert.match(item, /data-comment-reactions className="flex flex-wrap items-center gap-1\.5"/u);
  assert.match(item, /hasDedicatedReactionRow[\s\S]*\? "justify-end sm:justify-start"[\s\S]*: "ml-auto justify-end sm:ml-0 sm:justify-start"/u);
  assert.match(
    item,
    /data-comment-reactions[\s\S]*ReactionChip[\s\S]*EmojiPickerButton[\s\S]*data-comment-actions[\s\S]*<Reply[\s\S]*<Link2[\s\S]*<Edit3[\s\S]*<Trash2/u,
  );
  assert.match(item, /space-y-0 border-l[\s\S]*pl-3 sm:space-y-3/u);
  assert.match(item, /bg-transparent py-2 first:pt-1 last:pb-0 sm:rounded-xl sm:py-1 sm:last:pb-1/u);
  assert.doesNotMatch(item, /first:pt-0/u);
  assert.match(item, /variant="reply"/u);
  assert.match(composer, /variant === "reply"[\s\S]*bg-transparent[\s\S]*sm:rounded-2xl/u);
  assert.match(item, /hidden sm:inline/u);
  assert.match(item, /size="comment"/u);
});

test("every card comment write verifies the selected card entity", () => {
  const collectionRoute = readFileSync(
    new URL("../src/app/api/bandori/cards/[cardId]/comments/route.ts", import.meta.url),
    "utf8",
  );
  const itemRoute = readFileSync(
    new URL("../src/app/api/bandori/cards/[cardId]/comments/[commentId]/route.ts", import.meta.url),
    "utf8",
  );
  const reactionRoute = readFileSync(
    new URL("../src/app/api/bandori/cards/[cardId]/comments/[commentId]/reactions/[emojiKey]/route.ts", import.meta.url),
    "utf8",
  );

  assert.equal(collectionRoute.match(/requireBandoriCardCommentTarget\(/gu)?.length, 1);
  assert.equal(itemRoute.match(/requireBandoriCardCommentTarget\(/gu)?.length, 2);
  assert.equal(reactionRoute.match(/requireBandoriCardCommentTarget\(/gu)?.length, 2);
});

test("event comment targets require data for the selected server", () => {
  const event = {
    eventName: ["JP event", null, null, null],
    startAt: [1, null, null, null],
    endAt: [2, null, null, null],
    cnSchedule: { startAt: 3, endAt: 4 },
  };

  assert.equal(isBandoriEventCommentTargetAccessible(event, 0), true);
  assert.equal(isBandoriEventCommentTargetAccessible(event, 1), false);
  assert.equal(isBandoriEventCommentTargetAccessible(event, 2), false);
  assert.equal(isBandoriEventCommentTargetAccessible(event, 3), true);
});

test("every event comment write verifies the selected event target", () => {
  const collectionRoute = readFileSync(
    new URL("../src/app/api/bandori/events/[eventId]/comments/route.ts", import.meta.url),
    "utf8",
  );
  const itemRoute = readFileSync(
    new URL("../src/app/api/bandori/events/[eventId]/comments/[commentId]/route.ts", import.meta.url),
    "utf8",
  );
  const reactionRoute = readFileSync(
    new URL("../src/app/api/bandori/events/[eventId]/comments/[commentId]/reactions/[emojiKey]/route.ts", import.meta.url),
    "utf8",
  );

  assert.equal(collectionRoute.match(/requireBandoriEventCommentTarget\(/gu)?.length, 1);
  assert.equal(itemRoute.match(/requireBandoriEventCommentTarget\(/gu)?.length, 2);
  assert.equal(reactionRoute.match(/requireBandoriEventCommentTarget\(/gu)?.length, 2);
});

test("EventComments remains a target adapter around the shared thread UI", () => {
  const adapter = readFileSync(
    new URL("../src/app/[locale]/bandori/events/EventComments.tsx", import.meta.url),
    "utf8",
  );

  assert.match(adapter, /import CommentThread from "@\/components\/comments\/CommentThread"/u);
  assert.doesNotMatch(adapter, /CommentComposer|CommentItem|useCommentThread\(/u);
  assert.match(adapter, /useTranslations\("bandori\.events\.comments"\)/u);
  assert.match(adapter, /title=\{t\("title"\)\}/u);
  assert.match(adapter, /signedOutMessage=\{t\("signedOutMessage"\)\}/u);
  assert.match(adapter, /emptyMessage=\{t\("emptyMessage"\)\}/u);
  assert.match(adapter, /const targetKey = `\$\{serverCode\}:\$\{eventId \?\? ""\}`/u);
  assert.match(adapter, /<CommentThread[\s\S]*?key=\{targetKey\}/u);
});

test("CardComments remains a target adapter around the shared thread UI", () => {
  const adapter = readFileSync(
    new URL("../src/app/[locale]/bandori/cards/[cardId]/CardComments.tsx", import.meta.url),
    "utf8",
  );

  assert.match(adapter, /import CommentThread from "@\/components\/comments\/CommentThread"/u);
  assert.doesNotMatch(adapter, /CommentComposer|CommentItem|useCommentThread\(/u);
  assert.match(adapter, /entityServer === null\s*\? ""/u);
  assert.match(adapter, /targetKey = buildBandoriCardCommentTargetId\(cardId, entityServer\)/u);
  assert.match(adapter, /<CommentThread[\s\S]*?key=\{targetKey\}/u);
  assert.match(adapter, /useTranslations\("bandori\.cards\.comments"\)/u);
});

test("manual comment refresh loads the latest page and clears stale deep-link state", () => {
  const hook = readFileSync(
    new URL("../src/hooks/useCommentThread.ts", import.meta.url),
    "utf8",
  );
  const thread = readFileSync(
    new URL("../src/components/comments/CommentThread.tsx", import.meta.url),
    "utf8",
  );

  assert.match(hook, /const refreshComments = useCallback\(async \(\): Promise<boolean> => \{/u);
  assert.match(hook, /const data = await loadRootComments\(1, requestTarget\)/u);
  assert.match(hook, /updateLocation\(\{ page: data\.page \?\? 1, commentId: null \}\)/u);
  assert.match(hook, /const replyResults = await Promise\.allSettled\(/u);
  assert.match(hook, /replyResults\.every\(\(result\) => result\.status === "fulfilled"\)/u);
  assert.match(thread, /onClick=\{handleRefresh\}/u);
  assert.match(thread, /aria-label=\{t\("actions\.refresh"\)\}/u);
  assert.match(thread, /visibleRefreshPhase === "pending" \? "animate-spin"/u);
  assert.match(thread, /role="status"[\s\S]*t\("states\.refreshSuccess"\)/u);
  assert.match(thread, /role="alert"[\s\S]*t\("states\.refreshFailed"\)/u);
  assert.equal(thread.match(/absolute right-full top-1\/2 z-20 mr-2/gu)?.length, 2);
  assert.doesNotMatch(thread, /absolute right-0 top-full z-20 mt-2/u);
  assert.match(thread, /window\.clearTimeout\(refreshFeedbackTimerRef\.current\)/u);
});
