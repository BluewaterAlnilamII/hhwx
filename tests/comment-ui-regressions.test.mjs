import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getCommentPopoverHorizontalPosition } from "../src/lib/comments/comment-popover-position.ts";

const threadSource = readFileSync(
  new URL("../src/components/comments/CommentThread.tsx", import.meta.url),
  "utf8",
);
const itemSource = readFileSync(
  new URL("../src/components/comments/CommentItem.tsx", import.meta.url),
  "utf8",
);

test("comment load errors and empty states are mutually exclusive", () => {
  assert.match(
    threadSource,
    /!loading && !error && comments\.length === 0/u,
  );
});

test("comment edits use a synchronous single-flight guard and lock editing controls", () => {
  const editHandler = itemSource.slice(
    itemSource.indexOf("const handleEdit = async"),
    itemSource.indexOf("const handleDelete = async"),
  );

  assert.match(itemSource, /const editSaveInFlightRef = useRef\(false\)/u);
  assert.match(itemSource, /const \[isSaving, setIsSaving\] = useState\(false\)/u);
  assert.match(
    editHandler,
    /if \(editSaveInFlightRef\.current\) \{[\s\S]*?return;[\s\S]*?editSaveInFlightRef\.current = true;[\s\S]*?setIsSaving\(true\);[\s\S]*?await onUpdate\(comment\.id, editValue\)/u,
  );
  assert.match(
    editHandler,
    /finally \{[\s\S]*?editSaveInFlightRef\.current = false;[\s\S]*?setIsSaving\(false\);/u,
  );
  assert.match(
    itemSource,
    /<fieldset[\s\S]*?disabled=\{isSaving\}[\s\S]*?aria-busy=\{isSaving\}[\s\S]*?<textarea[\s\S]*?onClick=\{handleEdit\}[\s\S]*?<\/fieldset>/u,
  );
  assert.match(itemSource, /comment\.canEdit[\s\S]*?<button[\s\S]*?disabled=\{isSaving\}/u);
  assert.match(itemSource, /<Dialog\.Trigger asChild>[\s\S]*?<button[\s\S]*?disabled=\{isSaving\}/u);
});

test("reaction previews stay inside narrow and offset visual viewports", () => {
  const cases = [
    { anchorLeft: 24, viewportLeft: 0, viewportWidth: 390 },
    { anchorLeft: 334, viewportLeft: 0, viewportWidth: 390 },
    { anchorLeft: 54, viewportLeft: 0, viewportWidth: 375 },
    { anchorLeft: 164, viewportLeft: 40, viewportWidth: 320 },
    { anchorLeft: 8, viewportLeft: 0, viewportWidth: 240 },
  ];

  for (const { anchorLeft, viewportLeft, viewportWidth } of cases) {
    const result = getCommentPopoverHorizontalPosition({
      anchorRect: { left: anchorLeft, width: 32 },
      containerLeft: anchorLeft,
      preferredWidth: 256,
      viewportLeft,
      viewportWidth,
    });
    const globalLeft = anchorLeft + result.left;

    assert.ok(globalLeft >= viewportLeft + 16);
    assert.ok(globalLeft + result.width <= viewportLeft + viewportWidth - 16);
  }

  assert.match(itemSource, /getCommentPopoverHorizontalPosition\(\{/u);
  assert.match(itemSource, /viewport\?\.offsetLeft \?\? 0/u);
  assert.match(itemSource, /viewport\?\.width \?\? window\.innerWidth/u);
  assert.match(itemSource, /window\.addEventListener\("scroll", scheduleUpdate, true\)/u);
  assert.match(itemSource, /viewport\?\.addEventListener\("resize", scheduleUpdate\)/u);
  assert.match(itemSource, /viewport\?\.addEventListener\("scroll", scheduleUpdate\)/u);
  assert.doesNotMatch(itemSource, /absolute bottom-full left-1\/2/u);
});
