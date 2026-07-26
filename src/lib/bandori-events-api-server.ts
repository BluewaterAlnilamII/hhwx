import {
  EVENT_API_POINTER_KEY,
  MAX_EVENT_API_COMPRESSED_BYTES,
  MAX_EVENT_API_DECOMPRESSED_BYTES,
  MAX_EVENT_API_RECORDS,
  parseEventApiPointer,
  type EventApiDatasetName,
} from "@/lib/bandori-events-api-contract";
import {
  createBandoriSnapshotObjectSource,
  createBandoriSnapshotPointerCache,
  createBandoriSnapshotRecordMapCache,
  type BandoriSnapshotRecord,
  type BandoriSnapshotRecordMap,
} from "@/lib/bandori-snapshot-api-server";
import { addBandoriCnSchedules, type BandoriCnScheduleSource } from "@/lib/bandori-events";
import {
  BANDORI_EVENTS_CACHE_TAG,
  BANDORI_SCHEDULE_CACHE_TAG,
  FAST_MUTABLE_HTTP_CACHE_POLICY,
} from "@/lib/api-cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BANDORI_EVENT_SCHEDULES_CN_TABLE } from "@/lib/supabase-table-names";
import { unstable_cache } from "next/cache";

const EVENT_API_POINTER_TTL_MS = 60_000;

export type BandoriEventApiRecordMap = BandoriSnapshotRecordMap;

const readEventApiPointer = createBandoriSnapshotPointerCache({
  pointerKey: EVENT_API_POINTER_KEY,
  pointerTtlMs: EVENT_API_POINTER_TTL_MS,
  pointerReadLabel: "Bandori events API pointer",
  parse: parseEventApiPointer,
});

const readEventApiRecordMap = createBandoriSnapshotRecordMapCache({
  maxEntries: 2,
  maxCompressedBytes: MAX_EVENT_API_COMPRESSED_BYTES,
  maxDecompressedBytes: MAX_EVENT_API_DECOMPRESSED_BYTES,
  maxRecords: MAX_EVENT_API_RECORDS,
  datasetLabel: "Bandori events API dataset",
});

type ScheduleRow = {
  event_id: number;
  predicted_start: string | null;
  predicted_end: string | null;
};

const readBandoriCnScheduleSources = unstable_cache(
  async (): Promise<BandoriCnScheduleSource[]> => {
    if (
      !(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
      || !process.env.SUPABASE_SECRET_KEY
    ) {
      return [];
    }

    const serviceClient = createServerSupabaseClient();
    const { data, error } = await serviceClient
      .from(BANDORI_EVENT_SCHEDULES_CN_TABLE)
      .select("event_id,predicted_start,predicted_end")
      .order("event_id", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }

    return ((data ?? []) as unknown as ScheduleRow[]).map((row) => ({
      eventId: row.event_id,
      predictedStart: row.predicted_start,
      predictedEnd: row.predicted_end,
    }));
  },
  ["bandori-master-events-cn-schedule-overlay"],
  {
    revalidate: FAST_MUTABLE_HTTP_CACHE_POLICY.nextRevalidateSeconds,
    tags: [BANDORI_EVENTS_CACHE_TAG, BANDORI_SCHEDULE_CACHE_TAG],
  },
);

function getEventApiObjectSource() {
  return createBandoriSnapshotObjectSource({
    localStoreEnvironmentName: "BANDORI_EVENT_API_LOCAL_STORE_ROOT",
    privateR2ReadLabel: "Bandori private events R2 read",
    localObjectLabel: "Bandori local event API object",
  });
}

export async function readBandoriEventApiDataset(
  dataset: EventApiDatasetName,
): Promise<BandoriEventApiRecordMap> {
  const source = getEventApiObjectSource();
  const pointer = await readEventApiPointer(source);
  return readEventApiRecordMap(source, dataset, pointer.datasets[dataset]);
}

export async function readBandoriPublicEventApiDataset(
  dataset: EventApiDatasetName,
): Promise<BandoriEventApiRecordMap> {
  const records = await readBandoriEventApiDataset(dataset);
  return addBandoriCnSchedules(records, await readBandoriCnScheduleSources());
}

export async function readBandoriEventApiDetail(
  eventId: string,
): Promise<BandoriSnapshotRecord | null> {
  const details = await readBandoriPublicEventApiDataset("eventDetails");
  return Object.hasOwn(details, eventId) ? details[eventId] : null;
}
