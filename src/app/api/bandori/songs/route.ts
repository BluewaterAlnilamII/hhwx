import { NextResponse } from "next/server";

const BESTDORI_SONGS_URL = "https://bestdori.com/api/songs/all.5.json";
const TITLE_PREFERENCE_ORDER = [3, 2, 1, 0, 4] as const;

type BestdoriSongMetadata = {
  musicTitle?: Array<string | null>;
};

function parseRequestedSongIds(request: Request): number[] {
  const { searchParams } = new URL(request.url);
  const rawIds = searchParams.get("ids");

  if (!rawIds) {
    return [];
  }

  return Array.from(
    new Set(
      rawIds
        .split(",")
        .map((rawId) => Number.parseInt(rawId.trim(), 10))
        .filter((songId) => Number.isFinite(songId) && songId > 0),
    ),
  );
}

function pickBestSongTitle(titles: Array<string | null> | undefined): string | null {
  if (!Array.isArray(titles)) {
    return null;
  }

  for (const index of TITLE_PREFERENCE_ORDER) {
    const title = titles[index]?.trim();
    if (title) {
      return title;
    }
  }

  for (const candidate of titles) {
    const title = candidate?.trim();
    if (title) {
      return title;
    }
  }

  return null;
}

export async function GET(request: Request) {
  const songIds = parseRequestedSongIds(request);

  if (songIds.length === 0) {
    return NextResponse.json({ error: "Query parameter ids is required" }, { status: 400 });
  }

  try {
    const response = await fetch(BESTDORI_SONGS_URL, {
      headers: { "User-Agent": "hhwx-tracker/1.0" },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Bestdori API error" }, { status: response.status });
    }

    const payload = await response.json() as Record<string, BestdoriSongMetadata>;
    const songs: Record<string, string> = {};

    for (const songId of songIds) {
      const title = pickBestSongTitle(payload[String(songId)]?.musicTitle);
      if (title) {
        songs[String(songId)] = title;
      }
    }

    return NextResponse.json({ songs });
  } catch (error) {
    console.error("Bandori songs API 错误:", error);
    return NextResponse.json({ error: "Failed to fetch song metadata" }, { status: 500 });
  }
}