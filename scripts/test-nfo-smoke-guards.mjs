import assert from "node:assert/strict";
import {
  LIVE_NFO_ENDPOINT_MARKERS,
  assertNoLiveNfoEndpoints,
  assertNoLiveNfoNetworkRequests,
  collectNetworkUrls,
  getStaticRuntimeEndpointCheckSurface,
} from "./nfo-smoke-local.mjs";

const localRuntimeSurface = {
  source: {
    runtimeDataPath: "public/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json",
  },
  staticRuntimePath: "/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json",
};

assert.doesNotThrow(() => {
  assertNoLiveNfoEndpoints(localRuntimeSurface, "local NFO runtime surface");
});

for (const marker of LIVE_NFO_ENDPOINT_MARKERS) {
  assert.throws(
    () => assertNoLiveNfoEndpoints({ endpoint: `prefix-${marker}-suffix` }, "live marker fixture"),
    new RegExp(`live NFO endpoint marker ${escapeRegExp(marker)}`),
  );
}

const staticRuntime = {
  datasets: {
    multiplayConfigData: [
      {
        Name: "CN multiplay endpoint retained in raw static table",
        URL: "https://l4-prod-patch-bd.bilibiligame.net/assetbundle/nfo/Android/",
      },
    ],
    weaponData: [
      {
        TypeID: 1,
        Name: "Fireball",
      },
    ],
  },
};
const staticRuntimeCheckSurface = getStaticRuntimeEndpointCheckSurface(staticRuntime);

assert.equal(staticRuntime.datasets.multiplayConfigData[0]?.URL.includes("https://"), true);
assert.equal("URL" in staticRuntimeCheckSurface.datasets.multiplayConfigData[0], false);
assert.deepEqual(staticRuntimeCheckSurface.datasets.weaponData, staticRuntime.datasets.weaponData);
assert.doesNotThrow(() => {
  assertNoLiveNfoEndpoints(staticRuntimeCheckSurface, "static runtime gameplay surface");
});

const staticRuntimeWithUnexpectedLiveEndpoint = getStaticRuntimeEndpointCheckSurface({
  datasets: {
    multiplayConfigData: [
      {
        URL: "https://l4-prod-patch-bd.bilibiligame.net/assetbundle/nfo/Android/",
      },
    ],
    activeSkillData: [
      {
        DebugEndpoint: "https://l4-prod-patch-bd.bilibiligame.net/assetbundle/nfo/Android/",
      },
    ],
  },
});

assert.throws(
  () => assertNoLiveNfoEndpoints(
    staticRuntimeWithUnexpectedLiveEndpoint,
    "static runtime unexpected endpoint fixture",
  ),
  /live NFO endpoint marker https:\/\//,
);

const netLogFixture = {
  events: [
    {
      params: {
        url: "http://localhost:3117/zh-CN/bandori/nfo?nfoSmoke=1",
      },
    },
    {
      params: {
        url: "http://127.0.0.1:3117/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json",
      },
    },
  ],
};

assert.deepEqual(collectNetworkUrls(netLogFixture), [
  "http://127.0.0.1:3117/res/bandori/nfo/cn/Android-2.1.1/runtime-data/master-data.json",
  "http://localhost:3117/zh-CN/bandori/nfo?nfoSmoke=1",
]);
assert.doesNotThrow(() => {
  assertNoLiveNfoNetworkRequests(netLogFixture, "browser netlog fixture");
});
assert.throws(
  () => assertNoLiveNfoNetworkRequests(
    {
      events: [
        {
          params: {
            url: "https://l4-prod-patch-bd.bilibiligame.net/assetbundle/nfo/Android/foo",
          },
        },
      ],
    },
    "browser live netlog fixture",
  ),
  /requested live NFO endpoint marker/,
);

console.log("ok - NFO smoke no-live-endpoint guards are covered");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
