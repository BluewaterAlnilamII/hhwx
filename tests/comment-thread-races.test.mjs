import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CommentRequestError,
  classifyLinkedCommentLocateError,
  isCommentTargetRequestCurrent,
} from "../src/lib/comments/comment-request-guard.ts";

const hookSource = readFileSync(
  new URL("../src/hooks/useCommentThread.ts", import.meta.url),
  "utf8",
);

test("comment mutations fail closed after target changes or unmounts", () => {
  const captured = { generation: 4, identity: '["event:1","/api/events/1",""]' };
  assert.equal(isCommentTargetRequestCurrent(captured, captured, true), true);
  assert.equal(isCommentTargetRequestCurrent(captured, { ...captured, generation: 5 }, true), false);
  assert.equal(isCommentTargetRequestCurrent(captured, { ...captured, identity: "event:2" }, true), false);
  assert.equal(isCommentTargetRequestCurrent(captured, captured, false), false);
  assert.match(
    hookSource,
    /useLayoutEffect\(\(\) => \{[\s\S]*?currentTargetIdentityRef\.current === targetIdentity[\s\S]*?targetGenerationRef\.current \+= 1[\s\S]*?readGenerationRef\.current \+= 1[\s\S]*?\}, \[targetIdentity\]\)/u,
  );
  assert.doesNotMatch(
    hookSource,
    /const currentTargetIdentityRef = useRef\(targetIdentity\);\s*if \(currentTargetIdentityRef\.current !== targetIdentity\)/u,
  );
  assert.match(hookSource, /mountedRef\.current = false;[\s\S]*?targetGenerationRef\.current \+= 1/u);

  for (const mutationName of [
    "createComment",
    "updateCommentContent",
    "deleteComment",
    "toggleCommentReaction",
  ]) {
    const start = hookSource.indexOf(`const ${mutationName} = useCallback`);
    const end = hookSource.indexOf("\n  const ", start + 1);
    const mutationSource = hookSource.slice(start, end);
    assert.ok(start >= 0, `${mutationName} should exist`);
    assert.match(mutationSource, /const requestTarget = captureTargetRequest\(\)/u);
    if (mutationName === "createComment") {
      assert.match(mutationSource, /await authHeaders\(\);[\s\S]*?throw new CommentRequestCancelledError\(\)/u);
      assert.match(mutationSource, /let writeCompleted = false/u);
      assert.match(mutationSource, /await requestJson<[\s\S]*?writeCompleted = true/u);
      assert.match(mutationSource, /if \(writeCompleted\) \{[\s\S]*?A completed POST belongs to the old target[\s\S]*?return;/u);
      assert.match(mutationSource, /new CommentRequestCancelledError\(\)/u);
    } else {
      assert.match(mutationSource, /await authHeaders\(\);\s*if \(!isTargetRequestCurrent\(requestTarget\)\) return;/u);
    }
    assert.match(mutationSource, /await requestJson<[\s\S]*?if \(!isTargetRequestCurrent\(requestTarget\)\) return;/u);
    assert.match(mutationSource, /catch \(error\) \{/u);
  }
});

test("manual refresh invalidates reads without changing mutation target identity", () => {
  const refreshStart = hookSource.indexOf("const refreshComments = useCallback");
  const refreshEnd = hookSource.indexOf("\n  const submitPageInput", refreshStart);
  const refreshSource = hookSource.slice(refreshStart, refreshEnd);

  assert.match(refreshSource, /readGenerationRef\.current \+= 1/u);
  assert.doesNotMatch(refreshSource, /targetGenerationRef\.current \+= 1/u);
  assert.match(refreshSource, /const requestTarget = captureTargetRequest\(\)/u);
});

test("root reads require an expected current target before committing state", () => {
  const loadStart = hookSource.indexOf("const loadRootComments = useCallback");
  const loadEnd = hookSource.indexOf("\n  const locateLinkedComment", loadStart);
  const loadSource = hookSource.slice(loadStart, loadEnd);

  assert.match(loadSource, /expectedTarget = captureTargetRequest\(\)/u);
  assert.match(loadSource, /if \(!apiBase \|\| !isTargetRequestCurrent\(expectedTarget\)\) return null;/u);
  assert.match(loadSource, /await authHeaders\(\);\s*if \(!isTargetRequestCurrent\(expectedTarget\)\) return null;/u);
  assert.match(loadSource, /!isTargetRequestCurrent\(expectedTarget\)[\s\S]*?requestId !== rootLoadSequenceRef\.current/u);
});

test("linked comment failures distinguish missing comments from transient failures", () => {
  assert.equal(
    classifyLinkedCommentLocateError(new CommentRequestError(404, "COMMENT_NOT_FOUND", "missing")),
    "missing",
  );
  assert.equal(
    classifyLinkedCommentLocateError(new CommentRequestError(400, "INVALID_COMMENT_ID", "invalid")),
    "missing",
  );
  assert.equal(
    classifyLinkedCommentLocateError(new CommentRequestError(503, "UPSTREAM_ERROR", "retry")),
    "failed",
  );
  assert.equal(classifyLinkedCommentLocateError(new TypeError("network")), "failed");

  const locateStart = hookSource.indexOf("const locateLinkedComment = useCallback");
  const locateEnd = hookSource.indexOf("\n  const navigateToComment", locateStart);
  const locateSource = hookSource.slice(locateStart, locateEnd);
  const initialLoadStart = hookSource.indexOf("const { page: requestedPage, commentId } = readLocation();");
  const initialLoadEnd = hookSource.indexOf("\n  }, [apiBase", initialLoadStart);
  const initialLoadSource = hookSource.slice(initialLoadStart, initialLoadEnd);

  assert.match(hookSource, /response\.status,[\s\S]*?getApiErrorCode\(payload\)/u);
  assert.match(locateSource, /const failure = classifyLinkedCommentLocateError\(err\)/u);
  assert.match(locateSource, /if \(failure === "failed" \|\| !options\.silent\) \{\s*setError/u);
  assert.match(initialLoadSource, /if \(locateFailure === "failed"\) \{[\s\S]*?return;/u);
  assert.ok(
    initialLoadSource.indexOf('if (locateFailure === "failed")')
      < initialLoadSource.indexOf("const data = await loadRootComments(requestedPage"),
  );
});
