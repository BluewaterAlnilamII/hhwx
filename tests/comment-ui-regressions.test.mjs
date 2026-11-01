import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CommentContent } from "../src/components/comments/CommentContent.tsx";
import { ChatMessageText } from "../src/components/chat/ChatMessageText.tsx";

import { getCommentPopoverHorizontalPosition, getCommentPopoverVerticalPosition } from "../src/lib/comments/comment-popover-position.ts";

const require = createRequire(import.meta.url);
const { NextIntlClientProvider } = require("next-intl");
const messages = { comments: require("../messages/en/comments.json"), common: require("../messages/en/common.json") };
const renderContent = (component, props) => renderToStaticMarkup(createElement(NextIntlClientProvider,
  { locale: "en", timeZone: "UTC", messages }, createElement(component, props)));

test("comment links preserve URL contents and leave surrounding punctuation outside", () => {
  for (const [content, href, label, suffix] of [
    ["详情：https://example.com/path?q=a&lang=zh#section。", "https://example.com/path?q=a&amp;lang=zh#section", "https://example.com/path?q=a&amp;lang=zh#section", "。"],
    ["(https://example.com/a_(b)).", "https://example.com/a_(b)", "https://example.com/a_(b)", ")."],
    ["https://[::1]/page]", "https://[::1]/page", "https://[::1]/page", "]"],
    ["HTTPS://EXAMPLE.COM/", "https://example.com/", "HTTPS://EXAMPLE.COM/", ""],
    ["https://example.com/:Tae:", "https://example.com/:Tae:", "https://example.com/:Tae:", ""],
    ["https://en.wikipedia.org/wiki/Don't_Look_Up", "https://en.wikipedia.org/wiki/Don&#x27;t_Look_Up", "https://en.wikipedia.org/wiki/Don&#x27;t_Look_Up", ""],
    ["'https://example.com/Don't_Look_Up'.", "https://example.com/Don&#x27;t_Look_Up", "https://example.com/Don&#x27;t_Look_Up", "&#x27;."],
    ['"https://example.com/Don\'t_Look_Up"', "https://example.com/Don&#x27;t_Look_Up", "https://example.com/Don&#x27;t_Look_Up", "&quot;"],
  ]) {
    const html = renderContent(CommentContent, { content, isDeleted: false });
    assert.ok(html.includes(`href="${href}"`), html);
    assert.ok(html.includes(`>${label}</a>${suffix}`), html);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/u);
  }
});

test("comment links keep user markup inert and preserve emoji rendering", () => {
  const html = renderContent(CommentContent, {
    content: '<script>alert(1)</script> javascript:alert(1) data:text/html,test https:// :Tae: https://example.com/:Tae:', isDeleted: false,
  });
  assert.doesNotMatch(html, /<script\b/u);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.equal([...html.matchAll(/<a\b/g)].length, 1);
  assert.equal([...html.matchAll(/alt=":Tae:"/g)].length, 1);
  assert.doesNotMatch(renderContent(CommentContent, { content: "https://example.com", isDeleted: true }), /<a\b/u);
});

test("comments and chat share Unicode URL boundaries without changing visible text", () => {
  const cases = [
    ["https://ja.wikipedia.org/wiki/【推しの子】", "https://ja.wikipedia.org/wiki/【推しの子】"],
    ["https://example.com/歌曲（现场版）?lang=zh", "https://example.com/歌曲（现场版）?lang=zh"],
    ["https://例子.中国/页面?q=你好", "https://例子.中国/页面?q=你好"],
    ["https://example.com/a_(b_(c))", "https://example.com/a_(b_(c))"],
    ["访问 https://example.com/path，然后继续。", "https://example.com/path"],
    ["'https://example.com/Don't_Look_Up'.", "https://example.com/Don't_Look_Up"],
    ["HTTPS://EXAMPLE.COM/", "HTTPS://EXAMPLE.COM/"],
    ["http://localhost:3000/path", "http://localhost:3000/path"],
    ["https://127.0.0.1:8080/path", "https://127.0.0.1:8080/path"],
    ["https://[::1]/page]", "https://[::1]/page"],
    ["https://example.com/?q=a%20b&url=https%3A%2F%2Fx.test%2F#section", "https://example.com/?q=a%20b&url=https%3A%2F%2Fx.test%2F#section"],
  ];
  for (const [open, close] of ["（）", "［］", "｛｝", "｟｠", "｢｣", "〈〉", "《》", "「」", "『』", "【】", "〔〕", "〖〗", "〘〙", "〚〛"]) {
    const url = `https://example.com/${open}作品${close}?lang=zh`;
    cases.push([url, url], [`${open}https://example.com/path${close}`, "https://example.com/path"]);
  }
  for (const [content, expected] of cases) {
    const href = renderToStaticMarkup(createElement("a", { href: new URL(expected).href }, expected)).match(/href="([^"]+)"/u)[1];
    const visibleText = renderToStaticMarkup(createElement("span", null, content)).slice(6, -7);
    for (const [component, props] of [[CommentContent, { isDeleted: false }], [CommentContent, { isDeleted: false, inline: true }], [ChatMessageText, {}]]) {
      const html = renderContent(component, { ...props, content });
      assert.deepEqual([...html.matchAll(/href="([^"]+)"/gu)].map(match => match[1]), [href], content);
      assert.equal(html.replace(/<[^>]+>/gu, ""), visibleText, content);
    }
  }
});

test("URL spans take precedence over shortcodes while adjacent emoji remain intact", () => {
  const url = "https://example.com/:Tae:/:stamp-jp-1:?x=1#part";
  for (const [component, props] of [[CommentContent, { isDeleted: false }], [ChatMessageText, {}]]) {
    const html = renderContent(component, { ...props, content: `:Tae: ${url} :Tae: https://example.com/path :Tae:` });
    assert.equal([...html.matchAll(/<a\b/gu)].length, 2);
    assert.equal([...html.matchAll(/alt=":Tae:"/gu)].length, 3);
    assert.ok(html.includes(`>${url}</a>`), html);
  }
});

test("automatic links require explicit HTTP(S) and browser-valid addresses", () => {
  for (const content of ["www.example.com a@example.com ftp://example.com //example.com", "javascript:alert(1) data:text/html,test file:///tmp/test", "https:// http://99999999999/", "https://example.com/"]) {
    const html = renderContent(CommentContent, { content, isDeleted: false });
    assert.equal([...html.matchAll(/<a\b/gu)].length, content === "https://example.com/" ? 1 : 0, content);
  }
});

test("chat mentions share comment links while draft text stays editable plain text", () => {
  const url = "https://example.com/【Don't_Look_Up】（现场版）";
  const props = { content: `@Alice ${url} :Tae:`, mentions: [{ userId: "alice", start: 0, end: 6 }] };
  const html = renderContent(ChatMessageText, props);
  assert.match(html, /data-chat-mention[^>]*>@Alice<\/span>/u);
  assert.ok(html.includes(`href="${new URL(url).href.replaceAll("'", "&#x27;")}"`), html);
  assert.match(html, /alt=":Tae:"/u);
  const draft = renderContent(ChatMessageText, { ...props, draft: true });
  assert.doesNotMatch(draft, /<a\b|<img\b/u);
  assert.ok(draft.includes(url.replaceAll("'", "&#x27;") + " :Tae:"));
});

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

test("comment timestamps use the browser local time zone", () => {
  assert.match(itemSource, /useLocale\(\)/u);
  assert.match(itemSource, /new Intl\.DateTimeFormat\(locale, \{/u);
  assert.match(itemSource, /localDateTimeFormatter\.format\(new Date\(comment\.createdAt\)\)/u);
  assert.doesNotMatch(itemSource, /useFormatter\(\)/u);
  assert.doesNotMatch(itemSource, /timeZone:/u);
});

test("comment Degrees use the compact 92 by 20 layout without growing the avatar row", () => {
  assert.match(threadSource, /useBandoriDegreeCatalog\(comments\.length > 0\)/u);
  assert.doesNotMatch(itemSource, /useBandoriDegreeCatalog/u);
  assert.match(itemSource, /flex min-h-11 min-w-0 flex-col items-start justify-center/u);
  assert.match(itemSource, /data-comment-display-degree className="mt-\[3px\] h-5 w-\[92px\] shrink-0"/u);
  assert.match(
    itemSource,
    /<BandoriDegreeView[\s\S]*?degree=\{displayDegree\}[\s\S]*?degreeEffectId=\{comment\.displayDegree\.degreeEffectId\}[\s\S]*?size="comment"/u,
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
  const chipSource = readFileSync(new URL("../src/components/comments/CommentReactionChip.tsx", import.meta.url), "utf8");
  assert.match(chipSource, /relative inline-flex select-none \[-webkit-touch-callout:none\]/u);

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

  assert.match(chipSource, /getCommentPopoverHorizontalPosition\(\{/u);
  assert.match(chipSource, /viewport\?\.offsetLeft \?\? 0/u);
  assert.match(chipSource, /viewport\?\.width \?\? window\.innerWidth/u);
  assert.match(chipSource, /window\.addEventListener\("scroll", scheduleUpdate, true\)/u);
  assert.match(chipSource, /viewport\?\.addEventListener\("resize", scheduleUpdate\)/u);
  assert.match(chipSource, /viewport\?\.addEventListener\("scroll", scheduleUpdate\)/u);
  assert.doesNotMatch(chipSource, /absolute bottom-full left-1\/2/u);
});

test("reaction previews prefer above with no gap, flip only when needed, and constrain tall lists", () => {
  const cases = [
    { top: 400, bottom: 428, tooltipHeight: 200, viewportHeight: 800, expectedTop: 200, expectedMaxHeight: 384 },
    { top: 230, bottom: 258, tooltipHeight: 200, viewportHeight: 800, expectedTop: 30, expectedMaxHeight: 214 },
    { top: 80, bottom: 108, tooltipHeight: 200, viewportHeight: 800, expectedTop: 108, expectedMaxHeight: 676 },
    { top: 720, bottom: 748, tooltipHeight: 200, viewportHeight: 800, expectedTop: 520, expectedMaxHeight: 704 },
    { top: 260, bottom: 288, tooltipHeight: 350, viewportHeight: 400, expectedTop: 16, expectedMaxHeight: 244 },
    { top: 100, bottom: 128, tooltipHeight: 350, viewportHeight: 400, expectedTop: 128, expectedMaxHeight: 256 },
    { top: 240, bottom: 272, tooltipHeight: 200, viewportTop: 40, viewportHeight: 360, expectedTop: 56, expectedMaxHeight: 184 },
  ];

  for (const { top, bottom, tooltipHeight, viewportTop = 0, viewportHeight, expectedTop, expectedMaxHeight } of cases) {
    const result = getCommentPopoverVerticalPosition({
      anchorRect: { top, bottom }, tooltipHeight, viewportTop, viewportHeight,
    });
    assert.deepEqual(result, { top: expectedTop, maxHeight: expectedMaxHeight });
    const height = Math.min(tooltipHeight, result.maxHeight);
    assert.ok(result.top >= viewportTop + 16);
    assert.ok(result.top + height <= viewportTop + viewportHeight - 16);
    assert.ok(result.top === bottom || result.top + height === top, "preview touches its anchor");
  }
});
