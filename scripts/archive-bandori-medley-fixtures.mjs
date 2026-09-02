import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { decodeMedleyProfile } from "../src/lib/bandori/medley-foundation/index.ts";

// Preserve evidence, not solver behavior: no legacy module is loaded or executed.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = join(REPO_ROOT, "temp", "medley-regression-fixtures");
const MASTER_FILES = new Set([
  "cards-all-5.json", "characters-main-3.json", "skills-all-10.json",
  "areaItems-main-5.json", "songs-all-7.json",
]);
const REPORT_NAME = /^(?:benchmark-report-medley-|real-profile-medley-(?:benchmark|scope-matrix|all-40)-|medley-40-exact-isolated-|low-memory-polish-hhwx-).+\.json$/u;
const { values } = parseArgs({ options: {
  seed: { type: "string" },
  source: { type: "string", multiple: true, default: [] },
  verify: { type: "boolean", default: false },
} });
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const slash = (path) => path.replaceAll("\\", "/");
const files = new Map();

function retainFile(sourcePath, category) {
  const bytes = readFileSync(sourcePath);
  const hash = sha256(bytes);
  const path = `${category}/${hash}.json`;
  const destination = join(OUTPUT_ROOT, path);
  if (existsSync(destination)) {
    assert.equal(sha256(readFileSync(destination)), hash, `changed archived file: ${path}`);
  } else {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(sourcePath, destination);
  }
  files.set(path, { path, sha256: hash, bytes: bytes.length });
  return path;
}

function* reportFiles(root) {
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && entry.name === "low-memory-polish") yield* reportFiles(path);
    if (entry.isFile() && REPORT_NAME.test(entry.name)) yield path;
  }
}

function retainedProfilePayload(profile, profileByIdentity) {
  const retained = profileByIdentity.get(profile?.profileHash);
  if (!retained) return null;
  if (Number.isInteger(profile.cardCount) && profile.cardCount !== retained.cardCount) return null;
  return retained.payloadSha256;
}

function verifyArchive(manifest) {
  for (const file of manifest.files) {
    const bytes = readFileSync(join(OUTPUT_ROOT, file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sha256(bytes), file.sha256, file.path);
  }
  for (const profile of manifest.profiles) {
    const bytes = readFileSync(join(OUTPUT_ROOT, profile.path));
    assert.equal(sha256(bytes.toString("utf8").trimEnd()), profile.payloadSha256);
    const decoded = decodeMedleyProfile(JSON.parse(bytes));
    assert.equal(decoded.cards.length, profile.cardCount);
    assert.equal(decoded.server, profile.server);
  }
  const knownProfiles = new Set(manifest.profiles.map((profile) => profile.payloadSha256));
  const knownFiles = new Set(manifest.files.map((file) => file.path));
  const reports = new Map();
  for (const result of manifest.results) {
    assert(knownProfiles.has(result.profileSha256));
    assert(knownFiles.has(result.reportPath));
    if (!reports.has(result.reportPath)) reports.set(result.reportPath, readJson(join(OUTPUT_ROOT, result.reportPath)));
    let original = reports.get(result.reportPath);
    for (const key of result.resultPath.replace(/\[(\d+)\]/gu, ".$1").split(".")) original = original[key];
    assert.equal(original.score, result.score, result.resultPath);
    assert.equal(original.averageScore ?? null, result.averageScore, result.resultPath);
  }
  console.log(JSON.stringify({
    archive: OUTPUT_ROOT,
    profiles: manifest.profiles.length,
    dataSnapshots: manifest.dataSnapshots.length,
    reports: manifest.files.filter((file) => file.path.startsWith("reports/")).length,
    indexedResults: manifest.results.length,
    files: manifest.files.length,
    totalMiB: Number((manifest.files.reduce((sum, file) => sum + file.bytes, 0) / 1048576).toFixed(2)),
    verification: "file hashes, HHWX profile decoding, and index references passed",
  }, null, 2));
}

function indexReport(report, profileByIdentity, profileByName) {
  const input = report.inputs ?? report.input ?? {};
  const songIds = input.songIds ?? report.songs?.map((song) => song.songId)
    ?? report.env?.HHWX_REAL_PROFILE_SONG_IDS?.split(",").map(Number);
  if (!Array.isArray(songIds) || songIds.length !== 3) return [];
  const settings = {
    songIds,
    // These retained real-profile runners fix expert/full-P/no-fever. Generic
    // benchmark reports omit PERFECT rate, so do not invent it for that format.
    difficulties: input.difficulties ?? ["expert", "expert", "expert"],
    perfectRate: input.perfectRate ?? (report.profile || report.rows ? 1 : null),
    coarseAreaItemFilter: input.coarseAreaItemFilter ?? null,
  };
  const results = [];
  function add(profileSha256, profileHash, eventKey, value, resultPath, reportedExact) {
    if (!profileSha256 || !Number.isFinite(value?.score)) return;
    const songs = value.songResults;
    results.push({
      profileSha256, profileHash: profileHash ?? null, ...settings, eventKey,
      resultPath, score: value.score, averageScore: value.averageScore ?? null,
      reportedExact: reportedExact ?? null,
      cardsSaved: value.cardIds?.length === 15,
      leadersSaved: songs?.length === 3 && songs.every((song) => Number.isInteger(song.leaderCardId)) || false,
      areaSaved: Array.isArray(value.areaItemConfiguration?.selectedAreaItemIds),
    });
  }
  if (report.topResult) {
    const identity = report.profile?.profileHash;
    const profileSha256 = identity
      ? retainedProfilePayload(report.profile, profileByIdentity)
      : profileByName.get(input.profileName);
    add(profileSha256, identity,
      report.eventKey ?? (input.eventId == null ? "none" : String(input.eventId)),
      report.topResult, "topResult", report.exact);
  }
  for (const [index, row] of (report.rows ?? []).entries()) {
    const identity = row.profile?.profileHash;
    const profileSha256 = retainedProfilePayload(row.profile, profileByIdentity);
    add(profileSha256, identity, row.eventKey, row.all, `rows[${index}].all`, row.all?.exact);
    for (const [candidateIndex, candidate] of (row.all?.evaluatedAverageTopCandidates ?? []).entries()) {
      add(profileSha256, identity, row.eventKey, candidate,
        `rows[${index}].all.evaluatedAverageTopCandidates[${candidateIndex}]`, null);
    }
  }
  return results;
}

function collectArchive() {
  assert(values.seed && values.source.length, "use --seed <archive> --source <label=report-directory>");
  const seedRoot = resolve(values.seed);
  const seed = readJson(join(seedRoot, "manifest.json"));
  const profileByIdentity = new Map();
  const profileByName = new Map();
  const containers = seed.containers.map((container) => {
    const source = join(seedRoot, container.relativePath);
    assert.equal(sha256(readFileSync(source)), container.sha256);
    for (const row of readJson(source).rows ?? []) {
      const identity = sha256(String(row.id)).slice(0, 12);
      const retained = { payloadSha256: row.payload_sha256, cardCount: row.card_count };
      const previous = profileByIdentity.get(identity);
      assert(!previous || (previous.payloadSha256 === retained.payloadSha256
        && previous.cardCount === retained.cardCount));
      profileByIdentity.set(identity, retained);
    }
    return { sourcePath: source, originalPath: container.sourcePath, path: retainFile(source, "containers") };
  });
  const profiles = seed.profiles.map((profile) => {
    for (const alias of profile.aliases) {
      if (alias.startsWith("benchmark-")) profileByName.set(alias.slice(10), profile.payloadSha256);
    }
    return {
      payloadSha256: profile.payloadSha256,
      path: retainFile(join(seedRoot, profile.relativePath), "profiles"),
      cardCount: profile.cardCount, server: profile.server, aliases: profile.aliases,
    };
  });
  const references = [];
  for (const name of readdirSync(join(seedRoot, "reference-only")).filter((name) => name.endsWith(".json")).sort()) {
    const source = join(seedRoot, "reference-only", name);
    references.push({ sourcePath: source, path: retainFile(source, "reports") });
  }
  const dataSnapshots = [{
    id: "seed", sourceRoot: seedRoot,
    assets: seed.assets.map((asset) => {
      const source = join(seedRoot, asset.relativePath);
      assert.equal(sha256(readFileSync(source)), asset.sha256);
      return { name: slash(asset.sourcePath).split("/").at(-1), path: retainFile(source, "data") };
    }),
  }];
  const sources = [];
  const selected = new Map();
  for (const configuredSource of values.source) {
    const separator = configuredSource.indexOf("=");
    assert(separator > 0, "each --source must be label=directory");
    const id = configuredSource.slice(0, separator);
    const root = resolve(configuredSource.slice(separator + 1));
    assert(!sources.some((source) => source.id === id), `duplicate source label: ${id}`);
    const cache = join(root, "bestdori-cache");
    const assets = existsSync(cache) ? readdirSync(cache).sort().filter((name) => (
      MASTER_FILES.has(name) || /^chart-\d+-expert\.json$/u.test(name) || /^event-\d+\.json$/u.test(name)
    )).map((name) => ({ name, path: retainFile(join(cache, name), "data") })) : [];
    if (assets.length > 0) dataSnapshots.push({ id, sourceRoot: cache, assets });
    const source = { id, root, dataSnapshotId: assets.length > 0 ? id : null,
      scannedReports: 0, matchedResults: 0, unmatchedProfileHashes: [] };
    const unmatched = new Set();
    for (const reportPath of reportFiles(root)) {
      const report = readJson(reportPath);
      source.scannedReports += 1;
      for (const profile of [report.profile, ...(report.rows ?? []).map((row) => row.profile)]) {
        if (profile?.profileHash && !retainedProfilePayload(profile, profileByIdentity)) {
          unmatched.add(profile.profileHash);
        }
      }
      for (const result of indexReport(report, profileByIdentity, profileByName)) {
        source.matchedResults += 1;
        const group = JSON.stringify([id, result.profileSha256, result.songIds, result.difficulties,
          result.perfectRate, result.eventKey, result.coarseAreaItemFilter]);
        const entry = { ...result, sourceId: id, sourceReport: slash(relative(root, reportPath)),
          sourcePath: reportPath, generatedAt: report.generatedAt ?? null };
        // Keep high reported scores and the strongest saved assignments separately.
        // An old exact flag or a larger number never becomes a verified baseline here.
        for (const category of ["reported", ...(result.cardsSaved && result.areaSaved ? ["cards"] : []),
          ...(result.cardsSaved && result.areaSaved && result.leadersSaved ? ["leaders"] : [])]) {
          const key = `${group}/${category}`;
          const previous = selected.get(key);
          if (!previous || entry.score > previous.score || (entry.score === previous.score
            && entry.reportedExact === true && previous.reportedExact !== true)) selected.set(key, entry);
        }
      }
    }
    source.unmatchedProfileHashes = [...unmatched].sort();
    sources.push(source);
  }
  const results = [...new Map([...selected.values()].map((entry) => (
    [`${entry.sourceId}/${entry.sourceReport}/${entry.resultPath}`, entry]
  ))).values()].map(({ sourcePath, ...entry }) => ({ ...entry, reportPath: retainFile(sourcePath, "reports") }));
  const manifest = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), privacy: "local-only; do not publish",
    comparisonStatus: "historical evidence only; scores and exact claims have not been replay-validated",
    dataSnapshotStatus: "retained source-directory caches; historical reports do not record per-run data hashes",
    selection: "per source/profile/songs/settings: highest reported score, highest with cards and area, highest with explicit leaders",
    sources, containers, profiles, dataSnapshots, references, results, files: [...files.values()],
  };
  assert(profiles.every((profile) => results.some((result) => result.profileSha256 === profile.payloadSha256)),
    "each archived profile must have an indexed historical result");
  verifyArchive(manifest);
  writeFileSync(join(OUTPUT_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const table = profiles.map((profile) => {
    const rows = results.filter((result) => result.profileSha256 === profile.payloadSha256);
    return `| ${profile.aliases[0]} | ${profile.cardCount} | ${rows.length} | ${rows.filter((row) => row.leadersSaved).length} |`;
  }).join("\n");
  writeFileSync(join(OUTPUT_ROOT, "README.md"), `# Local medley regression evidence\n\n`
    + `Private HHWX profiles: do not commit, publish, or upload this directory.\n\n`
    + `See [manifest.json](manifest.json) for original paths, dates, settings, file hashes and result locations.\n`
    + `Profiles and reports are unchanged copies; identical files share one stored copy.\n\n`
    + `## Profiles\n\n| Alias | Cards | Indexed results | With explicit leaders |\n| --- | ---: | ---: | ---: |\n${table}\n\n`
    + `## Before comparing scores\n\n`
    + `- Historical averages are comparison references; old exact flags do not prove completion of the new search.\n`
    + `- An account identity is not a profile version. Reports whose recorded card count differs from the retained payload are left unindexed.\n`
    + `- Cache snapshots are preserved as found; reports without data hashes cannot prove which version a run used.\n`
    + `- A source label identifies a saved directory, not the branch or commit that generated every report.\n`
    + `- Missing PERFECT rates, leaders or team details remain missing; never infer a leader from legacy card order.\n`
    + `- Compare scores only when the payload, songs, play settings, event parameters and data snapshot match. Index presence alone is not proof of comparability.\n`
    + `- Old-team replay is only for a separately needed discrepancy investigation.\n`
    + `- A fifteen-card projection is not comparable to the original full roster's search result.\n\n`
    + `Verify from the repository root: \`node --import tsx scripts/archive-bandori-medley-fixtures.mjs --verify\`.\n`);
}

if (values.verify) verifyArchive(readJson(join(OUTPUT_ROOT, "manifest.json")));
else collectArchive();
