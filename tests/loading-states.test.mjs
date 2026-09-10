import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToReadableStream, renderToString } from "react-dom/server";
import { useCachedFetch, updateFetchCache } from "../src/hooks/useCachedFetch.ts";
import avatarModule from "../src/components/account/AccountCardAvatar.tsx";
import loadingModule from "../src/components/LoadingIndicator.tsx";
import imageModule from "../src/components/LoadingImage.tsx";
import switcherModule from "../src/app/[locale]/bandori/BandoriEventSwitcher.tsx";
import { Top10PlayerList } from "../src/app/[locale]/bandori/events/_tracker/Top10PlayerList.tsx";
import pickerModule from "../src/components/bandori/card-picker/BandoriCardPicker.tsx";
import { BandoriFullCardArt } from "../src/app/[locale]/bandori/cards/[cardId]/_components/BandoriFullCardArt.tsx";
import relatedMediaModule from "../src/app/[locale]/bandori/cards/[cardId]/_components/BandoriCardRelatedMedia.tsx";
import eventInfoModule from "../src/app/[locale]/bandori/events/_info/EventInfoPanel.tsx";

const AccountCardAvatar = avatarModule.default ?? avatarModule;
const LoadingIndicator = loadingModule.default ?? loadingModule;
const LoadingImage = imageModule.default ?? imageModule;
const BandoriEventSwitcher = switcherModule.default ?? switcherModule;
const BandoriCardPicker = pickerModule.default ?? pickerModule;
const BandoriCardRelatedMedia = relatedMediaModule.default ?? relatedMediaModule;
const EventInfoPanel = eventInfoModule.default ?? eventInfoModule;
const { NextIntlClientProvider } = createRequire(import.meta.url)("next-intl");
const require = createRequire(import.meta.url);
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "loading-test-key";
process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = "https://assets.example.invalid";
const commentsModule = await import("../src/app/[locale]/bandori/events/EventComments.tsx");
const EventComments = commentsModule.default.default ?? commentsModule.default;
const messages = Object.fromEntries(["bandori", "common", "comments", "navigation"].map((namespace) => (
  [namespace, require(`../messages/en/${namespace}.json`)]
)));
const renderLocalized = (component, props) => renderToString(createElement(NextIntlClientProvider,
  { locale: "en", timeZone: "UTC", messages }, createElement(component, props)));

test("unloaded images request the target source while showing an accessible placeholder", () => {
  for (const src of ["/cn.png", "/tw.png"]) {
    const html = renderToString(createElement(LoadingImage, {
      src, alt: "Event banner", loadingLabel: "Loading image", className: "object-cover",
    }));
    assert.ok(html.includes(`src="${src}"`));
    assert.match(html, /class="object-cover opacity-0"/u);
    assert.match(html, /aria-busy="true"/u);
    assert.match(html, /aria-label="Loading image"/u);
  }
});

test("block and compact loading announce their label and hide the decorative spinner", () => {
  for (const compact of [false, true]) {
    const html = renderToString(createElement(LoadingIndicator, { label: "Loading catalog", compact }));
    assert.match(html, /role="status"/u);
    assert.match(html, /aria-busy="true"/u);
    assert.match(html, /aria-hidden="true"/u);
    assert.match(html, />Loading catalog</u);
  }
});

test("full card metadata loading and a resolved missing image have distinct feedback", () => {
  const props = {
    metadata: { cardId: 3, resourceSetName: "res001003", rarity: 3, attribute: "happy", bandId: 1 },
    assetIndex: null,
    item: { variant: "normal", isTrained: false, label: "Before training", alt: "Card art" },
    loadingLabel: "Loading card art", onOpen() {},
  };
  const pending = renderLocalized(BandoriFullCardArt, { ...props, assetIndexLoading: true });
  assert.match(pending, /aria-busy="true"/u);
  assert.match(pending, /aria-label="Loading card art"/u);
  assert.doesNotMatch(pending, /Image unavailable/u);
  const missing = renderLocalized(BandoriFullCardArt, { ...props, assetIndexLoading: false });
  assert.match(missing, /Image unavailable/u);
  assert.doesNotMatch(missing, /aria-busy/u);
});

test("related media announces pending SD assets and streamed costume details without unavailable feedback", () => {
  const html = renderLocalized(BandoriCardRelatedMedia, {
    resourceSetName: "res001003", artItems: [], sdResourceName: "sd-a",
    costumeId: 1, costumeResult: new Promise(() => {}), selectedServer: 0,
  });
  const sd = html.match(/<figure[^>]*data-card-sd-resource="sd-a"[^>]*>(.*?)<\/figure>/su)?.[1];
  assert.ok(sd);
  assert.match(sd, /aria-busy="true"/u);
  assert.ok(sd.includes(messages.bandori.cards.detail.mediaLoading));
  assert.ok(!sd.includes(messages.common.states.imageUnavailable));
  assert.match(html, /role="status" aria-busy="true"[^>]*>.*?aria-hidden="true"/su);
  assert.ok(html.includes(messages.bandori.cards.detail.costumeLoading));
});

test("failed costume information stays readable without a page refresh control", async () => {
  const stream = await renderToReadableStream(createElement(NextIntlClientProvider,
    { locale: "en", timeZone: "UTC", messages }, createElement(BandoriCardRelatedMedia, {
      resourceSetName: "res001003", artItems: [], costumeId: 1, selectedServer: 0,
      costumeResult: Promise.resolve({ costume: null, costumeLoadFailed: true }),
    })));
  await stream.allReady;
  const html = await new Response(stream).text();
  assert.ok(html.includes(messages.bandori.cards.detail.costumeLoadFailed));
  assert.doesNotMatch(html, /<button/u);
});

test("first render distinguishes pending requests, disabled requests, and cached empty responses", () => {
  function Probe({ cacheKey, url }) {
    const result = useCachedFetch(cacheKey, url);
    return createElement("script", { type: "application/json" }, JSON.stringify(result));
  }
  const render = (cacheKey, url = "/api/test") => {
    const html = renderToString(createElement(Probe, { cacheKey, url }));
    return JSON.parse(html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>")));
  };
  assert.equal(render("loading-test-cold").loading, true);
  assert.equal(render(null).loading, false);
  assert.equal(render("loading-test-cold", null).loading, false);
  for (const value of [null, [], {}, 0]) {
    updateFetchCache("loading-test-warm", () => value);
    const cached = render("loading-test-warm");
    assert.equal(cached.loading, false);
    assert.deepEqual(cached.data, value);
  }
  assert.equal(render("loading-test-other").loading, true);
});

test("avatar waits for identity and card metadata without showing a username or substitute card", () => {
  const messages = { common: { states: { imageUnavailable: "Image unavailable" } }, bandori: { cards: { common: { imageLoading: "Loading image" } } } };
  const render = (props) => renderToString(createElement(NextIntlClientProvider,
    { locale: "en", timeZone: "UTC", messages }, createElement(AccountCardAvatar, { username: "Bluewater", ...props })));
  for (const props of [{ pending: true }, { cardId: 3 }, { cardId: 1, pending: true }]) {
    const html = render(props);
    assert.match(html, /aria-busy="true"/u);
    assert.doesNotMatch(html, /<img|data-card-id|Bluewater|from-sky-400|to-indigo-500/u);
  }
  const missing = render({ cardId: null });
  assert.match(missing, /Image unavailable/u);
  assert.doesNotMatch(missing, /aria-busy|Bluewater|<img/u);
});

test("event banners share one unavailable state without individual retry buttons", () => {
  const render = (props) => renderLocalized(BandoriEventSwitcher, {
    title: "Event", events: [{ id: 302, name: "Event", startAt: null, endAt: null }],
    selectedEventId: "302", onSelectedEventIdChange() {}, ...props,
  });
  assert.match(render({ bannerLoading: true }), /aria-busy="true"/u);
  const failed = render({ bannerError: new Error("Index unavailable") });
  assert.ok(failed.includes(messages.common.states.imageUnavailable));
  assert.doesNotMatch(failed, />Retry<\/button>/u);
  assert.doesNotMatch(failed, /aria-busy/u);
  const unavailable = render({});
  assert.ok(unavailable.includes(messages.common.states.imageUnavailable));
  assert.doesNotMatch(unavailable, /aria-busy|>Retry</u);
  const cached = render({ bannerUrl: "/event.png", bannerError: new Error("Refresh failed") });
  assert.match(cached, /src="\/event.png"/u);
  assert.ok(!cached.includes(messages.common.states.loadFailed));
  assert.doesNotMatch(cached, />Retry</u);
});

test("event information waits for required metadata as one panel instead of showing half an overview", () => {
  const props = {
    eventId: 302, server: 0, eventRecord: { eventName: ["Test event"], eventType: "story" },
    musicMaster: {}, loading: false, error: null, onRetry() {},
    musicLoading: false, musicError: null, onRetryMusic() {},
  };
  const pending = renderLocalized(EventInfoPanel, props);
  assert.equal((pending.match(/aria-busy="true"/gu) ?? []).length, 1);
  assert.ok(pending.includes(messages.bandori.events.info.loading));
  assert.ok(!pending.includes(messages.bandori.events.info.overviewTitle));
});

test("TOP10 keeps player scores but waits for metadata before rendering an avatar frame", () => {
  const player = { uid: 101, position: 1, name: "Audit Player", score: 150, avatarCardId: 3, isAvatarTrained: true };
  const html = renderLocalized(Top10PlayerList, { players: [player], server: 2 });
  assert.match(html, /Audit Player/u);
  assert.match(html, />150</u);
  assert.match(html, /aria-busy="true"/u);
  assert.doesNotMatch(html, /bandori-card-thumbnail|data-card-id/u);
  assert.ok(!html.includes(messages.common.states.imageUnavailable));
  const noAvatar = renderLocalized(Top10PlayerList, { players: [{ ...player, avatarCardId: 0 }], server: 2 });
  assert.ok(noAvatar.includes(messages.common.states.imageUnavailable));
  assert.doesNotMatch(noAvatar, /aria-busy|<button/u);
});

test("event comments wait for their target instead of rendering a false zero count and empty thread", () => {
  for (const eventId of [null, 302]) {
    const pending = renderLocalized(EventComments, { eventId, server: 3, loading: true });
    assert.match(pending, /aria-busy="true"/u);
    assert.doesNotMatch(pending, /\(0\)|<textarea/u);
    assert.ok(!pending.includes(messages.bandori.events.comments.emptyMessage));
  }
  assert.equal(renderLocalized(EventComments, { eventId: null, server: 3 }), "");
});

test("card pickers wait for all metadata and the asset index before showing filters or empty results", () => {
  for (const props of [{}, { cardMetadata: {} }, { cardMetadata: {}, characters: {}, skills: {} }]) {
    const html = renderLocalized(BandoriCardPicker, { value: null, onValueChange() {}, ...props });
    assert.match(html, /role="status"/u);
    assert.match(html, /aria-busy="true"/u);
    assert.ok(html.includes(messages.bandori.cardPicker.states.loadingCards));
    assert.ok(!html.includes(messages.bandori.cardPicker.states.empty));
    assert.doesNotMatch(html, /<input|aria-pressed|data-card-id/u);
  }
});
