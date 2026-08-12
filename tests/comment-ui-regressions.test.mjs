import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
