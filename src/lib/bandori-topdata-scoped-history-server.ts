import { bandoriMonthlyRankingIdToPeriod } from "@/lib/bandori-monthly-ranking-calendar";
import type { BandoriServerCode } from "@/lib/bandori-server";
import type { BandoriTopDataPayload } from "@/lib/bandori-topdata-contract";
import { readBandoriTopDataTarget } from "@/lib/bandori-topdata-history-server";
import {
  buildBandoriMonthlyTopDataManifestKey,
  buildBandoriSongTopDataManifestKey,
  parseBandoriMonthlyTopDataManifest,
  parseBandoriSongTopDataManifest,
} from "@/lib/bandori-topdata-history-contract";

export class BandoriSongTopDataRequiredError extends Error {}
export class BandoriScopedTopDataNotFoundError extends Error {}
export class BandoriScopedTopDataReadError extends Error {}

function isSongSelectionError(error: unknown): boolean {
  return error instanceof BandoriSongTopDataRequiredError
    || error instanceof BandoriScopedTopDataNotFoundError;
}

export async function readBandoriSongTopDataHistory(
  server: BandoriServerCode,
  eventId: number,
  requestedSongId: number | null,
): Promise<BandoriTopDataPayload> {
  const manifestKey = buildBandoriSongTopDataManifestKey(eventId, server);
  try {
    const result = await readBandoriTopDataTarget({
      manifestKey,
      targetDiscriminator: `song:${requestedSongId ?? "auto"}`,
      parseManifest: (value) => parseBandoriSongTopDataManifest(value, eventId, server),
      selectPack: (manifest) => {
        let songId = requestedSongId;
        if (songId === null) {
          if (manifest.songIds.length !== 1) throw new BandoriSongTopDataRequiredError();
          [songId] = manifest.songIds;
        }
        if (!manifest.descriptors.has(songId)) throw new BandoriScopedTopDataNotFoundError();
        return {
          descriptor: manifest.descriptors.get(songId) ?? null,
          cacheKey: `${manifestKey}:song:${songId}`,
        };
      },
      isExpectedSelectionError: isSongSelectionError,
      logContext: {
        kind: "song",
        server,
        eventId,
        requestedSongId: requestedSongId ?? "auto",
      },
    });
    return result.payload;
  } catch (error) {
    if (isSongSelectionError(error)) throw error;
    throw new BandoriScopedTopDataReadError(
      "Bandori song TOP10 history is unavailable",
      { cause: error },
    );
  }
}

export async function readBandoriMonthlyTopDataHistory(
  server: BandoriServerCode,
  monthlyRankingId: number,
): Promise<BandoriTopDataPayload> {
  try {
    const period = bandoriMonthlyRankingIdToPeriod(server, monthlyRankingId);
    const manifestKey = buildBandoriMonthlyTopDataManifestKey(period, server);
    const result = await readBandoriTopDataTarget({
      manifestKey,
      targetDiscriminator: `monthly:${monthlyRankingId}`,
      parseManifest: (value) => parseBandoriMonthlyTopDataManifest(
        value,
        period,
        monthlyRankingId,
        server,
      ),
      selectPack: (manifest) => ({
        descriptor: manifest.descriptor,
        cacheKey: manifestKey,
      }),
      logContext: { kind: "monthly", server, monthlyRankingId, period },
    });
    return result.payload;
  } catch (error) {
    throw new BandoriScopedTopDataReadError(
      "Bandori monthly TOP10 history is unavailable",
      { cause: error },
    );
  }
}
