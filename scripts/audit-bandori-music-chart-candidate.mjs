#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareBandoriChart } from "../src/lib/bandori/team-builder/core/chart.ts";

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value) {
      throw new Error(`invalid argument near ${name ?? "<end>"}`);
    }
    values.set(name.slice(2), value);
  }
  for (const required of ["candidate", "bestdori-cache", "songs", "output"]) {
    if (!values.has(required)) {
      throw new Error(`missing --${required}`);
    }
  }
  return Object.fromEntries(values);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function firstDifference(left, right, currentPath = "$") {
  if (typeof left !== typeof right || left === null || right === null) {
    return same(left, right) ? null : { path: currentPath, candidate: left, bestdori: right };
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return {
        path: currentPath,
        candidateLength: Array.isArray(left) ? left.length : null,
        bestdoriLength: Array.isArray(right) ? right.length : null,
      };
    }
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstDifference(left[index], right[index], `${currentPath}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (typeof left === "object") {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (!same(leftKeys, rightKeys)) {
      return { path: currentPath, candidateKeys: leftKeys, bestdoriKeys: rightKeys };
    }
    for (const key of leftKeys) {
      const difference = firstDifference(left[key], right[key], `${currentPath}.${key}`);
      if (difference) return difference;
    }
    return null;
  }
  return Object.is(left, right) ? null : { path: currentPath, candidate: left, bestdori: right };
}

function unwrapSongs(payload) {
  const candidates = [
    payload?.data?.payload,
    payload?.data,
    payload?.payload,
    payload,
  ];
  const songs = candidates.find((candidate) => (
    candidate
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && Object.keys(candidate).some((key) => /^\d+$/.test(key))
  ));
  if (!songs) {
    throw new Error("songs input does not contain a numeric song map");
  }
  return songs;
}

function chartTimeline(chart) {
  return chart.notes.map(({ beat, time, fever }) => ({ beat, time, fever }));
}

const args = parseArguments(process.argv.slice(2));
const candidatePath = path.resolve(args.candidate);
const candidateRoot = path.dirname(candidatePath);
const bestdoriRoot = path.resolve(args["bestdori-cache"]);
const songsPath = path.resolve(args.songs);
const outputPath = path.resolve(args.output);
const candidate = await readJson(candidatePath);
const songs = unwrapSongs(await readJson(songsPath));
const cases = Object.entries(candidate.charts ?? {}).flatMap(([musicId, difficulties]) => (
  Object.entries(difficulties).map(([difficultyIndex, record]) => ({
    musicId,
    difficultyIndex,
    difficulty: record.difficulty,
    sha256: record.sha256,
    expectedNotes: record.notes,
    features: record.features ?? [],
  }))
)).sort((left, right) => (
  Number(left.musicId) - Number(right.musicId)
  || Number(left.difficultyIndex) - Number(right.difficultyIndex)
));
if (cases.length === 0) {
  throw new Error("candidate has no chart mappings");
}

const dimensions = [
  "preparedFull",
  "timeline",
  "notesCount",
  "candidateMetadataNotes",
  "skillStartNotes",
  "skillTriggerTimes",
];
const mismatchKeys = Object.fromEntries(dimensions.map((dimension) => [dimension, []]));
const applicableCounts = Object.fromEntries(dimensions.map((dimension) => [dimension, 0]));
const preparedDifferenceSamples = [];
let rawExactMatches = 0;
let multiRangeCharts = 0;

for (let index = 0; index < cases.length; index += 1) {
  const current = cases[index];
  const key = `${current.musicId}:${current.difficulty}`;
  const song = songs[current.musicId];
  if (!song) {
    throw new Error(`songs input is missing ${current.musicId}`);
  }
  if (!Array.isArray(current.features)) {
    throw new Error(`candidate features are invalid: ${key}`);
  }
  const isMultiRange = current.features.includes("multiRange");
  if (current.features.some((feature) => feature !== "multiRange")) {
    throw new Error(`candidate has unsupported chart features: ${key}`);
  }
  if (isMultiRange) {
    multiRangeCharts += 1;
  }
  const candidateObjectPath = path.join(
    candidateRoot,
    "bandori",
    "music",
    "charts",
    `${current.sha256}.json`,
  );
  if (await sha256File(candidateObjectPath) !== current.sha256) {
    throw new Error(`candidate hash mismatch: ${key}`);
  }
  const rebuiltChart = await readJson(candidateObjectPath);
  const rebuilt = prepareBandoriChart(rebuiltChart, song, current.difficulty);
  const checks = {
    candidateMetadataNotes: rebuilt.notesCount === current.expectedNotes,
  };
  let bestdori = null;
  if (!isMultiRange) {
    const bestdoriChart = await readJson(
      path.join(bestdoriRoot, current.musicId, `${current.difficulty}.json`),
    );
    if (same(rebuiltChart, bestdoriChart)) {
      rawExactMatches += 1;
    }
    bestdori = prepareBandoriChart(bestdoriChart, song, current.difficulty);
    Object.assign(checks, {
      preparedFull: same(rebuilt, bestdori),
      timeline: same(chartTimeline(rebuilt), chartTimeline(bestdori)),
      notesCount: rebuilt.notesCount === bestdori.notesCount,
      skillStartNotes: same(rebuilt.skillStartNotes, bestdori.skillStartNotes),
      skillTriggerTimes: same(rebuilt.skillTriggerTimes, bestdori.skillTriggerTimes),
    });
  }
  for (const dimension of dimensions) {
    if (typeof checks[dimension] !== "boolean") {
      continue;
    }
    applicableCounts[dimension] += 1;
    if (!checks[dimension]) mismatchKeys[dimension].push(key);
  }
  if (checks.preparedFull === false && preparedDifferenceSamples.length < 20) {
    preparedDifferenceSamples.push({
      key,
      difference: firstDifference(rebuilt, bestdori),
    });
  }
  if ((index + 1) % 250 === 0 || index + 1 === cases.length) {
    process.stdout.write(`audited ${index + 1}/${cases.length} prepared charts\n`);
  }
}

const counts = Object.fromEntries(dimensions.map((dimension) => [
  dimension,
  applicableCounts[dimension] - mismatchKeys[dimension].length,
]));
const report = {
  schemaVersion: "hhwx-bandori-music-chart-consumer-audit-v3",
  generatedAt: new Date().toISOString(),
  inputs: {
    candidate: candidatePath,
    candidateSha256: await sha256File(candidatePath),
    bestdoriCache: bestdoriRoot,
    songs: songsPath,
    songsSha256: await sha256File(songsPath),
  },
  contract: {
    consumer: "prepareBandoriChart",
    blockingDimensions: dimensions,
    rawEntityEquality: "informational for ordinary charts only; multiRange does not read Bestdori",
  },
  counts: {
    charts: cases.length,
    bestdoriComparableCharts: cases.length - multiRangeCharts,
    multiRangeCharts,
    rawExactMatches,
    rawStructuralDifferences: cases.length - multiRangeCharts - rawExactMatches,
    checksApplicable: applicableCounts,
    ...counts,
  },
  mismatches: mismatchKeys,
  preparedDifferenceSamples,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report.counts, null, 2)}\n`);
process.stdout.write(`report: ${outputPath}\n`);
process.stdout.write(`reportSha256: ${await sha256File(outputPath)}\n`);
if (dimensions.some((dimension) => mismatchKeys[dimension].length > 0)) {
  process.exitCode = 1;
}
