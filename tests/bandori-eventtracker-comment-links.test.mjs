import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const commentThreadSource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/useCommentThread.ts", import.meta.url),
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
  assert.match(commentThreadSource, /commentPage: locatedPage,\s*commentId,/u);
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
