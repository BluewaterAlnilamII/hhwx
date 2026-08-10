import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
}

function collectMessages(value, prefix = "", result = new Map()) {
  if (typeof value === "string") {
    result.set(prefix, value);
    return result;
  }

  for (const key of Object.keys(value).sort()) {
    collectMessages(value[key], prefix ? `${prefix}.${key}` : key, result);
  }
  return result;
}

function placeholders(message) {
  return [...message.matchAll(/\{\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:,|\})/gu)]
    .map((match) => match[1])
    .sort();
}

test("comment locale catalogs keep identical keys and ICU placeholders", () => {
  const zh = collectMessages(readJson("../messages/zh-CN/comments.json"));
  const en = collectMessages(readJson("../messages/en/comments.json"));

  assert.deepEqual([...en.keys()], [...zh.keys()]);
  for (const [key, message] of zh) {
    assert.deepEqual(placeholders(en.get(key)), placeholders(message), key);
  }
});

test("shared comment UI reads copy from the comments namespace", () => {
  const paths = [
    "../src/components/comments/CommentComposer.tsx",
    "../src/components/comments/CommentContent.tsx",
    "../src/components/comments/CommentItem.tsx",
    "../src/components/comments/CommentThread.tsx",
    "../src/components/comments/EmojiPickerButton.tsx",
    "../src/components/comments/StampPickerButton.tsx",
    "../src/hooks/useCommentThread.ts",
  ];

  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /useTranslations\("comments"\)/u, path);
    assert.doesNotMatch(source, /[\u3400-\u9fff]/u, path);
  }
});
