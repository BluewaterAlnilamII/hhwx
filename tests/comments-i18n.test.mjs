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

test("comment composer placeholders identify the posting account", () => {
  const zh = readJson("../messages/zh-CN/comments.json");
  const en = readJson("../messages/en/comments.json");

  assert.equal(zh.composer.rootPlaceholder, "以 {username} 发布主评论...");
  assert.equal(zh.composer.replyPlaceholder, "以 {username} 发布回复...");
  assert.equal(en.composer.rootPlaceholder, "Post a main comment as {username}...");
  assert.equal(en.composer.replyPlaceholder, "Post a reply as {username}...");
});

test("event and card comment panels share generic copy while events retain the cutoff benefit", () => {
  const zh = readJson("../messages/zh-CN/bandori.json");
  const en = readJson("../messages/en/bandori.json");

  assert.equal(zh.events.comments.title, "评论");
  assert.equal(zh.cards.comments.title, "评论");
  assert.equal(zh.events.comments.emptyMessage, "还没有评论，来个面包吗？");
  assert.equal(zh.cards.comments.emptyMessage, "还没有评论，来个面包吗？");
  assert.equal(zh.cards.comments.signedOutMessage, "登录后可以发表评论");
  assert.equal(
    zh.events.comments.signedOutMessage,
    "登录后可以发表评论，并启用每 30 秒更新的高频活动榜线",
  );
  assert.equal(en.events.comments.title, "Comments");
  assert.equal(en.cards.comments.title, "Comments");
  assert.equal(en.events.comments.emptyMessage, "No comments yet, anyone for bread?");
  assert.equal(en.cards.comments.emptyMessage, "No comments yet, anyone for bread?");
  assert.equal(en.cards.comments.signedOutMessage, "Sign in to comment");
  assert.equal(
    en.events.comments.signedOutMessage,
    "Sign in to comment and enable high-frequency event cutoff updates every 30 seconds",
  );
});

test("shared comment UI reads copy from the comments namespace", () => {
  const paths = [
    "../src/components/comments/CommentComposer.tsx",
    "../src/components/comments/CommentContent.tsx",
    "../src/components/comments/CommentItem.tsx",
    "../src/components/comments/CommentReactionsDialog.tsx",
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
