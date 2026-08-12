import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const PICKER_PATHS = [
  "../src/components/comments/EmojiPickerButton.tsx",
  "../src/components/comments/StampPickerButton.tsx",
];

test("comment picker popovers expose their controlled dialog relationship", () => {
  for (const path of PICKER_PATHS) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");

    assert.match(source, /const popoverId = useId\(\)/u, path);
    assert.match(source, /aria-haspopup="dialog"/u, path);
    assert.match(source, /aria-controls=\{popoverId\}/u, path);
    assert.match(source, /aria-expanded=\{open\}/u, path);
    assert.match(source, /id=\{popoverId\}[\s\S]*role="dialog"[\s\S]*aria-label=\{pickerLabel\}/u, path);
  }
});

test("comment picker popovers close on Escape and restore trigger focus", () => {
  for (const path of PICKER_PATHS) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");

    assert.match(source, /if \(event\.key !== "Escape"\) return;[\s\S]*event\.preventDefault\(\);[\s\S]*onOpenChange\(false\);[\s\S]*buttonRef\.current\?\.focus\(\)/u, path);
    assert.match(source, /document\.addEventListener\("keydown", handleKeyDown\)/u, path);
    assert.match(source, /document\.removeEventListener\("keydown", handleKeyDown\)/u, path);
  }
});
