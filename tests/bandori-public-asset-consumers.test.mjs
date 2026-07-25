import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("card image consumers use index descriptors and never substitute full art", async () => {
  const artImage = await readSource("src/components/bandori/card-picker/BandoriCardArtImage.tsx");
  const thumbnail = await readSource("src/components/bandori/BandoriCardThumbnail.tsx");
  const picker = await readSource("src/components/bandori/card-picker/BandoriCardPicker.tsx");

  for (const source of [artImage, thumbnail]) {
    assert.match(source, /lookupBandoriCardImage/u);
    assert.match(source, /"thumb"/u);
    assert.doesNotMatch(source, /buildBandoriCardThumbnailPublicUrl|buildBandoriCardResourceSetPublicUrl/u);
    assert.doesNotMatch(source, /lookupBandoriCardImage\([^)]*"full"/su);
  }
  assert.match(picker, /useBandoriCardsAssetIndex\(\)[\s\S]*useCachedFetch\(/u);
});

test("avatar, comments, profiles, picker, and team builder stay on the shared index-backed renderers", async () => {
  const consumerPaths = [
    "src/components/Toolbar.tsx",
    "src/app/[locale]/account/AccountAvatarCardControl.tsx",
    "src/app/[locale]/bandori/eventtracker/CommentItem.tsx",
    "src/app/[locale]/bandori/game-profiles/[profileId]/cards/page.tsx",
    "src/components/bandori/GameProfileCardEditorDialog.tsx",
    "src/components/bandori/card-picker/BandoriCardThumbnailTile.tsx",
    "src/app/[locale]/bandori/teambuilder/TeamBuilderPreferenceCardTile.tsx",
    "src/app/[locale]/bandori/teambuilder/page.tsx",
  ];
  const sources = await Promise.all(consumerPaths.map(readSource));

  for (const source of sources) {
    assert.match(
      source,
      /AccountCardAvatar|BandoriCardThumbnail|SharedBandoriCardThumbnail|useBandoriCardsAssetIndex/u,
    );
    assert.doesNotMatch(
      source,
      /buildBandoriCardThumbnailPublicUrl|buildBandoriCardResourceSetPublicUrl|bestdori\.com\/assets/iu,
    );
  }
});

test("event banners use their exact index slot without bundle or proxy fallback", async () => {
  const tracker = await readSource("src/app/[locale]/bandori/eventtracker/page.tsx");
  const teamBuilder = await readSource("src/app/[locale]/bandori/teambuilder/page.tsx");

  for (const source of [tracker, teamBuilder]) {
    assert.match(source, /useBandoriEventsAssetIndex/u);
    assert.match(source, /lookupBandoriEventBanner/u);
    assert.doesNotMatch(source, /buildBandoriEventBannerPublicUrl|resolveBandoriEventBannerBundleName/u);
  }
  assert.doesNotMatch(tracker, /useBandoriCardsAssetIndex/u);
});

test("Cards, Events, and Stamps master routes remain data-only and do not read public indexes", async () => {
  const masterRoute = await readSource("src/app/api/bandori/master/[dataset]/route.ts");
  const cardDetailRoute = await readSource("src/app/api/bandori/master/cards/[cardId]/route.ts");
  const eventDetailRoute = await readSource("src/app/api/bandori/master/events/[eventId]/route.ts");

  for (const source of [masterRoute, cardDetailRoute, eventDetailRoute]) {
    assert.doesNotMatch(
      source,
      /bandori\/cards\/index\.json|bandori\/events\/index\.json|bandori\/stamps\/index\.json|bandori-public-asset-index/u,
    );
  }
});

test("Stamps consumers join the private master response with the public hash index in browsers", async () => {
  const hook = await readSource("src/hooks/useCommentStamps.ts");
  const stampAssets = await readSource("src/lib/bandori-stamp-assets.ts");

  assert.match(hook, /buildBandoriStampMasterApiUrl/u);
  assert.match(hook, /useBandoriStampsAssetIndex/u);
  assert.match(stampAssets, /buildBandoriPublicAssetUrl/u);
  assert.doesNotMatch(hook, /\/api\/bandori\/stamps/u);
  assert.doesNotMatch(hook, /getCommentStampsForRegion/u);
  assert.doesNotMatch(stampAssets, /imageUrl:\s*BandoriStampStringSlots/u);
  assert.doesNotMatch(stampAssets, /bandori\/stamps\/\$\{region\}\/\$\{stampId\}/u);
  await assert.rejects(
    readSource("src/app/api/bandori/stamps/route.ts"),
    /ENOENT/u,
  );
  await assert.rejects(
    readSource("src/lib/bandori-stamp-assets-server.ts"),
    /ENOENT/u,
  );
});

test("public index failure stays isolated from master loading and calculations", async () => {
  const tracker = await readSource("src/app/[locale]/bandori/eventtracker/page.tsx");
  const teamBuilder = await readSource("src/app/[locale]/bandori/teambuilder/page.tsx");
  const artImage = await readSource("src/components/bandori/card-picker/BandoriCardArtImage.tsx");

  assert.match(tracker, /buildBandoriPublicAssetUrl\([\s\S]*\) \?\? ""/u);
  assert.match(teamBuilder, /buildBandoriPublicAssetUrl\([\s\S]*\) \?\? ""/u);
  assert.match(artImage, /if \(!src \|\| failed\)/u);
  assert.doesNotMatch(teamBuilder, /loading\s*\|\|[^;\n]*eventAsset/u);
});
