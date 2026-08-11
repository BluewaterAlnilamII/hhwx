import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  COMMENT_TARGET_BANDORI_EVENT,
  isBandoriEventCommentTargetAccessible,
  parseBandoriEventCommentEventId,
} from "../src/lib/bandori/events/comment-target.ts";
import {
  COMMENT_REACTION_PARTICIPANT_PAGE_SIZE,
  buildCommentReactionParticipantCursor,
  parseCommentId,
  parseCommentNotificationType,
  parseCommentPage,
  parseParentCommentId,
  parseCommentReactionParticipantCursor,
} from "../src/lib/comments/comment-contract.ts";

const VALID_COMMENT_ID = "123e4567-e89b-12d3-a456-426614174000";

test("event target type remains owned by the Bandori event adapter", () => {
  const eventTargetSource = readFileSync(
    new URL("../src/lib/bandori/events/comment-target.ts", import.meta.url),
    "utf8",
  );
  const commentContractSource = readFileSync(
    new URL("../src/lib/comments/comment-contract.ts", import.meta.url),
    "utf8",
  );
  const routeSources = [
    "../src/app/api/bandori/events/[eventId]/comments/route.ts",
    "../src/app/api/bandori/events/[eventId]/comments/[commentId]/route.ts",
    "../src/app/api/bandori/events/[eventId]/comments/[commentId]/replies/route.ts",
    "../src/app/api/bandori/events/[eventId]/comments/[commentId]/reactions/[emojiKey]/route.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  assert.equal(COMMENT_TARGET_BANDORI_EVENT, "bandori_event");
  assert.match(eventTargetSource, /export const COMMENT_TARGET_BANDORI_EVENT = "bandori_event"/u);
  assert.doesNotMatch(commentContractSource, /COMMENT_TARGET_BANDORI_EVENT|bandori_event/u);
  for (const routeSource of routeSources) {
    assert.match(routeSource, /COMMENT_TARGET_BANDORI_EVENT[\s\S]*from "@\/lib\/bandori\/events\/comment-target"/u);
    assert.doesNotMatch(routeSource, /COMMENT_TARGET_BANDORI_EVENT[\s\S]*from "@\/lib\/comments\/comment-contract"/u);
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
  assert.match(pageSource, /href: null/u);
  assert.doesNotMatch(pageSource, /^type (?:Base)?CommentNotification/mu);
  assert.equal(existsSync(oldServiceUrl), false);
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
});
