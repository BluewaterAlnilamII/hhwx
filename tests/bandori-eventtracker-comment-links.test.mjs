import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildEventCommentPermalink } from "../src/app/[locale]/bandori/events/urlQuery.ts";

const commentThreadSource = readFileSync(
  new URL("../src/hooks/useCommentThread.ts", import.meta.url),
  "utf8",
);
const commentItemSource = readFileSync(
  new URL("../src/components/comments/CommentItem.tsx", import.meta.url),
  "utf8",
);
const eventCommentsSource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/EventComments.tsx", import.meta.url),
  "utf8",
);

test("comment deep links override stale reverse-sorted page parameters", () => {
  assert.match(
    commentThreadSource,
    /if \(commentId\) \{[\s\S]*?const locatedPage = await locateLinkedComment\(commentId, \{\s*silent: true,\s*\}\)/u,
  );
  assert.ok(
    commentThreadSource.indexOf("const locatedPage = await locateLinkedComment(commentId")
      < commentThreadSource.indexOf("const data = await loadRootComments(requestedPage)"),
  );
  assert.match(commentThreadSource, /page: locatedPage,\s*commentId,/u);
  assert.doesNotMatch(commentThreadSource, /expectedPage: loadedPage/u);
});

test("comment location returns the resolved root page for URL canonicalization", () => {
  assert.match(commentThreadSource, /\): Promise<number \| null> =>/u);
  assert.match(commentThreadSource, /return data\.rootPage/u);
});

test("linked comments scroll after React commits the loaded comment tree", () => {
  assert.match(
    commentThreadSource,
    /const pendingCommentScrollIdRef = useRef<string \| null>\(null\)/u,
  );
  assert.match(
    commentThreadSource,
    /useEffect\(\(\) => \{[\s\S]*?pendingCommentScrollIdRef\.current[\s\S]*?window\.requestAnimationFrame[\s\S]*?scrollToRenderedComment\(commentId\)[\s\S]*?window\.cancelAnimationFrame\(animationFrame\)[\s\S]*?\}, \[comments, focusedCommentId, replies\]\);/u,
  );
  assert.doesNotMatch(
    commentThreadSource,
    /window\.requestAnimationFrame\(\(\) => \{\s*scrollToRenderedComment\(commentId\);\s*\}\);/u,
  );
});

test("copying a comment permalink does not mutate the current history entry", () => {
  assert.match(commentItemSource, /navigator\.clipboard\?\.writeText\(permalink\)/u);
  assert.doesNotMatch(
    commentItemSource,
    /handleCopyLink[\s\S]*?window\.history\.(?:pushState|replaceState)/u,
  );
});

test("event comment permalinks explicitly use the localized canonical event path", () => {
  const permalink = buildEventCommentPermalink({
    currentHref: "https://hhwx.org/en/bandori/events?event=333&type=event&tier=top10&server=jp&view=info&page=7&comment=old&custom=keep#chart",
    locale: "en",
    eventId: 339,
    server: 3,
    page: 2,
    commentId: "new-comment",
  });

  assert.equal(
    permalink,
    "https://hhwx.org/en/bandori/events/339?type=event&tier=top10&server=cn&view=info&page=2&comment=new-comment&custom=keep#chart",
  );
  assert.match(eventCommentsSource, /buildEventCommentPermalink\(\{/u);
  assert.match(eventCommentsSource, /currentHref: window\.location\.href/u);
  assert.match(eventCommentsSource, /locale,\s*eventId,\s*server,/u);
  assert.doesNotMatch(eventCommentsSource, /searchParams\.set\("event"/u);
  const updateLocationSource = eventCommentsSource.slice(
    eventCommentsSource.indexOf("const updateLocation"),
    eventCommentsSource.indexOf("const buildPermalink"),
  );
  assert.doesNotMatch(updateLocationSource, /eventId/u);
});

test("event comment permalinks fail closed without a valid event ID", () => {
  for (const eventId of [null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(buildEventCommentPermalink({
      currentHref: "https://hhwx.org/bandori/events?server=cn",
      locale: "zh-CN",
      eventId,
      server: 3,
      page: 1,
      commentId: "comment-id",
    }), "");
  }
});
