import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

const pointerKey = "bandori/master/music/api/active.json";
const packPrefix = "bandori/master/music/api";

const {
  readBandoriMusicApiDataset,
  readBandoriMusicApiDetail,
} = await import("../src/lib/bandori-music-api-server.ts");
const { GET: readMasterDatasetRoute } = await import(
  "../src/app/api/bandori/master/[dataset]/route.ts"
);
const { GET: readMusicDetailRoute } = await import(
  "../src/app/api/bandori/master/music/[musicId]/route.ts"
);

async function writeObject(root, key, body) {
  const path = join(root, ...key.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

function descriptor(key, payload, body) {
  return {
    key,
    semanticSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    compressedSha256: createHash("sha256").update(body).digest("hex"),
    compressedSize: body.length,
    recordCount: Object.keys(payload).length,
  };
}

async function createStore(summary, detail) {
  const root = await mkdtemp(join(tmpdir(), "hhwx-music-api-"));
  const summaryBody = gzipSync(Buffer.from(JSON.stringify(summary), "utf8"), { mtime: 0 });
  const summaryHash = createHash("sha256").update(summaryBody).digest("hex");
  const summaryDescriptor = descriptor(
    `${packPrefix}/packs/music/${summaryHash}.json.gz`,
    summary,
    summaryBody,
  );
  const detailBody = gzipSync(Buffer.from(JSON.stringify(detail), "utf8"), { mtime: 0 });
  const detailHash = createHash("sha256").update(detailBody).digest("hex");
  const detailDescriptor = descriptor(
    `${packPrefix}/packs/musicDetails/music00000/${detailHash}.json.gz`,
    detail,
    detailBody,
  );
  await writeObject(root, summaryDescriptor.key, summaryBody);
  await writeObject(root, detailDescriptor.key, detailBody);
  await writeObject(root, pointerKey, Buffer.from(JSON.stringify({
    schemaVersion: "bandori-music-api-pointer-v1",
    generation: 1,
    updatedAt: "2026-07-28T00:00:00Z",
    datasets: {
      music: summaryDescriptor,
      musicDetails: {
        layout: "numeric-id-range",
        rangeSize: 50,
        recordCount: 1,
        shards: { music00000: detailDescriptor },
      },
    },
  })));
  return root;
}

const common = {
  tag: "normal",
  bandId: 1,
  bandName: ["Poppin'Party", "Poppin'Party", "Poppin'Party", "Poppin'Party"],
  jacketImage: ["yes_bang_dream"],
  musicTitle: ["Yes! BanG_Dream!", "Yes! BanG_Dream!", null, "Yes! BanG_Dream!"],
  publishedAt: ["1", "2", null, "3"],
  closedAt: ["9", "9", null, "9"],
  difficulty: { "0": { playLevel: 5 } },
  musicVideos: {
    music_video_1: {
      startAt: ["1", "2", null, "3"],
    },
  },
  length: 120.048,
  notes: { "0": 63 },
  bpm: { "0": [{ bpm: 185, start: 0, end: 120.048 }] },
};
const summary = { "1": common };
const detail = {
  "1": {
    bgmId: "bgm001",
    bgmFile: "yes_bang_dream",
    ...common,
    achievements: [],
    seq: 3,
    ruby: ["ruby", "ruby", null, "ruby"],
    phonetic: ["phonetic", "phonetic", null, "phonetic"],
    lyricist: ["lyricist", "lyricist", null, "lyricist"],
    composer: ["composer", "composer", null, "composer"],
    arranger: ["arranger", "arranger", null, "arranger"],
    howToGet: ["gift", "gift", null, "gift"],
    musicVideos: {
      music_video_1: {
        assetBundleName: "music_video_1",
        musicStartDelayMilliseconds: -1481,
        thumbAssetBundleName: "001",
        title: ["Anime MV", "Anime MV", null, "Anime MV"],
        description: [null, null, null, null],
        startAt: ["1", "2", null, "3"],
        endAt: ["9", "9", null, "9"],
      },
    },
  },
};

const candidateStoreRoot = process.env.BANDORI_MUSIC_API_CANDIDATE_STORE_ROOT;
if (candidateStoreRoot) {
  process.env.BANDORI_MUSIC_API_LOCAL_STORE_ROOT = candidateStoreRoot;
  const candidateSummary = await readBandoriMusicApiDataset();
  let detailCount = 0;
  let serverExtensionCount = 0;
  let musicVideoRecordCount = 0;
  for (const musicId of Object.keys(candidateSummary)) {
    const candidateDetail = await readBandoriMusicApiDetail(musicId);
    assert.ok(candidateDetail, `Missing Music detail: ${musicId}`);
    detailCount += 1;
    serverExtensionCount += Object.hasOwn(candidateDetail, "serverExtensions") ? 1 : 0;
    musicVideoRecordCount += Object.hasOwn(candidateDetail, "musicVideos") ? 1 : 0;
  }
  console.log(JSON.stringify({
    summaryCount: Object.keys(candidateSummary).length,
    detailCount,
    serverExtensionCount,
    musicVideoRecordCount,
  }));
} else {
  const root = await createStore(summary, detail);
  process.env.BANDORI_MUSIC_API_LOCAL_STORE_ROOT = root;
  try {
    assert.deepEqual(await readBandoriMusicApiDataset(), summary);
    assert.deepEqual(await readBandoriMusicApiDetail("1"), detail["1"]);

    const listResponse = await readMasterDatasetRoute(
      new Request("http://localhost/api/bandori/master/music"),
      { params: Promise.resolve({ dataset: "music" }) },
    );
    assert.equal(listResponse.status, 200);
    assert.deepEqual(await listResponse.json(), { success: true, data: summary });

    const removedSongsResponse = await readMasterDatasetRoute(
      new Request("http://localhost/api/bandori/master/songs"),
      { params: Promise.resolve({ dataset: "songs" }) },
    );
    assert.equal(removedSongsResponse.status, 404);

    const detailResponse = await readMusicDetailRoute(
      new Request("http://localhost/api/bandori/master/music/1"),
      { params: Promise.resolve({ musicId: "1" }) },
    );
    assert.equal(detailResponse.status, 200);
    assert.deepEqual(await detailResponse.json(), { success: true, data: detail["1"] });

    const missingResponse = await readMusicDetailRoute(
      new Request("http://localhost/api/bandori/master/music/2"),
      { params: Promise.resolve({ musicId: "2" }) },
    );
    assert.equal(missingResponse.status, 404);
  } finally {
    delete process.env.BANDORI_MUSIC_API_LOCAL_STORE_ROOT;
    await rm(root, { recursive: true, force: true });
  }

  console.log("Bandori Music local-store reader checks passed.");
}
