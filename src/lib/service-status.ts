import { BANDORI_SERVER_CODES, type BandoriServerCode } from "./bandori-server";
import { parseApiSuccessData } from "./api-contracts";

export const SERVICE_STATUS_SERVICES = [
  "cutoffTracker", "userFetcher", "masterBuilder", "assetsBuilder",
] as const;

export type ServiceStatusEntry = {
  status: "operational" | "maintenance" | "error" | null;
  observedAt: string | null;
  reasonCode?: "update_required";
};

export type ServiceStatusData = {
  hhwxBandoriBackend: Record<
    typeof SERVICE_STATUS_SERVICES[number],
    Record<BandoriServerCode, ServiceStatusEntry>
  >;
};

export type ServiceStatusSnapshot = {
  data: ServiceStatusData;
  meta: { checkedAt: string | null };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

/** Reject an incomplete response instead of presenting missing services as healthy. */
export function parseServiceStatusResponse(payload: unknown): ServiceStatusSnapshot {
  const data = parseApiSuccessData<unknown>(payload);
  if (!isRecord(data) || !isRecord(data.hhwxBandoriBackend)
    || !isRecord(payload) || !isRecord(payload.meta) || !isTimestamp(payload.meta.checkedAt)) {
    throw new Error("Invalid service status response");
  }

  const backend = data.hhwxBandoriBackend;
  const services = SERVICE_STATUS_SERVICES.map((service) => {
    const entries = backend[service];
    if (!isRecord(entries)) throw new Error("Invalid service status response");
    return [service, Object.fromEntries(BANDORI_SERVER_CODES.map((server) => {
      const entry = entries[server];
      if (!isRecord(entry)
        || (entry.status !== null && entry.status !== "operational"
          && entry.status !== "maintenance" && entry.status !== "error")
        || !isTimestamp(entry.observedAt)) {
        throw new Error("Invalid service status response");
      }
      return [server, {
        status: entry.status,
        observedAt: entry.observedAt,
        ...(entry.status === "error" && entry.reasonCode === "update_required"
          ? { reasonCode: "update_required" as const } : {}),
      } satisfies ServiceStatusEntry];
    }))];
  });

  return {
    data: { hhwxBandoriBackend: Object.fromEntries(services) as ServiceStatusData["hhwxBandoriBackend"] },
    meta: { checkedAt: payload.meta.checkedAt },
  };
}
