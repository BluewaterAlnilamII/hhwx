import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { toNormalizedCards } from "../src/lib/user-game-profiles-server.ts";

const serverSource = fs.readFileSync(
  new URL("../src/lib/user-game-profiles-server.ts", import.meta.url),
  "utf8",
);
const migrationSource = fs.readFileSync(
  new URL("../supabase/migrations/20260801185414_accept_manual_profile_server.sql", import.meta.url),
  "utf8",
);
const cardPageSource = fs.readFileSync(
  new URL("../src/app/[locale]/bandori/game-profiles/[profileId]/cards/page.tsx", import.meta.url),
  "utf8",
);
const cardThumbnailSource = fs.readFileSync(
  new URL("../src/components/bandori/BandoriCardThumbnail.tsx", import.meta.url),
  "utf8",
);
const cardAssetIndexSource = fs.readFileSync(
  new URL("../src/lib/bandori-public-asset-index.ts", import.meta.url),
  "utf8",
);
const regionalNamesSource = fs.readFileSync(
  new URL("../src/lib/bestdori-regional-names.ts", import.meta.url),
  "utf8",
);
const zhMessages = JSON.parse(fs.readFileSync(
  new URL("../messages/zh-CN/bandori.json", import.meta.url),
  "utf8",
));
const enMessages = JSON.parse(fs.readFileSync(
  new URL("../messages/en/bandori.json", import.meta.url),
  "utf8",
));

test("auto profile card episode inference uses current card master metadata", () => {
  const cards = toNormalizedCards([
    {
      situation_id: 2345,
      training_status: "done",
      append_parameter: { performance: 300, technique: 300, visual: 300 },
    },
    {
      situation_id: 999_997,
      training_status: "done",
      append_parameter: { performance: 500, technique: 500, visual: 500 },
    },
    {
      situation_id: 999_998,
      append_parameter: { performance: 300, technique: 300, visual: 300 },
    },
    {
      situation_id: 999_999,
      training_status: "done",
      append_parameter: { performance: 300, technique: 300, visual: 300 },
    },
  ], {
    "2345": {
      rarity: 3,
      stat: {
        training: { performance: 300, technique: 300, visual: 300, levelLimit: 10 },
      },
    },
  });

  assert.deepEqual(
    cards.map((card) => [card.cardId, card.episodeCount]),
    [
      [2345, 0],
      [999_997, 1],
      [999_998, 2],
      [999_999, 0],
    ],
  );
});

test("every manual profile creation passes its payload server to the RPC", () => {
  const rpcCalls = [...serverSource.matchAll(
    /\.rpc\("create_manual_game_profile", \{([\s\S]*?)\n\s*\}\);/gu,
  )];

  assert.equal(rpcCalls.length, 4);
  rpcCalls.forEach(([, argumentsSource]) => {
    assert.match(argumentsSource, /p_server:/u);
  });
});

test("manual profile RPC validates and stores the requested gameplay server", () => {
  assert.match(migrationSource, /p_server integer default 3/u);
  assert.match(migrationSource, /p_server is null or p_server not between 0 and 3/u);
  assert.match(migrationSource, /p_profile_name,\s+p_server,\s+null,/u);
  assert.match(
    migrationSource,
    /revoke all on function public\.create_manual_game_profile\([^)]+jsonb, integer\) from public, anon, authenticated/u,
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.create_manual_game_profile\([^)]+jsonb, integer\) to service_role/u,
  );
});

test("profile card collection labels the gameplay server instead of the asset region", () => {
  assert.equal(
    zhMessages.gameProfiles.cards.collectionSummary,
    "共 {total} 张／匹配 {matched} 张／服务器 {server}",
  );
  assert.equal(
    enMessages.gameProfiles.cards.collectionSummary,
    "{total} total / {matched} matched / Server {server}",
  );
  assert.match(
    cardPageSource,
    /server: getBandoriServerCode\(profileServer\)\.toUpperCase\(\)/u,
  );
  assert.doesNotMatch(cardPageSource, /region: region\.toUpperCase\(\)/u);
});

test("card images use the shared asset index without a regional selector", () => {
  assert.match(
    cardAssetIndexSource,
    /BANDORI_CARDS_INDEX_KEY = "bandori\/cards\/index\.json"/u,
  );
  assert.match(cardThumbnailSource, /lookupBandoriCardImage\(/u);
  assert.doesNotMatch(cardThumbnailSource, /BandoriAssetRegion|assetRegion/u);
  assert.doesNotMatch(cardPageSource, /getRegionFromProfileServer|assetRegion/u);
  assert.doesNotMatch(regionalNamesSource, /BandoriAssetRegion|assetRegion/u);
});
