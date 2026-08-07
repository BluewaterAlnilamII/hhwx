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
  assert.match(picker, /useBandoriCardsAssetIndex\(\)[\s\S]*useBandoriCharactersMaster/u);
  assert.match(picker, /useBandoriSkillsMaster/u);
});

test("avatar, comments, profiles, picker, and team builder stay on the shared index-backed renderers", async () => {
  const consumerPaths = [
    "src/components/Toolbar.tsx",
    "src/app/[locale]/account/AccountAvatarCardControl.tsx",
    "src/app/[locale]/bandori/eventtracker/CommentItem.tsx",
    "src/app/[locale]/bandori/game-profiles/[profileId]/cards/page.tsx",
    "src/components/bandori/GameProfileCardEditorDialog.tsx",
    "src/components/bandori/card-picker/BandoriCardThumbnailTile.tsx",
    "src/components/bandori/BandoriCardTile.tsx",
    "src/app/[locale]/bandori/teambuilder/page.tsx",
  ];
  const sources = await Promise.all(consumerPaths.map(readSource));

  for (const source of sources) {
    assert.match(
      source,
      /AccountCardAvatar|BandoriCardThumbnail|SharedBandoriCardThumbnail|BandoriCardTile|useBandoriCardsAssetIndex/u,
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

test("server-side Music metadata and charts read the public bucket directly instead of its CDN", async () => {
  const musicAssets = await readSource("src/lib/bandori-music-assets.ts");
  const indexReader = await readSource("src/lib/bandori-public-asset-index-server.ts");
  const chartRoute = await readSource("src/app/api/bandori/charts/[songId]/[difficulty]/route.ts");

  assert.match(musicAssets, /fetchBandoriPublicAssetIndexJson/u);
  assert.doesNotMatch(musicAssets, /fetch\(url/u);
  assert.match(indexReader, /fetchR2Object/u);
  assert.match(indexReader, /BANDORI_PUBLIC_R2_BUCKET/u);
  assert.doesNotMatch(indexReader, /BANDORI_ASSET_R2_|BANDORI_MASTER_R2_|BANDORI_R2_BUCKET/u);
  assert.doesNotMatch(indexReader, /BANDORI_ASSET_CDN_BASE_URL|cdn\.hhwx\.org/u);
  assert.match(chartRoute, /lookupBandoriMusicChart/u);
  assert.match(chartRoute, /fetchBandoriPublicAssetJson/u);
  assert.match(chartRoute, /chart\.key/u);
  assert.match(chartRoute, /chart\.sha256/u);
  assert.doesNotMatch(chartRoute, /getBandoriMusicCdnBaseUrl|fetch\(url/u);
  assert.doesNotMatch(
    chartRoute,
    /BANDORI_CHART_SOURCE|BANDORI_CHART_BESTDORI_FALLBACK|fetchBestdoriChart|falling back to Bestdori/u,
  );
  assert.doesNotMatch(chartRoute, /\?sha=/u);
});

test("chart and master sources are fixed first-party R2 contracts across all four servers", async () => {
  const envExample = await readSource(".env.example");
  const masterApi = await readSource("src/lib/bandori-master-api.ts");
  const masterArtifacts = await readSource("src/lib/bandori-master-artifacts.ts");
  const publicAssetReader = await readSource("src/lib/bandori-public-asset-index-server.ts");
  const snapshotReader = await readSource("src/lib/bandori-snapshot-api-server.ts");
  const historyReader = await readSource("src/lib/bandori-cutoff-history-server.ts");
  const comparisonScript = await readSource("scripts/compare-bandori-tracker-history.mjs");

  assert.match(
    masterArtifacts,
    /BANDORI_MASTER_ARTIFACT_SERVERS = \["jp", "en", "tw", "cn"\] as const/u,
  );
  assert.match(masterArtifacts, /BANDORI_MASTER_ARTIFACT_PREFIX = "bandori\/master"/u);
  assert.match(masterArtifacts, /fetchR2Object/u);
  assert.doesNotMatch(masterArtifacts, /createServerSupabaseClient|fetch\(url|PUBLIC_ORIGIN/u);
  assert.doesNotMatch(masterApi, /process\.env|shouldUseArtifacts|fetchBestdori/u);
  assert.match(masterApi, /missing for servers/u);

  for (const source of [
    envExample,
    masterArtifacts,
    publicAssetReader,
    snapshotReader,
    historyReader,
    comparisonScript,
  ]) {
    assert.doesNotMatch(source, /BANDORI_R2_ACCOUNT_ID/u);
  }
  for (const source of [
    masterArtifacts,
    publicAssetReader,
    snapshotReader,
    historyReader,
    comparisonScript,
  ]) {
    assert.match(source, /BANDORI_R2_ENDPOINT/u);
  }

  for (const removedName of [
    "NEXT_PUBLIC_VERCEL_URL",
    "BANDORI_CHART_SOURCE",
    "BANDORI_MUSIC_CDN_BASE_URL",
    "BANDORI_MASTER_SOURCE",
    "BANDORI_MASTER_ARTIFACT_READ_MODE",
    "BANDORI_MASTER_ARTIFACT_SERVERS",
    "BANDORI_MASTER_ARTIFACT_SERVER",
    "BANDORI_MASTER_ARTIFACT_PUBLIC_ORIGIN",
    "BANDORI_MASTER_ARTIFACT_BASE_URL",
    "BANDORI_MASTER_ARTIFACT_MANIFEST_URL",
    "BANDORI_MASTER_ACTIVE_SOURCE",
  ]) {
    assert.doesNotMatch(envExample, new RegExp(`^${removedName}=`, "mu"));
  }
});
